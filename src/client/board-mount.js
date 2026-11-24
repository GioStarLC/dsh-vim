/**
 * Mounting the board: the overlay card or the sidebar page, the feeds it
 * follows while it is up, and the teardown that lets go of them. What the
 * canvas draws is board-view's; what a press means is board-gestures'.
 */
import { BOARD } from './board-state.js'
import { boardPointerDown, endBoardDrag, onBoardDoubleClick, onBoardDragLeave, onBoardDragOver, onBoardDrop, onNativeDragEnd } from './board-gestures.js'
import { renderBoard, renderBoardOnStatus, startDayTimer, stopDayTimer, stopBoardClock, addBoardCard, commitGoalIntent, closeIdeaFocus } from './board-view.js'
import { addBoardGoal, watchForks } from './board-notes.js'
import { BOARD_HISTORY, BOARD_STORE } from './board-stores.js'
import { BOARD_UI, boardIcon } from './board-css.js'
import { tidyBoard } from './board-canvas.js'
import { boardShowOverview } from './board-hooks.js'
import { settings } from './preferences.js'
import { paletteText } from './strings.js'
import { taskServices } from './sessions.js'
import { BOARD_MIN_FONT, BOARD_ZOOM_MAX, BOARD_ZOOM_MIN, BOARD_ZOOM_STEP } from './constants.js'
import { fitBoardToWindow, onBoardResize, onBoardWheel, setBoardZoom } from './board-canvas.js'
import { BOARD_PAGE_UI, applyBoardPageInk } from './board-css.js'
import { closeBoardHistory, closeSeal } from './board-history.js'
import { closeNewSessionSheet } from './board-sheet.js'
import { clearFocusRequest } from './focus.js'
import { MODELPICK } from './model-picker.js'
import { watchRuns } from './runs.js'
import { state, stopAnim, stopHold } from './scroll.js'
import { serviceOf, taskCtx } from './sessions.js'
import { PALETTE } from './task-window.js'

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


export { closeBoard, mountBoardInto, openBoard, unmountBoard }
