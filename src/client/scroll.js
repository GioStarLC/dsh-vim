/**
 * Scrolling: which container a press means, and the glide it gets. The
 * pointer and the held key are input facts other surfaces read; the
 * animation itself never leaves this module.
 */
import { REPEAT_INTERVAL, MIN_REPEAT_INTERVAL, REPEAT_RAMP } from './constants.js'
import { isEditable, isScrollable, parentOf, scrollerFrom, largestScroller, elementAt } from './dom.js'
import { settings } from './preferences.js'

var state = { debug: false }

/** Animation currently owning one container. */
var anim = { el: null, current: 0, target: 0, raf: 0, last: 0, suppressed: false, behavior: '' }

/** Auto-repeat for the held key; the OS repeat is deliberately ignored. */
var hold = { key: '', dir: 0, timer: 0, interval: 0, el: null }

/**
 * Where the pointer last was, in client coordinates.
 *
 * The pane being pointed at is the pane being read, so this is what
 * `pickScroller` consults first: hover the conversation and the scroll keys
 * work the transcript, hover the sidebar and they work the sidebar. `seen`
 * stays false until the first move, so a keyboard-only session keeps the
 * old focus-then-centre order, and a blur drops the point again because the
 * browser delivers no moves while another window is in front.
 */
var pointer = { x: 0, y: 0, seen: false }

/**
 * Choose the container to scroll. Deterministic order: whatever sits under
 * the pointer (the pane the user is pointing at is the pane they mean),
 * then whatever holds focus, then whatever sits under the centre of the
 * viewport (the main content area), then the largest scroll container.
 *
 * The two later rules are not dead code: they carry a keyboard-only session
 * and any spot where the pointer rests on something that cannot scroll —
 * a pane header, a gap between panes — where falling back to the
 * conversation beats scrolling nothing at all.
 * @returns {Element|null} the element to scroll.
 */
function pickScroller() {
  if (pointer.seen) {
    var fromPointer = scrollerFrom(elementAt(pointer.x, pointer.y))
    if (fromPointer) return fromPointer
  }
  var focused = document.activeElement
  if (focused && focused !== document.body && focused !== document.documentElement && !isEditable(focused)) {
    var fromFocus = scrollerFrom(focused)
    if (fromFocus) return fromFocus
  }
  if (typeof document.elementFromPoint === 'function') {
    var centre = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    var fromCentre = scrollerFrom(centre)
    if (fromCentre) return fromCentre
  }
  return largestScroller()
}

/**
 * Whether the container still has room in the requested direction.
 * @param {Element} el - scroll container.
 * @param {number} dir - 1 for down, -1 for up.
 * @returns {boolean} whether it can move.
 */
function canMove(el, dir) {
  var max = el.scrollHeight - el.clientHeight
  return dir > 0 ? el.scrollTop < max - 1 : el.scrollTop > 1
}

/**
 * Walk from the picked container up to the first one that can move. This is
 * what makes the end of a pane hand the gesture to its parent, like a wheel.
 * @param {Element|null} start - picked container.
 * @param {number} dir - 1 for down, -1 for up.
 * @returns {Element|null} the container that will actually move.
 */
function resolveTarget(start, dir) {
  var cur = start
  while (cur && cur.nodeType === 1) {
    if (isScrollable(cur) && canMove(cur, dir)) return cur
    cur = parentOf(cur)
  }
  return null
}

/** Honour the OS "reduce motion" preference. */
function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Pin `scroll-behavior: auto` for the animated element. Without this, a
 * container styled with `scroll-behavior: smooth` would animate every
 * per-frame write and the result would stutter.
 * @param {Element} el - scroll container.
 */
function suppressSmooth(el) {
  if (!el.style) return
  if (getComputedStyle(el).scrollBehavior !== 'smooth') return
  anim.suppressed = true
  anim.behavior = el.style.scrollBehavior || ''
  el.style.scrollBehavior = 'auto'
}

