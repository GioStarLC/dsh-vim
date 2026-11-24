/**
 * Behavioural self-test for lib/client.js.
 *
 * Loads the real client bundle against a minimal fake DOM plus a virtual clock
 * (requestAnimationFrame + setTimeout), so the animation can be stepped
 * deterministically and its feel can be asserted without a browser. The fake
 * client context records the slot and locale contributions, so the settings
 * page registration is covered too.
 *
 * Run: node tools/selftest.mjs
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const BUNDLE = pathToFileURL(path.join(ROOT, 'lib', 'client.js')).href

// A `navigator` the suite owns.
//
// Node 24 publishes one of its own (`platform: 'MacIntel'` on a Mac), which
// turned "a machine with no platform reads as Ctrl" into a check whose result
// depended on which runtime ran it. The plugin reads only `language` and
// `platform`, so pinning both makes the whole suite a function of the code
// rather than of the host — and a Chinese host is what the labels are written
// against.
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: '', language: 'zh-CN' },
  configurable: true,
  writable: true,
})

// --- virtual clock ---------------------------------------------------------

// Virtual time starts at the real wall clock, so seeded timestamps (`ago(1)`)
// and the plugin's own `Date.now()` reads agree, and it is frozen: advancing a
// test advances both the timers and the wall clock the plugin reads.
let now = Date.now()
let seq = 0
const timers = []
const frames = []
const FRAME_MS = 16

const clock = {
  setTimeout(fn, ms) {
    const id = ++seq
    timers.push({ id, at: now + (Number(ms) || 0), fn })
    return id
  },
  clearTimeout(id) {
    const i = timers.findIndex((t) => t.id === id)
    if (i >= 0) timers.splice(i, 1)
  },
  requestAnimationFrame(fn) {
    const id = ++seq
    frames.push({ id, fn })
    return id
  },
  cancelAnimationFrame(id) {
    const i = frames.findIndex((f) => f.id === id)
    if (i >= 0) frames.splice(i, 1)
  },
  /**
   * Advance virtual time, firing due timers and one animation frame per slice.
   *
   * A slice nobody is watching is skipped rather than stepped: with no frame
   * queued, the only thing that can happen inside the span is a timer falling
   * due, so the clock jumps straight to it. That matters because a day is 5.4
   * million 16 ms slices and the history checks advance one; stepping them all
   * to reach the midnight they ask about is a way to run the suite out of
   * memory instead of filing a page.
   * @param {number} ms - milliseconds to advance.
   * @param {Function} [onSlice] - called after each slice, for sampling.
   */
  advance(ms, onSlice) {
    // Watching time is for animations, and an animation lasts seconds. A span
    // this wide with nothing queued is a check that wants the date to change,
    // not the frames in between: that is `jump`, and saying so beats running
    // five million slices until the heap gives out.
    if (frames.length === 0 && ms > 10 * 60 * 1000) {
      throw new Error(
        `clock.advance(${ms}) crosses ${Math.round(ms / 60000)} minutes with no animation queued: use clock.jump(${ms})`
      )
    }
    const end = now + ms
    let stuck = 0
    let turns = 0
    while (now < end) {
      const was = now
      // An advance that needs more than a million turns is not an animation any
      // more: it is something rescheduling itself just ahead of the clock, and
      // it has to fail the check that made it rather than run for hours.
      if (++turns > 1000000) {
        throw new Error(
          `clock.advance(${ms}) gave up after ${turns} turns: at +${now - was} ms of ${ms}, ` +
            `${timers.length} timers and ${frames.length} frames still queued`
        )
      }
      if (frames.length === 0) {
        // Something already due is not something to jump past: leave the clock
        // where it is and let the fire loop below take it.
        let next = end
        for (const t of timers) {
          if (t.at <= now) {
            next = now
            break
          }
          if (t.at < next) next = t.at
        }
        now = next
      } else {
        now = Math.min(now + FRAME_MS, end)
      }
      let guard = 0
      for (;;) {
        // The earliest due timer, scanned for rather than sorted into a fresh
        // array on every fire.
        let due = null
        for (const t of timers) if (t.at <= now && (due === null || t.at < due.at)) due = t
        if (due === null || ++guard > 500) break
        timers.splice(timers.indexOf(due), 1)
        due.fn()
      }
      const batch = frames.splice(0)
      for (const f of batch) f.fn(now)
      if (onSlice) onSlice()
      // A timer that keeps falling due behind the clock leaves it where it is,
      // and a walk that never moves is a bug in what is being tested: fail that
      // check with a word about it rather than let the heap fill up.
      if (now === was) {
        if (++stuck > 1000) {
          throw new Error(`clock.advance(${ms}) made no progress in ${stuck} turns: a timer is rescheduling itself`)
        }
      } else {
        stuck = 0
      }
    }
    now = end
  },

  /**
   * Cross a span nobody is watching, firing what fell due on the way once.
   *
   * `advance` is the honest way to watch time pass, and it pays for watching:
   * a board that keeps a running clock re-arms a 1.5 s tick, so crossing a day
   * with it means 57,600 ticks. A check that only needs the day to have turned
   * over says so here: the clock moves in one step, and every timer armed for
   * that span fires once, in the order it was armed.
   * @param {number} ms - milliseconds to cross.
   * @returns {void}
   */
  crossTo(end) {
    now = end
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)
    for (const t of due) {
      const i = timers.indexOf(t)
      if (i >= 0) timers.splice(i, 1)
      t.fn()
    }
    // Nothing watched the frames in that span, so none of them are owed.
    frames.length = 0
    now = end
  },

  /** Cross `ms` of time nobody watches: the one way a check changes the day. */
  jump(ms) {
    this.crossTo(now + ms)
  },

  /** Put the wall clock at `ts`, firing what fell due on the way once. */
  setNow(ts) {
    this.crossTo(ts)
  },
}

// The plugin reads wall time as well as timers (row clocks, "how long ago"),
// so the virtual clock drives `Date.now` too. Without this a clock built on
// Date.now would never move, however far a test advanced time.
Date.now = () => now

// --- fake DOM --------------------------------------------------------------

/**
 * A tiny stand-in for `Element.matches`, covering the handful of simple
 * selectors the plugin asks about: a tag, `.class` parts, and `[attr]` or
 * `[attr="value"]` parts, comma-separated. Nothing richer is needed, and a real
 * selector engine here would only hide what the plugin actually tests for.
 * @param {object} node - candidate element.
 * @param {string} selector - a simple selector list.
 * @returns {boolean} whether the element matches.
 */
function matches(node, selector) {
  if (!node || node.nodeType !== 1) return false
  return String(selector)
    .split(',')
    .some((part) => matchesSimple(node, part.trim()))
}

