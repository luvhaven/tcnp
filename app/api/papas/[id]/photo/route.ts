import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManagePapas } from '@/lib/utils'
import { UPLOAD_RULES, validateUploadFiles } from '@/lib/security/upload-validation'

const BUCKET = 'vip-photos'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/**
 * Upload (POST) or remove (DELETE) a Papa's profile photo. Runs with the
 * service role after checking the caller can manage Papas, so Papa managers
 * don't also need Victor's storage policy on the vip-photos bucket.
 */
async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('role, activation_status, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.activation_status !== 'active' || profile.is_active === false) {
    return { error: NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 }) }
  }
  if (!canManagePapas(profile.role as string)) {
    return { error: NextResponse.json({ error: 'You are not authorized to manage Papas' }, { status: 403 }) }
  }
  return { error: null }
}

async function loadPapa(adminClient: ReturnType<typeof createAdminClient>, papaId: string) {
  const { data } = await adminClient
    .from('papas')
    .select('id, profile_photo_url, is_deleted')
    .eq('id', papaId)
    .maybeSingle()
  return data && !data.is_deleted ? data : null
}

function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null
  const marker = `/object/public/${BUCKET}/`
  const index = url.indexOf(marker)
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: papaId } = await params
    const auth = await authorize()
    if (auth.error) return auth.error

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No photo was provided' }, { status: 400 })
    }
    const invalid = validateUploadFiles([file], UPLOAD_RULES.image)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const adminClient = createAdminClient()
    const papa = await loadPapa(adminClient, papaId)
    if (!papa) return NextResponse.json({ error: 'Papa not found' }, { status: 404 })

    const ext = EXTENSIONS[file.type.toLowerCase()] ?? 'jpg'
    const path = `papas/${papaId}-${Date.now()}.${ext}`
    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = adminClient.storage.from(BUCKET).getPublicUrl(path)
    const { error: updateError } = await adminClient
      .from('papas')
      .update({ profile_photo_url: publicUrl })
      .eq('id', papaId)
    if (updateError) {
      await adminClient.storage.from(BUCKET).remove([path])
      throw updateError
    }

    const previous = storagePathFromUrl(papa.profile_photo_url)
    if (previous) await adminClient.storage.from(BUCKET).remove([previous])

    return NextResponse.json({ profile_photo_url: publicUrl })
  } catch (error) {
    console.error('Papa photo upload failed:', error)
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: papaId } = await params
    const auth = await authorize()
    if (auth.error) return auth.error

    const adminClient = createAdminClient()
    const papa = await loadPapa(adminClient, papaId)
    if (!papa) return NextResponse.json({ error: 'Papa not found' }, { status: 404 })

    const { error } = await adminClient.from('papas').update({ profile_photo_url: null }).eq('id', papaId)
    if (error) throw error

    const previous = storagePathFromUrl(papa.profile_photo_url)
    if (previous) await adminClient.storage.from(BUCKET).remove([previous])

    return NextResponse.json({ profile_photo_url: null })
  } catch (error) {
    console.error('Papa photo removal failed:', error)
    return NextResponse.json({ error: 'Failed to remove photo' }, { status: 500 })
  }
}
