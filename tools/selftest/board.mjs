import assert from 'node:assert/strict'
import { now, seq, clock, el, transcript, sidebar, composer, button, body, editor, fire, fireOn, clickThrough, flush, press, stored, fakeWindow, menu, fakeDocument, cardNode, aimAt, resetHitTest, registry, newSessions, renames, statusFeed, MODEL, projections, forks, opened, wheel, blurWindow, tap, expectedLabel, checks, finish, check, checkAsync, step, setNow } from './harness.mjs'
import { seed, HOUR, ago, typeIn, pressIn, toastText, toastNode, CATALOG, FAVORITES, useFavorites, modelPickPanel, modelPickRows, todayAt, boardPanel, boardBody, boardStage, boardBlocks, boardBlock, cardsIn, boardCardIds, looseCards, boardHeading, boardDoc, handoffQueues, recordTyping, boardSeat, blockHead, goalMenuMark, openGoalMenu, pressForDrag, dragTo, writeCardButton, noteLines, tapMark, ideaFocusHost, ideaFocusSheet, ideaFocusField, ideaFocusOpen, writeIdea, openIdeaFocusOn, closeIdeaSheet, cancelIdeaSheet, tidyButton, doneBinList, finishedCard, boardWithFinishedCard, cardStateWords, cardOf, dragOnto, seedCurrent, openBoardCard, boardCard, drawnColumns } from './helpers.mjs'

check('a panel per workspace in play, and the inbox last', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', title: 'api', path: '/work/api', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'design', updatedAt: todayAt(5) },
    { id: 'b', displayTitle: 'code', updatedAt: todayAt(4) },
    { id: 'c', displayTitle: 'endpoint', updatedAt: todayAt(3) },
    { id: 'yesterday', displayTitle: 'yesterday', updatedAt: todayAt(0) - 1 },
  ])
  assert.ok(tap('j'), 'the board key must be the plugin\'s, not a stray letter')
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.open, true, 'j must open the board')
  assert.deepEqual(
    state.blocks.map((block) => block.key),
    ['w1', 'w2', '@inbox'],
    'one panel per workspace in play, newest first, and the inbox last'
  )
  assert.deepEqual(state.blocks.map((block) => block.ids), [['a', 'b'], ['c'], []], 'each holds its own conversations')
  assert.deepEqual(
    boardBlocks().map((block) => String(boardSeat(block, 'blockName').textContent)),
    ['dsh-vim', 'api', expectedLabel('boardInbox')],
    'the headings say what the API says'
  )
  assert.deepEqual(boardCardIds(), ['a', 'b', 'c'], 'only today\'s conversations are drawn, and the old one is not')
  assert.deepEqual(boardHeading(), {
    title: expectedLabel('board'),
    count:
      expectedLabel('boardTodayCount') + '2' + expectedLabel('boardWorkspacesUnit')
      + '3' + expectedLabel('boardSessionsUnit'),
  })
  tap('Escape')
})

check('a goal keeps the order the reader knows, however busy a card gets', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['older', 'newer'] }])
  seed([
    { id: 'older', displayTitle: 'older', updatedAt: todayAt(2) },
    { id: 'newer', displayTitle: 'newer', updatedAt: todayAt(3) },
  ])
  tap('j')
  const order = () => cardsIn(boardBlock('dsh-vim')).map((node) => node.__attrs['data-session-id'])
  const first = order()
  assert.deepEqual(first, ['newer', 'older'], 'the board opens newest first')
  tap('Escape')
  // The older one is used next and starts a turn: it is now the liveliest card on
  // the panel, and it must still be where the reader left it.
  seed([
    { id: 'older', displayTitle: 'older', updatedAt: todayAt(4) },
    { id: 'newer', displayTitle: 'newer', updatedAt: todayAt(3) },
  ])
  statusFeed.put('older', { running: true })
  tap('j')
  assert.deepEqual(order(), first, 'a turn starting moves nothing')
  tap('Escape')
  // Nor does a conversation that arrives later push the others around.
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['older', 'newer', 'last'] }])
  seed([
    { id: 'last', displayTitle: 'last', updatedAt: todayAt(5) },
    { id: 'older', displayTitle: 'older', updatedAt: todayAt(4) },
    { id: 'newer', displayTitle: 'newer', updatedAt: todayAt(3) },
  ])
  tap('j')
  assert.deepEqual(order(), ['newer', 'older', 'last'], 'a new arrival stands at the end; the rest hold still')
  tap('Escape')
})

check('a conversation with no workspace lands in the inbox', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['filed'] }])
  seed([
    { id: 'filed', displayTitle: 'in a workspace', updatedAt: todayAt(3) },
    { id: 'loose', displayTitle: 'nowhere', updatedAt: todayAt(2) },
  ])
  tap('j')
  const state = fakeWindow.__dshVim.board()
  assert.deepEqual(state.blocks[0].ids, ['filed'])
  assert.deepEqual(state.blocks[1].ids, ['loose'], 'the inbox is what no workspace accounts for')
  assert.equal(state.blocks[1].kind, 'inbox')
  assert.deepEqual(boardCardIds(), ['filed', 'loose'])
  tap('Escape')
})

check('a card is a way in: a press on it opens the conversation', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.ok(card, 'the inbox must show the conversation')
  assert.equal(String(boardSeat(card, 'cardTitle').textContent), 'a task', 'the card leads with the conversation\'s name')
  assert.equal(boardSeat(card, 'cardTitle').style.minHeight, '1.4em', 'the name takes one line and no more')
  // The largest target on the canvas carries the most likely action: the name is
  // part of the card, so a press on it is a press on the conversation.
  clickThrough(boardSeat(card, 'cardTitle'))
  assert.deepEqual(opened.slice(-1), ['task'], 'a press on the name opens the conversation')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'and the board gets out of the way')
})

check('the foot of a card holds its tools, and is never the way in', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  // The meta line is where every mark lives: the state chip, the turn count,
  // the star, the branch. A press between two of them is still a press on that
  // line, and a hand aiming at a mark that lands a few pixels off must not be
  // taken as a request to leave the board.
  clickThrough(boardSeat(card, 'cardMeta'))
  assert.deepEqual(opened, [], 'the meta line is not the way in')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and the board stays up')
  // The upper part of the card still is: the name opens the conversation.
  clickThrough(boardSeat(card, 'cardTitle'))
  assert.deepEqual(opened.slice(-1), ['task'], 'the upper part still opens it')
})

check('renaming lives behind the card \u22ef, one press further away than the card', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  // The name line keeps two things: the name, and the lock that holds it down.
  // Renaming is a host write a card needs rarely - the board names a
  // conversation from the thought that started it - so it lives in the menu,
  // and no word of it stands over the lock's own corner.
  assert.equal(boardSeat(card, 'cardRenameOpen'), null, 'no rename word stands on the name')
  assert.ok(boardSeat(card, 'cardLock'), 'the lock keeps its own seat beside the name')
  const menuMark = boardSeat(card, 'cardMenuOpen')
  assert.ok(menuMark, 'the card carries one mark for what is not worth a seat')
  assert.equal(menuMark.__attrs['aria-expanded'], 'false', 'closed, it says so')
  tapMark(menuMark)
  assert.equal(
    boardSeat(card, 'cardMenuOpen').__attrs['aria-expanded'],
    'true',
    'a press opens the menu and keeps the card it belongs to'
  )
  assert.equal(
    String(boardSeat(card, 'cardRenameOpen').textContent),
    expectedLabel('boardCardRenameHint'),
    'one verb, saying what it does in words'
  )
  const before = opened.length
  // The stop is the whole point: a host write must never be one stray press away
  // from the conversation, so the mark answers and the card behind it does not.
  clickThrough(boardSeat(card, 'cardRenameOpen'))
  assert.equal(opened.length, before, 'the rename mark does not open the conversation')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and the board stays up')
  const field = boardSeat(boardCard('task'), 'cardRename')
  assert.ok(field, 'the name becomes a field in place')
  pressIn(field, 'Escape')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and dropping the field is not a press on the card')
})

check('there is no 进入 button: the card is the way in, and the drop target is not a button', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = boardCard('task')
  // The card answers a press itself (checked above); the arrow is gone with the
  // rail it lived in, and what remains is the drop overlay an idea card is let go
  // on - not a button, and not in the tab order.
  const dropZone = boardSeat(card, 'cardEnter')
  assert.ok(dropZone, 'the drop target is still there for a carried note')
  assert.equal(dropZone.__attrs['aria-hidden'], 'true', 'but it is not offered as an action')
  assert.equal(dropZone.__attrs['role'], undefined, 'and it is not a button')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'so a press on it opens nothing')
})

checkAsync('the rename mark renames the conversation', async () => {
  seed([{ id: 'task', displayTitle: 'an old name', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardCard('task'), 'cardRename')
  assert.ok(field, 'the name becomes a field')
  assert.equal(field.value, 'an old name', 'carrying what it said')
  typeIn(field, '  a better name  ')
  pressIn(field, 'Enter')
  await flush()
  assert.equal(renames.calls.length, 1, 'the rename goes to the host')
  assert.equal(renames.calls[0].id, 'task')
  assert.equal(renames.calls[0].title, 'a better name', 'trimmed, as the shell expects')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  assert.equal(boardSeat(boardCard('task'), 'cardRename'), null, 'the field is gone')
  tap('Escape')
})

check('escape closes the board, the key itself too, and so does a press beside it', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(1) }])
  tap('j')
  assert.ok(tap('Escape'), 'escape belongs to the board while it is up')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'escape closes it')
  tap('j')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'the key that opened it puts it away again')
  tap('j')
  press(body)
  assert.equal(fakeWindow.__dshVim.board().open, false, 'a press on the page beside it closes it')
})

check('the board owns the keyboard while it is up', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(1) }])
  tap('j')
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'the task window must not open behind the board')
  tap('w')
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'nor the model window')
  tap(' ')
  assert.notEqual(fakeDocument.activeElement, editor, 'the focus key must not put the caret in the box')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and the board stays up through all of it')
  tap('Escape')
})

check('the task window does not give way to the board', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(1) }])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'one overlay at a time: the board stays shut')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the task window keeps the page')
  tap('Escape')
})

check('a card no longer wears, or asks for, a turn count', () => {
  seed([{ id: 'counted', displayTitle: 'a counted one', updatedAt: todayAt(2) }])
  projections.put('sessionStats', { turns: 12 })
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(boardSeat(card, 'turns'), null, 'the count is gone from the card')
  // The card does read one thing out of the session - what it was last told -
  // and the count rides along in that same retained scope rather than costing a
  // second one. What the badge's removal bought is the second ask, not the
  // first: one source, the plugin's own, and only while the answer is owed.
  assert.deepEqual(projections.sources, ['dsh-vim'], 'one scope, under the plugin\'s own source, for the words')
  assert.equal(String(boardSeat(card, 'cardTitle').textContent), 'a counted one', 'the card keeps what it says')
  tap('Escape')
  assert.deepEqual([...projections.live], [], 'nothing is left held open')
})

check('a conversation taken off the board comes back once it is used again', () => {
  seed([{ id: 'gone', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  // Deleting lives behind the ⋯ now: the card's face is the work and its marks.
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(boardCardIds(), [], 'the card is off the board')
  assert.ok(boardDoc().muted.gone !== undefined, 'and the decision is written down')
  tap('Escape')
  // A later message is a conversation in play again: the inbox is where it
  // comes back, and the stamp means the old deletion no longer applies.
  seed([{ id: 'gone', displayTitle: 'a task', updatedAt: todayAt(2) + 1 }])
  tap('j')
  assert.deepEqual(boardCardIds(), ['gone'], 'a conversation that moved after being deleted is back')
  tap('Escape')
})

check('a mark keeps an old conversation on the board, and the filter shows only marks', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['old', 'new'] }])
  seed([
    { id: 'old', displayTitle: 'old', updatedAt: todayAt(3) },
    { id: 'new', displayTitle: 'new', updatedAt: todayAt(2) },
  ])
  tap('j')
  const oldCard = cardsIn(boardBlock('dsh-vim')).find((card) => card.__attrs['data-session-id'] === 'old')
  fireOn(boardSeat(oldCard, 'cardStar'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(fakeWindow.__dshVim.board().starred, ['old'], 'the mark is recorded')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and pressing the mark does not open the card')
  // The mark is what keeps a conversation past the day it last moved.
  tap('Escape')
  seed([
    { id: 'old', displayTitle: 'old', updatedAt: todayAt(0) - 2 },
    { id: 'new', displayTitle: 'new', updatedAt: todayAt(2) },
  ])
  tap('j')
  assert.deepEqual(boardCardIds().includes('old'), true, 'a marked conversation is offered whatever day it belongs to')
  const filter = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'starFilter')
  fireOn(filter, 'click', { type: 'click' })
  assert.deepEqual(boardCardIds(), ['old'], 'the filter leaves only what is marked')
  tap('Escape')
})

check('a panel is dragged by its heading, and the place survives a reload', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const block = boardBlock('dsh-vim')
  const before = fakeWindow.__dshVim.board().places.w1
  pressForDrag(blockHead(block), 10, 10)
  dragTo(110, 80)
  const moved = fakeWindow.__dshVim.board().places.w1
  assert.equal(moved.x, before.x + 100, 'the panel moved with the pointer')
  assert.equal(moved.y, before.y + 70)
  assert.equal(String(block.style.left), moved.x + 'px', 'and the drawn panel agrees')
  tap('Escape')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().places.w1.x, moved.x, 'the place was written down')
  assert.equal(String(boardBlock('dsh-vim').style.left), moved.x + 'px', 'and the next board opens there')
  tap('Escape')
})

check('the canvas is panned by dragging the paper', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const canvas = boardBody()
  canvas.scrollLeft = 0
  canvas.scrollTop = 0
  pressForDrag(canvas, 500, 400)
  fire('pointermove', { type: 'pointermove', clientX: 450, clientY: 380, preventDefault() {} })
  fire('pointerup', { type: 'pointerup' })
  assert.equal(canvas.scrollLeft, 50, 'the paper moved left under the pointer')
  assert.equal(canvas.scrollTop, 20, 'and up, by the same gesture')
  tap('Escape')
})

