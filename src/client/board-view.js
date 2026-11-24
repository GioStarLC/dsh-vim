/**
 * The canvas as a picture and a form: the repaint, the goal panels with
 * their cards and thoughts, the tray, the done bin, the verdict and stage
 * chips, renaming, the idea sheet, and the paste helpers. Presses are
 * attached through board-hooks; the gesture module owns what they do.
 */
import { NS, BOARD_CARD_MENU_H, BOARD_CARD_W, BOARD_COLUMN_GAP, BOARD_DONE, BOARD_DONE_PREVIEW, BOARD_GOAL_MENU_W, BOARD_INBOX, BOARD_PRUNE_MS, BOARD_ROW_COLUMNS, BOARD_BLOCK_HEAD_H, BOARD_SLOTS, BOARD_SLOP, BOARD_TITLE_SETTLE_MS, BOARD_UNDO_MS, SNAPSHOT_VERSION, VERDICT_KEYS } from './constants.js'
import { BOARD, boardFieldOpen, boardTitleOf, raiseBoardCard } from './board-state.js'
import { BOARD_HISTORY, BOARD_STORE, CARRY, HANDOFF_STORE, NOTE_STORE } from './board-stores.js'
import { BOARD_INK, NOTE_PAPER, BOARD_UI, boardIcon, solidPaper } from './board-css.js'
import { applyBoardZoom, blockInk, blockSeat, boardBlockWidth, boardBlocks, boardCardBox, boardCardOpenBox, boardCardStacked, boardEditorRows, boardExtent, boardJoinText, boardNoteMetrics, boardPanelHeights, boardPanelWidths, boardPlaces, boardRowOf, boardSlots, goalHue, nextCardPlace, noteInkOf, notePaper, noteParts, parkCardOutside, slotHue } from './board-canvas.js'
import { beginBoardNote, cancelBoardNote, cardVerdictOf, commitBoardNote, rememberFork, revealBoardCard } from './board-notes.js'
import { boardDrawLinks, boardOpenSession, boardPress } from './board-hooks.js'
import { paintHistoryPage, maybeShowSeal, noteMoment, pageDoc, pageView, settleDay } from './board-history.js'
import { openNewSessionSheet } from './board-sheet.js'
import { renameSession } from './session-actions.js'
import { refusal } from './errors.js'
import { settings } from './preferences.js'
import { composerRoot, focusComposer, isComposerEditor } from './focus.js'
import { elapsedText, runSince } from './runs.js'
import { reducedMotion } from './scroll.js'
import { conversationPool, currentSession, folderIndex, statusIsLive, statusOf, taskServices } from './sessions.js'
import { paletteText } from './strings.js'
import { TOAST, showToast } from './toast.js'
import { clockDelay, tickClocks } from './task-window.js'
import { dayOf } from './time.js'
import { SAID, drainSaid, peekSaid, promptOf, wantSaidFor } from './turns.js'

function renderBoard() {
  if (!BOARD.open || !BOARD.body || !BOARD.stage) return
  // A repaint mid-gesture would take the panel out from under the pointer,
  // and one mid-tidy would take a card out of the air.
  if (BOARD.drag || BOARD.glide || BOARD.tidy) return
  // A paint must never land on an open field. The rule lives here, once,
  // rather than in each caller: a feed tick, a landed turn count and the
  // plugin's own housekeeping all end up in this function, and every one of
  // them used to be able to rebuild the stage under the caret. What such a
  // paint would have shown is drawn by the paint that closes the field.
  if (boardFieldOpen()) return
  // A page is drawn instead of today, and the branch stands ahead of the
  // filing and the flush: a day being read must not be sealed, and today
  // must not be written through a paint that is not looking at it.
  if (BOARD.historyDate) {
    paintHistoryPage()
    return
  }
  // A new day is filed before anything is drawn: the page left behind belongs
  // to yesterday, and today's starts from the members it carried.
  settleDay()
  // A document a full store refused is offered again here: the store may have
  // room now, and the reader's last press is still the one in hand.
  BOARD_STORE.flush()
  // The paint a press's settle owed is paid the moment a paint lands: from
  // here on the page says what the store says.
  BOARD.paintOwed = false
  // A card being typed into is rebuilt with the rest, so what it says is
  // folded into the store first. Typing also writes on every input, so this
  // is only the last keystroke that had not landed yet.
  if (BOARD.cardEditing && BOARD.cardEditor) {
    BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
  }
  // How tall each panel stood on the paint being taken down. A fresh
  // block is packed against the panels already standing, and the only
  // honest word on how much paper a panel occupies is the height it
  // measured: a goal with a long list of conversations hangs past the
  // grid row it was given, and a neighbour set down on the row below it
  // would land on its cards. A host that reports no boxes — and the
  // first paint of all — answers nothing, and the pitch every panel is
  // planned at stands in (see `boardPanelHeights`).
  var carried = boardPanelHeights()
  var carriedWide = boardPanelWidths()
  BOARD.stage.textContent = ''
  BOARD.nodes = []
  BOARD.looseNodes = Object.create(null)
  BOARD.stacks = []
  BOARD.dropZones = []
  BOARD.lines = []
  BOARD.noteEditor = null
  BOARD.cardEditor = null
  BOARD.clocks = []
  BOARD.folders = folderIndex()
  // Blank rows are asked for here: a conversation the board started has no
  // turn yet, and without it the card the reader just asked for would not be
  // drawn at all (see the blank rule in `boardBlocks`).
  var pool = conversationPool(true)
  // A name the reader sent and the shell has not echoed yet is dropped here,
  // where the list this paint draws is already in hand.
  settleTitles(pool)
  // The order a panel remembers is the one table in the document that grows
  // by itself: one id per conversation ever drawn there. Anything this paint
  // cannot draw has nothing left to sort, and a carried row is still drawn -
  // so the list to keep is the pool plus what came in from the last page.
  if (Date.now() - (BOARD.prunedAt || 0) > BOARD_PRUNE_MS) {
    BOARD.prunedAt = Date.now()
    var kept = []
    for (var keptAt = 0; keptAt < pool.length; keptAt++) kept.push(pool[keptAt].id)
    var brought = CARRY.all()
    for (var broughtId in brought) {
      if (Object.prototype.hasOwnProperty.call(brought, broughtId)) kept.push(broughtId)
    }
    BOARD_STORE.prune(kept)
  }
  var blocks = boardBlocks(pool)
  // What each card was last told is asked for before the cards are built, so
  // a conversation whose words are already known is painted with them rather
  // than growing them a frame later (see `wantSaidFor`). Only the rows this
  // paint draws are asked for: a muted or filed-away conversation has no card
  // to show the answer on.
  var drawn = []
  for (var d = 0; d < blocks.length; d++) drawn = drawn.concat(blocks[d].rows)
  wantSaidFor(drawn)
  var places = boardPlaces(blocks, carried, carriedWide)
  BOARD.blocks = blocks
  BOARD.slots = boardSlots(blocks)
  // After the paint's own assignment, so a place drawn for the first time is
  // already wearing the seat it was just given.
  BOARD.seats = BOARD_STORE.seats()
  BOARD.verdicts = BOARD_STORE.verdicts()
  BOARD.rows = []
  var workspaces = 0
  var i
  for (i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === 'workspace') workspaces = workspaces + 1
    BOARD.rows = BOARD.rows.concat(blocks[i].rows)
  }
  BOARD.inbox = blocks.length ? blocks[blocks.length - 1].rows.slice() : []
  var titles = Object.create(null)
  for (i = 0; i < pool.length; i++) titles[pool[i].id] = boardTitleOf(pool[i])
  BOARD.dupes = boardNameCollisions(titles)
  for (i = 0; i < blocks.length; i++) {
    BOARD.stage.appendChild(buildBoardBlock(blocks[i], places[blocks[i].key], titles))
  }
  // The paper is sized last, because a panel is as tall as the
  // conversations in it and only the painted panels know that height:
  // the boxes are on the page by now, so the tallest of them can be
  // read rather than guessed, and the scrollbars the reader is about to
  // lean on describe the work that is actually there. A host that
  // reports no boxes falls back to the height every panel is planned at.
  var extent = boardExtent(places, boardPanelHeights(), boardPanelWidths())
  BOARD.extent = extent
  applyBoardZoom()
  // The links live under everything else, on one SVG sheet the size of
  // the paper — under by z-index, so it may be appended after the
  // panels it is sized from. A note can be dragged across the canvas
  // without a repaint; only the paths are rewritten.
  BOARD.linkLayer = null
  if (typeof document.createElementNS === 'function') {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('data-role', 'boardLinks')
    svg.setAttribute('width', String(extent.width))
    svg.setAttribute('height', String(extent.height))
    Object.assign(svg.style, BOARD_UI.linkLayer)
    svg.style.width = extent.width + 'px'
    svg.style.height = extent.height + 'px'
    BOARD.stage.appendChild(svg)
    BOARD.linkLayer = svg
  }
  var cards = BOARD_STORE.cards()
  var drawn = 0
  for (i = 0; i < cards.length; i++) {
    // A filed note is drawn where it was filed, not on the paper as well.
    if (cards[i].filed) continue
    // A thought filed under a conversation is drawn in that conversation's
    // column already; drawing it loose as well would be the same card twice.
    if (boardCardStacked(cards[i])) continue
    var note = buildBoardLooseCard(cards[i], titles)
    // Every card has a number, so overlap has an answer: the one being
    // worked on is the one on top (`BOARD.front`), and the rest stack in the
    // order they are drawn rather than by whichever happened to be last.
    if (BOARD.front !== cards[i].id) note.style.zIndex = String(2 + drawn)
    drawn = drawn + 1
    BOARD.stage.appendChild(note)
  }
  if (!BOARD.rows.length && !cards.length) {
    var empty = document.createElement('div')
    Object.assign(empty.style, BOARD_UI.emptyBoard)
    empty.setAttribute('data-role', 'emptyBoard')
    empty.textContent = paletteText('boardEmptyBoard')
    BOARD.stage.appendChild(empty)
  }
  if (BOARD.count) {
    BOARD.count.textContent =
      paletteText('boardTodayCount') + workspaces + paletteText('boardWorkspacesUnit')
      + BOARD.rows.length + paletteText('boardSessionsUnit')
  }
  paintBoardStarFilter()
  paintHistory()
  paintDoneBin()
  maybeShowSeal()
  // The page this paint draws is the one tomorrow reads. Filed under its own
  // date the moment the day turns over, so a day can be spent with the app
  // shut and still be there the next time it opens.
  var drewOn = dayOf(Date.now())
  noteMoment({
    v: SNAPSHOT_VERSION,
    date: drewOn,
    doc: pageDoc(),
    notes: NOTE_STORE.all(),
    view: pageView(blocks, places, titles, cards, drewOn),
  })
  // The fingerprint this repaint leaves behind is what the throttled status
  // repaint reads itself against.
  BOARD.statuses = boardStatusFingerprint()
  if (BOARD.clocks.length) startBoardClock()
  else stopBoardClock()
  // A field this repaint built is the one the reader asked for: the caret
  // goes in it, at the end of what it already carries.
  if (BOARD.noteEditing && BOARD.noteEditor) {
    BOARD.noteEditor.focus()
    if (typeof BOARD.noteEditor.select === 'function') BOARD.noteEditor.select()
  }
  if (BOARD.cardEditing && BOARD.cardEditor) {
    BOARD.cardEditor.focus()
    if (typeof BOARD.cardEditor.setSelectionRange === 'function') {
      // An empty field starts at its first line - that line is the title, and
      // the reader is about to write it.
      var end = String(BOARD.cardEditor.value || '').length
      BOARD.cardEditor.setSelectionRange(0, end)
      if (!end) BOARD.cardEditor.setSelectionRange(0, 0)
    }
  }
  if (BOARD.renamingBlock && BOARD.renameBlockInput) {
    BOARD.renameBlockInput.focus()
    if (typeof BOARD.renameBlockInput.select === 'function') BOARD.renameBlockInput.select()
  }
  if (BOARD.renamingCard && BOARD.renameCardInput) {
    BOARD.renameCardInput.focus()
    if (typeof BOARD.renameCardInput.select === 'function') BOARD.renameCardInput.select()
  }
  if (BOARD.intentBlock && BOARD.intentInput) {
    BOARD.intentInput.focus()
    if (typeof BOARD.intentInput.select === 'function') BOARD.intentInput.select()
  }
  // The beat is owed once per completion, so the ledger keeps only what is
  // still finished and still on the canvas: a conversation that runs again
  // and finishes again gets its beat again.
  var owed = Object.create(null)
  for (var f = 0; f < BOARD.rows.length; f++) {
    if (!BOARD.freshed[BOARD.rows[f].id]) continue
    var rowState = statusOf(BOARD.rows[f])
    if (rowState && rowState.key === 'done') owed[BOARD.rows[f].id] = true
  }
  BOARD.freshed = owed
  // Last, because it measures what was just put on the page.
  boardDrawLinks()
  // The bin's list is the one thing on the board that floats above the
  // canvas rather than lying on it, so it is mounted last and taken down by
  // the next paint that does not want it.
  // A focus sheet is mounted on the panel rather than on this stage, so a
  // paint leaves it standing. If the card it was showing is gone, the sheet
  // goes with it; otherwise its done mark is read from the fresh store.
  if (BOARD.ideaFocusHost) {
    if (BOARD.ideaFocus && !ideaFocusCard(BOARD.ideaFocus)) {
      closeIdeaFocus({ discard: true, paint: false })
    } else {
      paintIdeaFocusDone()
    }
  }
  mountDoneBin(titles)
}

/**
 * The board's reading of every card's status, as one string.
 *
 * Only the status word goes in, not the clock: the minute hand moves by
 * the board's own tick, so folding it in here would make every minute of a
 * long turn read as a change worth a repaint.
 * @returns {string} id:status pairs in draw order, or '' when nothing is drawn.
 */
function boardStatusFingerprint() {
  var out = ''
  for (var i = 0; i < BOARD.rows.length; i++) {
var status = statusOf(BOARD.rows[i])
out += BOARD.rows[i].id + ':' + (status ? status.key : '-') + ';'
  }
  return out
}

/**
 * Repaint the board for a status tick, but only if something on screen
 * actually changed shape.
 *
 * The status feed can tick often while a turn streams, and a repaint is
 * wholesale: the whole board is rebuilt, which costs a hover its state and
 * a column its scroll. A tick where every card keeps the word it had is
 * not a change the reader can see, so it is not a repaint either. The
 * clocks are untouched by this guard — they tick in place whatever the
 * feed is doing.
 * @returns {void}
 */
function renderBoardOnStatus() {
  if (!BOARD.open) return
  // A page does not change under the feed: the days it is made of are the
  // page's own, and a status tick is news about today.
  if (BOARD.historyDate) return
  if (boardStatusFingerprint() === BOARD.statuses) return
  renderBoard()
}

/**
 * Move the running cards' minute hands, in place.
 *
 * The board's twin of `tickClocks`: only the chip's own text is touched,
 * because a clock must never rebuild the board under a hover or a
 * half-finished drag. The card carries no fitted column tracks, so there
 * is nothing to re-fit here — unlike the task window's rows.
 * @returns {void}
 */
function tickBoardClocks() {
  var now = Date.now()
  for (var i = 0; i < BOARD.clocks.length; i++) {
var clock = BOARD.clocks[i]
var elapsed = elapsedText(now - clock.since)
// The same shape the card was built with, so a turn still inside its
// first minute keeps the plain state instead of a dangling separator.
var text = elapsed ? clock.label + ' · ' + elapsed : clock.label
if (clock.chip.textContent === text) continue
clock.chip.textContent = text
clock.chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : clock.label)
  }
}

/**
 * Arm the one timer that watches for midnight.
 *
 * A board left open overnight has to file its page when the day turns over,
 * not on the next repaint - which may be hours later, after the reader has
 * already moved something in the new day. One timeout, set to the next local
 * midnight and re-armed from its own callback.
 * @returns {void}
 */
function startDayTimer() {
  if (BOARD.dayTimer) return
  var next = new Date(Date.now())
  next.setHours(24, 0, 1, 0)
  BOARD.dayTimer = window.setTimeout(function () {
BOARD.dayTimer = 0
if (!BOARD.open) return
// Filing the page is what a new day's board starts from, and that runs
// at the top of a repaint.
renderBoard()
startDayTimer()
  }, Math.max(1000, next.getTime() - Date.now()))
}

/** Stop the midnight timer: the board closed, or the page went away. */
function stopDayTimer() {
  if (!BOARD.dayTimer) return
  window.clearTimeout(BOARD.dayTimer)
  BOARD.dayTimer = 0
}

/** Start the tick that keeps the board's clocks honest. */
function startBoardClock() {
  if (BOARD.clockTimer || !BOARD.clocks.length) return
  BOARD.clockTimer = window.setTimeout(function () {
BOARD.clockTimer = 0
if (!BOARD.open) return
tickBoardClocks()
startBoardClock()
  }, clockDelay(BOARD.clocks))
}

/** Stop the tick: the board closed, or nothing on it is running. */
function stopBoardClock() {
  if (!BOARD.clockTimer) return
  window.clearTimeout(BOARD.clockTimer)
  BOARD.clockTimer = 0
}

/**
 * Paint the "only what is marked" toggle to match the state it stands for.
 *
 * The heading is drawn once, when the window opens; the canvas is what gets
 * repainted. The toggle lives in the heading, so it is repainted here rather
 * than being rebuilt on every pass.
 * @returns {void}
 */
/**
 * Paint the two history buttons to match what the stacks hold.
 *
 * A button that cannot do anything says so by looking as though it cannot:
 * it keeps its place in the row (so the row does not jump when the first
 * delete arrives), loses its weight, and stops answering the pointer.
 * @returns {void}
 */
function paintHistory() {
  var seats = [
[BOARD.undoButton, BOARD_HISTORY.canUndo()],
[BOARD.redoButton, BOARD_HISTORY.canRedo()],
  ]
  for (var i = 0; i < seats.length; i++) {
var button = seats[i][0]
if (!button) continue
var live = seats[i][1] === true
button.setAttribute('aria-disabled', live ? 'false' : 'true')
button.style.opacity = live ? '1' : '0.38'
button.style.pointerEvents = live ? 'auto' : 'none'
  }
}

function paintBoardStarFilter() {
  if (!BOARD.starFilter) return
  Object.assign(BOARD.starFilter.style, BOARD.onlyStarred ? BOARD_UI.starFilterOn : BOARD_UI.starFilter)
}

/**
 * Put one conversation in the finished strip, word and all.
 *
 * The strip and the chip are one decision now: a card sent to today's
 * finished work also says it is finished, and the word is hung on the turn
 * it was said about, so the next turn makes it stale by itself.
 * @param {string} id - session id.
 * @returns {void}
 */
function sendToDone(id) {
  var row = boardRowOf(id)
  BOARD_STORE.markSessionDone(id)
  if (row && Number(row.updatedAt)) {
BOARD_STORE.setVerdict(id, 'settled', Number(row.updatedAt))
  }
  BOARD.verdicts = BOARD_STORE.verdicts()
}

/**
 * Take one conversation back out of the finished strip, word and all.
 *
 * The other half of the same decision: a card that comes back to the work
 * is no longer finished today, and it must not keep wearing the word.
 * @param {string} id - session id.
 * @returns {void}
 */
function bringBackFromDone(id) {
  BOARD_STORE.clearSessionDone(id)
  var held = BOARD_STORE.verdicts()[id]
  if (held && held.key === 'settled') BOARD_STORE.dropVerdict(id)
  BOARD.verdicts = BOARD_STORE.verdicts()
}

/**
 * The twelve colours a goal can wear.
 *
 * The wheel is the whole of the choice: no picker, no hex, twelve seats a
 * dozen goals can share without two of them reading as one place. The seat
 * in use is ringed rather than enlarged, so the wheel never reflows.
 * @param {object} block - the goal the wheel belongs to.
 * @returns {Element} the wheel.
 */
function buildSeatMenu(block) {
  var menu = document.createElement('div')
  Object.assign(menu.style, BOARD_UI.seatMenu)
  menu.className = 'dshv-seat-menu'
  menu.setAttribute('data-role', 'seatMenu')
  // A press inside the wheel is a choice, never a carry of the panel.
  menu.setAttribute('data-no-drag', 'true')
  var here = blockSeat(block)
  for (var seat = 0; seat < BOARD_SLOTS; seat++) {
var swatch = document.createElement('span')
Object.assign(swatch.style, BOARD_UI.seatSwatch)
swatch.style.background = 'hsl(' + slotHue(seat) + ' 62% 55%)'
if (seat === here) Object.assign(swatch.style, BOARD_UI.seatSwatchOn)
swatch.setAttribute('role', 'button')
swatch.setAttribute('data-role', 'seatSwatch')
swatch.setAttribute('data-seat', String(seat))
swatch.setAttribute('aria-label', paletteText('boardGoalSeat'))
swatch.addEventListener('click', pickSeat(block.key, seat))
menu.appendChild(swatch)
  }
  return menu
}

/**
 * One colour, as a press.
 *
 * The choice is written down before the repaint, because the colour is the
 * document's: a plan to repaint first would leave the next paint reading the
 * old seat and drawing the old colour back.
 * @param {string} key - the goal's block id.
 * @param {number} seat - the colour chosen.
 * @returns {Function} the click handler.
 */
function pickSeat(key, seat) {
  return function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
var chosen = Object.create(null)
chosen[key] = seat
BOARD_STORE.setSeats(chosen)
BOARD.seatMenu = ''
renderBoard()
  }
}

/**
 * The verbs on a goal that are not worth a seat of their own.
 *
 * Renaming is the one. It used to be a double press on the heading, which
 * made the heading's ordinary press something else - a fold that had to be
 * taken back when the pair turned out to be a rename. The rare verb belongs
 * behind the ⋯, one press away, with the rest of the board's quiet actions.
 * @param {object} block - the goal.
 * @returns {Element} the menu.
 */
function buildGoalMenu(block) {
  var menu = document.createElement('div')
  // The stock, padding and rows are the conversation card's menu: one menu
  // grammar on the board, whichever thing it belongs to. Only the seat is
  // different - the panel's right edge, not the card's.
  Object.assign(menu.style, BOARD_UI.cardMenu, { top: 'auto', right: 'auto', zIndex: '40' })
  menu.className = 'dshv-goal-menu'
  menu.setAttribute('data-role', 'goalMenu')
  // A press inside the menu is a choice, never a carry of the panel.
  menu.setAttribute('data-no-drag', 'true')
  menu.appendChild(goalMenuItem(paletteText('boardCardRenameHint'), 'goalRenameOpen', function () {
beginBlockRename(block.key)
  }))
  return menu
}

/**
 * One line of that menu.
 * @param {string} label - what it says.
 * @param {string} role - its name for the tests and the pointer.
 * @param {Function} onPick - what it does.
 * @returns {Element} the row.
 */
function goalMenuItem(label, role, onPick) {
  var row = document.createElement('span')
  Object.assign(row.style, BOARD_UI.cardMenuItem)
  row.className = 'dshv-goal-menu-item'
  row.setAttribute('role', 'button')
  row.setAttribute('data-role', role)
  row.textContent = label
  row.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD.goalMenu = ''
// The menu goes where it stands, whatever the verb does next: a refused
// verb that repaints nothing must not leave its own menu on the panel.
if (row.parentNode && typeof row.parentNode.removeChild === 'function') {
  row.parentNode.removeChild(row)
}
onPick()
  })
  return row
}

/**
 * Stand a goal's menu under its ⋯, inside the panel's right edge.
 * @param {Element} menu - the menu, already built.
 * @param {object} block - the goal it belongs to.
 * @param {{x: number, y: number}} place - where the panel stands.
 * @returns {void}
 */
