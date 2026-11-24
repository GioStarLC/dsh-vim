import assert from 'node:assert/strict'
import { ctx, fakeWindow, now, clock, composer, button, body, root, editor, fireOn, flush, press, fakeStorage, fakeDocument, aimAt, resetHitTest, feed, registry, renames, statusFeed, forks, opened, makeCtx, loadBundle, tap, expectedLabel, checks, check, checkAsync, step, bumpChecks } from './harness.mjs'
import { seed, HOUR, ago, typeIn, pressIn, toastText, todayAt, boardPanel, boardBlocks, boardBlock, cardsIn, boardCardIds, looseCards, boardDoc, recordTyping, boardSeat, goalMenuMark, openGoalMenu, pressForDrag, dragTo, tapMark, ideaFocusOpen, writeIdea, historyButton, fileANote, seedCurrent, openBoardCard, boardCard, cardNoteBox, cardNoteLine, cardNotePin, cardsUnder, writeCardNote, fileThought, journalLines } from './helpers.mjs'

check("a press on the goal's own name drags the whole goal", () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const block = boardBlock('one')
  const before = fakeWindow.__dshVim.board().places.w1
  pressForDrag(boardSeat(block, 'blockName'), 40, 20)
  dragTo(140, 90)
  const moved = fakeWindow.__dshVim.board().places.w1
  assert.equal(moved.x, before.x + 100, 'the name is part of the handle, not a thing that eats presses')
  assert.equal(moved.y, before.y + 70)
  tap('Escape')
})

check('a press on a card carries the card, never the goal under it', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  const home = fakeWindow.__dshVim.board().places.w1
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  assert.deepEqual(fakeWindow.__dshVim.board().places.w1, home, 'the goal stayed where it was')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the card is what moved')
  resetHitTest()
  tap('Escape')
})

check('a press on a goal name folds the panel, and another brings it back', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const name = () => boardSeat(boardBlock('one'), 'blockName')
  fireOn(name(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, true, 'a press on the name folds the panel')
  assert.equal(cardsIn(boardBlock('one')).length, 0, 'and its conversations go with the fold')
  fireOn(name(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, false, 'another press unfolds it again')
  assert.equal(cardsIn(boardBlock('one')).length, 1, 'and the conversations are back')
  tap('Escape')
})

check("a press inside a field is the field's, not a gesture", () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const before = fakeWindow.__dshVim.board().places.w1
  fireOn(boardSeat(openGoalMenu(boardBlock('one')), 'goalRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  pressForDrag(boardSeat(boardBlocks()[0], 'blockRename'), 10, 10)
  dragTo(200, 200)
  assert.deepEqual(fakeWindow.__dshVim.board().places.w1, before, 'the field kept the press, so the goal stayed')
  tap('Escape')
})

check('a drag on an idea card moves it instead of opening its field', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('先记一句')
  const before = fakeWindow.__dshVim.board().loose[0]
  pressForDrag(looseCards()[0], 10, 10)
  dragTo(210, 110)
  assert.equal(fakeWindow.__dshVim.board().loose[0].x, before.x + 200, 'the card followed the hand')
  assert.equal(boardSeat(looseCards()[0], 'cardTitleInput'), null, 'and no field opened on the way')
  assert.equal(ideaFocusOpen(), false, 'and the sheet did not open either')
  tap('Escape')
})

check('a deleted idea can be taken back, and deleted again', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  writeIdea('标题', '正文')
  assert.equal(fakeWindow.__dshVim.board().history.canUndo, false, 'nothing to take back yet')
  fireOn(boardSeat(looseCards()[0], 'cardMenuOpen'), 'click', { type: 'click', stopPropagation() {} })
  fireOn(boardSeat(boardSeat(looseCards()[0], 'ideaMenu'), 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(looseCards().length, 0, 'the card is gone')
  assert.equal(fakeWindow.__dshVim.board().history.canUndo, true, 'and the board remembers it')
  assert.equal(historyButton('boardUndo').__attrs['aria-disabled'], 'false', 'so the button is live')
  fireOn(historyButton('boardUndo'), 'click', { type: 'click' })
  assert.equal(looseCards().length, 1, 'the card is back')
  assert.equal(String(boardSeat(looseCards()[0], 'looseTitle').textContent), '标题', 'with what it said')
  assert.equal(fakeWindow.__dshVim.board().history.canRedo, true, 'and the delete can be repeated')
  fireOn(historyButton('boardRedo'), 'click', { type: 'click' })
  assert.equal(looseCards().length, 0, 'the redo deletes it again')
  tap('Escape')
})

check('a conversation taken off the board can be taken back', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(boardCardIds(), [], 'the conversation is off the board')
  fireOn(historyButton('boardUndo'), 'click', { type: 'click' })
  assert.deepEqual(boardCardIds(), ['target'], 'and the way back puts it where it was')
  tap('Escape')
})

check('the history buttons say when there is nothing to step to', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  assert.equal(historyButton('boardUndo').__attrs['aria-disabled'], 'true', 'nothing done yet')
  assert.equal(historyButton('boardRedo').__attrs['aria-disabled'], 'true', 'nothing taken back either')
  tap('Escape')
})

