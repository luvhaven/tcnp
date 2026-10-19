// Builds exports/oscar-rosters-<date>.xlsx from the live database: one worksheet
// per Oscar listing every signed-up officer (name, email, position, profile %).
// Run: node scripts/export-oscar-rosters.cjs
// Output holds personal data — exports/ is git-ignored; share it deliberately.
require('@next/env').loadEnvConfig(process.cwd())
const { createClient } = require('@supabase/supabase-js')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Supabase configuration missing')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

// Mirrors PROFILE_FIELD_SPECS in lib/profile-completion.ts — keep in sync.
const FIELDS = [
  ['photo_url', 'Headshot', 3, true], ['full_name', 'Full name', 2, true], ['phone', 'Phone', 2, true],
  ['oscar', 'Oscar unit', 2, true], ['team', 'Team', 2, true], ['date_of_birth', 'Birthday', 1, false],
  ['gender', 'Gender', 1, false], ['city', 'City', 1, false], ['address', 'Address', 1, false], ['bio', 'Bio', 1, false],
]
const has = v => (typeof v === 'string' ? v.trim().length > 0 : v != null)
function completion(u) {
  const total = FIELDS.reduce((s, f) => s + f[2], 0)
  const filled = FIELDS.filter(f => has(u[f[0]])).reduce((s, f) => s + f[2], 0)
  return { pct: filled / total, missingRequired: FIELDS.filter(f => f[3] && !has(u[f[0]])).map(f => f[1]) }
}

const UNITS = ['Alpha Oscar', 'Tango Oscar', 'Victor Oscar', 'November (Nest)', 'November (Den)', 'Sierra Oscar',
  'Compliance Oscar', 'Welfare Oscar', 'Hospitality Oscar', 'Training Oscar', 'Command']
const UNASSIGNED = 'No Oscar set'

// Unit implied by a role key (head_* roles included).
function unitFromRole(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('alpha')) return 'Alpha Oscar'
  if (r.includes('tango')) return 'Tango Oscar'
  if (r.includes('victor')) return 'Victor Oscar'
  if (r.includes('nest')) return 'November (Nest)'
  if (r.includes('den')) return 'November (Den)'
  if (r.includes('serial') || r.includes('sierra')) return 'Sierra Oscar'
  if (r.includes('compliance')) return 'Compliance Oscar'
  if (r.includes('welfare')) return 'Welfare Oscar'
  if (r.includes('hospitality')) return 'Hospitality Oscar'
  if (r.includes('training')) return 'Training Oscar'
  if (['admin', 'super_admin', 'dev_admin', 'captain', 'vice_captain', 'command', 'head_of_command',
    'head_of_operations', 'hod', 'hop'].includes(r)) return 'Command'
  return null
}
// Unit named by the profile's oscar string (incl. legacy "OSCAR-XX-…" codes). Echo is retired → null.
function unitFromOscar(oscar) {
  const o = (oscar || '').toLowerCase()
  if (!o || o.includes('echo')) return null
  if (o.includes('den') || o.includes('theatre')) return 'November (Den)'
  if (o.includes('nest')) return 'November (Nest)'
  if (o.includes('hospitality')) return 'Hospitality Oscar'
  if (o.includes('training')) return 'Training Oscar'
  if (o.includes('command') || o.includes('captain') || o.includes('admin')) return 'Command'
  return unitFromRole(o.replace(/^oscar-[a-z]+-/, ''))
}
function placement(u) {
  const role = (u.role || '').toLowerCase()
  const isHead = role.startsWith('head_') || /head/i.test(u.oscar || '')
  // A head role is authoritative for which unit they lead; otherwise the profile's Oscar wins.
  const unit = (role.startsWith('head_') && unitFromRole(role)) || unitFromOscar(u.oscar) || unitFromRole(role) || UNASSIGNED
  const position = isHead ? 'Head' : ({ captain: 'Captain', vice_captain: 'Vice Captain', super_admin: 'Super Admin', admin: 'Admin' }[role] || 'Member')
  const otherOscar = unitFromOscar(u.oscar)
  const note = otherOscar && otherOscar !== unit ? `Profile Oscar says "${u.oscar}"` : (/echo/i.test(u.oscar || '') ? 'Was Echo Oscar (retired)' : '')
  return { unit, position, note }
}

