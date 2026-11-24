/**
 * The board's own notes about conversations: the pinned line, the idea a card
 * carries, the verdict a finished one wears, and the fork lineage this client
 * watched. Writing is here; painting asks this module and does it itself.
 */
import { BOARD } from './board-state.js'
import { BOARD_STORE, NOTE_STORE } from './board-stores.js'
import { boardRepaint, boardShowBoard } from './board-hooks.js'
import { boardFreePlace, boardHomeOf } from './board-canvas.js'
import { currentSession, taskServices } from './sessions.js'
import { paletteText } from './strings.js'
import { refusal } from './errors.js'
import { showToast } from './toast.js'

/**
 * Start typing the line on one card.
 *
 * The field is drawn by the next repaint, which is why the focus is asked
 * for there rather than here: the node does not exist yet.
 * @param {string} id - session id.
 * @returns {void}
 */
function beginBoardNote(id) {
  BOARD.noteEditing = id
  boardRepaint()
}

/**
 * Keep what the open field says, and close it.
 *
 * An empty line is how a note is taken away; there is no second gesture to
 * remember. Called by a blur as well as by Enter, so a press elsewhere keeps
 * the sentence instead of throwing it away.
 * @returns {boolean} whether a field was open.
 */
function commitBoardNote() {
  if (!BOARD.noteEditing) return false
  var editor = BOARD.noteEditor
  var id = BOARD.noteEditing
  BOARD.noteEditing = ''
  BOARD.noteEditor = null
  NOTE_STORE.set(id, editor ? editor.value : '')
  boardRepaint()
  return true
}

/**
 * Throw the open field away, leaving the card as it was.
 * @returns {boolean} whether a field was open.
 */
function cancelBoardNote() {
  if (!BOARD.noteEditing) return false
  BOARD.noteEditing = ''
  BOARD.noteEditor = null
  boardRepaint()
  return true
}

/**
 * The note key: open the board on the conversation on screen, with its
 * field waiting.
 *
 * The key names a conversation rather than a place, so it works from the
 * conversation, from the task window and from the board itself.
 * @returns {boolean} whether a board with a field is up.
 */
function openNote() {
  var current = currentSession()
  if (!current || !current.id) {
showToast(paletteText('noteNoSession'))
return false
  }
  BOARD.noteEditing = current.id
  if (!boardShowBoard()) {
BOARD.noteEditing = ''
return false
  }
  // A board that is already up is one repaint behind; a page that mounted
  // just now already drew the field. Either way, draw it here and let the
  // repaint put the caret in the field it builds.
  if (BOARD.open) boardRepaint()
  return true
}

// ---------------------------------------------------------------------
// board
// ---------------------------------------------------------------------

/**
 * Put one conversation on the board by hand.
 *
 * The board is a day's view: a conversation it has not seen move since
 * midnight is gone from it, and until now the only way to keep one was the
 * ★ on the card itself - which meant the card had to still be there. This
 * is the way in from the conversation: one press, and the mark that
 * outlives the day's boundary is set.
 *
 * A conversation taken off the board is taken off until it moves again.
 * Asking for it by hand is a later decision than that one, so the deletion
 * is lifted as well.
 * @param {string} [id] - the conversation; the one on screen when omitted.
 * @returns {boolean} whether a conversation was found to put there.
 */
function pinToBoard(id) {
  var target = id
  if (!target) {
var current = currentSession()
target = current && current.id ? current.id : ''
  }
  if (!target) {
showToast(paletteText('pinNoSession'))
return false
  }
  var already = BOARD_STORE.isStarred(target)
  BOARD_STORE.unmute(target)
  if (!already) BOARD_STORE.toggleStar(target)
  if (BOARD.open && !BOARD.noteEditing) boardRepaint()
  showToast(paletteText(already ? 'pinAlready' : 'pinDone'))
  return true
}

/** The one sessions-service `fork` this process wrapped, so a rebuild does not wrap twice. */
var FORK_WATCH = null

/**
 * What the reader has said about a conversation, if it still applies.
 *
 * The word is tied to the turn it was said about: the stamp it was written
 * against must still be the conversation's own, or the card has moved on and
 * the word is about older work.
 * @param {object} summary - the conversation.
 * @returns {object|null} `{key, at}`, or null when nothing applies.
 */
function cardVerdictOf(summary) {
  if (!summary) return null
  var held = (BOARD.verdicts || BOARD_STORE.verdicts())[summary.id]
  var at = Number(summary.updatedAt) || 0
  if (!held || !at || held.at !== at) return null
  return held
}

/**
 * Write down that a turn ended, before the shell forgets it did.
 *
 * A completion is the shell's to announce and the shell's to drop the moment
 * the reader opens the conversation. The board keeps the fact itself so the
 * card can still say something afterwards - and hangs it on the turn's own
 * stamp, so a conversation that moves again starts from no word at all.
 * @param {object} row - the conversation.
 * @returns {void}
 */
function noteCardFinished(row) {
  var at = Number(row && row.updatedAt) || 0
  if (!at) return
  var held = (BOARD.verdicts || BOARD_STORE.verdicts())[row.id]
  if (held && held.at === at) return
  BOARD_STORE.setVerdict(row.id, 'finished', at)
  BOARD.verdicts = BOARD_STORE.verdicts()
}

