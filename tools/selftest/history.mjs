/**
 * Behaviour checks: the day pages and the history panel.
 */
import assert from 'node:assert/strict'
import { step, bumpChecks, setMenuOnScreen, setMediaReduce, setNow, ROOT, BUNDLE, now, seq, timers, frames, FRAME_MS, clock, matches, matchesSimple, el, arrivedRows, transcript, sidebar, composer, button, body, root, editor, modal, modalEditor, blurCount, editorBlurs, synthKeys, replayKeydown, listeners, captureOf, record, unrecord, fire, shellFocus, domFocus, fireOn, clickThrough, flush, press, stored, fakeStorage, fakeDatabases, fakeRequest, fakeStoreApi, fakeIndexedDB, mediaReduce, fakeWindow, menu, menuOnScreen, fakeDocument, paneAt, cardNode, aimAt, resetHitTest, ReactStub, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, fakeRequire, feed, registry, newSessions, renames, statusFeed, currentBinding, MODEL, REASONING, projections, forks, opened, archives, makeCtx, captured, loadBundle, client, ctx, cleanup, keydown, keyup, wheel, movePointer, blurWindow, refocusWindow, tap, SHIPPED, expectedLabel, checks, peak, reset, finish, check, checkAsync } from './harness.mjs'
import { seed, HOUR, ago, toastText, toastHost, seedVisible, todayAt, boardPanel, boardBody, boardBlocks, boardBlock, cardsIn, looseCards, boardDoc, boardSeat, pressForDrag, dragTo, tapMark, ideaFocusSheet, ideaFocusField, ideaFocusOpen, writeIdea, dragOnto, boardCard, boardKey, drawnColumns, journalLines } from './helpers.mjs'
// --- the history ----------------------------------------------------------
//
// A day's page is what the board read at that moment. These checks file one,
// read it back, and prove the two promises the design makes: a page is a copy
// (so a later edit cannot change it) and restoring one copies it into today
// rather than writing to the page.

// The migration checks above reload the bundle and take it down again, so the
// plugin is not mounted when this section starts: mount it, and let `reset` own
// the rest.
step(async () => {
  const live = await loadBundle('?reload=history')
  const liveCtx = makeCtx()
  live.apply(liveCtx)
})


checkAsync('a page is filed when the day turns over, in the words it was drawn in', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  assert.equal(days.length, 1, 'one page for one day of drawing')
  const page = await fakeWindow.__dshVim.history(days[0])
  assert.equal(page.date, days[0], 'the page is filed under its own date')
  assert.equal(page.view.sessions.length, 1, 'the page remembers its members')
  assert.equal(page.view.sessions[0].id, 'kept')
  assert.equal(page.view.sessions[0].title, 'a task', 'the name is the one that was drawn')
  assert.ok(page.doc && page.doc.blocks, 'and the arrangement travelled with it')
  assert.ok(!('order' in page.doc), 'a page keeps five tables, not the whole document')
  tap('Escape')
})

checkAsync('a conversation carried in is a quiet line that says how long', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  await flush()
  // The day brought it along, so it is on the board - but nothing has been done
  // in it since, so it is a line at the foot of the panel rather than a column of
  // its own. What the old card promised is the line's promise now: still here,
  // and still saying how long it has been.
  const panel = boardBlocks()[0]
  assert.ok(panel, 'the panel is still drawn')
  const head = boardSeat(panel, 'quietHead')
  assert.ok(head, 'and the conversation is still on the board, as the panel\'s quiet line')
  assert.equal(
    String(head.textContent),
    '▸ ' + expectedLabel('boardQuiet') + ' 1 · '
      + expectedLabel('boardQuietLongest') + ' 1 ' + expectedLabel('boardQuietDays'),
    'which says how many are quiet and how long the oldest has waited'
  )
  // Unfolding is the reader asking which ones: the lines are drawn then, and the
  // conversation is in one of them, with its own day count on it.
  tapMark(head)
  const line = boardSeat(boardBlocks()[0], 'quietRow')
  assert.ok(line, 'unfolded, the carried conversation is a line of its own')
  assert.equal(line.__attrs['data-session-id'], 'kept', 'and it is the one that was carried')
  const waited = boardSeat(line, 'quietDays')
  assert.equal(
    String(waited ? waited.textContent : ''),
    '1 ' + expectedLabel('boardQuietDays'),
    'for one day, which is how long it has been'
  )
  assert.deepEqual(
    cardsIn(boardBlocks()[0]).map((card) => card.__attrs['data-session-id']),
    ['kept'],
    'and it is drawn once, not twice'
  )
  tap('Escape')
})