check('a conversation in the tray wears the ideas paper', () => {
  seed([
    { id: 'filed', displayTitle: 'filed work', updatedAt: todayAt(3) },
    { id: 'loose', displayTitle: 'nowhere', updatedAt: todayAt(2) },
  ])
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['filed'] }])
  tap('j')
  writeIdea('算个参照')
  const notePaper = looseCards()[0].style.background
  assert.ok(notePaper, 'the idea card has a paper')
  // The conversation that landed in the tray must wear exactly that paper: the
  // card's surface is an inline style, so this is the only place it can be read.
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.ok(card, 'the inbox holds the conversation')
  assert.equal(card.style.background, notePaper, 'and it is the idea paper, not the goal paper')
  assert.equal(card.style.borderLeft, looseCards()[0].style.borderLeft, 'spine and all: the same piece of paper')
  // The same card outside the tray keeps the neutral ink.
  const goalCard = cardsIn(boardBlock('one'))[0]
  assert.notEqual(goalCard.style.background, notePaper, 'a goal keeps its own paper')
  tap('Escape')
})

check('a note put away in an empty tray is still there', () => {
  // The bug this covers: the tray's body used to be drawn only when the inbox
  // held a conversation, so a note filed into an inbox with no sessions had
  // nowhere to be drawn - and simply disappeared.
  seed([{ id: 'filed', displayTitle: 'filed work', updatedAt: todayAt(3) }])
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['filed'] }])
  tap('j')
  writeIdea('一个人待着')
  aimAt(boardBlock(expectedLabel('boardInbox')))
  pressForDrag(looseCards()[0], 60, 300)
  dragTo(600, 300)
  resetHitTest()
  const inbox = boardBlock(expectedLabel('boardInbox'))
  assert.equal(fakeWindow.__dshVim.board().loose[0].filed, '@inbox', 'the note is filed in the tray')
  assert.equal(looseCards().length, 0, 'and is off the paper')
  const row = boardSeat(inbox, 'inboxNote')
  assert.ok(row, 'the empty tray still draws it')
  assert.equal(String(boardSeat(row, 'inboxNoteText').textContent), '一个人待着', 'with its words')
  tap('Escape')
})

