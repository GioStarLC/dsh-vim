/**
 * The canvas itself: drawing the goal panels, cards and tray, the verdict and
 * state chips, renaming, the idea sheet, and every pointer gesture that edits
 * them. The open/close lifecycle is here too; the page wrappers and the
 * keyboard dispatcher are not.
 * 
 * This module is the board's DOM. It reads state from board-state and the
 * stores, measures through board-canvas, and reaches the page and the main
 * view only through board-hooks.
 */
import { BOARD, boardFieldOpen, boardTitleOf } from './board-state.js'
import { handCardToSession, sendToDone, bringBackFromDone, renderBoard, renderBoardOnStatus, startDayTimer, stopDayTimer, stopBoardClock, addBoardCard, addBoardCardAt, commitGoalIntent, closeIdeaFocus, buildBoardCard, dropCardIntoComposer, settleBoardCardForPress, closeIdeaMenu, closeSeatMenu, closeGoalMenu, closeVerdictMenu, closeSessionMenu, boardNoteDone } from './board-view.js'
import { FORK_WATCH, addBoardGoal, beginBoardNote, cancelBoardNote, cardVerdictOf, commitBoardNote, noteCardFinished, openNote, pinToBoard, rememberFork, revealBoardCard, watchForks } from './board-notes.js'
import { BOARD_HISTORY, BOARD_STORE, CARRY, HISTORY, JOURNAL, NOTE_STORE } from './board-stores.js'
import { BOARD_INK, BOARD_UI, NOTE_PAPER, boardIcon } from './board-css.js'
import { boardBlockByKey, boardBlocks, boardCardBox, boardCardOpenBox, boardEditorRows, boardFreePlace, boardHomeOf, boardJoinText, boardNoteMetrics, boardPlaces, boardRowOf, boardSlots, blockInk, blockSeat, canvasPointOf, doneBarUnder, goalHeadKeyUnder, goalHue, goalNodeAt, goalUnder, nearestGoal, nextCardPlace, nextGoalName, noteInkOf, notePaper, noteParts, tidyBoard, workspaceForGoal } from './board-canvas.js'
import { boardOpenSession, boardPasteDraft, boardRepaint, boardShowBoard, boardShowOverview } from './board-hooks.js'
import { boardOpenSession as openSession } from './board-hooks.js'
import { dayOf, daysBetween, startOfToday } from './time.js'
import { settings } from './preferences.js'
import { paletteText } from './strings.js'
import { TOAST, showToast } from './toast.js'
import { conversationPool, currentSession, folderIndex, taskServices } from './sessions.js'
import { attentionOf } from './runs.js'
import { renameSession } from './session-actions.js'
import { failureText, refusal } from './errors.js'
import { PHASES_MODEL } from './phases.js'
import { BOARD_BLOCK_HEAD_H, BOARD_CANVAS_EDGE, BOARD_CARD_W, BOARD_COLUMN_GAP, BOARD_DONE, BOARD_DONE_PREVIEW, BOARD_FLOAT_W, BOARD_GOAL_MENU_W, BOARD_GOAL_NAME_MAX, BOARD_INBOX, BOARD_MIN_FONT, BOARD_PRUNE_MS, BOARD_ROW_COLUMNS, BOARD_SLOTS, BOARD_SLOP, BOARD_SORT_EDGE, BOARD_TIDY_GAP, BOARD_ZOOM_MAX, BOARD_ZOOM_MIN, BOARD_ZOOM_STEP, SNAPSHOT_VERSION, VERDICT_KEYS } from './constants.js'
import { applyBoardZoom, boardBlockWidth, boardCardStacked, boardExtent, boardPanelHeights, boardPanelWidths, fitBoardToWindow, onBoardResize, onBoardWheel, setBoardZoom, slotHue } from './board-canvas.js'
import { BOARD_PAGE_UI, applyBoardPageInk } from './board-css.js'
import { closeBoardHistory, closeSeal, maybeShowSeal, noteMoment, pageDoc, pageView, settleDay } from './board-history.js'
import { closeNewSessionSheet, openNewSessionSheet, startNewSessionForGoal } from './board-sheet.js'
import { clearFocusRequest, composerIsEmpty, composerRoot, focusComposer } from './focus.js'
import { MODELPICK } from './model-picker.js'
import { elapsedText, runSince, watchRuns } from './runs.js'
import { reducedMotion, state, stopAnim, stopHold } from './scroll.js'
import { serviceOf, statusIsLive, statusOf, taskCtx } from './sessions.js'
import { PALETTE, clockDelay, tickClocks } from './task-window.js'

/**
 * Mount the board.
 *
 * A board and a task window never share the page: both take the whole
 * keyboard and both answer Escape, so one of them being up is what keeps the
 * other from opening. That is checked here as well as in the key handler,
 * because the console can open either one directly.
 * @returns {boolean} whether the board is up.
 */
function openBoard() {
  if (BOARD.open) return true
  if (PALETTE.open || MODELPICK.open) return false
  if (!taskServices()) return false
  if (!document.body) return false
  // A host that had not published the status source when this plugin woke
  // up gets a watch now: without one, no card could show how long its turn
  // has been going. The task window retries the same way.
  watchRuns()
  stopHold()
  stopAnim()
  // A window that takes the keyboard ends any claim the message box had on
  // it, the same way the task window does.
  clearFocusRequest()

  var host = document.createElement('div')
  Object.assign(host.style, BOARD_UI.backdrop)
  var panel = document.createElement('div')
  Object.assign(panel.style, BOARD_UI.panel)
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', paletteText('board'))
  panel.className = 'dshv-window'
  // A canvas is read at a glance from a distance, so it starts at the
  // reader's own preference or larger — never below what a title needs to be
  // read without leaning in. Everything inside is sized in em against this.
  panel.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
  host.appendChild(panel)
  document.body.appendChild(host)
  BOARD.host = host
  if (!mountBoardInto(panel, 'overlay')) {
    document.body.removeChild(host)
    BOARD.host = null
    return false
  }
  if (state.debug) console.log('[dsh-vim] board', BOARD.rows.length, 'conversations')
  return true
}

/**
 * Build the board's parts into a root element, whichever mount owns it.
 *
 * The overlay wraps this in a backdrop and a sheet; the sidebar page hands
 * it the page's own column. The header, the column strip and the footer are
 * the board in both, so a change here reaches both without a second
 * implementation to keep in step.
 * @param {Element} root - the element the board is built into.
 * @param {string} mode - 'overlay' or 'page'.
 * @returns {boolean} whether the board was mounted.
 */
