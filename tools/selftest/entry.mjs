/**
 * Behaviour checks: the entry anchor and the overview door.
 */
import assert from 'node:assert/strict'
import { step, bumpChecks, setMenuOnScreen, setMediaReduce, setNow, ROOT, BUNDLE, now, seq, timers, frames, FRAME_MS, clock, matches, matchesSimple, el, arrivedRows, transcript, sidebar, composer, button, body, root, editor, modal, modalEditor, blurCount, editorBlurs, synthKeys, replayKeydown, listeners, captureOf, record, unrecord, fire, shellFocus, domFocus, fireOn, clickThrough, flush, press, stored, fakeStorage, fakeDatabases, fakeRequest, fakeStoreApi, fakeIndexedDB, mediaReduce, fakeWindow, menu, menuOnScreen, fakeDocument, paneAt, cardNode, aimAt, resetHitTest, ReactStub, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, fakeRequire, feed, registry, newSessions, renames, statusFeed, currentBinding, MODEL, REASONING, projections, forks, opened, archives, makeCtx, captured, loadBundle, client, ctx, cleanup, keydown, keyup, wheel, movePointer, blurWindow, refocusWindow, tap, SHIPPED, expectedLabel, checks, peak, reset, finish, check, checkAsync } from './harness.mjs'
import { arriveInputRow, enterFromBoard, boardSeat } from './helpers.mjs'
// --- entry anchor: where an opened conversation starts reading ---------------



check('a conversation opened at its tail starts at the last thing the reader wrote', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  enterFromBoard('s1')
  clock.advance(80)
  // The prompt's top is 6000 in the content and the answer runs to 9000, so
  // the anchor is within the scrollport's range: 16px of air above the message.
  assert.equal(transcript.scrollTop, 5984, 'the last prompt sits at the top of the viewport')
})

check('a conversation the shell restored mid-answer keeps the position it saved', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', top: 380, height: 120, scrollTop: 1000 })
  enterFromBoard('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 1000, 'the reader\'s saved place outranks an arrival anchor')
})

check('a turn still in flight is read from its end, not anchored to its prompt', () => {
  statusFeed.put('s1', { running: true })
  arriveInputRow({ session: 's1', top: 380, height: 120 })
  enterFromBoard('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 4200, 'the live tail stays where the shell put it')
})

check('a prompt taller than the screen is anchored by its end, with its answer in reach', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  // A 1100px prompt at content y=3600, scrolled out of a viewport whose floor
  // is 8200: anchoring its top would leave the answer entirely off screen.
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -4500, height: 1100 })
  enterFromBoard('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 4636, 'the prompt\'s last line and a line of context stand above the answer')
})

check('the same conversation arriving again is not re-anchored', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  enterFromBoard('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 5984)
  // A status tick that republishes the same main view is not a new arrival.
  transcript.scrollTop = 8200
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 8200, 'the arrival already answered stays answered')
})

check('a conversation opened from anywhere but the board keeps the shell\'s tail', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 8200, 'the task window and the sidebar do not move the page')
})

check('the wheel before the page settles keeps the position the reader made', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  enterFromBoard('s1')
  clock.advance(16)
  wheel()
  clock.advance(200)
  assert.equal(transcript.scrollTop, 8200, 'a reading gesture outranks an anchor nobody asked for')
})

check('leaving the conversation and coming back makes it an arrival again', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  enterFromBoard('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 5984)
  currentBinding.open('')
  transcript.scrollTop = 8200
  enterFromBoard('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 5984, 'a second visit is read from the same boundary')
})



step(async () => {
  // A host that has the layout panel gets the button; a host without one keeps
  // the floating board and is not offered a door onto nothing.
  {
    fakeStorage.clear()
    feed.clear()
    registry.clear()
    const bundle = await loadBundle('?reload=overview')
    const ctxO = makeCtx()
    const chosen = []
    const base = ctxO.get.bind(ctxO)
    ctxO.get = (name) => name === 'layout'
      ? {
          selectPanel(id) {
            chosen.push(id)
          },
          panelInfo: { getSnapshot: () => ({ activePanelId: '' }) },
        }
      : base(name)
    bundle.apply(ctxO)
    const apiO = fakeWindow.__dshVim
    const root = fakeDocument.createElement('div')
    assert.equal(apiO.boardPage(root), true, 'the board page mounts')
    const chip = boardSeat(root, 'boardOverview')
    assert.ok(chip, 'the heading carries the overview button')
    assert.equal(String(chip.textContent), expectedLabel('overview'), 'with the word the page uses')
    fireOn(chip, 'click', { type: 'click', stopPropagation() {} })
    assert.deepEqual(chosen, ['dsh-vim-overview'], 'pressing it selects the overview page')
  
    const page = fakeDocument.createElement('div')
    assert.equal(apiO.overview(page), true, 'the page builds on its own')
    const back = boardSeat(page, 'overviewBack')
    assert.ok(back, 'and carries the way back')
    fireOn(back, 'click', { type: 'click', stopPropagation() {} })
    assert.deepEqual(chosen, ['dsh-vim-overview', 'dsh-vim-board'], 'which selects the board')
    apiO.boardPage(null, false)
    ctxO.log.cleanups[0]()
    bumpChecks()
    console.log('  ok  the board heading opens the overview, and the overview opens the board')
  }
})