/** One simple selector, as described on `matches`. */
function matchesSimple(node, selector) {
  if (!selector) return false
  const tag = /^([a-zA-Z]+)/.exec(selector)
  if (tag && String(node.tagName).toLowerCase() !== tag[1].toLowerCase()) return false
  for (const cls of selector.match(/\.[\w-]+/g) ?? []) {
    if (!String(node.className).split(/\s+/).includes(cls.slice(1))) return false
  }
  for (const attr of selector.matchAll(/\[([\w-]+)(?:=("[^"]*"|'[^']*'|[^\]\s]+))?\]/g)) {
    const value = node.__attrs[attr[1]]
    if (value === undefined) return false
    if (attr[2] !== undefined && String(value) !== attr[2].replace(/^["']|["']$/g, '')) return false
  }
  return true
}

/** Build a fake element with the handful of DOM members the plugin touches. */
function el(opts = {}) {
  const node = {
    nodeType: 1,
    tagName: opts.tag ?? 'DIV',
    className: opts.className ?? '',
    isContentEditable: opts.editable === true,
    isConnected: true,
    value: opts.value ?? '',
    scrollTop: opts.scrollTop ?? 0,
    scrollHeight: opts.scrollHeight ?? 0,
    clientHeight: opts.clientHeight ?? 0,
    // A browser reports the width a box's content needs even while the box is
    // clipped to its column. A deterministic stand-in (8px per character) is
    // what lets the folder column being fitted to its widest name be asserted
    // here without a font engine.
    get scrollWidth() {
      return String(node.textContent).length * 8
    },
    parentElement: opts.parent ?? null,
    parentNode: opts.parent ?? null,
    // Where the browser would say this element sits. Only the message box needs
    // it, for the notice that floats above it.
    __rect: opts.rect ?? null,
    getBoundingClientRect() {
      return node.__rect ?? { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }
    },
    children: [],
    style: {},
    __overflowY: opts.overflowY ?? 'visible',
    __scrollBehavior: opts.scrollBehavior ?? 'auto',
    __attrs: {},
    __listeners: {},
    __selection: null,
    setAttribute(name, value) {
      node.__attrs[name] = String(value)
    },
    getAttribute(name) {
      return name in node.__attrs ? node.__attrs[name] : null
    },
    removeAttribute(name) {
      delete node.__attrs[name]
    },
    appendChild(child) {
      node.children.push(child)
      child.parentNode = node
      child.parentElement = node
      child.isConnected = true
      return child
    },
    removeChild(child) {
      const i = node.children.indexOf(child)
      if (i >= 0) node.children.splice(i, 1)
      child.parentNode = null
      child.parentElement = null
      child.isConnected = false
      return child
    },
    insertBefore(child, ref) {
      const i = ref ? node.children.indexOf(ref) : -1
      if (i >= 0) node.children.splice(i, 0, child)
      else node.children.push(child)
      child.parentNode = node
      child.parentElement = node
      child.isConnected = true
      return child
    },
    scrollIntoView() {},
    addEventListener(type, fn) {
      const handlers = node.__listeners[type] ?? (node.__listeners[type] = [])
      handlers.push(fn)
    },
    removeEventListener(type, fn) {
      const handlers = node.__listeners[type]
      if (!handlers) return
      const i = handlers.indexOf(fn)
      if (i >= 0) handlers.splice(i, 1)
    },
    focus() {
      domFocus(node)
    },
    blur() {
      fakeDocument.activeElement = body
    },
    select() {
      node.__selection = [0, String(node.value).length]
    },
    setSelectionRange(start, end) {
      node.__selection = [start, end]
    },
    closest(selector) {
      let cur = node
      while (cur) {
        if (matches(cur, selector)) return cur
        cur = cur.parentElement
      }
      return null
    },
    // The plugin asks a painted tree for its own seats — the panels it is
    // about to measure, the cards it is about to reveal. A descendant walk
    // with the simple selector engine above is all of `querySelectorAll`
    // it ever calls on a subtree.
    querySelectorAll(selector) {
      const out = []
      const seen = new Set()
      const walk = (n) => {
        // Same reason as `boardSeat`: a node reachable twice must be walked
        // once, or a shared subtree turns this into an unbounded walk.
        if (!n || seen.has(n)) return
        seen.add(n)
        for (const child of n.children || []) {
          if (matches(child, selector)) out.push(child)
          walk(child)
        }
      }
      walk(node)
      return out
    },
    contains(other) {
      let cur = other
      while (cur) {
        if (cur === node) return true
        cur = cur.parentElement
      }
      return false
    },
    getRootNode() {
      return { host: null }
    },
  }
  // Assigning textContent must drop the children, as the real DOM does.
  let text = ''
  Object.defineProperty(node, 'textContent', {
    get() {
      return node.children.length ? node.children.map((c) => c.textContent).join('') : text
    },
    set(value) {
      node.children.length = 0
      text = String(value)
    },
  })
  return node
}

/** Flow rows a check mounted into the transcript, taken down with the page. */
const arrivedRows = []

const transcript = el({ className: 'transcript', overflowY: 'auto', scrollHeight: 5000, clientHeight: 800 })
// The conversation's own body, as the shell marks it on a real page (the
// conversation skeleton renders `data-conversation-content` around its
// transcript and composer), so a check can press on the conversation itself
// rather than on a pane that merely sits where one would be.
transcript.setAttribute('data-conversation-content', '')
const sidebar = el({ className: 'sidebar', overflowY: 'auto', scrollHeight: 900, clientHeight: 700 })
const composer = el({ tag: 'TEXTAREA', className: 'composer', overflowY: 'auto', scrollHeight: 300, clientHeight: 100 })
const button = el({ tag: 'BUTTON', className: 'toolbar-button', parent: transcript })
const body = el({ tag: 'BODY' })
const root = el({ tag: 'HTML' })

// The message box: a rich-text editor root, which is what the host focuses on
// entry (the real one is Lexical's, hence the marker). It never scrolls by
// itself — the box around it does — so it stays out of every scroller pick.
const editor = el({ className: 'message-box', editable: true })
editor.setAttribute('data-lexical-editor', 'true')

// A dialog is a shell of its own: what it focuses inside itself is its business.
const modal = el({ tag: 'DIV' })
modal.setAttribute('role', 'dialog')
const modalEditor = el({ className: 'plan-editor', editable: true, parent: modal })

// Blurring a real element drops focus to the body, which is the whole point of
// the Escape gesture: the scroll keys are withheld from editables.
let blurCount = 0
composer.blur = () => {
  blurCount++
  fakeDocument.activeElement = body
}
// The message box counts its own refusals, and focuses through the same path a
// real `.focus()` takes, so a check can tell which element took the keyboard.
let editorBlurs = 0
editor.focus = () => domFocus(editor)
editor.blur = () => {
  editorBlurs++
  fakeDocument.activeElement = body
}
// The keys the plugin hands to the box in place of one it swallowed. Read by
// the send-mode checks, which is what proves the line-break gesture reaches
// the editor as a shift-flagged Enter rather than as inserted text.
//
// The replay below is the point, not a detail: a real `dispatchEvent` on the
// editor bubbles the event up to the plugin's own `window` capture listener, so
// a rewritten key genuinely re-enters the handler that made it. A fake that
// only recorded the event would miss that whole class of bug.
const synthKeys = []
editor.dispatchEvent = (ev) => {
  synthKeys.push(ev)
  replayKeydown(ev)
  return true
}

/**
 * Deliver a keydown the way the browser would: through the recorded listeners,
 * capture phase first. The event is completed in place, since a rewritten key
 * is a real `KeyboardEvent` and carries no `target` of its own.
 * @param {object} ev - the keydown to deliver.
 * @returns {void}
 */
function replayKeydown(ev) {
  if (!ev || ev.type !== 'keydown') return
  if (ev.target === undefined) ev.target = editor
  if (typeof ev.preventDefault !== 'function') ev.preventDefault = () => {}
  if (typeof ev.stopPropagation !== 'function') ev.stopPropagation = () => {}
  if (ev.defaultPrevented === undefined) ev.defaultPrevented = false
  const down = listeners.filter((l) => l.type === 'keydown')
  for (const l of down) if (l.capture) l.fn(ev)
  for (const l of down) if (!l.capture) l.fn(ev)
}

const listeners = []
function captureOf(opts) {
  return typeof opts === 'object' && opts !== null ? Boolean(opts.capture) : Boolean(opts)
}
function record(type, fn, opts) {
  listeners.push({ type, fn, capture: captureOf(opts) })
}
function unrecord(type, fn, opts) {
  const capture = captureOf(opts)
  const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture)
  if (i >= 0) listeners.splice(i, 1)
}

/**
 * Deliver a non-keyboard event to the recorded listeners, capture first.
 * @param {string} type - event type.
 * @param {object} ev - the event.
 * @returns {object} the event, after listeners had it.
 */
function fire(type, ev) {
  const matching = listeners.filter((l) => l.type === type)
  for (const l of matching) if (l.capture) l.fn(ev)
  for (const l of matching) if (!l.capture) l.fn(ev)
  return ev
}

/**
 * Focus an element the way the shell's render effect does: the element becomes
 * active and a focusin follows, with the blur count reset so the check can see
 * what the plugin did about it.
 * @param {object} node - the element taking focus.
 * @returns {void}
 */
function shellFocus(node) {
  fakeDocument.activeElement = node
  blurCount = 0
  fire('focusin', { type: 'focusin', target: node, relatedTarget: null })
}

/**
 * Focus an element the way calling `.focus()` on it does: the element becomes
 * active and a focusin follows, counts untouched.
 * @param {object} node - the element taking focus.
 * @returns {void}
 */
function domFocus(node) {
  fakeDocument.activeElement = node
  fire('focusin', { type: 'focusin', target: node, relatedTarget: null })
}

/**
 * Deliver an event to the handlers an element carries, as the DOM would.
 * @param {object} node - the element.
 * @param {string} type - event type.
 * @param {object} ev - the event.
 * @returns {object} the event, after the handlers had it.
 */
function fireOn(node, type, ev) {
  const handlers = (node.__listeners && node.__listeners[type]) || []
  for (const fn of handlers.slice()) fn(ev)
  return ev
}

/**
 * A click, delivered the way the DOM delivers one: from the element clicked up
 * to the canvas, stopping wherever a handler says so.
 *
 * The press path has its own walker (`pressForDrag`), because a press is what
 * the board's gesture layer reads. A click is what the controls inside a card
 * read - and the card itself answers one now, which is why the walk has to
 * exist: it is what proves a press meant for the conversation cannot land in a
 * field, and that a field's own press cannot be read as a request to open.
 * @param {object} node - the element clicked.
 * @param {object} [extra] - fields to fold into the event.
 * @returns {object} the event.
 */
function clickThrough(node, extra) {
  const ev = { type: 'click', button: 0, target: node, preventDefault() {}, ...extra }
  let cur = node
  while (cur) {
    let stopped = false
    fireOn(cur, 'click', { ...ev, stopPropagation() { stopped = true } })
    if (stopped || cur === body || !cur.parentNode) break
    cur = cur.parentNode
  }
  return ev
}

/**
 * Let every queued task run. The rename hop answers through a promise, so a
 * check that asserts on the result has to wait for the microtasks behind it.
 * @returns {Promise<void>} resolved once the queue has drained.
 */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** A deliberate press anywhere. */
function press(target) {
  fire('pointerdown', { type: 'pointerdown', target: target ?? body, button: 0 })
}

/** Minimal localStorage stand-in. */
const stored = new Map()
const fakeStorage = {
  // Set to prove what a full store does: every write throws until it is cleared.
  fail: false,
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => {
    if (fakeStorage.fail) {
      const error = new Error('the quota is exhausted')
      error.name = 'QuotaExceededError'
      throw error
    }
    stored.set(key, String(value))
  },
  removeItem: (key) => void stored.delete(key),
  clear: () => void stored.clear(),
}

/**
 * A minimal IndexedDB stand-in.
 *
 * The history is one record per day in a database of its own, and the suite has
 * to be able to file a page, read it back, and prove that a page it was not asked
 * to write is still exactly as it was. Only what the plugin asks for is here:
 * open, a store per name, get / put / delete / getAllKeys, and callbacks that run
 * on a microtask the way a browser's own do.
 */
const fakeDatabases = new Map()

/** One request, answered on a microtask. */
function fakeRequest() {
  const request = { result: undefined, error: null, onsuccess: null, onerror: null }
  request.answer = (value) => {
    queueMicrotask(() => {
      request.result = value
      if (typeof request.onsuccess === 'function') request.onsuccess({ target: request })
    })
    return request
  }
  return request
}

/** One store, keyed by its own keyPath so a date can be filed over. */
function fakeStoreApi(entry) {
  const keyOf = (value) => (entry.keyPath === 'k' ? value.k : value.date)
  return {
    get: (key) => fakeRequest().answer(entry.records.get(key)),
    getAllKeys: () => fakeRequest().answer([...entry.records.keys()]),
    put: (value) => {
      const key = keyOf(value)
      entry.records.set(key, value)
      return fakeRequest().answer(key)
    },
    delete: (key) => {
      entry.records.delete(key)
      return fakeRequest().answer(undefined)
    },
  }
}

const fakeIndexedDB = {
  open(name, version) {
    const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
    let db = fakeDatabases.get(name)
    if (!db) {
      db = { version: 0, stores: new Map() }
      fakeDatabases.set(name, db)
    }
    const wanted = Number(version) || 1
    const upgrade = wanted > db.version
    db.version = Math.max(db.version, wanted)
    const api = {
      objectStoreNames: { contains: (each) => db.stores.has(each) },
      createObjectStore(storeName, options) {
        const entry = { keyPath: (options && options.keyPath) || null, records: new Map() }
        db.stores.set(storeName, entry)
        return fakeStoreApi(entry)
      },
      transaction(storeNames) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames]
        const transaction = { error: null, onabort: null, oncomplete: null, onerror: null }
        transaction.objectStore = (storeName) => {
          if (!names.includes(storeName)) throw new Error('store not in this transaction: ' + storeName)
          const entry = db.stores.get(storeName)
          if (!entry) throw new Error('no such store: ' + storeName)
          return fakeStoreApi(entry)
        }
        return transaction
      },
      close() {},
      onversionchange: null,
    }
    queueMicrotask(() => {
      request.result = api
      if (upgrade && typeof request.onupgradeneeded === 'function') request.onupgradeneeded({ target: request })
      if (typeof request.onsuccess === 'function') request.onsuccess({ target: request })
    })
    return request
  },
}

let mediaReduce = false
const fakeWindow = {
  innerWidth: 1200,
  innerHeight: 900,
  localStorage: fakeStorage,
  indexedDB: fakeIndexedDB,
  URL: { createObjectURL: () => 'blob:history', revokeObjectURL: () => {} },
  FileReader: function () {
    this.readAsText = () => {}
  },
  addEventListener: record,
  removeEventListener: unrecord,
  setTimeout: clock.setTimeout,
  clearTimeout: clock.clearTimeout,
  requestAnimationFrame: clock.requestAnimationFrame,
  cancelAnimationFrame: clock.cancelAnimationFrame,
  matchMedia: () => ({ matches: mediaReduce }),
  // The line-break gesture is handed to the composer as a rewritten keydown, so
  // the checks need to see the copy — that is the whole claim the gesture
  // makes. Every key the fake constructs lands in `synthKeys`.
  KeyboardEvent: function (type, init) {
    return { type, keyCode: 0, isComposing: false, ...init }
  },
}

// The floating candidate list the shell renders for a slash command or an
// @-mention. It is the one thing that takes Enter away from the composer for
// a reason of its own, so a check has to be able to put it on screen.
const menu = el({ tag: 'DIV', className: 'menu' })
menu.setAttribute('data-trigger-menu', '')
let menuOnScreen = false

const fakeDocument = {
  body,
  documentElement: root,
  activeElement: body,
  createElement(tag) {
    return el({ tag: String(tag).toUpperCase() })
  },
  querySelectorAll() {
    return [transcript, sidebar, composer, editor, modalEditor, button, body, root]
  },
  querySelector(selector) {
    // The menu is asked about before anything else, because while it is up it
    // owns Enter; otherwise the only lookup is for the message box marker.
    if (menuOnScreen && matches(menu, selector)) return menu
    return matches(editor, selector) ? editor : null
  },
  elementFromPoint(x) {
    return paneAt(x)
  },
  addEventListener: record,
  removeEventListener: unrecord,
}

/**
 * Where the fake hit-test says the panes are: the sidebar owns the left strip,
 * the conversation the rest — the real layout, read left to right. A pointer at
 * x=120 is over the sidebar; the middle of the window (x=600) is over the
 * conversation, which is what the centre rule looks at.
 * @param {number} x - client x.
 * @returns {object} the pane at that point.
 */
function paneAt(x) {
  return x < 300 ? sidebar : transcript
}

/** The mounted task window's card, or null when no window is open. */
function cardNode() {
  const host = body.children[body.children.length - 1]
  return host && host.children[0] ? host.children[0] : null
}

/**
 * Point the fake hit-test at one pane, whatever the coordinates are, for checks
 * that are about something other than where the pointer is.
 * @param {object} node - the pane the pointer should be over.
 * @returns {void}
 */
function aimAt(node) {
  fakeDocument.elementFromPoint = () => node
}

/** Restore the layout-shaped hit-test the checks normally run against. */
function resetHitTest() {
  fakeDocument.elementFromPoint = (x) => paneAt(x)
}

globalThis.window = fakeWindow
globalThis.document = fakeDocument
globalThis.getComputedStyle = (node) => ({
  // An inline style is what the browser reports first: the windows this plugin
  // mounts style themselves, and a check that reads a column's scrollability is
  // reading exactly that declaration.
  overflowY: (node.style && node.style.overflowY) || node.__overflowY,
  scrollBehavior: node.__scrollBehavior,
})

/**
 * React stand-in. Function components are invoked (so their internals exist to
 * assert on) and every element created during a render is recorded in
 * `ReactStub.elements`, which is what the settings-page checks read.
 */
const ReactStub = {
  elements: [],
  // Effects and state setters are real for one render: a component that claims
  // to follow a change must actually be subscribed, or the only way to tell is
  // a component that never rebuilds its output.
  effects: [],
  setters: [],
  reset() {
    this.elements.length = 0
    for (const dispose of this.effects.splice(0)) {
      if (typeof dispose === 'function') dispose()
    }
    this.setters.length = 0
  },
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial
    const slot = this.setters.length
    this.setters.push(value)
    const self = this
    return [
      value,
      function (next) {
        self.setters[slot] = next
      },
    ]
  },
  useRef(value) {
    return { current: value === undefined ? null : value }
  },
  useEffect(fn) {
    // Run it now and keep its disposer: the subscription a component builds must
    // exist before the check that depends on it fires.
    const dispose = fn()
    if (typeof dispose === 'function') this.effects.push(dispose)
  },
  createElement(type, props, ...children) {
    const element = { type, props: props || {}, children: children.flat() }
    this.elements.push(element)
    if (typeof type === 'function') return type(props || {})
    return element
  },
}

/**
 * Render the registered settings section and return the elements it created.
 * @returns {Array<object>} every element created, in creation order.
 */
function settingsElements() {
  ReactStub.reset()
  ctx.log.sections[0].component({ t: (k) => k })
  return ReactStub.elements
}

/**
 * The rebindable-key rows on the settings page, by label.
 * @returns {object} label -> currently bound key.
 */
function keyBindings() {
  const found = {}
  for (const element of settingsElements()) {
    if (element.props.recordingText && typeof element.props.onSet === 'function') {
      found[element.props.label] = element.props.value
    }
  }
  return found
}

/**
 * The rendered option toggles of a choice row.
 * @param {Array<string>} [labels] - keep only buttons with these labels.
 * @returns {Array<object>} the button elements, in order.
 */
function choiceButtons(labels) {
  return settingsElements().filter(
    (e) =>
      e.type === 'button' &&
      typeof e.props.onClick === 'function' &&
      'aria-pressed' in e.props &&
      (!labels || labels.includes(e.children[0]))
  )
}

/** The place labels, in row order. */
const PLACE_LABELS = () => [expectedLabel('placeTop'), expectedLabel('placeCenter'), expectedLabel('placeBottom')]

function fakeRequire(specifier) {
  if (specifier === 'react') return ReactStub
  throw new Error(`unexpected require("${specifier}")`)
}

// --- fake host services -----------------------------------------------------

/**
 * Mutable stand-in for `ctx.sessions.list`, the real client snapshot store.
 * The shape mirrors what dsh-api-session-controller publishes: an ordered id
 * list plus a summary per id, with `updatedAt` for recency.
 */
const feed = {
  ids: [],
  byId: {},
  listeners: [],
  getSnapshot() {
    return { ids: this.ids, byId: this.byId, phase: 'ready' }
  },
  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  },
  /** Publish a new catalogue and notify subscribers, as the real store does. */
  publish(ids, byId) {
    this.ids = ids
    this.byId = byId
    for (const listener of this.listeners.slice()) listener()
  },
  clear() {
    this.ids = []
    this.byId = {}
    this.listeners.length = 0
  },
}

/**
 * Mutable stand-in for `ctx.workspaces.list`, the registry that owns the
 * archive set and the Workspace records. Mirrors the real client model: a
 * snapshot of `{ items, archivedSessionIds, pinnedSessionIds, state }` plus a
 * subscription. Each item carries the `sessionIds` it accounts for, which is
 * where a row's folder comes from.
 */
const registry = {
  archivedSessionIds: [],
  items: [],
  listeners: [],
  getSnapshot() {
    return {
      items: this.items,
      archivedSessionIds: this.archivedSessionIds,
      pinnedSessionIds: [],
      state: 'idle',
    }
  },
  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  },
  /**
   * Publish a registry change and notify subscribers.
   * @param {Array<string>} archivedSessionIds - the complete archive set.
   * @param {Array<object>} [items] - Workspace records, when they change too.
   */
  publish(archivedSessionIds, items) {
    this.archivedSessionIds = archivedSessionIds
    if (items !== undefined) this.items = items
    for (const listener of this.listeners.slice()) listener()
  },
  clear() {
    this.archivedSessionIds = []
    this.items = []
    this.listeners.length = 0
  },
}

