/**
 * The paper's measurements and its arranging: where each goal stands, how
 * wide it is, how the canvas is zoomed and panned, where a new card can go,
 * and the tidy that packs it all. Repaint, tie lines and the idea sheet come
 * back through board-hooks so this module depends on no later one.
 */
import { CHAR_NEWLINE, BOARD_BLOCK_COLUMNS, BOARD_BLOCK_GAP_X, BOARD_BLOCK_GAP_Y, BOARD_BLOCK_H, BOARD_BLOCK_PAD, BOARD_BLOCK_PITCH_X, BOARD_BLOCK_PITCH_Y, BOARD_BLOCK_W, BOARD_BLOCK_HEAD_H, BOARD_CANVAS_EDGE, BOARD_CARD_CHROME_H, BOARD_CARD_LINE_H, BOARD_CARD_W, BOARD_COLUMN_GAP, BOARD_EDITOR_MAX_ROWS, BOARD_EDITOR_MIN_ROWS, BOARD_FIT_PAD, BOARD_INBOX, BOARD_MIN_FONT, BOARD_NOTE_BODY_ROWS, BOARD_SLOTS, BOARD_TIDY_COLUMNS, BOARD_TIDY_GAP, BOARD_TIDY_GLIDE, BOARD_TIDY_STEP, BOARD_ZOOM_FIT_MIN, BOARD_ZOOM_MAX, BOARD_ZOOM_MIN, BOARD_ROW_COLUMNS } from './constants.js'
import { BOARD, boardTitleOf } from './board-state.js'
import { BOARD_STORE, CARRY, HISTORY, NOTE_STORE } from './board-stores.js'
import { BOARD_INK, BOARD_UI, NOTE_PAPER } from './board-css.js'
import { settings } from './preferences.js'
import { paletteText } from './strings.js'
import { conversationPool, currentSession, folderById, folderIndex, statusIsLive, statusOf, taskServices } from './sessions.js'
import { dayOf, daysBetween, startOfToday } from './time.js'
import { showToast } from './toast.js'
import { reducedMotion } from './scroll.js'
import { attentionOf } from './runs.js'
import { boardCloseIdeaSheet, boardDrawLinks, boardNoteFinished, boardRepaint } from './board-hooks.js'

/**
 * The workspace a new conversation started from one goal would join.
 *
 * A workspace panel is its own answer. A goal the reader made is a label
 * over work that already lives somewhere, so the first conversation filed
 * here names the workspace it came from; a goal with nothing in it falls
 * back to the conversation on screen, then to the first workspace the host
 * still lists. The answer is only a starting point — the card is placed
 * under the goal the reader pressed, whichever workspace made it.
 * @param {object} block - the goal whose plus was pressed.
 * @returns {string} a workspace id, or '' when this host has none.
 */
function workspaceForGoal(block) {
  if (!block) return ''
  if (block.kind === 'workspace') return String(block.key || '')
  var folders = folderIndex()
  for (var i = 0; i < block.rows.length; i++) {
    var home = folders[block.rows[i].id]
    if (home && home.id) return home.id
  }
  var current = currentSession()
  if (current && folders[current.id] && folders[current.id].id) return folders[current.id].id
  var services = taskServices()
  var snapshot = null
  try {
    snapshot = services && services.workspaces ? services.workspaces.getSnapshot() : null
  } catch (error) {
    snapshot = null
  }
  var items = (snapshot && snapshot.items) || []
  for (var w = 0; w < items.length; w++) {
    if (items[w] && items[w].workspaceId) return String(items[w].workspaceId)
  }
  return ''
}

/**
 * One goal of the last paint, by the key a card is filed under.
 * @param {string} key - block id.
 * @returns {object|null} the block, or null.
 */
function boardBlockByKey(key) {
  for (var i = 0; i < BOARD.blocks.length; i++) {
    if (BOARD.blocks[i].key === key) return BOARD.blocks[i]
  }
  return null
}

/**
 * The canvas as it is drawn: one block per workspace in play, the
 * conversations under it, and an inbox for what no workspace accounts for.
 *
 * A workspace is in play when one of its conversations moved today or is
 * marked ★ — the mark is the one thing that keeps a conversation past the
 * day it last moved. The pool is asked rather than the workspace registry
 * for that: the registry carries no activity clock, so "today" is a fact
 * about the conversations, not about the workspace.
 *
 * The pool is the task window's own, so the two windows agree about what a
 * conversation is: no subagent children, no blank placeholders, no archived
 * ones.
 * @param {Array<object>} pool - the catalogue, newest first.
 * @returns {Array<object>} blocks in draw order: workspaces newest first, the inbox last.
 */
/**
 * One goal, by the id a card is filed under.
 *
 * The two kinds a placement can name are the kinds the canvas already has:
 * a workspace, and the inbox. Anything else is a record this build cannot
 * honour, and the card falls back to the goal its workspace implies.
 * @param {string} key - block id.
 * @returns {{key: string, label: string, path: string, kind: string}|null}
 */
function goalByKey(key) {
  if (!key) return null
  if (key === BOARD_INBOX) {
    return { key: key, label: paletteText('boardInbox'), path: '', kind: 'inbox' }
  }
  var known = folderById(key)
  if (known) return { key: key, label: known.label, path: known.path, kind: 'workspace' }
  // A goal the board made itself, for a card the reader pulled out onto the
  // paper: it has no workspace behind it, and its name is the whole of it.
  var named = BOARD_STORE.blockLabel(key)
  if (named || BOARD_STORE.blocks()[key]) {
    return { key: key, label: named || paletteText('boardNewGoal'), path: '', kind: 'user' }
  }
  return null
}

/**
 * The name a goal cut from a card starts with: the one it came from, plus
 * the first number that is not taken.
 *
 * Pulling a card out of a goal is asking for it to stand on its own, so the
 * goal it gets is named after the one it left - `dsh-vim 2`, `dsh-vim 3` -
 * which says where it came from without the reader having to name it.
 * @param {string} label - the goal the card came from.
 * @returns {string} a name that no goal on this board is using.
 */
function nextGoalName(label) {
  var base = String(label || '').trim() || paletteText('boardNewGoal')
  var names = BOARD_STORE.blockLabels()
  var used = 1
  for (var key in names) {
    if (!Object.prototype.hasOwnProperty.call(names, key)) continue
    var text = String(names[key] || '')
    if (text === base || text.indexOf(base + ' ') === 0) used = used + 1
  }
  return base + ' ' + (used + 1)
}

/**
 * Which goal one conversation is drawn in.
 *
 * The one the reader moved it to when there is one, else the one its
 * workspace implies, else the inbox. The board paints by this, and the
 * overview names goals by it, so the two never disagree about where a
 * conversation lives.
 * @param {object} row - the conversation.
 * @param {object} folders - conversation id -> workspace, from folderIndex.
 * @returns {{key: string, label: string, path: string, kind: string}} its goal.
 */
function goalOfRow(row, folders) {
  var movedTo = BOARD_STORE.placementOf(row.id)
  var goal = movedTo ? goalByKey(movedTo) : null
  if (goal) return goal
  var folder = folders ? folders[row.id] : null
  if (folder && folder.id) {
    return { key: folder.id, label: folder.label, path: folder.path, kind: 'workspace' }
  }
  return { key: BOARD_INBOX, label: paletteText('boardInbox'), path: '', kind: 'inbox' }
}