function placeGoalMenu(menu, block, place) {
  menu.style.left = (place.x + Math.max(0, boardBlockWidth(block) - BOARD_GOAL_MENU_W - 10)) + 'px'
  menu.style.top = (place.y + BOARD_BLOCK_HEAD_H - 4) + 'px'
}

function buildBoardBlock(block, place, titles) {
  var node = document.createElement('div')
  Object.assign(node.style, BOARD_UI.block)
  // A panel is a panel, whichever it is: the tray's paper belongs to the
  // notes inside it, not to the box that holds them.
  node.className = 'dshv-block'
  // A place has a colour, and the colour is a wash: the panel is the field
  // the work stands in, so it is tinted rather than painted. The hue is read
  // off the seat the goal was given and written down with it, so this is the
  // same colour tomorrow whatever else is on the canvas.
  var hue = goalHue(block)
  if (hue !== null) {
    // The hue goes over the column's grey, and both go over the base: a
    // panel has to hide the one it stands on, not show it through.
    node.style.background = solidPaper('hsl(' + hue + ' 55% 50% / 0.05)', BOARD_INK.column)
    node.style.borderColor = 'hsl(' + hue + ' 42% 45% / 0.22)'
  }
  node.style.left = place.x + 'px'
  node.style.top = place.y + 'px'
  // A panel is as wide as the columns it holds: two conversations need two
  // columns, and the paper under them follows.
  node.style.width = boardBlockWidth(block) + 'px'
  node.setAttribute('data-role', 'workspaceBlock')
  node.setAttribute('data-block', block.key)
  // The whole panel is the handle: a goal is a place, and a place is grabbed
  // where the eye sees it. Cards inside declare a handle of their own, so the
  // nearest one wins and a press on a card is never a press on the goal.
  node.setAttribute('data-handle', 'goal')
  var folded = BOARD_STORE.isFolded(block.key)

  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.blockHead)
  if (hue !== null) head.style.borderBottomColor = 'hsl(' + hue + ' 40% 45% / 0.20)'
  head.className = 'dshv-panel-head'
  head.setAttribute('data-role', 'blockHead')
  head.setAttribute('title', (block.path ? block.path + ' · ' : '') + paletteText('boardGoalDragHint'))
  var caret = document.createElement('span')
  Object.assign(caret.style, BOARD_UI.blockCaret)
  caret.textContent = folded ? '▸' : '▾'
  // The caret is the fold's explicit switch. A press on the name is the
  // same switch (see below): the caret is small, and a reader who wants a
  // place out of the way aims at its title, not at a mark beside it. The
  // rest of the heading is still the drag handle.
  caret.setAttribute('data-role', 'blockFold')
  caret.setAttribute('role', 'button')
  caret.setAttribute('title', paletteText(folded ? 'boardGoalUnfold' : 'boardGoalFold'))
  caret.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    BOARD_STORE.toggleBlockFold(block.key)
    renderBoard()
  })
  var dot = document.createElement('span')
  Object.assign(dot.style, BOARD_UI.blockDot)
  dot.setAttribute('data-role', 'blockDot')
  dot.style.background = blockInk(block)
  // The dot is the colour, so it is also where the colour is chosen. The
  // tray has no wheel: it is not a goal and wears no hue of its own.
  if (block.kind !== 'inbox') {
    dot.setAttribute('role', 'button')
    dot.setAttribute('data-no-drag', 'true')
    dot.setAttribute('title', paletteText('boardGoalSeatHint'))
    dot.setAttribute('aria-label', paletteText('boardGoalSeat'))
    dot.setAttribute('aria-expanded', BOARD.seatMenu === block.key ? 'true' : 'false')
    dot.style.cursor = 'pointer'
    dot.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      closeGoalMenu()
      BOARD.seatMenu = BOARD.seatMenu === block.key ? '' : block.key
      renderBoard()
    })
  }
  // The goal's name, typed in place from the ⋯ menu. A panel starts as a
  // workspace and usually becomes the thing the reader is working toward,
  // so the name is theirs: clearing it gives the workspace's own name back.
  var name
  if (block.kind !== 'inbox' && BOARD.renamingBlock === block.key) {
    name = document.createElement('input')
    Object.assign(name.style, BOARD_UI.blockRenameBox)
    name.setAttribute('type', 'text')
    name.setAttribute('data-role', 'blockRename')
    name.setAttribute('aria-label', paletteText('boardGoalName'))
    name.setAttribute('placeholder', paletteText('boardGoalPlaceholder'))
    name.value = block.label
    name.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        commitBlockRename()
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        cancelBlockRename()
      }
    })
    name.addEventListener('blur', function () {
      if (BOARD.renamingBlock === block.key && BOARD.renameBlockInput === name) commitBlockRename()
    })
    // A field is the field's: the router reads this and leaves the press
    // alone, so the text in it can be selected with the pointer.
    name.setAttribute('data-no-drag', 'true')
    BOARD.renameBlockInput = name
  } else {
    name = document.createElement('span')
    Object.assign(name.style, BOARD_UI.blockName)
    name.setAttribute('data-role', 'blockName')
    name.setAttribute('title', block.kind === 'inbox'
      ? paletteText('boardInboxHint')
      : paletteText('boardGoalRenameHint'))
    name.textContent = block.label
    // The name is part of the handle: a press on it drags the goal like the
    // rest of the heading, and a press that does not travel folds the panel -
    // the name takes the heading's slack, so the title and the blank after it
    // are the widest target in the row, and a goal being done for now is the
    // common reason to reach for it. Renaming lives behind the ⋯ now, not on
    // a double press: a name field one stray click pair away is not worth the
    // heading's own press having to be taken back. The buttons to the right
    // are targets of their own and never come through here.
    name.addEventListener('dblclick', function (ev) {
      // Two folds are not a new card: the canvas would otherwise drop a
      // thought under the heading on the same double press.
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    })
    name.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      // The tray is a list, not a place the reader put there: its name is
      // the board's own word and has no fold of its own.
      if (block.kind === 'inbox') return
      BOARD_STORE.toggleBlockFold(block.key)
      renderBoard()
    })
  }
  // Only the name: the path is on the heading's tooltip, where a reader who
  // wants it can find it, rather than taking half the line on every panel.
  var count = document.createElement('span')
  Object.assign(count.style, BOARD_UI.blockCount)
  count.setAttribute('data-role', 'blockCount')
  // The tray counts what it holds, both kinds: a folded tray still has to say
  // how much is waiting in it, and a goal counts the conversations it carries.
  // A goal counts what it is showing: the quiet ones are their own line at the
  // foot of the panel, and counting them here would make a heading claim work
  // the columns below it are not carrying.
  var held = block.hot ? block.hot.length : block.rows.length
  if (block.kind === 'inbox') held += BOARD_STORE.filedCards(BOARD_INBOX).length
  count.textContent = String(held)
  head.appendChild(caret)
  head.appendChild(dot)
  head.appendChild(name)
  head.appendChild(count)
  // The second fold: the conversations stay, their thoughts go away. The
  // tray has no such switch - it is a list of what has no place, and a
  // thought put away in it is the whole of what that list says.
  if (block.kind !== 'inbox' && block.rows.length) {
    var ideasHidden = BOARD_STORE.isIdeasHidden(block.key)
    var threads = document.createElement('span')
    Object.assign(threads.style, ideasHidden ? BOARD_UI.blockIdeasOn : BOARD_UI.blockIdeas)
    threads.className = 'dshv-ideas-toggle'
    threads.setAttribute('role', 'button')
    threads.setAttribute('data-role', 'blockIdeas')
    threads.setAttribute('data-hidden', ideasHidden ? 'true' : 'false')
    threads.setAttribute('aria-pressed', ideasHidden ? 'true' : 'false')
    threads.setAttribute('aria-label', paletteText(ideasHidden ? 'boardIdeasShow' : 'boardIdeasHide'))
    threads.setAttribute('title', paletteText(ideasHidden ? 'boardIdeasShow' : 'boardIdeasHide'))
    threads.appendChild(boardIcon(ideasHidden ? 'expand' : 'collapse', 12))
    threads.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      BOARD_STORE.toggleBlockIdeas(block.key)
      renderBoard()
    })
    head.appendChild(threads)
  }
  // A goal is a place work starts, not only a shelf work is put on. The
  // plus is that start; a card dropped on it is the same start with the
  // words already written. The tray has no plus: it is where work has no
  // home, so starting there would be starting nowhere.
  if (block.kind !== 'inbox') {
    var newSession = document.createElement('span')
    Object.assign(newSession.style, BOARD_UI.blockNewSession)
    newSession.className = 'dshv-goal-new'
    newSession.setAttribute('role', 'button')
    newSession.setAttribute('data-role', 'goalNewSession')
    newSession.setAttribute('data-goal-key', block.key)
    newSession.setAttribute('data-no-drag', 'true')
    newSession.setAttribute('aria-label', paletteText('boardNewSession'))
    newSession.setAttribute('title', paletteText('boardNewSessionHint'))
    newSession.textContent = '+'
    newSession.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      openNewSessionSheet(block)
    })
    head.appendChild(newSession)
  }
  // The quiet verbs. Renaming a goal is the one that used to be a double
  // press on its name, and a name line is too direct a place for a field:
  // the ⋯ keeps it one deliberate press away and leaves the name's own
  // press meaning the fold. The menu is drawn on the paper, not in the
  // panel, because a panel clips what leaves it.
  if (block.kind !== 'inbox') {
    var goalMenuMark = document.createElement('span')
    Object.assign(goalMenuMark.style, BOARD_UI.cardMore)
    // The sheet decides when the mark shows and lights: an inline opacity
    // would outrank both rules.
    goalMenuMark.style.opacity = ''
    goalMenuMark.className = 'dshv-goal-more'
    goalMenuMark.setAttribute('role', 'button')
    goalMenuMark.setAttribute('data-role', 'goalMenuOpen')
    goalMenuMark.setAttribute('title', paletteText('boardGoalMenu'))
    goalMenuMark.setAttribute('aria-label', paletteText('boardGoalMenu'))
    goalMenuMark.setAttribute('aria-expanded', BOARD.goalMenu === block.key ? 'true' : 'false')
    goalMenuMark.textContent = '\u22ef'
    goalMenuMark.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      // Opening and closing a menu is not a repaint: the board may be
      // mid-field, and a paint would take the panel out from under the
      // press that asked. The next paint rebuilds it from this state.
      if (BOARD.goalMenu === block.key) {
        closeGoalMenu()
        return
      }
      closeGoalMenu()
      closeIdeaMenu()
      closeSessionMenu()
      closeSeatMenu()
      BOARD.goalMenu = block.key
      goalMenuMark.setAttribute('aria-expanded', 'true')
      var goalMenu = buildGoalMenu(block)
      placeGoalMenu(goalMenu, block, place)
      BOARD.stage.appendChild(goalMenu)
    })
    head.appendChild(goalMenuMark)
  }
  // Closing a place is for the places the reader made. A workspace panel is
  // not theirs to close: it is where its conversations live, and one that is
  // closed comes back the moment a conversation from it moves again.
  if (block.kind === 'user') {
    var kill = document.createElement('span')
    Object.assign(kill.style, BOARD_UI.blockKill)
    kill.className = 'dshv-goal-x'
    kill.setAttribute('role', 'button')
    kill.setAttribute('data-role', 'goalRemove')
    kill.setAttribute('title', paletteText('boardGoalRemove'))
    kill.textContent = '×'
    kill.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      removeBoardGoal(block)
    })
    head.appendChild(kill)
  }
  node.appendChild(head)
  // The wheel stands on the paper rather than inside the panel: a panel
  // clips what leaves it, and a folded one is only a heading tall. It is
  // still the panel's - the press that opened it is on that heading - so it
  // is drawn at the panel's own corner and put away with it.
  if (hue !== null && BOARD.seatMenu === block.key) {
    var wheel = buildSeatMenu(block)
    wheel.style.left = (place.x + 10) + 'px'
    wheel.style.top = (place.y + BOARD_BLOCK_HEAD_H - 4) + 'px'
    BOARD.stage.appendChild(wheel)
  }
  // A paint can land while the ⋯ menu is open - a feed tick, a landed
  // turn count - and the menu belongs to the page, not to the press that
  // happened to open it.
  if (BOARD.goalMenu === block.key) {
    var standingMenu = buildGoalMenu(block)
    placeGoalMenu(standingMenu, block, place)
    BOARD.stage.appendChild(standingMenu)
  }

  // What the goal is for, in the reader's own words.
  //
  // Under the heading, not in it: the heading is the handle the panel is
  // dragged by, and a sentence meant to be clicked cannot also be the thing
  // that picks the panel up. A goal with a line here keeps standing when its
  // last conversation leaves - that is the whole reason the line exists -
  // so the empty state says as much where it is read.
  var purpose = document.createElement('div')
  Object.assign(purpose.style, BOARD_UI.blockIntent)
  purpose.setAttribute('data-role', 'blockIntent')
  purpose.setAttribute('data-no-drag', 'true')
  var mark = document.createElement('span')
  Object.assign(mark.style, BOARD_UI.blockIntentMark)
  mark.textContent = '🎯'
  purpose.appendChild(mark)
  if (BOARD.intentBlock === block.key) {
    var field = document.createElement('input')
    Object.assign(field.style, BOARD_UI.blockIntentBox)
    field.setAttribute('type', 'text')
    field.setAttribute('data-role', 'blockIntentField')
    field.setAttribute('data-no-drag', 'true')
    field.setAttribute('aria-label', paletteText('boardGoalIntent'))
    field.setAttribute('placeholder', paletteText('boardGoalIntentPlaceholder'))
    field.value = block.intent || ''
    field.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        commitGoalIntent()
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        cancelGoalIntent()
      }
    })
    field.addEventListener('blur', function () {
      if (BOARD.intentBlock === block.key && BOARD.intentInput === field) commitGoalIntent()
    })
    BOARD.intentInput = field
    purpose.appendChild(field)
  } else {
    var said = document.createElement('span')
    Object.assign(said.style, block.intent ? BOARD_UI.blockIntentText : BOARD_UI.blockIntentEmpty)
    said.className = 'dshv-intent-text'
    said.setAttribute('data-role', 'blockIntentText')
    said.textContent = block.intent || paletteText('boardGoalIntentPlaceholder')
    said.setAttribute('title', paletteText('boardGoalIntentHint'))
    said.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      beginGoalIntent(block.key)
    })
    purpose.appendChild(said)
  }
  // Where the panel came from, when its name no longer says so. A workspace
  // panel still wearing its workspace's name has nothing to add; one renamed
  // to what the reader is doing there owes the reader the source.
  if (block.kind === 'workspace' && block.path && goalBaseName(block.path) !== block.label) {
    var source = document.createElement('span')
    Object.assign(source.style, BOARD_UI.blockIntentFrom)
    source.setAttribute('data-role', 'blockGoalFrom')
    source.textContent = goalBaseName(block.path)
    source.setAttribute('title', block.path)
    purpose.appendChild(source)
  }
  // The inbox is the place for what no workspace claimed, not a plan of
  // its own: a line saying what it is for would be a line about nothing.
  if (block.kind !== 'inbox') node.appendChild(purpose)

  if (!folded) {
    var body = document.createElement('div')
    Object.assign(body.style, block.kind === 'inbox' ? BOARD_UI.blockBody : BOARD_UI.blockRow)
    body.setAttribute('data-role', 'blockBody')
    if (block.kind === 'inbox') {
      // The tray is not a goal: it holds the conversations that have no home
      // yet *and* the notes that were put away in it, so it has a body of its
      // own rather than the column a goal draws. It is drawn whether or not
      // it holds a conversation - a note put away in an otherwise empty tray
      // is still there, and this body is the only place it is drawn.
      body.appendChild(buildInboxBody(block, titles))
    } else if (!block.rows.length) {
      var empty = document.createElement('div')
      Object.assign(empty.style, BOARD_UI.empty)
      empty.textContent = paletteText('boardEmptyInbox')
      body.appendChild(empty)
    } else {
      body.appendChild(buildBoardColumns(block, titles))
    }
    node.appendChild(body)
    // The reader's own half of the goal, under the agents' work: one row
    // that takes thought cards. The tray has its own body for the same job,
    // so it wears no second one.
    if (block.kind !== 'inbox') node.appendChild(buildGoalLane(block, titles))
    // What the reader finished today, at the very foot of the place it was
    // finished in. The tray has one too: a finished conversation is
    // finished wherever it was waiting, and a strip that existed on every
    // panel but one would be a rule the reader has to remember an exception
    // to.
    node.appendChild(buildDoneBar(block, titles))
  }
  return node
}

/**
 * The conversations of one block, cut into threads.
 *
 * A thread is a conversation and everything forked from it, so the panel
 * reads top to bottom like the work happened: a branch sits under the
 * conversation it came from, joined by a line, and only a root sits at the
 * panel's own margin. Nothing here sorts — the pool already arrived newest
 * first, and a shelf that rearranges itself is a shelf you cannot learn.
 * @param {Array<object>} rows - the block's conversations, newest first.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the list.
 */
/**
 * One named section of the tray: what it holds, and how much of it.
 * @param {string} name - the section's word.
 * @param {number} count - how many it holds.
 * @returns {Element} the caption.
 */
function trayCaption(name, count) {
  var line = document.createElement('div')
  Object.assign(line.style, BOARD_UI.trayCaption)
  line.setAttribute('data-role', 'trayCaption')
  var word = document.createElement('span')
  word.textContent = name
  var many = document.createElement('span')
  Object.assign(many.style, BOARD_UI.trayCount)
  many.textContent = String(count)
  line.appendChild(word)
  line.appendChild(many)
  return line
}

/** A quiet line where a section has nothing in it yet. */
function trayQuiet(text) {
  var line = document.createElement('div')
  Object.assign(line.style, BOARD_UI.trayQuiet)
  line.textContent = text
  return line
}

/**
 * One note, as a line of the tray.
 *
 * The tray is a list, not a surface: what is put away is read in a glance and
 * lifted back out when it is wanted. So a note here is one line - a box, its
 * words, and the two things that are about the line itself (its tie and its
 * delete) - and it becomes paper again the moment it is dragged out.
 * @param {object} card - one of the filed notes.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the row.
 */
function buildTrayNote(card, titles, opts) {
  var row = document.createElement('div')
  // The same paper as a note on the canvas, and the shape of a line. The
  // material comes from NOTE_PAPER - not from `loose`, which also carries the
  // sheet's absolute placement and would stack every row on one spot.
  // A filed note is the same paper as a note on the canvas, and is read in
  // the same ink: one material, one pair of colours.
  var rowInk = noteInkOf(null, card.done)
  Object.assign(row.style, NOTE_PAPER, BOARD_UI.trayRow)
  if (card.done) Object.assign(row.style, BOARD_UI.looseDone)
  row.style.color = rowInk.text
  row.className = 'dshv-tray-row'
  row.setAttribute('data-role', 'inboxNote')
  row.setAttribute('data-card-id', card.id)
  row.setAttribute('data-handle', 'inboxNote')
  if (card.done) row.setAttribute('data-done', 'true')
  if (BOARD.cardEditing === card.id) row.setAttribute('data-editing', 'true')

  var doneToggle = document.createElement('span')
  Object.assign(doneToggle.style, BOARD_UI.cardDoneToggle)
  doneToggle.className = 'dshv-done-toggle'
  doneToggle.setAttribute('role', 'button')
  doneToggle.setAttribute('data-role', 'cardDoneToggle')
  doneToggle.setAttribute('aria-pressed', card.done ? 'true' : 'false')
  doneToggle.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
  doneToggle.setAttribute('data-done', card.done ? 'true' : 'false')
  doneToggle.textContent = card.done ? '\u2713' : ''
  if (card.done) Object.assign(doneToggle.style, BOARD_UI.cardDoneToggleOn)
  doneToggle.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD_STORE.setCardDone(card.id, !card.done)
// A card that stops being finished stops belonging in the bin, and the
// card goes back to the paper rather than staying in a list that would
// then be lying about its own name.
if (card.done && ejectFromDoneBin(card)) return
renderBoard()
  })
  row.appendChild(doneToggle)

  if (BOARD.cardEditing === card.id) {
var editor = document.createElement('input')
Object.assign(editor.style, BOARD_UI.trayEditor)
editor.setAttribute('type', 'text')
editor.setAttribute('data-role', 'cardText')
editor.setAttribute('data-no-drag', 'true')
editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
editor.value = card.text
editor.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    commitBoardCard()
  } else if (ev.key === 'Escape') {
    ev.preventDefault()
    if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
    cancelBoardCard()
  }
})
editor.addEventListener('blur', function () {
  if (BOARD.cardEditing === card.id && BOARD.cardEditor === editor) commitBoardCard()
})
row.appendChild(editor)
BOARD.cardEditor = editor
  } else {
// A row in the finished list is read, not written: one line of title until
// it is pressed, and the whole note when it is. The tray's own rows keep
// their single line and open their field instead - that is a place you
// write in, this is a place you look things up in.
var canOpen = !!(opts && opts.expand)
var showing = canOpen && BOARD.rowOpen === card.id
var head = noteParts(card.text)
var text = document.createElement('span')
Object.assign(text.style, BOARD_UI.trayText)
text.style.color = rowInk.text
if (showing) Object.assign(text.style, BOARD_UI.trayTextOpen)
text.setAttribute('data-role', 'inboxNoteText')
text.setAttribute('title', canOpen ? paletteText('boardCardOpenHint') : card.text)
text.textContent = showing ? card.text : head.title || paletteText('boardCardPlaceholder')
if (!head.title) text.style.opacity = '0.45'
text.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  if (BOARD.dragged) {
    BOARD.dragged = false
    return
  }
  if (!canOpen) {
    openIdeaFocus(card.id, 'title', { origin: ideaFocusOrigin(ev, row) })
    return
  }
  BOARD.rowOpen = showing ? '' : card.id
  renderBoard()
})
row.appendChild(text)
  }

  // Its tie, if it still has one: a word, not a curve. A curve belongs to
  // paper, and this is a line of a list.
  if (card.link) {
var chip = document.createElement('span')
Object.assign(chip.style, BOARD_UI.trayChip)
chip.style.color = rowInk.dim
chip.style.background = 'rgba(0, 0, 0, 0.06)'
chip.setAttribute('data-role', 'cardLinkLabel')
chip.textContent = '\u2192 ' + (titles[card.link] || paletteText('boardCardLinkedUnknown'))
chip.setAttribute('title', chip.textContent)
row.appendChild(chip)
  }

  var actions = document.createElement('span')
  actions.className = 'dshv-note-actions'
  actions.setAttribute('data-role', 'cardActions')
  if (card.link) {
var unlink = document.createElement('span')
Object.assign(unlink.style, BOARD_UI.looseUnlink)
unlink.setAttribute('data-role', 'cardUnlink')
unlink.setAttribute('title', paletteText('boardCardUnlink'))
unlink.textContent = paletteText('boardCardUnlink')
unlink.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  BOARD_STORE.unlinkCard(card.id)
  // No tie means it is no longer a finished thought about a conversation.
  if (ejectFromDoneBin(card)) return
  renderBoard()
})
actions.appendChild(unlink)
  }
  var remove = document.createElement('span')
  Object.assign(remove.style, BOARD_UI.looseRemove)
  remove.setAttribute('data-role', 'cardRemove')
  remove.setAttribute('title', paletteText('boardCardRemove'))
  remove.textContent = '×'
  remove.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
removeLooseCard(card.id)
  })
  actions.appendChild(remove)
  row.appendChild(actions)
  return row
}

/**
 * Ink every conversation inside one node with the tray's paper.
 * @param {Element} node - the list to walk.
 * @returns {void}
 */
function trayInk(node) {
  var kids = node.children || []
  for (var i = 0; i < kids.length; i++) {
var child = kids[i]
if (child.getAttribute && child.getAttribute('data-session-id')) {
  Object.assign(child.style, BOARD_UI.trayCard)
}
trayInk(child)
  }
}