/**
 * Stand-in for the session controller's create/prompt pair, the host hops a
 * new conversation goes through. `create` answers the next queued id and
 * records the request; `prompt` is reached through the same retained binding
 * the rename hop hands out, so the two fakes agree about what a session is.
 */
const newSessions = {
  calls: [],
  prompts: [],
  results: [],
  create(options) {
    this.calls.push(options)
    const next = this.results.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next || 'new-session')
  },
  clear() {
    this.calls.length = 0
    this.prompts.length = 0
    this.results.length = 0
  },
}

/**
 * Stand-in for the session controller's rename hop: `sessions.using(id, {
 * source }, operation)` retains the session, hands the operation a binding, and
 * releases it. Records what was asked for, so a check can prove the plugin used
 * its own source rather than `mainView`, and answers with `result`. The same
 * binding carries `prompt`, which is the other operation the board performs on
 * a retained conversation.
 */
const renames = {
  calls: [],
  result: { ok: true, value: { title: '', seq: 1 } },
  using(id, options, operation) {
    renames.calls.push({ id, source: options && options.source, title: null })
    const call = renames.calls[renames.calls.length - 1]
    const reference = {
      binding: {
        session: {
          rename(title) {
            call.title = title
            return renames.result
          },
          prompt(content, mode) {
            newSessions.prompts.push({ id, source: options && options.source, content, mode })
            return Promise.resolve({ ok: true, value: { accepted: true } })
          },
        },
      },
      release() {},
    }
    return Promise.resolve(operation(reference))
  },
  clear() {
    renames.calls.length = 0
    renames.result = { ok: true, value: { title: '', seq: 1 } }
  },
}