function boardBlocks(pool) {
  var since = startOfToday()
  // Read before anything is written: `noteCardFinished` below must compare
  // against what the document already holds, not against last paint's copy.
  BOARD.verdicts = BOARD_STORE.verdicts()
  var folders = folderIndex()
  var groups = Object.create(null)
  var blocks = []
  var inbox = null
  for (var i = 0; i < pool.length; i++) {
    var row = pool[i]
    // Deleted is deleted until it moves again: the mark is held against the
    // moment it was last touched, so a conversation that gets a new message
    // afterwards is back in play and belongs here again.
    if (BOARD_STORE.isMuted(row.id, row.updatedAt)) continue
    var marked = BOARD_STORE.isStarred(row.id)
    if (BOARD.onlyStarred && !marked) continue
    // A conversation the reader has not touched today is off the board -
    // unless it was carried in from the last page, which is the one thing
    // that outlives the day's boundary without being marked.
    if (!marked && !CARRY.from(row.id) && (Number(row.updatedAt) || 0) < since) continue
    var goal = goalOfRow(row, folders)
    var block = groups[goal.key]
    if (!block) {
      // The name the reader gave this goal, else the one it was cut from: a
      // panel starts out meaning "this workspace" and usually becomes
      // something the reader is working toward.
      block = groups[goal.key] = {
        key: goal.key,
        label: BOARD_STORE.blockLabel(goal.key) || goal.label,
        intent: BOARD_STORE.intentOf(goal.key) || '',
        path: goal.path,
        kind: goal.kind,
        rows: [],
      }
      // The inbox is drawn last, so it is not pushed here: the canvas reads
      // workspaces first and the place for everything else after them.
      if (goal.kind === 'inbox') inbox = block
      else blocks.push(block)
    }
    block.rows.push(row)
  }
  // Every goal is drawn in the order the reader knows it by. The new arrivals
  // are appended now, once, so the panel never re-sorts itself later: a
  // conversation that starts running keeps the place it already had.
  for (var b = 0; b < blocks.length; b++) {
    var rowsHere = blocks[b].rows
    if (!rowsHere.length) continue
    var idsHere = []
    for (var r = 0; r < rowsHere.length; r++) idsHere.push(rowsHere[r].id)
    var orderHere = BOARD_STORE.rememberOrder(blocks[b].key, idsHere)
    var rank = Object.create(null)
    for (var o = 0; o < orderHere.length; o++) rank[orderHere[o]] = o
    blocks[b].rows = rowsHere.slice().sort(function (left, right) {
      var a = rank[left.id] === undefined ? Number.MAX_SAFE_INTEGER : rank[left.id]
      var c = rank[right.id] === undefined ? Number.MAX_SAFE_INTEGER : rank[right.id]
      return a - c
    })
  }
  var places = BOARD_STORE.placements()
  var names = BOARD_STORE.blockLabels()
  var intents = BOARD_STORE.intents()
  var keep = []
  var movedId
  for (movedId in places) {
    if (!Object.prototype.hasOwnProperty.call(places, movedId)) continue
    keep.push(places[movedId])
  }
  // A goal stays for one of two reasons: a conversation was filed here, or
  // the reader said what it is for. A name is a label, not a reason - an
  // empty panel that was only renamed is a place with nothing happening in
  // it, and it does not get to hold a spot on the canvas.
  var stated
  for (stated in intents) {
    if (!Object.prototype.hasOwnProperty.call(intents, stated)) continue
    keep.push(stated)
  }
  // A goal the toolbar just stood is drawn too, though nothing holds it yet:
  // it is holding a decision, and a decision has until the board closes.
  var draft
  for (draft in BOARD.drafts) {
    if (!Object.prototype.hasOwnProperty.call(BOARD.drafts, draft)) continue
    keep.push(draft)
  }
  for (var k = 0; k < keep.length; k++) {
    var held = keep[k]
    if (!held || held === BOARD_INBOX || groups[held]) continue
    var known = goalByKey(held)
    if (!known) continue
    groups[held] = {
      key: held,
      label: names[held] || known.label,
      intent: intents[held] || '',
      path: known.path,
      kind: known.kind,
      rows: [],
    }
    blocks.push(groups[held])
  }
  if (!inbox) {        inbox = {
      key: BOARD_INBOX,
      label: BOARD_STORE.blockLabel(BOARD_INBOX) || paletteText('boardInbox'),
      intent: '',
      path: '',
      kind: 'inbox',
      rows: [],
    }
  }
  // The inbox is a place on the canvas even when it holds nothing, so the
  // reader always has somewhere to look for what a workspace did not claim.
  blocks.push(inbox)
  // Whatever the old arrangement still holds for a goal this paint no longer
  // draws is litter: the place it recorded, the name it used, the sentence
  // it said. A goal that is gone takes all three with it.
  var drawn = []
  for (var b = 0; b < blocks.length; b++) drawn.push(blocks[b].key)
  BOARD_STORE.pruneGoals(drawn)
  // The panel reads in two parts, and neither is a decision the reader makes:
  // `hot` is the conversations a panel is working in - one that moved today,
  // one that is mid-turn, one the reader marked - and `quiet` is what the day
  // merely carried in. The second part is drawn as a line each rather than a
  // column each, which is what keeps a goal holding a dozen conversations a
  // panel instead of a two-screen strip. Nothing is taken off the board: both
  // are slices of `rows`, and a quiet one is back in its column the moment it
  // moves, is marked, or starts a turn.
  var nowMs = Date.now()
  var today = dayOf(nowMs)
  var finished = BOARD_STORE.doneStamps()
  var woke = BOARD_STORE.wokeStamps()
  var verdicts = BOARD_STORE.verdicts()
  var backToWork = []
  var staleSettled = []
  for (var p = 0; p < blocks.length; p++) {
    var parts = blocks[p]
    parts.hot = []
    parts.quiet = []
    parts.done = []
    for (var s = 0; s < parts.rows.length; s++) {
      var qrow = parts.rows[s]
      // A conversation the reader put in the finished strip is drawn
      // there and nowhere else. The mark is theirs alone: a turn the
      // shell calls finished still stays in the columns until the hand
      // moves it, because where a card stands is not a clock's decision.
      var doneAt = Number(finished[qrow.id]) || 0
      // A finished word whose day is over is a word about nothing: the
      // strip reads only today, and the chip goes with it.
      var heldVerdict = verdicts[qrow.id]
      if (heldVerdict && heldVerdict.key === 'settled'
        && (!doneAt || dayOf(doneAt) !== today)) {
        staleSettled.push(qrow.id)
      }
      if (doneAt && dayOf(doneAt) === today) {
        var doneStatus = statusOf(qrow)
        // A conversation that came alive again - a new turn, or words
        // after the mark was written - has left the finish behind it:
        // it comes back up by itself. Only that direction is automatic;
        // nothing ever goes down without the hand.
        var movedAt = Number(qrow.updatedAt) || 0
        if (!statusIsLive(doneStatus) && movedAt <= doneAt) {
          parts.done.push(qrow)
          if (doneStatus && doneStatus.key === 'done') boardNoteFinished(qrow)
          continue
        }
        backToWork.push(qrow.id)
      }
      var wokeAt = Number(woke[qrow.id]) || 0
      var wasQuiet = !BOARD_STORE.isStarred(qrow.id)
        && !(wokeAt && dayOf(wokeAt) === today)
        && (Number(qrow.updatedAt) || 0) < since
        && !statusIsLive(statusOf(qrow))
      if (wasQuiet) parts.quiet.push(qrow)
      else parts.hot.push(qrow)
    }
    // A turn the shell calls finished and nobody has opened is written
    // down here, while the shell still says so: the card must be able to
    // answer "this ran" after the reader looks and the flag is gone.
    for (var w = 0; w < parts.hot.length; w++) {
      var hotStatus = statusOf(parts.hot[w])
      if (hotStatus && hotStatus.key === 'done') boardNoteFinished(parts.hot[w])
    }
  }
  if (backToWork.length) {
    BOARD_STORE.clearSessionsDone(backToWork)
    BOARD.verdicts = BOARD_STORE.verdicts()
  }
  if (staleSettled.length) {
    BOARD_STORE.dropSettled(staleSettled)
    BOARD.verdicts = BOARD_STORE.verdicts()
  }
  return blocks
}

/**
 * The places the blocks will be drawn at.
 *
 * A stored place wins; a block this build has never seen is packed into the
 * first free grid slot and written down, so a workspace that arrives while
 * the reader is working lands somewhere quiet and stays there next time.
 * @param {Array<object>} blocks - the blocks about to be drawn.
 * @param {object} [heights] - block key -> the height it last measured;
 *   the packing steps over what a standing panel really occupies.
 * @returns {object} block key -> `{x, y}`.
 */
function boardPlaces(blocks, heights, widths) {
  var stored = BOARD_STORE.blocks()
  var places = Object.create(null)
  var i
  for (i = 0; i < blocks.length; i++) {
    var known = stored[blocks[i].key]
    if (known) places[blocks[i].key] = { x: known.x, y: known.y }
  }
  for (i = 0; i < blocks.length; i++) {
    if (places[blocks[i].key]) continue
    var place = firstFreeSlot(places, heights, widths)
    BOARD_STORE.placeBlock(blocks[i].key, place.x, place.y)
    places[blocks[i].key] = place
  }
  return places
}

/**
 * The first place on the paper no block already stands on.
 *
 * Panels are no longer one width: a goal with four conversations is wide,
 * and a goal with one is not. The slot still steps by the grid's pitch, but
 * the step is tested against the width each standing panel really measured,
 * so a wide panel blocks the paper it covers and a quiet one does not take
 * room it never uses.
 * @param {object} places - block key -> `{x, y}`.
 * @param {object} [heights] - block key -> measured height.
 * @param {object} [widths] - block key -> measured width.
 * @returns {{x: number, y: number}} the place.
 */