/** Every note put away in the finished-cards bin, newest first. */
function doneBinCards() {
  return BOARD_STORE.filedCards(BOARD_DONE).slice().reverse()
}

/** The put-away notes one conversation was handed, newest first. */
function doneBinCardsOf(sessionId) {
  if (!sessionId) return []
  var all = doneBinCards()
  var mine = []
  for (var i = 0; i < all.length; i++) {
if (all[i].link === sessionId) mine.push(all[i])
  }
  return mine
}

/**
 * Open the bin on one conversation's own put-aways.
 *
 * The mark on a card is the same list filtered to that card: a reader who
 * asks "what did I hand to this one" should not have to find it in a list of
 * everything. Pressing the heading's chip is how the filter is dropped.
 * @param {string} sessionId - the conversation whose mark was pressed.
 * @returns {void}
 */
function openDoneBinFor(sessionId) {
  var same = BOARD.doneBinOpen && BOARD.doneBinFilter === sessionId
  BOARD.doneBinOpen = !same
  BOARD.doneBinFilter = same ? '' : String(sessionId || '')
  renderBoard()
}

/**
 * Say how many cards the bin holds, and what it is doing.
 *
 * Written on every paint rather than by rebuilding the chip: the chip is made
 * once with the heading, and a heading that came back wearing a different
 * word on each status tick would be worse than a count a beat old.
 * @returns {void}
 */
function paintDoneBin() {
  var chip = BOARD.doneBin
  if (!chip) return
  var count = doneBinCards().length
  // A place with nothing in it is not a place yet: the chip is there from
  // the first card onward, and out of the way until then.
  chip.style.display = count ? '' : 'none'
  var label = paletteText('boardDoneBin')
  var text = count ? label + ' \u00b7 ' + count : label
  if (chip.textContent !== text) chip.textContent = text
  Object.assign(chip.style, BOARD.doneBinOpen ? BOARD_UI.doneBinOn : BOARD_UI.doneBin)
  chip.setAttribute('aria-expanded', BOARD.doneBinOpen ? 'true' : 'false')
}

/** Open or close the finished-cards list. */
function toggleDoneBin() {
  // The heading is the list of everything: pressing it is also how a filter
  // put there by a card's own mark is dropped.
  BOARD.doneBinOpen = !BOARD.doneBinOpen
  BOARD.doneBinFilter = ''
  renderBoard()
}

/**
 * One finished note, as a line of the card's list.
 *
 * Two lines folded - the title, and the first line of the body under it - so
 * the reader can tell which thought this is without opening it; the whole note
 * when the line is pressed. The marks are the only two things a finished note
 * still needs: put it back on the paper, or drop it.
 * @param {object} card - one of the filed notes.
 * @returns {Element} the row.
 */
function buildDoneRow(card) {
  var parts = noteParts(card.text)
  var open = BOARD.rowOpen === card.id
  var row = document.createElement('div')
  // A card, not a row: the same paper as the note it was, read one line at a
  // time and opened by pressing it - the tray's own language.
  Object.assign(row.style, NOTE_PAPER, BOARD_UI.doneRow)
  if (open) Object.assign(row.style, BOARD_UI.doneRowOpen)
  row.className = 'dshv-done-row'
  row.setAttribute('data-role', 'doneRow')
  row.setAttribute('data-card-id', card.id)
  // The row is still a note: the same gesture lifts it back onto the paper.
  row.setAttribute('data-handle', 'inboxNote')
  if (open) row.setAttribute('data-open', 'true')

  var main = document.createElement('div')
  Object.assign(main.style, BOARD_UI.doneRowMain)
  if (open) {
var full = document.createElement('div')
Object.assign(full.style, BOARD_UI.doneRowFull)
full.setAttribute('data-role', 'doneFull')
full.textContent = card.text
main.appendChild(full)
  } else {
// One line: what this list is for is telling the finished thoughts apart,
// and the title does that. The rest is one press away.
var title = document.createElement('div')
Object.assign(title.style, BOARD_UI.doneRowTitle)
title.setAttribute('data-role', 'doneTitle')
title.setAttribute('title', card.text)
title.textContent = parts.title || paletteText('boardCardPlaceholder')
main.appendChild(title)
  }
  row.appendChild(main)

  var putBack = document.createElement('span')
  Object.assign(putBack.style, BOARD_UI.doneRowAction)
  putBack.setAttribute('role', 'button')
  putBack.setAttribute('data-role', 'donePutBack')
  putBack.setAttribute('aria-label', paletteText('boardDoneBack'))
  putBack.setAttribute('title', paletteText('boardDoneBack'))
  putBack.textContent = '\u2193'
  putBack.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
ejectFromDoneBin(card)
  })
  row.appendChild(putBack)

  var remove = document.createElement('span')
  Object.assign(remove.style, BOARD_UI.doneRowAction)
  remove.setAttribute('role', 'button')
  remove.setAttribute('data-role', 'doneRemove')
  remove.setAttribute('aria-label', paletteText('boardCardRemove'))
  remove.setAttribute('title', paletteText('boardCardRemove'))
  remove.textContent = '×'
  remove.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
removeLooseCard(card.id)
  })
  row.appendChild(remove)

  // The whole line opens the note, not just its words: a list is read by
  // pointing at a line.
  row.addEventListener('click', function (ev) {
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
var hit = ev && ev.target
if (hit && typeof hit.closest === 'function'
  && hit.closest('[data-role="donePutBack"],[data-role="doneRemove"]')) return
BOARD.rowOpen = open ? '' : card.id
renderBoard()
  })
  return row
}

/**
 * Put the finished-cards list on the board, or take it away.
 *
 * The rows are the inbox tray's own rows, so a card is dragged back onto the
 * canvas by the gesture the reader already knows - and the board's single
 * press handler sees the press, because this list is mounted inside the board
 * it belongs to rather than floating outside it.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {void}
 */
function mountDoneBin(titles) {
  if (BOARD.doneBinPanel && BOARD.doneBinPanel.parentNode) {
BOARD.doneBinPanel.parentNode.removeChild(BOARD.doneBinPanel)
  }
  BOARD.doneBinPanel = null
  if (!BOARD.doneBinOpen || !BOARD.panel) return
  var cards = BOARD.doneBinFilter ? doneBinCardsOf(BOARD.doneBinFilter) : doneBinCards()
  // A list with nothing in it is not a list: the card stopped offering the
  // mark, and a panel left standing would be a door onto an empty room.
  if (!cards.length) {
BOARD.doneBinOpen = false
BOARD.rowOpen = ''
return
  }
  var panel = document.createElement('div')
  Object.assign(panel.style, BOARD_UI.doneBinPanel)
  panel.className = 'dshv-done-bin'
  panel.setAttribute('data-role', 'doneBinPanel')
  panel.addEventListener('pointerdown', boardPress)
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.doneBinHead)
  head.setAttribute('data-role', 'doneBinHead')
  // The card is standing right beside this panel, so the heading says what the
  // list is and how long it is - not whose it is, twice.
  var name = document.createElement('span')
  name.textContent = paletteText('boardDoneBin')
  head.appendChild(name)
  var many = document.createElement('span')
  Object.assign(many.style, BOARD_UI.trayCount)
  many.textContent = String(cards.length)
  head.appendChild(many)
  var close = document.createElement('span')
  Object.assign(close.style, BOARD_UI.doneRowAction)
  close.style.marginLeft = 'auto'
  close.setAttribute('role', 'button')
  close.setAttribute('data-role', 'doneClose')
  close.setAttribute('aria-label', paletteText('close'))
  close.setAttribute('title', paletteText('close'))
  close.textContent = '×'
  close.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
BOARD.doneBinOpen = false
BOARD.rowOpen = ''
renderBoard()
  })
  head.appendChild(close)
  panel.appendChild(head)
  var list = document.createElement('div')
  Object.assign(list.style, BOARD_UI.doneBinList)
  list.setAttribute('data-role', 'doneBinList')
  for (var i = 0; i < cards.length; i++) list.appendChild(buildDoneRow(cards[i]))
  panel.appendChild(list)
  // Beside the card whose mark opened it: the list belongs to that card, and a
  // reader who pressed a mark on it expects the answer there - not in the
  // corner of the window, where it would have to be found twice.
  if (BOARD.doneBinFilter && BOARD.panel) {
var anchor = null
for (var n = 0; n < BOARD.nodes.length; n++) {
  if (BOARD.nodes[n].getAttribute('data-session-id') === BOARD.doneBinFilter) anchor = BOARD.nodes[n]
}
var rootRect = typeof BOARD.panel.getBoundingClientRect === 'function'
  ? BOARD.panel.getBoundingClientRect()
  : null
var cardRect = anchor && typeof anchor.getBoundingClientRect === 'function'
  ? anchor.getBoundingClientRect()
  : null
if (rootRect && cardRect && (cardRect.width || cardRect.height)) {
  var zoomNow = BOARD.zoom || 1
  panel.style.right = 'auto'
  panel.style.left = Math.round((cardRect.right - rootRect.left) / zoomNow + 10) + 'px'
  panel.style.top = Math.max(8, Math.round((cardRect.top - rootRect.top) / zoomNow)) + 'px'
}
  }
  BOARD.panel.appendChild(panel)
  BOARD.doneBinPanel = panel
}

/**
 * Put one card back on the paper, out of the finished-cards bin.
 *
 * A bin that kept a card which no longer belongs there would be lying about
 * its own name: the moment a card in it stops being finished - or stops being
 * tied to anything - it goes back where it came from. It keeps its own place,
 * so the card reappears exactly where it left; what should happen to it next
 * is a question for the next tidy, not for this press.
 * @param {object} card - the card being taken out.
 * @returns {boolean} whether it was in the bin at all.
 */
function ejectFromDoneBin(card) {
  if (!card || card.filed !== BOARD_DONE) return false
  BOARD_STORE.unfileCard(card.id)
  if (BOARD.open) renderBoard()
  showToast(paletteText('boardDoneBack'))
  return true
}

/**
 * The tray's body: the conversations nothing accounts for, and the notes put away here.
 *
 * A goal answers "what am I working on", and its rows are all conversations.
 * The inbox answers "what has not found a place", so it holds both kinds and
 * names the two sections rather than running them together: the reader has to
 * be able to see what is work and what is a thought at a glance.
 * @param {object} block - the inbox block.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the body's contents.
 */
function buildInboxBody(block, titles) {
  var wrap = document.createElement('div')
  Object.assign(wrap.style, BOARD_UI.tray)
  // The tray is one material. Its conversations wear the ideas' paper, so a
  // panel of two kinds reads as one place rather than two lists stacked; the
  // class is what the stylesheet hangs that on, and the ideas keep their one
  // line because a line is what a list is read in.
  wrap.className = 'dshv-tray'
  wrap.setAttribute('data-role', 'inboxBody')
  // Everything filed that is not in the bin is read here - the inbox, and
  // whatever a newer build might have filed somewhere this one cannot draw:
  // a card nobody draws is a card the reader has lost, and the tray is the
  // one place that can always show it.
  var notes = BOARD_STORE.filedCards(BOARD_INBOX)
  // A card filed in a goal's own lane is drawn there, under that goal. The
  // tray keeps only what this paint cannot place - the homeless, and the
  // filings of a build this one cannot draw.
  var drawn = Object.create(null)
  for (var d = 0; d < BOARD.blocks.length; d++) drawn[BOARD.blocks[d].key] = true
  var every = BOARD_STORE.cards()
  for (var f = 0; f < every.length; f++) {
    var held = every[f]
    if (!held.filed || held.filed === BOARD_INBOX || held.filed === BOARD_DONE) continue
    if (drawn[held.filed]) continue
    notes.push(held)
  }
  // The tray counts the same thing a goal's heading does: what it is showing as
  // columns. The quiet ones are their own line, told apart underneath.
  wrap.appendChild(trayCaption(paletteText('boardInboxSessions'),
    block.hot ? block.hot.length : block.rows.length))
  if (!block.rows.length) {
    wrap.appendChild(trayQuiet(paletteText('boardEmptyInbox')))
  } else {
    var columns = buildBoardColumns(block, titles)
    // Every conversation in the tray wears the ideas' paper. The walk is here
    // rather than in the builder because it is the tray's fact, not a card's:
    // the same card dropped into a goal goes back to the goal's own ink.
    trayInk(columns)
    wrap.appendChild(columns)
  }
  wrap.appendChild(trayCaption(paletteText('boardInboxNotes'), notes.length))
  if (!notes.length) wrap.appendChild(trayQuiet(paletteText('boardEmptyTrayIdeas')))
  for (var i = 0; i < notes.length; i++) wrap.appendChild(buildTrayNote(notes[i], titles))
  return wrap
}

/**
 * The lane at the foot of one goal: what the reader did about it themselves.
 *
 * A goal is mostly conversations with an agent, but the reader's own part -
 * the check they ran, the person they asked, the thing they will do after
 * lunch - has no conversation to live in. This row is where a thought about
 * that part is kept: dragging a card into it files the card there, and the
 * card is read as a line under the goal rather than as paper on the canvas.
 *
 * It is the same tray the inbox has always drawn, one per goal. That is the
 * whole of what "merging the inbox into the goals" means here: the inbox is
 * no longer a kind of card, it is the goal whose lane takes what belongs
 * nowhere.
 * @param {object} block - the goal.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the lane.
 */
function buildGoalLane(block, titles) {
  var lane = document.createElement('div')
  Object.assign(lane.style, BOARD_UI.lane)
  lane.className = 'dshv-lane'
  lane.setAttribute('data-role', 'goalLane')
  lane.setAttribute('data-handle', 'lane')
  lane.setAttribute('data-block', block.key)
  var notes = BOARD_STORE.filedCards(block.key)
  lane.appendChild(trayCaption(paletteText('boardLaneHuman'), notes.length))
  if (!notes.length) {
    var empty = document.createElement('div')
    Object.assign(empty.style, BOARD_UI.laneEmpty)
    empty.setAttribute('data-role', 'laneEmpty')
    empty.textContent = paletteText('boardLaneEmpty')
    lane.appendChild(empty)
    return lane
  }
  for (var i = 0; i < notes.length; i++) lane.appendChild(buildTrayNote(notes[i], titles))
  return lane
}

/**
 * A goal's conversations, laid out across the panel.
 *
 * A conversation being worked in is a column: its card, and under it the
 * thoughts that were filed under it, top to bottom in the order they were
 * written. A branch sits beside the conversation it was cut from - the order
 * already seats it there - and the elbow above the row is what says so.
 *
 * The row is capped, and what does not fit starts another row under it: a
 * panel used to answer a busy goal by growing sideways, one 280px column per
 * conversation, which is how a dozen of them turned one goal into two screens
 * of paper. The quiet ones - carried in by the day, untouched since - are not
 * columns at all: they are the strip at the foot of the panel, one line each.
 * @param {object} block - the goal whose body this is.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the columns, and the quiet conversations under them.
 */
function buildBoardColumns(block, titles) {
  var wrap = document.createElement('div')
  Object.assign(wrap.style, BOARD_UI.blockColumnsWrap)
  wrap.setAttribute('data-role', 'blockColumnsWrap')
  var rows = block.hot || block.rows || []
  if (rows.length) {
var across = Math.min(rows.length, BOARD_ROW_COLUMNS)
var grid = document.createElement('div')
Object.assign(grid.style, BOARD_UI.columns)
// The width is the whole of the cap: a flex row in a panel would keep
// growing sideways, which is the one thing this row exists to stop.
grid.style.flexWrap = 'wrap'
grid.style.width = (across * BOARD_CARD_W + (across - 1) * BOARD_COLUMN_GAP) + 'px'
grid.setAttribute('data-role', 'blockColumns')
var hidden = BOARD_STORE.isIdeasHidden(block.key)
var byId = Object.create(null)
var i
for (i = 0; i < rows.length; i++) byId[rows[i].id] = rows[i]
for (i = 0; i < rows.length; i++) {
  grid.appendChild(buildBoardColumn(block, rows[i], titles, hidden, byId))
}
wrap.appendChild(grid)
  }
  var quiet = block.quiet || []
  if (quiet.length) wrap.appendChild(buildQuietStrip(block, quiet, titles))
  return wrap
}

/**
 * One conversation of a panel, as the column it stands in.
 *
 * One shape for the work above and the finished strip below: both draw the
 * card, and the strip's columns carry no thoughts because what is finished
 * is a conversation, not the notes that led to it.
 * @param {object} block - the panel's block.
 * @param {object} row - the conversation.
 * @param {object} titles - session id -> the name to call it by.
 * @param {boolean} hidden - whether this panel's thoughts are put away.
 * @param {object} byId - every conversation this panel draws, by id.
 * @param {object} [opts] - `done` when the column stands in the finished strip.
 * @returns {Element} the column.
 */
function buildBoardColumn(block, row, titles, hidden, byId, opts) {
  var parent = BOARD_STORE.lineageOf(row.id)
  var orphan = parent && parent !== row.id && !byId[parent] ? parent : ''
  var done = !!(opts && opts.done)
  var column = document.createElement('div')
  Object.assign(column.style, BOARD_UI.column)
  column.className = 'dshv-col'
  column.setAttribute('data-role', 'sessionColumn')
  column.setAttribute('data-column', row.id)
  if (done) column.setAttribute('data-done', 'true')
  column.appendChild(buildBoardCard(row, orphan, titles, goalHue(block), opts))
  if (!hidden && !done) column.appendChild(buildBoardStack(row.id, titles))
  return column
}

/**
 * The long strip at the foot of a goal: what the reader finished today.
 *
 * It stands whether or not it holds anything, because a strip that appears
 * only after the first drop is a target the hand cannot aim at before it
 * has used it once. Closed, it is one line and a count; open, it lays the
 * finished conversations across the panel the way the work above is laid.
 * Nothing arrives here by itself: a turn that finishes stays in the columns
 * until the reader carries it down, and only the reader's mark moves it.
 * @param {object} block - the goal whose foot this is.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the strip.
 */
function buildDoneBar(block, titles) {
  var rows = block.done || []
  var open = BOARD.doneOpen[block.key] === true
  var bar = document.createElement('div')
  Object.assign(bar.style, BOARD_UI.doneBar)
  bar.className = 'dshv-done-bar'
  bar.setAttribute('data-role', 'doneBar')
  bar.setAttribute('data-block', block.key)
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.doneHead)
  if (open) Object.assign(head.style, BOARD_UI.doneHeadOpen)
  head.className = 'dshv-done-head'
  head.setAttribute('data-role', 'doneHead')
  head.setAttribute('data-no-drag', 'true')
  head.setAttribute('role', 'button')
  head.setAttribute('aria-expanded', open ? 'true' : 'false')
  head.setAttribute('title', paletteText(open ? 'boardDoneCollapseHint' : 'boardDoneTodayHint'))
  var caret = document.createElement('span')
  caret.setAttribute('aria-hidden', 'true')
  caret.textContent = open ? '\u25be' : '\u25b8'
  head.appendChild(caret)
  var label = document.createElement('span')
  label.setAttribute('data-role', 'doneLabel')
  label.textContent = paletteText('boardDoneToday')
  head.appendChild(label)
  var count = document.createElement('span')
  Object.assign(count.style, BOARD_UI.doneCount)
  count.setAttribute('data-role', 'doneCount')
  count.textContent = String(rows.length)
  head.appendChild(count)
  head.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD.doneOpen[block.key] = !open
renderBoard()
  })
  bar.appendChild(head)
  if (!open) return bar
  if (!rows.length) {
var empty = document.createElement('div')
Object.assign(empty.style, BOARD_UI.doneEmpty)
empty.setAttribute('data-role', 'doneEmpty')
empty.textContent = paletteText('boardDoneEmpty')
bar.appendChild(empty)
return bar
  }
  var grid = document.createElement('div')
  Object.assign(grid.style, BOARD_UI.doneGrid)
  grid.setAttribute('data-role', 'doneGrid')
  // The lineage is read against every conversation the goal draws, not
  // just the finished ones: a finished branch whose parent is still at
  // work is not an orphan, and it should not say it is.
  var byId = Object.create(null)
  for (var r = 0; r < block.rows.length; r++) byId[block.rows[r].id] = block.rows[r]
  for (var i = 0; i < rows.length; i++) {
grid.appendChild(buildBoardColumn(block, rows[i], titles, true, byId, { done: true }))
  }
  bar.appendChild(grid)
  return bar
}

/**
 * The conversations a panel carried in and nobody has touched, one line each.
 *
 * They are on the board - the day brought them along - but nothing is being
 * worked in them, so a column apiece is the wrong shape: a goal holding a
 * dozen of those is the panel this strip is here to prevent. It says how many
 * there are and how long the oldest has waited, and unfolds on a press. No
 * press is needed to make it happen and none is needed to undo it: a quiet
 * conversation is back in its column the moment it moves, is marked, or
 * starts a turn.
 * @param {object} block - the panel's block.
 * @param {Array<object>} rows - the conversations drawn as lines.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the strip.
 */
function buildQuietStrip(block, rows, titles) {
  var strip = document.createElement('div')
  Object.assign(strip.style, BOARD_UI.quietStrip)
  strip.setAttribute('data-role', 'quietStrip')
  strip.setAttribute('data-block', block.key)
  var open = BOARD.quietOpen[block.key] === true
  var today = dayOf(Date.now())
  var oldest = 0
  var d
  for (d = 0; d < rows.length; d++) {
var days = CARRY.days(rows[d].id, today)
if (days > oldest) oldest = days
  }
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.quietHead)
  head.className = 'dshv-quiet-head'
  head.setAttribute('data-role', 'quietHead')
  head.setAttribute('role', 'button')
  head.setAttribute('aria-expanded', open ? 'true' : 'false')
  head.setAttribute('title', paletteText(open ? 'boardQuietCloseHint' : 'boardQuietHint'))
  head.textContent = (open ? '▾ ' : '▸ ') + paletteText('boardQuiet') + ' ' + rows.length
  if (oldest) {
head.textContent += ' · ' + paletteText('boardQuietLongest') + ' ' + oldest + ' ' + paletteText('boardQuietDays')
  }
  head.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD.quietOpen[block.key] = !open
renderBoard()
  })
  strip.appendChild(head)
  if (!open) return strip
  for (var r = 0; r < rows.length; r++) {
strip.appendChild(buildQuietRow(block, rows[r], titles))
if (BOARD.quietCards[rows[r].id] === true) strip.appendChild(buildQuietStack(rows[r].id, titles))
  }
  return strip
}

/**
 * One quiet conversation, as the line it is drawn as.
 *
 * The line is the way in, exactly as a card is: a press that does not travel
 * opens the conversation, and a press that travels carries it out of the
 * panel like any other card - so it wears the card's own handle and the one
 * press handler needs nothing new. Its thoughts are not drawn for a quiet
 * conversation, because a line has no column to hold them: the line says how
 * many there are, and that count is the chip that puts them on the paper.
 * @param {object} block - the panel's block.
 * @param {object} summary - the conversation.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the line.
 */