check('a goal lays its conversations out whole, and nothing scrolls inside it', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
  ])
  seed(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, displayTitle: id, updatedAt: todayAt(2) })))
  tap('j')
  const body = boardSeat(boardBlock('one'), 'blockBody')
  assert.ok(body, 'the goal keeps a body for its conversations')
  assert.equal(body.style.maxHeight, undefined, 'no cap is declared on it')
  assert.equal(body.style.overflowY, undefined, 'and nothing inside the panel scrolls')
  assert.equal(cardsIn(boardBlock('one')).length, 8, 'every conversation is spread open on the panel')
  tap('Escape')
})

check('a fresh panel is not packed onto the tail of a tall one', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
    { workspaceId: 'w3', title: 'three', path: '/work/three', sessionIds: ['c'] },
    { workspaceId: 'w4', title: 'four', path: '/work/four', sessionIds: ['d'] },
    { workspaceId: 'w5', title: 'five', path: '/work/five', sessionIds: ['e'] },
  ])
  seed(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, displayTitle: id, updatedAt: todayAt(2) })))
  tap('j')
  // Five workspaces and the inbox fill two grid rows, and the fourth panel
  // sits at the head of the second. Say it grew far past its row - a goal
  // with a long list of conversations - and a sixth workspace arrives: the
  // grid's own height would put the newcomer one row under it, standing on
  // its cards. The place it was given reads the height the tall one measured.
  boardBlock('four').offsetHeight = 900
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
    { workspaceId: 'w3', title: 'three', path: '/work/three', sessionIds: ['c'] },
    { workspaceId: 'w4', title: 'four', path: '/work/four', sessionIds: ['d'] },
    { workspaceId: 'w5', title: 'five', path: '/work/five', sessionIds: ['e'] },
    { workspaceId: 'w6', title: 'six', path: '/work/six', sessionIds: ['f'] },
  ])
  const place = fakeWindow.__dshVim.board().places.w6
  assert.equal(place.x, 440, 'the newcomer takes the next column over')
  assert.equal(place.y, 1092, 'and a row that clears the tall panel\'s own bottom')
  assert.equal(String(boardBlock('six').style.top), '1092px', 'the drawn panel agrees')
  tap('Escape')
})

check('a goal stood from the toolbar steps over a tall panel', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  // The tall panel owns the paper down to its measured bottom; a goal asked
  // for on top of it has to be stood below that, not one grid row below its
  // top.
  boardBlock('one').offsetHeight = 900
  fireOn(boardSeat(boardPanel(), 'addGoal'), 'click', { type: 'click' })
  const goal = boardBlock(expectedLabel('boardNewGoal'))
  assert.ok(goal, 'a goal is standing on the canvas')
  assert.equal(String(goal.style.top), '1092px', 'below the real bottom of the tall panel')
  tap('Escape')
})

check('a card written from the heading lands below the real bottom of the work', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  // The heading's card belongs under everything standing, and a tall panel
  // hangs past the grid row it was planned at: "below everything" has to be
  // measured, or the card would land on its conversations.
  boardBlock('one').offsetHeight = 900
  writeIdea('a')
  assert.equal(String(looseCards()[0].style.top), '960px', 'the card opens under the tall panel\'s own bottom')
  tap('Escape')
})

check('every window this plugin mounts wears the shared window rules', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('f')
  assert.equal(cardNode() && cardNode().className, 'dshv-window', 'the task window carries the shared class')
  tap('Escape')
  tap('j')
  assert.equal(boardPanel() && boardPanel().className, 'dshv-window', 'and the board carries it too')
  tap('Escape')
})

check('a tidy squares the panels up and leaves the thoughts where they are', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(2) },
  ])
  tap('j')
  // A panel the reader put somewhere by hand, and two thoughts with nothing to
  // be tied to: the tidy squares the panels up, and the thoughts stay put.
  pressForDrag(blockHead(boardBlock('one')), 0, 0)
  dragTo(600, 400)
  writeIdea('第一条')
  writeIdea('第二条')
  const before = fakeWindow.__dshVim.board().loose.map((card) => [card.x, card.y])
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  const state = fakeWindow.__dshVim.board()
  // Filing is a gesture, not a tidying: a thought with no tie keeps its place on
  // the paper, and no tidy puts it away in the inbox behind the reader's back.
  assert.equal(looseCards().length, 2, 'the untied thoughts stay on the paper')
  assert.deepEqual(
    boardDoc().cards.map((card) => card.filed),
    ['', ''],
    'and neither is put away in the inbox'
  )
  assert.deepEqual(
    state.loose.map((card) => [card.x, card.y]),
    before,
    'at exactly the place the reader wrote them'
  )
  // The inbox opens the board in its own top left corner, then the goals follow
  // in reading order, with one gap between neighbours and every row level at the
  // top.
  const w2 = state.places.w2
  const w1 = state.places.w1
  const inbox = state.places['@inbox']
  const wide = parseFloat(boardBlock('one').style.width)
  const tray = parseFloat(boardBlock(expectedLabel('boardInbox')).style.width)
  assert.equal(inbox.x, 28, 'the inbox stands in the canvas corner')
  assert.equal(inbox.y, 28, 'on the first row')
  assert.equal(w2.x, inbox.x + tray + 32, 'the first goal stands one gap to its right')
  assert.equal(w2.y, inbox.y, 'level with the tray it belongs beside')
  assert.equal(w1.x, w2.x + wide + 32, 'the second goal stands one gap further over')
  assert.equal(w1.y, w2.y, 'on the same row')
  // Nothing left to move, so a second press is quiet rather than a replay.
  const settled = JSON.stringify(state.places)
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  assert.equal(JSON.stringify(fakeWindow.__dshVim.board().places), settled, 'a second tidy finds nothing to do')
  tap('Escape')
})

check('tidy stands a thought tied to a conversation that is not here beside the inbox', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('把这句话带过去')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.equal(fakeWindow.__dshVim.board().loose[0].link, 'target', 'the card is tied to the conversation')
  // The conversation stops being today's work, so the tie has no column to be
  // drawn in: the thought is a loose card again, and a tidy gives it the column
  // beside the tray rather than leaving it wherever it was.
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(0) - 2 }])
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  const state = fakeWindow.__dshVim.board()
  const inbox = state.places['@inbox']
  const panelWidth = parseFloat(boardBlocks()[0].style.width)
  assert.equal(state.loose[0].filed, '', 'a tie is not a reason to put the thought away')
  assert.equal(state.loose[0].x, inbox.x + panelWidth + 32, 'the tied card stands beside the tray')
  assert.equal(state.loose[0].y, inbox.y + 46, 'level with the top of the working set when nothing can be measured')
  tap('Escape')
})

check('a locked thought keeps the place a tidy would have moved it from', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('锁住的位置')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  // The conversation leaves today's work, so the tied card is on the paper again
  // with no column to be drawn in: exactly the card a tidy gives a place to.
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(0) - 2 }])
  tapMark(boardSeat(looseCards()[0], 'cardLockIdea'))
  assert.equal(boardDoc().cards[0].locked, true, 'the lock is written down')
  const held = fakeWindow.__dshVim.board().loose[0]
  const at = { x: held.x, y: held.y }
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  const after = fakeWindow.__dshVim.board().loose[0]
  assert.deepEqual({ x: after.x, y: after.y }, at, 'a tidy leaves the locked card exactly where it was')
  tap('Escape')
})

check('a goal has a lane for what the reader did, and a card dragged into it is filed there', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const lane = boardSeat(boardBlock('one'), 'goalLane')
  assert.ok(lane, 'the goal has a lane under it')
  assert.ok(boardSeat(lane, 'laneEmpty'), 'and says what it is for while it is empty')
  writeIdea('我去问了一句')
  aimAt(lane)
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.equal(boardDoc().cards[0].filed, 'w1', 'the thought is filed under the goal')
  const drawn = boardSeat(boardBlock('one'), 'goalLane')
  assert.ok(boardSeat(drawn, 'inboxNote'), 'and read as a line of that lane')
  assert.equal(looseCards().length, 0, 'it is no longer paper on the canvas')
  assert.equal(boardSeat(boardBlock(expectedLabel('boardInbox')), 'inboxNote'), null,
    'the inbox does not claim a card that has a goal')
  tap('Escape')
})

checkAsync('a branch made from a card appears under it, joined by a line', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'child'] }])
  seed([{ id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) }])
  tap('j')
  forks.results.push('child')
  const card = cardsIn(boardBlock('dsh-vim'))[0]
  fireOn(boardSeat(card, 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  assert.equal(forks.calls.length, 1, 'the board asked the host to fork')
  assert.equal(forks.calls[0].sessionId, 'parent', 'the conversation it drew')
  assert.deepEqual(fakeWindow.__dshVim.board().lineage, { child: 'parent' }, 'and it remembered where the branch came from')
  // The host publishes the child on its own clock; the board picks it up then.
  seed([
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
  ])
  await flush()
  const ids = cardsIn(boardBlock('dsh-vim')).map((node) => node.__attrs['data-session-id'])
  assert.deepEqual(ids, ['parent', 'child'], 'both cards are drawn, the branch under where it came from')
  const columns = boardSeat(boardBlock('dsh-vim'), 'blockColumns')
  assert.ok(columns, 'a goal lays its conversations out as columns')
  assert.deepEqual(
    columns.children.map((node) => node.__attrs['data-column']),
    ['parent', 'child'],
    'the branch stands in the column immediately after the one it came from'
  )
  assert.equal(boardSeat(cardsIn(boardBlock('dsh-vim'))[0].parentNode, 'forkChildren'), null, 'nothing hangs under a card any more')
  tap('Escape')
})

checkAsync('a branch whose parent is not here says where it came from', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'child'] }])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
  ])
  tap('j')
  // Fork through the host hop: the watcher records the pair.
  forks.results.push('child')
  const parentCard = cardsIn(boardBlock('dsh-vim')).find((node) => node.__attrs['data-session-id'] === 'parent')
  fireOn(boardSeat(parentCard, 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  // The parent stops being today's work; the child is still here, and the
  // parent is still in the catalogue the board reads names from.
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(0) - 2 },
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
  ])
  await flush()
  const childCard = cardsIn(boardBlock('dsh-vim'))[0]
  const source = boardSeat(childCard, 'forkSource')
  assert.ok(source, 'the child says where it came from instead of drawing a line to nothing')
  assert.equal(String(source.textContent), expectedLabel('boardForkSource') + 'the parent')
  tap('Escape')
})

checkAsync('one press makes one branch, however often the mark is pressed', async () => {
  seed([{ id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) }])
  tap('j')
  forks.results.push('child')
  fireOn(boardSeat(boardCard('parent'), 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  // The round trip is in flight, and the card says so: a second press is the
  // same intention, not a request for a second branch.
  const busy = boardSeat(boardCard('parent'), 'cardFork')
  assert.equal(busy.__attrs['data-busy'], 'true', 'the mark is waiting on the host')
  assert.equal(busy.__attrs['title'], expectedLabel('boardForkBusy'), 'and says what it is waiting for')
  fireOn(busy, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  assert.equal(forks.calls.length, 1, 'the host was asked once')
  tap('Escape')
})

checkAsync('a second branch of one conversation gets a name of its own', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'first'] }])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    // A branch of this conversation already wears what the host will call the
    // next one: the host numbers a branch off its parent's title, not off the
    // list, so two branches of one conversation land on the same words.
    { id: 'first', displayTitle: 'the parent (1)', updatedAt: todayAt(4) },
  ])
  tap('j')
  forks.results.push('second')
  fireOn(boardSeat(boardCard('parent'), 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  // The host publishes the child on its own clock; the board settles the name
  // once it can see what the child is called.
  seed([
    { id: 'second', displayTitle: 'the parent (1)', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'first', displayTitle: 'the parent (1)', updatedAt: todayAt(4) },
  ])
  await flush()
  assert.equal(renames.calls.length, 1, 'the branch is renamed rather than left wearing a taken name')
  assert.equal(renames.calls[0].id, 'second', 'the branch, not its parent')
  assert.equal(renames.calls[0].title, 'the parent (2)', 'the next free number, in the host\'s own shape')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  tap('Escape')
})

check('two cards wearing one name say which of them each is', () => {
  seed([
    { id: 'twina', displayTitle: 'the same', updatedAt: todayAt(4) },
    { id: 'twinb', displayTitle: 'the same', updatedAt: todayAt(3) },
    { id: 'alone', displayTitle: 'on its own', updatedAt: todayAt(2) },
  ])
  tap('j')
  assert.equal(String(boardSeat(boardCard('twina'), 'cardDupTag').textContent), '#1/2', 'the first of the two')
  assert.equal(String(boardSeat(boardCard('twinb'), 'cardDupTag').textContent), '#2/2', 'and the second')
  assert.equal(boardSeat(boardCard('alone'), 'cardDupTag'), null, 'a name nobody else wears says nothing')
  tap('Escape')
})

check('a panel folds its conversations away, and remembers', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const block = boardBlock('dsh-vim')
  fireOn(boardSeat(block, 'blockFold'), 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, true, 'the panel is folded')
  assert.equal(cardsIn(boardBlock('dsh-vim')).length, 0, 'and draws no conversations')
  tap('Escape')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, true, 'the fold was written down')
  fireOn(boardSeat(boardBlock('dsh-vim'), 'blockFold'), 'click', { type: 'click' })
  assert.equal(cardsIn(boardBlock('dsh-vim')).length, 1, 'and one press brings them back')
  tap('Escape')
})