function firstFreeSlot(places, heights, widths) {
  // The grid keeps its own rhythm - three columns, then the next row - so a
  // board does not grow one endless line as goals arrive. What changed is
  // the occupancy test: a wide goal now blocks the paper it really covers,
  // and the next slot steps over that instead of over a fixed 380.
  for (var cursor = 0; cursor < 400; cursor++) {
    var column = cursor % BOARD_BLOCK_COLUMNS
    var row = Math.floor(cursor / BOARD_BLOCK_COLUMNS)
    var x = BOARD_CANVAS_EDGE + column * BOARD_BLOCK_PITCH_X
    var y = BOARD_CANVAS_EDGE + row * BOARD_BLOCK_PITCH_Y
    if (!slotTaken(places, heights, widths, x, y)) return { x: x, y: y }
  }
  return { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
}

/**
 * Whether a block already stands on a place.
 *
 * A panel owns the paper down to its own measured bottom, not just to the
 * grid's height — a goal with a long list of conversations hangs past
 * the row it was given, and a block set down on the row below it would
 * land on its cards. The room a panel keeps is never smaller than the
 * grid's own height, so a panel that stands shorter than its row (a quiet
 * goal, or a folded one) still holds the whole of it, and the block that
 * fills in beneath cannot be covered by the panel growing back.
 * @param {object} places - block key -> `{x, y}`.
 * @param {object} [heights] - block key -> measured height; a height
 *   nobody knows is the grid's own.
 * @param {number} x - the place in question.
 * @param {number} y - the place in question.
 * @returns {boolean} whether some panel stands there.
 */
function slotTaken(places, heights, widths, x, y) {
  for (var key in places) {
    if (!Object.prototype.hasOwnProperty.call(places, key)) continue
    var place = places[key]
    var wide = widths && widths[key] ? Math.max(widths[key], BOARD_BLOCK_W) : BOARD_BLOCK_W
    if (x >= place.x + wide || place.x >= x + BOARD_BLOCK_W) continue
    var tall = heights && heights[key] ? Math.max(heights[key], BOARD_BLOCK_H) : BOARD_BLOCK_H
    if (y >= place.y + tall || place.y >= y + BOARD_BLOCK_H) continue
    return true
  }
  return false
}

/**
 * How tall each painted panel stands, keyed by the block it is.
 *
 * Read off the page, for the two moments that need it: a paint about to
 * be taken down tells the next paint how much paper its panels occupy,
 * and the decisions made while the board is up (a new goal, a fresh
 * card) step over what is really standing. A panel is as tall as its
 * conversations now, so the height it measured is the only honest word
 * on where its bottom is. A host that reports no boxes — and the first
 * paint of all, before anything is drawn — answers nothing, and the
 * height every panel is planned at stands in.
 * @returns {object} block key -> height in unzoomed pixels.
 */
function boardPanelHeights() {
  var out = Object.create(null)
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return out
  var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
  for (var i = 0; i < painted.length; i++) {
    var key = painted[i].getAttribute('data-block')
    var tall = Number(painted[i].offsetHeight) || 0
    if (key && tall > 0) out[key] = tall
  }
  return out
}

/**
 * How wide each painted panel stands, keyed by the block it is.
 *
 * The width a panel takes is now its own: one column per conversation. A
 * paint about to be taken down hands the next one what the panels really
 * measured, so the paper and the packing step over the rooms that exist
 * rather than the one every panel used to be planned at.
 * @returns {object} block key -> width in unzoomed pixels.
 */
function boardPanelWidths() {
  var out = Object.create(null)
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return out
  var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
  for (var i = 0; i < painted.length; i++) {
    var key = painted[i].getAttribute('data-block')
    var wide = Number(painted[i].offsetWidth) || 0
    if (key && wide > 0) out[key] = wide
  }
  return out
}

/**
 * How big the stage has to be to hold everything on it.
 *
 * Read off the stored places and the heights the panels measured, rather
 * than off the boxes as they are dragged: a drag moves a panel without a
 * repaint, and this size is only ever written by one. The heights are
 * what the panels themselves decided — a goal stands as tall as its
 * conversations — so the paper covers the bottom of the tallest of them,
 * and the reader's scrollbars describe the work that is actually there.
 * @param {object} places - block key -> `{x, y}`.
 * @param {object} [heights] - block key -> measured height; unknown
 *   heights fall back to the height every panel is planned at.
 * @returns {{width: number, height: number}} the stage, in pixels.
 */
function boardExtent(places, heights, widths) {
  var width = 720
  var height = 520
  for (var key in places) {
    if (!Object.prototype.hasOwnProperty.call(places, key)) continue
    var place = places[key]
    var wide = widths && widths[key] ? widths[key] : BOARD_BLOCK_W
    width = Math.max(width, place.x + wide + BOARD_CANVAS_EDGE)
    var tall = heights && heights[key] ? heights[key] : BOARD_BLOCK_H
    height = Math.max(height, place.y + tall + BOARD_CANVAS_EDGE)
  }
  var cards = BOARD_STORE.cards()
  for (var i = 0; i < cards.length; i++) {
    width = Math.max(width, cards[i].x + BOARD_CARD_W + BOARD_CANVAS_EDGE)
    height = Math.max(height, cards[i].y + boardCardBox(cards[i].text, cards[i].h).height + BOARD_CANVAS_EDGE)
  }
  return { width: width, height: height }
}

/**
 * Put the canvas's magnification on the paper.
 *
 * The stage is drawn at its true size and scaled; the paper around it is
 * sized to the magnified extent so the scrollbars describe what the eye
 * sees. Called on every repaint and on every zoom, and it touches nothing
 * but those three boxes and the readout.
 * @returns {void}
 */
function applyBoardZoom() {
  if (!BOARD.stage || !BOARD.sizer) return
  var extent = BOARD.extent
  var zoom = BOARD.zoom || 1
  BOARD.stage.style.width = extent.width + 'px'
  BOARD.stage.style.height = extent.height + 'px'
  BOARD.stage.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')'
  BOARD.sizer.style.width = Math.ceil(extent.width * zoom) + 'px'
  BOARD.sizer.style.height = Math.ceil(extent.height * zoom) + 'px'
  if (BOARD.zoomLabel) BOARD.zoomLabel.textContent = Math.round(zoom * 100) + '%'
}

/**
 * Zoom the canvas, keeping one point of it where it is on screen.
 *
 * The anchor is what makes a wheel zoom feel like the paper is being
 * pushed rather than the view being reset: the content point under the
 * pointer stays under the pointer.
 * @param {number} value - the wanted magnification.
 * @param {number} [anchorX] - screen x within the viewport; centre by default.
 * @param {number} [anchorY] - screen y within the viewport; centre by default.
 * @returns {boolean} whether the zoom changed.
 */
function setBoardZoom(value, anchorX, anchorY) {
  if (!BOARD.open || !BOARD.body) return false
  // A hand on the zoom is the reader taking the scale back from the window.
  BOARD.fits = false
  var next = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, Number(value) || 1))
  if (Math.abs(next - BOARD.zoom) < 0.001) return false
  var body = BOARD.body
  var ax = typeof anchorX === 'number' ? anchorX : (body.clientWidth || 0) / 2
  var ay = typeof anchorY === 'number' ? anchorY : (body.clientHeight || 0) / 2
  var contentX = (body.scrollLeft + ax) / BOARD.zoom
  var contentY = (body.scrollTop + ay) / BOARD.zoom
  BOARD.zoom = next
  BOARD_STORE.setZoom(next)
  applyBoardZoom()
  body.scrollLeft = Math.max(0, contentX * next - ax)
  body.scrollTop = Math.max(0, contentY * next - ay)
  return true
}

/**
 * Scale the canvas so the whole of it stands inside the window.
 *
 * The one press that answers "I cannot see all of this". The scale is the
 * smaller of the two ratios the window allows, so the wider side is the
 * one that decides - the same rule a map's "show everything" uses. A board
 * that already stands inside the window stays at 100%: growing the paper to
 * fill a huge window would change the type size for no gain, and a fit
 * that magnifies is not a fit. The paper is scrolled back to its corner
 * because everything is now on screen, and the request is remembered so a
 * resized window fits again (see `BOARD.fits`).
 * @returns {boolean} whether the board could be measured and fitted.
 */
function fitBoardToWindow() {
  if (!BOARD.open || !BOARD.body || !BOARD.extent) return false
  var body = BOARD.body
  var wide = Number(body.clientWidth) || 0
  var tall = Number(body.clientHeight) || 0
  var extent = BOARD.extent
  if (!wide || !tall || !extent.width || !extent.height) return false
  var roomWide = Math.max(1, wide - BOARD_FIT_PAD * 2)
  var roomTall = Math.max(1, tall - BOARD_FIT_PAD * 2)
  var fit = Math.min(roomWide / extent.width, roomTall / extent.height)
  var next = Math.max(BOARD_ZOOM_FIT_MIN, Math.min(1, fit))
  BOARD.fits = true
  if (Math.abs(next - BOARD.zoom) > 0.001) {
    BOARD.zoom = next
    BOARD_STORE.setZoom(next)
    applyBoardZoom()
  }
  body.scrollLeft = 0
  body.scrollTop = 0
  return true
}

/**
 * A window that changed size re-fits a canvas that was fitted to it.
 *
 * Only a board the reader asked to fit follows the window; one zoomed by
 * hand keeps the scale it was given, because that scale is the reader's
 * decision and not a fact about the window.
 * @returns {void}
 */
function onBoardResize() {
  if (!BOARD.open || !BOARD.fits) return
  fitBoardToWindow()
}

/**
 * Ctrl/Cmd + wheel zooms the canvas, the way every canvas does.
 * @param {WheelEvent} ev - the wheel.
 * @returns {void}
 */
function onBoardWheel(ev) {
  if (!ev || (!ev.ctrlKey && !ev.metaKey)) return
  if (typeof ev.preventDefault === 'function') ev.preventDefault()
  var rect = BOARD.body && typeof BOARD.body.getBoundingClientRect === 'function'
    ? BOARD.body.getBoundingClientRect()
    : { left: 0, top: 0 }
  var factor = Number(ev.deltaY) < 0 ? 1.1 : 1 / 1.1
  setBoardZoom(BOARD.zoom * factor, (Number(ev.clientX) || 0) - rect.left, (Number(ev.clientY) || 0) - rect.top)
}

/**
 * Where a new loose card goes when the reader did not point at a place.
 *
 * Below everything already on the canvas, at the left edge: a card written
 * from the heading is a thought the reader has not placed yet, so it must
 * not land on top of the work they are looking at. "Below everything" is
 * measured — a goal with a long list hangs past its grid row, and the
 * card belongs under its real bottom, not under the row the grid gave it.
 * @returns {{x: number, y: number}} the place.
 */
