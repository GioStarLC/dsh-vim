#!/usr/bin/env node
/**
 * Write MAP.md: every top-level function in lib/client.js with its line number
 * and the first line of the comment above it. The index is one grep wide, which
 * is the point: a session looking for one of ~800 functions should not have to
 * read 20k lines to find it.
 *
 *   npm run map        # regenerate after moving code
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'lib/client.js'
const OUT = 'MAP.md'
const lines = readFileSync(SRC, 'utf8').split('\n')

const fnRe = /^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/
const arrowRe = /^(\s*)const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/

/** The comment right above a declaration, first meaningful line of it. */
function noteFor(i) {
  let end = i - 1
  while (end >= 0 && lines[end].trim() === '') end--
  if (end < 0) return ''
  // Whole comment block, not just its last line: the first line is the summary.
  let start = end
  while (start > 0 && /^\s*(\/\/|\*|\/\*)/.test(lines[start - 1])) start--
  for (const line of lines.slice(start, end + 1)) {
    const body = line.trim().replace(/^\/\*\*?/, '').replace(/^\/\//, '').replace(/^\*/, '').replace(/\*\/$/, '').trim()
    if (body) return body
  }
  return ''
}

const picked = []
for (let i = 0; i < lines.length; i++) {
  const m = fnRe.exec(lines[i]) || arrowRe.exec(lines[i])
  if (!m) continue
  if (m[1].length > 4) continue // deeper helpers belong to their parent
  const note = noteFor(i).replace(/\|/g, " ")
  picked.push({ line: i + 1, name: m[2], note })
}

const out = []
out.push('# MAP - lib/client.js')
out.push('')
out.push('由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。')
out.push('')
out.push('lib/client.js：' + lines.length + ' 行，' + picked.length + ' 个顶层函数。')
out.push('')
out.push('| 行 | 函数 | 上方注释 |')
out.push('|---:|---|---|')
for (const f of picked.sort((a, b) => a.line - b.line)) out.push('| ' + f.line + ' | ' + f.name + ' | ' + f.note + ' |')
out.push('')
writeFileSync(OUT, out.join('\n'))
console.log(OUT + ': ' + picked.length + ' functions from ' + lines.length + ' lines')