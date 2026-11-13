import { strToU8, zipSync } from 'fflate'
import { computeProfileCompletion, type ProfileFields } from '@/lib/profile-completion'
import { oscarToRole, SIGNUP_OSCAR_OPTIONS } from '@/lib/utils'

export type ReportOfficer = ProfileFields & {
  email: string | null
  role: string | null
  activation_status: string | null
  is_active: boolean | null
  created_at: string | null
}

const UNIT_BY_ROLE: Record<string, string> = {
  alpha_oscar: 'Alpha Oscar',
  compliance_oscar: 'Compliance Oscar',
  noscar_den: 'November (Den)',
  noscar_nest: 'November (Nest)',
  hospitality_oscar: 'November (Nest)',
  serial_oscar: 'Serial Oscar',
  tango_oscar: 'Tango Oscar',
  training_oscar: 'Training Oscar',
  victor_oscar: 'Victor Oscar',
  welfare_oscar: 'Welfare Oscar',
  command: 'Command',
  head_of_command: 'Command',
  head_of_operations: 'Command',
  hod: 'Command',
  hop: 'Command',
  captain: 'Command',
  vice_captain: 'Command',
  admin: 'Command',
  dev_admin: 'Command',
  super_admin: 'Command',
}

const UNASSIGNED = 'Unassigned'
const STATUS = ['Active', 'Pending approval', 'Deactivated', 'Other / unset'] as const
const DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' })
const TIMESTAMP = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })

export function officerReportDate(date: Date) {
  return DATE.format(date)
}

function unitForRole(role: string | null) {
  if (!role) return undefined
  const base = role.replace(/^head_(?!of_)/, '')
  return Object.hasOwn(UNIT_BY_ROLE, base) ? UNIT_BY_ROLE[base] : undefined
}

function placement(officer: ReportOfficer) {
  const roleUnit = unitForRole(officer.role)
  const raw = officer.oscar?.trim() ?? ''
  const legacySuffix = raw.replace(/^oscar-[a-z]+-/i, '').toLowerCase().replaceAll('-', '_')
  const profileRole = oscarToRole(raw) ?? oscarToRole(legacySuffix) ?? legacySuffix
  const profileUnit = unitForRole(profileRole)
  const unit = (officer.role?.startsWith('head_') && roleUnit) || profileUnit || roleUnit || UNASSIGNED
  const note = profileUnit && roleUnit && profileUnit !== roleUnit
    ? 'Profile lists ' + profileUnit + '. Role points to ' + roleUnit + '.'
    : raw && !profileUnit
      ? 'Legacy or unrecognized profile Oscar: ' + raw
      : unit === UNASSIGNED ? 'No Oscar on profile or role.' : ''
  return { unit, note }
}

function statusFor(officer: ReportOfficer) {
  if (officer.activation_status === 'deactivated') return STATUS[2]
  if (officer.activation_status === 'pending') return STATUS[1]
  if (officer.is_active === false) return STATUS[2]
  if (officer.activation_status === 'active') return STATUS[0]
  return STATUS[3]
}

function joinDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  // Use the Lagos calendar date as a sortable Excel date serial.
  const parts = Object.fromEntries(DATE.formatToParts(date).map(({ type, value }) => [type, Number(value)]))
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000 + 25569
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

