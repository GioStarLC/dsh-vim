/**
 * The message box as a place the keyboard passes through: where it is, who
 * may put the caret in it, and how a send hands it back. Nothing here owns a
 * window; the keys that consult these rules are the keyboard module.
 */
import { ACTIVATING_SELECTOR, COMPOSER_SELECTOR, DOUBLE_ENTER_MS, FOCUS_REQUEST_MS, MODAL_SELECTOR, REWRITTEN_FLAG, SEND_HAND_BACK_MS, TRIGGER_MENU_SELECTOR } from './constants.js'
import { settings } from './preferences.js'
import { state } from './scroll.js'

/** The message box, once a focus has shown us which element it is. */
var composer = null

/** Whether a gesture of the user's own has asked for the keyboard in a field. */
var focusRequest = { pending: false, timer: 0 }

/**
 * How long a focus arriving after the window got the front back is left
 * alone, in milliseconds.
 *
 * A dictation or clipboard tool (Ditto and its relatives) does not stamp a
 * caret into the box: it brings this window to the front and then presses
 * Ctrl+V on the keyboard, as the user's own keystroke. The box has to be
 * holding the caret by the time that key arrives, or there is nothing to
 * paste into, and a caret this plugin had just refused is exactly the case
 * the user reported. The gesture is therefore honoured while the window is
 * coming back from the outside — the press that landed is indistinguishable
 * from a click — and nowhere else, so arriving from the shell's own render
 * effect (a switch, the first load, the end of a turn) is untouched.
 */
var REFOCUS_GRACE_MS = 400

/**
 * When the window last got the front back, in `Date.now()` milliseconds.
 * Zero means it has never lost it since this page woke up.
 */
var refocusAt = 0

/**
 * Probes a send has queued to give the keyboard back, counted rather than
 * timed: a counter retires every probe still in flight by making them stale,
 * so the user asking for the keyboard again needs no timer bookkeeping of
 * its own.
 */
var handBack = { token: 0 }

/**
 * When the last bare Enter was seen, in `Date.now()` milliseconds, for the
 * double-Enter send mode. Zero means no pair is in progress.
 */
var doubleEnter = { at: 0 }

/**
 * The message box: the rich-text editor root the shell puts the caret into.
 *
 * `rememberComposer` supplies it from a focus that actually landed, and
 * `COMPOSER_SELECTOR` supplies it when the host names its own editor, which
 * is the case before anything has been focused. Returning null is
 * survivable: the guard then has nothing to protect and the focus key has
 * nothing to focus.
 * @returns {Element|null} the editor root, or null when there is none.
 */
function composerRoot() {
  if (composer && composer.isConnected !== false) return composer
  if (typeof document.querySelector !== 'function') return null
  try {
    return document.querySelector(COMPOSER_SELECTOR)
  } catch (error) {
    return null
  }
}

/**
 * Remember the element a focus landed on. It is the fallback for a host
 * whose box carries no marker, and the element the focus key will reach for
 * as long as it is still in the document.
 * @param {Element} node - the focused editor root.
 * @returns {void}
 */
function rememberComposer(node) {
  if (node && node.nodeType === 1) composer = node
}

/**
 * True when an element is a rich-text editor, i.e. the message box — and
 * deliberately not a plain field.
 *
 * The whole rule hangs off this narrow test. A settings panel or a sidebar
 * search that focuses its own input when it opens is the host's business;
 * only the box that swallows the scroll keys is worth taking the keyboard
 * from, and in this shell that is the one rich-text editor there is. A
 * field inside a modal is left alone as well, because a dialog is a shell
 * of its own and may hand out focus inside itself.
 * @param {Element|null} node - candidate element.
 * @returns {boolean} whether the element is the kind of box to protect.
 */
function isComposerEditor(node) {
  if (!node || node.nodeType !== 1) return false
  if (node.isContentEditable !== true) return false
  if (typeof node.closest !== 'function') return true
  try {
    return node.closest(MODAL_SELECTOR) === null
  } catch (error) {
    return true
  }
}

/**
 * Mark that the user just asked for the keyboard themselves, so the focus
 * arriving a beat later is theirs and must be left alone.
 * @returns {void}
 */