/**
 * Mutable stand-in for `ctx.uiSession.sessionStatus`, the shell's unified status
 * source: a Map of sessionId -> { running, pendingInteraction, completionUnread }.
 */
const statusFeed = {
  map: new Map(),
  listeners: [],
  getSnapshot() {
    return this.map
  },
  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  },
  /** Publish a status for one session and notify subscribers. */
  put(sessionId, status) {
    this.map.set(sessionId, status)
    for (const listener of this.listeners.slice()) listener()
  },
  clear() {
    this.map.clear()
    // A data change never drops subscribers in the real service, so this
    // stand-in must not drop them either: the plugin watches run transitions
    // for the whole life of the page, and a reset that unsubscribed it would
    // hide every clock the watch exists to take.
    for (const listener of this.listeners.slice()) listener()
  },
}

/**
 * Mutable stand-in for `ctx.uiSession.adapter.current`, the shell's own answer
 * to "which conversation is the main view showing": a host observable whose
 * value carries the session id, notified whenever the main view moves.
 */
const currentBinding = {
  key: undefined,
  listeners: [],
  getSnapshot() {
    return { key: this.key }
  },
  subscribe(listener) {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  },
  /** Publish the conversation the main view now retains, as opening one does. */
  open(sessionId) {
    this.key = sessionId
    for (const listener of this.listeners.slice()) listener()
  },
  /** Let go of the main view, as leaving for the board or the home page does. */
  clear() {
    if (this.key === undefined) return
    this.key = undefined
    for (const listener of this.listeners.slice()) listener()
  },
}

