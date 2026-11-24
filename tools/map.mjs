#!/usr/bin/env node
/**
 * Write MAP.md: every top-level function in `src/client/` with its file, line
 * number and the first line of the comment above it. The index is one grep
 * wide, which is the point: a session looking for one of hundreds of functions
 * should not have to read twenty thousand lines to find it.
 *
 *   npm run map        # regenerate after moving code
 *
 * "Top level" means indent <= 4: the source still carries the factory body's
 * base indent, and deeper helpers belong to their parent.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = 'src/client'
const OUT = 'MAP.md'

/** Every `.js` under `src/client/`, in a stable order. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.name.endsWith('.js')) out.push(path)
  }
  return out
}

const fnRe = /^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/
const arrowRe = /^(\s*)const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/

/** The comment right above a declaration, first meaningful line of it. */
function noteFor(lines, i) {
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
const files = walk(SRC)
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = fnRe.exec(lines[i]) || arrowRe.exec(lines[i])
    if (!m) continue
    if (m[1].length > 4) continue
    picked.push({
      file: relative('.', file).split('\\').join('/'),
      line: i + 1,
      name: m[2],
      note: noteFor(lines, i).replace(/\|/g, ' '),
    })
  }
}

const out = []
out.push('# MAP - src/client')
out.push('')
out.push('由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到文件与行号，再读那一段。')
out.push('')
out.push('源码：`src/client/`，' + files.length + ' 个文件，' + picked.length + ' 个顶层函数。')
out.push('')
out.push('| 文件 | 行 | 函数 | 上方注释 |')
out.push('|---|---:|---|---|')
for (const f of picked) out.push('| ' + f.file + ' | ' + f.line + ' | ' + f.name + ' | ' + f.note + ' |')
out.push('')
writeFileSync(OUT, out.join('\n'))
console.log(OUT + ': ' + picked.length + ' functions from ' + files.length + ' files')