function nextCardPlace() {
  var bottom = 0
  var places = BOARD_STORE.blocks()
  var talls = boardPanelHeights()
  for (var key in places) {
    if (!Object.prototype.hasOwnProperty.call(places, key)) continue
    bottom = Math.max(bottom, places[key].y + (talls[key] ? Math.max(talls[key], BOARD_BLOCK_H) : BOARD_BLOCK_H))
  }
  var cards = BOARD_STORE.cards()
  for (var i = 0; i < cards.length; i++) {
    bottom = Math.max(bottom, cards[i].y + boardCardBox(cards[i].text, cards[i].h).height)
  }
  return {
    x: BOARD_CANVAS_EDGE,
    y: bottom ? bottom + BOARD_BLOCK_GAP_Y : BOARD_CANVAS_EDGE,
  }
}

/**
 * A place on the paper for a goal that was just asked for, near the eye.
 *
 * The middle of what is on screen is where the reader is looking, so that is
 * where a new goal wants to be. A place another panel already stands on is
 * stepped over rather than covered: a goal drawn on top of one is a goal
 * nobody can read, and the reader would have to move it before it was of any
 * use at all. Stepping goes by what the standing panels measure — a tall
 * one owns the paper down to its own bottom — and never by less than a
 * grid row, so the goal that lands beneath a short one still has the room
 * it was promised.
 * @returns {{x: number, y: number}} canvas coordinates.
 */
function boardFreePlace() {
  var body = BOARD.body
  var zoom = BOARD.zoom || 1
  var left = body ? Number(body.scrollLeft) || 0 : 0
  var top = body ? Number(body.scrollTop) || 0 : 0
  var wide = body && body.clientWidth ? body.clientWidth : BOARD_BLOCK_W
  var tall = body && body.clientHeight ? body.clientHeight : BOARD_BLOCK_H
  var x = Math.max(BOARD_CANVAS_EDGE, Math.round((left + wide / 2) / zoom - BOARD_BLOCK_W / 2))
  var y = Math.max(BOARD_CANVAS_EDGE, Math.round((top + tall / 2) / zoom - BOARD_BLOCK_H / 2))
  var taken = BOARD_STORE.blocks()
  var talls = boardPanelHeights()
  var wides = boardPanelWidths()
  for (var step = 0; step < 24; step++) {
    var clash = false
    for (var key in taken) {
      if (!Object.prototype.hasOwnProperty.call(taken, key)) continue
      var at = taken[key]
      if (!at) continue
      var spreads = wides[key] ? Math.max(wides[key], BOARD_BLOCK_W) : BOARD_BLOCK_W
      if (x >= at.x + spreads + BOARD_BLOCK_GAP_X - 8) continue
      if (at.x >= x + BOARD_BLOCK_W + BOARD_BLOCK_GAP_X - 8) continue
      var stands = talls[key] ? Math.max(talls[key], BOARD_BLOCK_H) : BOARD_BLOCK_H
      if (y >= at.y + stands + BOARD_BLOCK_GAP_Y - 8) continue
      if (at.y >= y + BOARD_BLOCK_H + BOARD_BLOCK_GAP_Y - 8) continue
      clash = true
      break
    }
    if (!clash) return { x: x, y: y }
    y = y + BOARD_BLOCK_PITCH_Y
  }
  return { x: x, y: y }
}

/**
 * The panels as a tidy sees them: a rectangle of paper, the conversations
 * it holds, and where each of those conversations was last drawn.
 *
 * Read once, before any card moves. A column laid out against a
 * conversation the repaint has not drawn yet would have to be laid out
 * twice, and the second layout is the one the reader would see jump.
 * @returns {Array<object>} one record per panel, in draw order.
 */
function tidyPanels() {
  var stored = BOARD_STORE.blocks()
  var stage = BOARD.stage
  var stageRect = stage && typeof stage.getBoundingClientRect === 'function'
    ? stage.getBoundingClientRect()
    : null
  var zoom = BOARD.zoom || 1
  var measured = Object.create(null)
  if (stageRect && typeof stage.querySelectorAll === 'function') {
    var panels = stage.querySelectorAll('[data-role="workspaceBlock"]')
    for (var p = 0; p < panels.length; p++) {
      var panelKey = panels[p].getAttribute('data-block')
      var panelRect = panels[p].getBoundingClientRect()
      if (!panelKey || !panelRect || !panelRect.height) continue
      measured[panelKey] = {
        height: panelRect.height / zoom,
        width: panelRect.width / zoom,
      }
    }
  }
  // Where each conversation stands, in paper coordinates. A host that
  // reports no boxes leaves this empty, and the column then starts at its
  // panel's heading instead - the same place, one measurement worse.
  var anchors = Object.create(null)
  if (stageRect) {
    for (var n = 0; n < BOARD.nodes.length; n++) {
      var node = BOARD.nodes[n]
      var sessionId = node.getAttribute('data-session-id')
      if (!sessionId) continue
      var rect = node.getBoundingClientRect()
      if (!rect || (!rect.width && !rect.height)) continue
      anchors[sessionId] = (rect.top - stageRect.top) / zoom
    }
  }
  var records = []
  for (var i = 0; i < BOARD.blocks.length; i++) {
    var block = BOARD.blocks[i]
    var place = stored[block.key] || { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
    var folded = BOARD_STORE.isFolded(block.key)
    var box = measured[block.key]
    var sessions = []
    for (var r = 0; r < block.rows.length; r++) sessions.push(block.rows[r].id)
    records.push({
      key: block.key,
      kind: block.kind,
      x: place.x,
      y: place.y,
      // A panel is as wide as its own columns, so a tidy keeps clear of the
      // width this goal really took rather than the width every goal used
      // to be planned at.
      width: box && box.width ? box.width : boardBlockWidth(block),
      height: box ? box.height : folded ? BOARD_BLOCK_HEAD_H : BOARD_BLOCK_H,
      folded: folded,
      sessions: sessions,
      anchors: anchors,
    })
  }
  return records
}

/**
 * Which panel a card belongs beside, if any.
 *
 * A card belongs to the conversation it was tied to, and to nothing else. A
 * tie whose conversation is not on this canvas today - folded away, taken
 * off, or filtered out - has nowhere to be pinned, and that card goes to
 * the inbox with the thoughts that were never tied at all.
 * @param {object} card - the loose card.
 * @param {Array<object>} panels - the panels, in draw order.
 * @returns {{panel: number, order: number, sessionId: string}|null} its home.
 */
function tidyHomeOf(card, panels) {
  if (!card || !card.link) return null
  for (var p = 0; p < panels.length; p++) {
    var sessions = panels[p].sessions
    for (var s = 0; s < sessions.length; s++) {
      if (sessions[s] !== card.link) continue
      return { panel: p, order: s, sessionId: card.link }
    }
  }
  return null
}

/**
 * The first x at or right of `x` that no panel already stands in.
 *
 * A column of cards may stand in front of the paper, never on top of a
 * panel: two panels one pitch apart leave 32px between them, which is not a
 * card wide. One pass per blocker, and the guard is what a hand-edited
 * document with every panel piled on one spot cannot turn into a loop.
 * @param {Array<object>} panels - the panels, in draw order.
 * @param {number} yTop - the column's first row.
 * @param {number} yBottom - the column's last row.
 * @param {number} x - where the column would rather stand.
 * @returns {number} where it can stand.
 */
function tidyColumnX(panels, yTop, yBottom, x) {
  var left = x
  for (var guard = 0; guard < 8; guard++) {
    var blocker = null
    for (var p = 0; p < panels.length; p++) {
      var panel = panels[p]
      if (left + BOARD_CARD_W <= panel.x + 1) continue
      if (left >= panel.x + panel.width - 1) continue
      if (yBottom <= panel.y + 1 || yTop >= panel.y + panel.height - 1) continue
      blocker = panel
    }
    if (!blocker) return left
    left = blocker.x + blocker.width + BOARD_TIDY_GAP
  }
  return left
}

/** The order cards stand in beside their panel: the panel's own order. */
function tidyBySession(left, right) {
  if (left.order !== right.order) return left.order - right.order
  return left.written - right.written
}

/** The order the inbox tray keeps: what is finished sinks to the bottom. */
function tidyByTray(left, right) {
  var leftDone = left.card.done ? 1 : 0
  var rightDone = right.card.done ? 1 : 0
  if (leftDone !== rightDone) return leftDone - rightDone
  return left.written - right.written
}

/**
 * Lay one group of cards out as a column beside its panel.
 *
 * The column starts level with the panel's heading and runs down it; a card
 * tied to a conversation starts level with that conversation instead, so a
 * thought stands beside the work it is about. When the column runs out of
 * panel it starts another one to the right, rather than growing past the
 * paper the panel sits on.
 * @param {object} bucket - one panel's cards, or the inbox tray.
 * @param {Array<object>} panels - every panel, for keeping clear of them.
 * @param {Array<object>} moves - the places found so far.
 * @returns {void}
 */
function tidyGroup(bucket, panels, moves) {
  var items = bucket.items
  if (!items.length) return
  items.sort(bucket.tray ? tidyByTray : tidyBySession)
  var panel = bucket.panel
  var top = panel ? panel.y + BOARD_BLOCK_HEAD_H : BOARD_CANVAS_EDGE
  var floor = panel && !bucket.tray ? panel.y + panel.height : Infinity
  var base = panel ? panel.x + panel.width + BOARD_TIDY_GAP : BOARD_CANVAS_EDGE
  var x = base
  if (bucket.tray) {
    // The tray is a queue, not a panel's column: it runs as long as it has
    // to, so only its whole run has to keep clear of what is beside it.
    var span = 0
    for (var t = 0; t < items.length; t++) {
      span += boardCardBox(items[t].card.text, items[t].card.h).height + BOARD_TIDY_STEP
    }
    x = tidyColumnX(panels, top, top + span, base)
  } else {
    x = tidyColumnX(panels, top, floor, base)
  }
  var column = 0
  var cursor = top
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    var height = boardCardBox(item.card.text, item.card.h).height
    var want = cursor
    var anchor = panel && item.sessionId && panel.anchors
      ? panel.anchors[item.sessionId]
      : null
    if (typeof anchor === 'number' && anchor > want) want = anchor
    if (floor !== Infinity && want + height > floor - BOARD_TIDY_STEP) {
      // This column is full unless the card is the first one in it: then it
      // is taller than the panel and the only honest place is its bottom.
      if (cursor > top) {
        column = column + 1
        x = tidyColumnX(panels, top, floor, base + column * (BOARD_CARD_W + BOARD_TIDY_STEP))
        cursor = top
        want = top
      }
      if (want + height > floor - BOARD_TIDY_STEP) want = Math.max(top, floor - height)
    }
    moves.push({ id: item.card.id, x: Math.round(x), y: Math.round(want) })
    cursor = want + height + BOARD_TIDY_STEP
  }
}