function noteFocusRequest() {
  focusRequest.pending = true
  // The user wants the keyboard after all, so a send that owed it back has
  // been overtaken: its probes are stale now, and must not pull the caret
  // out of the box the user has just asked for.
  handBack.token++
  if (focusRequest.timer) window.clearTimeout(focusRequest.timer)
  focusRequest.timer = window.setTimeout(function () {
    focusRequest.timer = 0
    focusRequest.pending = false
  }, FOCUS_REQUEST_MS)
}

/**
 * Drop a request the user has just superseded by doing something else.
 * Clicking a conversation a moment after clicking the box must not license
 * the box of the conversation being opened.
 * @returns {void}
 */
function clearFocusRequest() {
  if (focusRequest.timer) {
    window.clearTimeout(focusRequest.timer)
    focusRequest.timer = 0
  }
  focusRequest.pending = false
}

/**
 * True for a control a bare Space activates by itself. Such a control keeps
 * the key: pressing a focused button with Space is how the keyboard works,
 * and the focus key must not turn that into a jump to the message box.
 * @param {Element|null} node - the keydown target.
 * @returns {boolean} whether Space belongs to that control.
 */
function isActivating(node) {
  if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return false
  try {
    return node.closest(ACTIVATING_SELECTOR) !== null
  } catch (error) {
    return false
  }
}

/**
 * Put the keyboard in the message box: what the focus key is for.
 * @returns {boolean} whether a box was found and focused.
 */
function focusComposer() {
  var root = composerRoot()
  if (!root || typeof root.focus !== 'function') return false
  rememberComposer(root)
  noteFocusRequest()
  try {
    root.focus({ preventScroll: true })
  } catch (error) {
    root.focus()
  }
  return true
}

/**
 * True when the message box holds nothing the user put there.
 *
 * Read from the editor's own text, which is the same thing the shell reads
 * to decide whether to show its placeholder: an empty Lexical root is a
 * paragraph with a line break in it, so nothing typed reads as blank. A
 * reference the shell encodes into the draft (a mention, a chip) is a
 * character in that text, so a box holding one is not empty and keeps its
 * Space — which is what the shell does with its placeholder too.
 * @param {Element} root - the editor root.
 * @returns {boolean} whether nothing has been typed.
 */
function composerIsEmpty(root) {
  var text = root.textContent
  if (typeof text !== 'string') return false
  return text.trim() === ''
}

/**
 * The focus key pressed again, inside the box it put the caret in: hand the
 * keyboard back.
 *
 * The box is a place to pass through, and with nothing typed there is no
 * draft to protect, so a Space there would only be a stray character in a
 * message nobody started. Escape does the same job, but it is not always
 * available: while a turn is in flight the shell owns Escape and the plugin
 * deliberately leaves it alone, which is exactly when the user most wants
 * out of the box without touching anything. This key never reaches the
 * shell, so it is safe in every state — it gives focus back and nothing
 * else.
 *
 * Anything typed at all flips the answer: with a draft in the box the key
 * is an ordinary Space, as it must be.
 * @returns {boolean} whether the keyboard was handed back.
 */
function leaveEmptyComposer() {
  if (!settings.spaceBlurs) return false
  var root = composerRoot()
  if (!isComposerEditor(root)) return false
  var active = document.activeElement
  if (active !== root) {
    if (!active || typeof root.contains !== 'function' || !root.contains(active)) return false
  }
  if (!composerIsEmpty(root)) return false
  // The user is done with the box, so a request that put them in it is
  // spent: a host focus arriving a beat later must not undo this.
  clearFocusRequest()
  if (typeof active.blur === 'function') active.blur()
  return true
}

/**
 * True when a keystroke was aimed at the message box.
 *
 * `isComposerEditor` decides what counts as the box — a rich-text editor
 * outside any modal — and this asks whether the key landed in one, which
 * is not the same as being *on* its root: with the caret inside a chip or
 * a nested node, the event target sits below the root. Everything else —
 * the terminal, the task window's rename box, a plan editor, a setting
 * field — is not the box and keeps Enter exactly as the host made it.
 * @param {Element|null} node - the keydown target.
 * @returns {boolean} whether the key belongs to the composer.
 */
function inComposer(node) {
  var root = composerRoot()
  if (!isComposerEditor(root)) return false
  if (!node || node.nodeType !== 1) return false
  if (node === root) return true
  if (typeof root.contains !== 'function') return false
  try {
    return root.contains(node)
  } catch (error) {
    return false
  }
}

