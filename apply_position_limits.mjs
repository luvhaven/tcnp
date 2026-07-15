import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, key)

async function run() {
    const { data: titles } = await supabase.from('official_titles').select('*')

    if (!titles) {
        console.error("Failed to load titles")
        return
    }

    console.log("Applying precise max_position constraints based on TCNP Hierarchy Rules...")

    for (const title of titles) {
        const { code } = title
        let max = 20 // default "as many as assigned" (using 20 to avoid DB arbitrary integer limits visually filling up)

        if (code.endsWith('_LEAD')) {
            max = 1
        } else if (code.startsWith('HEAD_')) {
            max = 1
        } else if (code === 'CAPTAIN') {
            max = 1
        } else if (code === 'VICE_CAPTAIN') {
            max = 2
        } else if (code === 'PROF' || code === 'DUCHESS') {
            max = 1
        }

        // Explicit overrides
        if (code === 'ADMIN' || code === 'DELTA_OSCAR') {
            max = 20
        }

        if (title.max_positions !== max) {
            console.log(`Updating ${code} from ${title.max_positions} to ${max}...`)
            await supabase.from('official_titles').update({ max_positions: max }).eq('id', title.id)
        } else {
            console.log(`Skipping ${code} (Already ${max})`)
        }
    }

    console.log("Done checking and updating constraints.")
}

run()
