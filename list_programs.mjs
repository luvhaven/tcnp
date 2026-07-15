import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, key)

async function run() {
    const { data: programs } = await supabase.from('programs').select('*')
    console.log("All Programs in DB:")
    programs.forEach(p => console.log(`${p.name} (Status: ${p.status})`))
}

run()
