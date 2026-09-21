const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('Tailwind config remains loadable in the Next.js ESM development process', () => {
  const source = fs.readFileSync('tailwind.config.ts', 'utf8')
  assert.match(source, /import tailwindcssAnimate from ['"]tailwindcss-animate['"]/)
  assert.doesNotMatch(source, /require\(['"]tailwindcss-animate['"]\)/)
})

test('sidebar uses the same current-user profile source as the header', () => {
  const source = fs.readFileSync('components/layout/sidebar.tsx', 'utf8')
  assert.match(source, /useCurrentUser\(\)/)
  assert.doesNotMatch(source, /\.select\(['"]role, oscar['"]\)/)
})

test('chat composer and actions have an accessible keyboard path', () => {
  const source = fs.readFileSync('components/chat/ChatSystem.tsx', 'utf8')
  assert.match(source, /aria-label="Message the team"/)
  assert.match(source, /aria-label=\{editingMessage \? 'Save edited message' : 'Send message'\}/)
  assert.match(source, /event\.key === 'Enter' && !event\.shiftKey/)
  assert.match(source, /textareaRef\.current\.setSelectionRange/)
  assert.doesNotMatch(source, /inputRef\.current/)
})

test('critical alert animation has a valid keyframe definition', () => {
  const source = fs.readFileSync('app/globals.css', 'utf8')
  assert.match(source, /@keyframes pulse-slow/)
  assert.doesNotMatch(source, /^pulse-slow tokens$/m)
  assert.doesNotMatch(source, /^user-select$/m)
})