check('a note is a title and two lines, and the whole of it opens in the sheet', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  // A note is written the way its two rows say: the name, then the thought.
  writeIdea('第一行', noteLines('第二行', '第三行', '第四行'))
  const paper = () => looseCards()[0]
  assert.equal(String(boardSeat(paper(), 'looseTitle').textContent), '第一行', 'the first line is the title')
  assert.equal(paper().__attrs['data-rows'], '2', 'and the paper spends two lines on the body')
  assert.equal(paper().__attrs['data-clipped'], 'true', 'saying it holds more than it shows')
  assert.equal(boardSeat(paper(), 'cardGrip'), null, 'there is no corner to drag')
  // The card stays a card while the sheet holds the whole of it: the press is a
  // move to a bigger desk, not a taller piece of paper on the canvas.
  openIdeaFocusOn(paper(), 'body')
  assert.equal(ideaFocusField('cardText').value, noteLines('第二行', '第三行', '第四行'),
    'the sheet holds every line of the body')
  assert.equal(ideaFocusField('cardTitleInput').value, '第一行', 'and the title')
  assert.ok(String(ideaFocusSheet().style.height).includes('620px'), 'the sheet is the wide desk, not a strip')
  closeIdeaSheet()
  assert.equal(String(boardSeat(paper(), 'looseTitle').textContent), '第一行', 'the card is unchanged on the canvas')
  tap('Escape')
})

check('a loose card is written, kept, and taken away', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const write = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
  fireOn(write, 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'nothing is on the canvas while the sheet is just a question')
  const editor = ideaFocusField('cardTitleInput')
  assert.ok(editor, 'the sheet offers its title')
  typeIn(editor, '先记一句')
  assert.equal(ideaFocusOpen(), true, 'typing stays in the sheet')
  closeIdeaSheet()
  // One line of text is all title: the heading says it, and the card keeps no
  // empty body line under it.
  const shown = boardSeat(looseCards()[0], 'looseTitle')
  assert.ok(shown, 'the card shows what it says')
  assert.equal(String(shown.textContent), '先记一句')
  assert.equal(boardSeat(looseCards()[0], 'looseText'), null, 'and no body line is kept for it')
  // Pressing the card opens the sheet on the same words.
  fireOn(shown, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(ideaFocusField('cardTitleInput').value, '先记一句')
  closeIdeaSheet()
  // The × lives in the card's own menu now: one press opens it, one takes the
  // card away.
  fireOn(boardSeat(looseCards()[0], 'cardMenuOpen'), 'click', { type: 'click', stopPropagation() {} })
  const cardMenu = boardSeat(looseCards()[0], 'ideaMenu')
  assert.ok(cardMenu, 'the ⋯ opens the card\'s own menu')
  fireOn(boardSeat(cardMenu, 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(fakeWindow.__dshVim.board().loose, [], 'the card is gone')
  tap('Escape')
})

check('a loose card is dragged by its heading, and the place survives a reload', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('here')
  const before = fakeWindow.__dshVim.board().loose[0]
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(210, 160)
  const after = fakeWindow.__dshVim.board().loose[0]
  assert.equal(after.x, before.x + 200, 'the card followed the pointer')
  assert.equal(after.y, before.y + 150)
  tap('Escape')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().loose[0].x, after.x, 'the place was written down')
  assert.equal(String(looseCards()[0].style.left), after.x + 'px', 'and the next board opens it there')
  tap('Escape')
})

check('a card dropped on a conversation is tied to it and laid beside it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('把这句话带过去')
  // Aim the hit test at the conversation the card is dragged onto.
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  // The card body is the gentler target: it ties the note to the work without
  // opening anything or putting anything in a draft.
  assert.deepEqual(opened, [], 'the board stays up and no conversation opens')
  const card = fakeWindow.__dshVim.board().loose[0]
  assert.equal(card.link, 'target', 'the card is tied to the conversation it was dropped on')
  assert.equal(card.done, false, 'and is still a thought rather than a delivery')
  // A tie is no longer a line drawn across the paper: the thought is drawn in
  // the conversation's own column, under the card it belongs to.
  assert.equal(looseCards().length, 0, 'the card leaves the paper')
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(held.length, 1, 'and is filed under the conversation it was dropped on')
  assert.equal(
    held[0].__attrs['title'],
    expectedLabel('boardCardLinked') + 'the target',
    'the tie is said in the card tooltip, with no line on the paper'
  )
  resetHitTest()
  tap('Escape')
})

check('a card dropped on the 投入 band is queued, and stays as a greyed trace', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('把这句话带过去')
  const typed = recordTyping()
  // The button is the target that means "take it into the conversation".
  aimAt(boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  // The drop is a filing, not a door: the board stays up, nothing opens, and the
  // words wait for that conversation's box instead of taking the reader with them.
  assert.equal(typed.commands.length, 0, 'nothing is pasted into a box that is not on screen')
  assert.deepEqual(opened, [], 'and no conversation is opened by the drop')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board is where the reader still stands')
  const card = fakeWindow.__dshVim.board().loose[0]
  assert.equal(card.done, true, 'the card is marked done')
  assert.equal(card.link, 'target', 'and tied to where it went')
  // Opening the conversation is what puts the waiting words in its box, at the
  // end of whatever the reader had written there.
  openBoardCard('target')
  assert.equal(typed.commands[0], 'insertText', 'the words go in as typing')
  assert.equal(typed.text(), '把这句话带过去', 'the card\'s own words')
  assert.deepEqual(opened.slice(-1), ['target'], 'the conversation it was dropped on is open')
  // Back on the board it is still there, quieter, with what it is tied to. The
  // caret was put in the composer, so the page has to have the keyboard back
  // before the board key can mean what it means.
  fakeDocument.activeElement = body
  tap('j')
  // The delivered thought is a trace now, and it lives in the column of the
  // conversation it was handed to: no line, no note lying on the paper.
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const trace = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(trace.length, 1, 'the card remains as a trace in its column')
  assert.equal(trace[0].__attrs['data-done'], 'true', 'drawn as done')
  assert.equal(boardSeat(trace[0], 'cardDoneToggle').__attrs['aria-pressed'], 'true', 'with its done box filled in')
  assert.equal(
    trace[0].__attrs['title'],
    expectedLabel('boardCardLinked') + 'the target',
    'the tie is said in the tooltip, not in a line of the card'
  )
  // The tie can be cut without losing the words; the card leaves the column and
  // comes back to the paper beside it. Cutting it is the menu's job now.
  fireOn(boardSeat(trace[0], 'cardMenuOpen'), 'click', { type: 'click', stopPropagation() {} })
  fireOn(boardSeat(boardSeat(trace[0], 'ideaMenu'), 'cardUnlink'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(looseCards().length, 1, 'the card is laid back on the paper')
  const after = fakeWindow.__dshVim.board().loose[0]
  assert.equal(after.link, '', 'the link is gone')
  assert.equal(after.done, false, 'and so is the delivered mark')
  assert.equal(after.text, '把这句话带过去', 'while the words stay')
  resetHitTest()
  tap('Escape')
})

checkAsync('a card handed to a conversation names it after the card, once its box has it', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('把这个想法做完', '正文一句话')
  const typed = recordTyping()
  // The band is the deliberate hand-over: the words go in, and the conversation
  // takes the card's title as its own name.
  aimAt(boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  assert.equal(typed.commands.length, 0, 'the words wait rather than dragging the reader into the box')
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, true, 'the drop is still a filing')
  openBoardCard('target')
  assert.deepEqual(opened.slice(-1), ['target'], 'the card is what opens the conversation')
  await flush()
  assert.equal(typed.commands[0], 'insertText', 'the words go in as typing once the box exists')
  assert.deepEqual(
    typed.commands,
    ['insertText', 'insertParagraph', 'insertText'],
    'and the line between the title and the body is a paragraph of its own'
  )
  assert.equal(typed.text(), ['把这个想法做完', '正文一句话'].join(String.fromCharCode(10)), 'all of them, title and body together')
  assert.equal(renames.calls.length, 1, 'and the hand-over names the conversation')
  assert.equal(renames.calls[0].id, 'target', 'the conversation the card was dropped on')
  assert.equal(renames.calls[0].title, '把这个想法做完', 'after the card\'s own title, not the whole of its words')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  resetHitTest()
  fakeDocument.activeElement = body
  tap('j')
  tap('Escape')
})

check('a card only tied to a conversation does not name it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('只是连过来')
  // The card around the band is the gentler claim: the thought belongs to this
  // work, and that is all it says.
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.deepEqual(renames.calls, [], 'a tie is a claim about where a thought belongs, not a name')
  assert.equal(fakeWindow.__dshVim.board().loose[0].link, 'target', 'the tie itself is still made')
  tap('Escape')
})

check('a finished card put away on the band does not name anything', () => {
  boardWithFinishedCard('已经收好的一句')
  assert.deepEqual(renames.calls, [], 'putting a card away is not naming the work')
  tap('Escape')
})

check('escape closes the new-conversation sheet and leaves the board up', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  assert.ok(sheet, 'the sheet is up')
  pressIn(boardSeat(sheet, 'newSessionTitle'), 'Escape')
  assert.equal(boardSeat(boardPanel(), 'newSessionSheet'), null, 'escape drops the sheet')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'without closing the board behind it')
  tap('Escape')
})

checkAsync('the goal plus asks for a title and a body, then starts it in the background', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('fresh')
  tap('j')
  const plus = boardSeat(boardBlock('dsh-vim'), 'goalNewSession')
  assert.ok(plus, 'a goal carries a way to start work, not only a shelf for it')
  assert.equal(plus.__attrs['title'], expectedLabel('boardNewSessionHint'), 'the mark says what it does')
  clickThrough(plus)
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  assert.ok(sheet, 'a press opens the sheet rather than writing anything')
  const title = boardSeat(sheet, 'newSessionTitle')
  const body = boardSeat(sheet, 'newSessionBody')
  assert.ok(title && body, 'with a title and a body to write')
  typeIn(title, '把登录改完')
  typeIn(body, '先看错误提示')
  const typed = recordTyping()
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], "the conversation is made in the goal's own workspace")
  assert.equal(newSessions.prompts.length, 0, "nothing is sent on the reader's behalf")
  assert.equal(typed.commands.length, 0, 'nothing is typed into a box that is not on screen')
  assert.deepEqual(opened, [], 'and no conversation is opened by the request')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board is where the reader still stands')
  assert.equal(Boolean(boardSeat(boardPanel(), 'newSessionSheet')), false, 'the sheet is done and gone')
  assert.deepEqual(handoffQueues().fresh, ['先看错误提示'], 'the body waits as that conversation\'s draft')
  const named = renames.calls.find((call) => call.id === 'fresh' && call.title === '把登录改完')
  assert.ok(named, 'the title the reader typed names the conversation')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  assert.equal(boardDoc().placed.fresh, 'w1', 'the conversation is filed under the goal the plus was on')
})

checkAsync('a title on its own stands a conversation up, with nothing said yet', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('quiet')
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  assert.ok(sheet, 'the sheet is up')
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(newSessions.calls, [], 'an empty sheet is not a request')
  assert.ok(boardSeat(boardPanel(), 'newSessionSheet'), 'it stays up instead')
  const typed = recordTyping()
  typeIn(boardSeat(sheet, 'newSessionTitle'), '把登录改完')
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], "the conversation is still made in the goal's workspace")
  assert.equal(newSessions.prompts.length, 0, 'a title with no body has no message to send')
  assert.equal(typed.commands.length, 0, 'and there is nothing to put in the message box either')
  assert.deepEqual(opened, [], 'and the new conversation is not opened either')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board stays where the reader is')
  assert.equal(handoffQueues().quiet, undefined, 'a title alone leaves nothing waiting in a draft')
  assert.equal(renames.calls.filter((call) => call.id === 'quiet' && call.title).length, 1, 'named once, by the title that was written')
  assert.equal(renames.calls.find((call) => call.id === 'quiet').title, '把登录改完', 'the title the reader typed names it')
  assert.equal(boardDoc().placed.quiet, 'w1', 'filed under the goal the plus was on')
})

checkAsync('a conversation the board started is drawn before anything is said in it', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('draft')
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  typeIn(boardSeat(sheet, 'newSessionTitle'), '把登录改完')
  typeIn(boardSeat(sheet, 'newSessionBody'), '先看错误提示')
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  // The host lists a conversation with no turn in it as blank, and the shell
  // hides a blank one unless it is the conversation on screen. The card is the
  // only door this conversation has, so the board has to draw it - while an
  // empty slot of the shell's own, filed nowhere, stays off the canvas.
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) },
    { id: 'draft', displayTitle: '把登录改完', updatedAt: todayAt(0), blank: true },
    { id: 'slot', displayTitle: '', updatedAt: todayAt(0), blank: true },
  ])
  await flush()
  assert.ok(boardCardIds().includes('draft'), 'the conversation just started stands on the board')
  assert.equal(boardCardIds().includes('slot'), false, 'an empty slot the board never filed stays off it')
  const card = cardsIn(boardBlock('dsh-vim')).find((node) => node.__attrs['data-session-id'] === 'draft')
  assert.equal(String(boardSeat(card, 'cardTitle').textContent), '把登录改完', 'under the name it was given')
  tap('Escape')
})

