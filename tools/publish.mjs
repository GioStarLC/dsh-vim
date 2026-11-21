/**
 * Publish the dev checkout to the live one the daily app runs from.
 *
 * The `desktop` profile links G:\桌面\dsh-vim. That folder is the *live*
 * checkout: it is only ever fast-forwarded, never edited. Development happens
 * in the sibling worktree G:\桌面\dsh-vim-dev, so a half-written board can
 * never be what the app loads on its next start.
 *
 *   node tools/publish.mjs           verify, then fast-forward live to this branch
 *   node tools/publish.mjs --check   verify only, change nothing
 *
 * Override the live path with DSH_VIM_LIVE. The app reads lib/client.js when it
 * starts, so restarting it is what makes a publish visible.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const LIVE = path.resolve(process.env.DSH_VIM_LIVE || path.join(ROOT, '..', 'dsh-vim'))
const checkOnly = process.argv.includes('--check')

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function fail(message) {
  console.error('publish: ' + message)
  process.exit(1)
}

if (LIVE === ROOT) fail('this is the live checkout (' + LIVE + '); run publish from the dev worktree')
if (!git(LIVE, 'rev-parse', '--is-inside-work-tree')) fail('no checkout at ' + LIVE)

const branch = git(ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')
if (branch === 'main') fail('the dev checkout is on main; commit on dev or a feature branch')

const dirty = git(ROOT, 'status', '--porcelain=v1')
if (dirty) fail('the dev checkout has uncommitted work; commit it first:\n' + dirty)

const liveDirty = git(LIVE, 'status', '--porcelain=v1')
if (liveDirty) fail('the live checkout has local changes; clean it first:\n' + liveDirty)

const liveBranch = git(LIVE, 'rev-parse', '--abbrev-ref', 'HEAD')
if (liveBranch !== 'main') fail('the live checkout is on ' + liveBranch + ', not main')

console.log('publish: verifying ' + branch + ' …')
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'selftest.mjs')], { cwd: ROOT, stdio: 'inherit' })

const from = git(LIVE, 'rev-parse', '--short', 'HEAD')
const to = git(ROOT, 'rev-parse', '--short', 'HEAD')
if (checkOnly) {
  console.log('publish: check passed; live ' + from + ' would become ' + to + ' (' + branch + ')')
  process.exit(0)
}

git(LIVE, 'merge', '--ff-only', branch)
console.log('publish: live ' + from + ' → ' + git(LIVE, 'rev-parse', '--short', 'HEAD') + ' (' + branch + ')')
console.log('publish: restart the app to pick it up')