/**
 * True while a suggestion menu is waiting to be confirmed.
 *
 * The menu accepts its highlighted candidate on Enter, and it does so
 * later in the same event than this plugin — so intercepting the key
 * would turn "take this slash command" into a line break. Yielding here
 * costs nothing: a menu that cannot be confirmed by keyboard is worse
 * than a line break that has to be typed another way.
 * @returns {boolean} whether such a menu is on screen.
 */
function menuOpen() {
  if (typeof document.querySelector !== 'function') return false
  try {
    return document.querySelector(TRIGGER_MENU_SELECTOR) !== null
  } catch (error) {
    return false
  }
}

/**
 * True when this Enter is the second half of a double-Enter send.
 *
 * The pair is a rhythm, so the decision is made from the two presses alone:
 * the previous Enter was inside `DOUBLE_ENTER_MS`, the box still holds a
 * draft, and the key is not an auto-repeat — holding Enter must never send.
 * A menu open, an empty box, a composing key and a mode that is not
 * `double` are all handled before this is asked, so a `true` here means
 * exactly one thing: the user pressed Enter twice on purpose.
 *
 * The first press is never delayed: it breaks the line on the spot, and this
 * only decides what the second one does. That is what keeps the mode's
 * typing feel identical to `newline` until the moment it sends.
 * @param {KeyboardEvent} ev - the second Enter keydown.
 * @returns {boolean} whether it sends.
 */
function doubleEnterSends(ev) {
  if (ev.repeat) return false
  var root = composerRoot()
  var empty = composerIsEmpty(root)
  var previous = doubleEnter.at
  if (previous !== 0 && Date.now() - previous <= DOUBLE_ENTER_MS && !empty) {
    doubleEnter.at = 0
    return true
  }
  // A press that cannot be the first half of a pair — nothing in the box to
  // send — leaves no stamp behind. Otherwise Enter on an empty box followed
  // by a pasted draft and a second Enter would send a message the user
  // never confirmed with two presses.
  doubleEnter.at = empty ? 0 : Date.now()
  return false
}

/**
 * Send the draft by handing the host the key it already sends with.
 *
 * `Ctrl/Cmd+Enter` is the host's own accelerator, so a rewritten copy of it
 * is the whole send: no button to find, no message to rebuild, and the
 * draft is left exactly as the user typed it. This is the same trick
 * `breakLine` plays with `Shift+Enter`, and it is why the double-Enter mode
 * adds no send path of its own.
 *
 * The host's focus and the caret are untouched: the key is dispatched on the
 * editor root, which is where the host's own composer keymap listens.
 * @returns {void}
 */
function sendFromComposer() {
  var root = composerRoot()
  if (!isComposerEditor(root) || typeof root.dispatchEvent !== 'function') return
  var synth = null
  try {
    synth = new window.KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      shiftKey: false,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  } catch (error) {
    synth = null
  }
  if (!synth) return
  // Marked, because this copy bubbles back into the plugin's own capture
  // listener: without the flag the send would be read as a second bare
  // Enter and could start a pair of its own.
  try {
    synth[REWRITTEN_FLAG] = true
  } catch (error) {
    // A frozen event cannot be marked; the send still goes through.
  }
  try {
    root.dispatchEvent(synth)
  } catch (error) {
    if (state.debug) console.warn('[dsh-vim] could not hand the send to the box', error)
  }
}

/**
 * Give the keyboard back to the page after a send, without waiting for a
 * focus event that may never come.
 *
 * The editor holds DOM focus across a send — the host's own focus lands on
 * the element it is already on, which changes nothing and raises no
 * `focusin` — so `onFocusIn` has nothing to refuse and the caret would stay
 * in the box with every key swallowed by it. A `blur` this plugin issues
 * itself is the only way out, so this is what the send does: drop the
 * request the typing had armed, then probe.
 *
 * Each probe is a no-op unless the caret is still in the box, and both are
 * dropped the moment the user asks for the keyboard again — a click, a Tab,
 * the focus key, the first keystroke of the next message.
 * @returns {void}
 */
function handBackAfterSend() {
  var token = ++handBack.token
  for (var i = 0; i < SEND_HAND_BACK_MS.length; i++) {
    window.setTimeout(function () {
      if (token !== handBack.token) return
      if (focusRequest.pending) return
      var active = document.activeElement
      if (!inComposer(active)) return
      if (typeof active.blur === 'function') active.blur()
      if (state.debug) console.log('[dsh-vim] send: keyboard handed back to the page')
    }, SEND_HAND_BACK_MS[i])
  }
}