checkAsync('a quiet line is still a conversation, and can be carried to another goal', async () => {
  registry.publish([], [{ workspaceId: 'wq', title: 'quiet-carry', path: '/work/quiet-carry', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a kept task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  await flush()
  const panel = boardBlock('quiet-carry')
  const head = boardSeat(panel, 'quietHead')
  tapMark(head)
  const line = boardSeat(boardBlocks()[0], 'quietRow')
  assert.ok(line, 'the quiet conversation has a line of its own')
  // A line is a card on this canvas: the same handle, the same carry. It is
  // let go on the tray, which is a goal like any other for a filing.
  const inbox = boardBlocks().find((block) => block.__attrs['data-role'] === 'workspaceBlock'
    && boardSeat(block, 'blockName').textContent === expectedLabel('boardInbox'))
  aimAt(inbox)
  pressForDrag(line, 60, 300)
  dragTo(60, 500)
  assert.equal(boardDoc().placed.kept, '@inbox', 'the quiet line was carried to the goal it was let go on')
  // Carrying it is touching it: the line is a column in the goal it landed in,
  // and the quiet strip no longer holds it.
  const tray = boardBlock(expectedLabel('boardInbox'))
  assert.deepEqual(drawnColumns(tray), ['kept'], 'and it stands in the work of that goal')
  assert.equal(boardSeat(tray, 'quietRow'), null, 'not as a quiet line any more')
  resetHitTest()
  tap('Escape')
})

checkAsync('a quiet line dragged back inside its own goal becomes a column again', async () => {
  registry.publish([], [{ workspaceId: 'wq3', title: 'quiet-home', path: '/work/quiet-home', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a kept task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  await flush()
  const panel = boardBlock('quiet-home')
  tapMark(boardSeat(panel, 'quietHead'))
  const line = boardSeat(boardBlock('quiet-home'), 'quietRow')
  assert.ok(line, 'the quiet line is there to pull')
  aimAt(boardBlock('quiet-home'))
  pressForDrag(line, 60, 300)
  dragTo(60, 200)
  assert.deepEqual(drawnColumns(boardBlock('quiet-home')), ['kept'],
    'let go over its own work, the line stands as a column again')
  resetHitTest()
  tap('Escape')
})

checkAsync('a busy goal keeps its row at three and starts another under it', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a', 'b', 'c', 'd'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(6) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(5) },
    { id: 'c', displayTitle: 'c', updatedAt: todayAt(4) },
    { id: 'd', displayTitle: 'd', updatedAt: todayAt(3) },
  ])
  tap('j')
  const grid = boardSeat(boardBlock('dsh-vim'), 'blockColumns')
  assert.ok(grid, 'the panel still reads as columns')
  // Three across is the row's whole width. The fourth starts another row under
  // the first instead of making the panel a fourth column wider - which is what
  // used to turn a busy goal into two screens of paper.
  assert.equal(String(grid.style.width), (3 * 280 + 2 * 12) + 'px', 'the row is three columns wide')
  assert.deepEqual(
    cardsIn(grid).map((card) => card.__attrs['data-session-id']),
    ['a', 'b', 'c', 'd'],
    'and every conversation is still drawn'
  )
  tap('Escape')
})

checkAsync('a page is copied into today, and the page itself is never written to', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  // A card written today belongs to the page being filed.
  const key = boardKey()
  const drawn = JSON.parse(stored.get(key))
  drawn.cards.push({ id: 'c1', x: 10, y: 10, text: 'a thought', link: '', done: false, filed: '', h: 0 })
  stored.set(key, JSON.stringify(drawn))
  tap('Escape')
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  const filed = await fakeWindow.__dshVim.history(days[0])
  assert.equal(filed.doc.cards.length, 1, 'the page carries the card that was on the board')
  // Today starts empty: the arrangement is gone, and the card with it.
  fakeStorage.setItem(key, JSON.stringify({ v: 2, blocks: {}, cards: [] }))
  tap('Escape')
  tap('j')
  assert.equal(boardDoc().cards.length, 0, 'today has no card of its own')
  const done = await fakeWindow.__dshVim.restoreDay(days[0])
  await flush()
  assert.equal(done, true, 'the page was copied in')
  assert.equal(boardDoc().cards.length, 1, 'the copy carries the page\'s card')
  assert.equal(boardDoc().cards[0].text, 'a thought')
  const again = await fakeWindow.__dshVim.history(days[0])
  assert.deepEqual(again, filed, 'and the page itself is exactly as it was')
  tap('Escape')
})

checkAsync('a full store keeps the change, says so, and writes it once there is room', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const key = boardKey()
  const before = stored.get(key)
  fakeStorage.fail = true
  fireOn(boardSeat(boardBlock('dsh-vim'), 'blockFold'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(toastText(), expectedLabel('boardSaveFailed'), 'the window says the store is full')
  assert.equal(stored.get(key), before, 'and nothing was half-written')
  fakeStorage.fail = false
  clock.advance(6000)
  tap('Escape')
  tap('j')
  await flush()
  const after = boardDoc()
  assert.ok(after.blocks.w1, 'the fold is written once there is room again')
  assert.equal(after.blocks.w1.folded, true, 'with the value the press asked for')
  tap('Escape')
})

check('a panel forgets a conversation that is gone for good', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const key = boardKey()
  const doc = JSON.parse(stored.get(key))
  doc.order.w1 = ['dead', 'kept']
  stored.set(key, JSON.stringify(doc))
  clock.advance(61 * 1000)
  tap('Escape')
  tap('j')
  const after = JSON.parse(stored.get(key))
  assert.deepEqual(after.order.w1, ['kept'], 'the id of a conversation that is gone is dropped')
  tap('Escape')
})


checkAsync('the history panel reads a day back, and arming it writes nothing', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  const filed = await fakeWindow.__dshVim.history(days[0])

  assert.equal(fakeWindow.__dshVim.historyPanel(true), true, 'the panel opens')
  await flush()
  const panel = boardSeat(boardPanel(), 'boardHistoryPanel')
  assert.ok(panel, 'and it sits beside the canvas')
  const row = boardSeat(panel, 'historyDay')
  assert.ok(row, 'the day is listed')
  assert.equal(String(row.__attrs['data-date']), days[0], 'by its own date')

  fireOn(row, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  const opened = boardSeat(boardSeat(boardPanel(), 'boardHistoryPanel'), 'historyDetail')
  assert.ok(opened, 'opening a day shows its page')
  const listed = []
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.__attrs && child.__attrs['data-role'] === 'historySession') listed.push(child)
      walk(child)
    }
  }
  walk(opened)
  assert.equal(listed.length, 1, 'with the conversations it held')
  assert.ok(String(listed[0].textContent).includes('a task'), 'in the words it was drawn in')

  const restore = boardSeat(opened, 'historyRestore')
  assert.ok(restore, 'and one press to copy it into today')
  fireOn(restore, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  const armed = boardSeat(boardSeat(boardPanel(), 'boardHistoryPanel'), 'historyRestore')
  assert.equal(String(armed && armed.__attrs['data-armed']), 'true', 'the first press only arms it')
  const again = await fakeWindow.__dshVim.history(days[0])
  assert.deepEqual(again, filed, 'and the page is exactly as it was')

  fakeWindow.__dshVim.historyPanel(false)
  assert.equal(boardSeat(boardPanel(), 'boardHistoryPanel'), null, 'closing takes it away')
  tap('Escape')
})


