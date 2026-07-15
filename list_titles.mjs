import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, key)

async function run() {
    const { data: titles } = await supabase.from('official_titles').select('*')
    console.log("All Titles in DB:")
    titles.forEach(t => console.log(`${t.code} - ${t.name} (Unit: ${t.unit})`))
}

run()