/**
 * Where the thoughts still on the paper stand, as a list of places.
 *
 * The whole of placing a loose card is here, and nothing here touches the
 * page: give it the cards and the panels, and it answers with where each
 * one goes. Panels are not moves - this is about the thoughts pinned around
 * the work, not about the work itself.
 *
 * A card tied to a conversation that this paint does not draw has nowhere
 * to be pinned, so it joins the tray's column; a card with no tie at all
 * never reaches here, because a tidy puts it away first (see `tidyBoard`).
 * @param {Array<object>} cards - the loose cards, in the order they were written.
 * @param {Array<object>} panels - the panels, in draw order.
 * @returns {Array<object>} one `{id, x, y}` per card.
 */
function tidyPlan(cards, panels) {
  var moves = []
  if (!cards || !cards.length || !panels || !panels.length) return moves
  var buckets = []
  var inbox = { panel: null, items: [], tray: true }
  var p
  for (p = 0; p < panels.length; p++) {
    buckets.push({ panel: panels[p], items: [], tray: false })
    if (panels[p].kind === 'inbox') inbox.panel = panels[p]
  }
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i]
    // A card already put away is not on the paper, so it is not something a
    // tidy has an opinion about.
    if (card.filed) continue
    var home = tidyHomeOf(card, panels)
    var bucket = home && buckets[home.panel] ? buckets[home.panel] : inbox
    bucket.items.push({
      card: card,
      sessionId: home ? home.sessionId : '',
      order: home ? home.order : i,
      written: i,
    })
  }
  for (var b = 0; b < buckets.length; b++) tidyGroup(buckets[b], panels, moves)
  tidyGroup(inbox, panels, moves)
  return moves
}

/**
 * The order a tidy packs panels in: left to right, top to bottom, tray last.
 *
 * A tidy that reshuffled the reader's goals would make the canvas a new
 * place to learn, so the order it packs by is the order the eye already
 * reads: the panel standing highest first, then the one to its right. The
 * inbox is the exception and always goes last: it is the tray everything
 * falls into, and it belongs at the end of the flow rather than in the
 * middle of the work.
 * @param {Array<object>} panels - the panel records.
 * @returns {Array<object>} the same panels, in packing order.
 */
function tidyPanelOrder(panels) {
  return (panels || []).slice().sort(function (left, right) {
    if (left.kind !== right.kind) {
      if (left.kind === 'inbox') return 1
      if (right.kind === 'inbox') return -1
    }
    if (left.y !== right.y) return left.y - right.y
    if (left.x !== right.x) return left.x - right.x
    return String(left.key) < String(right.key) ? -1 : 1
  })
}

/**
 * How wide one row of a tidy may be, in unzoomed pixels.
 *
 * The reader's own window decides, so the packed board reads as one screen
 * rather than as a fixed three-column grid that leaves half a wide monitor
 * empty and crowds a narrow one. A window that cannot be measured - a host
 * that reports no boxes, the first paint - falls back to the grid the board
 * was planned at, and no row is ever wider than four panel columns.
 * @returns {number} the room one row has.
 */
function tidyRowWidth() {
  var body = BOARD.body
  var zoom = BOARD.zoom || 1
  var wide = body ? (Number(body.clientWidth) || 0) / zoom : 0
  if (!(wide > 0)) {
    wide = BOARD_BLOCK_COLUMNS * BOARD_BLOCK_PITCH_X - BOARD_BLOCK_GAP_X + BOARD_CANVAS_EDGE * 2
  }
  var cap = BOARD_TIDY_COLUMNS * BOARD_BLOCK_PITCH_X - BOARD_BLOCK_GAP_X
  return Math.max(BOARD_BLOCK_W, Math.min(wide - BOARD_CANVAS_EDGE * 2, cap))
}

/**
 * Where every panel stands after a tidy.
 *
 * A shelf pack, not a fixed grid: each panel keeps the width it really
 * takes - a goal with three conversations is wide, a quiet one is not - and
 * a row wraps the moment the next one would not fit. Every row is level at
 * the top it is given and clears the tallest panel in the row above it by
 * one gap, so the canvas reads as a set of rows with air between them
 * rather than as one tall pile. The width of a row comes from the window
 * (see `tidyRowWidth`), which is what lets a wide screen hold four goals
 * beside each other and a narrow one hold just one.
 * @param {Array<object>} panels - the panel records.
 * @returns {object} block key -> `{x, y}`.
 */
function tidyPlaces(panels) {
  var order = tidyPanelOrder(panels)
  var edge = BOARD_CANVAS_EDGE
  var rowWidth = tidyRowWidth()
  var places = Object.create(null)
  var x = edge
  var y = edge
  var rowTall = 0
  for (var i = 0; i < order.length; i++) {
    var panel = order[i]
    var wide = Math.max(1, Number(panel.width) || BOARD_BLOCK_W)
    var tall = Math.max(1, Number(panel.height) || BOARD_BLOCK_H)
    // A panel wider than the row still gets a row of its own: wrapping it
    // onto the next line is what keeps it from pushing a neighbour off.
    if (x > edge && x + wide > edge + rowWidth) {
      x = edge
      y = y + rowTall + BOARD_BLOCK_GAP_Y
      rowTall = 0
    }
    places[panel.key] = { x: Math.round(x), y: Math.round(y) }
    x = x + wide + BOARD_BLOCK_GAP_X
    if (tall > rowTall) rowTall = tall
  }
  return places
}

/**
 * Tidy the canvas: put the thoughts where they belong, then lay the panels
 * out as an even grid that fits the window.
 *
 * A thought with nothing to belong to is what the inbox is for, so this is
 * the press that gathers them: every card with no tie is put away in the
 * tray, where the reader can still see it and take it back out. That is
 * done before anything is measured, and painted at once, because the tray
 * grows by one line per card and its new height is part of the layout.
 *
 * The panels come next, packed as rows with the same air between them (see
 * `tidyPlaces`). A panel that moves glides there, and the loose cards are
 * placed once the panels have settled, so a thought tied to a conversation
 * that is not on the canvas still stands clear of the new rows.
 * @returns {boolean} whether anything was moved.
 */
function tidyBoard() {
  if (!BOARD.open || !BOARD.stage) return false
  if (BOARD.drag || BOARD.tidy || BOARD.glide) return false
  // A sheet open on the paper is a thought being written: it lands here
  // first, so a tidy gathers it with everything else instead of leaving it
  // floating over a canvas that has just moved.
  if (BOARD.ideaFocusHost) boardCloseIdeaSheet()
  // A card being typed into is about to move: what it says is folded in
  // first, so the place it lands is the place its words ask for.
  if (BOARD.cardEditing && BOARD.cardEditor) {
    BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
    BOARD.cardEditing = ''
    BOARD.cardEditor = null
  }
  var cards = BOARD_STORE.cards()
  var filed = 0
  for (var c = 0; c < cards.length; c++) {
    var card = cards[c]
    // A tie is what keeps a thought on the paper; a card put away already
    // has a place, and one with no tie has none.
    if (card.filed || card.link) continue
    if (BOARD_STORE.fileCard(card.id, BOARD_INBOX)) filed = filed + 1
  }
  if (filed) {
    // The tray's new lines are laid out by this paint, and its height is
    // what the packing below measures: one paint before, one after.
    // A tray folded away must not swallow what a tidy just gathered: the
    // reader has to see where the thoughts went.
    if (BOARD_STORE.isFolded(BOARD_INBOX)) BOARD_STORE.toggleBlockFold(BOARD_INBOX)
    boardRepaint()
    if (!BOARD.open) return true
    showToast(paletteText('boardFiled'))
  }
  var panels = tidyPanels()
  var places = tidyPlaces(panels)
  var batch = []
  if (typeof BOARD.stage.querySelectorAll === 'function') {
    var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
    var nodes = Object.create(null)
    for (var p = 0; p < painted.length; p++) {
      var key = painted[p].getAttribute('data-block')
      if (key) nodes[key] = painted[p]
    }
    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i]
      var place = places[panel.key]
      if (!place) continue
      var node = nodes[panel.key]
      if (!node) continue
      var fromX = Number(parseFloat(node.style.left)) || 0
      var fromY = Number(parseFloat(node.style.top)) || 0
      if (Math.abs(fromX - place.x) < 1 && Math.abs(fromY - place.y) < 1) continue
      batch.push({
        key: panel.key,
        node: node,
        fromX: fromX,
        fromY: fromY,
        toX: place.x,
        toY: place.y,
      })
    }
  }
  if (batch.length) {
    glideTidyPanels(batch)
    return true
  }
  tidyLooseCards()
  if (BOARD.fits) fitBoardToWindow()
  return filed > 0
}