check('the tray holds both kinds, and names its two sections', () => {
  fileANote('先问一句')
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.loose[0].filed, '@inbox', 'the note is put away in the tray')
  assert.equal(looseCards().length, 0, 'and is no longer a card on the paper')
  // A second note stays on the canvas, so the tray's paper can be compared
  // against what an idea card actually wears.
  writeIdea('留在纸面上的参照')
  const paper = looseCards()[0]
  const inbox = boardBlock(expectedLabel('boardInbox'))
  const row = boardSeat(inbox, 'inboxNote')
  assert.equal(boardSeat(inbox, 'inboxBody').className, 'dshv-tray', 'the tray body is one material, for the stylesheet to ink')
  // The panel is a panel: the paper belongs to the notes in it, not to the box.
  assert.notEqual(inbox.style.background, paper.style.background,
    'the tray panel keeps the neutral container ink')
  assert.ok(row, 'the tray draws it as a line')
  // This is the whole of what the reader asked for: an idea in the tray wears
  // the same paper as one left on the canvas, even though its shape is a line.
  assert.equal(row.style.background, paper.style.background, 'the row is the note paper')
  assert.equal(row.style.borderLeft, paper.style.borderLeft, 'spine and all')
  // The regression this covers: taking the sheet's whole style made every row
  // absolutely placed, which piled them all onto one spot.
  assert.equal(row.style.position, undefined, 'a row stays in the list, not absolutely placed')
  assert.equal(String(boardSeat(row, 'inboxNoteText').textContent), '先问一句', 'with its words')
  const words = []
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.__attrs && child.__attrs['data-role'] === 'trayCaption') words.push(String(child.children[0].textContent))
      walk(child)
    }
  }
  walk(inbox)
  assert.deepEqual(
    words,
    [expectedLabel('boardInboxSessions'), expectedLabel('boardInboxNotes')],
    'conversations first, then ideas: the tray says which is which'
  )
  tap('Escape')
})

check('a line of the tray is lifted back out onto the paper', () => {
  fileANote('lift me')
  const row = boardSeat(boardBlock(expectedLabel('boardInbox')), 'inboxNote')
  pressForDrag(row, 100, 300)
  dragTo(400, 420)
  assert.equal(fakeWindow.__dshVim.board().loose[0].filed, '', 'the note is back on the paper')
  assert.equal(looseCards().length, 1, 'and drawn as a card again')
  tap('Escape')
})

check('the tray is not a goal: it has no ⋯ and its name cannot be changed', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const tray = boardBlock(expectedLabel('boardInbox'))
  assert.equal(goalMenuMark(tray), null, 'the tray carries no ⋯')
  fireOn(boardSeat(tray, 'blockName'), 'dblclick', { type: 'dblclick', stopPropagation() {} })
  assert.equal(boardSeat(boardBlocks()[0], 'blockRename'), null, 'no field opens on the tray')
  tap('Escape')
})

check('a card says what it is doing in its material as well as in a word', () => {
  seed([{ id: 'live', displayTitle: 'live', updatedAt: todayAt(2) }])
  statusFeed.put('live', { running: true })
  tap('j')
  const live = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(live.__attrs['data-live'], 'true', 'a turn in flight sets the frame moving')
  // The way in is the card itself now; what is left of the arrow is a drop target
  // for a carried idea card, drawn only while something is being carried.
  const dropZone = boardSeat(live, 'cardEnter')
  assert.ok(String(dropZone.textContent).indexOf('\u21B5') === 0, 'the drop band is drawn, glyph first')
  assert.equal(String(dropZone.textContent), '\u21B5' + expectedLabel('boardCardEnterHint'), 'and it says what letting go does')
  assert.equal(dropZone.__attrs['aria-hidden'], 'true', 'and is not offered as a button')
  assert.ok(boardSeat(live, 'cardFork'), 'with the branch mark beside it')
  tap('Escape')
  statusFeed.put('live', { running: false, completionUnread: true })
  tap('j')
  const done = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(done.__attrs['data-fresh'], 'true', 'a completion not yet looked at gets its own beat')
  tap('Escape')
})

check('a line is typed on the card it belongs to, and the card carries it', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const pin = cardNotePin(boardCard('here'))
  assert.ok(pin, 'a card with no line offers the way in')
  fireOn(pin, 'click', { type: 'click' })
  const box = cardNoteBox(boardCard('here'))
  assert.ok(box, 'the field opens inside the card, not over the page')
  assert.equal(fakeDocument.activeElement, box, 'with the caret already in it')
  assert.equal(fakeWindow.__dshVim.note('here').editing, 'here', 'and the board knows whose line it is')
  typeIn(box, '  换个顺序试试  ')
  pressIn(box, 'Enter')
  assert.equal(cardNoteBox(boardCard('here')), null, 'Enter closes the field')
  assert.equal(fakeWindow.__dshVim.note('here').line, '换个顺序试试', 'keeping the line, trimmed')
  assert.equal(String(cardNoteLine(boardCard('here')).textContent), '换个顺序试试', 'and the card now carries it')
  tap('Escape')
})