function buildQuietRow(block, summary, titles) {
  var row = document.createElement('div')
  Object.assign(row.style, BOARD_UI.quietRow)
  row.className = 'dshv-quiet-row'
  row.setAttribute('data-role', 'quietRow')
  row.setAttribute('data-session-id', summary.id)
  row.setAttribute('data-handle', 'card')
  row.setAttribute('title', paletteText('boardQuietRowHint'))
  row.addEventListener('click', function () {
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
boardOpenSession(summary.id, { anchor: true })
  })
  var dot = document.createElement('span')
  Object.assign(dot.style, BOARD_UI.quietDot)
  dot.className = 'dshv-quiet-dot'
  dot.setAttribute('data-role', 'quietDot')
  dot.style.background = blockInk(block)
  row.appendChild(dot)
  var name = document.createElement('span')
  Object.assign(name.style, BOARD_UI.quietName)
  name.setAttribute('data-role', 'quietName')
  name.textContent = titles[summary.id] || boardTitleOf(summary)
  row.appendChild(name)
  var mine = 0
  var cards = BOARD_STORE.cards()
  for (var c = 0; c < cards.length; c++) {
if (cards[c].link === summary.id && !cards[c].filed) mine = mine + 1
  }
  if (mine) {
var chip = document.createElement('span')
Object.assign(chip.style, BOARD_UI.quietCards)
chip.className = 'dshv-quiet-cards'
chip.setAttribute('role', 'button')
chip.setAttribute('data-role', 'quietCards')
chip.setAttribute('aria-pressed', BOARD.quietCards[summary.id] === true ? 'true' : 'false')
chip.setAttribute('title', paletteText('boardQuietCardsHint'))
chip.textContent = mine + ' ' + paletteText('boardQuietCardsUnit')
chip.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  if (BOARD.dragged) {
    BOARD.dragged = false
    return
  }
  BOARD.quietCards[summary.id] = BOARD.quietCards[summary.id] !== true
  renderBoard()
})
row.appendChild(chip)
  }
  var days = CARRY.days(summary.id, dayOf(Date.now()))
  if (days) {
var waited = document.createElement('span')
Object.assign(waited.style, BOARD_UI.quietDays)
waited.setAttribute('data-role', 'quietDays')
waited.textContent = days + ' ' + paletteText('boardQuietDays')
row.appendChild(waited)
  }
  return row
}

/**
 * The thoughts under one quiet conversation, once its count was pressed.
 *
 * The same pile a column draws, and the same element: a thought is read where
 * it was written, whether its conversation is three columns wide today or one
 * line. It is inset so the pile reads as belonging to the line above it.
 * @param {string} sessionId - the conversation.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the inset holding the pile.
 */
function buildQuietStack(sessionId, titles) {
  var box = document.createElement('div')
  Object.assign(box.style, BOARD_UI.quietStack)
  box.setAttribute('data-role', 'quietStack')
  box.appendChild(buildBoardStack(sessionId, titles))
  return box
}

/**
 * The thoughts filed under one conversation.
 *
 * The pile is read in the order the thoughts were written, and nothing here
 * sorts them: a stack that rearranged itself would be a stack the reader has
 * to read again every time they look. The frame is always drawn, even empty:
 * it is what a carried card is let go into.
 * @param {string} sessionId - the conversation the pile belongs to.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the pile.
 */
function buildBoardStack(sessionId, titles) {
  var stack = document.createElement('div')
  Object.assign(stack.style, BOARD_UI.stack)
  stack.className = 'dshv-stack'
  stack.setAttribute('data-role', 'cardStack')
  stack.setAttribute('data-session', sessionId)
  var cards = BOARD_STORE.cards()
  var open = []
  var done = []
  for (var i = 0; i < cards.length; i++) {
var card = cards[i]
if (card.filed || card.link !== sessionId) continue
if (card.done) done.push(card)
else open.push(card)
  }
  // What is still open is the work: every one of them is shown. What is
  // finished has stopped asking for room - three are enough to remember
  // what this conversation was about, and the rest are one press away.
  for (var o = 0; o < open.length; o++) {
stack.appendChild(buildBoardLooseCard(open[o], titles, { stacked: sessionId, compact: true }))
  }
  var unfolded = BOARD.doneExpanded[sessionId] === true
  var shown = unfolded ? done : done.slice(0, BOARD_DONE_PREVIEW)
  for (var f = 0; f < shown.length; f++) {
stack.appendChild(buildBoardLooseCard(shown[f], titles, { stacked: sessionId, compact: true }))
  }
  if (done.length > BOARD_DONE_PREVIEW) {
var more = document.createElement('span')
Object.assign(more.style, BOARD_UI.doneMore)
more.className = 'dshv-done-more'
more.setAttribute('role', 'button')
more.setAttribute('data-role', 'cardDoneMore')
more.setAttribute('data-session', sessionId)
more.setAttribute('aria-expanded', unfolded ? 'true' : 'false')
more.textContent = unfolded
  ? paletteText('boardDoneCollapse')
  : paletteText('boardDoneMore') + ' ' + (done.length - BOARD_DONE_PREVIEW) + ' '
    + paletteText('boardDoneMoreUnit')
more.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  if (BOARD.dragged) {
    BOARD.dragged = false
    return
  }
  BOARD.doneExpanded[sessionId] = !unfolded
  renderBoard()
})
stack.appendChild(more)
  }
  if (!open.length && !done.length) stack.setAttribute('data-empty', 'true')
  BOARD.stacks.push({ sessionId: sessionId, el: stack })
  return stack
}

/**
 * Wear the one beat a completion is worth - once.
 *
 * The beat is the task window's own: a fast front edge and a slow settle,
 * over in under a second, leaving a quiet ring behind while the completion is
 * still unread. The board used to hang it on the element and let CSS play it,
 * which meant it played again on every repaint - a drag, a star, a status
 * tick, all of them. The ledger is what makes it once.
 * @param {Element} card - the card being drawn.
 * @param {string} id - session id.
 * @returns {void}
 */
function markCardFresh(card, id) {
  card.setAttribute('data-unread', 'true')
  if (BOARD.freshed[id]) return
  BOARD.freshed[id] = true
  card.setAttribute('data-fresh', 'true')
}

/**
 * One conversation on the board: its name, what it is doing, and the
 * buttons that act on it.
 *
 * The card itself is the way in. It used to be the one thing on the board a
 * press did nothing to - opening was a small arrow on a rail, and the name
 * was a rename field waiting for a mis-click - which made the largest target
 * on the canvas carry the least likely action and the most likely action
 * carry a destructive one. A press that never travels now opens the
 * conversation; the marks and fields inside stop their own presses, so
 * nothing else on the card can be confused with it.
 *
 * Renaming is deliberate instead: it lives behind the card's ⋯, one press
 * further away than the card itself (see `buildSessionMenu`).
 * There is no 进入 button: it was a fifth of the card spent on the one action
 * the card already answered to. What is left as a target is the drop - an
 * idea card carried onto this one - and that overlay is drawn only while a
 * card is being carried (see `data-note-drag`).
 * @param {object} summary - session summary.
 * @param {string} orphan - a fork source this block does not carry, or ''.
 * @param {object} titles - session id -> the name to call it by.
 * @param {number|undefined} hue - the goal's own colour, or nothing for a
 *   card drawn outside a goal (the copy under the hand during a carry).
 * @returns {Element} the card.
 */

/**
 * The word one conversation wears, in the reader's language.
 * @param {string} key - one of `VERDICT_KEYS`.
 * @returns {string} the word.
 */
function verdictText(key) {
  if (key === 'paused') return paletteText('statusPaused')
  if (key === 'settled') return paletteText('statusSettled')
  return paletteText('statusFinished')
}

/**
 * What the reader said about a card, as the chip that says it.
 *
 * The chip is also the door: pressing it offers the two words again, so a
 * state that was set by hand can be changed by hand. The one the reader
 * cannot change is the one the shell owns - a turn in flight or a completion
 * nobody has opened - and that chip is drawn elsewhere, read-only.
 * @param {object} summary - the conversation.
 * @param {object} verdict - `{key, at}`.
 * @returns {Element} the chip.
 */
function buildVerdictChip(summary, verdict) {
  var chip = document.createElement('span')
  Object.assign(
    chip.style,
    BOARD_UI.cardChip,
    BOARD_UI['cardChip' + verdict.key.charAt(0).toUpperCase() + verdict.key.slice(1)]
  )
  chip.className = 'dshv-chip'
  chip.setAttribute('role', 'button')
  chip.setAttribute('data-role', 'cardState')
  chip.setAttribute('data-state', verdict.key)
  chip.setAttribute('data-no-drag', 'true')
  chip.setAttribute('title', paletteText('cardStateHint'))
  chip.setAttribute('aria-expanded', BOARD.verdictMenu === summary.id ? 'true' : 'false')
  chip.textContent = verdictText(verdict.key)
  chip.addEventListener('click', stateToggle(summary.id))
  return chip
}

/**
 * The empty seat, for a card the shell has nothing to say about.
 *
 * The words, not a plus: a plus says "something can go here" and leaves the
 * reader guessing what, while "任务状态" says exactly what the seat is for.
 * It is still the way in - a press offers the two words the reader can give.
 * @param {object} summary - the conversation.
 * @returns {Element} the seat.
 */
function buildStateAdd(summary) {
  var add = document.createElement('span')
  Object.assign(add.style, BOARD_UI.cardStateAdd)
  add.className = 'dshv-state-add'
  add.setAttribute('role', 'button')
  add.setAttribute('data-role', 'cardStateAdd')
  add.setAttribute('data-no-drag', 'true')
  add.setAttribute('title', paletteText('cardStateHint'))
  add.setAttribute('aria-label', paletteText('cardStateHint'))
  add.setAttribute('aria-expanded', BOARD.verdictMenu === summary.id ? 'true' : 'false')
  add.textContent = paletteText('boardTaskState')
  add.addEventListener('click', stateToggle(summary.id))
  return add
}

/**
 * Open or close one card's state menu.
 * @param {string} id - the conversation.
 * @returns {Function} the click handler.
 */
function stateToggle(id) {
  return function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD.verdictMenu = BOARD.verdictMenu === id ? '' : id
renderBoard()
  }
}

/**
 * The two words, and the way back to having said nothing.
 *
 * The way back is not a courtesy: one of these words hides a fact the board
 * wrote itself, so a word that could only be replaced would be a word the
 * reader learns not to say.
 * @param {object} summary - the conversation.
 * @returns {Element} the menu.
 */
function buildVerdictMenu(summary) {
  var menu = document.createElement('div')
  Object.assign(menu.style, BOARD_UI.verdictMenu)
  menu.className = 'dshv-verdict-menu'
  menu.setAttribute('data-role', 'verdictMenu')
  menu.setAttribute('data-no-drag', 'true')
  var held = cardVerdictOf(summary)
  menu.appendChild(verdictItem(summary, 'paused', !!held && held.key === 'paused'))
  menu.appendChild(verdictItem(summary, 'settled', !!held && held.key === 'settled'))
  menu.appendChild(clearVerdictItem(summary))
  return menu
}

/**
 * One word in that menu.
 * @param {object} summary - the conversation.
 * @param {string} key - the word.
 * @param {boolean} on - whether this is the word the card already wears.
 * @returns {Element} the row.
 */
function verdictItem(summary, key, on) {
  var row = document.createElement('span')
  Object.assign(row.style, BOARD_UI.verdictItem)
  row.setAttribute('role', 'button')
  row.setAttribute('data-role', 'verdictPick')
  row.setAttribute('data-verdict', key)
  row.textContent = (on ? '\u2713 ' : '') + verdictText(key)
  row.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
// The word and the strip are one decision: saying a conversation is
// finished puts it in today's finished strip, and saying anything else
// takes it back out.
if (key === 'settled') {
  sendToDone(summary.id)
} else {
  BOARD_STORE.setVerdict(summary.id, key, Number(summary.updatedAt) || 0)
  bringBackFromDone(summary.id)
}
BOARD.verdictMenu = ''
renderBoard()
  })
  return row
}

/**
 * The row that takes the word back.
 * @param {object} summary - the conversation.
 * @returns {Element} the row.
 */
function clearVerdictItem(summary) {
  var row = document.createElement('span')
  Object.assign(row.style, BOARD_UI.verdictItem)
  row.setAttribute('role', 'button')
  row.setAttribute('data-role', 'verdictClear')
  row.textContent = paletteText('cardStateClear')
  row.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD_STORE.dropVerdict(summary.id)
bringBackFromDone(summary.id)
BOARD.verdictMenu = ''
renderBoard()
  })
  return row
}

function buildBoardCard(summary, orphan, titles, hue, opts) {
  var card = document.createElement('div')
  Object.assign(card.style, BOARD_UI.card)
  // The card is the work, and it belongs to the place it stands in: a step
  // deeper than the panel's wash, and a spine down its left edge in the same
  // hue. Not a fill - twelve goals of solid colour is a canvas nobody can
  // read - and not a second hue, because a card that is its own colour is a
  // card that belongs nowhere.
  if (hue !== null && hue !== undefined) {
    card.style.background = solidPaper('hsl(' + hue + ' 48% 50% / 0.10)', BOARD_INK.card)
    card.style.borderColor = 'hsl(' + hue + ' 40% 45% / 0.22)'
    card.style.borderLeft = '3px solid hsl(' + hue + ' 55% 46% / 0.72)'
  }
  card.className = 'dshv-card'
  card.setAttribute('data-session-id', summary.id)
  card.setAttribute('data-handle', 'card')
  var name = boardTitleOf(summary)
  card.setAttribute('title', paletteText('boardCardMoveHint'))
  // The card itself is the way in. The gesture layer has already settled
  // whether a press was a carry or a click (a press that travels past
  // `BOARD_SLOP` is a carry and repaints), and every control drawn inside
  // this card stops its own press before it reaches here - so what arrives
  // at this handler is, by construction, a press on the conversation.
  card.addEventListener('click', function () {
    // A click that follows a carry is the gesture's leftover, not a request:
    // the same one-shot guard the marks use, in one place instead of five.
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    boardOpenSession(summary.id, { anchor: true })
  })
  var status = statusOf(summary)
  // The shell has nothing to say about this one, so the card says what it
  // knows: the turn the reader gave a word to, or nothing at all.
  var verdict = status ? null : cardVerdictOf(summary)
  // What the card is doing, said in material as well as in a word: a turn in
  // flight wears a ring that breathes, one parked on the reader wears a still
  // ring, and a completion nobody has looked at yet gets one beat.
  if (statusIsLive(status)) {
    card.setAttribute('data-live', 'true')
    // Waiting is not working. The same turn parked on a question or an
    // approval must not look like something moving without the reader.
    if (status.key === 'pending') card.setAttribute('data-waiting', 'true')
  }
  if (status && status.key === 'done') markCardFresh(card, summary.id)
  else if (BOARD.freshed[summary.id]) delete BOARD.freshed[summary.id]
  if (BOARD.front === summary.id) {
    card.setAttribute('data-front', 'true')
    card.style.zIndex = String(BOARD.zTop)
  }

  // Four fifths what the card says, one fifth what can be done with it. The
  // way in used to sit in a row of words under the name, the same size and
  // the same material as the marks beside it, at the bottom of the card.
  var row = document.createElement('div')
  Object.assign(row.style, BOARD_UI.cardRow)
  var main = document.createElement('div')
  Object.assign(main.style, BOARD_UI.cardMain)
  // The marks stand in a rail on the card's right edge: three rows of two
  // seats, always six, so every card is the same shape and no mark moves
  // between cards. A mark with nothing to say keeps its seat and hides.
  var rail = document.createElement('div')
  Object.assign(rail.style, BOARD_UI.cardRail)
  rail.className = 'dshv-card-rail'
  rail.setAttribute('data-role', 'cardRail')
  /** Put one mark in the next seat, or leave the seat empty. */
  function railSeat(mark) {
    var seat = document.createElement('span')
    Object.assign(seat.style, mark ? BOARD_UI.cardSlot : BOARD_UI.cardSlotOff)
    seat.setAttribute('data-role', 'cardSlot')
    if (mark) {
      mark.setAttribute('data-slot', 'true')
      seat.appendChild(mark)
    }
    rail.appendChild(seat)
    return seat
  }

  if (BOARD.renamingCard === summary.id) {
    var field = document.createElement('input')
    Object.assign(field.style, BOARD_UI.cardRenameBox)
    field.setAttribute('type', 'text')
    field.setAttribute('data-role', 'cardRename')
    field.setAttribute('aria-label', paletteText('rename'))
    field.setAttribute('data-no-drag', 'true')
    field.value = BOARD.renameCardDraft === null ? name : BOARD.renameCardDraft
    field.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        commitBoardRename()
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        cancelBoardRename()
      }
    })
    field.addEventListener('blur', function () {
      if (BOARD.renamingCard === summary.id && BOARD.renameCardInput === field) commitBoardRename()
    })
    field.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    })
    main.appendChild(field)
    BOARD.renameCardInput = field
  } else {
    // The name is a label. A press on it is a press on the conversation and
    // opens it, like the rest of the card; renaming has a target of its own
    // at the end of this line, so a press meant for the conversation can
    // never land in a field.
    var title = document.createElement('div')
    Object.assign(title.style, BOARD_UI.cardTitle)
    title.setAttribute('data-role', 'cardTitle')
    title.textContent = name
    // The name and the lock share one line: a fixed title is a fact about
    // the work, and it belongs beside the words it holds down.
    var titleRow = document.createElement('div')
    Object.assign(titleRow.style, BOARD_UI.cardTitleRow)
    title.style.flex = '1 1 auto'
    title.style.minWidth = '0'
    titleRow.appendChild(title)
    var locked = BOARD_STORE.isSessionLocked(summary.id)
    var lockMark = document.createElement('span')
    Object.assign(lockMark.style, locked ? BOARD_UI.cardLockOn : BOARD_UI.cardLock)
    lockMark.className = 'dshv-lock'
    lockMark.setAttribute('role', 'button')
    lockMark.setAttribute('data-role', 'cardLock')
    lockMark.setAttribute('aria-pressed', locked ? 'true' : 'false')
    lockMark.setAttribute('title', paletteText(locked ? 'boardCardUnlockHint' : 'boardCardLockHint'))
    lockMark.setAttribute('aria-label', paletteText(locked ? 'boardCardUnlockHint' : 'boardCardLockHint'))
    lockMark.appendChild(boardIcon(locked ? 'lock' : 'unlock', 12))
    lockMark.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      BOARD_STORE.toggleSessionLock(summary.id)
      renderBoard()
    })
    railSeat(lockMark)
    // Renaming is a host write on the conversation, and the board names one
    // from the thought that started it: the rare verb belongs behind the ⋯
    // at the end of this line, not on it. The lock keeps its own seat beside
    // the name it holds down, and no word stands over the two of them.
    var moreMark = document.createElement('span')
    Object.assign(moreMark.style, BOARD_UI.cardMore)
    moreMark.className = 'dshv-card-more'
    moreMark.setAttribute('role', 'button')
    moreMark.setAttribute('data-role', 'cardMenuOpen')
    moreMark.setAttribute('title', paletteText('boardCardMenu'))
    moreMark.setAttribute('aria-label', paletteText('boardCardMenu'))
    moreMark.setAttribute('aria-expanded', BOARD.sessionMenu === summary.id ? 'true' : 'false')
    moreMark.textContent = '\u22ef'
    moreMark.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      // Opening a menu is not a repaint: the board may be mid-field, and a
      // paint would take the card out from under the press that asked.
      if (BOARD.sessionMenu === summary.id) {
        closeSessionMenu()
        return
      }
      closeIdeaMenu()
      closeSessionMenu()
      closeGoalMenu()
      BOARD.sessionMenu = summary.id
      BOARD.sessionMenuMark = moreMark
      moreMark.setAttribute('aria-expanded', 'true')
      var opened = buildSessionMenu(summary, !!(opts && opts.done))
      card.appendChild(opened)
      placeCardMenu(opened, moreMark)
    })
    railSeat(moreMark)
    main.appendChild(titleRow)
    if (BOARD.sessionMenu === summary.id) {
      var standing = buildSessionMenu(summary, !!(opts && opts.done))
      card.appendChild(standing)
      placeCardMenu(standing, moreMark)
    }
  }

  // What the reader last said to this conversation: the line under the
  // name, above what it is doing. The name says which conversation it is;
  // this says what it is about, and the two are different facts that keep
  // different rows. The height is the second line the name used to reserve
  // and leave empty, so nothing on the card grows for it.
  var saidText = SAID.known(summary)
  var saidLine = document.createElement('div')
  Object.assign(saidLine.style, BOARD_UI.cardSaid)
  saidLine.setAttribute('data-role', 'cardSaid')
  if (typeof saidText === 'string' && saidText !== '') {
    saidLine.textContent = saidText
    saidLine.setAttribute('title', saidText)
  }
  main.appendChild(saidLine)

  // Where a line would run off the panel, the card says in words where the
  // branch came from: the parent is real and named, it is simply not here
  // today. Pressing it opens that conversation.
  if (orphan) {
    var source = document.createElement('div')
    Object.assign(source.style, BOARD_UI.forkSource)
    source.setAttribute('data-role', 'forkSource')
    var parentTitle = titles[orphan]
    if (parentTitle) {
      source.textContent = paletteText('boardForkSource') + parentTitle
      source.setAttribute('title', paletteText('boardForkSource') + parentTitle)
      source.style.cursor = 'pointer'
      source.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        boardOpenSession(orphan, { anchor: true })
      })
    } else {
      source.textContent = paletteText('boardForkSourceUnknown')
    }
    main.appendChild(source)
  }

  // What this conversation has been told, read once for both the line it
  // is drawn as and the mark that offers to start one.
  var pinned = NOTE_STORE.get(summary.id)
  if (BOARD.noteEditing === summary.id) {
    var editor = document.createElement('input')
    Object.assign(editor.style, BOARD_UI.cardNoteBox)
    editor.setAttribute('type', 'text')
    editor.setAttribute('data-role', 'cardNoteBox')
    editor.setAttribute('aria-label', paletteText('notePlaceholder'))
    editor.setAttribute('data-no-drag', 'true')
    editor.setAttribute('placeholder', paletteText('notePlaceholder'))
    editor.value = pinned
    editor.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        commitBoardNote()
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        cancelBoardNote()
      }
    })
    // A press elsewhere keeps what was typed: a note is a thought already
    // had, and losing it because the reader looked away is the one failure
    // this cannot afford.
    editor.addEventListener('blur', function () {
      if (BOARD.noteEditing === summary.id && BOARD.noteEditor === editor) commitBoardNote()
    })
    editor.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    })
    main.appendChild(editor)
    BOARD.noteEditor = editor
  } else if (pinned) {
    var noteLine = document.createElement('div')
    Object.assign(noteLine.style, BOARD_UI.cardNote)
    noteLine.setAttribute('data-role', 'note')
    noteLine.setAttribute('title', paletteText('noteEdit'))
    noteLine.textContent = pinned
    noteLine.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      beginBoardNote(summary.id)
    })
    main.appendChild(noteLine)
  }

  var stateAnchored = null
  var meta = document.createElement('div')
  Object.assign(meta.style, BOARD_UI.cardMeta)
  meta.setAttribute('data-role', 'cardMeta')
  // The foot of the card belongs to its tools, not to the way in. Every
  // mark on this line answers for itself, and a press that lands between
  // two of them - on the gaps or on the read-only status chip - is a press
  // meant for this line, not a request to leave the board. The upper part
  // of the card stays the way in; this line never is.
  meta.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.dragged) BOARD.dragged = false
  })
  // The state chip leads the meta line, the seat it holds on the task
  // window's rows: the eye reads what the conversation is doing before it
  // reads which conversation it is. The clock rides in the chip exactly as
  // it does there, updated in place by the board's own tick.
  if (status) {
    var chip = document.createElement('span')
    Object.assign(
      chip.style,
      BOARD_UI.cardChip,
      BOARD_UI['cardChip' + status.key[0].toUpperCase() + status.key.slice(1)]
    )
    chip.setAttribute('data-role', 'status')
    chip.className = 'dshv-chip'
    if (statusIsLive(status)) chip.setAttribute('data-live', 'true')
    if (status.key === 'pending') chip.setAttribute('data-waiting', 'true')
    var since = statusIsLive(status) ? runSince(summary.id) : 0
    var elapsed = since ? elapsedText(Date.now() - since) : ''
    chip.textContent = elapsed ? status.text + ' · ' + elapsed : status.text
    chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : status.text)
    meta.appendChild(chip)
    if (since) BOARD.clocks.push({ chip: chip, label: status.text, since: since })
  } else if (verdict) {
    var stateChip = buildVerdictChip(summary, verdict)
    meta.appendChild(stateChip)
    stateAnchored = stateChip
  } else {
    var stateAdd = buildStateAdd(summary)
    meta.appendChild(stateAdd)
    stateAnchored = stateAdd
  }
  // A conversation that came in from the last page says so, and for how
  // long. The reader asked for it not to vanish overnight; a card that
  // outlived the day in silence would be the same surprise read backwards.
  var carriedFor = CARRY.days(summary.id, dayOf(Date.now()))
  if (carriedFor > 0) {
    var carriedMark = document.createElement('span')
    Object.assign(carriedMark.style, BOARD_UI.cardCarried)
    carriedMark.setAttribute('data-role', 'carried')
    carriedMark.setAttribute('title', paletteText('boardHistoryCarriedHint'))
    carriedMark.textContent = paletteText('boardHistoryCarried') + carriedFor
      + paletteText('boardHistoryCarriedUnit')
    meta.appendChild(carriedMark)
  }

  // What was handed to this conversation, put away: the mark only exists
  // when it holds something, because a card's own line has no room to spare
  // for a door that opens on nothing.
  var archived = doneBinCardsOf(summary.id).length
  var archiveMark = null
  if (archived) {
    var archive = document.createElement('span')
    Object.assign(archive.style, BOARD_UI.cardArchive)
    archive.className = 'dshv-archive'
    archive.setAttribute('role', 'button')
    archive.setAttribute('data-role', 'cardArchive')
    archive.setAttribute('title', paletteText('boardDoneBinHint'))
    archive.setAttribute('aria-label', paletteText('boardDoneBinHint'))
    archive.appendChild(boardIcon('archive', 13))
    var archiveCount = document.createElement('span')
    archiveCount.setAttribute('data-role', 'cardArchiveCount')
    archiveCount.textContent = String(archived)
    archive.appendChild(archiveCount)
    archive.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      openDoneBinFor(summary.id)
    })
    archiveMark = archive
  }

  // Two conversations can honestly wear one name - a workspace's own title
  // is what an untitled conversation shows, and a branch inherits its
  // parent's. When that happens on the board, both cards say which of them
  // they are, in a form that never moves: the count of namesakes, and this
  // card's place among them.
  var dup = BOARD.dupes[summary.id]
  if (dup) {
    var dupTag = document.createElement('span')
    Object.assign(dupTag.style, BOARD_UI.cardDupTag)
    dupTag.setAttribute('data-role', 'cardDupTag')
    dupTag.setAttribute('title', paletteText('boardCardDupHint'))
    dupTag.textContent = '#' + dup.at + '/' + dup.of
    meta.appendChild(dupTag)
  }

  // The foot of the card is the facts, not the verbs: what the conversation
  // is doing is the line under its name, and the marks that act on it stand
  // in the rail on its right edge.
  var pinMark = null
  // The way in for a card that carries no line yet.
  if (!pinned && BOARD.noteEditing !== summary.id) {
    pinMark = document.createElement('span')
    Object.assign(pinMark.style, BOARD_UI.cardNotePin)
    pinMark.setAttribute('data-role', 'cardNotePin')
    pinMark.setAttribute('title', paletteText('boardAddNote'))
    pinMark.textContent = '✎'
    pinMark.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      beginBoardNote(summary.id)
    })
  }
  var starMark = document.createElement('span')
  Object.assign(starMark.style, BOARD_UI.cardStar)
  starMark.setAttribute('data-role', 'cardStar')
  var marked = BOARD_STORE.isStarred(summary.id)
  starMark.setAttribute('aria-pressed', marked ? 'true' : 'false')
  starMark.setAttribute('title', paletteText(marked ? 'boardUnstar' : 'boardStar'))
  starMark.textContent = marked ? '★' : '☆'
  if (marked) starMark.style.color = BOARD_INK.accent
  starMark.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    BOARD_STORE.toggleStar(summary.id)
    renderBoard()
  })
  // The way to branch, a seat of its own in the rail.
  var forkMark = document.createElement('span')
  Object.assign(forkMark.style, BOARD_UI.cardForkButton)
  forkMark.className = 'dshv-fork'
  forkMark.setAttribute('role', 'button')
  forkMark.setAttribute('data-role', 'cardFork')
  forkMark.setAttribute('aria-label', paletteText('boardForkHint'))
  forkMark.setAttribute('title', paletteText('boardForkHint'))
  forkMark.appendChild(boardIcon('fork', 14))
  // A branch in flight is a branch already being made. The mark stays where
  // it is and stops answering until the host has said what the child is
  // called, so a hand that presses twice out of impatience gets one branch
  // rather than two identical ones.
  if (BOARD.forking[summary.id]) {
    forkMark.setAttribute('data-busy', 'true')
    forkMark.setAttribute('aria-busy', 'true')
    forkMark.setAttribute('title', paletteText('boardForkBusy'))
    forkMark.setAttribute('aria-label', paletteText('boardForkBusy'))
  }
  forkMark.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    if (BOARD.forking[summary.id]) return
    forkBoardCard(summary)
  })
  // The state is the line under the words - not the last thing on the card:
  // what the work is doing is the third thing the eye asks, after what it
  // is and what it was last told. It goes in right under the said line,
  // above any note or source line.
  if (typeof main.insertBefore === 'function' && saidLine.nextSibling) {
    main.insertBefore(meta, saidLine.nextSibling)
  } else {
    main.appendChild(meta)
  }
  // Six seats in one order, always: the reader learns where a mark lives
  // once, and it is true on every card. The lock and the ⋯ took the first
  // two when they were built; these are the rest.
  railSeat(starMark)
  railSeat(forkMark)
  railSeat(pinMark)
  railSeat(archiveMark)
  row.appendChild(main)
  row.appendChild(rail)

  // The way in is a double press on the card, so the only thing that has to
  // still be a target is a card being carried onto this one: the overlay is
  // drawn for that one moment (`data-note-drag`) and is out of the way, and
  // out of the hit test, the rest of the time.
  var enter = document.createElement('span')
  Object.assign(enter.style, BOARD_UI.cardEnter)
  enter.className = 'dshv-enter'
  enter.setAttribute('data-role', 'cardEnter')
  enter.setAttribute('aria-hidden', 'true')
  var enterWord = document.createElement('span')
  enterWord.setAttribute('data-role', 'cardEnterWord')
  enterWord.textContent = paletteText('boardCardEnterHint')
  enter.appendChild(boardIcon('enter', 16))
  // The band keeps its own word: a carry decides what letting go means, and a
  // band that had to be rebuilt for that would be a repaint under the hand.
  enter.enterWord = enterWord
  enter.appendChild(enterWord)
  card.appendChild(enter)
  BOARD.dropZones.push(enter)
  card.appendChild(row)
  // The two words stand on the card they belong to, so a press on one is a
  // press inside that card and never a carry of it.
  if (BOARD.verdictMenu === summary.id && stateAnchored) {
    var stateMenu = buildVerdictMenu(summary)
    card.appendChild(stateMenu)
    placeCardMenu(stateMenu, stateAnchored)
  }

  BOARD.nodes.push(card)
  return card
}