function mountBoardInto(root, mode) {
  if (BOARD.open) return false
  if (!taskServices()) return false
  watchRuns()
  // A page can open long after the branch was made, so the watch is also
  // started here rather than only when the plugin wakes.
  watchForks()
  stopHold()
  stopAnim()
  // A board that takes the keyboard ends any claim the message box had on
  // it; a page does not take the keyboard, so it leaves the claim alone.
  if (mode === 'overlay') clearFocusRequest()
  if (mode === 'page') {
    applyBoardPageInk(root)
    Object.assign(root.style, BOARD_PAGE_UI.surface)
    // A canvas is read at a glance from a distance, so it starts at the
    // reader's own preference or larger — never below what a title needs to
    // be read without leaning in.
    root.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
  }

  var header = document.createElement('div')
  Object.assign(header.style, mode === 'page' ? BOARD_PAGE_UI.header : BOARD_UI.header)
  var title = document.createElement('span')
  Object.assign(title.style, BOARD_UI.titleText)
  title.textContent = paletteText('board')
  var count = document.createElement('span')
  Object.assign(count.style, BOARD_UI.subtitle)
  var only = document.createElement('span')
  Object.assign(only.style, BOARD_UI.starFilter)
  only.setAttribute('role', 'button')
  only.setAttribute('data-role', 'starFilter')
  if (BOARD.onlyStarred) Object.assign(only.style, BOARD_UI.starFilterOn)
  only.textContent = paletteText('boardOnlyStarred')
  only.addEventListener('click', function () {
    BOARD.onlyStarred = !BOARD.onlyStarred
    renderBoard()
  })
  BOARD.starFilter = only
  var zoom = document.createElement('div')
  Object.assign(zoom.style, BOARD_UI.zoomBox)
  var zoomOut = document.createElement('span')
  Object.assign(zoomOut.style, BOARD_UI.zoomButton)
  zoomOut.setAttribute('role', 'button')
  zoomOut.setAttribute('data-role', 'zoomOut')
  zoomOut.setAttribute('title', paletteText('boardZoomOut'))
  zoomOut.textContent = '−'
  zoomOut.addEventListener('click', function () {
    setBoardZoom(BOARD.zoom / BOARD_ZOOM_STEP)
  })
  var zoomLabel = document.createElement('span')
  Object.assign(zoomLabel.style, BOARD_UI.zoomLabel)
  zoomLabel.setAttribute('role', 'button')
  zoomLabel.setAttribute('data-role', 'zoomReset')
  zoomLabel.setAttribute('title', paletteText('boardZoomReset'))
  var zoomIn = document.createElement('span')
  Object.assign(zoomIn.style, BOARD_UI.zoomButton)
  zoomIn.setAttribute('role', 'button')
  zoomIn.setAttribute('data-role', 'zoomIn')
  zoomIn.setAttribute('title', paletteText('boardZoomIn'))
  zoomIn.textContent = '+'
  zoomIn.addEventListener('click', function () {
    setBoardZoom(BOARD.zoom * BOARD_ZOOM_STEP)
  })
  zoomLabel.addEventListener('click', function () {
    setBoardZoom(1)
  })
  // The one press that answers "I cannot see all of this": scale the paper
  // to the window until it fits, then follow the window while it holds.
  var zoomFit = document.createElement('span')
  Object.assign(zoomFit.style, BOARD_UI.zoomFit)
  zoomFit.setAttribute('role', 'button')
  zoomFit.setAttribute('data-role', 'zoomFit')
  zoomFit.setAttribute('title', paletteText('boardZoomFit'))
  zoomFit.setAttribute('aria-label', paletteText('boardZoomFit'))
  zoomFit.appendChild(boardIcon('fit', 12))
  zoomFit.addEventListener('click', function () {
    fitBoardToWindow()
  })
  zoom.appendChild(zoomOut)
  zoom.appendChild(zoomLabel)
  zoom.appendChild(zoomIn)
  zoom.appendChild(zoomFit)

  var arrange = document.createElement('span')
  Object.assign(arrange.style, BOARD_UI.action)
  arrange.setAttribute('role', 'button')
  arrange.setAttribute('data-role', 'tidyBoard')
  arrange.setAttribute('title', paletteText('boardArrangeHint'))
  arrange.textContent = paletteText('boardArrange')
  arrange.addEventListener('click', function () {
    tidyBoard()
  })
  var write = document.createElement('span')
  Object.assign(write.style, BOARD_UI.action)
  write.setAttribute('role', 'button')
  write.setAttribute('data-role', 'addCard')
  write.setAttribute('title', paletteText('boardAddCardHint'))
  write.textContent = paletteText('boardAddCard')
  write.addEventListener('click', function () {
    addBoardCard(write)
  })
  // A place for work that has not started yet. Until this button existed, a
  // goal could only be born from a conversation, which made the board a
  // record of the past rather than a plan for the day.
  var makeGoal = document.createElement('span')
  Object.assign(makeGoal.style, BOARD_UI.action)
  makeGoal.setAttribute('role', 'button')
  makeGoal.setAttribute('data-role', 'addGoal')
  makeGoal.setAttribute('title', paletteText('boardAddGoalHint'))
  makeGoal.textContent = paletteText('boardAddGoal')
  makeGoal.addEventListener('click', function () {
    addBoardGoal()
  })

  header.appendChild(title)
  header.appendChild(count)
  header.appendChild(only)
  // The way back is a button, not a key: the board's keys are letters, and a
  // modifier chord would be the one binding nobody could see. Both buttons say
  // when there is nothing to step to.
  var undo = document.createElement('span')
  Object.assign(undo.style, BOARD_UI.action)
  undo.setAttribute('role', 'button')
  undo.setAttribute('data-role', 'boardUndo')
  undo.setAttribute('title', paletteText('boardUndoHint'))
  undo.textContent = paletteText('boardUndo')
  undo.addEventListener('click', function () {
    if (!BOARD_HISTORY.canUndo()) return
    BOARD_HISTORY.undo()
    if (BOARD.open) renderBoard()
  })
  var redo = document.createElement('span')
  Object.assign(redo.style, BOARD_UI.action)
  redo.setAttribute('role', 'button')
  redo.setAttribute('data-role', 'boardRedo')
  redo.setAttribute('title', paletteText('boardRedoHint'))
  redo.textContent = paletteText('boardRedo')
  redo.addEventListener('click', function () {
    if (!BOARD_HISTORY.canRedo()) return
    BOARD_HISTORY.redo()
    if (BOARD.open) renderBoard()
  })
  // The way back past today: one page for every day the board was drawn on,
  // opened read-only beside the canvas.
  var historyChip = document.createElement('span')
  Object.assign(historyChip.style, BOARD_UI.action)
  historyChip.setAttribute('role', 'button')
  historyChip.setAttribute('data-role', 'boardHistory')
  historyChip.setAttribute('title', paletteText('boardHistoryHint'))
  historyChip.setAttribute('aria-label', paletteText('boardHistoryHint'))
  historyChip.textContent = paletteText('boardHistory')
  historyChip.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    openBoardHistory()
  })
  BOARD.undoButton = undo
  BOARD.redoButton = redo
  BOARD.historyButton = historyChip
  header.appendChild(zoom)
  header.appendChild(undo)
  header.appendChild(redo)
  header.appendChild(arrange)
  header.appendChild(write)
  header.appendChild(makeGoal)
  header.appendChild(historyChip)
  // The last chip on the right is the way out of the canvas into the day's
  // numbers. Only a host with the layout panel has pages to step onto, so a
  // host that keeps the floating board is not offered a door to nowhere.
  var overviewLayout = serviceOf(taskCtx, 'layout')
  if (overviewLayout && typeof overviewLayout.selectPanel === 'function') {
    var overviewChip = document.createElement('span')
    Object.assign(overviewChip.style, BOARD_UI.action)
    overviewChip.setAttribute('role', 'button')
    overviewChip.setAttribute('data-role', 'boardOverview')
    overviewChip.setAttribute('title', paletteText('hintOverview'))
    overviewChip.textContent = paletteText('overview')
    overviewChip.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      boardShowOverview()
    })
    header.appendChild(overviewChip)
  }

  var body = document.createElement('div')
  Object.assign(body.style, mode === 'page' ? BOARD_PAGE_UI.body : BOARD_UI.body)
  body.setAttribute('data-role', 'boardCanvas')
  body.addEventListener('pointerdown', boardPointerDown)
  body.addEventListener('dblclick', onBoardDoubleClick)
  // A transformed stage cannot size its own scroller: the paper around it
  // takes the magnified measurements, and the stage draws at full size
  // inside it. Without this, zooming out would leave a canvas that scrolls
  // as if nothing had changed.
  var sizer = document.createElement('div')
  Object.assign(sizer.style, BOARD_UI.sizer)
  sizer.setAttribute('data-role', 'boardPaper')
  var stage = document.createElement('div')
  Object.assign(stage.style, BOARD_UI.stage)
  stage.setAttribute('data-role', 'boardStage')
  sizer.appendChild(stage)
  body.appendChild(sizer)
  body.addEventListener('wheel', onBoardWheel, { passive: false })
  // The shell's session rows are natively draggable — the gesture the
  // reader already uses to reorder the sidebar — and what a row carries is
  // its conversation's id as plain text. That makes the same gesture a way
  // in: a row let go on the canvas becomes a card here, so the board is
  // reachable from the very list it is read beside.
  body.addEventListener('dragover', onBoardDragOver)
  body.addEventListener('dragleave', onBoardDragLeave)
  body.addEventListener('drop', onBoardDrop)

  var footer = document.createElement('div')
  Object.assign(footer.style, mode === 'page' ? BOARD_PAGE_UI.footer : BOARD_UI.footer)
  footer.textContent = paletteText(mode === 'page' ? 'boardPageHint' : 'boardHint')

  root.appendChild(header)
  root.appendChild(body)
  root.appendChild(footer)

  // A new gesture starts with no drag behind it. Capture runs before the
  // card's own press, so the click that follows a drag still sees the flag
  // it set — and the next press, however soon, does not.
  root.addEventListener('pointerdown', function () {
    if (!BOARD.drag) BOARD.dragged = false
  }, true)
  BOARD.open = true
  BOARD.mode = mode
  BOARD.panel = root
  BOARD.body = body
  BOARD.sizer = sizer
  BOARD.stage = stage
  BOARD.zoom = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, BOARD_STORE.zoom()))
  BOARD.zoomLabel = zoomLabel
  // A board opens at the scale the page remembers, not in fit mode: the
  // fit follows a window the reader resizes, and a fresh window has not
  // been resized yet.
  BOARD.fits = false
  BOARD.linkLayer = null
  BOARD.glide = ''
  BOARD.count = count
  BOARD.unsubscribes = []
  BOARD.blocks = []
  BOARD.inbox = []
  BOARD.nodes = []
  BOARD.cardEditing = ''
  BOARD.cardEditor = null
  BOARD.ideaFocus = ''
  BOARD.ideaFocusHost = null
  BOARD.ideaFocusSheet = null
  BOARD.ideaFocusTitle = null
  BOARD.ideaFocusBody = null
  BOARD.ideaFocusDone = null
  BOARD.ideaFocusAt = null
  BOARD.ideaFocusRaf = 0
  BOARD.paintOwed = false
  renderBoard()
  startDayTimer()

  // Both feeds can change under an open board: a conversation can be
  // touched, archived or created while the board is up. The status feed
  // goes through the throttled repaint, because it can tick often while a
  // turn streams and a tick that changed no card's word is not a repaint.
  var services = taskServices()
  // A tick that arrives by itself is a paint like any other, and the rule
  // about open fields is inside `renderBoard`: this is where the board says
  // what it listens to, not where it decides whether a paint may land.
  if (typeof services.list.subscribe === 'function') {
    BOARD.unsubscribes.push(services.list.subscribe(function () {
      renderBoard()
    }))
  }
  if (services.workspaces && typeof services.workspaces.subscribe === 'function') {
    BOARD.unsubscribes.push(services.workspaces.subscribe(function () {
      renderBoard()
    }))
  }
  if (services.status && typeof services.status.subscribe === 'function') {
    BOARD.unsubscribes.push(services.status.subscribe(function () {
      renderBoardOnStatus()
    }))
  }
  // A native drag that ends anywhere — dropped here, let go back over the
  // sidebar, or cancelled with Escape — owes the canvas its highlight.
  // `dragend` follows the row that started the drag, so the listener lives
  // where every end can reach it, and leaves with the mount.
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('dragend', onNativeDragEnd)
    BOARD.unsubscribes.push(function () {
      document.removeEventListener('dragend', onNativeDragEnd)
    })
  }
  // A canvas fitted to the window has to stay fitted when the window moves
  // under it. The listener is here rather than at open time so the page
  // mount gets it too, and it leaves with the board.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onBoardResize)
    BOARD.unsubscribes.push(function () {
      window.removeEventListener('resize', onBoardResize)
    })
  }
  return true
}

/**
 * Unmount the board, whichever mount holds it.
 *
 * The page's container belongs to the React component that rendered it, so
 * this drops the state and the subscriptions and leaves the empty element
 * alone; removing the element is the overlay's own job, below.
 * @returns {boolean} whether a board was up.
 */