/** Stop the animation loop and restore anything it changed. */
function stopAnim() {
  if (anim.raf) {
    window.cancelAnimationFrame(anim.raf)
    anim.raf = 0
  }
  if (anim.el && anim.suppressed && anim.el.style) anim.el.style.scrollBehavior = anim.behavior
  anim.el = null
  anim.suppressed = false
  anim.behavior = ''
  anim.last = 0
}

/**
 * One animation frame: ease `current` toward `target`, frame-rate
 * independent through `1 - exp(-dt / tau)`.
 * @param {number} ts - frame timestamp.
 */
function frame(ts) {
  anim.raf = 0
  if (!anim.el || anim.el.isConnected === false) {
    stopAnim()
    return
  }
  var dt = anim.last ? Math.min(ts - anim.last, 64) : 16
  anim.last = ts
  var diff = anim.target - anim.current
  if (Math.abs(diff) < 0.5) {
    anim.el.scrollTop = anim.target
    stopAnim()
    return
  }
  anim.current += diff * (1 - Math.exp(-dt / Math.max(1, settings.tau)))
  anim.el.scrollTop = anim.current
  anim.raf = window.requestAnimationFrame(frame)
}

/**
 * Queue a scroll step. Resolves (or reuses) the container, extends the
 * animation target, and starts the loop when it is idle.
 * @param {number} delta - pixels to add to the target, signed.
 * @param {Element|null} pinned - container captured earlier in this hold.
 * @returns {Element|null} the container that will move, or null.
 */
function push(delta, pinned) {
  var dir = delta > 0 ? 1 : -1
  var el = pinned && pinned.isConnected !== false && isScrollable(pinned) ? pinned : resolveTarget(pickScroller(), dir)
  if (!el) return null

  var max = el.scrollHeight - el.clientHeight
  if (reducedMotion()) {
    el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + delta))
    return el
  }

  if (anim.el !== el) {
    stopAnim()
    anim.el = el
    suppressSmooth(el)
    anim.current = el.scrollTop
    anim.target = el.scrollTop
  }
  anim.target = Math.max(0, Math.min(max, anim.target + delta))
  if (!anim.raf) {
    anim.last = 0
    anim.raf = window.requestAnimationFrame(frame)
  }
  return el
}

/** Cancel the held-key auto-repeat. */
function stopHold() {
  if (hold.timer) {
    window.clearTimeout(hold.timer)
    hold.timer = 0
  }
  hold.key = ''
  hold.dir = 0
  hold.interval = 0
  hold.el = null
}

/** Auto-repeat tick: one more step, then schedule the next sooner. */
function tickHold() {
  hold.timer = 0
  if (!hold.dir) return
  var el = push(hold.dir * settings.step, hold.el)
  if (!el) {
    stopHold()
    return
  }
  hold.el = el
  hold.interval = Math.max(MIN_REPEAT_INTERVAL, hold.interval - REPEAT_RAMP)
  hold.timer = window.setTimeout(tickHold, hold.interval)
}

/**
 * Start a hold: one immediate step, then our own accelerating repeat. The
 * operating system's repeat is ignored, which removes its initial delay and
 * its uneven burst rate.
 * @param {string} key - lower-cased key.
 * @param {number} dir - 1 for down, -1 for up.
 * @returns {boolean} whether anything is scrolling.
 */
function startHold(key, dir) {
  stopHold()
  var el = push(dir * settings.step, null)
  if (!el) return false
  hold.key = key
  hold.dir = dir
  hold.el = el
  hold.interval = REPEAT_INTERVAL
  hold.timer = window.setTimeout(tickHold, settings.repeatDelay)
  return true
}

/**
 * Which direction a pressed key drives, if any.
 * @param {string} key - lower-cased key.
 * @returns {number|undefined} 1 for down, -1 for up, undefined when unbound.
 */
function directionOf(key) {
  if (key === settings.downKey) return 1
  if (key === settings.upKey) return -1
  return undefined
}

export { state, anim, hold, pointer, pickScroller, canMove, resolveTarget, reducedMotion, suppressSmooth, stopAnim, frame, push, stopHold, tickHold, startHold, directionOf }