/**
 * Mutable stand-in for `ctx.modelDirectories`: one session's shared model
 * directory, the same object the composer's own Effort row reads and writes.
 * `publish()` says what the host has selected and what the adapter publishes for
 * that model; `offer()` says which models the catalog advertises; `select()`
 * records what the plugin submitted, in the shape the real directory sends on.
 * A held submit stays in flight until `settle()`.
 */
const MODEL = {
  /** The selection the host reports as current. */
  current: null,
  /** The adapter's reasoning metadata for that model; null = no Effort row. */
  reasoning: null,
  /** The selection an in-flight submit is holding, as the real store does. */
  pending: null,
  /** Provider groups the catalog advertises, in the host's own shape. */
  groups: [],
  /** Providers whose catalog query failed, listed beside the groups. */
  failures: [],
  /** How many times the shared catalog was read, so a check can prove a read. */
  catalogReads: 0,
  /** Outcomes for the next submits; empty means the host accepts. */
  results: [],
  /** Every selection submitted, in order. */
  calls: [],
  /** Whether submits stay in flight until the check settles them. */
  hold: false,
  held: null,
  /**
   * The resolver's own shared catalog, which the settings page reads without a
   * session — the same object every session directory points at.
   */
  catalog: {
    load: () => {
      MODEL.catalogReads++
      return Promise.resolve({ groups: MODEL.groups, failures: MODEL.failures })
    },
    reasoningFor: () => MODEL.reasoning || undefined,
  },
  directoryFor() {
    return {
      load: () => Promise.resolve(MODEL.snapshot()),
      store: { getSnapshot: () => MODEL.snapshot() },
      catalog: MODEL.catalog,
      select: (selection) => MODEL.submit(selection),
    }
  },
  /** The directory snapshot the real store publishes for one session. */
  snapshot() {
    return {
      current: MODEL.current,
      pending: MODEL.pending,
      groups: MODEL.groups,
      failures: MODEL.failures,
      status: 'ready',
    }
  },
  submit(selection) {
    MODEL.calls.push(selection)
    MODEL.pending = selection
    const result = MODEL.results.length ? MODEL.results.shift() : { ok: true, value: undefined }
    const settle = () => {
      MODEL.pending = null
      if (result.ok) MODEL.current = selection
      return result
    }
    if (MODEL.hold) {
      return new Promise((resolve) => {
        MODEL.held = () => resolve(settle())
      })
    }
    return Promise.resolve(result).then(settle)
  },
  /** Let the submit that is being held settle. */
  settle() {
    const run = MODEL.held
    MODEL.held = null
    if (run) run()
  },
  /**
   * Say what the host has selected, and what the adapter publishes for it. No
   * metadata at all is the ordinary case for a model with no Effort row.
   * @param {object} current - the selection in effect.
   * @param {object|null} [reasoning] - reasoning metadata, omitted for none.
   */
  publish(current, reasoning) {
    MODEL.current = current
    MODEL.reasoning = reasoning === undefined ? null : reasoning
  },
  /**
   * Say which models the catalog advertises. Each model carries the same
   * reasoning metadata shape the host publishes per model.
   * @param {Array} groups - provider groups.
   * @param {Array} [failures] - providers whose query failed.
   */
  offer(groups, failures = []) {
    MODEL.groups = groups
    MODEL.failures = failures
  },
  clear() {
    MODEL.current = null
    MODEL.reasoning = null
    MODEL.pending = null
    MODEL.groups = []
    MODEL.failures = []
    MODEL.results.length = 0
    MODEL.calls.length = 0
    MODEL.hold = false
    MODEL.held = null
  },}