checkAsync('the new-conversation sheet can choose the model the conversation starts on', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  newSessions.results.push('choosy')
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  const row = boardSeat(sheet, 'newSessionModel')
  assert.ok(row, 'the sheet carries a row for the model')
  assert.equal(
    boardSeat(row, 'newSessionModelName').textContent,
    expectedLabel('boardNewSessionModelDefault'),
    'which starts on whatever the host would use'
  )
  clickThrough(row)
  await flush()
  assert.notEqual(modelPickPanel(), null, "a press opens the page's own model window")
  assert.equal(modelPickRows().length, 3, 'with the configured list on it')
  assert.deepEqual(MODEL.calls, [], 'opening it submits nothing')
  tap('Escape')
  assert.equal(modelPickPanel(), null, 'escape takes only the window down')
  assert.ok(boardSeat(boardPanel(), 'newSessionSheet'), 'the sheet is still up behind it')
  clickThrough(row)
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.equal(modelPickPanel(), null, 'confirming takes the window down')
  assert.deepEqual(MODEL.calls, [], 'and still submits nothing: there is no conversation yet')
  const named = boardSeat(boardSeat(boardPanel(), 'newSessionSheet'), 'newSessionModelName')
  assert.equal(named.textContent, 'DeepSeek Reasoner', 'the row now names the model that was chosen')
  const openSheet = boardSeat(boardPanel(), 'newSessionSheet')
  typeIn(boardSeat(openSheet, 'newSessionTitle'), '把登录改完')
  typeIn(boardSeat(openSheet, 'newSessionBody'), '先看错误提示')
  const typed = recordTyping()
  clickThrough(boardSeat(openSheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(
    MODEL.calls,
    [{ provider: 'deepseek', model: 'deepseek-reasoner' }],
    'the chosen model is submitted to the conversation that was made'
  )
  assert.equal(newSessions.prompts.length, 0, "and nothing is sent on the reader's behalf")
  assert.equal(typed.commands.length, 0, 'the body is not typed anywhere while the box is not on screen')
  assert.deepEqual(opened, [], 'the background conversation is not opened')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board stays up')
  assert.deepEqual(handoffQueues().choosy, ['先看错误提示'], 'the body waits as its draft')
  assert.ok(
    renames.calls.some((call) => call.id === 'choosy' && call.title === '把登录改完'),
    'named as before, by the title that was written'
  )
})

checkAsync('a card dropped on the goal plus starts a conversation from its words', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('from-card')
  tap('j')
  writeIdea('把登录改完', '先看错误提示')
  const typed = recordTyping()
  aimAt(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], 'the same workspace the goal names')
  assert.equal(newSessions.prompts.length, 0, 'the card is a draft, not a message')
  assert.equal(typed.commands.length, 0, 'nothing is typed into a box that is not on screen')
  assert.deepEqual(
    handoffQueues()['from-card'],
    [['把登录改完', '先看错误提示'].join(String.fromCharCode(10))],
    'all of the card, title and body together, waiting as that draft'
  )
  assert.deepEqual(opened, [], 'and the new conversation is not opened')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board stays where the card was let go')
  const named = renames.calls.find((call) => call.id === 'from-card' && call.title === '把登录改完')
  assert.ok(named, "and wears the card's own title")
  assert.equal(boardDoc().placed['from-card'], 'w1', 'filed under the goal whose plus took it')
  const receipt = boardDoc().cards[0]
  assert.equal(receipt.done, true, 'the card stays behind as a finished trace')
  assert.equal(receipt.link, 'from-card', 'tied to the conversation it started')
})

checkAsync('a card dropped on the goal name starts a conversation from its words', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('from-name')
  tap('j')
  writeIdea('把登录改完', '先看错误提示')
  const typed = recordTyping()
  // The name is the door, not only the small ＋ at the end of it: a heading is
  // a row a reader aims at, and a card let go on it starts the same work.
  const head = blockHead(boardBlock('dsh-vim'))
  aimAt(boardSeat(boardBlock('dsh-vim'), 'blockName'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  // Read while the hand is still up: letting go takes the light down with it.
  fire('pointermove', { type: 'pointermove', clientX: 300, clientY: 200, preventDefault() {} })
  assert.equal(head.__attrs['data-drop'], 'true', 'the heading says it would take the card')
  fire('pointerup', { type: 'pointerup' })
  resetHitTest()
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], 'the conversation starts in the goal it was let go on')
  assert.equal(typed.commands.length, 0, 'nothing is typed into a box that is not on screen')
  assert.deepEqual(
    handoffQueues()['from-name'],
    [['把登录改完', '先看错误提示'].join(String.fromCharCode(10))],
    'with the whole card as its draft, waiting for it'
  )
  assert.deepEqual(opened, [], 'and nothing is opened')
  assert.equal(boardDoc().placed['from-name'], 'w1', 'filed under that goal')
  tap('Escape')
})

checkAsync('the tray heading has no door: a card let go on it is filed there', async () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('先放着')
  // The tray is where work has no home: starting a conversation there would be
  // starting one nowhere, so its heading answers nothing.
  const tray = boardBlock(expectedLabel('boardInbox'))
  aimAt(boardSeat(tray, 'blockName'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  fire('pointermove', { type: 'pointermove', clientX: 300, clientY: 200, preventDefault() {} })
  assert.equal(blockHead(tray).__attrs['data-drop'], 'false', 'the tray does not offer to start anything')
  fire('pointerup', { type: 'pointerup' })
  resetHitTest()
  await flush()
  assert.deepEqual(newSessions.calls, [], 'no conversation is made')
  assert.equal(toastText(), expectedLabel('boardFiled'), 'the card is simply put away there')
  tap('Escape')
})

check('a finished card is put away by the gesture that put it there', () => {
  const card = boardWithFinishedCard('已经交付过的一句')
  assert.equal(card.done, true, 'the card is finished')
  assert.equal(card.link, 'target', 'and tied to the conversation')
  // The card is put away by the reader's own gesture - let go on the band of the
  // conversation it belongs to - rather than by a later clean-up. 整理 has
  // nothing left to do with it, which is the whole point of the gesture.
  assert.equal(looseCards().length, 0, 'the card leaves the paper as it is let go')
  assert.equal(boardDoc().cards[0].filed, '@done', 'and is put away in that conversation')
  const mark = boardSeat(boardCard('target'), 'cardArchive')
  assert.ok(mark, 'the conversation that took it offers its own list')
  assert.equal(String(boardSeat(mark, 'cardArchiveCount').textContent), '1', 'saying how many it holds')
  assert.equal(toastText(), expectedLabel('boardDoneFiledOne'), 'and the press says where it went')
  tap('Escape')
})

check('整理 leaves a finished card alone: the drop is what puts it away', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  // Written, tied and finished, but never handed over: the gesture that puts a
  // finished card away is letting go of it on the conversation's band, so 整理
  // must not put it away behind the reader's back.
  writeIdea('自己留着的一句')
  aimAt(boardCard('target'))
  pressForDrag(looseCards()[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  // The drop filed the thought under the conversation, so its box is in that
  // column now.
  const column = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const stacked = column.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  const box = boardSeat(stacked, 'cardDoneToggle')
  pressForDrag(box, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  fireOn(box, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardDoc().cards[0].link, 'target', 'the drop tied it to the conversation')
  assert.equal(boardDoc().cards[0].done, true, 'and the box finished it')
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  assert.equal(looseCards().length, 0, 'the card stays where the drop put it')
  assert.equal(boardDoc().cards[0].filed, '', 'and nothing was filed behind the reader')
  assert.equal(boardSeat(boardCard('target'), 'cardArchive'), null, 'so no card offers a list it never got')
  tap('Escape')
})

check('整理 leaves a finished thought nobody is tied to on the paper', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('没人认领的一句')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  // Finished or not, filing is a gesture: a tidy does not put a thought away,
  // so the card is still paper under the hand.
  assert.equal(looseCards().length, 1, 'the thought stays on the paper')
  assert.equal(boardDoc().cards[0].filed, '', 'and is not put away in the inbox')
  assert.equal(boardDoc().cards[0].done, true, 'the done mark it was given stays')
  assert.equal(boardSeat(boardCard('target'), 'cardArchive'), null, 'no card offers a list it never got')
  tap('Escape')
})

check('整理 packs the panels into rows the window can hold, inbox leading', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
    { workspaceId: 'w3', title: 'three', path: '/work/three', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(2) },
    { id: 'c', displayTitle: 'c', updatedAt: todayAt(1) },
  ])
  tap('j')
  // The tray opens at the canvas corner and three goals follow it, in a window
  // whose paper fits two panels: the row wraps rather than running off the
  // window, and every row clears the tallest panel above it by one gap.
  boardBody().clientWidth = 900
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  const state = fakeWindow.__dshVim.board()
  const wide = parseFloat(boardBlock('one').style.width) + 32
  const tray = parseFloat(boardBlock(expectedLabel('boardInbox')).style.width)
  assert.equal(state.places['@inbox'].x, 28, 'the inbox opens the first row')
  assert.equal(state.places['@inbox'].y, 28, 'at the canvas edge')
  assert.equal(state.places.w1.x, 28 + tray + 32, 'the first goal stands one gap to its right')
  assert.equal(state.places.w1.y, 28, 'on the same row')
  assert.equal(state.places.w2.x, 28, 'the second goal starts another row')
  assert.equal(state.places.w2.y, 28 + 500 + 32, 'below the tallest panel of the row above, one gap down')
  assert.equal(state.places.w3.x, 28 + wide, 'the third stands one gap over it')
  assert.equal(state.places.w3.y, state.places.w2.y, 'on the same row')
  tap('Escape')
})

check('a thought stands stepped in under its conversation, on paper that cannot be seen through', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('一句话')
  aimAt(cardsIn(boardBlock('one'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  const panel = boardBlock('one')
  const stack = boardSeat(panel, 'cardStack')
  assert.equal(stack.style.marginLeft, '14px', 'the thoughts are stepped in from the conversation above them')
  const note = stack.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(note.style.width, '100%', 'and fill the step they are given')
  // Every surface hides what is under it: the panel and the conversation card
  // are washes laid on the board's base colour rather than windows onto it.
  assert.ok(String(panel.style.background).indexOf('var(--dshv-board-base') > 0,
    'a panel is solid paper')
  const card = cardsIn(panel)[0]
  assert.ok(String(card.style.background).indexOf('var(--dshv-board-base') > 0,
    'a conversation card is solid paper')
  writeIdea('又一句')
  const free = looseCards()[0]
  assert.ok(String(free.style.background).indexOf('var(--dshv-board-base') > 0,
    'an unowned thought is solid paper too')
  tap('Escape')
})

check('a board opened onto panels that stand on each other repacks itself', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(2) },
  ])
  tap('j')
  // A hand puts one panel down on top of another, which is what a canvas the
  // reader left alone looks like the morning after a goal gained a card.
  pressForDrag(blockHead(boardBlock('two')), 0, 0)
  dragTo(-400, 30)
  resetHitTest()
  const carried = fakeWindow.__dshVim.board()
  const top = carried.places.w1
  assert.ok(carried.places.w2.x < top.x + parseFloat(boardBlock('one').style.width),
    'the panel is carried onto its neighbour and left there')
  tap('Escape')
  tap('j')
  const state = fakeWindow.__dshVim.board()
  const w1 = state.places.w1
  const w2 = state.places.w2
  const wide = parseFloat(boardBlock('one').style.width)
  assert.ok(
    w1.y !== w2.y || Math.abs(w1.x - w2.x) >= wide,
    'the panels are squared up again as the board opens'
  )
  tap('Escape')
})

check('the fit mark scales the whole canvas to the window, and follows a resized one', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const body = boardBody()
  const fit = boardSeat(boardPanel(), 'zoomFit')
  assert.ok(fit, 'the zoom cluster offers the fit mark')
  // A window too small for the paper: the fit is the smaller of the two ratios,
  // less the air the mark keeps around the board.
  body.clientWidth = 600
  body.clientHeight = 400
  fireOn(fit, 'click', { type: 'click' })
  const zoomOf = () => {
    const transform = String(boardStage().style.transform || '')
    const found = /scale\(([^)]+)\)/.exec(transform)
    return found ? parseFloat(found[1]) : 1
  }
  const fitted = zoomOf()
  assert.ok(fitted < 1, 'the canvas is scaled down to fit')
  assert.ok(fitted >= 0.05, 'but never below the floor that would make it nothing')
  assert.equal(
    String(boardSeat(boardPanel(), 'zoomReset').textContent),
    Math.round(fitted * 100) + '%',
    'the readout says the scale the fit chose'
  )
  assert.equal(body.scrollLeft, 0, 'the paper sits at its corner, because all of it is on screen')
  assert.equal(body.scrollTop, 0, 'in both directions')
  // A hand on the zoom takes the scale back: a resized window must not undo a
  // scale the reader chose.
  fireOn(boardSeat(boardPanel(), 'zoomIn'), 'click', { type: 'click' })
  const manual = zoomOf()
  assert.ok(manual > fitted, 'the plus still zooms in')
  body.clientWidth = 1400
  body.clientHeight = 1000
  fire('resize', {})
  assert.equal(zoomOf(), manual, 'a hand-set scale is left alone when the window changes')
  // Asked for again, the fit follows the window from then on.
  fireOn(fit, 'click', { type: 'click' })
  assert.equal(zoomOf(), 1, 'a board that already fits stays at 100%')
  body.clientWidth = 500
  body.clientHeight = 300
  fire('resize', {})
  assert.ok(zoomOf() < 1, 'a fitted canvas re-fits when its window shrinks')
  // Narrower than the old 20% floor: the whole width still has to be inside
  // the window, so the fit keeps going rather than clipping the right-hand
  // panel off screen.
  body.clientWidth = 200
  body.clientHeight = 140
  fire('resize', {})
  assert.ok(zoomOf() < 0.2, 'a window too narrow for a floor still gets the whole canvas')
  tap('Escape')
})

