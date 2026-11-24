import assert from 'node:assert/strict'
import { composer, body, editor, shellFocus, flush, press, fakeWindow, fakeDocument, MODEL, REASONING, keydown, tap, expectedLabel, check, checkAsync, step } from './harness.mjs'
import { seed, renameBox, toastText, toastHost, seedVisible } from './helpers.mjs'

checkAsync('the reasoning key steps the level and leaves the model alone', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  assert.equal(tap('q'), true, 'q belongs to the plugin on this page')
  await flush()
  assert.deepEqual(
    MODEL.calls,
    [{ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }],
    'the next level, on the same provider and model'
  )
  assert.equal(
    toastText(),
    expectedLabel('effort') + ' 中  2/3',
    'the notice names the level and where it sits, so a press can be read back'
  )
})

checkAsync('the reasoning key walks the levels and wraps around', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  for (let i = 0; i < 4; i++) {
    tap('q')
    await flush()
  }
  assert.deepEqual(
    MODEL.calls.map((call) => call.reasoningEffort),
    ['medium', 'high', 'low', 'medium'],
    'every press steps once and the end wraps to the start'
  )
  for (const call of MODEL.calls) {
    assert.deepEqual(
      [call.provider, call.model],
      ['deepseek', 'deepseek-reasoner'],
      'the model is never part of the step'
    )
  }
})

checkAsync('a press while a submit is in flight still steps forward', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  MODEL.hold = true
  tap('q')
  await flush()
  tap('q')
  await flush()
  assert.deepEqual(
    MODEL.calls.map((call) => call.reasoningEffort),
    ['medium', 'high'],
    'the pending selection answers the next press, so holding the key walks the levels'
  )
  MODEL.settle()
  await flush()
  MODEL.settle()
  await flush()
})

checkAsync('the level in effect falls back to the model default', async () => {
  seedVisible()
  // No explicit effort: the model's own default is what is in effect, exactly as
  // the composer's Effort row reads it — so the first step is the one after it.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner' }, REASONING)
  tap('q')
  await flush()
  assert.deepEqual(MODEL.calls.map((call) => call.reasoningEffort), ['high'], 'medium is the default, high is next')
})

checkAsync('a model with no levels says so instead of guessing', async () => {
  seedVisible()
  // No Effort row for this model: the adapter publishes no reasoning metadata,
  // which is what the directory reports as `undefined`.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('q')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'nothing may be submitted without levels to submit')
  assert.equal(toastText(), expectedLabel('effortNone'), 'and the press is answered all the same')
})

checkAsync('a rejected selection keeps its reason on screen', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  MODEL.results.push({ ok: false, error: { code: 'busy', message: 'another writer holds this session' } })
  tap('q')
  await flush()
  assert.equal(MODEL.calls.length, 1, 'the attempt was made')
  assert.equal(
    toastText(),
    expectedLabel('effortFailed') + ': another writer holds this session',
    'the host reason is on screen, not swallowed'
  )
})

checkAsync('without a conversation on screen there is nothing to step', async () => {
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  seed([])
  tap('q')
  await flush()
  assert.deepEqual(MODEL.calls, [])
  assert.equal(toastText(), expectedLabel('noSession'))
})

checkAsync('the reasoning key is a plain letter inside a field', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  assert.equal(keydown('q', { target: editor }), false, 'the composer keeps its own letters')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'so nothing may be submitted from in there')
  // The name box in the task window is the same story.
  tap('f')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the name box must be open')
  assert.equal(keydown('q', { target: box }), false, 'the name box keeps every letter too')
  await flush()
  assert.deepEqual(MODEL.calls, [])
  tap('Escape')
  tap('Escape')
})

checkAsync('auto-repeat does not turn one press into a stream of selections', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  assert.equal(keydown('q', { repeat: true }), true, 'the held key is still ours, not the page scroll')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'but it is not a second press')
})

checkAsync('the notice floats just above the message box', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  // The box the reader is looking at, sitting 260px down a 900px window.
  editor.__rect = { top: 260, left: 300, width: 600, height: 120, right: 900, bottom: 380 }
  // The plugin remembers the box from a focus; the shell hands the caret back
  // and the plugin lets it go, which is exactly the state it runs in.
  shellFocus(editor)
  fakeDocument.activeElement = body
  tap('q')
  await flush()
  const host = toastHost()
  assert.ok(host, 'the notice must be on the page')
  assert.equal(host.style.position, 'fixed', 'the notice is placed against the window, not the flow')
  assert.equal(host.style.pointerEvents, 'none', 'and it must never swallow a click meant for the box')
  assert.equal(
    host.style.bottom,
    'calc(100vh - 260px + 10px)',
    'the host is lifted to the top edge of the message box, plus a small gap'
  )
  // A composer that moves takes the notice with it: the box is measured per
  // notice, because it grows and shrinks as the draft does.
  editor.__rect = { top: 420, left: 300, width: 600, height: 160, right: 900, bottom: 580 }
  tap('q')
  await flush()
  assert.equal(host.style.bottom, 'calc(100vh - 420px + 10px)', 'a press re-measures the box')
})

checkAsync('with no box to sit above, the notice falls back to the top edge', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  // A host with no rich-text editor at all: the box the plugin had seen goes
  // away with the page it belonged to, and there is no landmark left to float
  // against — but the press still has to be readable.
  editor.isConnected = false
  editor.isContentEditable = false
  fakeDocument.querySelector = () => null
  tap('q')
  await flush()
  const host = toastHost()
  assert.ok(host, 'the notice must still be on the page')
  assert.equal(host.style.bottom, 'calc(100vh - 12px)', 'so it keeps a small margin from the top of the window')
})

check('the reasoning key can be rebound, and cannot collide with the page keys', () => {  const rejected = fakeWindow.__dshVim.update({ effortKey: 'd' })
  assert.equal(rejected.error, 'conflict', 'a scroll key must not double as the reasoning key')
  assert.equal(rejected.value, undefined)
  assert.equal(fakeWindow.__dshVim.settings().effortKey, 'q')

  const applied = fakeWindow.__dshVim.update({ effortKey: 'z' })
  assert.equal(applied.effortKey, 'z', 'a free key is accepted')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'd', 'and the other seats are untouched')
})