/**
 * Put the thoughts that are still on the paper clear of the panels.
 *
 * After a tidy files the untied ones away, the only cards left on the paper
 * are thoughts tied to a conversation this paint cannot draw - folded away,
 * taken off, or left on an older page. They belong beside the tray, as one
 * column each, which is the same place the reader would drop them.
 * @returns {boolean} whether anything was moved.
 */
function tidyLooseCards() {
  var cards = BOARD_STORE.cards()
  var loose = []
  for (var i = 0; i < cards.length; i++) {
    // A card drawn under its conversation is not on the paper, so a tidy
    // has no place to give it.
    if (cards[i].filed || boardCardStacked(cards[i])) continue
    loose.push(cards[i])
  }
  if (!loose.length) return false
  var moves = tidyPlan(loose, tidyPanels())
  var batch = []
  for (var m = 0; m < moves.length; m++) {
    var node = BOARD.looseNodes[moves[m].id]
    if (!node) continue
    var fromX = Number(parseFloat(node.style.left)) || 0
    var fromY = Number(parseFloat(node.style.top)) || 0
    if (Math.abs(fromX - moves[m].x) < 1 && Math.abs(fromY - moves[m].y) < 1) continue
    batch.push({
      id: moves[m].id,
      node: node,
      fromX: fromX,
      fromY: fromY,
      toX: moves[m].x,
      toY: moves[m].y,
    })
  }
  if (!batch.length) return false
  if (typeof window.requestAnimationFrame !== 'function' || reducedMotion()) {
    for (var j = 0; j < batch.length; j++) {
      BOARD_STORE.moveCard(batch[j].id, batch[j].toX, batch[j].toY)
    }
    boardRepaint()
    return true
  }
  glideTidyBatch(batch)
  return true
}

/**
 * Slide one tidy's panels to their new places, then put the cards around
 * them.
 *
 * The place is written only once the panel has arrived: a tidy the reader
 * cancels by leaving the board costs nothing. The panels move together
 * rather than a beat apart - they are one layout, and watching them arrive
 * one by one would read as a list being sorted rather than a canvas being
 * squared up. The loose cards wait for the settle, because where they may
 * stand is a fact about where the panels ended.
 * @param {Array<object>} batch - the panels that move, with both places.
 * @returns {void}
 */
function glideTidyPanels(batch) {
  BOARD.tidy = true
  var started = 0
  function settle() {
    BOARD.tidy = false
    for (var s = 0; s < batch.length; s++) {
      BOARD_STORE.placeBlock(batch[s].key, batch[s].toX, batch[s].toY)
    }
    boardRepaint()
    // A canvas the reader fitted to the window keeps that promise after a
    // tidy moved everything: the new rows are measured, then fitted.
    if (BOARD.fits) fitBoardToWindow()
    if (BOARD.open) tidyLooseCards()
  }
  if (typeof window.requestAnimationFrame !== 'function' || reducedMotion()) {
    settle()
    return
  }
  function step(now) {
    if (!BOARD.open || !BOARD.stage) {
      BOARD.tidy = false
      return
    }
    if (!started) started = now
    var at = (now - started) / BOARD_TIDY_GLIDE
    if (at > 1) at = 1
    var eased = 1 - Math.pow(1 - at, 3)
    for (var k = 0; k < batch.length; k++) {
      var item = batch[k]
      if (!item.node.style) continue
      item.node.style.left = (item.fromX + (item.toX - item.fromX) * eased) + 'px'
      item.node.style.top = (item.fromY + (item.toY - item.fromY) * eased) + 'px'
    }
    boardDrawLinks()
    if (at < 1) {
      window.requestAnimationFrame(step)
      return
    }
    settle()
  }
  window.requestAnimationFrame(step)
}

/**
 * Fly one tidy's cards to their places, a beat apart.
 *
 * A jump would read as the cards being taken away and different cards
 * appearing; a short ease reads as the canvas putting them away. The cards
 * leave in the order they were written, which is the order the eye followed
 * them in, and the lines are redrawn every frame so a tie stays attached on
 * the way.
 * @param {Array<object>} batch - the cards that move, with both places.
 * @returns {void}
 */
function glideTidyBatch(batch) {
  BOARD.tidy = true
  var stagger = Math.min(24, Math.round(240 / batch.length))
  var total = BOARD_TIDY_GLIDE + stagger * (batch.length - 1)
  var started = 0
  for (var i = 0; i < batch.length; i++) {
    batch[i].delay = i * stagger
    var style = batch[i].node.style
    if (!style) continue
    // Airborne: above the paper it crosses, and not something the pointer
    // can pick up on the way.
    style.zIndex = String(BOARD.zTop + 20)
    style.pointerEvents = 'none'
    style.transform = 'scale(1.015)'
  }
  function settle() {
    BOARD.tidy = false
    for (var s = 0; s < batch.length; s++) {
      BOARD_STORE.moveCard(batch[s].id, batch[s].toX, batch[s].toY)
    }
    boardRepaint()
  }
  function step(now) {
    if (!BOARD.open || !BOARD.stage) {
      BOARD.tidy = false
      return
    }
    if (!started) started = now
    var elapsed = now - started
    for (var k = 0; k < batch.length; k++) {
      var item = batch[k]
      if (!item.node.style) continue
      var at = (elapsed - item.delay) / BOARD_TIDY_GLIDE
      if (at <= 0) continue
      if (at > 1) at = 1
      var eased = 1 - Math.pow(1 - at, 3)
      item.node.style.left = (item.fromX + (item.toX - item.fromX) * eased) + 'px'
      item.node.style.top = (item.fromY + (item.toY - item.fromY) * eased) + 'px'
    }
    boardDrawLinks()
    if (elapsed < total) {
      window.requestAnimationFrame(step)
      return
    }
    settle()
  }
  window.requestAnimationFrame(step)
}

/**
 * One workspace on the canvas: a heading that can be dragged, and the
 * conversations underneath it.
 *
 * The heading is the handle rather than the whole block, because the cards
 * inside are read and clicked: a panel that moved whenever a card was
 * slightly pressed would be a panel you cannot use.
 * @param {object} block - one of `boardBlocks`.
 * @param {{x: number, y: number}} place - where it sits on the stage.
 * @param {object} titles - session id -> the name to call it by.
 * @returns {Element} the block.
 */
function slotHue(slot) {
  return (Math.abs(Math.round(Number(slot) || 0)) % BOARD_SLOTS) * (360 / BOARD_SLOTS) + 6
}

/**
 * Which seat a block starts on: its own id, never its name.
 *
 * A colour that follows the name is a colour that changes the moment the
 * panel is renamed, which reads as a different place. The id is the one thing
 * about a goal that never moves.
 * @param {string} key - the block id.
 * @returns {number} a seat on the wheel.
 */
function slotSeed(key) {
  var text = String(key || '')
  var hash = 0
  for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360
  return hash % BOARD_SLOTS
}

/**
 * Give every panel on this paint its own slice of the wheel.
 *
 * Two goals that start on the same seat are told apart by moving the later
 * one to the first free seat after it: the wheel has twelve, a canvas rarely
 * holds a dozen goals, and "the two blue-ish dots" is exactly the confusion
 * this is for. The inbox is not a goal and takes no seat.
 * @param {Array<object>} blocks - the panels, in draw order.
 * @returns {object} block id -> seat.
 */
function boardSlots(blocks) {
  var stored = BOARD_STORE.seats()
  var taken = Object.create(null)
  var out = Object.create(null)
  var fresh = null
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === 'inbox') continue
    var key = blocks[i].key
    var kept = stored[key]
    if (kept !== undefined && kept !== null) {
      // The seat is already the place's, whether or not a neighbour wears
      // it too: this is the colour the reader knows the goal by.
      out[key] = kept
      if (!taken[kept]) taken[kept] = true
      continue
    }
    var seat = slotSeed(key)
    for (var guard = 0; guard < BOARD_SLOTS; guard++) {
      if (!taken[seat]) break
      seat = (seat + 1) % BOARD_SLOTS
    }
    taken[seat] = true
    out[key] = seat
    // A place drawn for the first time is given its colour now and keeps it
    // for good: the alternative is a goal that changes colour whenever a
    // neighbour arrives or leaves, which is what a seven-pixel dot could get
    // away with and a painted panel cannot.
    if (fresh === null) fresh = Object.create(null)
    fresh[key] = seat
  }
  if (fresh !== null) BOARD_STORE.setSeats(fresh)
  return out
}

/** The seat one block wears: the one written down, else the one this paint gave it. */
function blockSeat(block) {
  if (!block) return 0
  // Read once per paint rather than once per question: every card, note and
  // mark on the canvas asks for a hue, and each answer must agree with the
  // others even if another window writes in the middle of a paint.
  var stored = (BOARD.seats || BOARD_STORE.seats())[block.key]
  if (stored !== undefined) return stored
  var seat = BOARD.slots[block.key]
  return seat === undefined ? slotSeed(block.key) : seat
}