check('pressing the line edits it, and an empty line takes it away', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  writeCardNote('here', 'first')
  pressIn(cardNoteBox(boardCard('here')), 'Enter')
  fireOn(cardNoteLine(boardCard('here')), 'click', { type: 'click' })
  const box = cardNoteBox(boardCard('here'))
  assert.equal(box.value, 'first', 'the field opens on the line it already carries')
  typeIn(box, '   ')
  pressIn(box, 'Enter')
  assert.equal(fakeWindow.__dshVim.note('here').line, '', 'an empty line is how a note is taken away')
  assert.equal(cardNoteLine(boardCard('here')), null, 'and the card carries nothing')
  assert.ok(cardNotePin(boardCard('here')), 'with the way in back')
  tap('Escape')
})

check('Escape drops the line without writing it down', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const box = writeCardNote('here', 'discarded')
  pressIn(box, 'Escape')
  assert.equal(cardNoteBox(boardCard('here')), null, 'Escape closes the field')
  assert.equal(fakeWindow.__dshVim.note('here').line, '', 'and files nothing')
  tap('Escape')
})

check('a press elsewhere keeps what was typed', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const box = writeCardNote('here', 'looked away')
  // A press outside a real input moves the focus, and the browser reports the
  // blur; the harness delivers that one event.
  fireOn(box, 'blur', { type: 'blur' })
  assert.equal(cardNoteBox(boardCard('here')), null, 'the field goes away with the focus')
  assert.equal(fakeWindow.__dshVim.note('here').line, 'looked away', 'but the thought is kept')
  tap('Escape')
})

check('a feed tick does not take the field away mid-sentence', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const box = writeCardNote('here', 'half a thought')
  // A turn starting is exactly the kind of tick that repaints the board.
  statusFeed.put('here', { running: true })
  const still = cardNoteBox(boardCard('here'))
  assert.equal(still, box, 'the field must survive a repaint it did not ask for')
  assert.equal(still.value, 'half a thought', 'with the sentence still in it')
  pressIn(still, 'Escape')
  tap('Escape')
})

check('the note key opens the board on the conversation on screen, field waiting', () => {
  seedCurrent('here')
  assert.equal(tap('n'), true, 'the note key must belong to the plugin on the page')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and it opens the board')
  const box = cardNoteBox(boardCard('here'))
  assert.ok(box, 'with the field already on that card')
  assert.equal(fakeDocument.activeElement, box, 'and the caret in it')
  typeIn(box, 'from the keyboard')
  pressIn(box, 'Enter')
  assert.equal(fakeWindow.__dshVim.note('here').line, 'from the keyboard', 'what is typed lands on that conversation')
  tap('Escape')
})

check('with no conversation on screen the note key says where to go', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('n')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'a board whose field would go nowhere must not open')
  assert.equal(toastText(), expectedLabel('noteNoSession'), 'and the notice must say what is missing')
})

check('the note key is a page key and cannot take one that is already live', () => {
  assert.equal(fakeWindow.__dshVim.update({ noteKey: 'j' }).error, 'conflict', 'the board key is live too')
  assert.equal(fakeWindow.__dshVim.update({ noteKey: 'd' }).error, 'conflict', 'and so is the scroll key')
  assert.equal(fakeWindow.__dshVim.update({ noteKey: 'n' }).noteKey, 'n', 'its own seat is fine')
})