/**
 * Start typing a goal's name into its heading.
 * @param {string} key - the block's id.
 * @returns {void}
 */
function beginBlockRename(key) {
  BOARD.renamingBlock = key
  renderBoard()
}

/** Keep the name the heading says, and close the field. */
function commitBlockRename() {
  if (!BOARD.renamingBlock) return false
  var field = BOARD.renameBlockInput
  var key = BOARD.renamingBlock
  BOARD.renamingBlock = ''
  BOARD.renameBlockInput = null
  BOARD_STORE.setBlockLabel(key, field ? field.value : '')
  renderBoard()
  return true
}

/** Throw the typed name away, leaving the goal as it was called. */
function cancelBlockRename() {
  if (!BOARD.renamingBlock) return false
  BOARD.renamingBlock = ''
  BOARD.renameBlockInput = null
  renderBoard()
  return true
}

/**
 * The last piece of a workspace path: what the workspace is called.
 *
 * A goal renamed to what the reader is doing there still came from
 * somewhere, and the name of that somewhere is the whole of what the panel
 * owes about it.
 * @param {string} path - the workspace's path.
 * @returns {string} its last segment, or ''.
 */
function goalBaseName(path) {
  var parts = String(path || '').split(/[\\/]+/)
  for (var i = parts.length - 1; i >= 0; i--) {
if (parts[i]) return parts[i]
  }
  return ''
}

/**
 * Start writing what a goal is for.
 * @param {string} key - the block's id.
 * @returns {void}
 */
function beginGoalIntent(key) {
  BOARD.intentBlock = key
  renderBoard()
}

/**
 * Keep what the open line says, and close it.
 *
 * An empty line is a statement withdrawn: the goal stops being held by it,
 * and one with no conversations goes on the next paint. `paint` is false
 * only when the board is closing, where a repaint would draw a page that is
 * already on its way out.
 * @param {boolean} [paint] - false to write without repainting.
 * @returns {boolean} whether a line was open.
 */
function commitGoalIntent(paint) {
  if (!BOARD.intentBlock) return false
  var key = BOARD.intentBlock
  var field = BOARD.intentInput
  BOARD.intentBlock = ''
  BOARD.intentInput = null
  BOARD_STORE.setIntent(key, field ? field.value : '')
  if (paint !== false) renderBoard()
  return true
}

/** Throw the typed line away, leaving the goal as it was. */
function cancelGoalIntent() {
  if (!BOARD.intentBlock) return false
  BOARD.intentBlock = ''
  BOARD.intentInput = null
  renderBoard()
  return true
}

/**
 * Take one goal off the canvas, with a few seconds to bring it back.
 *
 * Nothing is deleted but the place: every conversation filed here goes back
 * to the goal its workspace gives it, which is the rule a card already
 * follows when it is carried into another goal. The notice offers the way
 * back, because a place that disappears under a mis-click must not be a
 * place the reader has to rebuild by hand.
 * @param {object} block - the goal being closed.
 * @returns {void}
 */
function removeBoardGoal(block) {
  if (!block || block.kind !== 'user') return
  var record = BOARD_STORE.removeGoal(block.key)
  if (!record) return
  if (BOARD.intentBlock === block.key) {
BOARD.intentBlock = ''
BOARD.intentInput = null
  }
  delete BOARD.drafts[block.key]
  var line = paletteText('boardGoalRemoved') + (record.label || paletteText('boardNewGoal'))
  if (record.moved) line = line + ' (' + record.moved + paletteText('boardGoalReleased') + ')'
  // The notice is a shortcut into the history, not a second way of undoing:
  // it holds the step it was made for, so a delete that happened after it
  // cannot be undone by pressing this notice.
  var command = BOARD_HISTORY.record({
label: paletteText('boardUndoGoal'),
undo: function () {
  BOARD_STORE.restoreGoal(record)
  if (BOARD.open) renderBoard()
},
redo: function () {
  BOARD_STORE.removeGoal(block.key)
  if (BOARD.open) renderBoard()
},
  })
  renderBoard()
  TOAST.sayAction(line, paletteText('boardGoalUndo'), BOARD_UNDO_MS, function () {
BOARD_HISTORY.undoTo(command)
  })
}

/**
 * Which drawn cards share a name, and where each one stands in its group.
 *
 * A name is a handle. Two conversations can honestly wear one - an untitled
 * conversation shows its workspace's name, and a branch inherits its
 * parent's - and the board cannot make them unique, because those names
 * belong to the conversations and renaming them is a write nobody asked for.
 * What it can do is say where this card stands among its namesakes, so a
 * reader looking at two identical lines can name the one they mean.
 *
 * Ordered by id rather than by time: an ordinal that renumbers itself the
 * moment a sibling is touched is worse than no ordinal at all. Nothing is
 * said when there is no collision, which is almost always.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {object} session id -> {at, of}, for the cards that collide.
 */
function boardNameCollisions(titles) {
  var groups = Object.create(null)
  var i
  for (i = 0; i < BOARD.rows.length; i++) {
var id = BOARD.rows[i].id
var name = titles[id] === undefined ? id : titles[id]
if (!groups[name]) groups[name] = []
groups[name].push(id)
  }
  var out = Object.create(null)
  for (var key in groups) {
if (!Object.prototype.hasOwnProperty.call(groups, key)) continue
var ids = groups[key]
if (ids.length < 2) continue
ids.sort()
for (i = 0; i < ids.length; i++) out[ids[i]] = { at: i + 1, of: ids.length }
  }
  return out
}

/**
 * Put the reader's word on a card before the shell has answered.
 *
 * The list is the truth, but it arrives a moment later. The word stands in
 * for it until the feed agrees, or until the shell has had time to answer at
 * all - a name the host silently dropped must not outlive the attempt.
 * @param {string} id - session id.
 * @param {string} title - the name that was sent.
 * @returns {void}
 */
function noteCardTitle(id, title) {
  BOARD.titles[id] = { title: title, at: Date.now() }
  if (BOARD.titleTimer) window.clearTimeout(BOARD.titleTimer)
  BOARD.titleTimer = window.setTimeout(function () {
BOARD.titleTimer = 0
BOARD.titles = Object.create(null)
if (BOARD.open) renderBoard()
  }, BOARD_TITLE_SETTLE_MS)
}

/**
 * Let go of the stand-in names the feed has caught up with, or outlived.
 * @param {Array<object>} pool - the conversations this paint will draw.
 * @returns {void}
 */
function settleTitles(pool) {
  var live = Object.create(null)
  var i
  for (i = 0; i < pool.length; i++) live[pool[i].id] = pool[i]
  for (var id in BOARD.titles) {
if (!Object.prototype.hasOwnProperty.call(BOARD.titles, id)) continue
var said = BOARD.titles[id]
var now = live[id]
if (!now) continue
if (String(now.displayTitle || '') === said.title) delete BOARD.titles[id]
else if (Date.now() - said.at > BOARD_TITLE_SETTLE_MS) delete BOARD.titles[id]
  }
}

/**
 * Start renaming one conversation from its card.
 * @param {string} id - session id.
 * @returns {void}
 */
function beginBoardRename(id) {
  if (BOARD_STORE.isSessionLocked(id)) {
showToast(paletteText('boardCardLocked'))
return
  }
  BOARD.renamingCard = id
  BOARD.renameCardDraft = null
  renderBoard()
}

/**
 * Keep what the open name field says, and rename the conversation.
 *
 * The rename goes through the same private-source hop the task window uses,
 * so renaming from the board never marks the conversation read. An empty
 * name is refused in place rather than sent to the host.
 * @returns {boolean} whether a field was open.
 */
function commitBoardRename() {
  if (!BOARD.renamingCard) return false
  var field = BOARD.renameCardInput
  var id = BOARD.renamingCard
  BOARD.renamingCard = ''
  BOARD.renameCardInput = null
  BOARD.renameCardDraft = null
  if (!field) {
renderBoard()
return true
  }
  var title = String(field.value || '').trim()
  if (!title) {
renderBoard()
showToast(paletteText('renameNoName'))
return true
  }
  // The card says the new name before the host is asked, so the rename reads
  // as done the moment Enter is pressed. The list settles it a moment later.
  noteCardTitle(id, title)
  renderBoard()
  renameSession(id, title, function (reason) {
if (!reason) {
  if (BOARD.open) renderBoard()
  return
}
// A refusal takes the stand-in name away and puts the field back, with
// what was typed still in it: the words are the reader's, and a failed
// rename must not eat them.
delete BOARD.titles[id]
BOARD.renameCardDraft = title
BOARD.renamingCard = id
showToast(reason)
if (BOARD.open) renderBoard()
  })
  return true
}

/** Throw the open name field away, leaving the conversation as it was. */
function cancelBoardRename() {
  if (!BOARD.renamingCard) return false
  BOARD.renamingCard = ''
  BOARD.renameCardInput = null
  BOARD.renameCardDraft = null
  renderBoard()
  return true
}

/**
 * Start a branch from one conversation, and draw the line when it lands.
 *
 * The host offers no parent on the child, so the pair is remembered here as
 * well as by the watcher: whichever path the fork took, the board can draw
 * the line it just watched. A source that needs migration is left to the
 * host to answer, and a refusal is said out loud rather than swallowed.
 * @param {object} summary - the conversation to fork.
 * @returns {void}
 */
function forkBoardCard(summary) {
  var services = taskServices()
  var controller = services && services.controller
  if (!controller || typeof controller.fork !== 'function') {
showToast(paletteText('boardForkUnavailable'))
return
  }
  // One branch per press. The mark stops answering for as long as the host
  // is making this one; a hand that presses twice out of impatience used to
  // get two children, and two children of one conversation are drawn as two
  // cards with one name.
  BOARD.forking[summary.id] = true
  if (BOARD.open) renderBoard()
  var result
  try {
result = controller.fork({ sessionId: summary.id, increaseTitle: true })
  } catch (error) {
console.warn('[dsh-vim] fork failed', error)
returnForkMark(summary.id)
showToast(paletteText('boardForkFailed'))
return
  }
  Promise.resolve(result).then(function (childId) {
// `rememberFork` repaints: the line, the child, and the goal it was filed
// in all come from that one paint. What it cannot do is show a card in a
// panel scrolled out of sight, so the new branch is brought into view
// here, after the paint that drew it.
rememberFork(summary.id, childId)
if (BOARD.open) revealBoardCard(childId)
// The host names a branch by incrementing its parent's own title, which
// leaves two branches of one conversation with one name between them -
// and leaves an untitled parent's child called nothing new at all. The
// board is the only party holding the whole list, so it settles the
// name here and says which one the branch got.
return settleBranchName(childId)
  }).then(function (named) {
returnForkMark(summary.id)
if (named) showToast(paletteText('boardForkDone') + named)
  }, function (error) {
console.warn('[dsh-vim] fork failed', error)
returnForkMark(summary.id)
showToast(paletteText('boardForkFailed'))
  })
}

/** Let a conversation's branch mark answer again, and say so on the card. */
function returnForkMark(id) {
  delete BOARD.forking[id]
  if (BOARD.open) renderBoard()
}

/**
 * The catalogue row for one conversation, asked for until it arrives.
 *
 * The host resolves a fork before it publishes the child's row, so the list
 * read the instant the promise settles is a list without the branch in it.
 * The wait is bounded and silent: a host that never publishes the row costs
 * one card the host's own name and nothing else.
 * @param {string} id - session id.
 * @param {number} tries - how many more times to ask.
 * @returns {Promise<object|undefined>} the row, or undefined when it never came.
 */
function waitForBranchRow(id, tries) {
  var pool = conversationPool()
  for (var i = 0; i < pool.length; i++) {
if (pool[i].id === id) return Promise.resolve(pool[i])
  }
  if (tries <= 0) return Promise.resolve(undefined)
  return new Promise(function (resolve) {
window.setTimeout(function () {
  resolve(waitForBranchRow(id, tries - 1))
}, 60)
  })
}

/**
 * Give a fresh branch a name nobody else is using, and answer with it.
 *
 * A branch inherits its parent's title, and the host increments a trailing
 * number before it resolves - but it increments the *parent's* title, so the
 * second branch cut from one conversation carries exactly the words the
 * first one got, and a parent with no title of its own passes on nothing at
 * all. Neither is a name a reader can use: two cards answering to the same
 * words leave them with nothing to say when they want one of them. The board
 * reads the child back, and when the name is already spoken for it takes the
 * next free number in the same shape the host uses - the same edit, carried
 * one step further.
 *
 * Answers '' when the child could not be read in time or its name is already
 * its own; the card then says which of several same-named cards it is (see
 * `boardNameCollisions`), which is the fallback rather than the goal.
 * @param {string} childId - the branch's session id.
 * @returns {Promise<string>} the name the branch wears, or '' for unknown.
 */
function settleBranchName(childId) {
  // Two titles the board may not touch: the reader turned the switch off,
  // or locked this one. In both cases the card falls back to saying which
  // of several same-named branches it is, rather than being renamed.
  if (settings.autoRename === false) return Promise.resolve('')
  if (BOARD_STORE.isSessionLocked(childId)) return Promise.resolve('')
  return waitForBranchRow(childId, 24).then(function (child) {
    if (!child) return ''
    var title = String(child.displayTitle || '')
    var taken = Object.create(null)
    var pool = conversationPool()
    var i
    for (i = 0; i < pool.length; i++) {
      if (pool[i].id === childId) continue
      taken[String(pool[i].displayTitle || pool[i].id)] = true
    }
    if (!title || !taken[title]) return title
    // The base is the title without the number the host just added, so the
    // child reads as the next of its parent's branches rather than as a
    // fresh series of its own.
    var base = title.replace(/\s*[(\uFF08]\d+[)\uFF09]\s*$/, '') || title
    var n = 1
    while (taken[base + ' (' + n + ')']) n = n + 1
    var next = base + ' (' + n + ')'
    noteCardTitle(childId, next)
    if (BOARD.open) renderBoard()
    renameSession(childId, next, function (reason) {
      if (reason) console.warn('[dsh-vim] branch rename refused', reason)
    })
    return next
  }).then(null, function (error) {
    console.warn('[dsh-vim] branch name could not be settled', error)
    return ''
  })
}

/**
 * Put words in the message box of the conversation on screen.
 *
 * The box belongs to a conversation, so the switch has to land before
 * anything is put in it: right after one the previous box can still be
 * mounted, and a draft typed there would go to the wrong conversation. The
 * words arrive as a paste, not as a replaced draft: whatever the reader had
 * already typed stays where it was.
 * @param {string} text - what to put in the box, trimmed.
 * @param {string} [sessionId] - the conversation the box must belong to.
 * @returns {Promise<boolean>} whether the words landed.
 */
function pasteIntoComposer(text, sessionId) {
  return new Promise(function (resolve) {
    var tries = 0
    putInBox()

    function putInBox() {
      var root = composerRoot()
      var here = sessionId ? currentSession() : null
      var arrived = !sessionId || !here || here.id === sessionId
      if (!root || !arrived) {
        if (tries < 24) {
          tries = tries + 1
          window.setTimeout(putInBox, 60)
          return
        }
        resolve(false)
        return
      }
      focusComposer()
      seatCaretAtEnd(root)
      var already = boxTakesBreak(root, sessionId)
      var words = already ? BLANK_LINE + text : text
      Promise.resolve(writeIntoBox(root, words)).then(function (landed) {
        if (landed) noteBoxWritten(root, sessionId, words)
        resolve(landed)
      })
    }
  })
}

/**
 * Whether the message box already holds something.
 * @returns {boolean} whether there are words in the box.
 */
function composerHasText() {
  return boxHasText(composerRoot())
}

/** Two line breaks: the blank line Markdown puts between two blocks. */
var BLANK_LINE = String.fromCharCode(10, 10)

/** How much text a box holds, by whichever reading it answers. */
function boxLength(root) {
  if (!root) return 0
  var words = typeof root.value === 'string' ? root.value : String(root.textContent || '')
  return words.length
}

/**
 * Put words in a box, breaks and all.
 *
 * A run with a break in it goes through the editor's own paste: a rich
 * editor builds its paragraphs from the blocks a paste carries, while the
 * editing commands can type text but cannot press its Enter - the paragraph
 * command writes into the DOM under the editor's feet, and an editor that
 * owns its document drops it, which is how two cards used to arrive glued
 * together in one paragraph.
 *
 * The paste is read back rather than trusted: an editor that ignores the
 * event leaves the box as it was, and only then is the text typed in, as the
 * one path this host has been seen to take. The reading waits for the editor
 * to commit, because a rich editor applies what it was told on its own beat.
 * @param {Element} root - the editor root.
 * @param {string} words - what to put in it, breaks included.
 * @returns {boolean|Promise<boolean>} whether the box took it, answered in
 *   the same turn when it was typed, and after the editor has committed when
 *   it was pasted.
 */