/**
 * The hue one place is washed with, or null for the tray.
 *
 * The tray is where work has no home, so it has no colour of its own: a
 * conversation standing in it wears the board's own material. A card that
 * was given a hue would be claiming a place to stand in.
 * @param {object|null} block - the panel.
 * @returns {number|null} the hue in degrees, or null.
 */
function goalHue(block) {
  if (!block || block.kind === 'inbox') return null
  return slotHue(blockSeat(block))
}

/** The colour one panel's own mark wears. */
function blockInk(block) {
  if (!block || block.kind === 'inbox') return BOARD_INK.dim
  return 'hsl(' + slotHue(blockSeat(block)) + ' 46% 56%)'
}

/**
 * The paper one note is written on.
 *
 * Opaque, on purpose: cards overlap the moment one is pulled out of its goal,
 * and a see-through card makes a pile unreadable - the one underneath reads
 * through the one on top, so neither is a card any more. The hue is the panel
 * the note belongs to; a note tied to nothing, or to the inbox, keeps the
 * amber it always had, because it belongs to the reader and not to a place.
 * @param {object|null} block - the panel the note's conversation stands in.
 * @returns {object} the paper's own three declarations.
 */
/** The hue a note is written on: its goal's, or the amber of belonging to nobody. */
function noteHue(block) {
  return block && block.kind !== 'inbox' ? slotHue(blockSeat(block)) : 45
}

function notePaper(block) {
  if (!block || block.kind === 'inbox') return NOTE_PAPER
  var hue = noteHue(block)
  // Two steps lighter than the paper the board used to cut for a note, and
  // a spine a third of the weight: a thought is written on this canvas, not
  // shouted from it. The hue still says whose paper it is, because that is
  // the one thing a slip lying beside a panel has to answer.
  return {
    background: 'hsl(' + hue + ' 30% 94%)',
    border: '1px solid hsl(' + hue + ' 22% 84%)',
    borderLeft: '2px solid hsl(' + hue + ' 40% 62% / 0.55)',
    boxShadow: '0 16px 30px -22px rgba(8, 12, 20, 0.6), 0 1px 2px rgba(8, 12, 20, 0.2)',
    color: 'hsl(' + hue + ' 28% 20%)',
  }
}

/**
 * The ink one note is drawn in.
 *
 * Light paper takes dark ink, and it takes it in the same hue: the words, the
 * marks beside them and the spine are one colour family, so a card reads as
 * one object rather than as a pastel box with a few default marks on it, and
 * a finished card drops the hue for the neutral it has stopped earning.
 * @param {object|null} block - the panel the note's conversation stands in.
 * @param {boolean} done - whether the note is finished.
 * @returns {{text: string, dim: string, edge: string}} the three inks.
 */
function noteInkOf(block, done) {
  if (done) {
    return {
      text: BOARD_INK.noteDoneInk,
      dim: 'hsl(45 10% 46%)',
      edge: 'hsl(45 10% 72%)',
    }
  }
  var hue = noteHue(block)
  return {
    text: 'hsl(' + hue + ' 28% 20%)',
    dim: 'hsl(' + hue + ' 20% 42%)',
    edge: 'hsl(' + hue + ' 26% 66%)',
  }
}

/**
 * How many rows an idea card's field needs for what it holds.
 *
 * Not a measurement: the field is sized in the same repaint that puts it
 * on the page, and a mount without `field-sizing` would otherwise open a
 * five-line hole for three words. A CJK character counts double, which is
 * close enough at this width to keep the estimate off a whole line.
 * @param {string} text - what the card says.
 * @returns {number} a row count inside the allowed range.
 */
/**
 * How many half-widths one line of a note holds.
 *
 * Measured from the card's own edges and its own type rather than kept as a
 * guess: a line is the paper's inner width over half a character's advance,
 * because a CJK character is two half-widths and an average latin one is
 * about one. Under-counting is what leaves a strip of empty paper at the
 * foot of every note - the card is the right size for a line it never had.
 * @returns {number} half-widths to a line.
 */
function boardNoteCols() {
  var metrics = boardNoteMetrics()
  var inner = BOARD_CARD_W - 26
  return Math.max(12, Math.floor(inner / (metrics.font * 0.5)))
}

function boardTextRows(text, least, most) {
  var value = String(text === undefined || text === null ? '' : text)
  var lines = value.split('\n')
  var rows = 0
  for (var i = 0; i < lines.length; i++) {
    var wide = 0
    for (var c = 0; c < lines[i].length; c++) {
      wide += lines[i].charCodeAt(c) > 0x2e80 ? 2 : 1
    }
    rows += Math.max(1, Math.ceil(wide / boardNoteCols()))
  }
  var low = typeof least === 'number' ? least : BOARD_EDITOR_MIN_ROWS
  var high = typeof most === 'number' ? most : BOARD_EDITOR_MAX_ROWS
  return Math.min(high, Math.max(low, rows))
}

/**
 * The lines a card's field opens on.
 *
 * A field is never one line tall, even when the card says one thing: a
 * thought is usually a sentence more before it is done, and a field that
 * starts as a slot is a field the reader has to grow before using.
 * @param {string} text - what the card says.
 * @returns {number} the rows the field needs.
 */
function boardEditorRows(text) {
  return boardTextRows(text, BOARD_EDITOR_MIN_ROWS, BOARD_EDITOR_MAX_ROWS)
}

/**
 * How much paper one idea card takes.
 *
 * One function for the whole of it: what a card is drawn as, where a tidy
 * puts it, and how big the canvas has to be all read this, so a card is
 * never planned one size and painted another. The width is the card's and
 * never moves; the height is the lines it holds, between a strip of one
 * and the most it shows - four folded, ten opened.
 * @param {string} text - what the card says.
 * @param {number} [least] - the fewest lines to plan for.
 * @param {number} [most] - the most lines to plan for.
 * @returns {{width: number, height: number, lines: number}} the paper.
 */
/**
 * The ruler a note card is drawn with: one line box, and the paper around it.
 *
 * A card's box is planned before it is painted - the canvas extent, the tidy
 * and the next free place all read it - so the plan and the paint have to
 * share one ruler. They share this one: both numbers in pixels, scaled from
 * the board's own base font, and handed to the field and to the words as
 * well, so nothing inside a card can be measured in a different unit than
 * the card itself.
 * @returns {{line: number, chrome: number, font: number}} pixels.
 */
function boardNoteMetrics() {
  var base = Math.max(settings.paletteFont, BOARD_MIN_FONT)
  var scale = base / BOARD_MIN_FONT
  var line = Math.round(BOARD_CARD_LINE_H * scale)
  return {
    line: line,
    chrome: Math.round(BOARD_CARD_CHROME_H * scale),
    // A line box is 1.65 times its type, the ratio the words and the field
    // are both set in.
    font: Math.round((line / 1.65) * 100) / 100,
  }
}

/**
 * How much paper one idea card takes: its heading, and the lines it holds.
 *
 * One shape for every state. A card is the same paper with its field up as
 * it is at rest - a press must never change the size of the thing pressed -
 * and past the last line a card holds it clips rather than scrolls, because
 * a window inside a piece of paper is not paper.
 * The shape is the reader's, not the text's: a card opens at one line and
 * keeps whatever height it was dragged to, so the fade is the only thing
 * that changes when the words run on. What the text needs is still measured,
 * which is what tells the card it has more to say than it is showing.
 * @param {string} text - what the card says.
 * @param {number} [rows] - the height it was dragged to, or 0 for the default.
 * @returns {{width: number, height: number, lines: number}} the paper.
 */
/**
 * A note, cut where its title ends: the first line is the heading and the
 * rest is what the card shows of itself.
 * @param {string} text - what the card says.
 * @returns {{title: string, body: string, rows: number}} the parts.
 */
function noteParts(text) {
  var value = String(text === undefined || text === null ? '' : text)
  // Spelled as a code point rather than an escape: the split is the whole
  // meaning of this function, and it must not depend on how a tool wrote it.
  var cut = value.indexOf(CHAR_NEWLINE)
  var title = cut < 0 ? value : value.slice(0, cut)
  var body = cut < 0 ? '' : value.slice(cut + 1)
  return { title: title, body: body, rows: boardTextRows(body, 0, 999) }
}

/**
 * How much paper one idea card takes at rest.
 *
 * The title lives in the heading, so the paper is spent on the body: two
 * lines of it, and none when the card is only a title. `rows` is a height a
 * former build let the reader drag; it still wins when a stored card has one.
 * @param {string} text - what the card says.
 * @param {number} [rows] - a chosen number of body lines.
 * @returns {{width: number, height: number, lines: number}} the paper.
 */
function boardCardBox(text, rows) {
  var parts = noteParts(text)
  var chosen = Math.round(Number(rows) || 0)
  // A note that is only a title is only a heading: an empty line kept for a
  // body it does not have is the wasted row this card was complaining about.
  var body = parts.body ? parts.rows : 0
  var lines = chosen > 0
    ? Math.min(chosen, BOARD_EDITOR_MAX_ROWS)
    : Math.min(body, BOARD_NOTE_BODY_ROWS)
  var metrics = boardNoteMetrics()
  return {
    width: BOARD_CARD_W,
    height: metrics.chrome + lines * metrics.line,
    lines: lines,
  }
}

