import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log('Fetching official titles...')
    const { data: titles, error: fetchError } = await supabase
        .from('official_titles')
        .select('*')

    if (fetchError) {
        console.error('Failed to fetch titles:', fetchError)
        process.exit(1)
    }

    console.log('Got titles:', titles.map(t => `${t.code} (${t.unit}): ${t.max_positions}`).join(', '))

    console.log('\nUpdating command and oscar unit max_positions to 20...')
    const { data: updated, error: updateError } = await supabase
        .from('official_titles')
        .update({ max_positions: 20 })
        .in('unit', ['command', 'oscar', 'admin', 'leadership'])
        .select()

    if (updateError) {
        console.error('Failed to update titles:', updateError)
        process.exit(1)
    }

    console.log('Successfully updated:')
    console.log(updated.map(u => `${u.code}: ${u.max_positions}`))

    // Ensure ADMIN is present
    const hasAdmin = titles.some(t => t.code === 'ADMIN' || t.name.toLowerCase() === 'admin')
    if (!hasAdmin) {
        console.log('No ADMIN title exists. Inserting one...')
        const { error: insertError } = await supabase
            .from('official_titles')
            .insert({
                code: 'ADMIN',
                name: 'Administrator',
                unit: 'command', // Group under command so it shows in the UI dropdown automatically
                is_fixed: false,
                is_team_lead: false,
                max_positions: 20,
                description: 'System Administrator'
            })
        if (insertError) {
            console.error('Failed to insert ADMIN title:', insertError)
        } else {
            console.log('Successfully inserted ADMIN title')
        }
    } else {
        // Make sure ADMIN has max_positions = 20
        await supabase
            .from('official_titles')
            .update({ max_positions: 20 })
            .in('code', ['ADMIN'])
    }
}

run()