function writeIntoBox(root, words) {
  // A box that simply types answers in the same turn: the press that asked
  // is the press that lands, which is what an editor with no paste of its
  // own - or a plain textarea - has always done here.
  if (words.indexOf('\n') === -1) return putThroughEditor(root, words)
  var before = boxLength(root)
  if (!pasteThroughEvent(root, words)) return putThroughEditor(root, words)
  return new Promise(function (resolve) {
    window.setTimeout(function () {
      if (boxLength(root) > before) {
        noteHandoffDiag({ at: Date.now(), how: 'paste', ok: true, after: boxShape(root) })
        resolve(true)
        return
      }
      noteHandoffDiag({ at: Date.now(), how: 'paste-empty', ok: false, after: boxShape(root) })
      resolve(putThroughEditor(root, words))
    }, 0)
  })
}

/**
 * The boxes this plugin has written into, by conversation, and when.
 *
 * A rich editor commits on its own beat, so the DOM can still read empty a
 * moment after the words were taken. The second card of a hand-over must
 * not be told it is the first just because of that: this is the fact the
 * separator is decided on, rather than the box's own reading.
 */
var HANDOFF_WROTE = Object.create(null)

/** How long our own write counts as words the next card has to follow. */
var HANDOFF_WROTE_MS = 60 * 1000

/**
 * Whether a hand-over has to start a block of its own.
 *
 * Read off the box first - the reader's own typing is the surest content -
 * and then off what this plugin itself put there. The second reading is
 * asked of the editor rather than assumed: our own words still count only
 * while the box still shows them, so a draft the reader has sent or cleared
 * does not leave a blank line at the top of the next one.
 * @param {Element} root - the editor root.
 * @param {string} sessionId - the conversation the box belongs to.
 * @returns {boolean} whether a blank line goes first.
 */
function boxTakesBreak(root, sessionId) {
  if (!root) return false
  if (boxHasText(root)) return true
  var wrote = HANDOFF_WROTE[sessionId]
  if (!wrote || wrote.root !== root) return false
  var said = String(wrote.said || '')
  if (said && Date.now() - wrote.at < HANDOFF_WROTE_MS && String(root.textContent || '').indexOf(said) >= 0) return true
  delete HANDOFF_WROTE[sessionId]
  return false
}

/**
 * Note that this plugin has just put words in a conversation's box.
 *
 * What is kept is the last line it wrote: that is the part a later hand-over
 * can look for in the box to tell "still there" from "already sent".
 * @param {Element} root - the editor root.
 * @param {string} sessionId - the conversation the box belongs to.
 * @param {string} words - what was written.
 * @returns {void}
 */
function noteBoxWritten(root, sessionId, words) {
  if (!root || !sessionId) return
  var lines = String(words || '').split('\n')
  var said = ''
  for (var i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      said = lines[i].trim().slice(0, 40)
      break
    }
  }
  HANDOFF_WROTE[sessionId] = { root: root, at: Date.now(), said: said }
}

/**
 * Whether one box already holds words.
 *
 * Read on the box that is actually about to be written into, not on
 * whichever box was remembered when the gesture started: a hand-over opens
 * the conversation first, and the box it lands in is that one.
 * @param {Element} root - the editor root.
 * @returns {boolean} whether there are words in it.
 */
function boxHasText(root) {
  if (!root) return false
  var words = typeof root.value === 'string' ? root.value : String(root.textContent || '')
  return words.replace(/\s+/g, '') !== ''
}

/**
 * Put the caret at the end of the box's content.
 *
 * A hand-over appends: the reader's own draft keeps its place at the top,
 * and the thought arrives after it rather than in the middle of a sentence.
 * A host without a selection API simply keeps whatever caret it has.
 * @param {Element} root - the editor root.
 * @returns {void}
 */
function seatCaretAtEnd(root) {
  if (!root) return
  // A plain textarea answers its own way: a range over its contents is not
  // what moves its caret.
  if (typeof root.setSelectionRange === 'function' && typeof root.value === 'string') {
    try {
      root.setSelectionRange(root.value.length, root.value.length)
      return
    } catch (error) {
      // Fall through to the range, which is what a rich editor wants.
    }
  }
  try {
    if (!window.getSelection || typeof document.createRange !== 'function') return
    var range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    var selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  } catch (error) {
    // A host that refuses the range keeps its own caret; the words still land.
  }
}

/**
 * Put the caret at the start of the box's content.
 *
 * The mirror of `seatCaretAtEnd`, and it exists for the one thing the box
 * gains from being written into at the top: a title goes above whatever the
 * reader has already typed, and typing into a box is the only way this host
 * has accepted words without replacing the draft.
 * @param {Element} root - the editor root.
 * @returns {void}
 */
function seatCaretAtStart(root) {
  if (!root) return
  if (typeof root.setSelectionRange === 'function' && typeof root.value === 'string') {
    try {
      root.setSelectionRange(0, 0)
      return
    } catch (error) {
      // Fall through to the range, which is what a rich editor wants.
    }
  }
  try {
    if (!window.getSelection || typeof document.createRange !== 'function') return
    var range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(true)
    var selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  } catch (error) {
    // A host that refuses the range keeps its own caret; the words still land.
  }
}

/**
 * Put a title the reader just wrote at the top of the message box.
 *
 * The title travels as the message's first line, a blank line below it, and
 * whatever the reader had already typed after that: the host has nowhere to
 * keep a title otherwise, and a first line is what every reader and every
 * model already sees. Enter in the field is the press that means this, so
 * the field is emptied only once the box has taken the words — a box that
 * refuses them leaves the line where the reader can try again.
 * @param {Element} input - the title field.
 * @returns {boolean} whether the box took the title.
 */
function commitComposerTitle(input) {
  var title = String((input && input.value) || '').replace(/\s+/g, ' ').trim()
  if (!title) return false
  var root = composerRoot()
  if (!root || !isComposerEditor(root)) {
    showToast(paletteText('composerTitleNoBox'))
    return false
  }
  // A plain field answers its own way: its value is the draft, and the
  // selection range is where the words go. Read off the tag rather than off
  // a value property, because a host's editor root may carry one too.
  var plain = root.tagName === 'TEXTAREA' || root.tagName === 'INPUT'
  if (plain) {
    root.value = title + BLANK_LINE + root.value
    try {
      if (typeof root.dispatchEvent === 'function') {
        root.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } catch (error) {
      /* a host that refuses the event still has the words */
    }
    input.value = ''
    return true
  }
  focusComposer()
  seatCaretAtStart(root)
  var typed = putThroughEditor(root, title + BLANK_LINE)
  seatCaretAtEnd(root)
  if (!typed) return false
  input.value = ''
  return true
}

/** The conversations with a hand-over in flight, so one flush is not two. */
var HANDOFF_FLUSHING = Object.create(null)

/**
 * Put a conversation's waiting hand-over into its message box.
 *
 * This is the paste the drop used to do, moved to the moment the box
 * exists: the caret goes to the end, a box that already holds words gets a
 * blank line first, and the cards arrive in the order they were handed
 * over. Nothing is sent, and nothing is opened - the reader is wherever
 * they were, which is what makes the second card possible.
 * @param {string} sessionId - the conversation whose box should take it.
 * @returns {boolean} whether a flush was started.
 */
function flushHandoff(sessionId) {
  var id = String(sessionId || '')
  if (!id || HANDOFF_FLUSHING[id]) return false
  var words = HANDOFF_STORE.pending(id)
  if (!words.length) return false
  HANDOFF_FLUSHING[id] = true
  var text = words.join(BLANK_LINE)
  noteHandoffDiag({
    at: Date.now(),
    how: 'flush',
    cards: words.length,
    lines: text.split('\n').length,
    current: (currentSession() || {}).id || '',
    box: !!composerRoot(),
  })
  // Every ending goes through here: the words landed, or they are still
  // waiting. The guard is released in the same turn the paste lands, so the
  // next press is never swallowed by a promise that has not been read yet.
  function settle(landed) {
    delete HANDOFF_FLUSHING[id]
    if (!landed) {
      showToast(paletteText('boardHandoffWaiting'))
      return
    }
    var left = HANDOFF_STORE.take(id, words.length)
    // The name follows the words, as it did when a drop pasted them on the
    // spot: the newest card is the one the conversation turned out to be
    // about.
    nameSessionForCard(id, words[words.length - 1])
    showToast(paletteText('boardHandoffLanded'))
    // A card let go while these were landing has its own block after them:
    // it is flushed now, with its own blank line, rather than left for the
    // next time the conversation is opened.
    if (left) flushHandoff(id)
  }
  // A box that is already on screen takes the words in the press that asks
  // for them; only a box that still has to mount needs the waiting paste.
  var now = pasteIntoBoxNow(text, id)
  if (now === null || now === false) {
    pasteIntoComposer(text, id).then(settle, function () {
      delete HANDOFF_FLUSHING[id]
    })
    return true
  }
  if (now === true) {
    settle(true)
    return true
  }
  now.then(settle, function () {
    delete HANDOFF_FLUSHING[id]
  })
  return true
}

/**
 * Put words in the box that is on screen right now, if it is the right one.
 *
 * The hand-over's own quick path: a conversation whose box is already up -
 * the floating board over its conversation, or a check's fake page - takes
 * the words without waiting for a retry loop that would only find the same
 * box. A box belonging to another conversation is refused, because the
 * words were meant for a particular one.
 * @param {string} text - what to put in the box.
 * @param {string} sessionId - the conversation the box must belong to.
 * @returns {boolean|Promise<boolean>|null} whether the words landed - in the
 *   same turn when they were typed - or null when the box on screen is not
 *   the one they were meant for.
 */
function pasteIntoBoxNow(text, sessionId) {
  var root = composerRoot()
  if (!root) return null
  var here = sessionId ? currentSession() : null
  if (here && here.id !== sessionId) return null
  focusComposer()
  seatCaretAtEnd(root)
  // The words land at the end of the box, after a blank line when the reader
  // has already written there: two breaks, the way Markdown separates two
  // blocks. One break would read as finishing their sentence.
  var already = boxTakesBreak(root, sessionId)
  var words = already ? BLANK_LINE + text : text
  var landed = writeIntoBox(root, words)
  if (landed && typeof landed.then === 'function') {
    return landed.then(function (took) {
      if (took) noteBoxWritten(root, sessionId, words)
      return took
    })
  }
  if (landed) noteBoxWritten(root, sessionId, words)
  return landed
}

/**
 * TEMPORARY: where a hand-over leaves the facts of what it did to the box,
 * so the shape of this editor's answer can be read after the fact.
 */
var DIAG_KEY = NS + '/diag/v1'

/**
 * TEMPORARY: one box, read small enough to keep a few of.
 * @param {Element} root - the editor root.
 * @returns {object|null} its text length, its child count, and its opening HTML.
 */
function boxShape(root) {
  if (!root) return null
  var html = ''
  try {
    html = String(root.innerHTML || '')
  } catch (error) {
    html = ''
  }
  return {
    text: String(root.textContent || '').length,
    kids: root.childNodes ? root.childNodes.length : -1,
    html: html.slice(0, 200),
  }
}

/**
 * TEMPORARY: every editable the page offers, read short.
 * @returns {Array<object>} one entry per editable, at most six.
 */
function editablesNow() {
  var out = []
  try {
    var list = document.querySelectorAll('[contenteditable="true"], [data-lexical-editor="true"]')
    for (var i = 0; i < list.length && i < 6; i++) {
      var el = list[i]
      out.push({
        tag: el.tagName,
        lex: el.getAttribute('data-lexical-editor'),
        conn: el.isConnected,
        focused: el === document.activeElement,
        text: String(el.textContent || '').length,
        kids: el.childNodes ? el.childNodes.length : -1,
        html: String(el.innerHTML || '').slice(0, 120),
      })
    }
  } catch (error) {
    out.push({ error: String(error && error.message) })
  }
  return out
}

/**
 * TEMPORARY: what one element is, and whether it is the focused one.
 * @param {Element} el - the element.
 * @returns {object|null} its name.
 */
function describeEl(el) {
  if (!el) return null
  return {
    tag: el.tagName,
    lex: el.getAttribute('data-lexical-editor'),
    ce: el.getAttribute('contenteditable'),
    conn: el.isConnected,
    focused: el === document.activeElement,
    cls: String(el.className || '').slice(0, 80),
  }
}

/**
 * TEMPORARY: where the caret is, and whether that is inside the box.
 * @param {Element} root - the box the words were meant for.
 * @returns {object|null} the caret's home.
 */
function caretsNow(root) {
  try {
    var selection = window.getSelection && window.getSelection()
    if (!selection) return null
    var node = selection.anchorNode
    return {
      tag: node ? node.nodeName : '',
      inside: !!(root && node && root.contains && root.contains(node)),
      text: String(selection).slice(0, 40),
    }
  } catch (error) {
    return null
  }
}

/**
 * TEMPORARY: keep the last few hand-overs' facts.
 * @param {object} entry - what happened.
 * @returns {void}
 */
function noteHandoffDiag(entry) {
  try {
    var all = []
    try {
      all = JSON.parse(window.localStorage.getItem(DIAG_KEY) || '[]')
    } catch (error) {
      all = []
    }
    if (!Array.isArray(all)) all = []
    all.push(entry)
    window.localStorage.setItem(DIAG_KEY, JSON.stringify(all.slice(-6)))
  } catch (error) {
    // A diagnostic that throws is not worth a word.
  }
}

/**
 * Put text into the editor the way typing would.
 *
 * A line break in a rich editor is a block boundary, not a character inside
 * a text run: one insert carrying "\n" leaves both sides in the same
 * paragraph, which is how two cards handed over one after the other used to
 * arrive on one line. So the text is typed line by line with a paragraph
 * break between the lines, and every character arrives as typing, which is
 * what keeps the draft's own history and the shell's placeholder in step.
 * @param {Element} root - the editor root the words are meant for.
 * @param {string} text - what to insert.
 * @returns {boolean} whether the editor took it.
 */
function putThroughEditor(root, text) {
  if (typeof document.execCommand !== 'function') return false
  var before = boxShape(root)
  var commands = []
  /** Type one line, and say whether the editor took it. */
  function typeLine(line) {
    commands.push('insertText')
    try {
      return !!document.execCommand('insertText', false, line)
    } catch (error) {
      return false
    }
  }
  var words = String(text === null || text === undefined ? '' : text)
  var lines = words.split('\n')
  var typed = false
  if (lines.length === 1) {
    typed = typeLine(words)
  } else {
    try {
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) {
          commands.push('insertParagraph')
          document.execCommand('insertParagraph', false, null)
        }
        if (!lines[i]) {
          typed = true
          continue
        }
        if (!typeLine(lines[i])) break
        typed = true
      }
    } catch (error) {
      // Whatever landed stays landed; a later line simply did not.
    }
  }
  noteHandoffDiag({
    at: Date.now(),
    how: 'typing',
    typed: typed,
    want: lines.length - 1,
    commands: commands,
    before: before,
    after: boxShape(root),
    root: describeEl(root),
    carets: caretsNow(root),
    editables: editablesNow(),
  })
  // The editor commits on its own beat, so the box is read again after it
  // has had one: what is there now is the answer, what was there before is
  // only the promise of it.
  window.setTimeout(function () {
    noteHandoffDiag({
      at: Date.now(),
      how: 'later',
      after: boxShape(root),
      carets: caretsNow(root),
      editables: editablesNow(),
    })
  }, 300)
  return typed
}

/**
 * Put text into the editor as a real paste event.
 *
 * The honest fallback when the editing command is unavailable: it is the
 * same event a copy-and-paste fires, so the host's own handler decides what
 * to do with it.
 * @param {Element} root - the editor root.
 * @param {string} text - what to paste.
 * @returns {boolean} whether the event was dispatched.
 */
function pasteThroughEvent(root, text) {
  try {
    if (typeof ClipboardEvent !== 'function' || typeof DataTransfer !== 'function') return false
    var data = new DataTransfer()
    data.setData('text/plain', text)
    // A text run cannot carry a break: give the paste the blocks too, so a
    // rich editor reads the cards as paragraphs rather than as one line.
    data.setData('text/html', String(text).split('\n').map(function (line) {
      return '<p>' + line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;') + '</p>'
    }).join(''))
    root.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }))
    return true
  } catch (error) {
    console.warn('[dsh-vim] could not put the words in the message box', error)
    return false
  }
}

/**
 * One card from the board's own document, by id.
 *
 * The focus sheet reads the store rather than a node: a paint can land
 * under it while it is open, and the words it is showing are the store's,
 * not a card element's.
 * @param {string} id - the card.
 * @returns {object|null} the card, or null when it is gone.
 */
function ideaFocusCard(id) {
  if (!id) return null
  var all = BOARD_STORE.cards()
  for (var i = 0; i < all.length; i++) {
if (all[i].id === id) return all[i]
  }
  return null
}

/**
 * Where a press happened, as a point the sheet can grow out of.
 *
 * The double click already carries the point the reader aimed at. A press on
 * a card carries one too; a menu pick has no pointer of its own, so the
 * mark it came from stands in. A host without layout answers nothing, and
 * the sheet simply appears in its place.
 * @param {object} [ev] - the press, when there was one.
 * @param {Element} [node] - the element to take the centre of otherwise.
 * @returns {{clientX: number, clientY: number}|null} the point.
 */
function ideaFocusOrigin(ev, node) {
  var x = ev ? Number(ev.clientX) : NaN
  var y = ev ? Number(ev.clientY) : NaN
  if (isFinite(x) && isFinite(y)) return { clientX: x, clientY: y }
  if (!node || typeof node.getBoundingClientRect !== 'function') return null
  var rect = node.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) return null
  return {
clientX: Number(rect.left) + Number(rect.width) / 2,
clientY: Number(rect.top) + Number(rect.height) / 2,
  }
}

/**
 * Let the sheet grow out of the place the reader pointed at.
 *
 * A window that appears already finished makes the eye hunt for where the
 * press went; the card-sized thumbnail travelling from the double click to
 * the centre is the gesture's own answer. One frame loop, the same kind the
 * tidy glide uses, and no motion at all when the system asks for less.
 * @param {Element} host - the scrim.
 * @param {Element} sheet - the sheet inside it.
 * @param {object|null} origin - the client point it comes from.
 * @returns {void}
 */
function animateIdeaFocusIn(host, sheet, origin) {
  if (!origin || reducedMotion()) return false
  if (typeof window.requestAnimationFrame !== 'function') return false
  var panel = BOARD.panel
  var rect = panel && typeof panel.getBoundingClientRect === 'function'
? panel.getBoundingClientRect()
: null
  if (!rect || !rect.width || !rect.height) return false
  var dx = Number(origin.clientX) - Number(rect.left) - rect.width / 2
  var dy = Number(origin.clientY) - Number(rect.top) - rect.height / 2
  host.style.opacity = '0.35'
  sheet.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.14)'
  sheet.style.opacity = '0.2'
  sheet.setAttribute('data-opening', 'true')
  var started = 0
  function step(now) {
if (BOARD.ideaFocusHost !== host) return
if (!started) started = now
var at = Math.min(1, (now - started) / 320)
var eased = 1 - Math.pow(1 - at, 3)
host.style.opacity = String(0.35 + 0.65 * eased)
sheet.style.transform = 'translate(' + (dx * (1 - eased)) + 'px, '
  + (dy * (1 - eased)) + 'px) scale(' + (0.14 + 0.86 * eased) + ')'
sheet.style.opacity = String(0.2 + 0.8 * eased)
if (at < 1) {
  BOARD.ideaFocusRaf = window.requestAnimationFrame(step)
  return
}
host.style.opacity = ''
sheet.style.transform = ''
sheet.style.opacity = ''
if (typeof sheet.removeAttribute === 'function') sheet.removeAttribute('data-opening')
BOARD.ideaFocusRaf = 0
  }
  BOARD.ideaFocusRaf = window.requestAnimationFrame(step)
  return true
}

/**
 * The name of the conversation a thought is tied to, for the sheet's foot.
 * @param {string} id - the conversation.
 * @returns {string} its name, or '' when it is not on this board.
 */
function ideaFocusSessionTitle(id) {
  if (!id) return ''
  // A thought can be tied to a conversation standing in the work, in the
  // finished strip, or on a quiet line: all three are on this board, and the
  // sheet should call each by its name.
  for (var b = 0; b < BOARD.blocks.length; b++) {
var block = BOARD.blocks[b]
var groups = [block.rows || [], block.done || [], block.quiet || []]
for (var g = 0; g < groups.length; g++) {
  for (var i = 0; i < groups[g].length; i++) {
    if (groups[g][i].id === id) return boardTitleOf(groups[g][i])
  }
}
  }
  return ''
}

/**
 * Keep the sheet's done box in step with the card it belongs to.
 * @returns {void}
 */
function paintIdeaFocusDone() {
  var node = BOARD.ideaFocusDone
  if (!node) return
  var card = ideaFocusCard(BOARD.ideaFocus)
  if (!card) return
  Object.assign(node.style, BOARD_UI.ideaFocusDone)
  if (card.done) Object.assign(node.style, BOARD_UI.ideaFocusDoneOn)
  node.setAttribute('aria-pressed', card.done ? 'true' : 'false')
  node.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
  node.textContent = card.done ? '\u2713' : ''
}

/**
 * Keep the title on one line while letting it wrap on the paper.
 *
 * The title is a field because it has to be typed into, but it is read as
 * the first line of the note: Enter belongs to the body, and a pasted line
 * break is a space rather than a second title.
 * @param {Element} title - the title field.
 * @returns {void}
 */
function cleanIdeaTitle(title) {
  if (!title) return
  var clean = String(title.value || '').replace(/\s*\n+\s*/g, ' ')
  if (clean === title.value) return
  title.value = clean
}

/** Let the title field take as many lines as the words it is showing. */
function growIdeaTitle() {
  var title = BOARD.ideaFocusTitle
  if (!title) return
  var words = String(title.value || '')
  var rows = Math.max(1, Math.min(5, Math.ceil(words.length / 34)))
  if (title.getAttribute('rows') !== String(rows)) title.setAttribute('rows', String(rows))
  if (typeof title.scrollHeight === 'number' && title.scrollHeight > 0) {
title.style.height = Math.min(title.scrollHeight, 160) + 'px'
  }
}

/**
 * Write what the sheet says into the card it belongs to.
 *
 * An existing card is written through as the reader types: the sheet is a
 * bigger seat for the same words, not a form with a save step. A new
 * thought has no card yet, so its words stay in the fields until it lands.
 * @returns {boolean} whether an existing card took the words.
 */
function writeIdeaFocus() {
  if (!BOARD.ideaFocus) return false
  var card = ideaFocusCard(BOARD.ideaFocus)
  if (!card) return false
  var title = BOARD.ideaFocusTitle ? BOARD.ideaFocusTitle.value : ''
  var body = BOARD.ideaFocusBody ? BOARD.ideaFocusBody.value : ''
  BOARD_STORE.setCardText(card.id, boardJoinText(title, body))
  return true
}

/**
 * Open one idea card, or a blank new one, in the centre of the board.
 *
 * This is the one gesture every editable idea card shares: a press on the
 * paper, a press on the card's name, the ⋯ menu, a line in the tray, and
 * the two ways of starting a new thought all land here. A new sheet is a
 * draft - no card exists until it closes with something in it - and the
 * place it lands is the place the double click named.
 * @param {string} id - the card, or '' for a new thought.
 * @param {string} [field] - 'title' or 'body' to put the caret in.
 * @param {object} [opts] - `x`, `y` for a new card's place, and `origin`
 *   for the point the sheet should grow from.
 * @returns {boolean} whether the sheet opened.
 */