/** Reasoning metadata shaped exactly like the host's adapter descriptor. */
const REASONING = {
  defaultEffort: 'medium',
  efforts: [
    { id: 'low', name: '低' },
    { id: 'medium', name: '中' },
    { id: 'high', name: '高' },
  ],
}

/**
 * Stand-in for the shell's per-session projection store, reached the way the
 * plugin reaches it: retain a scope under a private source, read a projection
 * face, release. Records the sources it was asked for so a test can prove the
 * plugin never retains as the main view, and which references are still held.
 */
const projections = {
  values: new Map(),
  listeners: new Map(),
  sources: [],
  live: new Set(),
  faceOf(key) {
    return {
      getSnapshot: () => this.values.get(key),
      subscribe: (listener) => {
        const set = this.listeners.get(key) || new Set()
        set.add(listener)
        this.listeners.set(key, set)
        return () => set.delete(listener)
      },
    }
  },
  /** Publish a projection value and notify its face. */
  put(key, value) {
    this.values.set(key, value)
    for (const listener of [...(this.listeners.get(key) || [])]) listener()
  },
  /** Retain a session scope; the plugin must release the returned reference. */
  retainScope(id, source) {
    this.sources.push(source)
    this.live.add(id)
    const owner = this
    return {
      binding: { session: { projections: this } },
      release() {
        owner.live.delete(id)
      },
    }
  },
  clear() {
    this.values.clear()
    this.listeners.clear()
    this.sources.length = 0
    this.live.clear()
  },
}

/**
 * Stand-in for the session controller's `fork`: the host hop the board's fork
 * mark and the sidebar shortcut both go through. It answers with the next queued
 * child id and records what it was asked to fork, so a check can prove the board
 * asked for the conversation it drew and drew the line it got back.
 */
const forks = {
  calls: [],
  results: [],
  fork(options) {
    this.calls.push(options)
    const next = this.results.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next || 'forked')
  },
  clear() {
    this.calls.length = 0
    this.results.length = 0
  },
}

/** Session ids the plugin asked the workspace navigator to open. */
const opened = []

/**
 * Stand-in for `uiWorkspace.archiveSession`, the host's own archive action.
 *
 * It enforces the two host facts this plugin's design turns on, rather than
 * accepting whatever it is given: a session with work in flight is refused with
 * `workspace/session-active` unless the caller passes `stopActivity`, and the
 * refusal carries the same `rpcError` shape the real `WorkspaceArchiveError`
 * does. A stub that always succeeded would let the plugin pass a test while
 * stopping a running turn in the real app.
 */
const archives = {
  calls: [],
  /** Session ids that must be refused as busy, and whether they were stopped. */
  active: new Set(),
  stopped: [],
  /** Set to a rejection to make the next call fail, whatever the id. */
  failure: null,
  reset() {
    this.calls.length = 0
    this.active.clear()
    this.stopped.length = 0
    this.failure = null
  },
  /**
   * Archive one session, as the host would.
   * @param {string} sessionId - the session to archive.
   * @param {object} [options] - `{ stopActivity }`.
   * @returns {Promise<{archivedSessionIds: Array<string>}>} the new archive set.
   */
  archiveSession(sessionId, options = {}) {
    this.calls.push({ sessionId, stopActivity: options.stopActivity === true })
    if (this.failure) return Promise.reject(this.failure)
    if (this.active.has(sessionId)) {
      if (options.stopActivity === true) this.stopped.push(sessionId)
      else {
        const error = new Error('workspace session archive failed: workspace/session-active')
        error.name = 'WorkspaceArchiveError'
        error.rpcError = {
          code: 'workspace/session-active',
          message: 'session has activity',
          details: { sessionId, activity: [{ family: 'turn', id: 't1', label: 'a running turn' }] },
        }
        return Promise.reject(error)
      }
    }
    registry.publish(registry.archivedSessionIds.concat([sessionId]))
    return Promise.resolve({ archivedSessionIds: registry.archivedSessionIds.slice() })
  },
}

/** A fake client context that records slot and locale contributions. */
function makeCtx(options = {}) {
  const withServices = options.services !== false
  const withRegistry = options.registry !== false
  const log = { injected: [], sections: [], locales: [], cleanups: [], slots: {} }
  const ctx = {
    log,
    effect(fn) {
      const disposer = fn()
      if (typeof disposer === 'function') log.cleanups.push(disposer)
      return () => {}
    },
    get(name) {
      if (name === 'slots') return ctx.slots
      if (name === 'locale') return ctx.locale
      if (withServices && name === 'sessions') {
        return options.projections === false
          ? { list: feed }
          : {
              list: feed,
              retainScope: projections.retainScope.bind(projections),
              create: newSessions.create.bind(newSessions),
              using: renames.using,
              fork: forks.fork.bind(forks),
            }
      }
      if (withServices && withRegistry && name === 'workspaces') return { list: registry }
      if (withServices && options.model !== false && name === 'modelDirectories') {
        return options.model === null ? undefined : { directoryFor: MODEL.directoryFor, catalog: MODEL.catalog }
      }
      if (withServices && options.sessionStatus !== false && name === 'uiSession') {
        return { sessionStatus: statusFeed, adapter: { current: currentBinding } }
      }
      if (withServices && name === 'uiWorkspace') {
        return {
          openSession(id) {
            opened.push(id)
          },
          archiveSession: archives.archiveSession.bind(archives),
        }
      }
      return undefined
    },
    slots: {
      inject(name, callback) {
        log.injected.push(name)
        return callback()
      },
      register(spec, component) {
        // Registered contributions are kept under their own slot name, so a
        // check can render the composer dock without the settings section being
        // in the way — and so a plugin that registered twice into one slot is
        // visible as two entries rather than silently overwriting.
        log.slots[spec.name] = log.slots[spec.name] ?? []
        log.slots[spec.name].push({ spec, component })
        if (spec.name === 'settings.section') log.sections.push({ spec, component })
        return () => {}
      },
    },
    locale: {
      register(namespace, dictionaries) {
        log.locales.push({ namespace, dictionaries })
        return () => {}
      },
    },
  }
  return ctx
}