function unmountBoard() {
  if (!BOARD.open) return false
  BOARD.open = false
  stopDayTimer()
  closeBoardHistory()
  for (var i = 0; i < BOARD.unsubscribes.length; i++) {
    try {
      BOARD.unsubscribes[i]()
    } catch (error) {
      console.warn('[dsh-vim] board feed unsubscribe failed', error)
    }
  }
  BOARD.unsubscribes = []
  // A window that goes away takes its gesture with it, ghost included.
  endBoardDrag()
  // And its clocks: the tick belongs to the cards on screen, and there
  // are none left to keep honest.
  stopBoardClock()
  BOARD.clocks = []
  BOARD.statuses = ''
  BOARD.noteEditing = ''
  BOARD.noteEditor = null
  // The new-conversation sheet belongs to the window that opened it: its
  // fields and its half-written title leave with the board.
  closeNewSessionSheet()
  // The idea sheet is the board's too. An existing card keeps the words it
  // wrote, and a draft still lands: closing the canvas is not a reason to
  // lose the sentence that was being written into it.
  closeIdeaFocus({ paint: false })
  BOARD.cardEditing = ''
  BOARD.cardEditor = null
  BOARD.renamingCard = ''
  BOARD.renameCardInput = null
  // The day's summary is a page on this window: a reference left behind
  // would be a key handler answering a node that is no longer on screen.
  closeSeal()
  BOARD.panel = null
  BOARD.body = null
  BOARD.sizer = null
  BOARD.stage = null
  BOARD.zoomLabel = null
  BOARD.fits = false
  BOARD.linkLayer = null
  BOARD.undoButton = null
  BOARD.redoButton = null
  BOARD.glide = ''
  // A tidy in flight writes nothing when its board is gone, so the flag it
  // holds must not outlive the window: the next board would draw nothing.
  BOARD.tidy = false
  BOARD.count = null
  BOARD.inbox = []
  BOARD.front = ''
  BOARD.dropGoal = null
  // The line being typed is kept, and a goal the toolbar started that never
  // got one is let go: a draft is a place for a decision, and the board
  // going away is the decision.
  if (BOARD.intentBlock && BOARD.intentInput) commitGoalIntent(false)
  BOARD.intentBlock = ''
  BOARD.intentInput = null
  if (BOARD.blocks.length) {
    var standing = []
    for (var s = 0; s < BOARD.blocks.length; s++) {
      var held = BOARD.blocks[s]
      if (BOARD.drafts[held.key] && !held.rows.length && !BOARD_STORE.intentOf(held.key)) continue
      standing.push(held.key)
    }
    BOARD_STORE.pruneGoals(standing)
  }
  BOARD.drafts = Object.create(null)
  BOARD.renamingBlock = ''
  BOARD.renameBlockInput = null
  BOARD.renameCardDraft = null
  // The goal's menu is a press-time visitor, not a record: a window that
  // closes with it open must not open the next one with it still standing.
  BOARD.goalMenu = ''
  // The names that stood in for the feed, and the completions that have had
  // their beat, both belong to the visit: the next board reads the list
  // again, and a completion still unread gets its beat back.
  if (BOARD.titleTimer) {
    window.clearTimeout(BOARD.titleTimer)
    BOARD.titleTimer = 0
  }
  BOARD.titles = Object.create(null)
  BOARD.freshed = Object.create(null)
  // A branch still being made belongs to a board that is no longer up: its
  // card is gone with the canvas, and the next visit must draw the mark as
  // ready rather than as a press that will never be answered.
  BOARD.forking = Object.create(null)
  BOARD.blocks = []
  BOARD.nodes = []
  BOARD.folders = Object.create(null)
  // The "only marked" view is a way of reading the board for a moment, not
  // a setting: the next opening starts from everything.
  BOARD.onlyStarred = false
  // The bin's chip and list live on this board's heading: the next visit
  // builds its own, and a reference left behind would write into a heading
  // that is no longer on the page.
  BOARD.doneBinOpen = false
  BOARD.doneBinFilter = ''
  BOARD.doneBin = null
  BOARD.doneBinPanel = null
  BOARD.dragged = false
  return true
}

/** Take the floating board down, element and all. */
function closeBoard() {
  if (!BOARD.open && !BOARD.host) return false
  unmountBoard()
  if (BOARD.host && BOARD.host.parentNode) {
    BOARD.host.parentNode.removeChild(BOARD.host)
  }
  BOARD.host = null
  return true
}


/**
 * Bring one card to the front of the paper.
 *
 * Cards overlap as soon as one is pulled out of its goal, and a pile is
 * only readable if the card being worked on is the one on top. The press
 * raises it, and the repaint remembers which card that was, so a repaint
 * does not put it back under the others.
 * @param {string} id - session id or card id.
 * @param {Element} node - its element, when there is one already.
 * @returns {void}
 */
function raiseBoardCard(id, node) {
  if (!id) return
  BOARD.zTop = BOARD.zTop + 1
  BOARD.front = id
  if (!node) return
  node.setAttribute('data-front', 'true')
  node.style.zIndex = String(BOARD.zTop)
}

/**
 * Lift one put-away note out of the tray, under the hand.
 *
 * A note in the tray is a line, and a line cannot be dragged around a canvas:
 * so the first movement turns it back into paper where the hand is, and the
 * gesture goes on as the ordinary note drag from there.
 * @param {object} drag - the armed press.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function beginNoteLift(drag, x, y) {
  var id = drag.key
  if (!id) return
  var point = canvasPointOf(x, y)
  var at = {
    x: Math.max(0, point.x - BOARD_CARD_W / 2),
    y: Math.max(0, point.y - 24),
  }
  BOARD_STORE.unfileCard(id)
  // A card lifted out of the tray or the finished list is a free thought
  // again: it leaves the conversation's column with the same gesture that
  // takes it off the list, or the paint would file it straight back in.
  BOARD_STORE.unlinkCard(id)
  BOARD_STORE.moveCard(id, at.x, at.y)
  // The paint has to happen with no gesture in its way, and the row this
  // press started on is replaced by it: so the drag stands aside for that
  // one call and comes back retired to an ordinary note drag.
  BOARD.drag = null
  renderBoard()
  BOARD.drag = drag
  var node = BOARD.looseNodes[id]
  if (!node) {
    BOARD.drag = null
    return
  }
  drag.kind = 'note'
  drag.node = node
  drag.baseX = at.x
  drag.baseY = at.y
  drag.fromX = x
  drag.fromY = y
  drag.x = at.x
  drag.y = at.y
  BOARD.front = id
  node.setAttribute('data-front', 'true')
  // A lifted line is being carried like any note, so the bands belong up.
  showDropZones(true, boardNoteDone(id))
}

/**
 * Say which goal would take the card if the hand let go of it here.
 *
 * The carrier is out of the hit test, so the point under it is the goal
 * itself: the panel that answers is the panel the card would be filed in,
 * and saying so before the drop is what makes the gesture readable while
 * it is still going on.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function markDropGoal(x, y, target) {
  var found = goalNodeAt(x, y, target)
  if (BOARD.dropGoal && BOARD.dropGoal !== found) {
    BOARD.dropGoal.setAttribute('data-drop', 'false')
  }
  BOARD.dropGoal = found
  if (found) found.setAttribute('data-drop', 'true')
  markNoDrop(!found, x, y)
}

/**
 * Light the finished strip a carried conversation would land in.
 *
 * One highlight at a time: the strip under the hand keeps the light, and a
 * strip the hand has left takes it away. The light is the same fact the
 * drop writes, said before the fingers let go.
 * @param {Element|null} bar - the strip, or null when none is under the hand.
 * @returns {void}
 */
function markDoneDrop(bar) {
  if (BOARD.doneDrop && BOARD.doneDrop !== bar) {
    BOARD.doneDrop.setAttribute('data-drop', 'false')
  }
  BOARD.doneDrop = bar
  if (bar) bar.setAttribute('data-drop', 'true')
}

/**
 * Say, under the hand, that the paper will not take this card.
 *
 * The drop is refused for a reason the reader can watch coming (see the last
 * conversation rule in `onBoardUp`), so the reason is said while the card is
 * still being carried rather than after it has already been put back. A
 * gesture explained only after it fails teaches nothing.
 * @param {boolean} paper - whether the hand is over the paper.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function markNoDrop(paper, x, y) {
  var drag = BOARD.drag
  var alone = false
  if (paper && drag && drag.kind === 'session') {
    var home = boardHomeOf(drag.key)
    alone = !!home && home.rows.length <= 1
  }
  if (!alone) {
    dropNoDropTip()
    return
  }
  if (!BOARD.noDropTip && BOARD.stage) {
    var tip = document.createElement('div')
    Object.assign(tip.style, BOARD_UI.noDropTip)
    tip.setAttribute('data-role', 'noDropTip')
    BOARD.noDropTip = tip
  }
  if (!BOARD.noDropTip || !BOARD.stage) return
  BOARD.noDropTip.textContent = paletteText('boardGoalLastCard')
  var at = canvasPointOf(x, y)
  BOARD.noDropTip.style.left = Math.round(at.x) + 'px'
  BOARD.noDropTip.style.top = Math.round(at.y + 20) + 'px'
  if (BOARD.noDropTip.parentNode !== BOARD.stage) BOARD.stage.appendChild(BOARD.noDropTip)
}

/** Take the "the paper will not take it" line off the page. */
function dropNoDropTip() {
  if (BOARD.noDropTip && BOARD.noDropTip.parentNode) {
    BOARD.noDropTip.parentNode.removeChild(BOARD.noDropTip)
  }
  BOARD.noDropTip = null
}

/**
 * Whether a native drag carries words, the one thing the shell's rows set.
 *
 * The words themselves are guarded until the drop, so this is all the
 * `dragover` can ask. The canvas takes a text-bearing drag and says at the
 * drop whether it was a conversation; a drag carrying files, or nothing at
 * all, is not the board's to answer.
 * @param {object} ev - the drag event.
 * @returns {boolean} whether `text/plain` is aboard.
 */
function boardDragHasText(ev) {
  var transfer = ev && ev.dataTransfer
  if (!transfer || !transfer.types) return false
  try {
    if (typeof transfer.types.indexOf === 'function') {
      return transfer.types.indexOf('text/plain') >= 0
    }
    if (typeof transfer.types.contains === 'function') {
      return transfer.types.contains('text/plain')
    }
  } catch (error) {
    return false
  }
  return false
}

/**
 * The words a native drag is carrying, read where the browser allows it.
 * @param {object} ev - the drop event.
 * @returns {string} the plain text aboard, trimmed.
 */
