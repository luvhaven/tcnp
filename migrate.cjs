/**
 * Apply linked Supabase migrations through the official CLI.
 *
 * Authenticate first with `npx supabase login`, or provide
 * SUPABASE_ACCESS_TOKEN in the process environment. Never store access tokens
 * or database passwords in this repository.
 *
 * Usage:
 *   node migrate.cjs
 *   node migrate.cjs --dry-run
 */
const { spawnSync } = require('node:child_process')

const supportedArgs = new Set(['--dry-run'])
const extraArgs = process.argv.slice(2)

for (const arg of extraArgs) {
  if (!supportedArgs.has(arg)) {
    console.error(`Unsupported argument: ${arg}`)
    process.exit(1)
  }
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(
  npx,
  ['--yes', 'supabase@latest', 'db', 'push', '--linked', '--include-all', ...extraArgs],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