check('the finished list is one line per note, with the two marks it needs', () => {
  boardWithFinishedCard('收进去的一句')
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const list = doneBinList()
  assert.ok(list, 'the card mark opens its list')
  const row = boardSeat(list, 'doneRow')
  assert.ok(row, 'with the note as a line of the list')
  assert.equal(String(boardSeat(row, 'doneTitle').textContent), '收进去的一句', 'saying what it said')
  // A line in this list is already finished, and the list already belongs to one
  // conversation: neither switch nor tie is said here a second time.
  assert.equal(boardSeat(row, 'cardDoneToggle'), null, 'no second finished switch here')
  assert.equal(boardSeat(row, 'cardLinkLabel'), null, 'and its tie is not said twice')
  fireOn(boardSeat(row, 'donePutBack'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardDoc().cards[0].filed, '', 'putting it back takes it out of the list')
  const back = boardSeat(boardBlock('dsh-vim'), 'cardStack').children
    .find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.ok(back, 'and it stands in the conversation\'s column again')
  tap('Escape')
})

check('a finished line opens to its whole note', () => {
  const who = '一条已经收起来的想法'
  boardWithFinishedCard(who)
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const row = () => boardSeat(doneBinList(), 'doneRow')
  assert.equal(String(boardSeat(row(), 'doneTitle').textContent), who, 'the list shows one line of title')
  assert.equal(String(row().__attrs['data-open']), 'undefined', 'folded, it is one line')
  // The whole line opens the note, not only its words: a list is read by
  // pointing at a line.
  fireOn(row(), 'click', { type: 'click', stopPropagation() {} })
  // The fixture writes its words into both rows, so the stored note is the two
  // of them; what is being checked here is that the row shows all of what is
  // stored, not just the line the list folded it to.
  assert.equal(
    String(boardSeat(row(), 'doneFull').textContent),
    noteLines(who, who),
    'and the whole of it when the line is pressed'
  )
  assert.equal(String(row().__attrs['data-open']), 'true', 'the row says it is open')
  fireOn(row(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(String(boardSeat(row(), 'doneTitle').textContent), who, 'pressing it again folds it back')
  tap('Escape')
})

check('a put-away card can be dragged back out of the bin', () => {
  boardWithFinishedCard('拖回来的一句')
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const row = boardSeat(doneBinList(), 'doneRow')
  assert.ok(row, 'the list has the card to drag')
  pressForDrag(row, 40, 40)
  dragTo(560, 320)
  assert.equal(boardDoc().cards[0].filed, '', 'the card leaves the bin')
  assert.equal(looseCards().length, 1, 'and is paper under the hand')
  tap('Escape')
})

check('a card offers its finished list only once it holds something', () => {
  // Written, tied and finished, but never handed over: the list a card offers
  // is for what it holds, and it holds nothing yet.
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  finishedCard('交给它的一句')
  clock.advance(800)
  assert.equal(boardSeat(boardCard('target'), 'cardArchive'), null, 'an empty list is not offered')
  // The reader's own gesture hands the card over, and the offer appears.
  aimAt(boardSeat(boardCard('target'), 'cardEnter'))
  const column = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const trace = column.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  pressForDrag(trace.children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  clock.advance(800)
  const mark = boardSeat(boardCard('target'), 'cardArchive')
  assert.ok(mark, 'and the conversation that was handed that card says so')
  assert.equal(String(boardSeat(mark, 'cardArchiveCount').textContent), '1', 'with how many it holds')
  tap('Escape')
})

check('a card mark opens the list already filtered to that conversation', () => {
  boardWithFinishedCard('只给这一条')
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const list = doneBinList()
  assert.ok(list, 'the mark opens the same list the heading opens')
  const rows = list.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'doneRow')
  assert.equal(rows.length, 1, 'holding what was handed to that conversation')
  const head = boardSeat(boardPanel(), 'doneBinHead')
  // The list stands beside the card it belongs to, so the heading says what the
  // list is and how long it is; whose it is is said by where it is.
  assert.equal(
    String(head.textContent),
    expectedLabel('boardDoneBin') + '1\u00d7',
    'and saying what it is, with how many it holds'
  )
  tap('Escape')
})

check('a goal has a finished strip at its foot, closed and counting', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(2) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(1) },
  ])
  tap('j')
  const bar = boardSeat(boardBlock('one'), 'doneBar')
  assert.ok(bar, 'every goal carries the strip, even before it holds anything')
  assert.equal(String(boardSeat(bar, 'doneCount').textContent), '0', 'and it starts at nothing')
  assert.equal(cardsIn(bar).length, 0, 'closed, it is one line and no cards')
  tapMark(boardSeat(bar, 'doneHead'))
  assert.equal(String(boardSeat(boardBlock('one'), 'doneEmpty').textContent),
    expectedLabel('boardDoneEmpty'), 'opened empty, it says so')
  assert.deepEqual(drawnColumns(boardBlock('one')), ['a', 'b'], 'and the work above has not moved')
  // Close it again: the open strip is a visit's memory, and the checks after
  // this one build their own pages.
  tapMark(boardSeat(boardBlock('one'), 'doneHead'))
  tap('Escape')
})

check('a conversation the shell calls finished stays with the work until the hand moves it', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  setNow(midnight.getTime() + 15 * HOUR)
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['run', 'done'] }])
  statusFeed.put('done', { running: false, completionUnread: true })
  seed([
    { id: 'run', displayTitle: 'running', updatedAt: ago(4) },
    { id: 'done', displayTitle: 'finished', updatedAt: ago(5) },
  ])
  tap('j')
  // Where a card stands is the reader's memory, not a clock's: a turn the
  // shell calls finished is still work on the panel, and it goes down only
  // when the hand puts it there.
  assert.deepEqual(drawnColumns(boardBlock('one')), ['run', 'done'], 'the finished one is still above')
  assert.equal(String(boardSeat(boardBlock('one'), 'doneCount').textContent), '0',
    'nothing was moved into the strip by itself')
  tap('Escape')
  setNow(was)
})

check('a conversation is finished by dragging it down, and comes back by dragging it out', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(0) + 1000 },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(0) },
  ])
  tap('j')
  let block = boardBlock('one')
  block.__rect = { top: 60, left: 0, width: 920, height: 900, right: 920, bottom: 960 }
  const columns = boardSeat(block, 'blockColumns').children
  columns.forEach((column, at) => {
    column.__rect = { top: 120, left: at * 292, width: 280, height: 300, right: at * 292 + 280, bottom: 420 }
  })
  const bar = boardSeat(block, 'doneBar')
  bar.__rect = { top: 700, left: 0, width: 900, height: 40, right: 900, bottom: 740 }
  aimAt(bar)
  pressForDrag(cardsIn(columns[0])[0], 100, 200)
  dragTo(400, 720)
  assert.ok(Number(boardDoc().done.a) > 0, 'the drop writes the finish down')
  assert.deepEqual(drawnColumns(boardBlock('one')), ['b'], 'the card leaves the work above')
  assert.equal(String(boardSeat(boardBlock('one'), 'doneCount').textContent), '1', 'and the strip counts it')
  tapMark(boardSeat(boardBlock('one'), 'doneHead'))
  block = boardBlock('one')
  assert.deepEqual(cardsIn(block).map((card) => String(card.__attrs['data-session-id'])),
    ['b', 'a'], 'opened, the strip draws the finished conversation')
  assert.equal(cardStateWords('a'), expectedLabel('statusSettled'),
    'the drop wrote the word as well as the position')
  // Carrying it out of the strip gives the word back.
  const finished = cardsIn(boardSeat(block, 'doneGrid'))[0]
  aimAt(boardSeat(block, 'blockColumns'))
  pressForDrag(finished, 400, 720)
  dragTo(120, 200)
  assert.equal(boardDoc().done.a, undefined, 'the mark is dropped')
  assert.deepEqual(drawnColumns(boardBlock('one')).sort(), ['a', 'b'], 'and the card is back at work')
  assert.equal(cardStateWords('a'), expectedLabel('boardTaskState'), 'and the word is gone with it')
  resetHitTest()
  tap('Escape')
})

check('a conversation that comes alive again leaves the strip by itself', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(0) + 1000 }])
  tap('j')
  // Put it down by hand first, so the check starts from a strip that holds it.
  const block = boardBlock('one')
  block.__rect = { top: 60, left: 0, width: 920, height: 900, right: 920, bottom: 960 }
  const column = boardSeat(block, 'blockColumns').children[0]
  column.__rect = { top: 120, left: 0, width: 280, height: 300, right: 280, bottom: 420 }
  const bar = boardSeat(block, 'doneBar')
  bar.__rect = { top: 700, left: 0, width: 900, height: 40, right: 900, bottom: 740 }
  aimAt(bar)
  pressForDrag(cardsIn(column)[0], 100, 200)
  dragTo(400, 720)
  assert.equal(String(boardSeat(boardBlock('one'), 'doneCount').textContent), '1', 'it is in the strip')
  tap('Escape')
  // Re-enabled in the shell: a turn starts, and the mark was about the turn
  // before it. The conversation comes back up without a press.
  statusFeed.put('a', { running: true })
  seed([{ id: 'a', displayTitle: 'a', updatedAt: now + HOUR }])
  tap('j')
  assert.equal(String(boardSeat(boardBlock('one'), 'doneCount').textContent), '0',
    'the strip let it go the moment it was alive again')
  assert.deepEqual(drawnColumns(boardBlock('one')), ['a'], 'and it stands with the work')
  resetHitTest()
  tap('Escape')
})

check('a card is two columns: the work on the left, six marks on the right', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const card = cardOf('a')
  assert.ok(card, 'the conversation has a card')
  const rail = boardSeat(card, 'cardRail')
  assert.ok(rail, 'the marks stand in a rail on its right edge')
  const seats = rail.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'cardSlot')
  assert.equal(seats.length, 6, 'three rows of two seats, always')
  const holds = (role) => seats.some((seat) => boardSeat(seat, role))
  assert.ok(holds('cardLock'), 'the lock has the first seat')
  assert.ok(holds('cardMenuOpen'), 'the ⋯ the second')
  assert.ok(holds('cardStar'), 'the mark the third')
  assert.ok(holds('cardFork'), 'the branch mark the fourth')
  // The left column is the work: the name, and under it the one thing the card
  // is doing.
  assert.equal(String(boardSeat(card, 'cardTitle').textContent), 'a task', 'the title owns the left')
  assert.equal(boardSeat(card, 'cardTitle').style.WebkitLineClamp, '1', 'and is held to one line')
  const foot = boardSeat(card, 'cardMeta')
  assert.ok(foot, 'the line under the title is the state')
  assert.equal(String(boardSeat(foot, 'cardStateAdd').textContent), expectedLabel('boardTaskState'),
    'which says what the seat is for when the shell has nothing to say')
  assert.equal(boardSeat(foot, 'cardFork'), null, 'the verbs are not on that line any more')
  const main = boardSeat(card, 'cardRail').parentNode.children[0]
  assert.ok(boardSeat(main.children[0], 'cardTitle'), 'the title comes first on the left')
  assert.equal(main.children[1].__attrs['data-role'], 'cardSaid', 'then what the conversation was last told')
  assert.equal(main.children[2].__attrs['data-role'], 'cardMeta', 'and the state line under that')
  tap('Escape')
})

check('a card says what its conversation was last told, under the name', () => {
  seed([{ id: 'said-card', displayTitle: 'a task', updatedAt: todayAt(1) }])
  projections.put('turnOutline', [
    { turn: 0, seq: 1, prompt: '先看看登录', response: '' },
    { turn: 1, seq: 2, prompt: '把重试改成指数退避', response: '' },
  ])
  tap('j')
  const said = boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardSaid')
  assert.ok(said, 'the card keeps a line for the words')
  assert.equal(String(said.textContent), '把重试改成指数退避', 'the newest thing said, not the first')
  assert.equal(said.style.whiteSpace, 'nowrap', 'kept to one line')
  assert.equal(said.style.textOverflow, 'ellipsis', 'and cut where the card ends')
  assert.equal(said.getAttribute('title'), '把重试改成指数退避', 'with the whole line on hover')
  assert.equal(said.style.minHeight, '1.75em',
    'the second line the name used to reserve, so the card does not grow for it')
  tap('Escape')
})

check('a conversation that has said nothing keeps its line and says nothing', () => {
  seed([{ id: 'said-quiet', displayTitle: 'quiet', updatedAt: todayAt(1) }])
  tap('j')
  const said = boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardSaid')
  assert.ok(said, 'the line is drawn whether or not there are words')
  assert.equal(String(said.textContent), '', 'with nothing in it yet')
  assert.equal(said.style.minHeight, '1.75em', 'holding its height, so words do not move the card when they land')
  tap('Escape')
})

check('a completion the reader has opened still says something', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['done'] }])
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: todayAt(2) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('j')
  assert.equal(cardStateWords('done'), expectedLabel('statusDone'), 'the shell says it just finished')
  // The reader opens it. The shell drops the flag the moment the conversation is
  // read, which is the whole reason the board writes the fact down itself.
  statusFeed.put('done', { running: false, completionUnread: false })
  tap('Escape')
  tap('j')
  assert.equal(cardStateWords('done'), expectedLabel('statusFinished'),
    'and after reading it the card says it finished, rather than nothing at all')
  tap('Escape')
})

check('a card with nothing to say offers the two words', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['plain'] }])
  seed([{ id: 'plain', displayTitle: 'plain', updatedAt: todayAt(2) }])
  tap('j')
  assert.equal(boardSeat(cardOf('plain'), 'status'), null, 'the shell has nothing to say about it')
  const add = boardSeat(cardOf('plain'), 'cardStateAdd')
  assert.ok(add, 'so the empty seat is offered')
  assert.equal(String(add.textContent), expectedLabel('boardTaskState'), 'and it says what the seat is for, not a plus')
  fireOn(add, 'click', { type: 'click', stopPropagation() {} })
  const menu = boardSeat(cardOf('plain'), 'verdictMenu')
  assert.ok(menu, 'a press on it opens the two words')
  assert.deepEqual(
    menu.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'verdictPick')
      .map((node) => node.__attrs['data-verdict']),
    ['paused', 'settled'],
    'paused and settled, in that order'
  )
  const paused = menu.children.find((node) => node.__attrs && node.__attrs['data-verdict'] === 'paused')
  fireOn(paused, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(cardStateWords('plain'), expectedLabel('statusPaused'), 'the card wears the word the reader gave it')
  tap('Escape')
  tap('j')
  assert.equal(cardStateWords('plain'), expectedLabel('statusPaused'), 'and it is still there after a round trip')
  tap('Escape')
})