function escapeXml(value: string) {
  return Array.from(value, character => {
    const code = character.codePointAt(0)!
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff ? '' : character
  }).join('')
    .replace(/_x[\da-f]{4}_/gi, match => '_x005F_' + match.slice(1))
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const STYLE = { body: 0, title: 1, note: 2, header: 3, band: 4, date: 5, percent: 6, active: 7, review: 8, inactive: 9, total: 10, totalPercent: 11 }
type Cell = string | number | null
type Row = { cells: Cell[]; styles?: number[]; height?: number }

function makeStyles() {
  const fonts = [
    ['FF213548', 11, false], ['FF17324D', 20, true], ['FF52677A', 10, false], ['FFFFFFFF', 10, true],
    ['FF16624C', 11, true], ['FF805309', 11, false], ['FF6D3441', 11, true],
  ].map(([color, size, bold]) => '<font>' + (bold ? '<b/>' : '') + '<sz val="' + size + '"/><color rgb="' + color + '"/><name val="Calibri"/></font>')
  const fills = ['FF17324D', 'FFF0F6FA', 'FFE5F4ED', 'FFFFF1D7', 'FFF8E9ED', 'FFE1EDF6']
    .map(color => '<fill><patternFill patternType="solid"><fgColor rgb="' + color + '"/><bgColor indexed="64"/></patternFill></fill>')
  const formats = [
    [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 2, 0], [0, 3, 0], [0, 0, 164], [0, 0, 9],
    [4, 4, 0], [5, 5, 0], [6, 6, 0], [0, 7, 0], [0, 7, 9],
  ].map(([font, fill, number]) => '<xf fontId="' + font + '" fillId="' + fill + '" numFmtId="' + number + '" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>')
  return XML + '<styleSheet xmlns="' + NS + '"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/></numFmts>' +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + (fills.length + 2) +
    '"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + fills.join('') +
    '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' +
    formats.length + '">' + formats.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
}

function sheet(rows: Row[], widths: number[], headerRow: number, lastFilterRow: number, tabColor: string) {
  const column = (index: number) => String.fromCharCode(65 + index)
  const lastColumn = column(widths.length - 1)
  const data = rows.map(({ cells, styles, height }, index) => {
    const row = index + 1
    const body = cells.map((value, i) => {
      const ref = '<c r="' + column(i) + row + '" s="' + (styles?.[i] ?? STYLE.body) + '"'
      if (value === null) return ref + '/>'
      if (typeof value === 'number') return ref + '><v>' + value + '</v></c>'
      return ref + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>'
    }).join('')
    return '<row r="' + row + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') + '>' + body + '</row>'
  }).join('')
  const cols = widths.map((width, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>').join('')
  return XML + '<worksheet xmlns="' + NS + '" xmlns:r="' + REL + '"><sheetPr><tabColor rgb="' + tabColor + '"/></sheetPr>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="' + headerRow +
    '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="19"/><cols>' + cols + '</cols><sheetData>' + data + '</sheetData>' +
    '<autoFilter ref="A' + headerRow + ':' + lastColumn + lastFilterRow + '"/>' +
    '<mergeCells count="2"><mergeCell ref="A1:I1"/><mergeCell ref="A2:I2"/></mergeCells>' +
    '<drawing r:id="rIdLogo"/></worksheet>'
}

function logoDrawing() {
  const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
  const drawingMainNs = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  // The app's square logo sits in column J across the two header rows.
  return XML + '<xdr:wsDr xmlns:xdr="' + drawingNs + '" xmlns:a="' + drawingMainNs + '" xmlns:r="' + REL + '">' +
    '<xdr:oneCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from>' +
    '<xdr:ext cx="571500" cy="571500"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="TCNP Logo" descr="The Covenant Nation logo"/>' +
    '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>'
}

export function createOfficerStatusWorkbook(officers: ReportOfficer[], generatedAt: Date, logo: Uint8Array) {
  const groups = [...SIGNUP_OSCAR_OPTIONS, UNASSIGNED]
  const records = officers.map(officer => ({
    officer, ...placement(officer), status: statusFor(officer), completion: computeProfileCompletion(officer),
  })).sort((a, b) => (a.officer.full_name ?? '').localeCompare(b.officer.full_name ?? ''))
  const grouped = new Map(groups.map(group => [group, [] as typeof records]))
  for (const record of records) grouped.get(record.unit)?.push(record)

  function summarize(label: string, members: typeof records, total = false): Row {
    const cells = [label, members.length, ...STATUS.map(status => members.filter(member => member.status === status).length),
      members.length ? members.reduce((sum, member) => sum + member.completion.percent, 0) / members.length / 100 : null,
      members.filter(member => member.completion.percent === 100).length,
      members.filter(member => member.completion.isComplete).length,
      members.filter(member => member.note).length]
    const styles = cells.map(() => total ? STYLE.total : label === UNASSIGNED ? STYLE.review : STYLE.band)
    styles[6] = total ? STYLE.totalPercent : STYLE.percent
    return { cells, styles, height: 23 }
  }

  const stamp = TIMESTAMP.format(generatedAt) + ' WAT'
  const headers = (cells: string[]): Row => ({ cells, styles: cells.map(() => STYLE.header), height: 32 })
  const title = (label: string, subtitle: string): Row[] => [
    { cells: [label], styles: [STYLE.title], height: 36 },
    { cells: [subtitle], styles: [STYLE.note], height: 24 },
    { cells: [] },
  ]
  const overview = [
    ...title('TCNP | Protocol officer status report', stamp + '  •  Officer directory snapshot  •  Open an Oscar tab for individual records'),
    headers(['Oscar / group', 'Accounts', ...STATUS, 'Avg. profile', '100% profiles', 'Required fields complete', 'Placement review']),
    ...groups.map(group => summarize(group, grouped.get(group)!)),
    summarize('All officers', records, true),
  ]
  const sheets = [{
    name: 'Overview',
    content: sheet(overview, [24, 11, 10, 17, 14, 14, 15, 15, 22, 18], 4, 4 + groups.length, 'FF17324D'),
  }]
  for (const group of groups) {
    const members = grouped.get(group)!
    const rows = [
      ...title(group + ' | Officer roster', stamp + '  •  ' + members.length + ' registered'),
      headers(['Full name', 'Email address', 'Joined date', 'Profile completion', 'Account status', 'Role', 'Team', 'Missing required fields', 'Missing optional fields', 'Placement note']),
      ...members.map(({ officer, status, completion, note }, index): Row => {
        const cells = [officer.full_name ?? '', officer.email ?? '', joinDate(officer.created_at), completion.percent / 100, status,
          officer.role?.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) ?? '', officer.team ?? '',
          completion.missingRequired.map(field => field.label).join(', '),
          completion.missing.filter(field => !field.required).map(field => field.label).join(', '), note]
        const styles = cells.map(() => index % 2 ? STYLE.band : STYLE.body)
        styles[2] = STYLE.date
        styles[3] = STYLE.percent
        styles[4] = status === 'Active' ? STYLE.active : status === 'Deactivated' ? STYLE.inactive : STYLE.review
        if (cells[7]) styles[7] = STYLE.review
        if (note) styles[9] = STYLE.review
        return { cells, styles, height: 46 }
      }),
    ]
    if (!members.length) rows.push({ cells: ['No registered officers in this group.'], styles: [STYLE.note], height: 36 })
    sheets.push({ name: group, content: sheet(rows, [29, 40, 15, 16, 19, 23, 16, 35, 48, 49], 4, 4 + members.length, group === UNASSIGNED ? 'FFD6A34D' : 'FF3478A8') })
  }

  const files: Record<string, string> = {
    '[Content_Types].xml': XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/drawings/drawing' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>').join('') + '</Types>',
    '_rels/.rels': XML + '<Relationships xmlns="' + PKG + '"><Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': XML + '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '"><bookViews><workbookView/></bookViews><sheets>' +
      sheets.map(({ name }, i) => '<sheet name="' + escapeXml(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': XML + '<Relationships xmlns="' + PKG + '">' +
      sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rIdStyles" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': makeStyles(),
  }
  sheets.forEach(({ content }, i) => {
    const index = i + 1
    files['xl/worksheets/sheet' + index + '.xml'] = content
    files['xl/worksheets/_rels/sheet' + index + '.xml.rels'] = XML + '<Relationships xmlns="' + PKG +
      '"><Relationship Id="rIdLogo" Type="' + REL + '/drawing" Target="../drawings/drawing' + index + '.xml"/></Relationships>'
    files['xl/drawings/drawing' + index + '.xml'] = logoDrawing()
    files['xl/drawings/_rels/drawing' + index + '.xml.rels'] = XML + '<Relationships xmlns="' + PKG +
      '"><Relationship Id="rIdImage" Type="' + REL + '/image" Target="../media/tcnp-logo.png"/></Relationships>'
  })
  return zipSync({
    ...Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])),
    'xl/media/tcnp-logo.png': logo,
  })
}