// --- load the real bundle --------------------------------------------------

let captured = null
fakeWindow.__ModuleLoader__ = {
  load({ id, factory }) {
    captured = { id, exports: factory(fakeRequire) }
  },
}

/**
 * Import the bundle and return its exports.
 * @param {string} suffix - cache-busting query, for the reload check.
 * @returns {Promise<object>} the client plugin namespace.
 */
async function loadBundle(suffix = '') {
  captured = null
  await import(BUNDLE + suffix)
  assert.ok(captured, 'bundle must register itself with window.__ModuleLoader__')
  assert.equal(captured.id, 'dsh-vim')
  const exports = captured.exports
  if (typeof exports.apply === 'function') {
    const apply = exports.apply
    exports.apply = function (ctx) {
      // One page has one plugin: a reload or a second mount lets go of the
      // instance before it, so no handler and no watch answers twice.
      for (const dispose of applied.splice(0)) {
        if (typeof dispose === 'function') dispose()
      }
      const mark = ctx.log.cleanups.length
      const result = apply(ctx)
      currentDisposer = ctx.log.cleanups[mark]
      applied.push(currentDisposer)
      return result
    }
  }
  return exports
}

const applied = []
let currentDisposer = null
let recoveries = 0
let client = await loadBundle()
assert.equal(typeof client.apply, 'function', 'client bundle must export apply()')
assert.deepEqual(client.inject, ['slots', 'locale'], 'the client plugin must inject slots and locale')

let ctx = makeCtx()
client.apply(ctx)
currentDisposer = applied[applied.length - 1]
assert.ok(fakeWindow.__dshVim, 'apply() must expose the debug API')
let cleanup = function () {
  if (typeof currentDisposer === 'function') currentDisposer()
}
assert.equal(typeof cleanup, 'function', 'apply() must register a disposer')

// --- dispatch helpers ------------------------------------------------------

/** Dispatch a keydown through the installed capture listener. */
function keydown(key, opts = {}) {
  let prevented = false
  const ev = {
    key,
    // In a real browser a keydown's target is whatever holds focus, so the
    // fake ties them together unless a test says otherwise.
    target: opts.target ?? fakeDocument.activeElement ?? body,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    defaultPrevented: false,
    preventDefault() {
      prevented = true
    },
    stopPropagation() {},
    ...opts,
  }
  // Real phase order: capture listeners first, so a bubble-phase listener
  // genuinely sees what an inner handler already did to the event.
  const down = listeners.filter((l) => l.type === 'keydown')
  for (const l of down) if (l.capture) l.fn(ev)
  for (const l of down) if (!l.capture) l.fn(ev)
  return prevented
}

/** Dispatch a keyup. */
function keyup() {
  for (const l of listeners.slice()) if (l.type === 'keyup') l.fn({})
}

/** Dispatch a wheel event, as a user grabbing the wheel would. */
function wheel() {
  for (const l of listeners.slice()) if (l.type === 'wheel') l.fn({})
}

/**
 * Move the pointer, as the browser does on every mouse move.
 * @param {number} x - client x.
 * @param {number} y - client y.
 * @returns {void}
 */
function movePointer(x, y) {
  fire('pointermove', { type: 'pointermove', clientX: x, clientY: y })
}

/** Blur the window, the way switching to another application does. */
function blurWindow() {
  for (const l of listeners.slice()) if (l.type === 'blur') l.fn({})
}

/** The page getting the front back, as the browser reports it. */
function refocusWindow() {
  for (const l of listeners.slice()) if (l.type === 'focus') l.fn({})
}

/** Press and release without waiting for auto-repeat. */
function tap(key, opts) {
  const prevented = keydown(key, opts)
  keyup()
  return prevented
}

/**
 * The full shipped preference set, for whole-object asserts.
 *
 * This is a hand-written mirror of `DEFAULTS` in `lib/client.js`, and a mirror
 * is only honest while someone remembers it. Two things keep it honest: the
 * `reset()` check below compares against it, so a preference added to the
 * plugin without a line here fails loudly, and `shippedDefaultsAreComplete()`
 * states the same fact as its own check rather than leaving it to be noticed.
 *
 * Adding a preference: add it here too. The failure will tell you.
 */
const SHIPPED = {
  downKey: 'd',
  upKey: 'e',
  focusKey: ' ',
  effortKey: 'q',
  modelKey: 'w',
  modelLevelKey: 'Tab',
  boardKey: 'j',
  noteKey: 'n',
  pinKey: 'i',
  paletteKey: 'f',
  paletteRenameKey: 'r',
  paletteUpKey: 'e',
  paletteDownKey: 'd',
  paletteEnterKey: 'o',
  paletteStageKey: 's',
  paletteArchiveKey: 'g',
  paletteFont: 13,
  palettePlace: 'top',
  paletteWidth: 900,
  paletteHeight: 82,
  paletteRow: 7,
  step: 140,
  tau: 60,
  repeatDelay: 240,
  escapeBlurs: true,
  spaceBlurs: true,
  switchBlurs: true,
  sendBlurs: true,
  sendMode: 'host',
  snapshotKeepDays: 3650,
  autoRename: true,
  favorites: [],
}

/**
 * The label the settings page will show for a dictionary key, resolved the way
 * the plugin resolves it. Reading it back out of the registered dictionary
 * also proves the key exists in both languages.
 * @param {string} key - dictionary key.
 * @returns {string} the label under the harness locale.
 */
function expectedLabel(key) {
  const dictionaries = ctx.log.locales[0].dictionaries
  const lang = (globalThis.navigator && globalThis.navigator.language) || ''
  const table = /^zh/i.test(lang) ? dictionaries.zh : dictionaries.en
  assert.ok(table[key], `the ${lang} dictionary is missing "${key}"`)
  assert.ok(dictionaries.en[key], `the en dictionary is missing "${key}"`)
  return table[key]
}

let checks = 0
// The most heap any one check left behind, and which check it was: an OOM
// should name the check that grew, not just kill the process.
const peak = { heap: 0, label: '' }

/**
 * Put every piece of shared state back where a check expects it, so no check
 * depends on what the one before it left behind.
 * @returns {void}
 */