check('a word about an older turn is a word about nothing', () => {
  registry.publish([], [{ workspaceId: 'wv', title: 'verdict-goal', path: '/work/verdict-goal', sessionIds: ['plain'] }])
  seed([{ id: 'plain', displayTitle: 'plain', updatedAt: todayAt(0) }])
  tap('j')
  fireOn(boardSeat(cardOf('plain'), 'cardStateAdd'), 'click', { type: 'click', stopPropagation() {} })
  const settled = boardSeat(cardOf('plain'), 'verdictMenu').children
    .find((node) => node.__attrs && node.__attrs['data-verdict'] === 'settled')
  fireOn(settled, 'click', { type: 'click', stopPropagation() {} })
  // The word and the strip are one decision now: saying "settled" puts the card
  // in today's finished strip, so the chip is read there.
  assert.equal(String(boardSeat(boardBlock('verdict-goal'), 'doneCount').textContent), '1',
    'the word put the card in the finished strip')
  tapMark(boardSeat(boardBlock('verdict-goal'), 'doneHead'))
  assert.equal(cardStateWords('plain'), expectedLabel('statusSettled'), 'settled, as the reader said')
  // The conversation moves: a new turn, a new message. What the reader said was
  // about the turn before that, and the card must not keep claiming it. It comes
  // back out of the strip by itself as well.
  seed([{ id: 'plain', displayTitle: 'plain', updatedAt: now + HOUR }])
  tap('Escape')
  tap('j')
  assert.equal(String(boardSeat(boardBlock('verdict-goal'), 'doneCount').textContent), '0',
    'a new turn takes the card back out of the strip')
  assert.equal(cardStateWords('plain'), expectedLabel('boardTaskState'), 'so the card is back to offering the seat, in words')
  tap('Escape')
})

check('a card the shell is talking about offers no state control', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['run'] }])
  seed([{ id: 'run', displayTitle: 'running', updatedAt: todayAt(2) }])
  statusFeed.put('run', { running: true })
  tap('j')
  assert.equal(cardStateWords('run'), expectedLabel('statusRunning'), 'the turn in flight owns the slot')
  assert.equal(boardSeat(cardOf('run'), 'cardStateAdd'), null, 'and the seat is not offered while it does')
  tap('Escape')
})

check('the tray has a finished strip too', () => {
  seed([{ id: 'loose', displayTitle: 'a loose one', updatedAt: todayAt(0) }])
  tap('j')
  const tray = boardBlock(expectedLabel('boardInbox'))
  assert.ok(tray, 'the conversation with no workspace is in the tray')
  assert.ok(boardSeat(tray, 'doneBar'), 'and the tray has the same finished strip as a goal')
  tapMark(boardSeat(cardOf('loose'), 'cardStateAdd'))
  const settled = boardSeat(cardOf('loose'), 'verdictMenu').children
    .find((node) => node.__attrs && node.__attrs['data-verdict'] === 'settled')
  fireOn(settled, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(String(boardSeat(boardBlock(expectedLabel('boardInbox')), 'doneCount').textContent), '1',
    'the word puts a tray conversation in the tray\'s strip as well')
  tapMark(boardSeat(boardBlock(expectedLabel('boardInbox')), 'doneHead'))
  assert.deepEqual(cardsIn(boardBlock(expectedLabel('boardInbox'))).map((card) => card.__attrs['data-session-id']),
    ['loose'], 'and it is read there')
  tap('Escape')
})

check('a conversation with no goal wears no goal colour', () => {
  // A workspace owns no conversations today, so the one on the board is the
  // tray's: the tray is where work has no home, and a hue would be claiming one.
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: [] }])
  seed([{ id: 'loose', displayTitle: 'nobody filed this', updatedAt: todayAt(3) }])
  tap('j')
  const tray = boardBlock('收件箱')
  assert.ok(tray, 'the conversation is drawn in the tray')
  assert.ok(
    String(tray.style.background).indexOf('linear-gradient(var(--dshv-board-column') === 0,
    'the tray keeps the board\'s own paper: work with no home has no place to wear'
  )
  assert.ok(!tray.style.borderColor, 'and draws no coloured edge')
  tap('Escape')
})

check('two goals wear different colours even when they share a name', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'same', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'same', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(3) },
  ])
  tap('j')
  const dots = boardBlocks().slice(0, 2).map((node) => String(boardSeat(node, 'blockDot').style.background))
  assert.notEqual(dots[0], dots[1], 'two goals are told apart by colour')
  // The colour comes from the place, not from its name: these two are called the
  // same thing and still read apart, which is what a rename cannot undo.
  assert.ok(dots[0].indexOf('hsl(') === 0 && dots[1].indexOf('hsl(') === 0, 'both are hues of their own')
  tap('Escape')
})

check('a note wears the colour of the goal its conversation stands in', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const hueOf = (colour) => {
    const found = /hsl\((\d+)/.exec(String(colour))
    return found ? found[1] : ''
  }
  // A card nobody owns is the amber the board has always drawn.
  writeIdea('没人认领')
  assert.ok(
    String(looseCards()[0].style.background).indexOf('linear-gradient(var(--dshv-board-note') === 0,
    'a note tied to nothing keeps the amber paper'
  )
  // Tied to a conversation, it takes that panel's own hue.
  aimAt(cardsIn(boardBlock('one'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  const tied = boardSeat(boardBlock('one'), 'cardStack').children
    .find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  const dot = String(boardSeat(boardBlocks()[0], 'blockDot').style.background)
  assert.equal(hueOf(tied.style.background), hueOf(dot), 'the paper and the goal dot are one colour')
  assert.equal(hueOf(tied.style.borderLeft), hueOf(dot), 'spine and all')
  tap('Escape')
})

check('a goal keeps the colour it was given when its neighbours come and go', () => {
  // Two ids on the same seat of the wheel: the paint must move one of them, and
  // the moved one has to stay moved. `w1` and `w10` both seed on seat 6.
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w10', title: 'ten', path: '/work/ten', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(3) },
  ])
  tap('j')
  const before = String(boardSeat(boardBlock('ten'), 'blockDot').style.background)
  const doc = boardDoc()
  assert.ok(doc && doc.seats && doc.seats.w1 !== undefined && doc.seats.w10 !== undefined,
    'both seats are written down the first time the places are drawn')
  assert.notEqual(doc.seats.w1, doc.seats.w10, 'and the last one drawn was moved off the taken seat')
  // The neighbour goes away. A seat that lived only in the paint would hand this
  // goal back to its own seed, which is the seat the other one had.
  tap('Escape')
  registry.publish([], [{ workspaceId: 'w10', title: 'ten', path: '/work/ten', sessionIds: ['b'] }])
  tap('j')
  assert.equal(String(boardSeat(boardBlock('ten'), 'blockDot').style.background), before,
    'the colour the reader knows it by is the colour it still wears')
  tap('Escape')
})

check('the dot on a goal opens the wheel, and the colour picked is the one kept', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const dot = boardSeat(boardBlock('one'), 'blockDot')
  fireOn(dot, 'click', { type: 'click' })
  const wheel = boardSeat(boardStage(), 'seatMenu')
  assert.ok(wheel, 'a press on the dot opens the twelve colours')
  assert.equal(wheel.children.length, 12, 'the wheel is the whole of the choice')
  const swatch = wheel.children.find((node) => node.__attrs && node.__attrs['data-seat'] === '7')
  fireOn(swatch, 'click', { type: 'click' })
  // Seat 7 is 216 degrees on the wheel, and the goal wears it everywhere.
  const painted = String(boardSeat(boardBlock('one'), 'blockDot').style.background)
  assert.ok(painted.indexOf('hsl(216') === 0, `the dot takes the seat picked (${painted})`)
  assert.equal(boardDoc().seats.w1, 7, 'the choice is written into the board document')
  assert.equal(boardSeat(boardStage(), 'seatMenu'), null, 'and the wheel puts itself away')
  tap('Escape')
  tap('j')
  assert.ok(String(boardSeat(boardBlock('one'), 'blockDot').style.background).indexOf('hsl(216') === 0,
    'a colour picked by hand outlives the paint it was picked in')
})

check('the pin key puts the conversation on screen onto the board', () => {
  seedCurrent('here')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'nothing is open yet')
  assert.equal(tap('i'), true, 'the pin key belongs to the page')
  assert.equal(toastText(), expectedLabel('pinDone'), 'and the press says what it did')
  // The day turns over: without the mark the board would have let it go.
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(0) - 2 }])
  tap('j')
  assert.deepEqual(boardCardIds(), ['here'], 'a conversation put there by hand outlives the day it moved')
  tap('Escape')
})

check('the pin key says what is missing when nothing is on screen', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('i')
  assert.equal(toastText(), expectedLabel('pinNoSession'), 'a key with nothing to act on says so')
})

check('inside the task window the pin key acts on the selected row', () => {
  seed([
    { id: 'first', displayTitle: 'first', updatedAt: todayAt(4) },
    { id: 'second', displayTitle: 'second', updatedAt: todayAt(3) },
  ])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'the window opens on the newest row')
  assert.equal(tap('i'), true, "the pin key is the window's while the window is up")
  assert.equal(toastText(), expectedLabel('pinDone'))
  tap('Escape')
  // Only the row the cursor stood on was kept.
  seed([{ id: 'first', displayTitle: 'first', updatedAt: todayAt(0) - 2 }])
  tap('j')
  assert.deepEqual(boardCardIds(), ['first'], 'the row the cursor stood on is the one that stayed')
  tap('Escape')
})

check('a session row dragged in from the sidebar lands on the board', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  dragOnto(boardBody(), 'a')
  assert.equal(toastText(), expectedLabel('pinDone'), 'the drop says what the pin key says')
  // The day turns over: the mark the drop set is what keeps the card.
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(0) - 2 }])
  tap('Escape')
  tap('j')
  assert.deepEqual(boardCardIds(), ['a'], 'a dragged-in conversation outlives the day it moved')
  tap('Escape')
})

check('a session dragged in lands under the goal it is let go on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  // The hit test aims at the goal the row is let go on, as a real pointer over
  // that panel would. The node the dragover lights is the node the drop must
  // unlight: the paint that follows rebuilds the stage, so the assertion reads
  // the old node while it is still the one that was marked.
  aimAt(boardBlock('two'))
  dragOnto(boardBody())
  const lit = boardBlock('two')
  assert.equal(lit.__attrs['data-drop'], 'true', 'the goal under the hand says it would take the card')
  dragOnto(boardBody(), 'a')
  assert.equal(lit.__attrs['data-drop'], 'false', 'and the drop takes that line down')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the drop files the conversation under that goal')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and that goal draws it')
  assert.equal(cardsIn(boardBlock('one')).length, 0, 'while the one its workspace implies does not')
  assert.equal(toastText(), expectedLabel('boardMoved'), 'the filing is the more specific claim, so it is the one spoken')
  resetHitTest()
  tap('Escape')
  tap('j')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the filing was written down')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and the next board opens with it there')
  tap('Escape')
})

check('a drag that is not a conversation is refused with a word', () => {
  seed([{ id: 'old', displayTitle: 'old', updatedAt: todayAt(0) - 2 }])
  tap('j')
  // A workspace row carries its own key, which is not a conversation's id:
  // the canvas took the drag, so it answers the refusal itself.
  dragOnto(boardBody(), 'w-not-a-session')
  assert.equal(toastText(), expectedLabel('boardDragUnknown'), 'the refusal is said, not left to the browser')
  assert.deepEqual(fakeWindow.__dshVim.board().starred, [], 'and nothing was kept')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, {}, 'or filed anywhere')
  tap('Escape')
})

check('the goal highlight follows a native drag and leaves with it', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  aimAt(boardBlock('two'))
  // While the hand is over a goal, that goal says it would take the card.
  dragOnto(boardBody())
  assert.equal(
    boardBlock('two').__attrs['data-drop'], 'true',
    'the goal under the hand is the one that would take the card'
  )
  // A leave that crosses out of the canvas takes the line with it; one that
  // merely steps into a panel's children does not.
  fireOn(boardBody(), 'dragleave', {
    type: 'dragleave', relatedTarget: boardBlock('two'), preventDefault() {},
  })
  assert.equal(boardBlock('two').__attrs['data-drop'], 'true', 'stepping into a child keeps the line up')
  fireOn(boardBody(), 'dragleave', { type: 'dragleave', relatedTarget: null })
  assert.equal(boardBlock('two').__attrs['data-drop'], 'false', 'leaving the canvas takes it down')
  // And a drag cancelled anywhere ends the same way: `dragend` travels with the
  // row that started it, so the canvas hears it from the document.
  dragOnto(boardBody())
  assert.equal(boardBlock('two').__attrs['data-drop'], 'true', 'the line is back while the hand is back in')
  fire('dragend', { type: 'dragend' })
  assert.equal(boardBlock('two').__attrs['data-drop'], 'false', 'and a cancelled drag ends with it down')
  resetHitTest()
  tap('Escape')
})

check('a right press on the conversation is the way back to the board', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  // The sidebar keeps its own right presses — the shell answers those with
  // its row menus — so the press is read from the conversation's marked body
  // alone.
  fire('contextmenu', {
    type: 'contextmenu', target: sidebar, clientX: 120, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  assert.equal(fakeWindow.__dshVim.board().open, false, 'a right press on the sidebar is not ours to take')
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  assert.equal(fakeWindow.__dshVim.board().open, true, 'one on the conversation page goes back to the board')
  tap('Escape')
})

check('the three right presses that keep their meaning', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  // One some other handler answered first.
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: true, preventDefault() {},
  })
  // One in the box being typed into: the composer sits inside the
  // conversation's own body, so the marker alone would not spare it.
  const box = el({ tag: 'DIV', editable: true, parent: transcript })
  fire('contextmenu', {
    type: 'contextmenu', target: box, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  box.parentElement = null
  box.parentNode = null
  // One inside a text selection: that press is a copy.
  fakeDocument.getSelection = () => ({
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => ({ getClientRects: () => [{ left: 0, top: 0, right: 2000, bottom: 2000 }] }),
  })
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  fakeDocument.getSelection = undefined
  assert.equal(fakeWindow.__dshVim.board().open, false, 'none of the three opens the board')
  // And the press nothing else claims still is the way back.
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the bare conversation answers it')
  tap('Escape')
})