function openIdeaFocus(id, field, opts) {
  if (!BOARD.open || !BOARD.panel) return false
  var card = id ? ideaFocusCard(id) : null
  if (id && !card) return false
  var at = {
x: Math.max(0, Math.round(Number(opts && opts.x) || 0)),
y: Math.max(0, Math.round(Number(opts && opts.y) || 0)),
  }
  if (BOARD.ideaFocusHost) {
if (id && BOARD.ideaFocus === id) {
  var held = field === 'title' ? BOARD.ideaFocusTitle : BOARD.ideaFocusBody
  if (held && typeof held.focus === 'function') held.focus()
  return true
}
// One sheet at a time: the previous one is settled by its own rules
// before the next press is answered.
closeIdeaFocus({ paint: false })
  }
  closeIdeaMenu()
  closeSessionMenu()
  closeSeatMenu()
  closeGoalMenu()
  closeVerdictMenu()

  var parts = noteParts(card ? card.text : '')
  var origin = opts && opts.origin ? opts.origin : null
  var host = document.createElement('div')
  Object.assign(host.style, BOARD_UI.ideaFocusBackdrop)
  host.setAttribute('data-role', 'ideaFocus')
  var sheet = document.createElement('div')
  Object.assign(sheet.style, BOARD_UI.ideaFocusSheet)
  sheet.className = 'dshv-idea-focus'
  sheet.setAttribute('data-role', 'ideaFocusSheet')
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-label', paletteText(card ? 'boardIdeaFocusLabel' : 'boardIdeaNewLabel'))

  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.ideaFocusHead)
  var dot = document.createElement('span')
  Object.assign(dot.style, BOARD_UI.ideaFocusDot)
  dot.setAttribute('aria-hidden', 'true')
  head.appendChild(dot)
  var label = document.createElement('span')
  Object.assign(label.style, BOARD_UI.ideaFocusLabel)
  label.textContent = paletteText(card ? 'boardIdeaFocusLabel' : 'boardIdeaNewLabel')
  head.appendChild(label)
  var spacer = document.createElement('span')
  Object.assign(spacer.style, BOARD_UI.ideaFocusSpacer)
  head.appendChild(spacer)

  var done = null
  if (card) {
done = document.createElement('span')
Object.assign(done.style, BOARD_UI.ideaFocusDone)
done.className = 'dshv-done-toggle'
done.setAttribute('role', 'button')
done.setAttribute('data-role', 'cardDoneToggle')
done.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  var now = ideaFocusCard(card.id)
  if (!now) return
  BOARD_STORE.setCardDone(card.id, !now.done)
  paintIdeaFocusDone()
  if (BOARD.open) renderBoard()
})
head.appendChild(done)
  }
  var close = document.createElement('span')
  Object.assign(close.style, BOARD_UI.ideaFocusClose)
  close.setAttribute('role', 'button')
  close.setAttribute('data-role', 'ideaFocusClose')
  close.setAttribute('title', paletteText('boardIdeaClose'))
  close.setAttribute('aria-label', paletteText('boardIdeaClose'))
  close.textContent = '\u00d7'
  close.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
closeIdeaFocus({ paint: true })
  })
  head.appendChild(close)
  sheet.appendChild(head)

  var title = document.createElement('textarea')
  Object.assign(title.style, BOARD_UI.ideaFocusTitle)
  title.setAttribute('rows', '1')
  title.setAttribute('data-role', 'cardTitleInput')
  title.setAttribute('data-no-drag', 'true')
  title.setAttribute('aria-label', paletteText('boardNoteTitleHint'))
  title.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
  title.value = parts.title
  title.addEventListener('input', function () {
cleanIdeaTitle(title)
growIdeaTitle()
writeIdeaFocus()
  })
  title.addEventListener('keydown', function (ev) {
var key = ev && ev.key ? String(ev.key) : ''
if (key === 'Enter') {
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
  if (body && typeof body.focus === 'function') body.focus()
  return
}
if (key === 'Escape') {
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
  closeIdeaFocus({ paint: true })
}
  })
  sheet.appendChild(title)

  var body = document.createElement('textarea')
  Object.assign(body.style, BOARD_UI.ideaFocusBody)
  body.setAttribute('data-role', 'cardText')
  body.setAttribute('data-no-drag', 'true')
  body.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
  body.setAttribute('placeholder', paletteText('boardCardPlaceholder'))
  body.value = parts.body
  body.addEventListener('input', function () {
writeIdeaFocus()
  })
  body.addEventListener('keydown', function (ev) {
var key = ev && ev.key ? String(ev.key) : ''
if (key === 'Escape') {
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
  closeIdeaFocus({ paint: true })
  return
}
if ((ev.ctrlKey || ev.metaKey) && key === 'Enter') {
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
  closeIdeaFocus({ paint: true })
}
  })
  sheet.appendChild(body)

  var meta = document.createElement('div')
  Object.assign(meta.style, BOARD_UI.ideaFocusMeta)
  meta.setAttribute('data-role', 'ideaFocusMeta')
  if (!card) {
meta.textContent = paletteText('boardIdeaNewHint')
  } else if (card.link) {
var linked = ideaFocusSessionTitle(card.link)
meta.textContent = linked
  ? paletteText('boardCardLinked') + linked
  : paletteText('boardCardLinkedUnknown')
  }
  sheet.appendChild(meta)

  var actions = document.createElement('div')
  Object.assign(actions.style, BOARD_UI.ideaFocusActions)
  var keys = document.createElement('span')
  Object.assign(keys.style, BOARD_UI.ideaFocusKeys)
  keys.textContent = paletteText(card ? 'boardIdeaKeys' : 'boardIdeaKeysNew')
  actions.appendChild(keys)
  if (card && card.link) {
var deliver = document.createElement('span')
Object.assign(deliver.style, BOARD_UI.ideaFocusGhost)
deliver.setAttribute('role', 'button')
deliver.setAttribute('data-role', 'ideaFocusDeliver')
deliver.setAttribute('title', paletteText('boardCardDeliverHint'))
deliver.textContent = paletteText('boardCardEnterHint')
deliver.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  deliverIdeaFocus()
})
actions.appendChild(deliver)
  }
  if (!card) {
var cancel = document.createElement('span')
Object.assign(cancel.style, BOARD_UI.ideaFocusGhost)
cancel.setAttribute('role', 'button')
cancel.setAttribute('data-role', 'ideaFocusCancel')
cancel.textContent = paletteText('boardIdeaCancel')
cancel.addEventListener('click', function (ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  closeIdeaFocus({ discard: true, paint: true })
})
actions.appendChild(cancel)
  }
  var confirm = document.createElement('span')
  Object.assign(confirm.style, BOARD_UI.ideaFocusPrimary)
  confirm.setAttribute('role', 'button')
  confirm.setAttribute('data-role', 'ideaFocusConfirm')
  confirm.textContent = paletteText(card ? 'boardIdeaClose' : 'boardIdeaCreate')
  confirm.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
closeIdeaFocus({ paint: true })
  })
  actions.appendChild(confirm)
  sheet.appendChild(actions)

  // The paper around the sheet is the way out every window here gives: a
  // press on it is a close, and the words stay where they were written.
  host.addEventListener('pointerdown', function (ev) {
if (ev && ev.target !== host) return
if (typeof ev.preventDefault === 'function') ev.preventDefault()
closeIdeaFocus({ paint: true })
  })
  host.appendChild(sheet)
  BOARD.panel.appendChild(host)

  BOARD.ideaFocus = card ? card.id : ''
  BOARD.ideaFocusHost = host
  BOARD.ideaFocusSheet = sheet
  BOARD.ideaFocusTitle = title
  BOARD.ideaFocusBody = body
  BOARD.ideaFocusDone = done
  BOARD.ideaFocusAt = at
  BOARD.ideaFocusRaf = 0
  growIdeaTitle()
  paintIdeaFocusDone()
  animateIdeaFocusIn(host, sheet, origin)

  var wantBody = card && (field === 'body' || (!field && parts.body))
  var focusField = wantBody ? body : title
  if (focusField && typeof focusField.focus === 'function') focusField.focus()
  if (wantBody) {
// A long thought is read from its first line: the sheet opens at the
// top even though the caret is in the body.
if (typeof body.setSelectionRange === 'function') body.setSelectionRange(0, 0)
body.scrollTop = 0
  } else {
// The same for a long title: the sheet opens on the start of the
// thought, not on the tail of it.
if (typeof title.setSelectionRange === 'function') title.setSelectionRange(0, 0)
title.scrollTop = 0
  }
  return true
}

/**
 * Close the sheet, keeping what it says.
 *
 * An existing card is written through already, so closing is only a last
 * read of the fields and a paint. A new thought becomes a card here, at the
 * place the double click named; one that says nothing leaves no paper
 * behind. `discard` is the cancel button's word: only a draft can be thrown
 * away, because an existing card's text has been in the store all along.
 * @param {object} [opts] - `discard` for a cancelled draft, `paint` false
 *   when the caller is already taking the board down.
 * @returns {boolean} whether a sheet was open.
 */
function closeIdeaFocus(opts) {
  var host = BOARD.ideaFocusHost
  if (!host) return false
  var discard = !!(opts && opts.discard)
  var paint = !(opts && opts.paint === false)
  if (BOARD.ideaFocusRaf) {
if (typeof window.cancelAnimationFrame === 'function') {
  window.cancelAnimationFrame(BOARD.ideaFocusRaf)
}
BOARD.ideaFocusRaf = 0
  }
  var id = BOARD.ideaFocus
  var at = BOARD.ideaFocusAt || { x: 0, y: 0 }
  var title = BOARD.ideaFocusTitle ? String(BOARD.ideaFocusTitle.value || '') : ''
  var body = BOARD.ideaFocusBody ? String(BOARD.ideaFocusBody.value || '') : ''
  // The sheet stops being the open one before anything is written: a paint
  // from the write below must not find fields that are already gone.
  BOARD.ideaFocus = ''
  BOARD.ideaFocusHost = null
  BOARD.ideaFocusSheet = null
  BOARD.ideaFocusTitle = null
  BOARD.ideaFocusBody = null
  BOARD.ideaFocusDone = null
  BOARD.ideaFocusAt = null
  if (host.parentNode && typeof host.parentNode.removeChild === 'function') {
host.parentNode.removeChild(host)
  }
  if (id) {
if (ideaFocusCard(id)) {
  var text = boardJoinText(title, body)
  if (!text.trim()) BOARD_STORE.removeCard(id)
  else BOARD_STORE.setCardText(id, text)
}
  } else if (!discard) {
var words = boardJoinText(title, body)
if (words.trim()) {
  var made = BOARD_STORE.addCard(at.x, at.y)
  if (made) {
    BOARD_STORE.setCardText(made, words)
    BOARD.front = made
  }
}
  }
  if (paint && BOARD.open) renderBoard()
  return true
}

/**
 * Hand the sheet's thought to the conversation it is tied to.
 * @returns {void}
 */
function deliverIdeaFocus() {
  var id = BOARD.ideaFocus
  var card = ideaFocusCard(id)
  if (!card || !card.link) return
  var words = boardJoinText(
BOARD.ideaFocusTitle ? BOARD.ideaFocusTitle.value : '',
BOARD.ideaFocusBody ? BOARD.ideaFocusBody.value : ''
  ).trim()
  if (!words) return
  closeIdeaFocus({ paint: true })
  handCardToSession(id, card.link, words)
}

/**
 * The menu behind a thought card's ⋯.
 *
 * Two verbs were worth a seat of their own on the heading (hand it over,
 * open the rest); everything rarer lives here, one press further away than
 * it used to be and out of the way of a card nobody is touching.
 * @param {object} card - the thought.
 * @param {string} stacked - the conversation it is filed under, or ''.
 * @param {object} parts - the card's title and body.
 * @returns {Element} the menu.
 */
function buildIdeaMenu(card, stacked, parts) {
  var menu = document.createElement('div')
  Object.assign(menu.style, BOARD_UI.ideaMenu)
  menu.className = 'dshv-idea-menu'
  menu.setAttribute('data-role', 'ideaMenu')
  // The menu is not the card: a press inside it is a choice, never a carry.
  menu.setAttribute('data-no-drag', 'true')
  menu.appendChild(ideaMenuItem(paletteText('boardCardFocus'), 'ideaMenuOpen', function () {
// The menu's own node is under the sheet once it opens; take it off the
// card now rather than leaving it for the paint that closes the sheet.
if (menu.parentNode && typeof menu.parentNode.removeChild === 'function') {
  menu.parentNode.removeChild(menu)
}
openIdeaFocus(card.id, parts.body ? 'body' : 'title', {
  origin: ideaFocusOrigin(null, BOARD.looseNodes[card.id]),
})
  }))
  if (Number(card.h) > 0) {
menu.appendChild(ideaMenuItem(paletteText('boardCardCollapseHint'), 'ideaMenuFold', function () {
  BOARD_STORE.setCardRows(card.id, 0)
  renderBoard()
}))
  }
  if (card.link) {
menu.appendChild(ideaMenuItem(paletteText('boardCardUnlink'), 'cardUnlink', function () {
  if (stacked) parkCardOutside(stacked, card.id)
  BOARD_STORE.unlinkCard(card.id)
  renderBoard()
}))
  }
  menu.appendChild(ideaMenuItem(paletteText('boardCardRemove'), 'cardRemove', function () {
removeLooseCard(card.id)
  }))
  return menu
}

/**
 * One line of that menu.
 * @param {string} label - what it says.
 * @param {string} role - its name for the tests and the pointer.
 * @param {Function} onPick - what it does.
 * @returns {Element} the row.
 */
function ideaMenuItem(label, role, onPick) {
  var row = document.createElement('span')
  Object.assign(row.style, BOARD_UI.ideaMenuItem)
  row.className = 'dshv-idea-menu-item'
  row.setAttribute('role', 'button')
  row.setAttribute('data-role', role)
  row.textContent = label
  row.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD.ideaMenu = ''
onPick()
  })
  return row
}

/**
 * The verbs on a conversation card that are not worth a seat of their own.
 *
 * Renaming is the first of them. The board names a conversation from the
 * thought that started it, so a name typed by hand is the rare case; a word
 * for it drawn on every card's first line was the common case, and it stood
 * on the same corner as the lock. The menu is where the next such verb goes.
 * @param {object} summary - the conversation.
 * @returns {Element} the menu.
 */
function buildSessionMenu(summary, done) {
  var menu = document.createElement('div')
  Object.assign(menu.style, BOARD_UI.cardMenu)
  menu.className = 'dshv-card-menu'
  menu.setAttribute('data-role', 'cardMenu')
  // The menu is not the card: a press inside it is a choice, never a carry.
  menu.setAttribute('data-no-drag', 'true')
  menu.appendChild(cardMenuItem(paletteText('boardCardRenameHint'), 'cardRenameOpen', function () {
    beginBoardRename(summary.id)
  }))
  // A card in the finished strip keeps the way back where its other rare
  // verbs live: the mark is the reader's word, and a word can be taken
  // back without waiting for midnight.
  if (done) {
    menu.appendChild(cardMenuItem(paletteText('boardDoneRestore'), 'cardRestoreFocus', function () {
      bringBackFromDone(summary.id)
      showToast(paletteText('boardDoneRestored'))
      renderBoard()
    }))
  }
  // Deleting is taking it off the board, not archiving the conversation:
  // the shell keeps it, the sidebar keeps it, and it comes back the next
  // time it is used. It is the one destructive verb, so it lives with the
  // rare ones rather than on the card's face.
  menu.appendChild(cardMenuItem(paletteText('boardChatRemove'), 'cardRemove', function () {
    removeBoardCard(summary)
  }))
  return menu
}

/**
 * One line of that menu.
 * @param {string} label - what it says.
 * @param {string} role - its name for the tests and the pointer.
 * @param {Function} onPick - what it does.
 * @returns {Element} the row.
 */
/**
 * Stand a card's menu under its ⋯, or above it where the panel would clip it.
 *
 * A panel is a box with edges of its own, and the last card in one sits
 * against the bottom: a menu that always opened downwards would be cut off
 * there. The measurement is the panel's, because the panel is what clips;
 * the menu is inside the card, so flipping it is a card's own height away.
 * @param {Element} menu - the menu, already in the card.
 * @param {Element} mark - the ⋯ that opened it.
 * @returns {void}
 */
function placeCardMenu(menu, mark) {
  if (!menu || !mark || typeof mark.getBoundingClientRect !== 'function') return
  try {
var panel = mark.closest ? mark.closest('[data-role="workspaceBlock"]') : null
if (!panel || typeof panel.getBoundingClientRect !== 'function') return
var room = panel.getBoundingClientRect()
var box = mark.getBoundingClientRect()
// A host without layout reports nothing, and the styles are the answer.
if (!room || !room.height || !box) return
if (box.bottom + BOARD_CARD_MENU_H <= room.bottom) return
menu.style.top = 'auto'
menu.style.bottom = 'calc(100% - 22px)'
  } catch (error) {
// Measuring is a courtesy: the menu stays where the styles put it.
  }
}

function cardMenuItem(label, role, onPick) {
  var row = document.createElement('span')
  Object.assign(row.style, BOARD_UI.cardMenuItem)
  row.className = 'dshv-card-menu-item'
  row.setAttribute('role', 'button')
  row.setAttribute('data-role', role)
  row.textContent = label
  row.addEventListener('click', function (ev) {
if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
if (BOARD.dragged) {
  BOARD.dragged = false
  return
}
BOARD.sessionMenu = ''
if (BOARD.sessionMenuMark) {
  BOARD.sessionMenuMark.setAttribute('aria-expanded', 'false')
  BOARD.sessionMenuMark = null
}
// The menu goes where it stands, whatever the verb does next: a refused
// verb that repaints nothing must not leave its own menu on the card.
if (row.parentNode && typeof row.parentNode.removeChild === 'function') {
  row.parentNode.removeChild(row)
}
onPick()
  })
  return row
}

/**
 * One loose card: a thought the reader put on the canvas rather than in a
 * conversation.
 *
 * It belongs to no workspace and to no conversation, so nothing on the feed
 * can move it. Its heading is the handle, its body is the text, and the ×
 * takes it away. The text is written as it is typed rather than on blur, so
 * a repaint cannot cost a sentence.
 * @param {object} card - one of `BOARD_STORE.cards`.
 * @returns {Element} the card.
 */
