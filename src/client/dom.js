/**
 * DOM questions the input path asks: what is editable, what can scroll, and
 * which element sits under a point or above another one. No state, no
 * listeners — the scroll engine composes these.
 */
import { RAW_INPUT_SELECTOR } from './constants.js'


/**
 * True when the element consumes printable characters itself.
 * @param {Element|null} node - candidate element.
 * @returns {boolean} whether keystrokes must pass through untouched.
 */
function isEditable(node) {
  if (!node || node.nodeType !== 1) return false
  if (node.isContentEditable === true) return true
  var tag = node.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return typeof node.closest === 'function' && node.closest(RAW_INPUT_SELECTOR) !== null
}

/**
 * True when the element is a non-editable box that overflows vertically and
 * is allowed to scroll.
 * @param {Element|null} node - candidate element.
 * @returns {boolean} whether the element can scroll vertically.
 */
function isScrollable(node) {
  if (!node || node.nodeType !== 1) return false
  if (isEditable(node)) return false
  if (node.scrollHeight - node.clientHeight <= 1) return false
  var overflow = getComputedStyle(node).overflowY
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay'
}

/**
 * Parent element, crossing shadow boundaries through the host node.
 * @param {Element} node - current element.
 * @returns {Element|null} ancestor element.
 */
function parentOf(node) {
  if (node.parentElement) return node.parentElement
  var root = typeof node.getRootNode === 'function' ? node.getRootNode() : null
  return root && root.host ? root.host : null
}

/**
 * Nearest scrollable ancestor, inclusive.
 * @param {Element|null} node - starting element.
 * @returns {Element|null} scroll container, if any.
 */
function scrollerFrom(node) {
  var cur = node
  while (cur && cur.nodeType === 1) {
    if (isScrollable(cur)) return cur
    cur = parentOf(cur)
  }
  return null
}

/** Largest visible scroll container; the last-resort target. */
function largestScroller() {
  var best = null
  var bestSize = 0
  var nodes = document.querySelectorAll('*')
  for (var i = 0; i < nodes.length; i++) {
    if (!isScrollable(nodes[i])) continue
    var size = nodes[i].scrollHeight - nodes[i].clientHeight
    if (size > bestSize) {
      bestSize = size
      best = nodes[i]
    }
  }
  return best
}

/**
 * The topmost element at a point, when the document can be asked. A host
 * without hit-testing — or one that throws on it — simply has no pointer
 * rule, and the older heuristics decide.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {Element|null} the element there, or null.
 */
function elementAt(x, y) {
  if (typeof document.elementFromPoint !== 'function') return null
  try {
    return document.elementFromPoint(x, y)
  } catch (error) {
    return null
  }
}

export { isEditable, isScrollable, parentOf, scrollerFrom, largestScroller, elementAt }