// ---- minimal xlsx writer (inline strings, stored zip) ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const col = i => { let s = ''; i++; while (i) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26) } return s }
function cell(ref, v, style = 0) {
  if (v == null || v === '') return style ? `<c r="${ref}" s="${style}"/>` : ''
  if (typeof v === 'number') return `<c r="${ref}" s="${style}"><v>${v}</v></c>`
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}
function sheetXml(rows, widths) {
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const [v, s] = Array.isArray(c) ? c : [c, 0]
    return cell(col(ci) + (ri + 1), v, s)
  }).join('')}</row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`
}
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF666666"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf fontId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="2" applyFont="1"/><xf fontId="3" applyFont="1"/><xf fontId="0" numFmtId="9" applyNumberFormat="1"/></cellXfs></styleSheet>`
const H = 1, TITLE = 2, NOTE = 3, PCT = 4

function zip(files) {
  const locals = [], centrals = []; let offset = 0
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8'), n = Buffer.from(name), crc = zlib.crc32(data)
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26)
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42)
    locals.push(lh, n, data); centrals.push(ch, n); offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

;(async () => {
  const { data, error } = await admin.from('users')
    .select('full_name,email,phone,role,oscar,team,photo_url,date_of_birth,gender,address,city,bio,is_active,activation_status,created_at')
    .order('full_name').limit(5000)
  if (error) throw error

  const groups = Object.fromEntries([...UNITS, UNASSIGNED].map(u => [u, []]))
  for (const u of data) { const p = placement(u); groups[p.unit].push({ ...u, ...p, ...completion(u) }) }
  const rank = { Head: 0, Captain: 1, 'Vice Captain': 2, 'Super Admin': 3, Admin: 4, Member: 5 }
  for (const g of Object.values(groups)) g.sort((a, b) => rank[a.position] - rank[b.position] || (a.full_name || '').localeCompare(b.full_name || ''))

  const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })
  const header = ['#', 'Full name', 'Email', 'Position', 'Team', 'Profile complete', 'Missing required fields', 'Account status', 'Signed up', 'Note']
  const sheets = []
  const summary = [[['Oscar rosters — summary', TITLE]], [[`Live data pulled ${stamp} (Lagos). Re-run scripts/export-oscar-rosters.cjs to refresh.`, NOTE]],
    ['Oscar', 'Signed up', 'Head(s)', 'Avg profile complete', 'Profiles 100%'].map(h => [h, H])]
  for (const unit of [...UNITS, UNASSIGNED]) {
    const g = groups[unit]
    if (unit === UNASSIGNED && !g.length) continue
    const heads = g.filter(x => x.position === 'Head').map(x => x.full_name).join(', ')
    const rows = [[[`${unit} — ${g.length} signed up`, TITLE]],
      [[heads ? `Head: ${heads}` : 'No head signed up yet', NOTE]], header.map(h => [h, H])]
    g.forEach((x, i) => rows.push([i + 1, x.full_name || '', x.email || '', x.position, x.team || '', [x.pct, PCT],
      x.missingRequired.join(', ') || '—', x.activation_status === 'deactivated' || x.is_active === false ? 'Deactivated' : 'Active',
      (x.created_at || '').slice(0, 10), x.note]))
    if (!g.length) rows.push([[unit === 'Training Oscar' ? 'No one has signed up under Training yet — it is not yet an option on the signup form.' : 'No one has signed up under this Oscar yet.', NOTE]])
    sheets.push([unit.replace(/[\\/?*[\]:]/g, ''), sheetXml(rows, [5, 28, 34, 13, 12, 15, 30, 14, 12, 34])])
    const avg = g.length ? g.reduce((s, x) => s + x.pct, 0) / g.length : null
    summary.push([unit, g.length, heads || '—', avg == null ? '—' : [avg, PCT], g.filter(x => x.pct === 1).length])
  }
  summary.push(['Total', data.length])
  sheets.unshift(['Summary', sheetXml(summary, [22, 11, 34, 20, 14])])

  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([n], i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map(([, xml], i) => [`xl/worksheets/sheet${i + 1}.xml`, xml]),
  ]
  const outDir = path.join(process.cwd(), 'exports')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, `oscar-rosters-${new Date().toISOString().slice(0, 10)}.xlsx`)
  fs.writeFileSync(out, zip(files))
  console.log(`Wrote ${out}`)
  for (const unit of [...UNITS, UNASSIGNED]) if (groups[unit].length || unit !== UNASSIGNED) console.log(`  ${unit.padEnd(18)} ${groups[unit].length}`)
})().catch(e => { console.error(e); process.exit(1) })