check('a goal is named from its ⋯ menu, and the name is remembered', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  // The name's own press folds; renaming is one deliberate press further away,
  // behind the ⋯. A double press on the name must open no field: the two
  // presses are two folds, not a host write.
  fireOn(boardSeat(boardBlocks()[0], 'blockName'), 'dblclick', { type: 'dblclick', stopPropagation() {} })
  assert.equal(boardSeat(boardBlocks()[0], 'blockRename'), null, 'a double press on the name opens no field')
  const menu = openGoalMenu(boardBlocks()[0])
  assert.ok(menu, 'the ⋯ opens a menu')
  assert.equal(goalMenuMark(boardBlocks()[0]).getAttribute('aria-expanded'), 'true', 'and the mark says so')
  const rename = boardSeat(menu, 'goalRenameOpen')
  assert.ok(rename, 'rename is one of its verbs')
  fireOn(rename, 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardBlocks()[0], 'blockRename')
  assert.ok(field, 'the heading becomes a field')
  assert.equal(fakeDocument.activeElement, field, 'and it takes the keyboard')
  assert.equal(boardStage().querySelectorAll('[data-role="goalMenu"]').length, 0, 'the menu goes with the choice')
  assert.equal(field.value, 'dsh-vim', 'carrying the name it had')
  typeIn(field, '  把登录改完  ')
  pressIn(field, 'Enter')
  assert.ok(boardBlock('把登录改完'), 'the heading says what the reader called it, trimmed')
  assert.equal(fakeWindow.__dshVim.board().goals.w1, '把登录改完', 'and the name is written down')
  tap('Escape')
  tap('j')
  assert.ok(boardBlock('把登录改完'), 'the next board opens with that name')
  // A name is a thing the reader chose; giving it back is how it is taken off.
  fireOn(boardSeat(openGoalMenu(boardBlocks()[0]), 'goalRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const again = boardSeat(boardBlocks()[0], 'blockRename')
  typeIn(again, '   ')
  pressIn(again, 'Enter')
  assert.ok(boardBlock('dsh-vim'), 'an empty name is the workspace name again')
  assert.deepEqual(fakeWindow.__dshVim.board().goals, {}, 'and nothing is left written down')
  tap('Escape')
})

check('a goal menu is one at a time, and Escape puts it away', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  const menus = () => boardStage().querySelectorAll('[data-role="goalMenu"]').length
  const firstMark = goalMenuMark(boardBlock('one'))
  openGoalMenu(boardBlock('one'))
  assert.equal(menus(), 1, 'the ⋯ opens one menu')
  fireOn(firstMark, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(menus(), 0, 'the same ⋯ puts it away')
  assert.equal(firstMark.getAttribute('aria-expanded'), 'false', 'and the mark goes quiet')
  openGoalMenu(boardBlock('one'))
  openGoalMenu(boardBlock('two'))
  assert.equal(menus(), 1, 'a second goal\'s ⋯ takes the first menu away')
  assert.equal(goalMenuMark(boardBlock('two')).getAttribute('aria-expanded'), 'true', 'and says which menu is open')
  tap('Escape')
  assert.equal(menus(), 0, 'Escape puts the menu away')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'without closing the board')
  tap('Escape')
})

check('a note that says nothing is not kept', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'a blank sheet is not a card yet')
  closeIdeaSheet()
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'closing it empty leaves no paper behind')
  tap('Escape')
})

check('the card being worked on is drawn over the one it overlaps', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('底下一张')
  writeIdea('上面一张')
  const zOf = (i) => parseInt(looseCards()[i].style.zIndex, 10)
  assert.ok(zOf(1) > zOf(0), 'every card has a number, so a stack has an order')
  // Pressing the one underneath is what asks for it to be on top.
  pressForDrag(looseCards()[0], 5, 5)
  fire('pointerup', { type: 'pointerup' })
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.front, state.loose[0].id, 'the pressed card is the front one')
  assert.ok(zOf(0) > zOf(1), 'and it is drawn over the card it was under')
  tap('Escape')
})

check('an idea card is a title and two lines, and the sheet holds the rest', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('只有一行')
  const card = looseCards()[0]
  assert.equal(card.style.width, '280px', 'a card has a fixed width, whatever it says')
  const one = looseCards()[0]
  assert.equal(String(boardSeat(one, 'looseTitle').textContent), '只有一行', 'a single line is the title')
  assert.equal(one.__attrs['data-rows'], '0', 'and the card keeps no body line under it')
  assert.equal(boardSeat(one, 'looseText'), null, 'so nothing is drawn below the heading')
  // A note with a body: two lines of it, and what does not fit fades.
  writeIdea('标题', noteLines('一', '二', '三'))
  const two = looseCards()[1]
  assert.equal(two.__attrs['data-rows'], '2', 'the paper spends two lines on the body')
  assert.equal(two.__attrs['data-clipped'], 'true', 'and fades what it cannot show')
  const closed = parseFloat(two.style.height)
  // A press on the body opens the sheet on that body: the card underneath keeps
  // its shape, and the sheet is the wide seat that shows every line.
  fireOn(boardSeat(two, 'looseText'), 'click', { type: 'click', stopPropagation() {} })
  const bodyField = ideaFocusField('cardText')
  assert.ok(bodyField, 'the press opens the sheet on its body')
  assert.equal(bodyField.value, noteLines('一', '二', '三'), 'holding the body, not the title again')
  assert.equal(fakeDocument.activeElement, bodyField, 'with the caret in the body')
  assert.ok(String(ideaFocusSheet().style.width).includes('720px'), 'the sheet is wider than the card')
  closeIdeaSheet()
  assert.equal(parseFloat(looseCards()[1].style.height), closed, 'the card underneath never grew')
  tap('Escape')
})

check('the title hands the caret to the body in the sheet', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const title = ideaFocusField('cardTitleInput')
  typeIn(title, '一条想法')
  pressIn(title, 'Enter')
  const body = ideaFocusField('cardText')
  assert.ok(body, 'the one press reaches the body')
  assert.equal(fakeDocument.activeElement, body, 'with the caret in it')
  typeIn(body, '正文')
  closeIdeaSheet()
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, noteLines('一条想法', '正文'), 'and both fields kept their words')
  tap('Escape')
})

check('a press beside the sheet closes a blank one and keeps nothing', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'the empty sheet has made no card')
  const host = ideaFocusHost()
  fireOn(host, 'pointerdown', { type: 'pointerdown', target: host, preventDefault() {} })
  assert.equal(ideaFocusOpen(), false, 'a press on the paper beside it closes the sheet')
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'and a blank draft does not survive its own dismissal')
  assert.equal(looseCards().length, 0, 'the page shows no paper')
  tap('Escape')
})

check('a press on the name opens the sheet at the name', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('名字', '内容')
  const titleSeat = boardSeat(looseCards()[0], 'looseTitle')
  pressForDrag(titleSeat, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  clickThrough(titleSeat)
  const moved = ideaFocusField('cardTitleInput')
  assert.ok(moved, 'the sheet is up')
  assert.equal(fakeDocument.activeElement, moved, 'with the caret in the name')
  assert.equal(moved.value, '名字', 'holding the name it had')
  assert.equal(ideaFocusField('cardText').value, '内容', 'and the body beside it')
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, noteLines('名字', '内容'), 'the thought is still written down')
  pressIn(moved, 'Escape')
  assert.equal(ideaFocusOpen(), false, 'Escape closes the sheet')
  tap('Escape')
})

check('the sheet writes through to the card, and Escape keeps the words', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('旧标题', '旧正文')
  openIdeaFocusOn(looseCards()[0], 'body')
  typeIn(ideaFocusField('cardTitleInput'), '新标题')
  typeIn(ideaFocusField('cardText'), '新正文')
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, noteLines('新标题', '新正文'),
    'the card is written as the sheet is typed into')
  tap('Escape')
  assert.equal(ideaFocusOpen(), false, 'Escape puts the sheet away')
  assert.equal(String(boardSeat(looseCards()[0], 'looseTitle').textContent), '新标题', 'the card keeps the new name')
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, noteLines('新标题', '新正文'), 'and the new body')
  tap('Escape')
})

check('the sheet is a draft: cancel leaves no card, and a board key stays in the field', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const title = ideaFocusField('cardTitleInput')
  assert.equal(fakeDocument.activeElement, title, 'the caret starts in the name')
  typeIn(title, '不要这张')
  // The board key is a letter first while the caret is in the sheet, and the
  // page behind it must not answer it either.
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board stays up')
  assert.equal(ideaFocusOpen(), true, 'and the sheet stays up')
  cancelIdeaSheet()
  assert.equal(ideaFocusOpen(), false, 'cancel puts the sheet away')
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'and a cancelled draft leaves no card')
  tap('Escape')
})

check('the done box on the sheet is the done box on the card', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('做完的一句')
  openIdeaFocusOn(looseCards()[0], 'title')
  const box = () => ideaFocusField('cardDoneToggle')
  assert.equal(box().__attrs['aria-pressed'], 'false', 'the card starts open')
  fireOn(box(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, true, 'the card is marked done')
  assert.equal(box().__attrs['aria-pressed'], 'true', 'and the sheet says so')
  assert.equal(ideaFocusOpen(), true, 'the sheet stays open')
  fireOn(box(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, false, 'and the mark can be taken back')
  closeIdeaSheet()
  tap('Escape')
})

check('a double click opens the compose sheet from that point, and leaves the card there', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const stage = boardStage()
  stage.__rect = { top: 0, left: 0, width: 1200, height: 800, right: 1200, bottom: 800 }
  boardPanel().__rect = { top: 50, left: 100, width: 1000, height: 700, right: 1100, bottom: 750 }
  const before = fakeWindow.__dshVim.board().loose.length
  fireOn(boardBody(), 'dblclick', {
    type: 'dblclick',
    target: stage,
    clientX: 300,
    clientY: 200,
    preventDefault() {},
  })
  assert.equal(ideaFocusOpen(), true, 'the double click opens the compose sheet')
  assert.equal(fakeWindow.__dshVim.board().loose.length, before, 'and no card exists while the sheet is a draft')
  const sheet = ideaFocusSheet()
  assert.equal(sheet.__attrs['data-opening'], 'true', 'the sheet starts as a seed at the point')
  assert.ok(String(sheet.style.transform).includes('-300px'), 'its first frame is the point, not the centre')
  clock.advance(400)
  assert.equal(sheet.__attrs['data-opening'], undefined, 'and the short flight lands')
  assert.equal(sheet.style.transform, '', 'leaving the sheet where its flex parent put it')
  typeIn(ideaFocusField('cardTitleInput'), '落在这里')
  closeIdeaSheet()
  const card = fakeWindow.__dshVim.board().loose[0]
  assert.equal(card.x, 300, 'the card lands at the x the double click named')
  assert.equal(card.y, 200, 'and the y')
  assert.equal(String(boardSeat(looseCards()[0], 'looseTitle').textContent), '落在这里', 'with the words written in the sheet')
  tap('Escape')
})

check('a linked thought can be handed over from its sheet', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('发过去', '正文')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  const typed = recordTyping()
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  // The drop left the hand mid-carry, so the card is tapped rather than clicked
  // straight after it: the first click after a drag belongs to that drag.
  tapMark(held)
  assert.ok(ideaFocusOpen(), 'the card opens its sheet')
  assert.equal(
    String(ideaFocusField('ideaFocusMeta').textContent),
    expectedLabel('boardCardLinked') + 'the target',
    'the sheet says which conversation holds the thought'
  )
  fireOn(ideaFocusField('ideaFocusDeliver'), 'click', { type: 'click', stopPropagation() {} })
  // Delivered means queued: the board stays where it is, and the box takes the
  // words the next time that conversation is opened.
  assert.equal(typed.commands.length, 0, 'nothing is pasted while the box is not on screen')
  assert.equal(boardDoc().cards[0].done, true, 'the card is marked delivered')
  assert.equal(ideaFocusOpen(), false, 'the sheet is gone with the hand-over')
  openBoardCard('target')
  assert.equal(typed.commands[0], 'insertText', 'the words are pasted as typing')
  assert.equal(typed.text(), noteLines('发过去', '正文'), 'the whole thought, title and body')
})

check('the board takes an open sheet down with it', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  assert.equal(ideaFocusOpen(), true, 'the sheet is up')
  // The sheet owns the first Escape; the board owns the next one.
  tap('Escape')
  assert.equal(ideaFocusOpen(), false, 'the sheet goes first')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and leaves the board standing')
  // The removed field cannot keep the caret in a real browser; the fake DOM
  // needs to be told the page got it back.
  fakeDocument.activeElement = body
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'the next Escape takes the board')
})

check('the plugin going away takes an open sheet with it', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  // Left open on purpose: `finish` stops the plugin and proves the page is
  // empty, so this is the unmount path that has to remove the scrim by itself.
  assert.equal(ideaFocusOpen(), true, 'the sheet is up when the plugin stops')
})

check('a gesture the window lost does not wedge the board', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('一')
  writeIdea('二')
  // A press whose up never comes - the window lost the pointer to another
  // app. The gesture must end with the focus, not wait for an up that is
  // never coming, or the board would answer no press again.
  pressForDrag(looseCards()[0], 5, 5)
  blurWindow()
  pressForDrag(looseCards()[1], 5, 5)
  fire('pointerup', { type: 'pointerup' })
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.front, state.loose[1].id, 'a press after a lost gesture is answered')
  tap('Escape')
})

check('the drop band is up only while a note is being carried', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  tap('j')
  const band = () => boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter')
  assert.equal(band().style.display, 'none', 'nothing in the air: no band')
  assert.equal(band().style.pointerEvents, 'none', 'and it does not answer the hit test')
  writeIdea('带过去')
  pressForDrag(looseCards()[0], 10, 10)
  fire('pointermove', { type: 'pointermove', clientX: 300, clientY: 200, preventDefault() {} })
  assert.equal(band().style.display, 'flex', 'a carried note puts the band on screen')
  assert.equal(band().style.pointerEvents, 'auto', 'and the band answers the drop')
  fire('pointerup', { type: 'pointerup' })
  assert.equal(band().style.display, 'none', 'letting go takes it away again')
  tap('Escape')
})

