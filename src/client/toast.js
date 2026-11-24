/**
 * The transient line the plugin speaks in: one element, reused, never a
 * dialog, and one offer that can be taken back while it is still on screen.
 * It floats above the message box, which the focus module knows how to find.
 */
import { composerRoot } from './focus.js'


// ---------------------------------------------------------------------
// reasoning level
// ---------------------------------------------------------------------

/**
 * The transient line the plugin speaks in. One element, reused, never a
 * dialog: the reasoning level is the only thing this plugin changes that
 * leaves no trace on the page, so a press has to be readable back — but it
 * is a setting, not a question, so it must not take the keyboard or a click.
 */
/**
 * The transient line the plugin speaks in. One element, reused, never a
 * dialog: the reasoning level is the only thing this plugin changes that
 * leaves no trace on the page, so a press has to be readable back — but it
 * is a setting, not a question, so it must not take the keyboard or a click.
 * @type {object} the notice.
 */
var TOAST = makeNotice()

/**
 * The transient line the plugin speaks in.
 *
 * One element, reused, never a dialog: the reasoning level is the only thing
 * this plugin changes that leaves no trace on the page, so a press has to be
 * readable back — but it is a setting, not a question, so it must not take
 * the keyboard or a click. The shell's own dock row says the other thing
 * that has to be readable, the send key, and does it as a slot.
 * @returns {object} the notice.
 */
function makeNotice() {
  /** The pill, the fixed host it sits in, its pending timer, its last placement. */
  var el = null
  var host = null
  var timer = 0
  var offset = ''

  /** Take the notice off the page and drop the pending timer. */
  function hideNow() {
    if (timer) {
      window.clearTimeout(timer)
      timer = 0
    }
    if (el && el.parentNode) el.parentNode.removeChild(el)
    if (host && host.parentNode) host.parentNode.removeChild(host)
    el = null
  }

  return {
    /** Say one thing for a moment, replacing whatever was there. */
    say(text, ttl, after) {
      this.show({ text: text, ttl: ttl, after: after })
    },

    /**
     * Say one thing that can be taken back while it is still on screen.
     *
     * This is the one notice that is a click, and it has to be: undoing is
     * a decision the reader can make only in the seconds it is offered, and
     * a line that says what happened without offering the way back is a
     * report rather than a choice.
     * @param {string} text - what happened.
     * @param {string} label - the word on the way back.
     * @param {number} ttl - how long the offer stands.
     * @param {Function} undo - what that word does.
     * @returns {void}
     */
    sayAction(text, label, ttl, undo) {
      this.show({ text: text, action: label, ttl: ttl, undo: undo })
    },

    /** Put one line on screen, plain or with the way back on its right. */
    show(options) {
      if (!document.body) return
      if (!host) {
        host = document.createElement('div')
        Object.assign(host.style, TOAST_HOST_UI)
      }
      if (!el) {
        el = document.createElement('div')
        Object.assign(el.style, TOAST_UI)
        el.setAttribute('role', 'status')
      }
      el.textContent = ''
      // A plain line is never a click target; the one carrying a way back
      // has to be, or the offer is a word nobody can press.
      el.style.pointerEvents = options.action ? 'auto' : 'none'
      el.style.cursor = options.action ? 'pointer' : ''
      // The pill is reused, so the way back is taken off before it is put
      // on again: an offer that stacks two undos on one click would undo
      // twice.
      if (el.__undoClick) {
        el.removeEventListener('click', el.__undoClick)
        el.__undoClick = null
      }
      var line = document.createElement('span')
      line.textContent = String(options.text === undefined || options.text === null ? '' : options.text)
      el.appendChild(line)
      if (options.action) {
        var action = document.createElement('span')
        action.style.marginLeft = '10px'
        action.style.fontWeight = '600'
        action.style.textDecoration = 'underline'
        action.textContent = String(options.action)
        el.appendChild(action)
        var back = options.undo
        el.__undoClick = function () {
          hideNow()
          if (typeof back === 'function') back()
        }
        el.addEventListener('click', el.__undoClick)
      }
      if (!host.parentNode) document.body.appendChild(host)
      if (!el.parentNode) host.appendChild(el)
      this.place()
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(function () {
        timer = 0
        if (typeof options.after === 'function') options.after()
        else hideNow()
      }, Number(options.ttl) || TOAST_MS)
    },
    /**
     * Float just above the message box, or fall back to the top edge.
     *
     * The box is the one landmark that does not move, so a notice pinned to
     * the top of the screen is a notice nobody's eye is near. Measured per
     * notice rather than cached, because the box moves when the composer
     * grows or a panel opens around it.
     */
    place() {
      if (!host || !el) return
      var box = composerRoot()
      var measure = box && typeof box.getBoundingClientRect === 'function' ? box.getBoundingClientRect() : null
      var tall = Number(window.innerHeight) || 0
      var next
      // A box only lifts the notice when the whole of it is on screen. Off
      // the top the subtraction overflows the window; off the bottom - a box
      // measured before the page it belonged to was replaced, which is what
      // the board's own page does - it turns negative and puts the line under
      // the screen, where nobody can read what it said.
      if (measure && measure.top > 0 && (!tall || measure.top < tall - 4)) {
        next = 'calc(100vh - ' + Math.round(measure.top) + 'px + ' + TOAST_GAP + ')'
      } else {
        next = 'calc(100vh - ' + TOAST_EDGE + ')'
      }
      if (offset !== next) {
        offset = next
        host.style.bottom = next
      }
    },
    /**
     * Take it down and drop the pending timer.
     *
     * The node goes with the host: the host is kept for the next notice, and
     * a node left inside it would be a second line stacked under the next
     * one.
     */
    hide() {
      hideNow()
    },
  }
}

/** A fixed host, so the notice can be placed against the message box. */
var TOAST_HOST_UI = {
  position: 'fixed',
  left: '0',
  right: '0',
  bottom: '0',
  display: 'flex',
  justifyContent: 'center',
  // The host is a container, not a surface: a click must reach whatever is
  // under it — the message box included, which it overlaps by design.
  pointerEvents: 'none',
  // Above the task window (2147483000), so the level stays readable when the
  // window is open — the key works there too.
  zIndex: '2147483001',
}

/** The pill that carries the line. */
var TOAST_UI = {
  maxWidth: '70vw',
  padding: '7px 14px',
  borderRadius: '999px',
  background: 'rgba(26, 26, 30, 0.96)',
  color: '#f2f2f4',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)',
  fontSize: '13px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  // Still never a click target of its own.
  pointerEvents: 'none',
}

/** How long a notice stays on screen. */
var TOAST_MS = 1600

/** How far above the message box the notice floats. */
var TOAST_GAP = '10px'

/** How much room the notice keeps from the top of the window when it cannot float. */
var TOAST_EDGE = '12px'

/**
 * Say one thing for a moment. A second press replaces the line and restarts
 * the clock rather than stacking notices, so holding the key reads as one
 * counter rather than a pile of cards.
 * @param {string} text - the line to show.
 * @returns {void}
 */
function showToast(text) {
  TOAST.say(text, TOAST_MS, hideToast)
}

/** Take the notice down and drop the pending timer. */
function hideToast() {
  TOAST.hide()
}

export { TOAST, showToast, hideToast }