check('the page mounts the same board without a window', () => {
  const root = fakeDocument.createElement('div')
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  assert.equal(fakeWindow.__dshVim.boardPage(root), true, 'the page mounts into the element the host gave it')
  const board = fakeWindow.__dshVim.board()
  assert.equal(board.open, true)
  assert.equal(String(root.children[0].children[0].textContent), expectedLabel('board'), 'the page leads with the board title')
  assert.equal(cardsUnder(root).length, 1, 'and draws the same cards')
  assert.equal(String(root.children[2].textContent), expectedLabel('boardPageHint'), 'with the page footer')
  // A page is not a window: Escape belongs to the shell, and the key that
  // opened the floating board has nothing to put away here.
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'Escape must not close a page')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and neither must a key with no panel to go back to')
  // Editing works the same on the page: same cards, same field.
  const card = cardsUnder(root).find((node) => node.__attrs['data-session-id'] === 'here')
  fireOn(cardNotePin(card), 'click', { type: 'click' })
  const box = cardsUnder(root).map(cardNoteBox).find(Boolean)
  assert.ok(box, 'the page card carries the same field')
  typeIn(box, 'on the page')
  pressIn(box, 'Enter')
  assert.equal(fakeWindow.__dshVim.note('here').line, 'on the page')
  fakeWindow.__dshVim.boardPage(null, false)
  assert.equal(fakeWindow.__dshVim.board().open, false, 'unmounting the page drops the board')
})

check('one board at a time: the page refuses while the window is up', () => {
  const root = fakeDocument.createElement('div')
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  assert.equal(fakeWindow.__dshVim.boardPage(root), false, 'a second mount would fight the first for the feeds')
  assert.equal(root.children.length, 0, 'and it drew nothing')
  tap('Escape')
})

check('the overview counts the day by goal and by conversation', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['busy', 'quiet'] },
    { workspaceId: 'w2', title: 'pele', path: '/work/pele', sessionIds: ['idle'] },
  ])
  seed([
    { id: 'busy', displayTitle: 'the busy one', updatedAt: todayAt(3) },
    { id: 'quiet', displayTitle: 'the quiet one', updatedAt: todayAt(2) },
    // Touched before midnight, nothing since: the board carries it into today,
    // and the day itself did not touch it. The overview must not count it.
    { id: 'idle', displayTitle: 'yesterday only', updatedAt: todayAt(0) - HOUR },
  ])
  tap('j')
  const one = fileThought('busy', 'the first thought')
  assert.ok(one, 'the thought is filed under the busy conversation')
  tapMark(boardSeat(one, 'cardDoneToggle'))
  const two = fileThought('busy', 'the second thought')
  assert.ok(two, 'and a second one under it')
  assert.ok(fileThought('quiet', 'a thought for the quiet one'), 'a third under the other conversation')
  // A thought that never left the paper: it belongs to the day, but to no
  // conversation, and the page has to say both.
  writeIdea('on the paper')
  tapMark(boardSeat(looseCards()[0], 'cardDoneToggle'))
  tap('Escape')

  const day = fakeWindow.__dshVim.overview()
  assert.equal(day.goals, 1, 'one goal was worked in today: the idle one is not')
  assert.equal(day.sessions, 2, 'two conversations were touched or carried a thought')
  assert.equal(day.written, 4, 'four thoughts were written today')
  assert.equal(day.done, 2, 'two of them were dealt with today')
  assert.equal(day.looseWritten, 1, 'one of the written ones never left the paper')
  assert.equal(day.looseDone, 1, 'and that is the loose one that was dealt with')
  const busy = day.rows.find((row) => row.id === 'busy')
  const quiet = day.rows.find((row) => row.id === 'quiet')
  assert.ok(busy && quiet, 'each conversation has a row')
  assert.equal(day.rows.some((row) => row.id === 'idle'), false, 'the yesterday conversation has none')
  assert.equal(busy.title, 'the busy one')
  assert.equal(busy.goal, 'dsh-vim')
  assert.equal(busy.done, 1, 'one thought on it was dealt with today')
  assert.equal(busy.written, 2, 'two were written on it')
  assert.equal(busy.held, 2, 'and it holds both of them')
  assert.equal(busy.open, 1, 'one still wants doing')
  assert.equal(quiet.done, 0, 'the quiet one got nothing done')
  assert.equal(quiet.open, 1)
})