/**
 * Turn a bare Enter into the host's own line break.
 *
 * Nothing here edits the draft. The shell already knows how to break a
 * line: its composer keymap yields on `event.shiftKey === true` and lets
 * the editor's own line-break command through, which is a soft `<br>`
 * rather than a new paragraph. So the key is swallowed and a shift-flagged
 * copy is handed to the box in its place — the one path that reaches the
 * real thing instead of an imitation of it, and the reason a rewritten
 * key beats inserting text ourselves.
 *
 * A key the editor cannot be given one of becomes a swallowed key: losing
 * a line break is recoverable, while letting the original through would
 * send a half-written message.
 * @param {KeyboardEvent} ev - the original Enter keydown.
 * @returns {void}
 */
function breakLine(ev) {
  ev.preventDefault()
  var root = composerRoot()
  if (!isComposerEditor(root) || typeof root.dispatchEvent !== 'function') return
  var synth = null
  try {
    synth = new window.KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  } catch (error) {
    synth = null
  }
  if (!synth) return
  // Marked, for the same reason as the send above: this copy bubbles back
  // into the plugin's own capture listener, and an unmarked one would be
  // read there as a real Shift+Enter — which is exactly the keystroke that
  // ends a double-Enter pair.
  try {
    synth[REWRITTEN_FLAG] = true
  } catch (error) {
    // A frozen event cannot be marked; the line break still goes through.
  }
  try {
    root.dispatchEvent(synth)
  } catch (error) {
    if (state.debug) console.warn('[dsh-vim] could not hand the line break to the box', error)
  }
}

/**
 * Keep the message box from taking the keyboard on its own.
 *
 * The host focuses the composer from a render effect, keyed on the
 * conversation and on whether a run is in flight, so arriving anywhere —
 * first load, a switch, the end of a turn — used to land the caret in the
 * box and take d / e / f away until Escape. The focus is honoured only when
 * the user asked for it: a press inside a text field, a Tab, a keystroke
 * being typed, or this plugin's focus key. Anything else is given back to
 * the page, which is what keeps the scroll keys live on arrival.
 *
 * One arrival is the user's too, without being a gesture of theirs: the
 * window coming back to the front with the box focused, a beat before a
 * tool of theirs presses Ctrl+V into it. See `noteFocusReturn`.
 * @param {FocusEvent} ev - the focusin.
 * @returns {void}
 */
function onFocusIn(ev) {
  if (!settings.switchBlurs) return
  var target = ev.target
  if (!isComposerEditor(target)) return
  rememberComposer(target)
  if (focusRequest.pending) return
  if (justReturned()) return
  if (typeof target.blur === 'function') target.blur()
}

/**
 * Widen the licence to a focus arriving right after the window got the
 * front back.
 *
 * This is the half of the rule that keeps clipboard and dictation tools
 * working. They bring the window forward and then *type* Ctrl+V themselves,
 * so the caret has to be in the box when that key arrives — but the focus
 * that puts it there is not a click, just a side effect of coming back. The
 * two are told apart by where they sit in time: the shell's own render
 * effect focuses the box the moment the page is up, while a tool's focus
 * lands in the instant after the page regained focus.
 *
 * It only ever widens: a request the user made is untouched, and a focus
 * that arrives on its own long after the return is still given back.
 * @returns {void}
 */
function noteFocusReturn() {
  // Only the return is stamped; the licence itself is `justReturned`. Asking
  // for the keyboard here would widen it to a full `FOCUS_REQUEST_MS` window
  // and to every field on the page, which is exactly the "the box grabbed
  // the caret" behaviour this guard exists to stop.
  refocusAt = Date.now()
}

/**
 * Whether a focus arriving now is the tail of the window coming back.
 * @returns {boolean} true inside the grace period after a return.
 */
function justReturned() {
  return refocusAt !== 0 && Date.now() - refocusAt <= REFOCUS_GRACE_MS
}

export { doubleEnter, composerRoot, isComposerEditor, noteFocusRequest, clearFocusRequest, isActivating, focusComposer, composerIsEmpty, leaveEmptyComposer, inComposer, menuOpen, doubleEnterSends, sendFromComposer, handBackAfterSend, breakLine, onFocusIn, noteFocusReturn, rememberComposer }