/**
 * The conversation a dropped payload names.
 *
 * The shell's rows carry their conversation's id as plain text, and the board
 * reads the payload as words rather than as one string: a row that carries
 * its own label as well, or a drag that came from a message or a link, still
 * usually carries the id somewhere in what it says. An id is never a
 * substring of another, so the first word that names a conversation answers.
 *
 * When no word is an id, a payload that is exactly one conversation's name
 * names that conversation: a row dragged out of the sidebar is a deliberate
 * gesture, and its name is the other thing it can honestly be carrying. Two
 * conversations sharing that name name neither - a wrong filing is worse than
 * a refusal, and the refusal is said out loud.
 * @param {string} payload - what the drag carried.
 * @returns {object|null} the conversation, or null.
 */
function sessionInPayload(payload) {
  var pool = conversationPool()
  if (!pool.length) return null
  var words = String(payload).split(/\s+/)
  var i
  var p
  for (i = 0; i < words.length; i++) {
    var word = words[i]
      .replace(/^[([\u300c\u300a"']+/, '')
      .replace(/[)\]\u300d\u300b"',.;:]+$/, '')
    if (!word) continue
    for (p = 0; p < pool.length; p++) {
      if (pool[p].id === word) return pool[p]
    }
  }
  var text = String(payload).replace(/\s+/g, ' ').trim()
  if (!text) return null
  var named = null
  var matched = 0
  for (p = 0; p < pool.length; p++) {
    if (boardTitleOf(pool[p]) !== text) continue
    named = pool[p]
    matched = matched + 1
  }
  return matched === 1 ? named : null
}

function boardDragText(ev) {
  var transfer = ev && ev.dataTransfer
  if (!transfer || typeof transfer.getData !== 'function') return ''
  try {
    return String(transfer.getData('text/plain') || '').trim()
  } catch (error) {
    return ''
  }
}

/**
 * Take the goal highlight a native drag drew off the paper.
 *
 * The drop reads it first, so this is called after the decision rather
 * than before it: the line belongs to the gesture, and the paint that
 * follows owes it nothing.
 * @returns {void}
 */
function clearBoardDragGoal() {
  if (BOARD.dropGoal) {
    BOARD.dropGoal.setAttribute('data-drop', 'false')
    BOARD.dropGoal = null
  }
  dropNoDropTip()
}

/**
 * A native drag is over, however it ended.
 *
 * `dragend` travels with the row that started the drag, in the sidebar —
 * the canvas never sees it — so the listener that takes the highlight
 * back down lives where every end is the same end. A drop already took it
 * down; this is for the ends that never land here.
 * @returns {void}
 */
function onNativeDragEnd() {
  if (!BOARD.open) return
  clearBoardDragGoal()
}

/**
 * Say, while a native drag is over the canvas, which goal would take it.
 *
 * The same line the board draws under its own carried cards, so two
 * gestures that mean the same thing read the same way while they are still
 * going on.
 * @param {object} ev - the dragover.
 * @returns {void}
 */
function onBoardDragOver(ev) {
  if (!BOARD.open || !boardDragHasText(ev)) return
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  markDropGoal(Number(ev.clientX) || 0, Number(ev.clientY) || 0, ev.target)
}

/**
 * The native drag left the canvas: take the goal highlight with it.
 *
 * `dragleave` also fires on the way into a panel's children, so only the
 * leave that crosses out of the canvas counts — the hand is still in, and
 * the goal it stands on is still the one that would take the card.
 * @param {object} ev - the dragleave.
 * @returns {void}
 */
function onBoardDragLeave(ev) {
  if (!BOARD.open) return
  var to = ev && ev.relatedTarget
  if (to && BOARD.body && typeof BOARD.body.contains === 'function'
    && BOARD.body.contains(to)) return
  clearBoardDragGoal()
}

/**
 * A conversation let go on the canvas, carried in from the host's sidebar.
 *
 * The shell's session rows carry their conversation's id as plain text, so
 * the board does not need rows of its own to reach itself: letting go here
 * puts the conversation on it — under the goal the hand was aiming at when
 * there was one, following its workspace when there was not. Whatever the
 * row was, the canvas has said yes to the drag, so the drop is answered
 * here rather than left to whatever the browser makes of a text drop.
 * @param {object} ev - the drop.
 * @returns {void}
 */
function onBoardDrop(ev) {
  if (!BOARD.open) return
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  clearBoardDragGoal()
  var payload = boardDragText(ev)
  if (!payload) return
  var known = sessionInPayload(payload)
  if (!known) {
    showToast(paletteText('boardDragUnknown'))
    return
  }
  dropSessionOntoBoard(known.id, goalUnder(Number(ev.clientX) || 0, Number(ev.clientY) || 0, ev.target))
}

/**
 * Take one conversation the reader dragged in, and keep it.
 *
 * The same records the pin key writes — the ★ that outlives the day, the
 * deletion lifted — plus the goal the hand let go on, when it aimed at
 * one. One line says what happened, and the filing is the more specific
 * claim, so it is the one spoken when both are true; letting go on the
 * goal the card already stands in files nothing, exactly as the board's
 * own carried cards behave.
 * @param {string} id - the conversation the row carried.
 * @param {string} overGoal - the block the hand let go on, or '' for the paper.
 * @returns {void}
 */
function dropSessionOntoBoard(id, overGoal) {
  var already = BOARD_STORE.isStarred(id)
  BOARD_STORE.unmute(id)
  if (!already) BOARD_STORE.toggleStar(id)
  var home = boardHomeOf(id)
  if (overGoal && (!home || home.key !== overGoal)) {
    BOARD_STORE.placeSession(id, overGoal)
    showToast(paletteText('boardMoved'))
  } else {
    showToast(paletteText(already ? 'pinAlready' : 'pinDone'))
  }
  if (BOARD.open && !BOARD.noteEditing) renderBoard()
}

/**
 * A press on a block's heading: the handle the panel is dragged by.
 *
 * Nothing moves until the pointer has travelled `BOARD_SLOP`, so a press on
 * the way to the fold toggle still opens and closes the panel.
 * @param {string} key - the block's key.
 * @param {Element} node - the block element.
 * @param {PointerEvent} ev - the pointerdown.
 * @returns {void}
 */
/**
 * What the pointer is standing on, as far as the canvas is concerned.
 *
 * There is one press handler on the board, and this is the whole of how it
 * decides what a press means: the nearest element that declares
 * `data-handle` wins, in the order a reader would say it - a card is a card
 * before it is part of a goal - and a field declares `data-no-drag` because
 * a press inside one is the field's (it is how text is selected).
 * @param {Element} target - the element pressed.
 * @returns {{kind: string, el: Element, key: string}|null} what it is, or
 *   null for the paper itself.
 */
function handleOf(target) {
  if (!target || typeof target.closest !== 'function') return null
  if (target.closest('[data-no-drag]')) return { kind: 'field', el: null, key: '' }
  var card = target.closest('[data-handle="card"]')
  if (card) return { kind: 'card', el: card, key: card.getAttribute('data-session-id') || '' }

  var note = target.closest('[data-handle="note"]')
  if (note) return { kind: 'note', el: note, key: note.getAttribute('data-card-id') || '' }
  // A put-away note is a line of the tray: it is lifted back out onto the
  // paper, so the press belongs to it and not to the panel it stands in.
  var row = target.closest('[data-handle="inboxNote"]')
  if (row) return { kind: 'inboxNote', el: row, key: row.getAttribute('data-card-id') || '' }
  var goal = target.closest('[data-handle="goal"]')
  if (goal) return { kind: 'goal', el: goal, key: goal.getAttribute('data-block') || '' }
  return null
}

/**
 * Lift one card out of a conversation's column, where the hand is.
 *
 * A card in a pile has no free position to move, so the gesture carries a
 * copy: the card it came from stays in place and dims, and the copy is what
 * the hand drags. Letting go on a column files it there; letting go anywhere
 * else gives it a place of its own again.
 * @param {object} drag - the armed gesture.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function beginStackedCarrier(drag, x, y) {
  if (!drag || !drag.node || !BOARD.stage) return
  var point = canvasPointOf(x, y)
  var ghost = document.createElement('div')
  Object.assign(ghost.style, BOARD_UI.ghost)
  ghost.className = 'dshv-ghost'
  ghost.setAttribute('data-role', 'dragGhost')
  ghost.style.left = Math.max(0, point.x - BOARD_CARD_W / 2) + 'px'
  ghost.style.top = Math.max(0, point.y - 18) + 'px'
  ghost.style.width = BOARD_CARD_W + 'px'
  // The copy is what the hand holds. A host without cloneNode still gets
  // the carrier - the card's own box, empty - because the gesture is what
  // matters, not the decoration on it.
  var copy = typeof drag.node.cloneNode === 'function' ? drag.node.cloneNode(true) : null
  if (copy) {
    if (copy.removeAttribute) copy.removeAttribute('data-stack')
    copy.style.position = 'relative'
    copy.style.left = ''
    copy.style.top = ''
    copy.style.width = '100%'
    ghost.appendChild(copy)
  }
  drag.origin = drag.node
  drag.origin.style.opacity = '0.35'
  drag.fromStack = drag.stacked
  BOARD.stage.appendChild(ghost)
  drag.node = ghost
  drag.baseX = Math.max(0, point.x - BOARD_CARD_W / 2)
  drag.baseY = Math.max(0, point.y - 18)
  drag.fromX = x
  drag.fromY = y
}

/**
 * The card a drop should sit above, from where the pointer let go.
 * @param {Element} stack - the conversation's pile.
 * @param {number} y - the pointer's client y.
 * @returns {string} the card id, or '' for the bottom of the pile.
 */
function stackCardBefore(stack, y) {
  if (!stack || !stack.children) return ''
  var at = Number(y) || 0
  for (var i = 0; i < stack.children.length; i++) {
    var child = stack.children[i]
    if (!child.getAttribute) continue
    if (child.getAttribute('data-role') !== 'looseCard') continue
    var rect = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect() : null
    if (!rect || (!rect.height && !rect.width)) continue
    if (at < rect.top + rect.height / 2) return child.getAttribute('data-card-id') || ''
  }
  return ''
}

function paintStackDrop(target) {
  var stacks = BOARD.stacks || []
  for (var i = 0; i < stacks.length; i++) {
    var el = stacks[i].el
    if (!el || !el.getAttribute) continue
    el.setAttribute('data-drop', el === target ? 'true' : 'false')
  }
}

/**
 * Light the heading of the goal a carried card would start a conversation in.
 *
 * The plus and the name are one target, so the whole row is what says it
 * would take the card. Every heading is told either way, so a row left lit
 * cannot outlive the hand that lit it.
 * @param {Element|null} target - the heading under the hand.
 * @returns {void}
 */
function paintHeadDrop(target) {
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var heads = BOARD.stage.querySelectorAll('[data-role="blockHead"]')
  for (var i = 0; i < heads.length; i++) {
    var on = heads[i] === target && !!goalHeadKeyUnder(heads[i])
    heads[i].setAttribute('data-drop', on ? 'true' : 'false')
  }
}


/**
 * The one press handler on the canvas.
 *
 * Every gesture starts here and nowhere else. What the press *means* is read
 * from the element under it (`handleOf`); what the press *is* is settled by
 * `onBoardMove` on the first movement past `BOARD_SLOP`. The pieces inside -
 * names, notes, buttons, fields - never take a press, so they cannot take one
 * from each other: they answer clicks, and a click that arrived after a real
 * drag is dropped by their own `BOARD.dragged` check.
 * @param {PointerEvent} ev - the pointerdown.
 * @returns {void}
 */
function boardPointerDown(ev) {
  if (!BOARD.open || !ev || (ev.button !== undefined && ev.button !== 0)) return
  if (BOARD.drag) return
  // Every press starts from "this was not a drag": a flag left over from the
  // gesture before it would swallow the click that follows this one.
  BOARD.dragged = false
  // A press anywhere but the menu itself dismisses it, and still does what
  // the press meant to do.
  var menuHit = ev.target && typeof ev.target.closest === 'function'
    ? ev.target.closest('[data-role="ideaMenu"],[data-role="cardMenu"],[data-role="cardMenuOpen"],[data-role="seatMenu"],[data-role="blockDot"],[data-role="goalMenu"],[data-role="goalMenuOpen"],[data-role="verdictMenu"],[data-role="cardState"],[data-role="cardStateAdd"]')
    : null
  if (!menuHit) {
    closeIdeaMenu()
    closeSessionMenu()
    closeSeatMenu()
    closeGoalMenu()
    closeVerdictMenu()
  }
  var hit = handleOf(ev.target)
  if (hit && hit.kind === 'field') return
  // A press anywhere but the field being typed into settles that field, the
  // way a press anywhere but a dialog dismisses the dialog. It is also what
  // makes an empty card go away the moment the reader clicks the paper: the
  // card closes empty, and an empty card is not a note.
  //
  // The words are settled here, but the paint is not. The click behind
  // this press is still on its way, and a paint now would replace the
  // element that click aims at: the press that hands the reader from the
  // name to the thought would swallow its own click, and the thought would
  // never open. The field is taken off the page - so a later paint is
  // allowed again - and the paint is owed to whoever ends this gesture.
  // Only a field that is really on the page counts: a stale edit pointer
  // would settle a card the reader is not looking at.
  if (BOARD.cardEditing && boardFieldOpen()) {
    var inField = ev.target && typeof ev.target.closest === 'function'
      ? ev.target.closest('[data-role="cardText"], [data-role="cardTitleInput"]')
      : null
    if (!inField) settleBoardCardForPress()
  }
  var fromX = Number(ev.clientX) || 0
  var fromY = Number(ev.clientY) || 0
  if (!hit) {
    // The paper itself: move the canvas under the eye.
    BOARD.drag = {
      kind: 'pan',
      fromX: fromX,
      fromY: fromY,
      scrollLeft: Number(BOARD.body.scrollLeft) || 0,
      scrollTop: Number(BOARD.body.scrollTop) || 0,
      moved: false,
    }
    boardListen()
    return
  }
  if (!hit.key) return
  if (hit.kind === 'goal') {
    var places = BOARD_STORE.blocks()
    var place = places[hit.key]
    if (!place) return
    BOARD.drag = {
      kind: 'goal',
      key: hit.key,
      node: hit.el,
      fromX: fromX,
      fromY: fromY,
      baseX: place.x,
      baseY: place.y,
      x: place.x,
      y: place.y,
      moved: false,
    }
    boardListen()
    return
  }

  if (hit.kind === 'note') {
    var cards = BOARD_STORE.cards()
    var found = null
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === hit.key) found = cards[i]
    }
    if (!found) return
    raiseBoardCard(hit.key, hit.el)
    BOARD.drag = {
      kind: 'note',
      key: hit.key,
      node: hit.el,
      // A card drawn inside a conversation's column has no place of its
      // own to move: dragging it asks which column, and where in the pile.
      stacked: hit.el.getAttribute('data-stack') || '',
      fromX: fromX,
      fromY: fromY,
      baseX: found.x,
      baseY: found.y,
      x: found.x,
      y: found.y,
      moved: false,
    }
    boardListen()
    return
  }
  if (hit.kind === 'inboxNote') {
    // A line of the tray: a press that moves lifts it back onto the paper.
    BOARD.drag = {
      kind: 'inboxNote',
      key: hit.key,
      node: hit.el,
      fromX: fromX,
      fromY: fromY,
      moved: false,
    }
    boardListen()
    return
  }
  // A conversation card: carried as a copy, and filed into the goal it is
  // let go on.
  raiseBoardCard(hit.key, hit.el)
  BOARD.drag = {
    kind: 'session',
    key: hit.key,
    node: null,
    origin: hit.el,
    // A line of the quiet strip is a conversation like any other, and
    // dragging it is the reader pulling it back into the day.
    quiet: hit.el.getAttribute('data-role') === 'quietRow',
    carry: [],
    // The column is what a horizontal drag sorts, and the panel is the
    // boundary: inside it the drag is a sort, outside it is a move.
    column: typeof hit.el.closest === 'function' ? hit.el.closest('[data-role="sessionColumn"]') : null,
    panel: typeof hit.el.closest === 'function' ? hit.el.closest('[data-role="workspaceBlock"]') : null,
    mode: '',
    fromX: fromX,
    fromY: fromY,
    baseX: 0,
    baseY: 0,
    x: 0,
    y: 0,
    moved: false,
  }
  boardListen()
}

function showDropZones(on, filed) {
  var zones = BOARD.dropZones || []
  var word = paletteText(filed ? 'boardCardFileHint' : 'boardCardEnterHint')
  for (var i = 0; i < zones.length; i++) {
    zones[i].style.display = on ? 'flex' : 'none'
    zones[i].style.pointerEvents = on ? 'auto' : 'none'
    if (zones[i].enterWord && zones[i].enterWord.textContent !== word) {
      zones[i].enterWord.textContent = word
    }
  }
  if (BOARD.body) BOARD.body.setAttribute('data-note-drag', on ? 'true' : 'false')
  BOARD.dropOn = on === true
}

/** Start listening for the rest of a gesture, once it has been armed. */
function boardListen() {
  window.addEventListener('pointermove', onBoardMove, true)
  window.addEventListener('pointerup', onBoardUp, true)
  // A gesture belongs to the window it started in: losing the window -
  // the reader switched apps mid-press - loses the pointer with it, and
  // an up that never comes must not leave the board deaf to the next
  // press.
  window.addEventListener('blur', onBoardBlurDrag)
}

/**
 * Start a session drag: a sort inside its own panel, a carry outside it.
 * @param {object} drag - the armed gesture.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function beginSessionGrab(drag, x, y) {
  if (beginSessionReorder(drag, x, y)) return
  drag.mode = 'carry'
  beginSessionCarrier(drag, x, y)
}

/**
 * Whether a hand is still close enough to its panel to be sorting inside it.
 *
 * The panel is the boundary, with a margin: the body is narrower than the
 * card the hand picked up, so a sort that gave up over the heading would be a
 * gesture changing its mind on the way out. Only a real departure turns the
 * drag into a move.
 * @param {object} seat - the panel's client rect.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {boolean} whether the point is inside, by the margin.
 */
function panelHolds(seat, x, y) {
  if (!seat) return false
  return x >= seat.left - BOARD_SORT_EDGE && x <= seat.right + BOARD_SORT_EDGE
    && y >= seat.top - BOARD_SORT_EDGE && y <= seat.bottom + BOARD_SORT_EDGE
}

/**
 * Sort one conversation among its neighbours, where the hand is.
 *
 * The columns are measured once, at the start: a gesture that read the page
 * on every frame would be the one thing standing between the pointer and
 * the paper. After that the dragged column follows the hand in both axes and
 * its neighbours step aside in transforms only - no repaint, no reflow.
 * @param {object} drag - the armed gesture.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {boolean} whether a sort began.
 */
function beginSessionReorder(drag, x, y) {
  if (!drag || !drag.column || !drag.panel || !drag.column.parentNode) return false
  var seat = typeof drag.panel.getBoundingClientRect === 'function'
    ? drag.panel.getBoundingClientRect()
    : null
  if (!seat || !seat.width) return false
  if (!panelHolds(seat, x, y)) return false
  var kids = drag.column.parentNode.children || []
  var list = []
  for (var i = 0; i < kids.length; i++) {
    var el = kids[i]
    if (!el.getAttribute || el.getAttribute('data-role') !== 'sessionColumn') continue
    list.push({ el: el, rect: el.getBoundingClientRect() })
  }
  if (list.length < 2) return false
  var index = -1
  for (var k = 0; k < list.length; k++) {
    if (list[k].el === drag.column) index = k
  }
  if (index < 0) return false
  drag.mode = 'reorder'
  BOARD.reorder = {
    key: drag.panel.getAttribute('data-block') || '',
    sessionId: drag.key,
    column: drag.column,
    panel: drag.panel,
    list: list,
    index: index,
    at: index,
    fromX: x,
    fromY: y,
  }
  drag.column.setAttribute('data-sorting', 'true')
  drag.column.style.position = 'relative'
  drag.column.style.zIndex = '40'
  drag.column.style.transition = 'none'
  drag.column.style.pointerEvents = 'none'
  drag.panel.style.overflow = 'visible'
  for (var t = 0; t < list.length; t++) {
    if (t === index) continue
    list[t].el.style.transition = 'transform .16s ease'
  }
  return true
}

/**
 * Follow the hand, and let the other columns make room as it passes them.
 *
 * A panel reads across more than one row once it holds more than three
 * conversations, so a card's place is a point in a grid rather than a rank
 * in a line. The hand's height says which row it is asking for and its width
 * says where in that row; a column moves by the difference between where it
 * stands and the slot its new rank occupies. Measuring every delta against
 * the slots themselves keeps the row wrap, and the rule between rows, in the
 * same picture.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function paintSessionReorder(x, y) {
  var state = BOARD.reorder
  if (!state) return
  // The stage is scaled: a pixel of the hand is one over `zoom` of paper.
  var zoom = BOARD.zoom || 1
  state.column.style.transform = 'translate(' + ((x - state.fromX) / zoom) + 'px, '
    + ((y - state.fromY) / zoom) + 'px)'
  var at = sessionSlotAt(state, x, y)
  if (at === state.at) return
  state.at = at
  for (var j = 0; j < state.list.length; j++) {
    if (j === state.index) continue
    var to = j
    if (state.index < at && j > state.index && j <= at) to = j - 1
    else if (at < state.index && j >= at && j < state.index) to = j + 1
    var slot = state.list[to].rect
    var here = state.list[j].rect
    var dx = (slot.left - here.left) / zoom
    var dy = (slot.top - here.top) / zoom
    state.list[j].el.style.transform = dx || dy
      ? 'translate(' + dx + 'px, ' + dy + 'px)'
      : ''
  }
}

/**
 * The place the hand is asking for, read off the grid.
 *
 * The columns are grouped into rows by their tops; the hand's height picks a
 * row, and its width says how many of that row stand to its left. Everything
 * in a row above comes first in reading order, everything below comes later.
 * A hand past the last row is asking for the end, and one above the first
 * for the front.
 * @param {object} state - the captured sort.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {number} the place among the other columns, after the moving one.
 */
function sessionSlotAt(state, x, y) {
  var list = state.list
  var rows = []
  var rowOf = []
  var i
  for (i = 0; i < list.length; i++) {
    var rect = list[i].rect
    var found = -1
    for (var r = 0; r < rows.length; r++) {
      if (Math.abs(rows[r].top - rect.top) <= 1) {
        found = r
        break
      }
    }
    if (found < 0) {
      rows.push({ top: rect.top, bottom: rect.bottom })
      found = rows.length - 1
    }
    if (rect.bottom > rows[found].bottom) rows[found].bottom = rect.bottom
    rowOf.push(found)
  }
  if (!rows.length) return state.index
  if (y < rows[0].top) return 0
  if (y > rows[rows.length - 1].bottom) return list.length - 1
  // The rows were met in document order, which is row-major, so their tops
  // are already the order the eye reads them in.
  var pointerRow = 0
  for (i = 0; i < rows.length; i++) {
    if (y >= rows[i].top) pointerRow = i
  }
  var at = 0
  for (i = 0; i < list.length; i++) {
    if (i === state.index) continue
    if (rowOf[i] < pointerRow) at = at + 1
    else if (rowOf[i] === pointerRow
      && list[i].rect.left + list[i].rect.width / 2 < x) at = at + 1
  }
  return at
}

/**
 * Hand the drag back to the carrier, because the pointer left the panel.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function leaveSessionReorder(x, y) {
  if (!BOARD.reorder) return
  resetSessionReorder()
  var drag = BOARD.drag
  if (!drag) return
  drag.mode = 'carry'
  beginSessionCarrier(drag, x, y)
}

/**
 * Put every column back where the paint left it.
 * @returns {void}
 */
function resetSessionReorder() {
  var state = BOARD.reorder
  if (!state) return
  for (var i = 0; i < state.list.length; i++) {
    var el = state.list[i].el
    el.style.transform = ''
    el.style.transition = ''
    el.style.position = ''
    el.style.zIndex = ''
    el.style.pointerEvents = ''
    el.setAttribute('data-sorting', 'false')
  }
  if (state.panel) state.panel.style.overflow = ''
  BOARD.reorder = null
}

/**
 * Write the order the hand chose, once, and draw it.
 *
 * Only the conversations the panel draws as columns are written: a quiet one
 * is a line in the strip with no column to be sorted among, so it keeps the
 * tail it was read into instead of being handed a place in the middle of the
 * grid that no paint would ever draw it in.
 * @param {object} state - the captured sort.
 * @returns {void}
 */
function commitSessionReorder(state) {
  if (!state || !state.key || !state.sessionId) return
  var blocks = BOARD.blocks || []
  var rows = []
  for (var b = 0; b < blocks.length; b++) {
    if (blocks[b].key === state.key) rows = blocks[b].rows
  }
  var drawn = []
  for (var i = 0; i < state.list.length; i++) {
    var el = state.list[i].el
    var id = el && el.getAttribute ? el.getAttribute('data-column') : ''
    if (id) drawn.push(id)
  }
  var from = drawn.indexOf(state.sessionId)
  if (from < 0) return
  drawn.splice(from, 1)
  var at = Math.max(0, Math.min(drawn.length, state.at))
  if (at === from) return
  drawn.splice(at, 0, state.sessionId)
  var ids = drawn.slice()
  for (var r = 0; r < rows.length; r++) {
    if (ids.indexOf(rows[r].id) < 0) ids.push(rows[r].id)
  }
  BOARD_STORE.setOrder(state.key, ids)
  renderBoard()
}

/**
 * Give a carried card its body, where the hand is.
 *
 * The copy follows the hand and the card it came from is left dimmed in its
 * place: what the gesture is choosing is which goal to file the conversation
 * under, and both ends of that choice have to stay visible until it is made.
 * @param {object} drag - the armed gesture.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function beginSessionCarrier(drag, x, y) {
  var summary = null
  for (var i = 0; i < BOARD.rows.length; i++) {
    if (BOARD.rows[i].id === drag.key) summary = BOARD.rows[i]
  }
  if (!summary || !BOARD.stage) {
    // Nothing to carry means this paint and the gesture disagree; dropping
    // the gesture is cheaper than moving a card that is not on the page.
    BOARD.drag = null
    return
  }
  var point = canvasPointOf(x, y)
  var at = {
    x: Math.max(0, point.x - BOARD_FLOAT_W / 2),
    y: Math.max(0, point.y - 24),
  }
  var carrier = document.createElement('div')
  Object.assign(carrier.style, BOARD_UI.ghost)
  carrier.className = 'dshv-ghost'
  carrier.setAttribute('data-role', 'dragGhost')
  carrier.setAttribute('data-session-id', drag.key)
  carrier.style.left = at.x + 'px'
  carrier.style.top = at.y + 'px'
  carrier.style.width = BOARD_FLOAT_W + 'px'
  carrier.appendChild(buildBoardCard(summary, '', Object.create(null)))
  BOARD.stage.appendChild(carrier)
  // The copy is not a card of this paint: it must not answer the ties, or a
  // note would be drawn to the hand instead of to the conversation.
  if (BOARD.nodes.length && BOARD.nodes[BOARD.nodes.length - 1].parentNode === carrier) BOARD.nodes.pop()
  if (drag.origin) drag.origin.setAttribute('data-dragging', 'true')
  // The copy becomes the thing the hand holds, and the delta is measured
  // from here: the card must not jump by the distance it has already come.
  drag.node = carrier
  drag.baseX = at.x
  drag.baseY = at.y
  drag.fromX = x
  drag.fromY = y
}

/** Follow the pointer: pan the paper, or carry what the hand picked up. */
function onBoardMove(ev) {
  var drag = BOARD.drag
  if (!drag) return
  var x = Number(ev.clientX) || 0
  var y = Number(ev.clientY) || 0
  if (!drag.moved) {
    if (Math.abs(x - drag.fromX) < BOARD_SLOP && Math.abs(y - drag.fromY) < BOARD_SLOP) return
    drag.moved = true
    // From here the page must not start selecting text under the pointer, and
    // the click that would have followed this press is not a click any more.
    if (typeof ev.preventDefault === 'function') ev.preventDefault()
    BOARD.dragged = true
    if (drag.kind === 'session') beginSessionGrab(drag, x, y)
    else if (drag.kind === 'inboxNote') beginNoteLift(drag, x, y)
    else if (drag.kind === 'note' && drag.stacked) beginStackedCarrier(drag, x, y)
    else if (drag.node) drag.node.style.cursor = 'grabbing'
    if (drag.kind === 'note') {
      paintStackDrop(null)
      paintHeadDrop(null)
    }
    // A note being carried is the one moment a card offers a place to hand it
    // over: the bands go up here and come down in `endBoardDrag`.
    if (drag.kind === 'note' || drag.kind === 'inboxNote') {
      showDropZones(true, boardNoteDone(drag.key))
    }
    if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = 'grabbing'
  }
  drag.lastX = x
  drag.lastY = y
  if (drag.kind === 'session' && drag.mode === 'reorder') {
    // A sort is the panel's own business: while the hand is close to it, the
    // columns make room and nothing else on the canvas moves.
    var reorderState = BOARD.reorder
    var seat = reorderState && reorderState.panel && typeof reorderState.panel.getBoundingClientRect === 'function'
      ? reorderState.panel.getBoundingClientRect()
      : null
    if (seat && !panelHolds(seat, x, y)) {
      leaveSessionReorder(x, y)
    } else {
      paintSessionReorder(x, y)
      // A sort can be carried onto the finished strip, and the strip says
      // so under the hand even though the columns keep following it.
      markDoneDrop(doneBarUnder(x, y))
      return
    }
  }

  if (drag.kind === 'pan') {
    if (!BOARD.body) return
    BOARD.body.scrollLeft = Math.max(0, drag.scrollLeft - (x - drag.fromX))
    BOARD.body.scrollTop = Math.max(0, drag.scrollTop - (y - drag.fromY))
    return
  }
  // A pointer travels screen pixels; the stage is scaled. One pixel of the
  // hand is one over `zoom` pixels of paper.
  var zoom = BOARD.zoom || 1
  var dx = (x - drag.fromX) / zoom
  var dy = (y - drag.fromY) / zoom
  drag.x = Math.max(0, drag.baseX + dx)
  drag.y = Math.max(0, drag.baseY + dy)
  if (!drag.node) return
  // The carried element must not answer the hit test under its own pointer:
  // what the reader is aiming at is what is beneath it.
  drag.node.style.pointerEvents = 'none'
  drag.node.style.left = drag.x + 'px'
  drag.node.style.top = drag.y + 'px'
  drag.node.style.zIndex = '30'
  drag.node.style.transform = 'scale(1.012)'
  // The notes tied to this goal's conversations travel with it: a goal is a
  // place, and the annotations around it belong to that place.
  var carry = drag.carry || []
  for (var c = 0; c < carry.length; c++) {
    var held = carry[c]
    held.nx = Math.max(0, held.x + dx)
    held.ny = Math.max(0, held.y + dy)
    if (held.node) {
      held.node.style.left = held.nx + 'px'
      held.node.style.top = held.ny + 'px'
    }
  }
  if (drag.kind === 'note' && typeof document.elementFromPoint === 'function') {
    // While the hand is over a column, the column says it will take the
    // card: one ring around the pile, and nothing else moves.
    var hovered = null
    var headLit = null
    try {
      var beneath = document.elementFromPoint(x, y)
      if (beneath && typeof beneath.closest === 'function') {
        var pile = beneath.closest('[data-role="cardStack"]')
        var columnHit = pile || beneath.closest('[data-column]')
        if (columnHit) {
          hovered = pile
          if (!hovered) {
            var inner = columnHit.querySelector && columnHit.querySelector('[data-role="cardStack"]')
            hovered = inner || columnHit
          }
        }
        // The goal's heading takes the card too, and says so before the drop
        // decides it: it is where a conversation gets started.
        headLit = beneath.closest('[data-role="blockHead"]')
      }
    } catch (error) {
      hovered = null
      headLit = null
    }
    paintStackDrop(hovered)
    paintHeadDrop(headLit)
  }
  if (drag.kind === 'session') {
    // The finished strip is the one place inside a goal that means
    // something other than the goal: it takes the card as finished work,
    // and says so under the hand before the fingers let go.
    markDoneDrop(doneBarUnder(x, y))
    markDropGoal(x, y)
  }
  // Live, not after the drop: a tie that only catches up when the hand lets
  // go reads as a rubber band drawn by someone else.
  drawCardLinks()
}

/** Let go: write down what the gesture decided, unless it never moved. */
function onBoardUp() {
  var drag = BOARD.drag
  if (!drag) return
  var moved = drag.moved
  var kind = drag.kind
  var key = drag.key
  var x = drag.x
  var y = drag.y
  var fromStack = drag.fromStack || ''
  var reorderState = BOARD.reorder
  var stackedTarget = ''
  // Where it landed, read before the gesture is torn down: the carried
  // element is out of the hit test, so this is what is underneath it. A note
  // can land on two different things, and they mean different things: the way
  // in hands its words to that conversation, while the card around it only
  // ties the note to the work.
  var landedOn = ''
  var byEnter = false
  var newSessionGoal = ''
  if (moved && kind === 'note' && drag.lastX !== undefined
    && typeof document.elementFromPoint === 'function') {
    try {
      var under = document.elementFromPoint(drag.lastX, drag.lastY)
      if (under && typeof under.closest === 'function') {
        // The plus is a goal's door, and so is the row it stands in: a card
        // let go anywhere on the heading - the name included - starts the
        // same conversation the plus starts, with the card's own words.
        var newSession = under.closest('[data-role="goalNewSession"]')
        if (newSession) newSessionGoal = newSession.getAttribute('data-goal-key') || ''
        else newSessionGoal = goalHeadKeyUnder(under)
        byEnter = under.closest('[data-role="cardEnter"]') !== null
        var holder = under.closest('[data-session-id]')
        if (holder) landedOn = holder.getAttribute('data-session-id') || ''
        // A conversation's column is one target: the pile under the card,
        // or the card itself, both mean "file this thought under that
        // conversation". Where in the pile it lands is read from the height
        // the pointer let go at.
        var stackEl = under.closest('[data-role="cardStack"]')
        var columnEl = stackEl ? stackEl : under.closest('[data-column]')
        if (columnEl) {
          stackedTarget = stackEl
            ? stackEl.getAttribute('data-session') || ''
            : columnEl.getAttribute('data-column') || ''
        }
      }
    } catch (error) {
      landedOn = ''
      byEnter = false
      newSessionGoal = ''
    }
  }
  var overGoal = moved && drag.lastX !== undefined ? goalUnder(drag.lastX, drag.lastY) : ''
  endBoardDrag()
  // A settle made at a press owes the page a paint, and the end of the
  // gesture is where some of that debt may be paid: a pan's click answers
  // nothing (the paper is the one thing a paint never replaces), and a
  // press on a card the settle took away has no card left for its click
  // to open. Every other press leaves the debt to its own click, which
  // repaints when it opens what it aimed at.
  if (BOARD.paintOwed) {
    if (kind === 'pan') {
      renderBoard()
    } else if (!moved && kind === 'note') {
      var settleCards = BOARD_STORE.cards()
      var stillWritten = false
      for (var sc = 0; sc < settleCards.length; sc++) {
        if (settleCards[sc].id === key) { stillWritten = true; break }
      }
      if (!stillWritten) renderBoard()
    }
  }
  // A press that never moved is a click, and the click is still on its way:
  // the browser dispatches it to the element that was pressed, so repainting
  // here would replace that element and the click would land on nothing.
  if (!moved) return
  BOARD.dragged = true

  if (kind === 'pan') return
  if (kind === 'goal') {
    BOARD_STORE.placeBlock(key, x, y)
    renderBoard()
    return
  }
  if (kind === 'session') {
    var home = boardHomeOf(key)
    var wasDone = !!(home && home.done && home.done.some(function (row) {
      return row.id === key
    }))
    // The finished strip is a drop target of its own, and it outranks the
    // sort: a card let go on it is finished for the day, wherever it stood
    // a moment before. A card carried to another goal's strip is filed
    // there as well, so the strip never holds a conversation the goal no
    // longer carries.
    var doneTarget = drag.lastX === undefined ? null : doneBarUnder(drag.lastX, drag.lastY)
    if (doneTarget) {
      var barGoal = doneTarget.getAttribute('data-block') || ''
      if (barGoal) {
        if (!home || home.key !== barGoal) BOARD_STORE.placeSession(key, barGoal)
        sendToDone(key)
        showToast(paletteText('boardDoneMoved'))
        renderBoard()
        return
      }
    }
    // A card carried out of the strip is finished no longer, whether it was
    // let go on the work above, on another goal, or on the paper. This is
    // the other half of the mark: the reader can take the word back.
    if (wasDone) {
      bringBackFromDone(key)
      if (overGoal && home && overGoal !== home.key) {
        BOARD_STORE.placeSession(key, overGoal)
        showToast(paletteText('boardMoved'))
      } else {
        showToast(paletteText('boardDoneRestored'))
      }
      renderBoard()
      return
    }
    // A quiet line carried anywhere is a quiet line the reader has touched:
    // the strip's own rule asks for that touch, and the drag is it. The
    // wake is written before the move, so the card is a column in whichever
    // goal it lands in.
    if (drag.quiet) {
      BOARD_STORE.markSessionWoke(key)
      if (overGoal && home && overGoal !== home.key) {
        BOARD_STORE.placeSession(key, overGoal)
        showToast(paletteText('boardMoved'))
      }
      renderBoard()
      return
    }
    // A drag that never left its panel was a sort, not a move. A hand that
    // did leave is a move, and the order was never written while it was
    // inside: the columns have already gone back with the gesture.
    if (reorderState && reorderState.key) {
      var sortSeat = reorderState.panel && typeof reorderState.panel.getBoundingClientRect === 'function'
        ? reorderState.panel.getBoundingClientRect()
        : null
      if (!sortSeat || panelHolds(sortSeat,
        drag.lastX === undefined ? 0 : drag.lastX,
        drag.lastY === undefined ? 0 : drag.lastY)) {
        commitSessionReorder(reorderState)
        return
      }
    }
    // A conversation always belongs to a goal. Letting go over one files it
    // there; letting go on the paper gives it a goal of its own, cut from the
    // one it came from - a card standing alone is a goal with one card in it,
    // because a card with no goal is a place the canvas would have to invent.
    var target = overGoal
    if (!target) {
      // Except the last one. A goal that gives up its only conversation to
      // the paper has not moved anything: it has built a second goal of one
      // and emptied the first, which is the same arrangement with one more
      // panel on it. A conversation that wants a place of its own has to be
      // carried into another goal, where the move actually means something.
      if (home && home.rows.length <= 1) {
        showToast(paletteText('boardGoalLastCard'))
        renderBoard()
        return
      }
      var point = canvasPointOf(drag.lastX === undefined ? 0 : drag.lastX,
        drag.lastY === undefined ? 0 : drag.lastY)
      target = BOARD_STORE.addGoal(
        nextGoalName(home ? home.label : ''),
        Math.max(0, point.x - BOARD_FLOAT_W / 2),
        Math.max(0, point.y - 32)
      )
    }
    if (target && (!home || target !== home.key)) {
      BOARD_STORE.placeSession(key, target)
      showToast(paletteText('boardMoved'))
    }
    renderBoard()
    return
  }
  if (kind !== 'note') return
  // The plus's second gesture: a card let go on it starts the conversation
  // the card describes, with no sheet in between. The card is read before
  // the gesture is gone, because the board may be unmounted by the open.
  if (newSessionGoal) {
    var picked = null
    var written = BOARD_STORE.cards()
    for (var np = 0; np < written.length; np++) {
      if (written[np].id === key) picked = written[np]
    }
    var words = picked ? String(picked.text || '').trim() : ''
    if (!words) {
      renderBoard()
      return
    }
    var cardName = noteParts(words).title.trim()
    if (!cardName) cardName = words.slice(0, BOARD_GOAL_NAME_MAX)
    if (!startNewSessionForGoal(newSessionGoal, cardName, words, key) && BOARD.open) renderBoard()
    return
  }
  // Let go over the tray itself (not over a card in it): the note is put
  // away there, and drawn as a line of the tray from the next paint on.
  if (!landedOn && overGoal === BOARD_INBOX) {
    BOARD_STORE.fileCard(key, BOARD_INBOX)
    // A tray that is folded would swallow the card without a trace: the one
    // thing the reader must see is where it went.
    if (BOARD_STORE.isFolded(BOARD_INBOX)) BOARD_STORE.toggleBlockFold(BOARD_INBOX)
    renderBoard()
    showToast(paletteText('boardFiled'))
    return
  }
  // A thought let go into a conversation's column is filed there, at the
  // point in the pile the pointer chose. This is the whole of the tie now:
  // no line is drawn, because the card is drawn under the conversation.
  if (stackedTarget && !byEnter) {
    // The whole column is the target now: landing anywhere in it - the card,
    // the gap above the pile, the gap below it - files the thought under that
    // conversation, and the newest filing goes to the top of the pile.
    var sameFamily = stackedTarget === fromStack
    BOARD_STORE.linkCard(key, stackedTarget)
    renderBoard()
    if (!sameFamily) showToast(paletteText('boardCardFiledUnder'))
    return
  }
  if (landedOn) {
    var cards = BOARD_STORE.cards()
    var held = null
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === key) held = cards[i]
    }
    var text = held ? String(held.text || '').trim() : ''
    // A note that is already finished is not handed over again: the band it
    // was let go on says "file this card", and filing it is what happens - it
    // joins that conversation's own list of finished thoughts.
    if (byEnter && held && held.done) {
      BOARD_STORE.linkCard(key, landedOn)
      BOARD_STORE.fileCard(key, BOARD_DONE)
      BOARD.rowOpen = ''
      renderBoard()
      showToast(paletteText('boardDoneFiledOne'))
      return
    }
    if (byEnter) {
      // The button is the deliberate target: it means "take this into that
      // conversation", and it is specific enough not to need a question.
      // The place is measured before the conversation opens, because that
      // unmounts the board and there is nothing left to measure afterwards.
      if (text) {
        BOARD_STORE.linkCard(key, landedOn)
        handCardToSession(key, landedOn, text)
      } else {
        openSession(landedOn)
      }
      return
    }
    // Anywhere else on the card is the gentler claim: the thought belongs
    // under this conversation, so it joins the bottom of its pile - nothing
    // opens, and nothing is sent.
    BOARD_STORE.linkCard(key, landedOn)
    renderBoard()
    return
  }
  // Let go on the paper: a card out of a pile goes back to being a free card
  // where the hand let go; a free card simply moves.
  if (fromStack) BOARD_STORE.unlinkCard(key)
  BOARD_STORE.moveCard(key, Math.max(0, x), Math.max(0, y))
  renderBoard()
}