/**
 * Record a fork this plugin watched, and repaint a board that is up.
 *
 * @param {string} parentId - the conversation the branch was cut from.
 * @param {string} childId - the conversation the branch became.
 * @returns {boolean} whether a new line was recorded.
 */
function rememberFork(parentId, childId) {
  if (!parentId || !childId) return false
  var parent = String(parentId)
  var child = String(childId)
  var added = BOARD_STORE.rememberFork(child, parent)
  var homed = inheritForkHome(parent, child)
  if ((added || homed) && BOARD.open && !BOARD.noteEditing) boardRepaint()
  return added || homed
}

/**
 * File a branch in the goal its parent is in.
 *
 * A conversation belongs to a goal, and a branch cut from it belongs beside
 * it: the line the board draws has two ends, and a child drawn in another
 * panel has no line at all. A filing the reader made is copied as it stands.
 * A card sitting in a workspace panel is copied only while the board is up to
 * say which panel that was - the shell's own fork does not name where it came
 * from, so with the board closed there is nothing to copy and nothing to
 * guess.
 * @param {string} parentId - the conversation the branch was cut from.
 * @param {string} childId - the branch.
 * @returns {boolean} whether the child was filed somewhere new.
 */
function inheritForkHome(parentId, childId) {
  var goal = BOARD_STORE.placementOf(parentId)
  if (!goal && BOARD.open) {
var home = boardHomeOf(parentId)
goal = home ? home.key : ''
  }
  if (!goal) return false
  if (BOARD_STORE.placementOf(childId) === goal) return false
  return BOARD_STORE.placeSession(childId, goal)
}

/**
 * Bring one card into view, without moving the paper any further than it
 * has to.
 *
 * A branch lands under the card it was cut from, which may stand below
 * the fold of a long panel: a panel is laid out whole now, so the one
 * scroller left is the paper itself, and `nearest` moves it just far
 * enough. The reader who asked for the branch would otherwise be
 * looking at a board that did not change.
 * @param {string} id - session id.
 * @returns {void}
 */
function revealBoardCard(id) {
  if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
  var drawn = BOARD.stage.querySelectorAll('[data-session-id]')
  for (var i = 0; i < drawn.length; i++) {
if (drawn[i].getAttribute('data-session-id') !== id) continue
if (typeof drawn[i].scrollIntoView === 'function') drawn[i].scrollIntoView({ block: 'nearest' })
return
  }
}

/**
 * Watch the sessions service for forks, so a branch made anywhere in the
 * shell gets its line here.
 *
 * The host writes no durable parent onto an ordinary fork — the child is a
 * prefix of the source's events, and its header does not name where it came
 * from — so the only honest way to draw a line is to be standing there when
 * the branch is made. Wrapping `fork` observes every caller (the sidebar,
 * the shortcut, and this board's own mark) without changing what any of
 * them get back; a refusal propagates untouched. A host whose service
 * refuses the wrap simply gets the lines this board makes itself.
 * @returns {boolean} whether this process is watching.
 */
function watchForks() {
  var services = taskServices()
  var controller = services && services.controller
  if (!controller || typeof controller.fork !== 'function') return false
  if (FORK_WATCH && FORK_WATCH.controller === controller && controller.fork === FORK_WATCH.wrapped) {
return true
  }
  var original = controller.fork
  /** The same fork, with the one fact it does not return remembered beside it. */
  var wrapped = function (options) {
var result = original.apply(this, arguments)
if (!result || typeof result.then !== 'function') return result
var parentId = options && options.sessionId
return result.then(function (childId) {
  rememberFork(parentId, childId)
  return childId
})
  }
  try {
controller.fork = wrapped
  } catch (error) {
console.warn('[dsh-vim] could not watch session forks', error)
return false
  }
  if (controller.fork !== wrapped) return false
  FORK_WATCH = { controller: controller, wrapped: wrapped }
  return true
}

/**
 * Stand a new goal on the canvas, ready to be given a purpose.
 *
 * A goal used to be something only a conversation could make, which is the
 * wrong way round for work that has not started: the place to write down
 * what is to be done should exist before the first conversation about it.
 * The line opens with the panel, so the next thing typed is what keeps it
 * there.
 * @returns {void}
 */
function addBoardGoal() {
  var place = boardFreePlace()
  var key = BOARD_STORE.addGoal('', place.x, place.y)
  if (!key) return
  // Held while the board is up: a goal with nothing in it and nothing said
  // about it is a place nobody is working in, and the rule that clears those
  // must not take the one being named out from under the caret.
  BOARD.drafts[key] = true
  BOARD.intentBlock = key
  BOARD.intentInput = null
  boardRepaint()
  showToast(paletteText('boardGoalAdded'))
}


export { beginBoardNote, commitBoardNote, cancelBoardNote, openNote, pinToBoard, cardVerdictOf, noteCardFinished, rememberFork, inheritForkHome, revealBoardCard, watchForks, addBoardGoal, FORK_WATCH }