check('the overview page draws the day, and the day says when it is empty', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['busy'] }])
  seed([{ id: 'busy', displayTitle: 'the busy one', updatedAt: todayAt(3) }])
  tap('j')
  const one = fileThought('busy', 'a thought')
  tapMark(boardSeat(one, 'cardDoneToggle'))
  tap('Escape')

  const root = fakeDocument.createElement('div')
  assert.equal(fakeWindow.__dshVim.overview(root), true, 'the page builds into the element it is given')
  assert.equal(root.__attrs['data-role'], 'overviewPage')
  assert.equal(String(boardSeat(root, 'overviewTitle').textContent), expectedLabel('overview'))
  const day = fakeWindow.__dshVim.overview()
  assert.equal(
    String(boardSeat(root, 'overviewDate').textContent),
    day.date + ' · ' + expectedLabel('overviewToday'),
    'the heading says which day it is reading'
  )
  const figures = []
  const collect = (node) => {
    for (const child of node.children || []) {
      if (child.__attrs && child.__attrs['data-role'] === 'overviewFigureValue') figures.push(Number(child.textContent))
      collect(child)
    }
  }
  collect(root)
  assert.deepEqual(figures, [1, 1, 1, 1], 'a goal, a conversation, one done, one written')
  const row = boardSeat(root, 'overviewRow')
  assert.ok(row, 'the conversation has its row')
  assert.equal(String(boardSeat(row, 'overviewName').textContent), 'the busy one')
  assert.equal(String(boardSeat(row, 'overviewGoal').textContent), 'dsh-vim')
  const numbers = []
  const gather = (node) => {
    for (const child of node.children || []) {
      if (child.__attrs && child.__attrs['data-role'] === 'overviewNum') numbers.push(Number(child.textContent))
      gather(child)
    }
  }
  gather(row)
  assert.deepEqual(numbers, [1, 1, 0], 'done today, held, still open')
  assert.ok(boardSeat(root, 'overviewBack'), 'with a way back to the board')
  assert.equal(boardSeat(root, 'overviewEmpty'), null, 'and no empty note over a day that happened')
})

check('an empty day says so rather than drawing a column of zeroes', () => {
  const root = fakeDocument.createElement('div')
  assert.equal(fakeWindow.__dshVim.overview(root), true, 'the page still builds')
  assert.ok(boardSeat(root, 'overviewEmpty'), 'an empty day gets one sentence')
  assert.equal(boardSeat(root, 'overviewTable'), null, 'and no table')
  assert.equal(fakeWindow.__dshVim.overview().sessions, 0, 'the reading agrees')
})

check("the heading's settings sheet carries the switch that names titles", () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const chip = boardSeat(boardPanel(), 'boardSettings')
  assert.ok(chip, 'the heading carries a settings chip')
  assert.equal(chip.__attrs['aria-expanded'], 'false', 'closed until it is pressed')
  assert.equal(String(chip.textContent), expectedLabel('boardSettings'), 'and says what it is')
  fireOn(chip, 'click', { type: 'click', stopPropagation() {} })
  const sheet = boardSeat(boardPanel(), 'boardSettingsMenu')
  assert.ok(sheet, 'one press opens the sheet under it')
  assert.equal(chip.__attrs['aria-expanded'], 'true', 'and the chip says so')
  const row = boardSeat(sheet, 'boardAutoRenameToggle')
  assert.ok(row, 'the first switch is the one about titles')
  assert.equal(row.__attrs['aria-checked'], 'true', 'shipped on')
  fireOn(row, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.settings().autoRename, false, 'pressing it turns the switch off')
  assert.equal(row.__attrs['aria-checked'], 'false', 'and the box empties in place')
  assert.equal(
    JSON.parse(fakeStorage.getItem('dsh-vim/settings/v1')).autoRename,
    false,
    'the choice is written down'
  )
  fireOn(chip, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardSeat(boardPanel(), 'boardSettingsMenu'), null, 'the same chip puts the sheet away')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and the board stays up')
  fireOn(chip, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(
    boardSeat(boardPanel(), 'boardAutoRenameToggle').__attrs['aria-checked'],
    'false',
    'reopened, the box still reads what was chosen'
  )
  tap('Escape')
  assert.equal(boardSeat(boardPanel(), 'boardSettingsMenu'), null, 'escape puts the sheet away first')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'before it puts the board away')
  fakeWindow.__dshVim.update({ autoRename: true })
  tap('Escape')
})