/**
 * Draw the elbow from every branch back to the conversation it was cut from.
 *
 * Ties between a thought and its conversation are no longer drawn: the
 * thought is drawn under the conversation, which is the sentence a curve
 * used to spell. What is left is lineage, and lineage has one shape on this
 * canvas - up from the parent's top edge to a rail above the row, along the
 * rail, and down onto the child's top edge. The order already seats a branch
 * beside its parent; the elbow is what makes that seating read as a fact
 * rather than a coincidence.
 *
 * Measured after the paint, because a card's place is the panel's own
 * layout, which this plugin does not own.
 * @returns {void}
 */
function drawCardLinks() {
  if (!BOARD.stage || typeof BOARD.stage.getBoundingClientRect !== 'function') return
  var svg = BOARD.linkLayer
  if (!svg || typeof document.createElementNS !== 'function') return
  while (svg.firstChild) svg.removeChild(svg.firstChild)
  var zoom = BOARD.zoom || 1
  var stageRect = BOARD.stage.getBoundingClientRect()
  var byId = Object.create(null)
  for (var n = 0; n < BOARD.nodes.length; n++) {
    byId[BOARD.nodes[n].getAttribute('data-session-id') || ''] = BOARD.nodes[n]
  }
  var blocks = BOARD.blocks || []
  for (var b = 0; b < blocks.length; b++) {
    var rows = blocks[b].rows || []
    for (var r = 0; r < rows.length; r++) {
      var child = byId[rows[r].id]
      var parentId = BOARD_STORE.lineageOf(rows[r].id)
      var parent = parentId ? byId[parentId] : null
      if (!child || !parent || child === parent) continue
      var a = parent.getBoundingClientRect()
      var c = child.getBoundingClientRect()
      if (!a || !c || (!a.width && !a.height) || (!c.width && !c.height)) continue
      var x1 = (a.left + a.width / 2 - stageRect.left) / zoom
      var y1 = (a.top - stageRect.top) / zoom
      var x2 = (c.left + c.width / 2 - stageRect.left) / zoom
      var y2 = (c.top - stageRect.top) / zoom
      if (Math.abs(x1 - x2) < 1) continue
      // One rail per pair, above both tops: two branches of one parent read
      // as two brackets rather than as a stair.
      var rail = Math.min(y1, y2) - 14
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M' + x1 + ' ' + y1 + 'V' + rail + 'H' + x2 + 'V' + y2)
      path.setAttribute('fill', 'none')
      path.style.stroke = 'var(--dshv-board-fork, rgba(79, 124, 255, 0.45))'
      path.setAttribute('stroke-width', '1.6')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      path.setAttribute('opacity', '0.55')
      path.setAttribute('data-role', 'forkLink')
      path.setAttribute('data-session-id', rows[r].id)
      svg.appendChild(path)
      for (var d = 0; d < 2; d++) {
        var bead = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        bead.setAttribute('cx', String(d ? x2 : x1))
        bead.setAttribute('cy', String(d ? y2 : y1))
        bead.setAttribute('r', '2.2')
        bead.style.fill = 'var(--dshv-board-fork, rgba(79, 124, 255, 0.45))'
        bead.setAttribute('opacity', '0.7')
        bead.setAttribute('data-role', 'forkLinkDot')
        svg.appendChild(bead)
      }
    }
  }
}

