/**
 * Where a conversation starts reading when the board is the way in: the
 * last thing the reader wrote is put at the top of the transcript. Only the
 * one arrival a card press armed is touched; every other way in keeps the
 * position the shell chose.
 */
import { serviceOf, taskCtx, entryRunning } from './sessions.js'
import { parentOf, scrollerFrom } from './dom.js'
import { anim, hold, push } from './scroll.js'

/**
 * Where a conversation that is opened from elsewhere starts reading.
 *
 * The shell opens a conversation at its floor whenever it has no saved
 * position for it — which is the case for every conversation finished
 * while the reader was away, because staying at the tail saves nothing.
 * The last words the reader wrote are the boundary of what they already
 * read: putting that message at the top resumes the read downwards,
 * where the tail would drop them at an answer's last line and leave a
 * long answer to be read backwards.
 *
 * This is a scroll anchor, not a focus. The keyboard is the composer
 * plugin's business, and a page that took it on arrival would be the one
 * thing this bundle promises never to do.
 *
 * Only the board's own press anchors: a conversation the reader switches
 * to from the task window or the sidebar keeps the position the shell
 * chose, and a client rebuild does not re-anchor the page it rebuilt
 * around. While a turn streams, at its completion, and when history pages
 * in, the tail stays the truth. `arm` names the one arrival a board press
 * allowed, `id` the placement it started, and `done` the one already
 * answered, so a status tick on the same conversation cannot redo it.
 */
var ENTRY = {
  /**
   * The one conversation whose arrival may be anchored, set by the board
   * when the reader presses a card and consumed by the next arrival of
   * that id. Every other way in leaves it '' and keeps the shell's place.
   */
  arm: '',
  /** The conversation the pending placement answers, or '' when there is none. */
  id: '',
  /** The conversation whose arrival was already answered, or ''. */
  done: '',
  /** The frame the settle loop is on, 0 when idle. */
  raf: 0,
  /** Frames spent waiting for the page, capped by ENTRY_FRAMES. */
  frames: 0,
  /** The content height last sampled, to know when layout has stopped moving. */
  height: -1,
  /** Consecutive frames the content height and the tail have held still. */
  still: 0,
  /** Detach of the live-session subscription, or null. */
  stop: null,
}

/** Distance from the scrollport's top to an anchored message. */
/**
 * Arm the one arrival a board press is allowed to anchor.
 * @param {string} id - session id.
 * @returns {void}
 */
export function armEntry(id) {
  ENTRY.arm = id
}

/**
 * Drop an arm that was never spent, after a navigation the host refused.
 * @returns {void}
 */
export function clearEntryArm() {
  ENTRY.arm = ''
}

var ENTRY_PAD = 16
/** How much of a prompt taller than the screen stays above its answer. */
var ENTRY_CONTEXT = 48
/** How close to the floor the page must be for the arrival to look like the shell's own. */
var ENTRY_TAIL = 4
/** Frames an arrival may wait for history and layout, about two seconds. */
var ENTRY_FRAMES = 120

/**
 * Follow the conversation on screen for the life of the page, so an
 * arrival can be told from a status tick.
 *
 * The id comes from the shell's own current binding — the one the main
 * view retains — because that is the same answer the status chip reads.
 * A host that publishes no such binding simply has no entry anchor and
 * loses nothing else; the keys keep working.
 * @returns {void}
 */
function watchEntries() {
  if (ENTRY.stop) return
  var uiSession = serviceOf(taskCtx, 'uiSession')
  var current = uiSession && uiSession.adapter && uiSession.adapter.current
  if (!current || typeof current.subscribe !== 'function'
    || typeof current.getSnapshot !== 'function') return
  var read = function () {
    var snapshot = null
    try {
      snapshot = current.getSnapshot()
    } catch (error) {
      return ''
    }
    return snapshot && typeof snapshot.key === 'string' ? snapshot.key : ''
  }
  ENTRY.stop = current.subscribe(function () {
    noteEntry(read())
  })
  noteEntry(read())
}

/**
 * Start the arrival of one conversation, unless this one already had its
 * answer.
 * @param {string} id - the conversation now on screen, or '' when none is.
 * @returns {void}
 */
function noteEntry(id) {
  if (!id) {
    // Leaving makes the next visit an arrival again; the shell's saved
    // position, if it kept one, still wins in `settleEntry`.
    ENTRY.done = ''
    cancelEntry()
    return
  }
  if (id === ENTRY.done) return
  cancelEntry()
  ENTRY.done = id
  // A conversation opens the same way from the task window, from the
  // sidebar and from the shell's own restores, and none of those is a
  // reading request: only the board's press carries the arm. The arm is
  // spent either way, so a later arrival cannot use it by accident.
  var armed = ENTRY.arm === id
  ENTRY.arm = ''
  if (!armed) return
  ENTRY.id = id
  ENTRY.raf = window.requestAnimationFrame(settleEntry)
}

/** Drop the pending placement without touching what was already decided. */
function cancelEntry() {
  if (ENTRY.raf) window.cancelAnimationFrame(ENTRY.raf)
  ENTRY.raf = 0
  ENTRY.id = ''
  ENTRY.frames = 0
  ENTRY.height = -1
  ENTRY.still = 0
}

/** Stop following arrivals; the next page arms its own watch. */
function stopEntries() {
  cancelEntry()
  ENTRY.done = ''
  ENTRY.arm = ''
  if (ENTRY.stop) {
    try {
      ENTRY.stop()
    } catch (error) {
      /* a host that already dropped the subscription is done either way */
    }
  }
  ENTRY.stop = null
}