checkAsync('with the switch off, a hand-over lands the words and leaves the title alone', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  fakeWindow.__dshVim.update({ autoRename: false })
  tap('j')
  writeIdea('修个 bug')
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  const typed = recordTyping()
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  openBoardCard('target')
  await flush()
  assert.equal(typed.text(), '修个 bug', 'the words still land in the box')
  assert.deepEqual(renames.calls, [], 'but the board names nothing while the switch is off')
  fakeWindow.__dshVim.update({ autoRename: true })
})

checkAsync('with the switch off, a branch keeps the name the host gave it', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'first'] }])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'first', displayTitle: 'the parent (1)', updatedAt: todayAt(4) },
  ])
  fakeWindow.__dshVim.update({ autoRename: false })
  tap('j')
  forks.results.push('second')
  fireOn(boardSeat(boardCard('parent'), 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  seed([
    { id: 'second', displayTitle: 'the parent (1)', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'first', displayTitle: 'the parent (1)', updatedAt: todayAt(4) },
  ])
  await flush()
  assert.deepEqual(renames.calls, [], 'the branch keeps the name the host gave it')
  assert.ok(boardSeat(boardCard('second'), 'cardDupTag'), 'and the two branches say which of them each is')
  fakeWindow.__dshVim.update({ autoRename: true })
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
  const typed = recordTyping()
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(typed.commands.length, 0, 'the words wait for the box')
  // The reader had already written something in that box: the thought still
  // arrives at the end, after the blank line Markdown puts between two blocks.
  // The fake editor answers through its value, the way a textarea would.
  editor.value = '先写好的'
  composer.value = '先写好的'
  openBoardCard('target')
  editor.value = ''
  composer.value = ''
  assert.equal(typed.commands[0], 'insertParagraph', 'the blank line is typed as the break it stands for')
  assert.equal(
    typed.text(),
    String.fromCharCode(10, 10) + '第二段',
    'after a blank line, and still the card\'s own words'
  )
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
  // A hit is a day, and a day is a canvas: the press opens the page rather than
  // expanding a copy of it inside the panel.
  fireOn(hit, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  await flush()
  assert.ok(boardSeat(boardPanel(), 'historyBanner'), 'and a press on it steps the canvas onto that day')
  assert.equal(fakeWindow.__dshVim.historyToday(), true, 'which the way back leaves in one press')
  fakeWindow.__dshVim.historyPanel(false)
  tap('Escape')
})

step(async () => {
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
  if (fakeWindow.__dshVim) fakeWindow.__dshVim.stop()
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

check('the heading history chip is a way into the day pages', () => {
  seed([{ id: 'seen', displayTitle: 'seen', updatedAt: todayAt(1) }])
  tap('j')
  const chip = historyButton('boardHistory')
  assert.ok(chip, 'the heading carries the history chip')
  fireOn(chip, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.historyPanel(), true, 'pressing it opens the history')
  fakeWindow.__dshVim.historyPanel(false)
  tap('Escape')
})

check('the board and overview pages render with the React the bundle imported', () => {
  // The host calls these components; a module that used `React` without
  // importing it would only fail here, on the page the reader actually opens.
  const mains = ctx.log.slots.main || []
  const icons = ctx.log.slots['sidebar.panellist'] || []
  assert.equal(mains.length >= 2, true, 'the board and the overview are both contributed')
  for (const entry of mains) assert.ok(entry.component({}), 'every main panel renders')
  for (const entry of icons) assert.ok(entry.component({ size: 16 }), 'every sidebar icon renders')
})