/** Drop the gesture and put back what it was carrying. */
function cancelBoardDrag() {
  if (!BOARD.drag) return false
  var moved = BOARD.drag.moved
  endBoardDrag()
  BOARD.dragged = false
  if (moved) renderBoard()
  return true
}

/** Take the gesture's furniture off the page and forget it. */
function endBoardDrag() {
  var drag = BOARD.drag
  if (!drag) return
  // A sort in flight leaves the columns where they were: the paint that
  // follows a committed order draws the new one from scratch.
  resetSessionReorder()
  window.removeEventListener('pointermove', onBoardMove, true)
  window.removeEventListener('pointerup', onBoardUp, true)
  window.removeEventListener('blur', onBoardBlurDrag)
  if (drag.node) {
    // The stacking number is not the gesture's: a card that was pressed is
    // the front card, and that is what the next paint reads. Only the lift is
    // undone here.
    drag.node.style.cursor = ''
    drag.node.style.pointerEvents = ''
    drag.node.style.transform = ''
  }
  if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = ''
  if (BOARD.dropOn) showDropZones(false)
  paintHeadDrop(null)
  // The carrier was a copy of the card, made for the gesture: it leaves with
  // the gesture. The card it copied is redrawn by the repaint that follows.
  if (drag.kind === 'session' && drag.node && drag.node.parentNode) {
    drag.node.parentNode.removeChild(drag.node)
  }
  if (BOARD.dropGoal) {
    BOARD.dropGoal.setAttribute('data-drop', 'false')
    BOARD.dropGoal = null
  }
  if (BOARD.doneDrop) {
    BOARD.doneDrop.setAttribute('data-drop', 'false')
    BOARD.doneDrop = null
  }
  dropNoDropTip()
  BOARD.drag = null
}