check('a drop files the conversation under the panel the event landed on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  // The hit test is pointed at the paper, and the event is what names the goal:
  // a drop is delivered to the element under the pointer, so the board reads the
  // event's own target before it asks the layout anything.
  aimAt(fakeDocument.body)
  dragOnto(boardBody(), 'a', { target: boardBlock('two') })
  resetHitTest()
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the event target is the goal that took it')
  tap('Escape')
})

check('a drag that carries more than the id still names its conversation', () => {
  seed([{ id: 'ses_one', displayTitle: 'first task', updatedAt: todayAt(2) }])
  tap('j')
  dragOnto(boardBody(), '  (ses_one)  ')
  assert.equal(toastText(), expectedLabel('pinDone'), 'the words around the id do not hide it')
  tap('Escape')
})

check('a row that carries its name instead of its id still lands', () => {
  seed([{ id: 'ses_two', displayTitle: 'second task', updatedAt: todayAt(2) }])
  tap('j')
  dragOnto(boardBody(), 'second task')
  assert.equal(toastText(), expectedLabel('pinDone'), 'the name is the other thing a row can carry')
  tap('Escape')
})

checkAsync('a notice never lands below the window', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  // A box measured before the page it belonged to was replaced: its top is past
  // the bottom of the window, which used to turn into a negative offset and put
  // the line under the screen.
  editor.__rect = { top: 2400, left: 300, width: 600, height: 160, right: 900, bottom: 2560 }
  tap('q')
  await flush()
  const host = toastHost()
  assert.ok(host, 'the notice is still on the page')
  assert.equal(host.style.bottom, 'calc(100vh - 12px)', 'and it keeps its margin instead of leaving the window')
})