/**
 * The paper a note takes while its field is up: all of its body, up to the cap.
 *
 * Opening a card is asking to read it, so the paper grows to hold the whole
 * of what was written - that is what a press now means, in place of the corner
 * that used to have to be dragged.
 * @param {string} text - what the card says.
 * @returns {{width: number, height: number, lines: number}} the paper.
 */
function boardCardOpenBox(text) {
  // The field holds the body only - the title has its own row in the heading -
  // so the paper plans for the body, and the field is exactly as tall as it.
  var parts = noteParts(text)
  var lines = Math.max(1, parts.rows)
  var metrics = boardNoteMetrics()
  return {
    width: BOARD_CARD_W,
    height: metrics.chrome + lines * metrics.line,
    lines: lines,
  }
}

/**
 * Where a point on the screen falls on the paper.
 *
 * The canvas is a scroller and the stage inside it is scaled, so a pointer
 * has to lose both before it can name a place a card can be stored at.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {{x: number, y: number}} unzoomed canvas coordinates.
 */
function canvasPointOf(x, y) {
  var body = BOARD.body
  var rect = body && typeof body.getBoundingClientRect === 'function' ? body.getBoundingClientRect() : null
  var zoom = BOARD.zoom || 1
  if (!rect || (!rect.width && !rect.height)) return { x: Math.max(0, x), y: Math.max(0, y) }
  return {
    x: Math.max(0, (x - rect.left + (Number(body.scrollLeft) || 0)) / zoom),
    y: Math.max(0, (y - rect.top + (Number(body.scrollTop) || 0)) / zoom),
  }
}

/**
 * The goal one conversation is drawn in on this paint, or null.
 * @param {string} id - session id.
 * @returns {object|null} the block holding it.
 */
function boardHomeOf(id) {
  for (var i = 0; i < BOARD.blocks.length; i++) {
    var rows = BOARD.blocks[i].rows
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].id === id) return BOARD.blocks[i]
    }
  }
  return null
}

/**
 * One conversation of this paint, by id.
 * @param {string} id - session id.
 * @returns {object|null} the summary, or null when it is not drawn.
 */
function boardRowOf(id) {
  for (var i = 0; i < BOARD.rows.length; i++) {
    if (BOARD.rows[i].id === id) return BOARD.rows[i]
  }
  return null
}

/**
 * The goal panel under a native drag, asked in the order a browser answers.
 *
 * The event's own target comes first: that is the element the browser itself
 * found under the pointer, at the moment the gesture happened, and it is the
 * answer a real drag can always give. A drop surface that reports itself
 * instead of its children is the case the hit test is for.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @param {object} [target] - the event's target, when it has one.
 * @returns {object|null} the panel that would take the card, or null.
 */
function goalNodeAt(x, y, target) {
  var fromEvent = nearestGoal(target)
  if (fromEvent) return fromEvent
  if (typeof document.elementFromPoint !== 'function') return null
  try {
    return nearestGoal(document.elementFromPoint(x, y))
  } catch (error) {
    return null
  }
}

/** The goal panel an element stands in, or null when it stands in none. */
function nearestGoal(node) {
  if (!node || typeof node.closest !== 'function') return null
  try {
    return node.closest('[data-role="workspaceBlock"]')
  } catch (error) {
    return null
  }
}

/**
 * The goal the pointer is standing in, as the id a card is filed under.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @param {object} [target] - the event's target, when it has one.
 * @returns {string} the block id, or '' for the paper itself.
 */
function goalUnder(x, y, target) {
  var goal = goalNodeAt(x, y, target)
  return goal ? goal.getAttribute('data-block') || '' : ''
}

/**
 * The finished strip under the hand, or null.
 *
 * It is asked before the goal, because it stands inside one: a card let go
 * on the strip is finishing a conversation, and a card let go on the panel
 * around it is not. The answer is the whole element rather than its block:
 * the drop paints the strip it will land in, and only the element under the
 * point knows which of a goal's two surfaces the hand chose.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @param {Element} [target] - the event's target, when it has one.
 * @returns {Element|null} the strip, or null when the hand is not on one.
 */
function doneBarUnder(x, y, target) {
  var node = target
  if (!node || typeof node.closest !== 'function') {
    if (typeof document.elementFromPoint !== 'function') return null
    try {
      node = document.elementFromPoint(x, y)
    } catch (error) {
      return null
    }
  }
  if (!node || typeof node.closest !== 'function') return null
  try {
    return node.closest('[data-role="doneBar"]')
  } catch (error) {
    return null
  }
}

/**
 * The goal whose heading an element stands in, as the key a card starts a
 * conversation under.
 *
 * A heading is a goal's door: the plus is one seat of it, and the name and
 * the count beside the plus mean the same thing. The tray has no door of its
 * own - it is where work has no home, so starting there would be starting
 * nowhere - and its heading answers nothing.
 * @param {Element} node - the element under the pointer.
 * @returns {string} the goal key, or ''.
 */
function goalHeadKeyUnder(node) {
  if (!node || typeof node.closest !== 'function') return ''
  var head = null
  var panel = null
  try {
    head = node.closest('[data-role="blockHead"]')
    panel = head && head.closest ? head.closest('[data-role="workspaceBlock"]') : null
  } catch (error) {
    return ''
  }
  var key = panel ? panel.getAttribute('data-block') || '' : ''
  if (!key || key === BOARD_INBOX) return ''
  return key
}

/**
 * How many columns a panel reads across.
 * @param {object} block - the panel's block.
 * @returns {number} one column per conversation being worked in.
 */
function boardBlockColumns(block) {
  if (!block) return 0
  if (block.hot) return block.hot.length
  return block.rows ? block.rows.length : 0
}

/**
 * Whether one card is drawn inside a conversation's column.
 *
 * A card is stacked when it is tied to a conversation this paint can draw:
 * a tie to a conversation that is not on the board today has no column to
 * live in, so that card stays a free card on the paper. A card nobody draws
 * is a thought the reader has lost.
 * @param {object} card - one of `BOARD_STORE.cards`.
 * @returns {boolean} whether it is drawn in a stack.
 */
function boardCardStacked(card) {
  if (!card || !card.link || card.filed) return false
  var blocks = BOARD.blocks || []
  for (var b = 0; b < blocks.length; b++) {
    var rows = blocks[b].rows || []
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].id === card.link) return true
    }
  }
  return false
}

/**
 * How wide a panel stands.
 *
 * A goal is one column per conversation being worked in, so its width is
 * those columns plus the padding they stand in. The columns stop at the row's
 * own cap: past it a conversation starts another row under the first, which
 * makes the panel taller rather than wider - the direction a canvas is meant
 * to grow in, and the one that stops a busy goal from running off the paper.
 * @param {object} block - the panel's block.
 * @returns {number} the width in unzoomed pixels.
 */
function boardBlockWidth(block) {
  var columns = boardBlockColumns(block)
  if (!columns) return BOARD_BLOCK_W
  var across = Math.min(columns, BOARD_ROW_COLUMNS)
  return BOARD_BLOCK_PAD * 2 + across * BOARD_CARD_W + (across - 1) * BOARD_COLUMN_GAP
}

/**
 * Join a card's two parts back into the one string the store keeps.
 *
 * A note is written as a title and a body but stored as text, so the first
 * line is the title and everything after it is the body. Joining them here, in
 * one function, is what keeps the two fields from disagreeing about the blank
 * line between them.
 * @param {string} title - the first line.
 * @param {string} body - everything after it.
 * @returns {string} the text.
 */
function boardJoinText(title, body) {
  var head = String(title === undefined || title === null ? '' : title)
    .replace(/\s+/g, ' ')
    .trim()
  var rest = String(body === undefined || body === null ? '' : body).replace(/^\n+/, '')
  if (!head) return rest
  return rest ? head + '\n' + rest : head
}

/**
 * Give a card lifted out of a column a place on the paper.
 *
 * It stands beside the panel it left - clear of it, level with the first
 * conversation - because the place it was drawn in was the column's, not
 * its own.
 * @param {string} sessionId - the conversation it came out of.
 * @param {string} cardId - the card.
 * @returns {void}
 */
function parkCardOutside(sessionId, cardId) {
  var blocks = BOARD.blocks || []
  for (var b = 0; b < blocks.length; b++) {
    var rows = blocks[b].rows || []
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].id !== sessionId) continue
      var place = BOARD_STORE.blocks()[blocks[b].key]
      if (!place) return
      var wide = boardPanelWidths()[blocks[b].key] || boardBlockWidth(blocks[b])
      BOARD_STORE.moveCard(cardId, place.x + wide + BOARD_TIDY_GAP, place.y + BOARD_BLOCK_HEAD_H)
      return
    }
  }
}


export { parkCardOutside, workspaceForGoal, boardBlockByKey, boardBlocks, boardPlaces, boardPanelHeights, boardPanelWidths, boardExtent, applyBoardZoom, setBoardZoom, fitBoardToWindow, onBoardResize, onBoardWheel, nextCardPlace, boardFreePlace, goalByKey, nextGoalName, goalOfRow, boardHomeOf, boardRowOf, blockInk, goalHue, noteInkOf, notePaper, noteParts, boardTextRows, boardEditorRows, boardNoteMetrics, boardCardBox, boardCardOpenBox, canvasPointOf, goalNodeAt, nearestGoal, goalUnder, doneBarUnder, goalHeadKeyUnder, boardJoinText, tidyBoard, tidyLooseCards, boardSlots, blockSeat, boardBlockWidth, boardCardStacked, boardNoteCols, slotHue }