function buildBoardLooseCard(card, titles, opts) {
  var stacked = opts && opts.stacked ? String(opts.stacked) : ''
  var node = document.createElement('div')
  Object.assign(node.style, BOARD_UI.loose)
  node.className = 'dshv-note'
  // A delivered card keeps its place on the board, but quietly: the work it
  // fed is where the attention belongs now, and the card is the receipt.
  if (card.done) Object.assign(node.style, BOARD_UI.looseDone)
  if (BOARD.cardEditing === card.id) Object.assign(node.style, BOARD_UI.looseEditing)
  // What this card is written in: its goal's hue, or the amber of a note that
  // belongs to nobody yet. Read once here, because the paper, the words and
  // every mark on it are the same ink in different weights.
  var ink = null
  if (stacked) {
    // A thought filed under a conversation is read in that conversation's
    // column: its place is the column's, its order is the document's, and
    // nothing about it is a free position on the paper any more.
    node.style.position = 'relative'
    node.style.left = 'auto'
    node.style.top = 'auto'
    node.style.width = '100%'
    node.setAttribute('data-stack', stacked)
  } else {
    node.style.left = card.x + 'px'
    node.style.top = card.y + 'px'
    node.style.width = BOARD_CARD_W + 'px'
  }
  // One shape in every state. The paper is planned from the words, and the
  // words and the field are set in the same ruler (`boardNoteMetrics`), so
  // the card that is planned is the card that is painted - and a press,
  // which swaps the words for the field, cannot change its size.
  // Which panel this card's conversation stands in, read before the paper is
  // inked: the paper and the dot are the same fact said twice.
  var linkedBlock = null
  if (card.link) {
    for (var lb = 0; lb < BOARD.blocks.length; lb++) {
      var rowsHere = BOARD.blocks[lb].rows
      for (var lr = 0; lr < rowsHere.length; lr++) {
        if (rowsHere[lr].id === card.link) linkedBlock = BOARD.blocks[lb]
      }
    }
  }
  if (!card.done) Object.assign(node.style, notePaper(linkedBlock))
  ink = noteInkOf(linkedBlock, card.done)
  node.style.color = ink.text
  var parts = noteParts(card.text)
  var opened = BOARD.cardEditing === card.id
  // A thought filed under a conversation is read by its name: one line is
  // the whole of its paper until it is opened. A free card keeps the two
  // lines it was always planned with.
  var compact = !!stacked && !opened
  // Filed and at rest, the card is a line rather than a sheet: the same
  // height, corner and padding the inbox's rows wear. Its hue and its marks
  // stay - the colour is the goal it belongs to, and the marks are its
  // verbs. Opening it gives the card its paper back to be typed on.
  if (compact) Object.assign(node.style, BOARD_UI.stackedNote)
  var box = opened ? boardCardOpenBox(card.text) : boardCardBox(card.text, compact ? 1 : card.h)
  var metrics = boardNoteMetrics()
  node.style.height = box.height + 'px'
  node.setAttribute('data-rows', String(box.lines))
  // A compact thought is exactly its heading: the paper is measured by what
  // is on it, not by a body row it no longer draws.
  if (compact) node.style.height = 'auto'
  // While its field is up the card is a floor rather than a height: the field
  // opens at the paper it replaced, and the card follows it only if the
  // writing needs more room than that paper had.
  if (BOARD.cardEditing === card.id) {
    node.style.height = 'auto'
    node.style.minHeight = box.height + 'px'
  }
  // A card that holds more than it can show says so by fading its last line
  // rather than by hiding the rest behind a scrollbar inside the paper.
  if (!compact && parts.rows > box.lines) node.setAttribute('data-clipped', 'true')
  if (BOARD.front === card.id) {
    node.setAttribute('data-front', 'true')
    node.style.zIndex = String(BOARD.zTop)
  }
  // There is no corner to drag: a card is opened by pressing it, which shows
  // the whole of it, and closed by leaving it (see `boardCardOpenBox`).
  node.setAttribute('data-role', 'looseCard')
  node.setAttribute('data-card-id', card.id)
  node.setAttribute('data-handle', 'note')
  node.setAttribute('data-editing', BOARD.cardEditing === card.id ? 'true' : 'false')
  if (compact) node.setAttribute('data-compact', 'true')
  if (card.done) node.setAttribute('data-done', 'true')

  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.looseHead)
  if (compact) Object.assign(head.style, BOARD_UI.stackedHead)
  head.className = 'dshv-note-head'
  head.setAttribute('data-role', 'looseHead')
  // The whole card is the handle now, so a grip would be a second invitation
  // to the same gesture. What the heading says is only what is true of this
  // card: what state it is in, and what it belongs to.
  // Which conversation the card belongs to is said by the paper it is written
  // on, and in the card's own tooltip - the dot that used to repeat it was a
  // third mark on a heading that already has three.
  var parentTitle = card.link ? titles[card.link] || '' : ''
  if (card.link) {
    node.setAttribute('title', parentTitle
      ? paletteText('boardCardLinked') + parentTitle
      : paletteText('boardCardLinkedUnknown'))
  }
  // Unlinking is one of the card's rarer verbs now: it lives in the card's
  // own menu, with the rest (see `buildIdeaMenu`).

  // The done mark, pressed rather than delivered: a thought the reader has
  // finished with says so, and says it quietly — the card stays where it is.
  var doneToggle = document.createElement('span')
  Object.assign(doneToggle.style, BOARD_UI.cardDoneToggle)
  doneToggle.className = 'dshv-done-toggle'
  doneToggle.setAttribute('role', 'button')
  doneToggle.setAttribute('data-role', 'cardDoneToggle')
  doneToggle.setAttribute('aria-pressed', card.done ? 'true' : 'false')
  doneToggle.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
  doneToggle.textContent = card.done ? '\u2713' : ''
  // The box is drawn on paper rather than on the board, so its outline comes
  // from the paper's ink: the board's grey outline vanishes here.
  doneToggle.style.borderColor = ink.edge
  if (card.done) {
    doneToggle.style.background = 'hsl(45 74% 62%)'
    doneToggle.style.borderColor = 'hsl(45 60% 46%)'
    doneToggle.style.color = 'hsl(45 40% 16%)'
  }
  doneToggle.setAttribute('data-done', card.done ? 'true' : 'false')
  doneToggle.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    BOARD_STORE.setCardDone(card.id, !card.done)
    renderBoard()
  })
  // Two zones: the state the card is in, then what it belongs to. Deleting
  // and unlinking are secondary, and arrive under the pointer rather than
  // standing in the heading of every card that is not being touched.
  // The first line is the card's title, and it lives here: the row that used
  // to hold nothing but a box now says what the note is about.
  var title = null
  if (opened && BOARD.cardField === 'title') {
    // The name is a field of its own, in the row it belongs to. Typing here is
    // typing the title - the body below is untouched.
    title = document.createElement('input')
    Object.assign(title.style, BOARD_UI.looseTitle, BOARD_UI.looseTitleBox)
    title.setAttribute('type', 'text')
    title.setAttribute('data-role', 'cardTitleInput')
    title.setAttribute('data-no-drag', 'true')
    title.setAttribute('aria-label', paletteText('boardNoteTitleHint'))
    title.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
    title.style.color = ink.text
    title.value = parts.title
    title.addEventListener('input', function () {
      BOARD_STORE.setCardText(card.id, boardJoinText(title.value, parts.body))
    })
    title.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        // The name is done; the thought is next.
        commitBoardCard()
        var all = BOARD_STORE.cards()
        for (var k = 0; k < all.length; k++) {
          if (all[k].id !== card.id) continue
          beginBoardCard(card.id, 'body')
        }
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        cancelBoardCard()
      }
    })
    title.addEventListener('blur', function () {
      if (BOARD.cardEditing === card.id && BOARD.cardField === 'title'
        && BOARD.cardEditor === title) commitBoardCard()
    })
    BOARD.cardEditor = title
  } else {
    title = document.createElement('span')
    Object.assign(title.style, BOARD_UI.looseTitle)
    if (compact) Object.assign(title.style, BOARD_UI.stackedTitle)
    title.setAttribute('data-role', 'looseTitle')
    title.style.color = ink.text
    title.textContent = parts.title || paletteText('boardNoteUntitled')
    title.style.opacity = parts.title ? '1' : '0.45'
    if (card.link && parentTitle) {
      title.setAttribute('title', paletteText('boardCardLinked') + parentTitle)
    }
    title.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      openIdeaFocus(card.id, 'title', { origin: ideaFocusOrigin(ev, node) })
    })
  }
  head.appendChild(doneToggle)
  // The title is always in this row, whether it is text or a field: the name
  // of the note is the first thing in it, at every moment.
  head.appendChild(title)
  // A free card can be pinned: locked, a tidy leaves it exactly where the
  // reader put it. A card filed under a conversation has a place already -
  // the column's - so it wears no pin of its own.
  if (!stacked) {
    var pin = document.createElement('span')
    Object.assign(pin.style, BOARD_UI.looseLock)
    if (card.locked) Object.assign(pin.style, BOARD_UI.looseLockOn)
    pin.className = 'dshv-note-lock'
    pin.setAttribute('role', 'button')
    pin.setAttribute('data-role', 'cardLockIdea')
    pin.setAttribute('aria-pressed', card.locked ? 'true' : 'false')
    pin.setAttribute('title', paletteText(card.locked ? 'boardIdeaUnlockHint' : 'boardIdeaLockHint'))
    pin.setAttribute('aria-label', paletteText(card.locked ? 'boardIdeaUnlockHint' : 'boardIdeaLockHint'))
    pin.appendChild(boardIcon(card.locked ? 'lock' : 'unlock', 11))
    pin.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      BOARD_STORE.toggleCardLock(card.id)
      renderBoard()
    })
    head.appendChild(pin)
  }

  // The two verbs worth a seat of their own: hand the words to the
  // conversation this thought belongs to, and open the menu for the rest.
  if (stacked) {
    var deliver = document.createElement('span')
    Object.assign(deliver.style, BOARD_UI.looseDeliver)
    deliver.className = 'dshv-deliver'
    deliver.setAttribute('role', 'button')
    deliver.setAttribute('data-role', 'cardDeliver')
    deliver.setAttribute('title', paletteText('boardCardDeliverHint'))
    deliver.setAttribute('aria-label', paletteText('boardCardEnterHint'))
    deliver.appendChild(boardIcon('enter', 13))
    deliver.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      var words = String(card.text || '').trim()
      if (!words) return
      handCardToSession(card.id, stacked, words)
    })
    head.appendChild(deliver)
  }
  var more = document.createElement('span')
  Object.assign(more.style, BOARD_UI.looseMore)
  more.className = 'dshv-more'
  more.setAttribute('role', 'button')
  more.setAttribute('data-role', 'cardMenuOpen')
  more.setAttribute('title', paletteText('boardCardMenu'))
  more.setAttribute('aria-label', paletteText('boardCardMenu'))
  more.setAttribute('aria-expanded', BOARD.ideaMenu === card.id ? 'true' : 'false')
  more.textContent = '\u22ef'
  more.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    // Opening a menu is not a repaint: the board may be mid-field, and a
    // paint would take the card out from under the press that asked.
    if (BOARD.ideaMenu === card.id) {
      closeIdeaMenu()
      more.setAttribute('aria-expanded', 'false')
      return
    }
    closeIdeaMenu()
    closeGoalMenu()
    BOARD.ideaMenu = card.id
    more.setAttribute('aria-expanded', 'true')
    node.appendChild(buildIdeaMenu(card, stacked, parts))
  })
  head.appendChild(more)
  node.appendChild(head)
  if (BOARD.ideaMenu === card.id) node.appendChild(buildIdeaMenu(card, stacked, parts))
  BOARD.looseNodes[card.id] = node

  if (opened && BOARD.cardField === 'body') {
    var editor = document.createElement('textarea')
    Object.assign(editor.style, BOARD_UI.looseEditor)
    editor.setAttribute('data-role', 'cardText')
    editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
    editor.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
    // The field is the card's own ruler: same type, same line box, and the
    // very number of rows the paper was planned for. That is the whole of
    // why a press does not resize the card it pressed.
    editor.style.fontSize = metrics.font + 'px'
    editor.style.lineHeight = metrics.line + 'px'
    editor.setAttribute('rows', String(box.lines))
    editor.style.height = (box.lines * metrics.line) + 'px'
    // The field grows with the writing and the paper grows with the field:
    // a thought is read whole, so there is no letterbox and no scrollbar
    // inside the paper any more.
    editor.setAttribute('placeholder', paletteText('boardCardPlaceholder'))
    editor.value = parts.body
    editor.addEventListener('input', function () {
      BOARD_STORE.setCardText(card.id, boardJoinText(parts.title, editor.value))
      var grown = boardEditorRows(editor.value)
      if (editor.getAttribute('rows') === String(grown)) return
      editor.setAttribute('rows', String(grown))
      editor.style.height = (grown * metrics.line) + 'px'
      // The paper grows with the writing while the field is up, and the
      // paint after it closes lands on the same size it was left at.
      node.style.height = 'auto'
    })
    editor.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        cancelBoardCard()
      } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault()
        commitBoardCard()
      }
    })
    editor.addEventListener('blur', function () {
      if (BOARD.cardEditing === card.id && BOARD.cardEditor === editor) commitBoardCard()
    })
    // A field is the field's: the router leaves the press alone, so text in
    // it can be selected with the pointer.
    editor.setAttribute('data-no-drag', 'true')
    node.appendChild(editor)
    BOARD.cardEditor = editor
  } else if (box.lines > 0 && !compact) {
    var text = document.createElement('div')
    Object.assign(text.style, BOARD_UI.looseText)
    // The words sit on the card's ruler: the same type and line box the
    // paper was planned with, and exactly the room it was planned to hold.
    text.style.fontSize = metrics.font + 'px'
    text.style.lineHeight = metrics.line + 'px'
    text.style.height = (box.lines * metrics.line) + 'px'
    text.style.color = ink.text
    // The card shows the lines it was given, and fades the rest: resizing is
    // what buys more paper, so the clamp follows the paper rather than the
    // words.
    text.style.WebkitLineClamp = String(Math.max(1, box.lines))
    text.setAttribute('data-role', 'looseText')
    // The body only: the title is the heading's, and repeating it here would
    // spend the card's two lines saying what its first line already said.
    text.textContent = parts.body || paletteText('boardCardPlaceholder')
    if (!parts.body) text.style.opacity = '0.4'
    text.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      openIdeaFocus(card.id, 'body', { origin: ideaFocusOrigin(ev, node) })
    })
    node.appendChild(text)
  }
  // The card's own press is the card's, body or no body: a note is opened by
  // pressing it, which is the same gesture that shows all of it. A card
  // already being typed into keeps the press for its field, and so does
  // every mark on the heading.
  node.addEventListener('click', function (ev) {
    if (BOARD.dragged) {
      BOARD.dragged = false
      return
    }
    if (BOARD.cardEditing === card.id) return
    var hit = ev && ev.target
    if (hit && typeof hit.closest === 'function'
      && hit.closest('[data-no-drag],[data-role="cardRemove"],[data-role="cardDoneToggle"],'
        + '[data-role="cardUnlink"],[data-role="cardDeliver"],[data-role="cardMenuOpen"]')) return
    // The paper opens the thought; a card that has none opens its name.
    openIdeaFocus(card.id, parts.body ? 'body' : 'title', { origin: ideaFocusOrigin(ev, node) })
  })
  return node
}

/**
 * Start typing into one loose card - at its title, or at its body.
 *
 * The title is the heading row, next to the box; the body is the paper under
 * it. They are two fields because they are two things: one line that names
 * the note, and however much the note needs.
 * @param {string} id - the card.
 * @param {string} [field] - 'title' (the default) or 'body'.
 * @returns {void}
 */
function beginBoardCard(id, field) {
  if (!id) return
  // The press that asked for this may have settled an empty card out from
  // under the seat it aimed at; a field with no paper behind it is not a
  // place to type.
  var all = BOARD_STORE.cards()
  var here = false
  for (var i = 0; i < all.length; i++) {
if (all[i].id === id) { here = true; break }
  }
  if (!here) return
  var want = field === 'body' ? 'body' : 'title'
  if (BOARD.cardEditing === id && BOARD.cardField === want) return
  // The card being opened is the card being worked on: it comes to the front,
  // and stays there when the paint after this one is drawn.
  raiseBoardCard(id, BOARD.looseNodes[id] || null)
  BOARD.cardEditing = id
  BOARD.cardField = want
  BOARD.cardEditor = null
  renderBoard()
}

/**
 * Keep what the open field says, and close it.
 *
 * A note that says nothing is not a note: leaving a blank piece of paper on
 * the canvas is the tidiest way to make a board look unloved, so a card that
 * closes empty is taken away rather than kept.
 * @returns {boolean} whether a field was open.
 */
/**
 * Settle one open field: keep what it says, and take the paper away if it
 * says nothing.
 *
 * One function because both ways out of a field - confirming it, and asking
 * for another card - have to agree about what an empty note is.
 * @param {string} id - the card.
 * @param {Element} editor - its field.
 * @returns {string} the text that was kept.
 */
function boardTakeCardText(id, editor) {
  var field = BOARD.cardField === 'body' ? 'body' : 'title'
  var value = editor ? String(editor.value || '') : ''
  var held = null
  var all = BOARD_STORE.cards()
  for (var i = 0; i < all.length; i++) {
if (all[i].id === id) held = all[i]
  }
  var parts = noteParts(held ? held.text : '')
  var text = field === 'title'
? boardJoinText(value, parts.body)
: boardJoinText(parts.title, value)
  BOARD_STORE.setCardText(id, text)
  if (!text.trim()) BOARD_STORE.removeCard(id)
  return text
}

function commitBoardCard() {
  if (!BOARD.cardEditing) return false
  var editor = BOARD.cardEditor
  var id = BOARD.cardEditing
  var kept = boardTakeCardText(id, editor)
  BOARD.cardEditing = ''
  BOARD.cardField = ''
  BOARD.cardEditor = null
  renderBoard()
  return kept !== ''
}

/** Throw the open field away, leaving the card as it was last written. */
function cancelBoardCard() {
  if (!BOARD.cardEditing) return false
  BOARD.cardEditing = ''
  BOARD.cardField = ''
  BOARD.cardEditor = null
  renderBoard()
  return true
}

/**
 * Settle the open card field for a press, without the paint a settle
 * usually carries.
 *
 * A press ends a field the way a click does - the words are kept, and a
 * note that says nothing is taken away - but the press is not the click
 * yet. The click behind it is still on its way, and the paint a settle
 * carries would replace the element that click aims at. So the field is
 * taken off the page (a later paint is allowed again), and the paint is
 * owed to whoever ends the gesture that started here.
 * @returns {void}
 */
function settleBoardCardForPress() {
  boardTakeCardText(BOARD.cardEditing, BOARD.cardEditor)
  if (BOARD.cardEditor && BOARD.cardEditor.parentNode) {
BOARD.cardEditor.parentNode.removeChild(BOARD.cardEditor)
  }
  BOARD.cardEditing = ''
  BOARD.cardField = ''
  BOARD.cardEditor = null
  BOARD.paintOwed = true
}

/**
 * Open a new thought at a place, and let the sheet write it.
 *
 * No card is made here: a blank piece of paper has nothing to say yet, and
 * one that closes empty would leave the canvas looking unloved. The card is
 * written when the sheet closes with words in it, at the place this press
 * named.
 * @param {number} x - canvas coordinate.
 * @param {number} y - canvas coordinate.
 * @param {object} [origin] - client point the sheet grows from.
 * @returns {boolean} whether the sheet opened.
 */
function addBoardCardAt(x, y, origin) {
  // A card being typed into is finished first. The new thought is a thought
  // of its own, and a field that outlived the card it was drawn for would be
  // read as this card's words the moment the board redraws.
  if (BOARD.cardEditing) boardTakeCardText(BOARD.cardEditing, BOARD.cardEditor)
  BOARD.cardEditing = ''
  BOARD.cardField = ''
  BOARD.cardEditor = null
  return openIdeaFocus('', 'title', { x: x, y: y, origin: origin })
}

/**
 * Open a new thought where the reader is looking, or below everything when
 * the page is too small (or too fake) to have a middle.
 * @param {Element} [anchor] - the button the press landed on.
 * @returns {boolean} whether the sheet opened.
 */
function addBoardCard(anchor) {
  var place = nextCardPlace()
  var viewport = BOARD.body
  if (viewport) {
var width = Number(viewport.clientWidth) || 0
var height = Number(viewport.clientHeight) || 0
if (width > BOARD_CARD_W * 2 && height > 240) {
  place = {
    x: (Number(viewport.scrollLeft) || 0) + Math.max(24, (width - BOARD_CARD_W) / 2),
    y: (Number(viewport.scrollTop) || 0) + Math.max(24, (height - boardCardBox('').height) / 2),
  }
}
  }
  return addBoardCardAt(place.x, place.y, ideaFocusOrigin(null, anchor))
}

/** Take one loose card off the canvas. */
function removeLooseCard(id) {
  if (BOARD.cardEditing === id) {
BOARD.cardEditing = ''
BOARD.cardEditor = null
  }
  // Read it before it goes: an undone delete has to be the same card - its
  // words, its tie, its done mark, where it was filed - not a new one that
  // happens to read the same.
  var held = null
  var at = 0
  var all = BOARD_STORE.cards()
  for (var i = 0; i < all.length; i++) {
if (all[i].id !== id) continue
held = all[i]
at = i
  }
  BOARD_STORE.removeCard(id)
  // Record before the paint: the buttons are drawn by the paint, and a step
  // taken after it would leave them one press behind.
  if (!held) {
renderBoard()
return
  }
  BOARD_HISTORY.record({
label: paletteText('boardUndoIdea'),
undo: function () {
  BOARD_STORE.restoreCard(held, at)
  if (BOARD.open) renderBoard()
},
redo: function () {
  BOARD_STORE.removeCard(id)
  if (BOARD.open) renderBoard()
},
  })
  renderBoard()
}

/**
 * Take one conversation off the board.
 *
 * Deleted until it moves again: the mark is held against the moment it last
 * moved, so a conversation used afterwards belongs back on the board.
 * @param {object} summary - session summary.
 * @returns {void}
 */
function removeBoardCard(summary) {
  var touched = summary.updatedAt
  BOARD_STORE.mute(summary.id, touched)
  // A deleted conversation is a mark held against the moment it last moved,
  // so the way back is simply to lift that mark - and the way forward again
  // is to put it back exactly as it was stamped.
  BOARD_HISTORY.record({
label: paletteText('boardUndoSession'),
undo: function () {
  BOARD_STORE.unmute(summary.id)
  if (BOARD.open) renderBoard()
},
redo: function () {
  BOARD_STORE.mute(summary.id, touched)
  if (BOARD.open) renderBoard()
},
  })
  renderBoard()
}

/**
 * Mark the column the hand is over, or clear every mark.
 * @param {Element} target - the pile to mark, or null.
 * @returns {void}
 */
/**
 * Put the thought card's menu away, without a repaint.
 *
 * The next press is allowed to do whatever it was going to do - opening
 * another menu, starting a carry, or nothing at all - so the menu is taken
 * off the page where it stands rather than by redrawing the board under the
 * pointer.
 * @returns {void}
 */
function closeIdeaMenu() {
  if (!BOARD.ideaMenu) return
  BOARD.ideaMenu = ''
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var open = BOARD.stage.querySelectorAll('[data-role="ideaMenu"]')
  for (var i = 0; i < open.length; i++) {
if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
  }
}

/**
 * Put the colour wheel away, without a repaint.
 *
 * The same bargain the two card menus make: the next press does whatever it
 * was going to do, and the wheel is taken off the panel where it stands.
 * @returns {void}
 */
function closeSeatMenu() {
  if (!BOARD.seatMenu) return
  BOARD.seatMenu = ''
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var open = BOARD.stage.querySelectorAll('[data-role="seatMenu"]')
  for (var i = 0; i < open.length; i++) {
if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
  }
  var dots = BOARD.stage.querySelectorAll('[data-role="blockDot"]')
  for (var d = 0; d < dots.length; d++) dots[d].setAttribute('aria-expanded', 'false')
}

/**
 * Put a goal's ⋯ menu away, without a repaint.
 *
 * The same bargain as the other menus: the press that dismisses it still
 * does what it meant to do, and the menu is taken off the page where it
 * stands rather than by redrawing the panel under the pointer.
 * @returns {void}
 */
function closeGoalMenu() {
  if (!BOARD.goalMenu) return
  BOARD.goalMenu = ''
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var open = BOARD.stage.querySelectorAll('[data-role="goalMenu"]')
  for (var i = 0; i < open.length; i++) {
if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
  }
  var marks = BOARD.stage.querySelectorAll('[data-role="goalMenuOpen"]')
  for (var m = 0; m < marks.length; m++) marks[m].setAttribute('aria-expanded', 'false')
}

/**
 * Put a card's state menu away, without a repaint.
 *
 * The same bargain as every other menu on this canvas: the next press does
 * whatever it was going to do, and the menu is taken off the card where it
 * stands.
 * @returns {void}
 */
function closeVerdictMenu() {
  if (!BOARD.verdictMenu) return
  BOARD.verdictMenu = ''
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var open = BOARD.stage.querySelectorAll('[data-role="verdictMenu"]')
  for (var i = 0; i < open.length; i++) {
if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
  }
  var marks = BOARD.stage.querySelectorAll('[data-role="cardState"],[data-role="cardStateAdd"]')
  for (var m = 0; m < marks.length; m++) marks[m].setAttribute('aria-expanded', 'false')
}

/**
 * Put a conversation card's menu away, without a repaint.
 *
 * The same bargain as the thought card's: the next press does whatever it
 * was going to do, and the menu is taken off the page rather than redrawn.
 * @returns {void}
 */
function closeSessionMenu() {
  if (!BOARD.sessionMenu) return
  BOARD.sessionMenu = ''
  // The mark is the menu's own state: it goes down with the menu, not on
  // the next paint, so a card closed by Escape does not still claim to be open.
  if (BOARD.sessionMenuMark) {
BOARD.sessionMenuMark.setAttribute('aria-expanded', 'false')
BOARD.sessionMenuMark = null
  }
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var open = BOARD.stage.querySelectorAll('[data-role="cardMenu"]')
  for (var i = 0; i < open.length; i++) {
if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
  }
}

/**
 * Put the drop bands on screen, or take them away.
 *
 * The band's own surface is an inline style, so a stylesheet rule cannot show
 * it: this is the only thing that can, and it is called from the one place
 * that knows a note is in the air.
 * @param {boolean} on - whether a note is being carried.
 * @returns {void}
 */
/** Whether the note a gesture is carrying has already been finished. */
function boardNoteDone(id) {
  var all = BOARD_STORE.cards()
  for (var i = 0; i < all.length; i++) {
if (all[i].id === id) return all[i].done === true
  }
  return false
}

/**
 * Hand one loose card's words to a conversation, and leave a trace behind.
 *
 * The paste opens the conversation and fills its box; the card is not
 * removed but marked done and tied to it, so coming back to the board shows
 * what was said and where it went. A card that found no box stays a plain
 * card and says so. Once the words have landed, the conversation takes the
 * card's title as its own name - see `nameSessionForCard`.
 * @param {string} cardId - the card.
 * @param {string} sessionId - the conversation it was dropped on.
 * @param {string} text - what the card says.
 * @returns {void}
 */
function handCardToSession(cardId, sessionId, text) {
  // The words wait for the conversation's box instead of dragging the reader
  // into it: the board is where the gesture was made, and one drop is not a
  // reason to leave it. Waiting is also what makes the second and the third
  // card possible - they join the end of the same queue, in the order they
  // were let go.
  HANDOFF_STORE.push(sessionId, text)
  BOARD_STORE.finishCard(cardId, sessionId)
  if (BOARD.open) renderBoard()
  showToast(paletteText('boardHandoffQueued'))
  // A conversation whose box is already on screen - the floating board over
  // its own conversation - has nothing to wait for: the words go in now. The
  // box is asked for, not assumed: a page mounted over a conversation that
  // still counts as current has no composer to paste into.
  var here = currentSession()
  if (here && here.id === sessionId && composerRoot()) flushHandoff(sessionId)
}

/**
 * Let the conversation a card was handed to wear the card's own name.
 *
 * The title is the first line of what the card says - the line its heading
 * shows, and the line the reader wrote for exactly this moment. The rename
 * takes the private-source hop every other rename here takes, so a name
 * handed over does not mark the conversation read. The words are already in
 * the composer by the time this runs: a hand-over that found no box names
 * nothing, because nothing was handed over. A refusal is said out loud
 * rather than swallowed, and the success says the name too, because the
 * board the gesture left behind is not on the screen to say it.
 * @param {string} sessionId - the conversation the card was handed to.
 * @param {string} text - what the card says, trimmed.
 * @returns {void}
 */
function nameSessionForCard(sessionId, text) {
  // The words still land; only the name is the board's to give, and only
  // when the reader left the switch on.
  if (settings.autoRename === false) return
  // A locked title is the reader's own word: handing a thought over must not
  // rewrite a name chosen for reasons the board cannot see.
  if (BOARD_STORE.isSessionLocked(sessionId)) return
  var title = String(noteParts(text).title || '').trim()
  if (!title) return
  renameSession(sessionId, title, function (reason) {
    if (reason) {
      showToast(reason)
      return
    }
    showToast(paletteText('boardNamedFromCard') + title)
  })
}

export { commitComposerTitle, nameSessionForCard, handCardToSession, sendToDone, bringBackFromDone, pasteIntoComposer, renderBoard, renderBoardOnStatus, startDayTimer, stopDayTimer, stopBoardClock, addBoardCard, addBoardCardAt, commitGoalIntent, closeIdeaFocus, buildBoardCard, settleBoardCardForPress, closeIdeaMenu, closeSeatMenu, closeGoalMenu, closeVerdictMenu, closeSessionMenu, boardNoteDone, openIdeaFocus, flushHandoff }