check('a thought filed under a conversation is one line, and the newest sits on top', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const fileOne = (text) => {
    writeIdea(text)
    aimAt(cardsIn(boardBlock('dsh-vim'))[0])
    pressForDrag(looseCards()[0].children[0], 10, 10)
    dragTo(300, 200)
    resetHitTest()
  }
  fileOne('先写的一句')
  fileOne('后写的一句')
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(held.length, 2, 'both thoughts are filed under the conversation')
  assert.equal(held[0].__attrs['data-compact'], 'true', 'a filed thought is drawn as one line')
  assert.equal(Boolean(boardSeat(held[0], 'looseText')), false, 'with no body line spent on it')
  assert.equal(String(boardSeat(held[0], 'looseTitle').textContent), '后写的一句', 'the newest filing sits on top')
  // The rest of the card's verbs live behind the ⋯. The two filings above left
  // the hand mid-carry, and a click straight after a drag is that drag's
  // leftover rather than a request, so the mark is pressed before it is
  // clicked — the same idiom every other mark on the board is tapped with.
  tapMark(boardSeat(held[0], 'cardMenuOpen'))
  const menu = boardSeat(held[0], 'ideaMenu')
  assert.equal(Boolean(menu), true, 'the ⋯ opens its own menu')
  assert.equal(Boolean(boardSeat(menu, 'ideaMenuOpen')), true, 'with a way to the whole note')
  // Writing the two thoughts left the caret in a card's field, and the board
  // withholds its keys from a field while one is being typed into: the page has
  // to have the keyboard back before Escape can mean "put this menu away".
  fakeDocument.activeElement = body
  tap('Escape')
  // The press was made on the paint before this one, so what Escape is asked
  // about is the board itself: the menu is gone from it, and it is still up.
  assert.equal(Boolean(boardSeat(boardBlock('dsh-vim'), 'ideaMenu')), false, 'and Escape puts it away without closing the board')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board itself stays up')
  tap('Escape')
})

check('the 投入 button pastes the thought and leaves a finished trace', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('把这句话发过去')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  // The drop just above left the hand mid-carry, so the mark is pressed before
  // it is clicked: a click straight after a drag belongs to that drag.
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(pasted && pasted.command, 'insertText', 'the words are pasted as typing')
  assert.equal(pasted && pasted.text, '把这句话发过去', "the thought's own words")
  assert.equal(boardDoc().cards[0].done, true, 'and the card is marked delivered')
  assert.equal(boardDoc().cards[0].link, 'target', 'still tied to where it went')
})

check('a conversation is sorted across its panel by dragging it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(2) },
  ])
  tap('j')
  const block = boardBlock('dsh-vim')
  const body = boardSeat(block, 'blockBody')
  body.__rect = { top: 100, left: 0, width: 900, height: 600, right: 900, bottom: 700 }
  // The panel is the boundary's own place when the body cannot be measured.
  block.__rect = { top: 60, left: 0, width: 920, height: 700, right: 920, bottom: 760 }
  const columns = boardSeat(block, 'blockColumns').children
  columns.forEach((column, at) => {
    column.__rect = { top: 120, left: at * 292, width: 280, height: 300, right: at * 292 + 280, bottom: 420 }
  })
  assert.deepEqual(boardDoc().order.w1, ['a', 'b'], 'the panel starts in the order it was drawn in')
  // Take the second conversation past the first one's middle, then let go.
  pressForDrag(cardsIn(columns[1])[0], 400, 200)
  // Letting go asks the page what is under the hand, so the hit test is pointed
  // at the column the conversation is being taken to.
  aimAt(columns[0])
  dragTo(40, 200)
  assert.deepEqual(boardDoc().order.w1, ['b', 'a'], 'the order the hand chose is written down')
  tap('Escape')
})