/**
 * The window losing focus mid-gesture: the pointer left with it.
 *
 * The up that would have ended the gesture is never coming, so the
 * gesture ends here instead - the board answers the next press, and the
 * paint a press-time settle owed is paid now that no click can be on its
 * way.
 * @returns {void}
 */
function onBoardBlurDrag() {
  if (!BOARD.drag) return
  endBoardDrag()
  if (BOARD.paintOwed && BOARD.open) renderBoard()
}

/**
 * A double click on the paper: write a card right there.
 *
 * This is the canvas gesture a canvas is for — pointing at an empty place is
 * how one says "put it here". A double click that arrived after a pan is
 * not one: the press moved the paper, it did not aim at a place.
 * @param {MouseEvent} ev - the double click.
 * @returns {void}
 */
function onBoardDoubleClick(ev) {
  if (!BOARD.open || !BOARD.stage) return
  if (BOARD.dragged) {
    BOARD.dragged = false
    return
  }
  var target = ev && ev.target
  if (target && target !== BOARD.stage && target !== BOARD.body) return
  var rect = typeof BOARD.stage.getBoundingClientRect === 'function'
    ? BOARD.stage.getBoundingClientRect()
    : null
  var zoom = BOARD.zoom || 1
  var x = rect ? ((Number(ev.clientX) || 0) - rect.left) / zoom : BOARD_CANVAS_EDGE
  var y = rect ? ((Number(ev.clientY) || 0) - rect.top) / zoom : BOARD_CANVAS_EDGE
  addBoardCardAt(Math.max(0, x), Math.max(0, y), {
    clientX: Number(ev.clientX) || 0,
    clientY: Number(ev.clientY) || 0,
  })
}




export { boardPointerDown, cancelBoardDrag, closeBoard, commitBoardNote, drawCardLinks, mountBoardInto, noteCardFinished, openBoard, openNote, pinToBoard, unmountBoard, watchForks }