check('an idea card can be marked done, and the card last pressed sits on top', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('先记一句')
  writeIdea('再记一句')
  const ids = fakeWindow.__dshVim.board().loose.map((card) => card.id)
  // A press raises the sheet it lands on: a pile is read from the top down.
  pressForDrag(looseCards()[0], 5, 5)
  fire('pointerup', { type: 'pointerup' })
  assert.equal(fakeWindow.__dshVim.board().front, ids[0], 'the card that was pressed is the card in front')
  assert.equal(looseCards()[0].__attrs['data-front'], 'true', 'and says so, so a repaint keeps it there')
  // The done mark is the reader's own word about a thought, not a deletion.
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, true, 'the card is marked done')
  assert.equal(boardSeat(looseCards()[0], 'cardDoneToggle').__attrs['aria-pressed'], 'true', 'and its box says so')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, false, 'and the mark can be taken back')
  tap('Escape')
})

check('a conversation card is moved into the goal it is let go on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  // Aim the hit test at the goal the card is dropped on.
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const state = fakeWindow.__dshVim.board()
  assert.deepEqual(state.placed, { a: 'w2' }, 'the card is filed under the goal it was let go on')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and that goal draws it')
  assert.equal(cardsIn(boardBlock('one')).length, 0, 'while the one it came from does not')
  resetHitTest()
  tap('Escape')
  tap('j')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the filing was written down')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and the next board opens with it there')
  tap('Escape')
})

check('the last card in a goal is not let go on the paper', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const before = fakeWindow.__dshVim.board()
  // The default hit test is a pane of the page, not a goal: the card is let go
  // on the paper. A goal giving up its only conversation would build a second
  // goal of one and empty the first - the same arrangement with one more panel.
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const after = fakeWindow.__dshVim.board()
  assert.deepEqual(after.placed, before.placed, 'nothing is filed')
  assert.deepEqual(after.goals, before.goals, 'and no goal is invented for it')
  assert.equal(cardsIn(boardBlock('one')).length, 1, 'the card stays where it was')
  assert.equal(toastText(), expectedLabel('boardGoalLastCard'), 'and the hand is told why')
  tap('Escape')
})

check('a card let go on the paper gets a goal of its own', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(3) },
  ])
  tap('j')
  // One of two: the goal it leaves keeps a card, so the move leaves two places
  // that both mean something.
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const state = fakeWindow.__dshVim.board()
  assert.deepEqual(Object.keys(state.placed), ['a'], 'the card is filed somewhere')
  const goal = state.placed.a
  assert.notEqual(goal, 'w1', 'and not in the goal it came from')
  assert.equal(cardsIn(boardBlock('one')).length, 1, 'so that goal draws one fewer')
  assert.equal(state.goals[goal], 'one 2', 'the new goal is named after the one it left, numbered')
  assert.equal(cardsIn(boardBlock('one 2')).length, 1, 'and the card stands in it')
  tap('Escape')
})

checkAsync('a rename shows on the card before the shell has answered', async () => {
  seed([{ id: 'task', displayTitle: 'an old name', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardCard('task'), 'cardRename')
  typeIn(field, 'a new name')
  pressIn(field, 'Enter')
  // The host has not answered yet, and the card already wears what was typed:
  // a rename that goes back to the old name for a frame reads as a failed one.
  assert.equal(
    String(boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardTitle').textContent),
    'a new name',
    'the card wears the name the moment Enter is pressed'
  )
  await flush()
  assert.equal(renames.calls.length, 1, 'and the host was asked')
  // The list catches up: the stand-in word and the shell's word are one word.
  seed([{ id: 'task', displayTitle: 'a new name', updatedAt: todayAt(1) }])
  await flush()
  assert.equal(
    String(boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardTitle').textContent),
    'a new name',
    'and the name survives the shell agreeing with it'
  )
  tap('Escape')
})

checkAsync('a refused rename puts the words back in the field', async () => {
  seed([{ id: 'task', displayTitle: 'kept', updatedAt: todayAt(1) }])
  tap('j')
  renames.result = { ok: false, error: { code: 'nope', message: 'no' } }
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardCard('task'), 'cardRename')
  typeIn(field, 'refused name')
  pressIn(field, 'Enter')
  await flush()
  const reopened = boardSeat(boardCard('task'), 'cardRename')
  assert.ok(reopened, 'the field comes back rather than the words going nowhere')
  assert.equal(reopened.value, 'refused name', 'with what was typed still in it')
  // Letting the field go leaves the card called what the shell calls it: a
  // refused rename must not have moved the name anywhere.
  pressIn(reopened, 'Escape')
  assert.equal(
    String(boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardTitle').textContent),
    'kept',
    'and nothing was renamed'
  )
})

checkAsync('a branch is filed in the goal its parent is in', async () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['parent', 'other'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['child'] },
  ])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'other', displayTitle: 'the other', updatedAt: todayAt(4) },
  ])
  tap('j')
  // The parent is pulled out onto the paper, into a goal of its own.
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const home = fakeWindow.__dshVim.board().placed.parent
  assert.ok(home, 'the parent stands in a goal of its own')
  const card = cardsIn(boardBlock('one 2'))[0]
  assert.ok(card, 'and the goal is drawn')
  // A drag swallows the click that follows it; a press that does not move puts
  // the guard back.
  pressForDrag(boardSeat(card, 'cardFork'), 60, 300)
  fire('pointerup', { type: 'pointerup' })
  forks.results.push('child')
  fireOn(boardSeat(card, 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  assert.equal(
    fakeWindow.__dshVim.board().placed.child,
    home,
    'the branch is filed where its parent is, so the line has two ends'
  )
  // The host publishes the child on its own clock.
  seed([
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'other', displayTitle: 'the other', updatedAt: todayAt(4) },
  ])
  await flush()
  assert.equal(cardsIn(boardBlock('one 2')).length, 2, 'and it is drawn beside its parent')
  tap('Escape')
})

check('a completion beats once, not on every repaint', () => {
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: todayAt(2) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('j')
  const card = () => cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(card().__attrs['data-fresh'], 'true', 'the beat is owed, so the first draw plays it')
  assert.equal(card().__attrs['data-unread'], 'true', 'and the quiet ring stays behind')
  // Every repaint rebuilds the card; the beat belongs to the completion, not to
  // the drawing of it. A blank sheet opened and closed is a paint and nothing
  // else, which is exactly the event this check is about.
  fireOn(writeCardButton(), 'click', { type: 'click' })
  closeIdeaSheet()
  assert.equal(card().__attrs['data-fresh'], undefined, 'a repaint does not play it again')
  assert.equal(card().__attrs['data-unread'], 'true', 'the ring is still there')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  closeIdeaSheet()
  assert.equal(card().__attrs['data-fresh'], undefined, 'and it stays played')
  tap('Escape')
})

check('a running card breathes and one waiting on the reader holds still', () => {
  seed([
    { id: 'run', displayTitle: 'in flight', updatedAt: todayAt(2) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: todayAt(3) },
  ])
  statusFeed.put('run', { running: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('j')
  const cards = cardsIn(boardBlock(expectedLabel('boardInbox')))
  const runCard = cards.find((node) => node.__attrs['data-session-id'] === 'run')
  const askCard = cards.find((node) => node.__attrs['data-session-id'] === 'ask')
  assert.equal(runCard.__attrs['data-live'], 'true', 'a turn in flight is live')
  assert.equal(runCard.__attrs['data-waiting'], undefined, 'and it is working')
  assert.equal(runCard.__attrs['data-fresh'], undefined, 'with no completion beat')
  assert.equal(askCard.__attrs['data-live'], 'true', 'a parked turn is still live')
  assert.equal(askCard.__attrs['data-waiting'], 'true', 'but the card is not what is moving')
  tap('Escape')
})

check('a goal gives up its place when its last conversation moves on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(5) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(4) },
    { id: 'c', displayTitle: 'c task', updatedAt: todayAt(3) },
  ])
  tap('j')
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const made = fakeWindow.__dshVim.board().placed.a
  assert.ok(boardBlock('one 2'), 'the card stands in a goal of its own')
  // The card that stood alone is filed somewhere else: nothing is left here.
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one 2'))[0], 60, 300)
  dragTo(600, 300)
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.placed.a, 'w2', 'the card is filed in the goal it was let go on')
  assert.equal(boardBlock('one 2'), null, 'and the goal it emptied is gone')
  assert.equal(state.goals[made], undefined, 'with its name')
  assert.equal(boardDoc().blocks[made], undefined, 'and its place in the document')
  resetHitTest()
  tap('Escape')
})

check('a goal with a written purpose stays when its conversations leave', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(5) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(4) },
    { id: 'c', displayTitle: 'c task', updatedAt: todayAt(3) },
  ])
  tap('j')
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const goal = boardBlock('one 2')
  assert.ok(goal, 'the card stands in a goal of its own')
  // The click that ends a drag is the drag's, not the reader's: a press that does
  // not move is what puts the guard back.
  pressForDrag(boardSeat(goal, 'blockIntentText'), 60, 300)
  fire('pointerup', { type: 'pointerup' })
  fireOn(boardSeat(goal, 'blockIntentText'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardBlock('one 2'), 'blockIntentField')
  assert.ok(field, 'a press on the line opens it as a field')
  typeIn(field, '  把登录改完  ')
  pressIn(field, 'Enter')
  assert.equal(
    String(boardSeat(boardBlock('one 2'), 'blockIntentText').textContent),
    '把登录改完',
    'and what was typed is kept, trimmed'
  )
  // Its only conversation leaves: the place still says what it is for.
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one 2'))[0], 60, 300)
  dragTo(600, 300)
  assert.equal(fakeWindow.__dshVim.board().placed.a, 'w2', 'the card moved')
  assert.ok(boardBlock('one 2'), 'the goal stays, because it says what it is for')
  assert.equal(cardsIn(boardBlock('one 2')).length, 0, 'with nothing in it')
  resetHitTest()
  tap('Escape')
})

check('the toolbar stands a goal, and keeps it only while the board is up', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  fireOn(boardSeat(boardPanel(), 'addGoal'), 'click', { type: 'click' })
  const name = expectedLabel('boardNewGoal')
  assert.ok(boardBlock(name), 'a goal is standing on the canvas')
  const field = boardSeat(boardBlock(name), 'blockIntentField')
  assert.ok(field, 'with its line open for what it is for')
  // A repaint must not take the goal the reader is about to name.
  fireOn(boardSeat(boardPanel(), 'starFilter'), 'click', { type: 'click' })
  assert.ok(boardBlock(name), 'and a repaint leaves it alone')
  // Leaving the line empty is what a goal with nothing said about it is; the
  // board going away is what lets it go.
  boardSeat(boardBlock(name), 'blockIntentField').blur()
  tap('Escape')
  tap('j')
  assert.equal(boardBlock(name), null, 'closing the board lets a goal nobody named go')
  tap('Escape')
})

check('closing a goal gives its conversations back, and the notice can bring it back', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(3) },
  ])
  tap('j')
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  assert.equal(cardsIn(boardBlock('one 2')).length, 1, 'the card stands in a goal of its own')
  pressForDrag(boardSeat(boardBlock('one 2'), 'goalRemove'), 60, 300)
  fire('pointerup', { type: 'pointerup' })
  fireOn(boardSeat(boardBlock('one 2'), 'goalRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardBlock('one 2'), null, 'the goal is closed')
  assert.equal(cardsIn(boardBlock('one')).length, 2, 'and its conversation is back where it came from')
  assert.ok(
    String(toastText()).indexOf(expectedLabel('boardGoalUndo')) >= 0,
    'the notice offers the way back'
  )
  fireOn(toastNode(), 'click', { type: 'click' })
  assert.ok(boardBlock('one 2'), 'and the way back puts the goal back')
  assert.equal(cardsIn(boardBlock('one 2')).length, 1, 'with its conversation')
  tap('Escape')
})

check('a goal is moved by dragging anywhere on it, not only its heading', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const block = boardBlock('one')
  const before = fakeWindow.__dshVim.board().places.w1
  pressForDrag(block, 20, 20)
  dragTo(120, 90)
  const moved = fakeWindow.__dshVim.board().places.w1
  assert.equal(moved.x, before.x + 100, 'the panel moved with the hand')
  assert.equal(moved.y, before.y + 70)
  tap('Escape')
})

check('a press anywhere on an idea card opens its sheet', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('x'.repeat(8))
  // The card is taller than its words, so the paper below the last line is the
  // part a reader actually presses.
  fireOn(looseCards()[0], 'click', { type: 'click', stopPropagation() {} })
  assert.ok(ideaFocusField('cardTitleInput'), 'the sheet opens from the card, not only from its words')
  assert.equal(fakeDocument.activeElement, ideaFocusField('cardTitleInput'), 'and a title-only thought puts the caret in its name')
  pressIn(ideaFocusField('cardTitleInput'), 'Escape')
  assert.equal(ideaFocusOpen(), false, 'Escape closes it')
  tap('Escape')
})

checkAsync('a turn count landing does not take the idea sheet away', async () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const editor = ideaFocusField('cardTitleInput')
  typeIn(editor, '正在写')
  // Every paint asks the host for a turn count, and the answer lands a moment
  // later; that paint used to rebuild the whole stage under the caret.
  clock.advance(2000)
  await flush()
  const still = ideaFocusField('cardTitleInput')
  assert.equal(still, editor, 'the sheet survives the paint the count asked for')
  assert.equal(still.value, '正在写', 'with the sentence still in it')
  assert.equal(fakeDocument.activeElement, still, 'and the caret where the reader left it')
  pressIn(still, 'Escape')
  assert.equal(ideaFocusOpen(), false, 'Escape closes it')
  tap('Escape')
})