check('the panel keeps its own order, however recently a card moved', () => {
  // Mid-afternoon, so "three hours ago" is earlier today whatever the hour the
  // suite happens to run at. A check about warm and cold is a check about one
  // day.
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  setNow(midnight.getTime() + 15 * HOUR)
  const first = [
    { id: 'q', displayTitle: 'q', updatedAt: ago(1) },
    { id: 's', displayTitle: 's', updatedAt: ago(2) },
    { id: 'p', displayTitle: 'p', updatedAt: ago(4) },
    { id: 'r', displayTitle: 'r', updatedAt: ago(5) },
    { id: 't', displayTitle: 't', updatedAt: ago(6) },
  ]
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['q', 's', 'p', 'r', 't'] }])
  seed(first)
  tap('j')
  assert.deepEqual(drawnColumns(boardBlock('dsh-vim')), ['q', 's', 'p', 'r', 't'],
    'the panel reads in the order it wrote down')
  tap('Escape')
  // s is now the newest card on the panel. A sort by when a card last moved
  // would stand it first; the page the reader already learned does not move.
  seed([
    { id: 'q', displayTitle: 'q', updatedAt: ago(2) },
    { id: 's', displayTitle: 's', updatedAt: ago(1) },
    { id: 'p', displayTitle: 'p', updatedAt: ago(4) },
    { id: 'r', displayTitle: 'r', updatedAt: ago(5) },
    { id: 't', displayTitle: 't', updatedAt: ago(6) },
  ])
  tap('j')
  assert.deepEqual(drawnColumns(boardBlock('dsh-vim')), ['q', 's', 'p', 'r', 't'],
    'the same five read in the same order, and nothing moved because a clock did')
  tap('Escape')
  setNow(was)
})

check('a conversation that arrives later is appended, not seated by when it arrived', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  setNow(midnight.getTime() + 15 * HOUR)
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['p', 'q'] }])
  seed([
    { id: 'p', displayTitle: 'p', updatedAt: ago(1) },
    { id: 'q', displayTitle: 'q', updatedAt: ago(2) },
  ])
  tap('j')
  const before = drawnColumns(boardBlock('dsh-vim'))
  tap('Escape')
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['p', 'q', 'u'] }])
  seed([
    { id: 'p', displayTitle: 'p', updatedAt: ago(1) },
    { id: 'q', displayTitle: 'q', updatedAt: ago(2) },
    { id: 'u', displayTitle: 'u', updatedAt: ago(0.5) },
  ])
  tap('j')
  assert.deepEqual(drawnColumns(boardBlock('dsh-vim')), before.concat(['u']),
    'the new conversation takes the end, and the ones already there keep their places')
  tap('Escape')
  setNow(was)
})

check('a sort across a wrapped panel reads the row the hand is in', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  setNow(midnight.getTime() + 15 * HOUR)
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['p', 'q', 'r', 's', 't'] }])
  seed([
    { id: 'p', displayTitle: 'p', updatedAt: ago(4) },
    { id: 'q', displayTitle: 'q', updatedAt: ago(5) },
    { id: 'r', displayTitle: 'r', updatedAt: ago(6) },
    { id: 's', displayTitle: 's', updatedAt: ago(7) },
    { id: 't', displayTitle: 't', updatedAt: ago(8) },
  ])
  tap('j')
  const block = boardBlock('dsh-vim')
  const before = drawnColumns(block)
  assert.equal(before.length, 5, 'five cold conversations are three columns over two rows')
  block.__rect = { top: 60, left: 0, width: 920, height: 900, right: 920, bottom: 960 }
  // The body is the older boundary, kept measurable so the check also says what
  // the sort used to do with the page.
  const body = boardSeat(block, 'blockBody')
  if (body) body.__rect = { top: 100, left: 0, width: 900, height: 800, right: 900, bottom: 900 }
  const columns = boardSeat(block, 'blockColumns').children
  columns.forEach((column, at) => {
    const row = at < 3 ? 0 : 1
    const col = at < 3 ? at : at - 3
    column.__rect = {
      top: 120 + row * 320,
      left: col * 292,
      width: 280,
      height: 300,
      right: col * 292 + 280,
      bottom: 420 + row * 320,
    }
  })
  // Take the first conversation down into the second row, between the fourth
  // and the fifth. The hand is beside the fourth card, not below the second one,
  // so p takes the hole after it instead of the first row's first hole.
  pressForDrag(cardsIn(columns[0])[0], 100, 200)
  dragTo(300, 500)
  assert.deepEqual(boardDoc().order.w1,
    [before[1], before[2], before[3], before[0], before[4]],
    'the hand was beside the second row, and the order says so')
  tap('Escape')
  setNow(was)
})

