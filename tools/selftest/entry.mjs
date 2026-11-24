import assert from 'node:assert/strict'
import { clock, el, transcript, sidebar, root, fire, press, fakeStorage, fakeWindow, menu, fakeDocument, feed, registry, statusFeed, currentBinding, opened, makeCtx, loadBundle, wheel, peak, check, step, bumpChecks } from './harness.mjs'
import { arriveInputRow, enterFromBoard } from './helpers.mjs'

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
// are read from a marked root, and both spare a field and a selection.
{
  fakeStorage.clear()
  feed.clear()
  registry.clear()
  const bundle = await loadBundle('?reload=boardback')
  const ctxB = makeCtx()
  const selected = []
  const base = ctxB.get.bind(ctxB)
  ctxB.get = (name) => name === 'layout'
    ? {
        selectPanel(id) {
          selected.push(id)
        },
        panelInfo: { getSnapshot: () => ({ activePanelId: 'dsh-vim-board' }) },
      }
    : base(name)
  bundle.apply(ctxB)
  const apiB = fakeWindow.__dshVim
  const page = fakeDocument.createElement('div')
  assert.equal(apiB.boardPage(page), true, 'the board page mounts')
  assert.equal(page.__attrs['data-role'], 'boardPage', 'the page marks itself for the press')

  const press = (node) => {
    const ev = {
      type: 'contextmenu', target: node, clientX: 600, clientY: 300,
      defaultPrevented: false,
      preventDefault() { ev.defaultPrevented = true },
    }
    return fire('contextmenu', ev)
  }

  // A press on neither page is nobody's to take.
  const elsewhere = press(el({ tag: 'DIV' }))
  assert.equal(elsewhere.defaultPrevented, false, 'a press on neither page keeps its menu')
  assert.deepEqual(selected, [], 'and asks for no panel')

  // The field a goal is being renamed in, and a thought being typed, keep the
  // press they have always had.
  const field = press(el({ tag: 'DIV', editable: true, parent: page }))
  assert.equal(field.defaultPrevented, false, 'a press in a field on the page is not claimed')
  assert.deepEqual(selected, [], 'and the page stays up')

  // Copying is the press a selection claims.
  fakeDocument.getSelection = () => ({
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => ({ getClientRects: () => [{ left: 0, top: 0, right: 2000, bottom: 2000 }] }),
  })
  const chosen = press(el({ tag: 'DIV', parent: page }))
  fakeDocument.getSelection = undefined
  assert.equal(chosen.defaultPrevented, false, 'a press inside a text selection is still a copy')
  assert.deepEqual(selected, [], 'and the page stays up')

  // The bare page answers it — the one press that means "back".
  const bare = press(el({ tag: 'DIV', parent: page }))
  assert.equal(bare.defaultPrevented, true, 'the bare press is taken')
  assert.deepEqual(selected, [null], 'and the layout is asked for no panel, which is the conversation')

  apiB.boardPage(null, false)
  ctxB.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a right press on the board page is the way back to the conversation')
}
})