async function reset() {
  const live = fakeWindow.__dshVim
  if (live && typeof live.stop === 'function') live.stop()
  if (!fakeWindow.__dshVim) {
    client = await loadBundle('?recover=' + (++recoveries))
    ctx = makeCtx()
    const mark = ctx.log.cleanups.length
    client.apply(ctx)
    currentDisposer = ctx.log.cleanups[mark]
  }
  // A check is a page of its own, so neither a timer nor a frame that the one
  // before it left queued may fire into it. A stale frame is not merely late:
  // it is called back once per slice of every later advance, so one animation
  // left behind made every check after it pay for it.
  timers.length = 0
  frames.length = 0
  // The history lives as long as the page does, and a check is not a page: it
  // starts from no steps so that "nothing to take back" means it.
  // A check starts with no window open: the page's run watch is the only
  // status subscription that may outlive the page before it.
  if (statusFeed.listeners.length > 1) statusFeed.listeners.splice(0, statusFeed.listeners.length - 1)
  fakeWindow.__dshVim.clearHistory()
  // Every check starts from the shipped bindings, so none depends on a
  // previous one having left the preferences where it found them.
  fakeWindow.__dshVim.reset()
  feed.clear()
  registry.clear()
  archives.reset()
  statusFeed.clear()
  projections.clear()
  renames.clear()
  newSessions.clear()
  forks.clear()
  MODEL.clear()
  // The board's arrangement is stored, and a check that files a card must not
  // hand the next one a board it did not build. Found by shape: the settings key
  // is the one storage entry a check may not clear wholesale.
  for (const key of [...stored.keys()]) if (key.includes('/board/')) stored.delete(key)
  // The notes are the reader's own words rather than an arrangement, but a
  // check that writes one must not hand the next one a line it did not write:
  // "nothing is filed" is an assertion that needs an empty store to mean it.
  for (const key of [...stored.keys()]) if (key.includes('/notes/')) stored.delete(key)
  // The day boundary keeps its own keys, and its pages in a database: a check
  // that files a day must not hand the next one a page it did not write.
  for (const key of [...stored.keys()]) if (key.includes('/history/')) stored.delete(key)
  for (const db of fakeDatabases.values()) {
    for (const entry of db.stores.values()) entry.records.clear()
  }
  fakeStorage.fail = false
  opened.length = 0
  transcript.scrollTop = 0
  sidebar.scrollTop = 0
  composer.scrollTop = 0
  blurCount = 0
  editorBlurs = 0
  fakeDocument.activeElement = body
  fakeDocument.execCommand = undefined
  menuOnScreen = false
  synthKeys.length = 0
  mediaReduce = false
  // The message box and its marker are fixtures: a check that removes them to
  // prove a fallback has to find them back where it left them.
  editor.isConnected = true
  editor.isContentEditable = true
  editor.__rect = null
  composer.__rect = null
  for (const row of arrivedRows.splice(0)) if (row.parentNode) row.parentNode.removeChild(row)
  transcript.__rect = null
  transcript.scrollHeight = 5000
  transcript.clientHeight = 800
  // The main view is back on its own page; the entry watch must see a fresh
  // arrival rather than a conversation the last check left on screen.
  currentBinding.clear()
  // Same lookup as the document's own, kept in step with it: the menu is asked
  // about first, and the message box marker second.
  fakeDocument.querySelector = (selector) =>
    (menuOnScreen && matches(menu, selector) ? menu : null)
    ?? (matches(editor, selector) ? editor : null)
    ?? (matches(transcript, selector) ? transcript : null)
  // The pointer is part of the plugin's state, so it is reset with the rest:
  // a blur forgets the remembered point, and the layout-shaped hit-test leaves
  // the centre rule looking at the conversation, exactly as it always did.
  blurWindow()
  resetHitTest()
}

/**
 * Take the page down and prove it went.
 *
 * A check is a page: it opens windows, writes cards and leaves timers armed.
 * The next check must inherit none of that, and "must not" is not something to
 * keep in a hand-written list - `reset` grew one, and it silently missed the
 * clock's own queues. So the teardown is total here, and a window the plugin
 * was stopped from taking down is a failure carrying the check's name rather
 * than a slow leak a hundred checks later.
 * @param {string} label - the check that just ran.
 * @returns {void}
 */
function finish(label) {
  const mounted = body.children.length
  // A check that disposed the plugin itself has already done the work, and
  // taken the api with it.
  const api = fakeWindow.__dshVim
  if (api && typeof api.stop === 'function') api.stop()
  const left = body.children.length
  timers.length = 0
  frames.length = 0
  const used = process.memoryUsage().heapUsed
  if (used > peak.heap) {
    peak.heap = used
    peak.label = label
  }
  assert.equal(left, 0, `"${label}" left ${left} of ${mounted} nodes on the page after the plugin was stopped`)
}

/** Registered checks, in the order the suites declared them. */
const queue = []

/** Register a manual block that manages its own state and counting. */
function step(fn) {
  queue.push({ raw: fn })
}

/** Run one synchronous check against a clean state, and leave one behind. */
function check(label, fn) {
  queue.push({ label, fn, async: false })
}

/**
 * Run one check that has to wait for the host hop behind a rename. The plugin
 * answers through a promise, so the assertion cannot be made in the same tick.
 */
function checkAsync(label, fn) {
  queue.push({ label, fn, async: true })
}

/**
 * Run every registered check in order. One check is one page: the shared
 * state is reset before each, and a red check stops the run with its label.
 * @returns {Promise<void>}
 */
async function runChecks() {
  for (const item of queue) {
    if (item.raw) {
      await item.raw()
      continue
    }
    await reset()
    await item.fn()
    finish(item.label)
    checks++
    console.log(`  ok  ${item.label}`)
  }
}

/** Count one check the suite runs by hand, past the helpers. */
function bumpChecks() {
  checks++
}

/** Pin the harness clock: a check that crosses midnight sets one. */
function setNow(v) {
  now = v
}

/** Set the media preference the reduced-motion checks read. */
function setMediaReduce(v) {
  mediaReduce = v
}

/** Set whether a suggestion menu owns Enter. */
function setMenuOnScreen(v) {
  menuOnScreen = v
}


export { ROOT, BUNDLE, now, seq, timers, frames, FRAME_MS, clock, matches, matchesSimple, el, arrivedRows, transcript, sidebar, composer, button, body, root, editor, modal, modalEditor, blurCount, editorBlurs, synthKeys, replayKeydown, listeners, captureOf, record, unrecord, fire, shellFocus, domFocus, fireOn, clickThrough, flush, press, stored, fakeStorage, fakeDatabases, fakeRequest, fakeStoreApi, fakeIndexedDB, mediaReduce, fakeWindow, menu, menuOnScreen, fakeDocument, paneAt, cardNode, aimAt, resetHitTest, ReactStub, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, fakeRequire, feed, registry, newSessions, renames, statusFeed, currentBinding, MODEL, REASONING, projections, forks, opened, archives, makeCtx, captured, loadBundle, client, ctx, cleanup, keydown, keyup, wheel, movePointer, blurWindow, refocusWindow, tap, SHIPPED, expectedLabel, checks, peak, reset, finish, check, checkAsync, runChecks, step, bumpChecks, setNow, setMediaReduce, setMenuOnScreen }
