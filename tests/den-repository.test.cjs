const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/den-repository.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require, URL })
const {
  DEN_MAX_FILE_BYTES, fileRejection, formatBytes, kindForMime, storagePathFor,
  parseTags, normalizeLink, toPrefixQuery, reportGaps,
} = mod.exports
// Values built inside the vm context carry that context's prototypes.
const deepEq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

const migration = fs.readFileSync('supabase/migrations/20261116100000_den_repository_and_reports.sql', 'utf8')

test('files over the limit or of an unknown type are refused with a reason', () => {
  assert.equal(fileRejection({ name: 'sop.pdf', type: 'application/pdf', size: 1000 }), null)
  assert.match(fileRejection({ name: 'big.mp4', type: 'video/mp4', size: DEN_MAX_FILE_BYTES + 1 }), /limit is 50 MB/)
  assert.match(fileRejection({ name: 'run.exe', type: 'application/x-msdownload', size: 10 }), /not a file type/)
  assert.match(fileRejection({ name: 'x.svg', type: 'image/svg+xml', size: 10 }), /not a file type/)
  assert.match(fileRejection({ name: 'sop.pdf', type: 'application/pdf', size: 10 }, { mediaOnly: true }), /not a photo or a video/)
  assert.equal(fileRejection({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, { mediaOnly: true }), null)
})

test('the app accepts exactly the types the bucket accepts', () => {
  const bucketTypes = [...migration.match(/ARRAY\[([\s\S]*?)\]\s*\)\s*ON CONFLICT/)[1].matchAll(/'([^']+)'/g)].map(match => match[1])
  assert.ok(bucketTypes.length > 10)
  for (const type of bucketTypes) assert.equal(fileRejection({ name: 'f', type, size: 1 }), null, `${type} allowed by the bucket but refused by the app`)
  assert.match(migration, /'den-repository', 'den-repository', false, 52428800/)
  assert.equal(DEN_MAX_FILE_BYTES, 52428800)
})

test('storage paths are safe, unique and in a folder the rules recognise', () => {
  assert.equal(storagePathFor('library', 'Den Set-Up Guide (v2).PDF', 'id1'), 'library/id1-den-set-up-guide-v2.pdf')
  assert.equal(storagePathFor({ reportId: 'r9' }, '../../etc/passwd', 'id2'), 'reports/r9/id2-passwd')
  assert.equal(storagePathFor('library', 'C:\\Users\\me\\notes.final.docx', 'id5'), 'library/id5-notes-final.docx')
  assert.equal(storagePathFor('library', '   .jpg', 'id3'), 'library/id3-file.jpg')
  assert.match(storagePathFor('library', 'ọrọ̀ àṣà.png', 'id4'), /^library\/id4-[a-z0-9-]+\.png$/)
})

test('kinds and sizes read naturally', () => {
  assert.equal(kindForMime('image/png'), 'image')
  assert.equal(kindForMime('video/mp4'), 'video')
  assert.equal(kindForMime('application/pdf'), 'document')
  assert.equal(kindForMime(null), 'document')
  assert.equal(formatBytes(0), '0 KB')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB')
  assert.equal(formatBytes(48 * 1024 * 1024), '48 MB')
})

test('tags are cleaned and capped', () => {
  deepEq(parseTags('Set-up, #Catering,  catering ,WOFBEC\n'), ['set-up', 'catering', 'wofbec'])
  assert.equal(parseTags(Array.from({ length: 20 }, (_, index) => `t${index}`).join(',')).length, 10)
  deepEq(parseTags(' , '), [])
})

test('only https links are kept', () => {
  assert.equal(normalizeLink('drive.google.com/file/abc'), 'https://drive.google.com/file/abc')
  assert.equal(normalizeLink('https://example.org/a'), 'https://example.org/a')
  assert.equal(normalizeLink('http://example.org'), null)
  assert.equal(normalizeLink('javascript:alert(1)'), null)
  assert.equal(normalizeLink('   '), null)
  assert.match(migration, /external_url ~\* '\^https:\/\/'/)
})

test('search text becomes a prefix query and can never carry search operators', () => {
  assert.equal(toPrefixQuery('cater set'), 'cater:* & set:*')
  assert.equal(toPrefixQuery("  Minister's   WATER "), 'minister:* & s:* & water:*')
  assert.equal(toPrefixQuery('a | b & !c:* (d)'), 'a:* & b:* & c:* & d:*')
  assert.equal(toPrefixQuery(' !!! '), '')
  assert.equal(toPrefixQuery('one two three four five six seven eight nine ten').split(' & ').length, 8)
})

test('a post-operation report needs recommendations and lessons; a field report only a summary', () => {
  deepEq(reportGaps({ title: 'T', summary: 'S' }, 'field'), [])
  deepEq(reportGaps({ title: 'T', summary: 'S' }, 'post_operation'), ['Recommendations', 'Lessons learned'])
  deepEq(reportGaps({ title: ' ', summary: '' }, 'field'), ['Title', 'Summary'])
  deepEq(reportGaps({ title: 'T', summary: 'S', recommendations: 'R', lessons_learned: 'L' }, 'post_operation'), [])
})

test('a submitted report is filed in the repository by the database, with no approval step', () => {
  const filing = migration.match(/FUNCTION public\.file_den_report_in_repository[\s\S]*?\$\$;/)[0]
  assert.match(filing, /INSERT INTO public\.den_repository_items/)
  assert.match(filing, /ON CONFLICT \(source_report_id\)/)
  assert.match(filing, /Lessons learned: /)
  assert.match(migration, /CREATE TRIGGER den_reports_file_in_repository\s+AFTER INSERT OR UPDATE ON public\.den_reports/)
  assert.doesNotMatch(migration, /approved|approval_status/i)
})

test('only the Team Lead removes repository files; officers add report media only', () => {
  const insert = migration.match(/CREATE POLICY den_repository_files_insert[\s\S]*?;/)[0]
  assert.match(insert, /= 'library' AND public\.can_manage_unit\('november_den'\)/)
  assert.match(insert, /= 'reports' AND \(public\.is_platform_admin\(\) OR public\.is_unit_member\('november_den'\)\)/)
  const remove = migration.match(/CREATE POLICY den_repository_files_delete[\s\S]*?;/)[0]
  assert.match(remove, /can_manage_unit\('november_den'\)/)
  assert.match(remove, /= 'reports' AND owner_id = auth\.uid\(\)::text/)
  // Every storage rule is confined to the Den bucket, so no other bucket's access changes.
  for (const [policy] of migration.matchAll(/CREATE POLICY \w+ ON storage\.objects[\s\S]*?;/g)) assert.match(policy, /bucket_id = 'den-repository'/)
  assert.match(migration, /CREATE POLICY den_repository_items_manage[\s\S]*?can_manage_unit\('november_den'\)/)
})

test('report media must sit in its own report folder, and drafts stay private', () => {
  assert.match(migration, /CREATE POLICY den_report_media_insert[\s\S]*?storage_path LIKE 'reports\/' \|\| report_id::text \|\| '\/%'/)
  const select = migration.match(/CREATE POLICY den_reports_select[\s\S]*?;/)[0]
  assert.match(select, /status = 'submitted' AND \(public\.is_admin\(\) OR public\.is_unit_member\('november_den'\)\)/)
  assert.match(select, /created_by = auth\.uid\(\)/)
  for (const table of ['den_repository_items', 'den_reports', 'den_report_media']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }
  assert.doesNotMatch(migration, /UPDATE public\.users|ALTER TYPE/i)
})