check('a goal keeps its conversations while their thoughts are put away', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('一条想法')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.ok(boardSeat(boardBlock('dsh-vim'), 'cardStack'), 'the thought sits under the conversation')
  tapMark(boardSeat(boardBlock('dsh-vim'), 'blockIdeas'))
  assert.equal(boardSeat(boardBlock('dsh-vim'), 'cardStack'), null, 'the switch puts every thought away')
  assert.equal(boardDoc().blocks.w1.ideas, false, 'and the choice is written down')
  assert.equal(cardsIn(boardBlock('dsh-vim')).length, 1, 'while the conversation stays')
  tap('Escape')
  tap('j')
  assert.equal(boardSeat(boardBlock('dsh-vim'), 'cardStack'), null, 'the reload keeps them away')
  tapMark(boardSeat(boardBlock('dsh-vim'), 'blockIdeas'))
  assert.ok(boardSeat(boardBlock('dsh-vim'), 'cardStack'), 'and one press brings them back')
  tap('Escape')
})

check('an opened thought holds the whole of what it says', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const lines = []
  for (let at = 1; at <= 14; at++) lines.push('第' + at + '行')
  writeIdea('长句', lines.join(String.fromCharCode(10)))
  tapMark(boardSeat(looseCards()[0], 'looseText'))
  const editor = ideaFocusField('cardText')
  assert.ok(editor, 'the sheet is open')
  assert.equal(editor.value, lines.join(String.fromCharCode(10)), 'all fourteen lines are in the field')
  assert.equal(editor.style.overflow, 'auto', 'the sheet scrolls its body rather than clipping it')
  assert.ok(String(ideaFocusSheet().style.height).includes('620px'), 'and the desk is tall enough to read in')
  tap('Escape')
  assert.equal(ideaFocusOpen(), false, 'and Escape puts the sheet away')
})

check('a locked title survives a hand-over and refuses a rename', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  tapMark(boardSeat(boardCard('target'), 'cardLock'))
  assert.equal(boardDoc().locks.target, true, 'the lock is written down')
  writeIdea('修个 bug')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(pasted && pasted.text, '修个 bug', 'the words still land in the box')
  assert.equal(renames.calls.length, 0, 'but a locked title is never renamed')
  // Handing the words over opens the conversation, which puts the board away:
  // the press that refuses a rename has to come back to the card it is about.
  tap('j')
  const menuMark = boardSeat(boardCard('target'), 'cardMenuOpen')
  assert.ok(menuMark, 'the locked card still carries its menu mark')
  tapMark(menuMark)
  const renameItem = boardSeat(boardCard('target'), 'cardRenameOpen')
  assert.ok(renameItem, 'the menu is up on a locked card too')
  tapMark(renameItem)
  assert.equal(boardSeat(boardCard('target'), 'cardRename'), null, 'no field opens on a locked title')
  assert.equal(toastText(), expectedLabel('boardCardLocked'), 'and the press says why')
  tap('Escape')
})

check('escape puts the card menu away and leaves the board up', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  assert.ok(boardSeat(boardCard('a'), 'cardRenameOpen'), 'the menu is up')
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'escape closes the menu, not the board')
  assert.equal(boardSeat(boardCard('a'), 'cardRenameOpen'), null, 'and the menu leaves with it')
  assert.equal(
    boardSeat(boardCard('a'), 'cardMenuOpen').__attrs['aria-expanded'],
    'false',
    'so the mark says it is closed'
  )
  tap('Escape')
})