/**
 * One frame of an arrival: wait until the page shows this conversation at
 * its floor with a still layout, then put its last human message at the
 * top.
 *
 * Nothing is written while a turn is in flight, while the reader is
 * already moving, or when the shell restored a position of its own — the
 * tail is the only honest place for those. A page that never settles
 * simply keeps the tail it opened with.
 * @returns {void}
 */
function settleEntry() {
  ENTRY.raf = 0
  var id = ENTRY.id
  if (!id) return
  // The reader took over before the page settled: the position they made
  // is the one to keep.
  if (hold.timer || hold.key || anim.el || anim.raf) {
    cancelEntry()
    return
  }
  if (ENTRY.frames >= ENTRY_FRAMES) {
    cancelEntry()
    return
  }
  ENTRY.frames += 1
  var running = entryRunning(id)
  if (running === null) {
    ENTRY.raf = window.requestAnimationFrame(settleEntry)
    return
  }
  // A turn in flight is a live feed, and a live feed is read from its end.
  if (running) {
    cancelEntry()
    return
  }
  var content = document.querySelector('[data-conversation-content]')
  if (!content) {
    ENTRY.raf = window.requestAnimationFrame(settleEntry)
    return
  }
  var shown = content.getAttribute('data-conversation-session')
  if (shown && shown !== id) {
    // The shell has committed the new conversation but not painted it yet.
    ENTRY.raf = window.requestAnimationFrame(settleEntry)
    return
  }
  var row = lastInputRow(content)
  if (!row) {
    ENTRY.raf = window.requestAnimationFrame(settleEntry)
    return
  }
  var scroller = entryScroller(row)
  if (!scroller || scroller.scrollHeight - scroller.clientHeight <= 1) {
    cancelEntry()
    return
  }
  var floor = scroller.scrollHeight - scroller.clientHeight
  // A restored reading position is not the floor. The shell writes it in
  // its own layout effect, so by this frame the difference is already
  // visible; waiting cannot turn one into the other.
  if (scroller.scrollTop < floor - ENTRY_TAIL) {
    cancelEntry()
    return
  }
  if (ENTRY.height !== scroller.scrollHeight) {
    ENTRY.height = scroller.scrollHeight
    ENTRY.still = 0
    ENTRY.raf = window.requestAnimationFrame(settleEntry)
    return
  }
  ENTRY.still += 1
  if (ENTRY.still < 2) {
    ENTRY.raf = window.requestAnimationFrame(settleEntry)
    return
  }
  anchorEntry(scroller, row)
  cancelEntry()
}

/**
 * The last message a person wrote in the transcript, if one is on screen.
 *
 * The shell tags every flow row with its kind, and only human input rows
 * carry `user`; approvals, notices and scheduled wakes are somebody
 * else's words. Rows inside a hidden fold do not count — the reader
 * cannot scroll to them.
 * @param {Element} content - the conversation's own body.
 * @returns {Element|null} the row, or null.
 */
function lastInputRow(content) {
  var rows = content.querySelectorAll('[data-chat-flow-kind="user"]')
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i]
    if (!row || row.isConnected === false) continue
    if (typeof row.closest === 'function' && row.closest('[hidden],[data-turn-process-hidden]')) continue
    var box = row.getBoundingClientRect()
    if (!box || box.height < 1) continue
    return row
  }
  return null
}

/**
 * The box a transcript row scrolls in: the nearest ancestor that declares
 * vertical overflow, whether or not it has anything to scroll right now.
 * `scrollerFrom` skips a box with no overflow, which would hand a short
 * transcript the page's own scroller instead.
 * @param {Element} row - a flow row.
 * @returns {Element|null} the box, or null outside a scrollable transcript.
 */
function entryScroller(row) {
  var cur = row
  while (cur && cur.nodeType === 1) {
    var overflow = getComputedStyle(cur).overflowY
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return cur
    cur = parentOf(cur)
  }
  return null
}

/**
 * Put one transcript row at the top of its scrollport, within the box's
 * own range.
 *
 * A prompt taller than the screen would push its own answer off the
 * screen; for those, the prompt's end is anchored with a line of context
 * above it, so the answer still starts within reach.
 * @param {Element} scroller - the transcript's scroll box.
 * @param {Element} row - the row to anchor.
 * @returns {void}
 */
function anchorEntry(scroller, row) {
  var box = row.getBoundingClientRect()
  var frame = scroller.getBoundingClientRect()
  var top = box.top - frame.top + scroller.scrollTop
  var target = top - ENTRY_PAD
  if (ENTRY_PAD + box.height > scroller.clientHeight) {
    target = top + box.height - ENTRY_PAD - ENTRY_CONTEXT
  }
  var max = scroller.scrollHeight - scroller.clientHeight
  target = Math.max(0, Math.min(max, target))
  if (Math.abs(scroller.scrollTop - target) < 1) return
  scroller.scrollTop = target
  settleEntryScroll(scroller)
}

/**
 * Let the shell treat the placement as a finished reading move.
 *
 * Until the shell samples a scroll it still believes the page follows the
 * tail, and the next layout growth would carry it to the floor and undo
 * the anchor. The shell's own `scrollend` is how it says a move has
 * settled; the event is dispatched one frame later because the browser
 * delivers the scroll event that starts the sample at the top of a frame,
 * before animation callbacks.
 * @param {Element} scroller - the transcript's scroll box.
 * @returns {void}
 */
function settleEntryScroll(scroller) {
  if (typeof Event !== 'function') return
  window.requestAnimationFrame(function () {
    if (scroller.isConnected === false || typeof scroller.dispatchEvent !== 'function') return
    try {
      scroller.dispatchEvent(new Event('scrollend'))
    } catch (error) {
      /* a host that refuses the event keeps its own sampling timer */
    }
  })
}


export { watchEntries, stopEntries, cancelEntry }
