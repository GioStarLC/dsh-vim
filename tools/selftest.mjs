/**
 * dsh-vim behaviour suite. The harness is in tools/selftest/harness.mjs;
 * each suite runs its checks as it is imported, so the import order below is
 * the run order.
 *
 * Run: node tools/selftest.mjs
 */
import { checks, peak, runChecks } from './selftest/harness.mjs'
import './selftest/scroll.mjs'
import './selftest/settings.mjs'
import './selftest/models.mjs'
import './selftest/model-picker.mjs'
import './selftest/task-window.mjs'
import './selftest/board.mjs'
import './selftest/board-press.mjs'
import './selftest/lifecycle.mjs'
import './selftest/history.mjs'
import './selftest/entry.mjs'

await runChecks()

console.log(`\nselftest: ${checks} checks passed`)
process.on('exit', () => {
  if (!peak.label) return
  console.log(`peak heap: ${Math.round(peak.heap / 1048576)} MB, left by "${peak.label}"`)
})
