import assert from 'node:assert/strict'
import { now, clock, composer, button, body, editor, fireOn, flush, press, stored, fakeStorage, fakeWindow, menu, fakeDocument, aimAt, resetHitTest, registry, renames, MODEL, REASONING, opened, makeCtx, loadBundle, tap, expectedLabel, check, checkAsync, step, setNow } from './harness.mjs'
import { seed, HOUR, ago, toastText, toastHost, seedVisible, todayAt, boardPanel, boardBody, boardStage, boardBlocks, boardBlock, cardsIn, looseCards, boardDoc, recordTyping, boardSeat, pressForDrag, dragTo, tapMark, ideaFocusSheet, ideaFocusField, ideaFocusOpen, writeIdea, dragOnto, openBoardCard, boardCard, boardKey, drawnColumns } from './helpers.mjs'

step(async () => {
// the rest.
{
  const live = await loadBundle('?reload=history')
  const liveCtx = makeCtx()
  live.apply(liveCtx)
}
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

checkAsync('the history is a calendar, and a day steps the canvas onto its page', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  const filed = await fakeWindow.__dshVim.history(days[0])
  const boardBefore = stored.get(boardKey())

  assert.equal(fakeWindow.__dshVim.historyPanel(true), true, 'the history opens')
  await flush()
  const panel = boardSeat(boardPanel(), 'boardHistoryPanel')
  assert.ok(panel, 'and it sits beside the canvas')
  const calendarOf = () => boardSeat(boardPanel(), 'historyCalendar')
  assert.ok(calendarOf(), 'as a calendar rather than a list')
  const collect = () => {
    const out = []
    const walk = (node) => {
      for (const child of node.children || []) {
        if (child.__attrs && child.__attrs['data-role'] === 'historyDay') out.push(child)
        walk(child)
      }
    }
    walk(calendarOf())
    return out
  }
  // The calendar opens on this month. A run that crossed midnight into a new
  // month filed yesterday under the month before it, and that month is one
  // press of < away - the press a reader makes, not a fact about the panel.
  let cells = collect()
  for (let back = 0; back < 12 && !cells.some((cell) => cell.__attrs['data-date'] === days[0]); back++) {
    const prev = boardSeat(calendarOf(), 'historyPrevMonth')
    if (!prev || prev.__attrs['data-off'] === 'true') break
    fireOn(prev, 'click', { type: 'click', stopPropagation() {} })
    await flush()
    cells = collect()
  }
  const dotted = cells.filter((cell) => cell.__attrs['data-history'] === 'true')
  assert.deepEqual(dotted.map((cell) => cell.__attrs['data-date']), [days[0]],
    'the one day with a page wears the dot under it')
  const plain = cells.find((cell) => cell.__attrs['data-history'] !== 'true' && cell.__attrs['data-today'] !== 'true')
  assert.ok(plain, 'a day with nothing under it is still drawn')
  assert.ok(!plain.__attrs['role'], 'but it is not a press')
  assert.ok(boardSeat(calendarOf(), 'historyMonth'), 'under the month it stands in')

  fireOn(dotted[0], 'click', { type: 'click', stopPropagation() {} })
  await flush()
  await flush()
  const page = boardBlocks()[0]
  assert.ok(page, 'the canvas draws the page\'s goals where they stood')
  assert.equal(page.__attrs['data-history'], 'true', 'as a page, not as today')
  assert.ok(!page.__attrs['data-handle'], 'with nothing on it to drag')
  const seat = boardSeat(page, 'historySession')
  assert.ok(seat, 'and the conversations it held')
  assert.ok(String(seat.textContent).includes('a task'), 'in the words they were drawn in')
  const banner = boardSeat(boardPanel(), 'historyBanner')
  assert.ok(banner, 'a bar says which day this is')
  assert.equal(String(boardSeat(banner, 'historyBannerDate').textContent), days[0])
  assert.ok(boardSeat(banner, 'historyReadOnly'), 'that it is read rather than worked on')
  assert.ok(boardSeat(banner, 'historyBackToday'), 'and offers the way back')
  assert.equal(String(boardSeat(boardPanel(), 'addCard').style.display), 'none',
    'the heading\'s working chips are put away')

  // Nothing on a page writes: not the double press that writes a thought, and
  // not the day itself when it is only being read.
  fireOn(boardStage(), 'dblclick', {
    type: 'dblclick',
    target: boardStage(),
    clientX: 12,
    clientY: 12,
    stopPropagation() {},
  })
  await flush()
  assert.equal(stored.get(boardKey()), boardBefore, 'a page cannot be written through')

  const restore = boardSeat(boardPanel(), 'historyRestore')
  assert.ok(restore, 'and one press copies it into today')
  fireOn(restore, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  const armed = boardSeat(boardPanel(), 'historyRestore')
  assert.equal(String(armed && armed.__attrs['data-armed']), 'true', 'the first press only arms it')
  const again = await fakeWindow.__dshVim.history(days[0])
  assert.deepEqual(again, filed, 'and the page is exactly as it was')
  assert.equal(stored.get(boardKey()), boardBefore, 'with today untouched too')

  tap('Escape')
  await flush()
  assert.equal(boardSeat(boardPanel(), 'historyBanner'), null, 'Escape steps out of the page')
  assert.ok(boardBlocks()[0].__attrs['data-handle'], 'and today\'s canvas is back')

  // Restoring is the one write a page offers, and it takes two presses: the
  // first arms it, the second copies the day into today and leaves the page.
  assert.equal(fakeWindow.__dshVim.historyView(days[0]), true, 'the page can be stepped onto again')
  await flush()
  await flush()
  fireOn(boardSeat(boardPanel(), 'historyRestore'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  fireOn(boardSeat(boardPanel(), 'historyRestore'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  await flush()
  assert.equal(boardSeat(boardPanel(), 'historyBanner'), null, 'the second press copies it and leaves the page')
  assert.equal(
    toastText(),
    expectedLabel('boardHistoryRestored') + days[0] + expectedLabel('boardHistoryRestoredTail'),
    'and says which day today now stands on',
  )

  fakeWindow.__dshVim.historyPanel(false)
  assert.equal(boardSeat(boardPanel(), 'boardHistoryPanel'), null, 'closing the calendar takes it away')
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
  // Filed is a state, not a style of its own: a thought under a conversation is
  // read the way the inbox reads one - same corner, same height, same padding.
  assert.equal(held[0].style.borderRadius, '8px', 'the row wears the inbox row\'s corner')
  assert.equal(held[0].style.minHeight, '30px', 'and its height')
  assert.equal(held[0].style.padding, '4px 6px 4px 10px', 'and its padding')
  // What it keeps is what the card was: its verbs, and the hue of its goal.
  assert.ok(boardSeat(held[0], 'cardDeliver'), 'the hand-over mark is still on the row')
  assert.ok(boardSeat(held[0], 'cardMenuOpen'), 'and so is the menu mark')
  const dot = String(boardSeat(boardBlock('dsh-vim'), 'blockDot').style.background)
  const hueOf = (colour) => {
    const found = /hsl\((\d+)/.exec(String(colour))
    return found ? found[1] : ''
  }
  assert.equal(hueOf(held[0].style.background), hueOf(dot), 'and the goal\'s own colour')
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
  const typed = recordTyping()
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  // The drop just above left the hand mid-carry, so the mark is pressed before
  // it is clicked: a click straight after a drag belongs to that drag.
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(typed.commands.length, 0, 'the words wait for the box rather than opening the conversation')
  assert.equal(boardDoc().cards[0].done, true, 'the card is marked delivered')
  assert.equal(boardDoc().cards[0].link, 'target', 'still tied to where it went')
  openBoardCard('target')
  assert.equal(typed.commands[0], 'insertText', 'the words are pasted as typing once the box exists')
  assert.equal(typed.text(), '把这句话发过去', "the thought's own words")
})

checkAsync('two cards dropped on one conversation land together, in the order they were let go', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const typed = recordTyping()
  const handOver = (text) => {
    writeIdea(text)
    aimAt(boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter'))
    pressForDrag(looseCards()[0].children[0], 10, 10)
    dragTo(300, 200)
    resetHitTest()
  }
  handOver('第一张')
  handOver('第二张')
  // Two drops, no door: the board is still up and the conversation was never
  // opened, which is the whole point of the queue.
  assert.equal(fakeWindow.__dshVim.board().open, true, 'both drops stay on the board')
  assert.deepEqual(opened, [], 'and neither opens the conversation')
  openBoardCard('target')
  await flush()
  assert.equal(
    typed.text(),
    ['第一张', '第二张'].join(String.fromCharCode(10, 10)),
    'the queue lands in the order the cards were let go, one block apart'
  )
  assert.deepEqual(
    typed.commands,
    ['insertText', 'insertParagraph', 'insertParagraph', 'insertText'],
    'and the block between the two cards is typed as paragraph breaks, not carried inside a text run'
  )
  assert.equal(renames.calls.length, 1, 'the conversation is named once, not twice')
  assert.equal(renames.calls[0].title, '第二张', 'by the newest card, as a second press would')
})

checkAsync('two cards arrive as two paragraphs, through the editor\'s own paste', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const typed = recordTyping()
  const handOver = (text) => {
    writeIdea(text)
    aimAt(boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter'))
    pressForDrag(looseCards()[0].children[0], 10, 10)
    dragTo(300, 200)
    resetHitTest()
  }
  handOver('第一张')
  handOver('第二张')

  // The host is a rich editor: it owns its document, so the editing commands can
  // type text but cannot press its Enter. A paste, on the other hand, is the
  // editor's own way in - it reads the blocks the paste carries as paragraphs.
  // This page is given that same capability, which is what lets the check say
  // which of the two paths the plugin took.
  const pastes = []
  const realDispatch = editor.dispatchEvent
  globalThis.DataTransfer = class {
    constructor() { this.data = new Map() }
    setData(kind, value) { this.data.set(kind, String(value)) }
    getData(kind) { return this.data.get(kind) || '' }
  }
  globalThis.ClipboardEvent = class {
    constructor(type, init) {
      this.type = type
      this.clipboardData = init && init.clipboardData
      this.bubbles = !!(init && init.bubbles)
      this.cancelable = !!(init && init.cancelable)
      this.defaultPrevented = false
    }
    preventDefault() { this.defaultPrevented = true }
  }
  editor.dispatchEvent = (ev) => {
    if (!ev || ev.type !== 'paste') return realDispatch ? realDispatch(ev) : true
    pastes.push(ev)
    // What the editor does with a paste: the plain reading arrives, in place.
    editor.value = String(editor.value || '') + ev.clipboardData.getData('text/plain')
    return true
  }
  try {
    openBoardCard('target')
    // The plugin reads the box back on its own timer, because a rich editor
    // commits on its own beat: the page's clock is stepped once to reach it.
    clock.advance(1)
    await flush()
    assert.equal(pastes.length, 1, 'the queue lands as one paste, not as a run of typing')
    assert.equal(typed.commands.length, 0, 'and nothing is typed into the box at all')
    assert.equal(editor.value, ['第一张', '第二张'].join(String.fromCharCode(10, 10)),
      'the two cards a blank line apart')
    const html = pastes[0].clipboardData.getData('text/html')
    assert.ok(html.includes('<p>第一张</p>'), 'the first card carried as a paragraph')
    assert.ok(html.includes('<p></p>'), 'the blank line carried as an empty paragraph')
    assert.ok(html.includes('<p>第二张</p>'), 'and the second card as its own')
  } finally {
    delete globalThis.ClipboardEvent
    delete globalThis.DataTransfer
    editor.dispatchEvent = realDispatch
    // The fake box keeps what the paste put in it, and the next check's hand-over
    // would read it as the reader's own draft: the page is left as it was found.
    editor.value = ''
    composer.value = ''
  }
  tap('Escape')
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

checkAsync('a locked title survives a hand-over and refuses a rename', async () => {
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
  const typed = recordTyping()
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(typed.commands.length, 0, 'the words wait for the box')
  openBoardCard('target')
  await flush()
  assert.equal(typed.text(), '修个 bug', 'the words still land in the box')
  assert.equal(renames.calls.length, 0, 'but a locked title is never renamed')
  // Opening the conversation put the board away and the host does not focus
  // the box on the way in; the reader's keyboard is still the page's.
  fakeDocument.activeElement = body
  // The board is gone, so the press that refuses a rename comes back to the
  // card it is about., so the press that refuses a
  // rename comes back to the card it is about.
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
