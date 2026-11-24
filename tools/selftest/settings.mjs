/**
 * Behaviour checks: the settings page controls.
 */
import assert from 'node:assert/strict'
import { step, bumpChecks, setMenuOnScreen, setMediaReduce, setNow, ROOT, BUNDLE, now, seq, timers, frames, FRAME_MS, clock, matches, matchesSimple, el, arrivedRows, transcript, sidebar, composer, button, body, root, editor, modal, modalEditor, blurCount, editorBlurs, synthKeys, replayKeydown, listeners, captureOf, record, unrecord, fire, shellFocus, domFocus, fireOn, clickThrough, flush, press, stored, fakeStorage, fakeDatabases, fakeRequest, fakeStoreApi, fakeIndexedDB, mediaReduce, fakeWindow, menu, menuOnScreen, fakeDocument, paneAt, cardNode, aimAt, resetHitTest, ReactStub, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, fakeRequire, feed, registry, newSessions, renames, statusFeed, currentBinding, MODEL, REASONING, projections, forks, opened, archives, makeCtx, captured, loadBundle, client, ctx, cleanup, keydown, keyup, wheel, movePointer, blurWindow, refocusWindow, tap, SHIPPED, expectedLabel, checks, peak, reset, finish, check, checkAsync } from './harness.mjs'
// --- targeting -------------------------------------------------------------

check('focus inside a non-editable pane wins over the centre heuristic', () => {
  fakeDocument.activeElement = sidebar
  tap('d')
  clock.advance(500)
  assert.equal(sidebar.scrollTop, 140, 'the focused pane scrolls')
  assert.equal(transcript.scrollTop, 0, 'the transcript stays put')
})

check('the pane under the pointer is the pane that scrolls', () => {
  movePointer(120, 300)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'hovering the sidebar scrolls the sidebar')
  assert.equal(transcript.scrollTop, 0, 'the conversation stays put')
})

check('the pane under the pointer outranks focus', () => {
  // Focus sits on a toolbar button inside the transcript, which is what the
  // focus rule would pick; the pointer decides instead.
  fakeDocument.activeElement = button
  movePointer(120, 300)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the pointed-at pane must win')
  assert.equal(transcript.scrollTop, 0, 'the focused pane must not move')
})

check('moving the pointer hands the next press to the other pane', () => {
  movePointer(120, 300)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the sidebar scrolls while it is pointed at')
  movePointer(700, 400)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the pane the pointer left must not move again')
  assert.equal(transcript.scrollTop, 140, 'the conversation takes the next press')
})

check('moving the pointer mid-hold hands the rest of the burst over', () => {
  movePointer(120, 300)
  keydown('d')
  clock.advance(200)
  assert.ok(sidebar.scrollTop > 0, 'the burst starts on the pane being pointed at')
  movePointer(700, 400)
  clock.advance(200)
  const settled = sidebar.scrollTop
  clock.advance(600)
  keyup()
  clock.advance(1500)
  assert.ok(transcript.scrollTop > 0, 'the rest of the burst goes where the pointer went')
  assert.equal(sidebar.scrollTop, settled, 'the pane the pointer left must stop where it was')
})

check('a pointer resting where nothing can scroll falls back to the conversation', () => {
  // The gap between panes, a pane header, a fan-out with nothing to scroll:
  // the pointer rule finds no container there, so the centre rule answers.
  aimAt(body)
  movePointer(20, 20)
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'the conversation is still what scrolls')
})

check('losing the window forgets the pointer, and the centre decides again', () => {
  movePointer(120, 120)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the point decides while it is fresh')
  blurWindow()
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'a point kept across a blur must not be reused')
  assert.equal(transcript.scrollTop, 140, 'the centre of the window decides again')
})

check('a focused control inside a pane scrolls that pane', () => {
  fakeDocument.activeElement = button
  tap('d')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 140)
})

check('a pane at the end of its range hands the step to its parent', () => {
  const outer = el({ className: 'outer', overflowY: 'auto', scrollHeight: 4000, clientHeight: 500 })
  const inner = el({
    className: 'inner',
    overflowY: 'auto',
    scrollHeight: 1500,
    clientHeight: 500,
    scrollTop: 1000,
    parent: outer,
  })
  aimAt(inner)
  tap('d')
  clock.advance(500)
  assert.equal(inner.scrollTop, 1000, 'the exhausted pane must not move')
  assert.equal(outer.scrollTop, 140, 'the parent pane takes the delta')
})

check('wheel input takes over and cancels our animation', () => {
  tap('d')
  clock.advance(32)
  const midway = transcript.scrollTop
  assert.ok(midway > 0 && midway < 140, 'sanity: caught mid-glide')
  wheel()
  clock.advance(1000)
  assert.equal(transcript.scrollTop, midway, 'our glide must stop where the user took over')
})

check('reduce-motion users get an instant jump', () => {
  setMediaReduce(true)
  tap('d')
  assert.equal(transcript.scrollTop, 140, 'no animation when the OS asks for less motion')
})

check('a container styled scroll-behavior: smooth does not fight the engine', () => {
  transcript.__scrollBehavior = 'smooth'
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140)
  assert.equal(transcript.style.scrollBehavior, '', 'the inline override must be restored')
  transcript.__scrollBehavior = 'auto'
})