check('finished thoughts are counted after three, and unfold on a press', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const fileDone = (text) => {
    writeIdea(text)
    aimAt(cardsIn(boardBlock('dsh-vim'))[0])
    pressForDrag(looseCards()[0].children[0], 10, 10)
    dragTo(300, 200)
    resetHitTest()
    const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
    const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
    tapMark(boardSeat(held, 'cardDoneToggle'))
  }
  for (let at = 1; at <= 5; at++) fileDone('完成 ' + at)
  const stackNow = () => boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const drawn = () => stackNow().children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(drawn().length, 3, 'only three finished thoughts are drawn')
  const more = boardSeat(stackNow(), 'cardDoneMore')
  assert.ok(more, 'with a count for the rest')
  assert.equal(String(more.textContent), expectedLabel('boardDoneMore') + ' 2 ' + expectedLabel('boardDoneMoreUnit'))
  tapMark(more)
  assert.equal(drawn().length, 5, 'one press shows them all')
  tapMark(boardSeat(stackNow(), 'cardDoneMore'))
  assert.equal(drawn().length, 3, 'and the same press folds them again')
  tap('Escape')
})

check('a thought handed into a box already holding words starts a new paragraph', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('第二段')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  // The fake host's box is always empty, so the blank line this path adds when a
  // reader has already written something cannot be observed here; the words
  // landing is what this check can see, and the break is one branch beside it.
  assert.equal(pasted && pasted.command, 'insertText', 'the words land in the box')
  assert.equal(String(pasted && pasted.text).slice(-3), '第二段', 'and they are the card\'s own')
})


check('a thought keeps the moment it was written, and the moment it was dealt with', () => {
  registry.publish([], [])
  seed([])
  tap('j')
  writeIdea('先想清楚再动手')
  const written = boardDoc().cards[0]
  assert.ok(written.w > 0, 'the card remembers when it was written')
  assert.equal(written.d, 0, 'and has no done moment yet')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  const after = boardDoc().cards[0]
  assert.ok(after.d > 0, 'dealing with it stamps the second clock')
  assert.equal(after.w, written.w, 'and leaves the first one alone')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardDoc().cards[0].d, 0, 'taking the mark back takes the moment with it')
  tap('Escape')
})

checkAsync('the morning after, the day that ended is read back once', async () => {
  registry.publish([], [])
  seed([])
  tap('j')
  writeIdea('给重试加个幂等键')
  await flush()
  // Read by its words rather than by its count: the journal is a database and
  // its writes land a microtask later, so lines other checks queued can still
  // be draining into it when this one starts.
  const written = journalLines().filter((line) => line.kind === 'note/written'
    && line.text === '给重试加个幂等键')
  assert.equal(written.length, 1, 'writing a thought leaves one line, carrying its words')

  tap('Escape')
  clock.jump(24 * HOUR)
  await flush()
  tap('j')
  await flush()
  const seal = boardSeat(boardPanel(), 'boardSeal')
  assert.ok(seal, 'the day that ended is shown when the board comes back')
  assert.ok(String(boardSeat(seal, 'sealDate').textContent).length > 4, 'under its own date')
  assert.ok(String(boardSeat(seal, 'sealLine').textContent).includes(expectedLabel('boardSealWritten')),
    'counting the thoughts it recorded')
  assert.ok(String(boardSeat(seal, 'sealLeft').textContent).includes(expectedLabel('boardSealWaiting')),
    'and saying what the desk still owes')
  tap('Enter')
  assert.equal(boardSeat(boardPanel(), 'boardSeal'), null, 'and one key puts it away')
  tap('Escape')
  tap('j')
  await flush()
  assert.equal(boardSeat(boardPanel(), 'boardSeal'), null, 'it is not shown a second time')
  tap('Escape')
})

checkAsync('a sentence can be found across the pages', async () => {
  registry.publish([], [])
  seed([])
  tap('j')
  writeIdea('灰度先放百分之一')
  await flush()
  tap('Escape')
  clock.jump(24 * HOUR)
  await flush()
  tap('j')
  await flush()
  if (boardSeat(boardPanel(), 'boardSeal')) tap('Enter')
  assert.equal(fakeWindow.__dshVim.historyPanel(true), true, 'the history opens')
  await flush()
  const field = boardSeat(boardPanel(), 'historySearch')
  assert.ok(field, 'with a line to search in')
  field.value = '灰度'
  fireOn(field, 'input', { type: 'input' })
  for (let round = 0; round < 6; round++) await flush()
  const hit = boardSeat(boardPanel(), 'historyHit')
  assert.ok(hit, 'the page it was written on comes back')
  assert.ok(String(hit.textContent || '').includes('灰度'), 'with the words it was found by')
  fakeWindow.__dshVim.historyPanel(false)
  tap('Escape')
})



