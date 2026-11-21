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

const ROOT = path.resolve(import.meta.dirname, '..')
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
  return captured.exports
}

const client = await loadBundle()
assert.equal(typeof client.apply, 'function', 'client bundle must export apply()')
assert.deepEqual(client.inject, ['slots', 'locale'], 'the client plugin must inject slots and locale')

const ctx = makeCtx()
client.apply(ctx)
assert.ok(fakeWindow.__dshVim, 'apply() must expose the debug API')
let cleanup = ctx.log.cleanups[0]
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
function reset() {
  fakeWindow.__dshVim.stop()
  // A check is a page of its own, so neither a timer nor a frame that the one
  // before it left queued may fire into it. A stale frame is not merely late:
  // it is called back once per slice of every later advance, so one animation
  // left behind made every check after it pay for it.
  timers.length = 0
  frames.length = 0
  // The history lives as long as the page does, and a check is not a page: it
  // starts from no steps so that "nothing to take back" means it.
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

/** Run one synchronous check against a clean state, and leave one behind. */
function check(label, fn) {
  reset()
  fn()
  finish(label)
  checks++
  console.log(`  ok  ${label}`)
}

/**
 * Run one check that has to wait for the host hop behind a rename. The plugin
 * answers through a promise, so the assertion cannot be made in the same tick.
 */
async function checkAsync(label, fn) {
  reset()
  await fn()
  finish(label)
  checks++
  console.log(`  ok  ${label}`)
}

// --- feel: easing, not teleporting ----------------------------------------

check('a press does not teleport: it glides to the target', () => {
  tap('d')
  assert.equal(transcript.scrollTop, 0, 'nothing may move synchronously')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'the glide must land exactly on one step')
})

check('the glide is progressive across frames (>=5 distinct samples)', () => {
  tap('d')
  const samples = []
  clock.advance(400, () => samples.push(transcript.scrollTop))
  const distinct = [...new Set(samples)]
  assert.ok(distinct.length >= 5, `expected a progressive glide, got ${distinct.length} distinct samples`)
  assert.ok(distinct[0] > 0 && distinct[0] < 140, 'the first frame must be a partial move')
  assert.equal(distinct[distinct.length - 1], 140)
  const steps = distinct.slice(1).map((v, i) => v - distinct[i])
  assert.ok(steps[0] > steps[steps.length - 1], 'the glide must decelerate (ease-out)')
})

check('e glides back up', () => {
  transcript.scrollTop = 400
  tap('e')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 260)
})

check('holding accelerates past a single step', () => {
  transcript.scrollHeight = 200000
  keydown('d')
  clock.advance(200)
  assert.ok(transcript.scrollTop > 100 && transcript.scrollTop <= 140, 'before the repeat delay only the first step is queued')
  clock.advance(1800)
  keyup()
  const held = transcript.scrollTop
  assert.ok(held > 700, `holding must outrun a single step, got ${held}`)
  clock.advance(1500)
  const settled = transcript.scrollTop
  clock.advance(1000)
  assert.equal(transcript.scrollTop, settled, 'the view must settle once the key is released')
  transcript.scrollHeight = 5000
})

check('the OS key-repeat burst is ignored, not added on top', () => {
  keydown('d')
  const prevented = keydown('d', { repeat: true })
  keyup()
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'a repeat event must not add a second step')
  assert.equal(prevented, true, 'the OS repeat is swallowed so it cannot double-step')
})

check('scrolling stops after release and stays stopped', () => {
  keydown('d')
  clock.advance(1000)
  const moving = transcript.scrollTop
  keyup()
  clock.advance(1500)
  const settled = transcript.scrollTop
  clock.advance(1000)
  assert.equal(transcript.scrollTop, settled, 'no residual run-on after the key is released')
  assert.ok(moving > 0)
})

// --- guards ----------------------------------------------------------------

check('typing d in the composer is untouched', () => {
  transcript.scrollTop = 500
  const prevented = keydown('d', { target: composer })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 500, 'the transcript must not move')
  assert.equal(composer.scrollTop, 0, 'the composer must not be scrolled')
  assert.equal(prevented, false, 'the character must reach the textarea')
})

check('Ctrl+D is left to the application', () => {
  keydown('d', { ctrlKey: true })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

check('IME composition never triggers a scroll', () => {
  keydown('d', { isComposing: true })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

check('an already prevented event is not re-handled', () => {
  keydown('d', { defaultPrevented: true })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

check('unbound keys are ignored', () => {
  keydown('j')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

// --- what Enter does in the message box ------------------------------------

check('by default Enter in the message box is left to the host', () => {
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'host', 'the shipped default must not change sending')
  assert.equal(keydown('Enter', { target: editor }), false, 'the host keeps the key')
  assert.deepEqual(synthKeys, [], 'and nothing is handed to the box instead')
})

check('Enter breaks the line when the mode asks it to', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the original key is swallowed, so it cannot send')
  assert.equal(synthKeys.length, 1, 'one rewrite, not a burst')
  assert.equal(synthKeys[0].key, 'Enter', 'it is still Enter')
  assert.equal(synthKeys[0].shiftKey, true, 'flagged shift, which is what the host reads as a line break')
  assert.equal(synthKeys[0].ctrlKey, false, 'and nothing that would read as the send accelerator')
  assert.equal(synthKeys[0].metaKey, false)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter goes silent when the mode asks it to', () => {
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the key is swallowed')
  assert.deepEqual(synthKeys, [], 'and no line break is handed over either')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Ctrl and Cmd Enter keep sending whatever the mode is', () => {
  // Ctrl/Cmd+Enter is the host's own send accelerator. It is the only way left
  // to send in the modes that take Enter away, so swallowing it would leave the
  // user with no way to send at all.
  for (const mode of ['host', 'newline', 'silent', 'double']) {
    fakeWindow.__dshVim.update({ sendMode: mode })
    synthKeys.length = 0
    assert.equal(keydown('Enter', { target: editor, ctrlKey: true }), false, `Ctrl+Enter must pass in ${mode}`)
    assert.equal(keydown('Enter', { target: editor, metaKey: true }), false, `Cmd+Enter must pass in ${mode}`)
    assert.deepEqual(synthKeys, [], `nothing rewritten in ${mode}`)
  }
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Shift+Enter is still the host line break, untouched', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  // Shift+Enter already breaks the line on its own; rewriting it would only
  // risk a second one behind the first.
  assert.equal(keydown('Enter', { target: editor, shiftKey: true }), false)
  assert.deepEqual(synthKeys, [])
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

// --- the double-Enter send mode --------------------------------------------

/**
 * Arm the double-Enter mode with a draft in the box and the caret in it, which
 * is the state every one of these checks starts from.
 * @param {string} [draft] - what the box holds.
 * @returns {void}
 */
function armDoubleEnter(draft = 'a message') {
  fakeWindow.__dshVim.update({ sendMode: 'double' })
  tap(' ')
  editor.textContent = draft
  synthKeys.length = 0
}

check('the first Enter of a pair breaks the line and sends nothing', () => {
  armDoubleEnter()
  // The gesture must not cost the user a delayed keystroke: the first press is
  // the ordinary line break, and only the second one is a decision.
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the key is swallowed, so it cannot reach the host as a send')
  assert.equal(synthKeys.length, 1, 'and one line break is handed over')
  assert.equal(synthKeys[0].shiftKey, true, 'as the host\'s own line break')
  assert.equal(synthKeys[0].ctrlKey, false, 'not as a send')
  clock.advance(1000)
  assert.equal(editorBlurs, 0, 'nothing was sent, so nothing gives the keyboard back')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a second Enter inside the window sends, through the host\'s own key', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  clock.advance(100)
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the second press is the plugin\'s to act on')
  assert.equal(synthKeys.length, 2, 'one line break, then one send')
  const sent = synthKeys[1]
  assert.equal(sent.key, 'Enter', 'the send is the host\'s own Enter')
  assert.equal(sent.ctrlKey, true, 'carrying the host\'s send accelerator')
  assert.equal(sent.shiftKey, false, 'and not the line-break flag')
  assert.equal(sent.bubbles, true, 'dispatched so the host\'s composer keymap hears it')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a slow second Enter breaks the line again instead of sending', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  // Past the window the pair is over: two paragraphs, not a confirmation.
  clock.advance(400)
  keydown('Enter', { target: editor })
  assert.equal(synthKeys.length, 2, 'both presses are line breaks')
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'and neither of them is a send'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('holding Enter never sends, however long it is held', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  for (let i = 0; i < 10; i++) keydown('Enter', { target: editor, repeat: true })
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'auto-repeat is one press held down, not a second press'
  )
  clock.advance(1000)
  assert.equal(editorBlurs, 0, 'so the keyboard stays in the box')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('any other key between the two Enters ends the pair', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  // A letter in the middle means the user was writing, not confirming: the
  // rhythm is broken, so the next Enter starts a new pair.
  keydown('x', { target: editor })
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'nothing was sent after the interruption'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a chorded or misplaced Enter between the two ends the pair too', () => {
  // Shift+Enter and Ctrl+Enter are not the bare Enter a pair is made of, and an
  // Enter aimed outside the box is not either: none of them may stand in for
  // the second half and turn the next bare Enter into a send.
  for (const interruption of [
    { target: editor, shiftKey: true },
    { target: editor, ctrlKey: true },
    { target: modalEditor },
  ]) {
    armDoubleEnter()
    keydown('Enter', { target: editor })
    keydown('Enter', interruption)
    synthKeys.length = 0
    keydown('Enter', { target: editor })
    assert.ok(
      synthKeys.every((k) => k.ctrlKey === false),
      `an Enter like ${JSON.stringify(interruption)} must not complete a pair`
    )
  }
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter on an empty box arms no pair', () => {
  armDoubleEnter('')
  keydown('Enter', { target: editor })
  // The box was empty, so that press could not have been the first half of a
  // pair. A draft pasted in afterwards must not be sent by one more Enter.
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'a send needs two presses on a box that had something to send'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a double-Enter send still hands the keyboard back', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  clock.advance(50)
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 1, 'the box gives the keyboard back, as every other send does')
  assert.equal(fakeDocument.activeElement, body, 'so d / e / f work on the next press')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a suggestion menu still owns Enter in the double mode', () => {
  armDoubleEnter('/plan')
  menuOnScreen = true
  // The menu accepts its candidate on Enter after this plugin has seen it, so
  // intercepting here would turn "pick /plan" into a line break.
  assert.equal(keydown('Enter', { target: editor }), false, 'the menu keeps its key')
  assert.deepEqual(synthKeys, [], 'and nothing is slipped in behind it')
  menuOnScreen = false
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('choosing the mode on the settings page arms the gesture at once', () => {
  // The user's question this answers: does a mode chosen in the settings page
  // apply on the page already open, or does it need a reload? It applies at
  // once — the page writes the preference and the plugin reads it live — and
  // the gesture must work on the very next Enter, with no restart in between.
  const modeRow = settingsElements().find(
    (e) => e.props && e.props.value === 'host' && e.props.options?.length === 4
  )
  assert.ok(modeRow, 'the four-way row must be on the page')
  modeRow.props.onSet('double')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'double', 'the live value moved')
  tap(' ')
  editor.textContent = 'a message'
  synthKeys.length = 0
  keydown('Enter', { target: editor })
  clock.advance(50)
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.some((k) => k.ctrlKey === true),
    'the second Enter must send on this same page, without a reload'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a blank line still has two routes, and neither sends', () => {
  // This is the honest cost of the mode: pressing Enter twice quickly is now
  // the send gesture, so it can no longer mean "skip a line". Both routes that
  // remain are asserted here, because the docs claim them.
  armDoubleEnter()

  // Route 1: two Shift+Enters. Shift+Enter is never a send in any mode, so it
  // is the fast way to a blank line and needs no timing at all.
  keydown('Enter', { target: editor, shiftKey: true })
  keydown('Enter', { target: editor, shiftKey: true })
  assert.deepEqual(synthKeys, [], 'Shift+Enter is the host\'s own key, untouched')

  // Route 2: two bare Enters, spaced past the window.
  synthKeys.length = 0
  keydown('Enter', { target: editor })
  clock.advance(400)
  keydown('Enter', { target: editor })
  assert.equal(synthKeys.length, 2, 'both presses break the line')
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false && k.shiftKey === true),
    'and both are the line-break gesture, not a send'
  )

  // And the pair route is still a send, so the two are genuinely different.
  synthKeys.length = 0
  keydown('Enter', { target: editor })
  clock.advance(50)
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.some((k) => k.ctrlKey === true),
    'while two quick bare Enters do send — that is the mode'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter is left alone while a suggestion menu is open', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  menuOnScreen = true
  // The menu accepts its highlighted candidate on Enter, and it does so after
  // this plugin has seen the key: taking it here would turn "pick /plan" into
  // a line break the user never asked for.
  assert.equal(keydown('Enter', { target: editor }), false, 'the menu keeps its key')
  assert.deepEqual(synthKeys, [], 'and no line break is slipped in behind it')
  menuOnScreen = false
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter outside the message box is never touched', () => {
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  // The terminal, the task window's name box, a plan editor, a settings field:
  // the mode is about the composer, and only the composer.
  const elsewhere = [
    composer,
    modalEditor,
    el({ tag: 'INPUT' }),
    el({ tag: 'TEXTAREA' }),
    el({ tag: 'DIV' }),
  ]
  for (const node of elsewhere) {
    assert.equal(keydown('Enter', { target: node }), false, `Enter must pass in ${node.tagName}`)
  }
  assert.deepEqual(synthKeys, [])
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a mode that is not one of the four is refused', () => {
  const rejected = fakeWindow.__dshVim.update({ sendMode: 'never' })
  assert.equal(rejected.error, 'conflict', 'an unknown mode must be rejected')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'host', 'and the live value must not move')
})

check('the mode is offered on the settings page and follows the stored value', () => {
  const modeRow = settingsElements().find((e) => e.props && e.props.value === 'host' && e.props.options?.length === 4)
  assert.ok(modeRow, 'the four-way row must be on the page')
  const values = modeRow.props.options.map((o) => o.value)
  assert.deepEqual(
    values,
    ['host', 'newline', 'silent', 'double'],
    'in reading order: host first, the default'
  )
  for (const option of modeRow.props.options) {
    assert.ok(option.label, `option "${option.value}" must carry a label`)
  }
  // Pressing an option applies it, and the row follows.
  modeRow.props.onSet('double')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'double')
  modeRow.props.onSet('newline')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'newline')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

/**
 * Render the registered composer-dock component and return what it produced:
 * the element it made, or null when it chose to render nothing.
 * @returns {object|null} the rendered element.
 */
function renderSendHint() {
  const dock = (ctx.log.slots['conversation.composer.dock'] ?? [])[0]
  if (!dock) {
    throw new Error(
      'the composer dock slot was never registered; injected=' +
        JSON.stringify(ctx.log.injected) +
        ' slots=' +
        JSON.stringify(Object.keys(ctx.log.slots))
    )
  }
  ReactStub.reset()
  const out = dock.component({ t: (k) => k })
  return out === null || out === undefined ? null : out
}

/**
 * The send-key line as text, or null when the component renders nothing.
 * @returns {string|null} the line.
 */
function sendHintText() {
  const out = renderSendHint()
  if (out === null) return null
  // The stub keeps children beside props rather than inside them, the way a
  // real element carries them.
  return out.children.join('')
}

check('no send hint while Enter still sends', () => {
  // The hint names a key the user does not have to think about, so a mode that
  // leaves Enter alone must not put one on screen. It renders nothing at all,
  // which is what leaves the shell's dock row exactly as the host built it.
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  assert.equal(renderSendHint(), null, 'nothing is said about a key that is not in play')
})

check('choosing the line-break mode puts the send key in the dock row', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const line = sendHintText()
  assert.ok(line, 'the line must be up')
  assert.ok(/Ctrl\+Enter|Cmd\+Enter/.test(line), 'and it must name the key that sends')
  assert.ok(line.includes('Enter'), 'naming Enter first, so the reader knows what changed')
  const el = renderSendHint()
  assert.equal(el.props.role, 'status', 'announced, not acted on')
  // The row is the host's, and it is laid out and centred by the host: the hint
  // must bring no placement of its own to fight that with.
  assert.equal(el.props.style.position, undefined, 'no placement of its own')
  assert.equal(el.props.style.bottom, undefined)
  assert.equal(el.props.style.left, undefined)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the hint paints no surface over the conversation', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const style = renderSendHint().props.style
  assert.equal(style.background, undefined, 'a hint is a line of text, not a card')
  assert.equal(style.boxShadow, undefined, 'nor casts a shadow onto the row')
  assert.equal(style.border, undefined, 'nor draws an edge')
  assert.ok(/label-secondary/.test(String(style.color)), 'it borrows the shell muted text colour instead')
  // Two things that keep it harmless: it takes no pointer, and it cannot be
  // selected out of the page.
  assert.equal(style.pointerEvents, 'none', 'never a click target')
  assert.equal(style.userSelect, 'none', 'and never a copy target')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the silent mode says so, in different words from the line-break one', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const breaking = sendHintText()
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  const silent = sendHintText()
  assert.ok(silent, 'the silent mode needs the line even more')
  assert.notEqual(silent, breaking, '"Enter breaks the line" and "Enter does nothing" are different facts')
  assert.ok(/\+Enter/.test(silent), 'both name the key that sends')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the send key is named for this machine', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  // The harness reports no platform, which is not a Mac, so the line must read
  // Ctrl — and on a Mac the same path has to be able to say Cmd, or the hint
  // names a key the user is not holding.
  assert.ok(/Ctrl\+Enter/.test(sendHintText()), 'a machine with no platform reads as Ctrl')
  const apple = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'MacIntel', language: 'zh-CN' },
    configurable: true,
    writable: true,
  })
  try {
    assert.ok(/Cmd\+Enter/.test(sendHintText()), 'a Mac is told Cmd, not Ctrl')
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: apple,
      configurable: true,
      writable: true,
    })
  }
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the double-Enter mode puts its own line in the dock row', () => {
  fakeWindow.__dshVim.update({ sendMode: 'double' })
  const line = sendHintText()
  assert.ok(line, 'the line must be up: this mode hides the host\'s accelerator too')
  assert.ok(/Enter/.test(line), 'it names Enter, the key whose meaning changed')
  assert.ok(/Ctrl\+Enter|Cmd\+Enter/.test(line), 'and it keeps naming the accelerator that still works')
  // Three modes, three different facts, and none of them may read as another.
  const breaking = (fakeWindow.__dshVim.update({ sendMode: 'newline' }), sendHintText())
  const silent = (fakeWindow.__dshVim.update({ sendMode: 'silent' }), sendHintText())
  assert.notEqual(line, breaking, '"breaks the line" and "sends on a double" are different facts')
  assert.notEqual(line, silent)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the hint line is carried in both dictionaries', () => {
  const dictionaries = ctx.log.locales[0].dictionaries
  for (const table of [dictionaries.zh, dictionaries.en]) {
    for (const key of ['hintSendNewline', 'hintSendSilent', 'hintSendDouble', 'hintSendSends']) {
      assert.ok(table[key], `a ${key} label must exist and be non-empty`)
    }
  }
})

check('the hint goes away when the mode stops asking for it', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  assert.ok(sendHintText(), 'the line is up while the mode asks for it')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  assert.equal(renderSendHint(), null, 'and it is gone the moment it does not')
})

check('the hint is a live component, not a snapshot taken once', () => {
  // The shell renders this component, so nothing re-runs it on the user's
  // behalf: it has to be subscribed to the preference stream itself. A
  // component that rendered the mode it saw on its first render — the easy way
  // to write this — would keep saying "Enter sends" after the user turned that
  // off, which is the one lie this line must never tell.
  const dock = (ctx.log.slots['conversation.composer.dock'] ?? [])[0]
  ReactStub.reset()
  assert.equal(dock.component({ t: (k) => k }), null, 'it starts silent, because the mode is host')
  // Now the settings page turns the mode on. The shell would re-render; the
  // check does the same, and the subscription is what has to make it truthful.
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  ReactStub.reset()
  assert.ok(sendHintText(), 'after the change, the line names the new send key')
  // And back again, which is the direction that would otherwise be missed: a
  // line that only ever appears is wrong in the other direction too.
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  ReactStub.reset()
  assert.ok(/\+Enter/.test(sendHintText()), 'and it re-reads the mode each time it renders')
  assert.ok(sendHintText().length > 0)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  ReactStub.reset()
  assert.equal(renderSendHint(), null, 'so a mode that wants no line renders nothing')
})

check('the hint subscribes to the preference stream rather than reading once', () => {
  // Re-rendering is not enough on its own: the shell renders this component when
  // it has a reason to, and a mode changed in the settings page is not one of
  // them. Without a live subscription the line would keep saying "Enter sends"
  // until something else happened to repaint the dock — which is exactly the
  // state in which the user most needs to be told the truth.
  const dock = (ctx.log.slots['conversation.composer.dock'] ?? [])[0]
  ReactStub.reset()
  dock.component({ t: (k) => k })
  assert.ok(ReactStub.effects.length > 0, 'the component must install an effect, or it never listens')
  assert.ok(
    ReactStub.effects.every((dispose) => typeof dispose === 'function'),
    'and that effect must hand back a disposer, so unmounting can let go of it'
  )
  // Now prove the subscription is on the stream the settings page writes to:
  // the component's own render is not what moves it, the change is.
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  const line = sendHintText()
  assert.ok(line, 'after the change the line is up')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('pressing d at the bottom does nothing and is not swallowed', () => {
  transcript.scrollTop = 4200
  const prevented = keydown('d')
  clock.advance(300)
  assert.equal(transcript.scrollTop, 4200)
  assert.equal(prevented, false)
})

// --- targeting -------------------------------------------------------------

check('focus inside a non-editable pane wins over the centre heuristic', () => {
  fakeDocument.activeElement = sidebar
  tap('d')
  clock.advance(500)
  assert.equal(sidebar.scrollTop, 140, 'the focused pane scrolls')
  assert.equal(transcript.scrollTop, 0, 'the transcript stays put')
})

check('the pane under the pointer is the pane that scrolls', () => {
  movePointer(120, 300)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'hovering the sidebar scrolls the sidebar')
  assert.equal(transcript.scrollTop, 0, 'the conversation stays put')
})

check('the pane under the pointer outranks focus', () => {
  // Focus sits on a toolbar button inside the transcript, which is what the
  // focus rule would pick; the pointer decides instead.
  fakeDocument.activeElement = button
  movePointer(120, 300)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the pointed-at pane must win')
  assert.equal(transcript.scrollTop, 0, 'the focused pane must not move')
})

check('moving the pointer hands the next press to the other pane', () => {
  movePointer(120, 300)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the sidebar scrolls while it is pointed at')
  movePointer(700, 400)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the pane the pointer left must not move again')
  assert.equal(transcript.scrollTop, 140, 'the conversation takes the next press')
})

check('moving the pointer mid-hold hands the rest of the burst over', () => {
  movePointer(120, 300)
  keydown('d')
  clock.advance(200)
  assert.ok(sidebar.scrollTop > 0, 'the burst starts on the pane being pointed at')
  movePointer(700, 400)
  clock.advance(200)
  const settled = sidebar.scrollTop
  clock.advance(600)
  keyup()
  clock.advance(1500)
  assert.ok(transcript.scrollTop > 0, 'the rest of the burst goes where the pointer went')
  assert.equal(sidebar.scrollTop, settled, 'the pane the pointer left must stop where it was')
})

check('a pointer resting where nothing can scroll falls back to the conversation', () => {
  // The gap between panes, a pane header, a fan-out with nothing to scroll:
  // the pointer rule finds no container there, so the centre rule answers.
  aimAt(body)
  movePointer(20, 20)
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'the conversation is still what scrolls')
})

check('losing the window forgets the pointer, and the centre decides again', () => {
  movePointer(120, 120)
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'the point decides while it is fresh')
  blurWindow()
  tap('d')
  clock.advance(1000)
  assert.equal(sidebar.scrollTop, 140, 'a point kept across a blur must not be reused')
  assert.equal(transcript.scrollTop, 140, 'the centre of the window decides again')
})

check('a focused control inside a pane scrolls that pane', () => {
  fakeDocument.activeElement = button
  tap('d')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 140)
})

check('a pane at the end of its range hands the step to its parent', () => {
  const outer = el({ className: 'outer', overflowY: 'auto', scrollHeight: 4000, clientHeight: 500 })
  const inner = el({
    className: 'inner',
    overflowY: 'auto',
    scrollHeight: 1500,
    clientHeight: 500,
    scrollTop: 1000,
    parent: outer,
  })
  aimAt(inner)
  tap('d')
  clock.advance(500)
  assert.equal(inner.scrollTop, 1000, 'the exhausted pane must not move')
  assert.equal(outer.scrollTop, 140, 'the parent pane takes the delta')
})

check('wheel input takes over and cancels our animation', () => {
  tap('d')
  clock.advance(32)
  const midway = transcript.scrollTop
  assert.ok(midway > 0 && midway < 140, 'sanity: caught mid-glide')
  wheel()
  clock.advance(1000)
  assert.equal(transcript.scrollTop, midway, 'our glide must stop where the user took over')
})

check('reduce-motion users get an instant jump', () => {
  mediaReduce = true
  tap('d')
  assert.equal(transcript.scrollTop, 140, 'no animation when the OS asks for less motion')
})

check('a container styled scroll-behavior: smooth does not fight the engine', () => {
  transcript.__scrollBehavior = 'smooth'
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140)
  assert.equal(transcript.style.scrollBehavior, '', 'the inline override must be restored')
  transcript.__scrollBehavior = 'auto'
})

// --- settings page ---------------------------------------------------------

check('the board is a sidebar entry with a page beside it', () => {
  const main = (ctx.log.slots.main || [])[0]
  const entry = (ctx.log.slots['sidebar.panellist'] || [])[0]
  assert.ok(main, 'the board must register a main panel')
  assert.equal(main.spec.key, 'dsh-vim-board', 'under the id the sidebar will select')
  assert.ok(entry, 'and a sidebar entry that selects it')
  assert.equal(entry.spec.id, main.spec.key, 'the entry and the panel must share one id')
  assert.equal(entry.spec.order, 20, 'below the plugins and automation entries')
  assert.equal(typeof entry.spec.label, 'function', 'the entry is labelled by the plugin')
  assert.equal(entry.spec.label(), expectedLabel('board'), 'with the same word the board uses')
  assert.equal(typeof entry.component, 'function', 'and it draws its own glyph')
  assert.equal(typeof main.component, 'function', 'while the page is a component')
})

check('the settings page is registered on the settings.section slot', () => {
  // Two slots: the settings page, and the composer's own dock row, where the
  // send hint goes. Both are the shell's, so neither is scraped out of the DOM.
  assert.deepEqual(
    ctx.log.injected,
    ['settings.section', 'conversation.composer.dock', 'main', 'sidebar.panellist'],
    'must inject the settings section, the composer dock, and the board page with its entry'
  )
  assert.equal(ctx.log.sections.length, 1)
  const { spec, component } = ctx.log.sections[0]
  assert.equal(spec.name, 'settings.section')
  assert.equal(spec.id, 'dsh-vim')
  assert.equal(typeof spec.label, 'function')
  assert.ok(spec.label().length > 0, 'the nav label must not be empty')
  assert.equal(spec.locale, 'dsh-vim')
  assert.equal(typeof component, 'function', 'the slot must receive a component')
})

check('locale dictionaries are registered for the plugin namespace', () => {
  assert.equal(ctx.log.locales.length, 1)
  const { namespace, dictionaries } = ctx.log.locales[0]
  assert.equal(namespace, 'dsh-vim')
  assert.ok(dictionaries.zh && dictionaries.en, 'both dictionaries must be present')
  // Every key, not the ones somebody remembered to list: a hand-maintained
  // selection only catches the strings that were thought about when it was
  // written, and the translator falls back to the raw key rather than failing,
  // so a missing translation ships silently.
  const zhKeys = Object.keys(dictionaries.zh).sort()
  const enKeys = Object.keys(dictionaries.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'the two dictionaries must carry exactly the same keys')
  assert.ok(zhKeys.length > 0, 'the dictionaries must not be empty')
  for (const key of zhKeys) {
    assert.ok(dictionaries.zh[key], `zh dictionary has an empty "${key}"`)
    assert.ok(dictionaries.en[key], `en dictionary has an empty "${key}"`)
  }
  // The keys that were checked one by one before this was made automatic.
  // Kept because their absence is a real bug even though the sweep above now
  // covers them by name.
  for (const key of [
    'nav', 'down', 'up', 'focusComposer', 'hintFocus', 'hintPalette', 'palette', 'paletteRename',
    'rename', 'renameFailed', 'renameUnavailable', 'renameNoName', 'renameBusy',
    'paletteUp', 'paletteDown', 'appearance', 'fontSize', 'place',
    'placeTop', 'placeCenter', 'placeBottom', 'tasks', 'step', 'tau', 'repeatDelay', 'reset', 'turnUnit',
    'statusRunning', 'statusDone', 'statusWaitApproval', 'statusWaitPlan', 'statusWaitAnswer', 'statusWaiting',
  ]) {
    assert.ok(key in dictionaries.zh, `expected key "${key}" is gone from zh`)
    assert.ok(key in dictionaries.en, `expected key "${key}" is gone from en`)
  }
})

check('rebinding takes effect immediately', () => {
  // `k`, not `j`: `j` is the board's shipped key and the two seats are live at
  // the same time, so taking it here is a conflict rather than a rebind.
  const applied = fakeWindow.__dshVim.update({ downKey: 'k' })
  assert.equal(applied.downKey, 'k')
  transcript.scrollTop = 0
  tap('k')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 140, 'the new key must scroll')
  transcript.scrollTop = 0
  tap('d')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0, 'the old key must stop working')
  fakeWindow.__dshVim.update({ downKey: 'd' })
})

check('a conflicting rebind is rejected and changes nothing', () => {
  fakeWindow.__dshVim.update({ downKey: 'k' })
  const rejected = fakeWindow.__dshVim.update({ upKey: 'k' })
  assert.equal(rejected.error, 'conflict')
  assert.equal(fakeWindow.__dshVim.settings().upKey, 'e', 'the old binding must survive')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'k')
  fakeWindow.__dshVim.update({ downKey: 'd' })
})

check('the two key groups are checked independently', () => {
  // Scrolling is {down, up}; the task window is {open, up, down}. The window is
  // modal, so a key may mean "scroll down" outside and "move down" inside.
  const shared = fakeWindow.__dshVim.update({ downKey: 'f' })
  assert.ok(!shared.error, 'a scroll key may reuse a task-window key')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'f')
  fakeWindow.__dshVim.update({ downKey: 'd' })

  for (const seat of ['paletteUpKey', 'paletteDownKey']) {
    const rejected = fakeWindow.__dshVim.update({ [seat]: 'f' })
    assert.equal(rejected.error, 'conflict', `${seat} must not be allowed to take f`)
  }
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'f')
  assert.equal(fakeWindow.__dshVim.settings().paletteUpKey, 'e')
  assert.equal(fakeWindow.__dshVim.settings().paletteDownKey, 'd')
})

check('the task window navigation keys are rebindable on their own', () => {
  const applied = fakeWindow.__dshVim.update({ paletteUpKey: 'k', paletteDownKey: 'j' })
  assert.equal(applied.paletteUpKey, 'k')
  assert.equal(applied.paletteDownKey, 'j')
  const rejected = fakeWindow.__dshVim.update({ paletteDownKey: 'k' })
  assert.equal(rejected.error, 'conflict', 'its own two keys still must not collide')
  assert.equal(fakeWindow.__dshVim.settings().paletteDownKey, 'j')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'd', 'scrolling keeps its own keys')
  fakeWindow.__dshVim.update({ paletteUpKey: 'e', paletteDownKey: 'd' })
})

check('the popup font size and position are adjustable', () => {
  const clamped = fakeWindow.__dshVim.update({ paletteFont: 999 })
  assert.equal(clamped.paletteFont, 20, 'the font size must stay inside its range')
  const placed = fakeWindow.__dshVim.update({ palettePlace: 'bottom' })
  assert.equal(placed.palettePlace, 'bottom')
  const bad = fakeWindow.__dshVim.update({ palettePlace: 'sideways' })
  assert.equal(bad.error, 'conflict', 'an unknown position must be refused')
  assert.equal(fakeWindow.__dshVim.settings().palettePlace, 'bottom')
  fakeWindow.__dshVim.update({ paletteFont: 13, palettePlace: 'top' })
})

check('a named key is rejected as a binding', () => {
  const rejected = fakeWindow.__dshVim.update({ downKey: 'ArrowDown' })
  assert.equal(rejected.error, 'conflict')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'd')
  // Enter and Tab are the two named keys allowed, and only for the seats that
  // want them: a list you cannot confirm with the keyboard is a trap, and the
  // model window's level key ships as Tab.
  assert.equal(fakeWindow.__dshVim.update({ paletteEnterKey: 'Escape' }).error, 'conflict')
  assert.ok(!fakeWindow.__dshVim.update({ paletteEnterKey: 'Enter' }).error, 'Enter is an accepted binding')
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'Enter', 'the stored form is canonical')
  assert.equal(fakeWindow.__dshVim.update({ modelLevelKey: 'Escape' }).error, 'conflict', 'Escape stays unboundable')
  const tabbed = fakeWindow.__dshVim.update({ modelLevelKey: 'tab' })
  assert.ok(!tabbed.error, 'Tab is accepted')
  assert.equal(tabbed.modelLevelKey, 'Tab', 'and stored with its canonical spelling')
  fakeWindow.__dshVim.reset()
})

check('numeric preferences are clamped to their range', () => {
  fakeWindow.__dshVim.update({ step: 99999, tau: 1, repeatDelay: -50, paletteWidth: 99, paletteHeight: 200, paletteRow: 0 })
  const clamped = fakeWindow.__dshVim.settings()
  assert.equal(clamped.step, 600)
  assert.equal(clamped.tau, 10)
  assert.equal(clamped.repeatDelay, 80)
  assert.equal(clamped.paletteWidth, 480, 'a window too narrow to hold a row is not a window')
  assert.equal(clamped.paletteHeight, 95, 'nor one taller than the screen it sits on')
  assert.equal(clamped.paletteRow, 3)
})

check('a custom step drives the slide distance', () => {
  fakeWindow.__dshVim.update({ step: 300 })
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 300)
})

check('the shipped mirror covers every preference the plugin declares', () => {
  // `SHIPPED` is written by hand so it can assert a whole object at once. That
  // only works while it names every seat the plugin actually has, and a seat
  // added to `DEFAULTS` without a line here would otherwise be silently absent
  // from the `reset()` comparison's expectation.
  const shipped = fakeWindow.__dshVim.reset()
  const missing = Object.keys(shipped).filter((key) => !(key in SHIPPED))
  assert.deepEqual(missing, [], `these preferences have no SHIPPED entry: ${missing.join(', ')}`)
  const extra = Object.keys(SHIPPED).filter((key) => !(key in shipped))
  assert.deepEqual(extra, [], `SHIPPED names preferences the plugin does not have: ${extra.join(', ')}`)
})

check('reset restores the shipped defaults', () => {
  const back = fakeWindow.__dshVim.reset()
  assert.deepEqual(back, SHIPPED)
})

check('preferences are persisted', () => {
  fakeWindow.__dshVim.update({ downKey: 'k', step: 200 })
  const raw = fakeStorage.getItem('dsh-vim/settings/v1')
  assert.ok(raw, 'settings must be written to localStorage')
  const parsed = JSON.parse(raw)
  assert.equal(parsed.downKey, 'k')
  assert.equal(parsed.step, 200)
})

check('step() and tuning() stay usable from the console', () => {
  assert.equal(fakeWindow.__dshVim.step(180), 180)
  assert.equal(fakeWindow.__dshVim.tuning().step, 180)
  fakeWindow.__dshVim.step(140)
})

// --- task window ------------------------------------------------------------

/**
 * Publish a catalogue of conversations, oldest-first in the id list so the
 * ordering assertion has to come from updatedAt rather than from insertion.
 * @param {Array<object>} rows - summaries; updatedAt decides the order.
 */
function seed(rows) {
  const byId = {}
  const ids = []
  for (const row of rows) {
    byId[row.id] = row
    ids.push(row.id)
  }
  feed.publish(ids, byId)
}

const HOUR = 60 * 60 * 1000

/**
 * A timestamp the given number of hours in the past.
 * @param {number} hours - how far back.
 * @returns {number} epoch milliseconds.
 */
function ago(hours) {
  return Date.now() - hours * HOUR
}

/** The header's "loaded / total" readout of the mounted window. */
function headerCount() {
  const host = body.children[body.children.length - 1]
  return host.children[0].children[0].children[1].textContent
}

/** Everything the mounted window's list holds, rows and block headings alike. */
function listNodes() {
  const host = body.children[body.children.length - 1]
  if (!host || !host.children[0]) return []
  const list = host.children[0].children[1]
  return list ? list.children : []
}

/**
 * The mounted window's conversation rows, in order.
 *
 * Block headings sit between the rows they label, so they are filtered out
 * here: every check about "the rows" means the conversations, and the
 * selection counts conversations too. A row is told apart from a heading by
 * carrying the session id it stands for — a heading stands for no session.
 */
function rowNodes() {
  return listNodes().filter((node) => node.__attrs['data-session-id'] !== undefined)
}

/**
 * The block headings of the mounted window, in order, as `{name, count}`.
 * `count` is the "More" seat's readout, or null on a folder heading.
 */
function sectionHeaders() {
  return listNodes()
    .filter((node) => node.__attrs['data-session-id'] === undefined)
    .map((node) => ({
      name: node.children[0] ? String(node.children[0].textContent) : '',
      count: node.children[1] ? String(node.children[1].textContent) : null,
    }))
}

/** The heading texts of the mounted window, in order. */
function sectionNames() {
  return sectionHeaders().map((header) => header.name)
}

/**
 * The mounted window's "More" heading element, or null when there is none.
 *
 * `sectionHeaders` reads the headings without handing back the node, and a
 * check that presses one needs the node itself.
 * @returns {object|null} the heading.
 */
function moreHeadingNode() {
  const label = expectedLabel('groupMore')
  return (
    listNodes().find(
      (node) => node.__attrs['data-session-id'] === undefined && String(node.children[0] ? node.children[0].textContent : '') === label
    ) ?? null
  )
}

/**
 * Press the "More" seat, the way a reader does.
 *
 * The seat answers to a press on the heading itself, not to a key, so every
 * check that wants a deeper list asks for it here rather than reaching for one.
 * @returns {void}
 */
function clickMore() {
  const heading = moreHeadingNode()
  assert.ok(heading, 'the window must be showing a More seat for this check to press it')
  fireOn(heading, 'mousedown', { type: 'mousedown', preventDefault() {}, stopPropagation() {} })
}

// The violet the plugin paints the "you are here" chip with. A status chip and
// this one are the only coloured cells on a row, so the state checks have to
// tell them apart by more than "has a colour".
const HERE_COLOR = '#c4b5fd'

/** Is this cell the "you are here" chip rather than a state chip? */
function isHereChip(cell) {
  return String(cell.style.color || '') === HERE_COLOR
}

/** The "you are here" chip of one row, or null when the row carries none. */
function hereChip(row) {
  return row.children.find(isHereChip) ?? null
}

/**
 * The state chip of one row, or null when the row carries none.
 *
 * Found by what it says rather than by being the first coloured cell: the stage
 * chip sits between the tag and the state, and an idle stage still has a colour,
 * so "first with a colour" now finds the stage and quietly proves nothing about
 * the state.
 * @param {object} row - a rendered row.
 * @returns {object|null} the state chip.
 */
function stateChip(row) {
  const labels = ['statusRunning', 'statusDone', 'statusWaiting', 'statusWaitApproval', 'statusWaitPlan', 'statusWaitAnswer']
  return (
    row.children.find((cell) => labels.some((key) => String(cell.textContent || '').startsWith(expectedLabel(key)))) ?? null
  )
}

/** The three stage words, in the order the control lays them out. */
const STAGE_KEYS = ['phaseDiscuss', 'phaseCode', 'phaseCheck']

/**
 * The stage control of one row, or null when the row carries none.
 *
 * Found by holding the whole vocabulary: every row lays out all three stage
 * words, so a cell whose three children are exactly those words is the stage
 * control and nothing else on the row can be mistaken for it.
 * @param {object} row - a rendered row.
 * @returns {object|null} the stage control.
 */
function stageBox(row) {
  const words = STAGE_KEYS.map((key) => expectedLabel(key))
  return (
    row.children.find(
      (cell) =>
        cell.children &&
        cell.children.length === words.length &&
        words.every((word, i) => String(cell.children[i].textContent || '') === word)
    ) ?? null
  )
}

/** One stage word of one row, or null when the row carries no control. */
function stageWord(row, key) {
  const box = stageBox(row)
  if (!box) return null
  const at = STAGE_KEYS.indexOf(key)
  return at < 0 ? null : box.children[at]
}

/**
 * Which stage one row is showing as marked, as a dictionary key, or ''.
 *
 * Read off the weight rather than the colour: the lit word is the heavier one,
 * which is the same fact the eye picks up, and it keeps the assertion about
 * "which stage is marked" separate from any particular palette.
 * @param {object} row - a rendered row.
 * @returns {string} the marked stage's dictionary key, or '' when none is.
 */
function markedStage(row) {
  const box = stageBox(row)
  if (!box) return ''
  const at = box.children.findIndex((word) => String(word.style.fontWeight || '') === '600')
  return at < 0 ? '' : STAGE_KEYS[at]
}

/**
 * The folder prefix inside one row's name cell, or null when the row carries none.
 *
 * It rides inside the name cell rather than beside it, so it is found among that
 * cell's children and not among the row's — which is also the cheapest way to
 * assert it is not a column: a cell of the row would show up in `row.children`.
 * @param {object} row - a rendered row.
 * @returns {object|null} the prefix span.
 */
function folderPrefix(row) {
  const name = row.children[0]
  if (!name || !name.children) return null
  return name.children.find((child) => child.getAttribute('data-role') === 'folder') ?? null
}

/** The conversation name of one row, with any folder prefix excluded. */
function nameText(row) {
  const name = row.children[0]
  if (!name || !name.children) return String((name && name.textContent) || '')
  const text = name.children.find((child) => child.getAttribute('data-role') === 'nameText')
  return text ? String(text.textContent) : String(name.textContent)
}

/** The tracks to the right of the name column, in order.
 *
 * Splitting the whole template on spaces does not work: `minmax(0, 1fr)` carries
 * a space inside it. Everything after the name track is a plain `<n>px` track, so
 * cutting there gives the right-hand columns exactly.
 * @param {object} row - a rendered row.
 * @returns {Array<string>} the track values.
 */
function rightTracks(row) {
  const template = String(row.style.gridTemplateColumns)
  const NAME_TRACK = ' minmax(0, 1fr) '
  const at = template.indexOf(NAME_TRACK)
  return template.slice(at + NAME_TRACK.length).trim().split(' ')
}

/** The state gutter: the one track in front of the name. */
function statusTrack(row) {
  const template = String(row.style.gridTemplateColumns)
  return template.slice(0, template.indexOf(' minmax(0, 1fr) ')).trim()
}

/** The open name box, or null when no row is being renamed. */
function renameBox() {
  for (const row of rowNodes()) {
    const box = row.children.find((child) => child.tagName === 'INPUT')
    if (box) return box
  }
  return null
}

/** Type into the name box, the way the DOM reports it. */
function typeIn(box, value) {
  box.value = value
  fireOn(box, 'input', { type: 'input' })
}

/** Press one key in the name box, the way the DOM delivers it. */
function pressIn(box, key) {
  return fireOn(box, 'keydown', { key, preventDefault() {}, stopPropagation() {} })
}

/** The footer hint line of the mounted window. */
function footerText() {
  const host = body.children[body.children.length - 1]
  return host.children[0].children[2].textContent
}

check('f opens the task window on the most recent conversations', () => {
  seed([
    { id: 'a', displayTitle: 'oldest', updatedAt: 1000 },
    { id: 'b', displayTitle: 'newest', updatedAt: 3000 },
    { id: 'c', displayTitle: 'middle', updatedAt: 2000 },
  ])
  const swallowed = tap('f')
  assert.ok(swallowed, 'the task-window key must be swallowed')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.open, true)
  assert.deepEqual(state.rows.map((r) => r.id), ['b', 'c', 'a'], 'rows must be newest first')
})

check('every row lays out the whole vocabulary, marked or not', () => {
  seed([
    { id: 'a', displayTitle: 'marked', updatedAt: 3000 },
    { id: 'b', displayTitle: 'unmarked', updatedAt: 2000 },
  ])
  fakeWindow.__dshVim.phase('a', 'code')
  tap('f')
  const rows = rowNodes()
  assert.ok(stageBox(rows[0]), 'a marked row carries the stage control')
  assert.ok(stageBox(rows[1]), 'an unmarked row carries it too — that is the point')
  for (const key of STAGE_KEYS) {
    assert.ok(stageWord(rows[1], key), `${expectedLabel(key)} must be on every row, marked or not`)
  }
  assert.equal(markedStage(rows[0]), 'phaseCode', 'the marked row lights its own stage')
  assert.equal(markedStage(rows[1]), '', 'an unmarked row lights nothing')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('the stage key steps a conversation through the stages', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  tap('f')
  const lit = () => markedStage(rowNodes()[0])
  assert.equal(lit(), '', 'it starts unmarked')
  tap('s')
  assert.equal(lit(), 'phaseDiscuss', 'first press is a discussion')
  tap('s')
  assert.equal(lit(), 'phaseCode', 'second press is code')
  tap('s')
  assert.equal(lit(), 'phaseCheck', 'third press is the check')
  tap('s')
  assert.equal(lit(), '', 'and the fourth takes it back off')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('the stage key marks the selected row, not the one above it', () => {
  seed([
    { id: 'a', displayTitle: 'first', updatedAt: 3000 },
    { id: 'b', displayTitle: 'second', updatedAt: 2000 },
  ])
  tap('f')
  tap('s')
  assert.equal(fakeWindow.__dshVim.phase('a'), 'discuss', 'the top row is selected')
  assert.equal(fakeWindow.__dshVim.phase('b'), '', 'the row below it is untouched')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('clicking a stage word marks that stage and does not switch conversation', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  tap('f')
  assert.equal(opened.length, 0, 'nothing was switched to yet')
  fireOn(stageWord(rowNodes()[0], 'phaseCheck'), 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.phase('a'), 'check', 'the click marked the word that was clicked')
  assert.equal(opened.length, 0, 'and it did not travel to that conversation')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stayed open')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCheck', 'the control repainted with that stage lit')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('clicking a word that is not the marked one moves the mark to it', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  fakeWindow.__dshVim.phase('a', 'discuss')
  tap('f')
  fireOn(stageWord(rowNodes()[0], 'phaseCode'), 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.phase('a'), 'code', 'the mark moved rather than adding a second one')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCode', 'and only that word is lit')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('clicking the lit word takes the mark off', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  fakeWindow.__dshVim.phase('a', 'code')
  tap('f')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCode', 'it starts marked')
  fireOn(stageWord(rowNodes()[0], 'phaseCode'), 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.phase('a'), '', 'the second press cleared it')
  assert.equal(markedStage(rowNodes()[0]), '', 'and nothing is lit any more')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('a stage is written where a later page can find it', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  fakeWindow.__dshVim.phase('a', 'check')
  const written = JSON.parse(fakeStorage.getItem('dsh-vim/phases/v1') || '{}')
  assert.deepEqual(written, { a: 'check' }, 'the stage is left behind under its own key')
  fakeWindow.__dshVim.clearPhases()
})

check('a stage this build cannot label is not shown as one', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  // The control reads whatever the ledger holds, so an unknown value from an
  // older build is what the row must show too — never a word this build cannot
  // say, and never a lit word standing for something else.
  fakeWindow.__dshVim.phase('a', 'code')
  fakeWindow.__dshVim.phase('b', 'from-an-older-build')
  assert.equal(fakeWindow.__dshVim.phase('b'), '', 'a value outside the vocabulary reads as no stage')
  tap('f')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCode', 'the known stage is the one lit')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('a stage outlives the list it was marked on', () => {
  fakeWindow.__dshVim.phase('forgotten', 'code')
  assert.equal(fakeWindow.__dshVim.phase('forgotten'), 'code', 'it is still marked')
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  assert.deepEqual(fakeWindow.__dshVim.phase(), { forgotten: 'code' }, 'a stage outlives the list, on purpose')
  fakeWindow.__dshVim.clearPhases()
})

check('the list is capped so a long history cannot flood the window', () => {
  seed(Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, displayTitle: `s${i}`, updatedAt: i })))
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 20)
  assert.equal(state.rows[0].id, 's24', 'the cap must keep the newest rows')
  tap('Escape')
})

check('subagent children are not offered as conversations', () => {
  seed([
    { id: 'main', displayTitle: 'a conversation', updatedAt: ago(1) },
    { id: 'child', displayTitle: 'a child run', updatedAt: ago(0.5), origin: 'subagent', parentId: 'main' },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['main'])
  tap('Escape')
})

check('archived conversations are not offered', () => {
  registry.publish(['gone'])
  seed([
    { id: 'gone', displayTitle: 'archived', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'still here', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['here'], 'archived rows must not appear')
  tap('Escape')
})

check('archiving while the window is open drops the row', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 2)
  registry.publish(['a'])
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['b'], 'the live archive set must apply')
  tap('Escape')
})

check('empty provisional slots are not offered', () => {
  seed([
    { id: 'real', displayTitle: 'real', updatedAt: ago(1) },
    { id: 'empty', displayTitle: 'New chat', updatedAt: ago(0.5), blank: true },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['real'])
  tap('Escape')
})

check('the window opens on the last three hours only', () => {
  seed([
    { id: 'fresh1', displayTitle: 'fresh 1', updatedAt: ago(0.5) },
    { id: 'fresh2', displayTitle: 'fresh 2', updatedAt: ago(2) },
    { id: 'edge', displayTitle: 'just inside', updatedAt: ago(2.9) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(4) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(50) },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['fresh1', 'fresh2', 'edge'],
    'only the last three hours up front'
  )
  assert.equal(state.total, 5, 'the older ones stay in the pool, unshown')
  assert.equal(headerCount(), '3 / 5', 'the header must say how much is hidden')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the recent rows are under the browsing heading, the rest behind the seat'
  )
  assert.equal(sectionHeaders()[1].count, '2', 'which says how many it is hiding')
  assert.ok(footerText().includes(expectedLabel('moreHint')), 'the footer must say how to reach the rest')
  tap('Escape')
})

check('the window opens with the selection on the conversation on screen', () => {
  seed([
    { id: 'elsewhere', displayTitle: 'touched later', updatedAt: ago(0.01) },
    { id: 'here', displayTitle: 'where I am', updatedAt: ago(3), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['elsewhere', 'here'],
    'recency alone decides the order: no row is moved for being where you are'
  )
  assert.equal(state.rows[state.index].id, 'here', 'the selection is the row you are already in')
  assert.equal(state.index, 1, 'which is not the top of the list')
  const rows = rowNodes()
  assert.equal(rows[0].children[0].textContent, 'touched later', 'the newer row keeps the top')
  assert.equal(rows[1].children[0].textContent, 'where I am', 'and the row you are in stays in its place')
  assert.deepEqual(
    rows.map((row) => (hereChip(row) ? hereChip(row).textContent : null)),
    [null, expectedLabel('current')],
    'the chip still says which row it is'
  )
  tap('Escape')
})

check('switching conversations never reorders the list', () => {
  seed([
    { id: 'a', displayTitle: 'first', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'second', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'third', updatedAt: ago(3) },
  ])
  tap('f')
  const before = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  tap('d')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().rows[2].id, 'c', 'the selection moved down')
  // The conversation on screen changes underneath the open window, as it does
  // when a switch lands: the list must keep the order the reader just learned.
  const feedRows = {
    a: { id: 'a', displayTitle: 'first', updatedAt: ago(1) },
    b: { id: 'b', displayTitle: 'second', updatedAt: ago(2), retainedBy: { mainView: 1 } },
    c: { id: 'c', displayTitle: 'third', updatedAt: ago(3) },
  }
  feed.publish(['a', 'b', 'c'], feedRows)
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    before,
    'the row order is untouched by where the window is pointing'
  )
  tap('Escape')
})

check('the state leads the row, and the here chip follows the name', () => {
  seed([
    { id: 'elsewhere', displayTitle: 'touched later', updatedAt: ago(0.01) },
    { id: 'here', displayTitle: 'where I am', updatedAt: ago(3), retainedBy: { mainView: 1 } },
  ])
  statusFeed.put('here', { running: false })
  statusFeed.put('here', { running: true })
  tap('f')
  const rows = rowNodes()
  // The row on screen is the second one: the attention block leads the list, so
  // the conversation that is actually running is not the one on screen here —
  // `elsewhere` is idle and `here` is in flight, which puts `here` first. The
  // check is about the columns, so it takes whichever row carries the tag.
  const hereAt = rows.findIndex((row) => hereChip(row))
  assert.ok(hereAt >= 0, 'the row on screen carries the chip')
  const tag = hereChip(rows[hereAt])
  const chip = stateChip(rows[hereAt])
  assert.ok(chip, 'and a state chip to lay out beside it')
  // The state is the row's first cell now: the window exists to answer "what
  // needs me", so the row answers it at the edge every row is read from. The
  // name follows, then the here tag, then the run of metadata.
  assert.equal(chip.style.gridColumn, '1', 'the state leads the row')
  assert.equal(tag.style.gridColumn, '3', 'the tag sits after the name')
  assert.equal(stageBox(rows[hereAt]).style.gridColumn, '4', 'and the stage after the tag')
  // Every row reserves the same columns, so the state and time of the other row
  // start at the same x as the ones on this row.
  assert.equal(rows[0].style.gridTemplateColumns, rows[1].style.gridTemplateColumns)
  const tracks = rightTracks(rows[hereAt])
  assert.equal(tracks.length, 4, `tag, stage, turns, time: got ${tracks.join(' | ')}`)
  assert.equal(
    tracks[0],
    tag.scrollWidth + 'px',
    'the tag column is fitted to the tag, like every other right-hand column'
  )
  assert.equal(tag.style.justifySelf, 'end', 'and the tag sits on the right of its column')
  assert.equal(tag.style.whiteSpace, 'nowrap', 'a measured cell is one line')
  assert.equal(chip.style.justifySelf, 'start', 'the state chip starts at the same x on every row')
  assert.ok(
    rows[hereAt].children.every((cell) => cell.style.gridRow === '1'),
    'the status leads visually without creating a second implicit grid row'
  )
  // The point of the whole move: a name behind a tag starts where every other
  // name starts, instead of after a prefix only that row was given.
  const name = rows[hereAt].children[0]
  assert.equal(name.style.gridColumn, '2', 'the name keeps its own column')
  assert.equal(
    rows[0].children[0].style.gridColumn,
    name.style.gridColumn,
    'and the other rows start their names at the same x'
  )
  tap('Escape')
})

check('with nothing on screen the tag column is not reserved', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  const rows = rowNodes()
  assert.equal(hereChip(rows[0]), null, 'no row claims to be where you are')
  assert.equal(
    rightTracks(rows[0]).length,
    3,
    'and the list keeps its three right-hand columns rather than an empty one'
  )
  tap('Escape')
})

check('a tag on one row costs every row the same column, not only that one', () => {
  // The price of the move, stated as an assertion so it cannot be forgotten:
  // the column is shared, so rows with no tag give up the width as well.
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  const bare = rightTracks(rowNodes()[0]).length
  tap('Escape')
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'here', updatedAt: ago(2), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const rows = rowNodes()
  assert.equal(rightTracks(rows[0]).length, bare + 1, 'one column more for the tag')
  assert.ok(hereChip(rows[1]), 'the row on screen carries the tag')
  assert.equal(hereChip(rows[0]), null, 'a row with nothing to say carries no tag')
  assert.equal(
    rows[0].style.gridTemplateColumns,
    rows[1].style.gridTemplateColumns,
    'and it reserves the same empty column, so the two rows still line up'
  )
  tap('Escape')
})

check('a conversation on screen that the filters hide reserves no column', () => {
  // Archived on purpose is archived: the row is not drawn, so a tag nobody can
  // read must not cost every other row a column.
  registry.publish(['gone'])
  seed([
    { id: 'gone', displayTitle: 'archived but on screen', updatedAt: ago(1), retainedBy: { mainView: 1 } },
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(2) },
  ])
  tap('f')
  const rows = rowNodes()
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['fresh'],
    'the hidden conversation is off the list'
  )
  assert.equal(
    rightTracks(rows[0]).length,
    3,
    'so its tag leaves no empty column behind'
  )
  tap('Escape')
})

check('the conversation on screen is loaded even when it is outside the window', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(0.01) },
    { id: 'stale', displayTitle: 'stale', updatedAt: ago(30) },
    { id: 'here', displayTitle: 'an old one I am in', updatedAt: ago(48), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['fresh', 'here'],
    'the row on screen is pulled into today, in its own place; the rest is behind More'
  )
  assert.equal(state.rows[state.index].id, 'here', 'and the selection is on it')
  assert.equal(headerCount(), '2 / 3', 'the header still counts what is hidden')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the rest is under the More seat'
  )
  tap('Escape')
})

check('a hidden conversation does not jump the queue', () => {
  // Archived on purpose is archived, even while it is the one on screen: the
  // filters are not something a row order may quietly override.
  registry.publish(['gone'])
  seed([
    { id: 'gone', displayTitle: 'archived but on screen', updatedAt: ago(1), retainedBy: { mainView: 1 } },
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['fresh'], 'the filters still win')
  tap('Escape')
})

check('walking the list with the keys never reveals anything', () => {
  seed([
    { id: 'fresh1', displayTitle: 'fresh 1', updatedAt: ago(1) },
    { id: 'fresh2', displayTitle: 'fresh 2', updatedAt: ago(2) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(50) },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'moving inside the loaded rows changes nothing else')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 2)
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the older ones are behind More'
  )
  // The end of the list is not an instruction to fetch the next batch: the More
  // seat is on screen with the number behind it, so loading more is a press.
  // The walk reaches the seat, and standing on it loads nothing by itself.
  tap('d')
  const after = fakeWindow.__dshVim.palette()
  assert.equal(after.rows.length, 2, 'the down key must not add a single row')
  assert.equal(after.onMore, true, 'it steps onto the More seat, which is a place like any other')
  assert.equal(after.index, 1, 'and the row index stays where it was, behind the seat')
  assert.equal(headerCount(), '2 / 4', 'and the readout still says how much is hidden')
  assert.equal(sectionHeaders()[1].count, '2', 'the seat still counts what it is holding')
  tap('d')
  const wrapped = fakeWindow.__dshVim.palette()
  assert.equal(wrapped.onMore, false, 'stepping off the seat wraps round to the top')
  assert.equal(wrapped.rows[wrapped.index].id, 'fresh1', 'which is the first row')
  assert.equal(wrapped.rows.length, 2, 'nothing new was loaded along the way')
  tap('Escape')
})

check('clicking the More seat reveals the next batch and leaves the selection alone', () => {
  seed([
    { id: 'fresh1', displayTitle: 'fresh 1', updatedAt: ago(1) },
    { id: 'fresh2', displayTitle: 'fresh 2', updatedAt: ago(2) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(50) },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 2, 'nothing is loaded until it is asked for')
  assert.equal(moreHeadingNode().style.cursor, 'pointer', 'the seat offers a pointer while it has something to give')
  clickMore()
  const after = fakeWindow.__dshVim.palette()
  assert.equal(after.rows.length, 4, 'the press loads the rest')
  assert.equal(after.rows[after.index].id, 'fresh2', 'and the selection is still the row it was on')
  assert.equal(headerCount(), '4', 'a fully revealed list drops the loaded/total split')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'one More seat holds them all, under the browsing heading'
  )
  assert.equal(sectionHeaders()[1].count, null, 'a fully revealed More has no count left to give')
  // Nothing is left behind it, so it is a heading again: no pointer, and a press
  // on it does nothing at all.
  assert.notEqual(moreHeadingNode().style.cursor, 'pointer', 'an empty seat must not look clickable')
  const before = fakeWindow.__dshVim.palette()
  clickMore()
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.length, before.rows.length, 'a press on it changes nothing')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and it never closes the window')
  tap('Escape')
})

check('the More seat loads one batch at a time, however much is behind it', () => {
  const old = []
  for (let i = 0; i < 25; i++) {
    old.push({ id: 'old' + i, displayTitle: 'old ' + i, updatedAt: ago(20 + i) })
  }
  seed([{ id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) }, ...old])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'only the recent one is up front')
  assert.equal(sectionHeaders()[1].count, '25', 'and the seat counts all of it')
  clickMore()
  const after = fakeWindow.__dshVim.palette()
  assert.equal(after.rows.length, 21, 'one press is one batch, not the whole archive')
  assert.equal(after.index, 0, 'the selection never moved to follow the new rows')
  assert.equal(sectionHeaders()[1].count, '5', 'what is left behind is counted down')
  clickMore()
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 26, 'and the next press takes the rest')
  assert.equal(sectionHeaders()[1].count, null, 'with nothing behind it the count is gone')
  tap('Escape')
})

check('the browsing heading reveals nothing, however it is pressed', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'old', updatedAt: ago(30) },
  ])
  tap('f')
  const heading = listNodes().find(
    (node) => node.__attrs['data-session-id'] === undefined && String(node.children[0].textContent) === expectedLabel('groupRecent')
  )
  assert.ok(heading, 'the browsing block has a heading of its own')
  assert.notEqual(heading.style.cursor, 'pointer', 'and it must not look like something to press')
  fireOn(heading, 'mousedown', { type: 'mousedown', preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'pressing it adds nothing')
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'and moves nothing')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays')
  tap('Escape')
})

check('with no recent activity the newest batch is shown, not an empty window', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(30) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(40) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(50) },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 3, 'an idle day must not open an empty window')
  assert.deepEqual(state.rows.map((r) => r.id), ['a', 'b', 'c'])
  // The fallback is still history, so the heading must say so: the block answers
  // "did anything happen lately", and the answer here is "no". Calling these rows
  // "recent" is the one lie a heading can tell that the reader cannot check
  // without reading every row's timestamp.
  assert.equal(state.stale, true, 'the block must know it is showing history')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupHistory')],
    'and it must be named for what it holds, not for a window it never had'
  )
  tap('Escape')
})

check('a run the reader is watching keeps the window honest about the time', () => {
  // The bug this pins: freshness used to be counted after the attention blocks
  // had already taken their rows out of `rest`. On an afternoon whose only
  // recent activity was the run in flight, `rest` looked dead, the fallback
  // fired, and three-day-old conversations were listed under "Recent". The
  // window must measure the window against the whole pool, not against what is
  // left once the attention blocks have had their pick.
  seed([
    { id: 'busy', displayTitle: 'the run I am watching', updatedAt: ago(0.2) },
    { id: 'old1', displayTitle: 'three days ago', updatedAt: ago(72) },
    { id: 'old2', displayTitle: 'four days ago', updatedAt: ago(96) },
  ])
  statusFeed.put('busy', { running: true })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.stale, false, 'a run in flight is activity: the day is not quiet')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupLive'), expectedLabel('groupMore')],
    'the old rows stay behind the seat instead of landing under a Recent heading'
  )
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['busy'],
    'and the browsing block holds nothing, because nothing in it is recent'
  )
  assert.equal(sectionHeaders()[1].count, '2', 'the seat still offers the history')
  tap('Escape')
})

check('a row waiting on the reader also keeps the day from reading as quiet', () => {
  // Same scope question, the other attention block: an approval parked five
  // minutes ago is the newest thing in the pool even though it is not in `rest`.
  seed([
    { id: 'ask', displayTitle: 'waiting on you', updatedAt: ago(0.1) },
    { id: 'old', displayTitle: 'last week', updatedAt: ago(168) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.stale, false, 'something happened in the window, and the block must know it')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupMine'), expectedLabel('groupMore')],
    'the week-old row stays behind the seat rather than being dressed up as recent'
  )
  tap('Escape')
})

check('d and e move the selection and wrap at both ends', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  const index = () => fakeWindow.__dshVim.palette().index
  assert.equal(index(), 0, 'the newest row starts selected')
  tap('d')
  assert.equal(index(), 1)
  tap('d')
  tap('d')
  assert.equal(index(), 0, 'moving past the end wraps to the top')
  tap('e')
  assert.equal(index(), 2, 'moving past the top wraps to the bottom')
  tap('Escape')
})

check('the arrow keys move the selection too', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 2000 },
    { id: 'b', displayTitle: 'b', updatedAt: 1000 },
  ])
  tap('f')
  tap('ArrowDown')
  assert.equal(fakeWindow.__dshVim.palette().index, 1)
  tap('ArrowUp')
  assert.equal(fakeWindow.__dshVim.palette().index, 0)
  tap('Escape')
})

check('Enter switches to the selected conversation and closes', () => {
  opened.length = 0
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  tap('d')
  const chosen = fakeWindow.__dshVim.palette().rows[1].id
  tap('Enter')
  assert.deepEqual(opened, [chosen], 'the navigator must receive the selected id')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'the window closes after switching')
})

check('the palette key goes to the conversation it opened on', () => {
  opened.length = 0
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  tap('d')
  const chosen = fakeWindow.__dshVim.palette().rows[1].id
  tap('f')
  assert.deepEqual(opened, [chosen], 'f then f is one jump, not a close')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and the window gets out of the way')
})

check('Esc is the way out; the open key only ever goes somewhere', () => {
  opened.length = 0
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  tap('Escape')
  assert.deepEqual(opened, [], 'cancelling must not switch anything')
  assert.equal(fakeWindow.__dshVim.palette().open, false)

  // Nothing to go to: the key that opened the window does not close it either.
  // The window stays until you say so — that is the whole point of it.
  seed([])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'an empty window stays open')
  assert.deepEqual(opened, [], 'and still switches nothing')
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'Escape is the way out')
})

// --- renaming a conversation ------------------------------------------------

await checkAsync('r turns the selected row into a name box, all of it selected', async () => {
  seed([{ id: 'a', displayTitle: 'first name', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the row must carry an editable name')
  assert.equal(box.value, 'first name', 'seeded with the name it has now')
  assert.deepEqual(box.__selection, [0, 'first name'.length], 'and selected, so typing replaces it')
  assert.equal(fakeDocument.activeElement, box, 'with the caret already in it')
})

await checkAsync('Enter in the name box renames the conversation', async () => {
  seed([{ id: 'a', displayTitle: 'old name', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, '  new name  ')
  pressIn(box, 'Enter')
  await flush()
  assert.equal(renames.calls.length, 1, 'the host is asked exactly once')
  assert.equal(renames.calls[0].id, 'a', 'for the selected conversation')
  assert.equal(renames.calls[0].title, 'new name', 'with the name trimmed')
  // Retaining as mainView would clear the completion reminder, exactly as it
  // would for the turn-count peek: the private source is what keeps the row honest.
  assert.notEqual(renames.calls[0].source, 'mainView', 'and never as the main view')
  assert.equal(renameBox(), null, 'the box closes once the host accepted it')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'renaming is not navigating: the window stays')
})

await checkAsync('Escape cancels the rename without asking the host', async () => {
  seed([{ id: 'a', displayTitle: 'keep me', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, 'discarded')
  pressIn(box, 'Escape')
  await flush()
  assert.deepEqual(renames.calls, [], 'nothing is sent')
  assert.equal(renameBox(), null, 'and the box is gone')
  assert.ok(rowNodes()[0].textContent.includes('keep me'), 'with the old name back on the row')
})

await checkAsync('an empty name is refused and the box stays open', async () => {
  seed([{ id: 'a', displayTitle: 'a name', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, '   ')
  pressIn(box, 'Enter')
  await flush()
  assert.deepEqual(renames.calls, [], 'a nameless conversation is not a name to send')
  assert.equal(renameBox(), box, 'so the box stays open to be fixed')
  assert.ok(footerText().includes(expectedLabel('renameNoName')), 'and the footer says why')
})

await checkAsync('a rejected rename shows the reason and keeps the name', async () => {
  renames.result = { ok: false, error: { message: 'the host said no' } }
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, 'attempt')
  pressIn(box, 'Enter')
  await flush()
  assert.equal(renames.calls.length, 1, 'the attempt was made')
  assert.equal(renameBox(), box, 'the name is not thrown away on a failure')
  assert.ok(footerText().includes('the host said no'), 'and the host reason is on screen')
})

check('typing in the name box does not drive the window', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
  ])
  tap('f')
  tap('r')
  const box = renameBox()
  const before = fakeWindow.__dshVim.palette().index
  assert.equal(keydown('d', { target: box }), false, 'the letter belongs to the name')
  assert.equal(fakeWindow.__dshVim.palette().index, before, 'the selection must not move')
  assert.equal(keydown('f', { target: box }), false, 'and the open key must not jump away mid-edit')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays open')
})

// --- rebinding through the handler the user actually triggers ---------------

check('the plugin does not swallow a key aimed at a settings box', () => {
  // The real path has two halves, and the earlier checks only ever ran the
  // second one: the plugin's window capture listener sees the keydown FIRST
  // (capture runs before the target), and only then does the box's own handler
  // run. If the plugin ate the key there, no amount of working `onKeyDown`
  // would save the control — which is exactly the shape of "rebinding does not
  // work" a user reports.
  const box = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  assert.ok(box, 'the archive box must be on the page')
  fakeDocument.activeElement = box
  const prevented = keydown('a', { target: box })
  assert.equal(prevented, false, 'a key aimed at a settings field is the field\'s, not the plugin\'s')
  assert.equal(
    fakeWindow.__dshVim.settings().paletteArchiveKey,
    'g',
    'and the plugin must not have rebound anything on its own'
  )
})

check('pressing a key in a settings box rebinds that seat', () => {
  // The checks above call `props.onSet` directly, which skips the handler the
  // user actually drives. This one runs `onFocus` + `onKeyDown` — the pair the
  // DOM produces — so a broken recorder cannot hide behind a passing `onSet`.
  // The box is the inner `input`; `KeyRow` is the component around it.
  const boxes = settingsElements().filter(
    (e) => e.type === 'input' && typeof e.props.onKeyDown === 'function' && e.props.readOnly === true
  )
  assert.ok(boxes.length >= 12, `every rebindable seat needs a box, got ${boxes.length}`)
  const box = boxes.find((e) => e.props['aria-label'] === expectedLabel('paletteArchive'))
  assert.ok(box, 'the archive box must be on the page')
  assert.equal(box.props.value, 'G', 'it shows the shipped key before anything is pressed')

  box.props.onFocus()
  let blurred = false
  box.props.onKeyDown({
    key: 'a',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: {
      blur() {
        blurred = true
      },
    },
  })
  assert.equal(fakeWindow.__dshVim.settings().paletteArchiveKey, 'a', 'the pressed key must be stored')
  assert.ok(blurred, 'and the box must hand focus back so the next box is clickable')

  // And the page must show it, which is the part the user sees.
  const after = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  assert.equal(after.props.value, 'A', 'the box must read back the new key')
})

check('Escape in a settings box leaves the binding alone', () => {
  const box = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  box.props.onFocus()
  let blurred = false
  box.props.onKeyDown({
    key: 'Escape',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: {
      blur() {
        blurred = true
      },
    },
  })
  assert.equal(
    fakeWindow.__dshVim.settings().paletteArchiveKey,
    'g',
    'cancelling must not rebind anything'
  )
  assert.ok(blurred, 'but it still leaves the box')
})

check('a key that collides in its group is refused, and the page says so', () => {
  // The archive seat shares the task-window group, so taking the open key is a
  // conflict. The user has to be told: a box that silently does nothing reads
  // as a broken control.
  const box = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  box.props.onFocus()
  box.props.onKeyDown({
    key: 'f',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: { blur() {} },
  })
  assert.equal(fakeWindow.__dshVim.settings().paletteArchiveKey, 'g', 'the collision must be refused')
  // The wording goes through the component's own error state, which is what the
  // page renders. Re-rendering here would start that state empty again — the
  // stub resets between renders — so the setter is read directly, which is the
  // same fact: `setError` was handed the conflict sentence.
  assert.ok(
    ReactStub.setters.includes(expectedLabel('conflict')),
    'and the conflict must be written on the page'
  )
})

// --- archiving the selected conversation -----------------------------------

/** The ids the task window is showing, in order. */
function renderedRowIds() {
  return fakeWindow.__dshVim.palette().rows.map((row) => row.id)
}

await checkAsync('g archives the selected conversation through the host', async () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  tap('d')
  assert.deepEqual(renderedRowIds(), ['a', 'b'], 'b is selected after one move down')
  tap('g')
  await flush()
  assert.equal(archives.calls.length, 1, 'the host archive action was called once')
  assert.equal(archives.calls[0].sessionId, 'b', 'and for the selected row, not the one on screen')
  assert.equal(archives.calls[0].stopActivity, false, 'and never with stopActivity')
  assert.ok(!renderedRowIds().includes('b'), 'the archived row leaves the list')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays open for the next one')
  assert.deepEqual(opened, [], 'archiving is not switching')
})

await checkAsync('the archive key never stops a running turn', async () => {
  // The host refuses a busy session unless the caller asks it to stop the work.
  // This plugin must not ask: one keystroke destroying a running task is the
  // worst accident available here, which is the rule Escape already follows.
  seed([{ id: 'busy', displayTitle: 'busy', updatedAt: ago(1) }])
  archives.active.add('busy')
  tap('f')
  tap('g')
  await flush()
  assert.equal(archives.calls.length, 1, 'the attempt reached the host')
  assert.equal(archives.calls[0].stopActivity, false, 'without asking it to stop anything')
  assert.deepEqual(archives.stopped, [], 'so no work was stopped')
  assert.ok(renderedRowIds().includes('busy'), 'and the row is still there')
  assert.ok(
    footerText().includes(expectedLabel('archiveActive')),
    'the footer tells the user to stop it first'
  )
})

await checkAsync('an unarchivable session keeps its row and shows the host reason', async () => {
  archives.failure = { error: { message: 'the host said no' } }
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  tap('g')
  await flush()
  assert.ok(renderedRowIds().includes('a'), 'a failure must not remove the row')
  assert.ok(footerText().includes('the host said no'), 'and the host reason is on screen')
})

check('the archive key cannot collide with the rest of its group', () => {
  assert.equal(
    fakeWindow.__dshVim.update({ paletteArchiveKey: 'f' }).error,
    'conflict',
    'the archive key shares the task window group'
  )
  assert.equal(fakeWindow.__dshVim.settings().paletteArchiveKey, 'g')
  assert.equal(
    fakeWindow.__dshVim.update({ paletteArchiveKey: 'o' }).error,
    'conflict',
    'and it may not take the switch key either'
  )
})

check('the footer advertises the archive key', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.ok(
    footerText().includes('g ' + expectedLabel('archive')),
    'the footer names the key that archives the selected conversation'
  )
  tap('Escape')
})

check('the rename key cannot collide with the rest of its group', () => {
  const rejected = fakeWindow.__dshVim.update({ paletteRenameKey: 'f' })
  assert.equal(rejected.error, 'conflict', 'the open key and the rename key are one group')
  assert.equal(fakeWindow.__dshVim.settings().paletteRenameKey, 'r')

  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  fakeWindow.__dshVim.update({ paletteRenameKey: 'n' })
  tap('f')
  tap('r')
  assert.equal(renameBox(), null, 'the old key must stop renaming')
  tap('n')
  assert.ok(renameBox(), 'and the new one must start')
  tap('Escape')
})

// --- the folder a conversation lives in -------------------------------------
//
// A folder is a label on a row now, not a container around rows. It used to be
// a block heading: one block per folder, in the registry's own order. That made
// the folder the unit the reader navigated in, and it had a cost that only
// showed on a busy day — the cap was spent folder by folder in registry order,
// so a busy folder could take the whole twenty and leave a quiet one with
// nothing, even when the quiet one held the newest conversations on the list.
// The block heading is gone; the prefix on every row is what carries the
// folder, and the list is ordered by recency alone.

check('every row names its own folder, and no heading says it for a group', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: 'G:\\桌面\\dsh-vim', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'api-service', path: 'G:\\work\\api-service', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'in a named folder', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'in another folder', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'loose', updatedAt: ago(3) },
  ])
  tap('f')
  const rows = rowNodes()
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent')],
    'there is one browsing heading, and it does not name a folder'
  )
  assert.equal(folderPrefix(rows[0]).textContent, 'dsh-vim', 'each row carries its own folder')
  assert.equal(folderPrefix(rows[1]).textContent, 'api-service', 'including the second folder')
  assert.equal(folderPrefix(rows[2]), null, 'and a row no folder accounts for carries none')
  assert.equal(nameText(rows[0]), 'in a named folder', 'the name still follows the prefix')
  tap('Escape')
})

check('the list is ordered by recency, not by folder', () => {
  registry.publish([], [
    { workspaceId: 'w2', title: 'second', path: 'G:\\work\\second', sessionIds: ['c'] },
    { workspaceId: 'w1', title: 'first', path: 'G:\\work\\first', sessionIds: ['a', 'b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(3) },
  ])
  tap('f')
  // The registry order is no longer the order of anything: `c` is newest and
  // leads, even though its folder is listed second, and `a` and `b` are no
  // longer held together as a block.
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['a', 'b', 'c'],
    'plain recency decides, whatever folder a row is in'
  )
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent')],
    'and no folder gets a heading of its own'
  )
  tap('Escape')
})

check('a busy folder cannot starve a quiet one out of the list', () => {
  // The bug this flattening fixes: the cap used to be spent folder by folder in
  // registry order, so thirty conversations in the first folder took the whole
  // batch and the second folder — holding the two newest conversations on the
  // list — never appeared at all.
  const busy = []
  for (let i = 0; i < 30; i++) busy.push('busy' + i)
  registry.publish([], [
    { workspaceId: 'w1', title: 'busy', path: 'G:\\work\\busy', sessionIds: busy },
    { workspaceId: 'w2', title: 'quiet', path: 'G:\\work\\quiet', sessionIds: ['q1', 'q2'] },
  ])
  const rows = busy.map((id, i) => ({ id, displayTitle: id, updatedAt: ago(1 + i * 0.01) }))
  rows.push({ id: 'q1', displayTitle: 'q1', updatedAt: ago(0.1) })
  rows.push({ id: 'q2', displayTitle: 'q2', updatedAt: ago(0.2) })
  seed(rows)
  tap('f')
  const shown = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  assert.ok(shown.includes('q1') && shown.includes('q2'), 'the newest conversations must be shown')
  assert.deepEqual(shown.slice(0, 2), ['q1', 'q2'], 'and being newest, they lead the list')
  tap('Escape')
})

check('More has one heading for many folders, so its rows name their own', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: 'G:\\桌面\\dsh-vim', sessionIds: ['a', 'old1', 'old2'] },
    { workspaceId: 'w2', title: '', path: 'G:\\work\\api-service', sessionIds: ['old3'] },
  ])
  seed([
    { id: 'a', displayTitle: 'today', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'older one', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'older two', updatedAt: ago(30) },
    { id: 'old3', displayTitle: 'older three', updatedAt: ago(40) },
  ])
  tap('f')
  clickMore()
  const rows = rowNodes()
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the recent row is under the browsing heading, the older ones under the seat'
  )
  assert.equal(folderPrefix(rows[0]).textContent, 'dsh-vim', 'the recent row names its folder too')
  assert.equal(nameText(rows[0]), 'today', 'and the name follows the prefix')
  assert.equal(folderPrefix(rows[1]).textContent, 'dsh-vim', 'a row under More says which folder it is')
  assert.equal(folderPrefix(rows[2]).textContent, 'dsh-vim', 'as does its folder mate')
  assert.equal(
    folderPrefix(rows[3]).textContent,
    'api-service',
    'a folder with no title reads as its last segment'
  )
  assert.equal(nameText(rows[1]), 'older one', 'and the conversation name still follows it')
  tap('Escape')
})

check('the folder prefix is text in the name cell, not a column', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'a-much-longer-folder-name', path: 'G:\\work\\api', sessionIds: ['old'] }])
  seed([
    { id: 'a', displayTitle: 'a name', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'an older name', updatedAt: ago(40) },
  ])
  tap('f')
  const before = rowNodes()[0].style.gridTemplateColumns
  clickMore()
  const rows = rowNodes()
  const prefix = folderPrefix(rows[1])
  assert.ok(prefix, 'the row that arrived from More names its folder')
  assert.ok(!prefix.style.gridColumn, 'the prefix claims no grid line of its own')
  assert.equal(
    rows[1].children.some((cell) => cell.getAttribute('data-role') === 'folder'),
    false,
    'so it is not a cell of the row either, and cannot become a column by accident'
  )
  assert.equal(rows[1].children[0].style.gridColumn, '2', 'the name cell is still the name column')
  assert.equal(prefix.style.opacity, '0.5', 'and the prefix reads as dimmed text rather than as a badge')
  assert.ok(!prefix.style.background, 'a pill behind it would put the block back to what it was')
  // The price of the old column, now gone: pressing More cannot move a row that
  // was already on screen, because nothing that is already there is measured.
  assert.equal(
    rows[0].style.gridTemplateColumns,
    before,
    'the template the first row was laid out with is the one it keeps'
  )
  assert.equal(rows.length, 2, 'and the older row did arrive')
  tap('Escape')
})

check('the conversation name is dimmed, and the folder in front of it stays dimmer', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'a folder', path: 'G:\\work\\one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a name', updatedAt: ago(1) }])
  tap('f')
  const row = rowNodes()[0]
  const name = row.children[0].children.find((c) => c.getAttribute('data-role') === 'nameText')
  const prefix = folderPrefix(row)
  assert.equal(name.style.opacity, '0.72', 'the name is dimmed so a screen of them can be scanned')
  assert.equal(prefix.style.opacity, '0.5', 'and the folder label is dimmer still, being the qualifier')
  // The two must not multiply: the name is dimmed on its own span, so the
  // prefix inside the same cell keeps the opacity it was given.
  assert.ok(!row.children[0].style.opacity, 'the cell around them carries no opacity of its own')
  tap('Escape')
})

check('a conversation no folder accounts for is named by nothing', () => {
  registry.clear()
  seed([{ id: 'a', displayTitle: 'loose', updatedAt: ago(40) }])
  tap('f')
  tap('d')
  assert.equal(folderPrefix(rowNodes()[0]), null, 'no folder, so there is nothing to prefix')
  assert.equal(nameText(rowNodes()[0]), 'loose', 'and the name is still the whole of the name cell')
  tap('Escape')
})

check('a row being renamed shows the name box, not a prefix in front of it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: 'G:\\桌面\\dsh-vim', sessionIds: ['old'] }])
  seed([
    { id: 'a', displayTitle: 'today', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'older name', updatedAt: ago(40) },
  ])
  tap('f')
  clickMore()
  // Walk onto the More row and rename it: the input takes the whole name cell.
  tap('d')
  assert.equal(rowNodes()[1].getAttribute('data-session-id'), 'old')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the row under More can be renamed')
  assert.equal(folderPrefix(rowNodes()[1]), null, 'and the prefix steps aside for the box being typed into')
  assert.equal(box.style.gridColumn, '2', 'the name box is still the name column')
  tap('Escape')
})

check('the state is the first column, the name the second, the tag the third', () => {
  // Pinned rather than derived: a column added later would move every one of
  // these numbers, and nothing else in the suite would notice.
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'here', updatedAt: ago(2), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const rows = rowNodes()
  const tag = hereChip(rows[1])
  assert.ok(tag, 'the row on screen carries the tag')
  assert.equal(rows[1].children[0].style.gridColumn, '2', 'the conversation name is the second column')
  assert.equal(tag.style.gridColumn, '3', 'the tag is the third')
  assert.equal(stageBox(rows[1]).style.gridColumn, '4', 'the stage the fourth')
  assert.equal(rightTracks(rows[1]).length, 4, 'tag, stage, turns, time')
  assert.equal(rows[0].children[0].style.gridColumn, '2', 'and every other row starts its name at the same x')
  tap('Escape')
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  const bare = rowNodes()[0]
  assert.equal(hereChip(bare), null, 'no row claims to be where you are')
  assert.equal(rightTracks(bare).length, 3, 'so the list keeps its three right-hand columns')
  assert.equal(stageBox(bare).style.gridColumn, '3', 'and the stage moves into the gap the tag would have left')
  tap('Escape')
})

check('a host without a workspace registry still lists conversations', () => {
  registry.clear()
  seed([{ id: 'a', displayTitle: 'still here', updatedAt: ago(1) }])
  tap('f')
  assert.equal(nameText(rowNodes()[0]), 'still here', 'the row is just the name')
  assert.deepEqual(sectionNames(), [expectedLabel('groupRecent')], 'and the browsing heading is still there')
  tap('Escape')
})

// --- one heading per block, and none of them a folder ------------------------

check('the More heading says how much is behind it', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(30) },
    { id: 'old3', displayTitle: 'old 3', updatedAt: ago(40) },
  ])
  tap('f')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the fresh one is under the browsing heading, the rest under the seat'
  )
  assert.equal(sectionHeaders()[1].count, '3', 'which counts them')
  clickMore()
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 4, 'the press on it loads them')
  assert.equal(sectionHeaders()[1].count, null, 'and the count goes away when nothing is left behind')
  tap('Escape')
})

check('a heading is not a row: it is never selectable', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  // One browsing heading and two rows, so a selection that counted elements
  // would be able to land on the heading. It must not: the movement keys walk
  // the rows. (Nothing is behind the seat here, so there is no seat.)
  assert.equal(listNodes().length, 3, 'the browsing heading and both rows')
  assert.equal(rowNodes().length, 2, 'but only the rows are rows')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'd moves between conversations')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'and wraps over the heading, not onto it')
  assert.equal(fakeWindow.__dshVim.palette().onMore, false, 'no heading is standable when nothing is behind it')
  tap('Escape')
})

// --- what is waiting on the reader, ahead of where things live ---------------

check('what is waiting on the reader leads the list', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'a folder', path: 'G:\\work\\one', sessionIds: ['idle', 'ask'] },
  ])
  seed([
    { id: 'idle', displayTitle: 'nothing owed', updatedAt: ago(1) },
    { id: 'ask', displayTitle: 'needs an answer', updatedAt: ago(2) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupMine'), expectedLabel('groupRecent')],
    'the attention block is its own heading, and the browsing rows keep theirs'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['ask', 'idle'],
    'the row that needs the reader comes first, however old it is'
  )
  tap('Escape')
})

check('a conversation waiting since yesterday is not hidden behind More', () => {
  // The point of reading the attention blocks off the whole pool: a debt older
  // than the recency window is the one most worth seeing, and a window that only
  // looked at the last twelve hours would file it under "More".
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'stuck', displayTitle: 'stuck since yesterday', updatedAt: ago(30) },
  ])
  statusFeed.put('stuck', { running: false, pendingInteraction: { kind: 'answer' } })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['stuck', 'fresh'],
    'the old debt is up front, not behind the seat'
  )
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupMine'), expectedLabel('groupRecent')],
    'and it is not under a More heading'
  )
  tap('Escape')
})

check('a row in the attention block is not repeated in the browsing block', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'a folder', path: 'G:\\work\\one', sessionIds: ['ask', 'idle'] },
  ])
  seed([
    { id: 'ask', displayTitle: 'needs an answer', updatedAt: ago(1) },
    { id: 'idle', displayTitle: 'nothing owed', updatedAt: ago(2) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const ids = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  assert.equal(ids.length, new Set(ids).size, 'no conversation appears twice')
  assert.deepEqual(ids, ['ask', 'idle'], 'the owed row is listed once, in the block that claims it')
  // A conversation pinned to the top must not also spend the browsing cap.
  const recent = fakeWindow.__dshVim.palette().sections.find((s) => s.kind === 'recent')
  assert.deepEqual(recent.ids, ['idle'], 'the browsing block no longer holds the row that moved up')
  tap('Escape')
})

check('the oldest debt comes first inside the waiting block', () => {
  seed([
    { id: 'newer', displayTitle: 'just asked', updatedAt: ago(0.1) },
    { id: 'older', displayTitle: 'asked a while ago', updatedAt: ago(3) },
  ])
  // Both were seen entering flight, so the block can order by how long they have
  // been waiting rather than by when they were last touched.
  statusFeed.put('older', { running: true })
  statusFeed.put('newer', { running: true })
  clock.advance(5 * 60 * 1000)
  statusFeed.put('older', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('newer', { running: false, pendingInteraction: { kind: 'answer' } })
  tap('f')
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['older', 'newer'],
    'the conversation that has been waiting longer is on top'
  )
  tap('Escape')
})

check('a conversation in flight is listed apart, and does not lead', () => {
  seed([
    { id: 'busy', displayTitle: 'running now', updatedAt: ago(1) },
    { id: 'idle', displayTitle: 'quiet', updatedAt: ago(2) },
  ])
  statusFeed.put('busy', { running: true })
  tap('f')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupLive'), expectedLabel('groupRecent')],
    'the in-flight block is named, and the browsing rows keep their own heading'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['busy', 'idle'],
    'it is listed above the browsing rows'
  )
  tap('Escape')
})

check('the in-flight block is dimmed, and a waiting row is not', () => {
  seed([
    { id: 'busy', displayTitle: 'running now', updatedAt: ago(1) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: ago(2) },
  ])
  statusFeed.put('busy', { running: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const rows = rowNodes()
  const order = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  assert.deepEqual(order, ['ask', 'busy'], 'the waiting row leads')
  // The dimming is the whole difference between "this wants you" and "this is
  // merely moving": same row, same columns, less weight.
  assert.ok(!rows[0].style.opacity, 'a row waiting on the reader is at full weight')
  assert.equal(rows[1].style.opacity, '0.62', 'a row in flight is dimmed')
  tap('Escape')
})

check('the window opens on the first thing waiting on the reader', () => {
  seed([
    { id: 'top', displayTitle: 'newest but quiet', updatedAt: ago(1) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: ago(9) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows[state.index].id, 'ask', 'the selection lands on what is owed, not on the newest row')
  tap('Escape')
})

check('with nothing owed the window opens where the reader already is', () => {
  seed([
    { id: 'newest', displayTitle: 'newest', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'where I am', updatedAt: ago(4), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows[state.index].id, 'here', 'the fallback is the old behaviour, unchanged')
  tap('Escape')
})

check('dealing with one row makes the next press land on the next owed one', () => {
  seed([
    { id: 'first', displayTitle: 'first debt', updatedAt: ago(9) },
    { id: 'second', displayTitle: 'second debt', updatedAt: ago(1) },
  ])
  statusFeed.put('first', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('second', { running: false, pendingInteraction: { kind: 'answer' } })
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].id, 'first', 'the older debt is on top')
  // The reader deals with it: the approval is given, so the turn resumes and the
  // row is no longer waiting. That is the queue behaviour — no key, no bookmark.
  statusFeed.put('first', { running: true })
  tap('Escape')
  tap('f')
  assert.equal(
    fakeWindow.__dshVim.palette().rows[0].id,
    'second',
    'the next press opens on the next thing owed'
  )
  tap('Escape')
})

check('the headline says what is waiting, and can say nothing is', () => {
  seed([{ id: 'busy', displayTitle: 'running', updatedAt: ago(1) }])
  statusFeed.put('busy', { running: true })
  tap('f')
  assert.equal(
    fakeWindow.__dshVim.palette().headline,
    '1 ' + expectedLabel('headLive'),
    'a running turn is reported as in flight, not as waiting on the reader'
  )
  tap('Escape')
  // Nothing owed and nothing moving: the window can say so, which is the one
  // thing a header of raw counts could never do.
  seed([{ id: 'quiet', displayTitle: 'quiet', updatedAt: ago(1) }])
  tap('f')
  assert.equal(
    fakeWindow.__dshVim.palette().headline,
    expectedLabel('headQuiet'),
    'the quiet case gets a sentence, not a count'
  )
  tap('Escape')
})

check('the More seat can be reached with the movement keys', () => {
  const older = []
  for (let i = 1; i <= 21; i++) {
    older.push({ id: 'old' + i, displayTitle: 'old ' + i, updatedAt: ago(20 + i) })
  }
  seed([{ id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) }, ...older])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'only the fresh one is loaded')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'd walks onto the seat, which has something behind it')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'standing on it loads nothing by itself')
  // Confirming while standing on it is what opens it, so the keyboard reaches
  // the older conversations without any key gaining a second meaning.
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 21, 'the press revealed a batch')
  assert.equal(state.onMore, true, 'and with more still behind it, the cursor stays on the seat')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, false, 'stepping down leaves the seat for a row')
  tap('Escape')
})

check('the seat is not a row: no key acts on the row it stands in front of', () => {
  const older = []
  for (let i = 1; i <= 21; i++) {
    older.push({ id: 'old' + i, displayTitle: 'old ' + i, updatedAt: ago(20 + i) })
  }
  seed([{ id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) }, ...older])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'the cursor is on the seat')
  // Confirming on the seat opens the seat. It must never travel to the row the
  // seat is drawn in front of — that is the conversation the reader has already
  // stepped past.
  opened.length = 0
  tap('Enter')
  assert.deepEqual(opened, [], 'confirming on the seat opens the seat, never the row above it')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'and the cursor is still on the seat')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 21, 'the seat gave up its batch')
  // The keys that act on "the selected conversation" must find nothing to act
  // on, rather than silently grabbing the row behind the seat.
  tap('r')
  assert.equal(
    listNodes().some((node) => node.children[0] && node.children[0].tagName === 'INPUT'),
    false,
    'rename finds no conversation under the cursor and opens no name box'
  )
  tap('Escape')
})

check('the seat stops being a place once nothing is behind it', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'there is something behind it, so it can be stood on')
  // That batch was the last one, so the seat is no longer a place to stand: the
  // cursor comes off it and onto the first row it revealed, rather than staying
  // on a heading that has nothing left to give.
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.onMore, false, 'the seat is gone once it is empty')
  assert.equal(state.rows.length, 2, 'and the batch it revealed is on screen')
  assert.equal(state.rows[state.index].id, 'old1', 'with the cursor on the first row it revealed')
  tap('Escape')
})

check('the footer says how to reach the seat while it has something behind it', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
  ])
  tap('f')
  assert.ok(footerText().includes(expectedLabel('moreHint')), 'the hint names the seat while it can be reached')
  tap('Escape')
  // A list with nothing behind the seat must not advertise one.
  seed([{ id: 'only', displayTitle: 'only', updatedAt: ago(1) }])
  tap('f')
  assert.ok(!footerText().includes(expectedLabel('moreHint')), 'and drops it when there is nothing to reach')
  tap('Escape')
})

check('a clock under a minute shows no duration at all', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(59 * 1000)
  tap('f')
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')]],
    'under a minute there is no duration worth reading, so none is shown'
  )
  clock.advance(1000)
  assert.deepEqual(
    renderedStatuses(),
    [[liveChip('statusRunning', 1)]],
    'and the first whole minute appears'
  )
  tap('Escape')
})

check('a press on a heading switches nothing and moves nothing', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'folder one', path: 'G:\\work\\one', sessionIds: ['a'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'old', updatedAt: ago(30) },
  ])
  tap('f')
  opened.length = 0
  const heading = listNodes().find((node) => node.__attrs['data-session-id'] === undefined)
  assert.ok(heading, 'a heading is on screen')
  fireOn(heading, 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.deepEqual(opened, [], 'a heading is not a conversation to travel to')
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'and it is not a row the selection can land on')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays up')
  tap('Escape')
})

check('a conversation pulled into the window is kept, and the order is recency', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'first', path: 'G:\\work\\first', sessionIds: ['a', 'old'] },
    { workspaceId: 'w2', title: 'second', path: 'G:\\work\\second', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'old', displayTitle: 'the one I am in', updatedAt: ago(40), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  // The pull-in must not become a new sort key: the list is ordered by recency,
  // and "where I am" is added to the block without being moved to the front of
  // it — or the list would reshuffle every time the reader switched.
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['a', 'b', 'old'],
    'the pulled-in row is loaded without jumping the queue'
  )
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent')],
    'it joins the browsing block, which keeps its one heading'
  )
  assert.equal(fakeWindow.__dshVim.palette().rows[2].id, 'old', 'and the selection lands on it')
  tap('Escape')
})

check('the task window reports its own blocks to the console', () => {
  // Two lists, with two shapes: the task window is cut into attention blocks
  // plus one browsing block, and the model picker is a flat list. The debug
  // readout names the blocks so the cut can be read without counting elements —
  // a heading is not a row, and the selection index counts conversations only.
  registry.publish([], [{ workspaceId: 'w1', title: 'folder', path: 'G:\\work\\one', sessionIds: ['a'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'old', updatedAt: ago(30) },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.sections.map((section) => section.kind),
    ['recent', 'more'],
    'block by block, heading by heading'
  )
  assert.equal(state.sections[0].label, expectedLabel('groupRecent'), 'the browsing block names itself, not a folder')
  assert.deepEqual(state.sections[0].ids, ['a'], 'and says which conversations it holds')
  assert.equal(state.sections[0].count, 1, 'a block counts its rows')
  assert.equal(state.sections[1].label, expectedLabel('groupMore'), 'the other block is the More seat')
  assert.equal(state.sections[1].count, 1, 'which counts what is still behind it')
  assert.deepEqual(state.sections[1].ids, [], 'and holds nothing yet')
  tap('Escape')
})

check('opening the window does not reorder a folder for the row you are in', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'folder', path: 'G:\\work\\one', sessionIds: ['a', 'b', 'c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'newest', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'middle', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'oldest and current', updatedAt: ago(3), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(state.rows.map((r) => r.id), ['a', 'b', 'c'], 'recency holds, inside the folder')
  assert.equal(state.index, 2, 'the selection is the row you are in, at the bottom')
  assert.ok(hereChip(rowNodes()[2]), 'and the chip marks it there')
  tap('Escape')
})

check('the window keeps the scroll keys wherever the pointer is parked', () => {
  // The result of a press must not depend on where the mouse was left: the
  // window owns `e`/`d` while it is open, over the card or over the page.
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 2000 },
    { id: 'b', displayTitle: 'b', updatedAt: 1000 },
  ])
  tap('f')
  movePointer(600, 300) // the conversation, not the card
  assert.equal(tap('d'), true, 'd belongs to the task window')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'and it moved the selection')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 0, 'nothing may scroll behind the window')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the window stays up')
  tap('Escape')
})

check('a press beside the window puts it away, and the page still gets the press', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  const host = body.children[body.children.length - 1]
  const card = cardNode()
  assert.equal(card.getAttribute('role'), 'dialog', 'the card is the dialog, not the backdrop')
  assert.equal(host.style.pointerEvents, 'none', 'the backdrop must not swallow clicks meant for the page')
  assert.equal(card.style.pointerEvents, 'auto', 'while the card itself stays clickable')
  assert.deepEqual(host.__listeners, {}, 'and the backdrop carries no handler of its own')
  // A click on the backdrop is a click on the page, so it reaches the page — and
  // the window, which the press was aimed past, goes with it.
  let swallowed = false
  fire('pointerdown', {
    type: 'pointerdown',
    target: host,
    button: 0,
    preventDefault() {
      swallowed = true
    },
    stopPropagation() {
      swallowed = true
    },
  })
  assert.equal(swallowed, false, 'the plugin must not swallow the press: the page still gets it')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and the window goes away with it')
  assert.equal(body.children.length, 0, 'which unmounts it')
})

check('a press on the card is the window talking, not a way out', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 2000 },
    { id: 'b', displayTitle: 'b', updatedAt: 1000 },
  ])
  tap('f')
  const at = fakeWindow.__dshVim.palette().index
  press(cardNode())
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the card is the window')
  assert.equal(fakeWindow.__dshVim.palette().index, at, 'and a press on it moves nothing')
  press(rowNodes()[0])
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'a row on the card is inside it too')
  press(body)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'while the page beside the card is not')
})

check('a press outside the task window closes it wherever it lands', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  // The sidebar is the page too: a press there still closes the window, and the
  // host's own click on it is not ours to stop.
  press(sidebar)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'the sidebar is outside the card')
  assert.equal(body.children.length, 0, 'and the window unmounts')
  tap('f')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and so is the conversation')
  assert.equal(body.children.length, 0, 'either way it is gone')
})

check('a right-button press outside leaves the window alone', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  // A right-click is asking the page for a menu; a window that vanished under it
  // would take the selection the menu was about to act on with it.
  fire('pointerdown', { type: 'pointerdown', target: transcript, button: 2 })
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'only the main button is a way out')
  fire('pointerdown', { type: 'pointerdown', target: transcript, button: 1 })
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the middle button is not one either')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'while the main button still is')
})

check('a press outside with a half-typed name closes the window and drops the name', () => {
  seed([{ id: 'a', displayTitle: 'keep me', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the row must be renaming')
  typeIn(box, 'half typed')
  // The name box is on the card, so a press in it is not a way out — otherwise
  // clicking into the name to fix a character would throw the name away.
  press(box)
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'a press in the name box is inside')
  assert.equal(renameBox(), box, 'and the draft is still being typed')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'a press outside closes, as Escape does at the window')
  assert.equal(renameBox(), null, 'and the half-typed name goes with it')
  assert.deepEqual(renames.calls, [], 'nothing is ever sent for a name nobody finished')
})

check('a press on the page changes nothing when no window is open', () => {
  assert.equal(fakeWindow.__dshVim.palette().open, false)
  assert.equal(fakeWindow.__dshVim.modelPick().open, false)
  press(transcript)
  press(sidebar)
  press(editor)
  assert.equal(body.children.length, 0, 'no window may open itself on a press')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and none of them opened on the way')
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'either kind')
})

check('a running conversation is marked, and the window is real DOM', () => {
  seed([
    { id: 'a', displayTitle: 'busy one', updatedAt: 2000, running: true },
    { id: 'b', displayTitle: 'idle one', updatedAt: 1000 },
  ])
  tap('f')
  const host = body.children[body.children.length - 1]
  assert.ok(host, 'the window must be appended to the body')
  const list = host.children[0].children[1]
  // The list carries a heading above the "in flight" block now, so "one row per
  // conversation" is counted on the rows, not on the list's raw children.
  const rows = rowNodes()
  assert.equal(rows.length, 2, 'one row per conversation')
  assert.equal(rows[0].getAttribute('data-session-id'), 'a')
  assert.equal(rows[0].getAttribute('aria-selected'), 'true', 'the selected row is announced')
  assert.equal(rows[1].getAttribute('aria-selected'), 'false')
  assert.ok(list.textContent.includes('busy one'))
  tap('Escape')
  assert.equal(body.children.length, 0, 'closing must unmount the window')
})

check('an empty catalogue shows a placeholder instead of nothing', () => {
  seed([])
  tap('f')
  const host = body.children[body.children.length - 1]
  const list = host.children[0].children[1]
  assert.equal(list.children.length, 1)
  assert.ok(list.children[0].textContent.length > 0, 'the empty state must say something')
  assert.deepEqual(opened, [])
  tap('Enter')
  assert.deepEqual(opened, [], 'Enter on an empty list must not switch anything')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and it must stay open')
  tap('Escape')
})

check('a live feed update keeps the selection on the same conversation', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 1)
  // A new conversation arrives and outranks everything.
  feed.publish(['z', 'a', 'b', 'c'], {
    z: { id: 'z', displayTitle: 'brand new', updatedAt: 9000 },
    a: { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    b: { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    c: { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  })
  const after = fakeWindow.__dshVim.palette()
  assert.deepEqual(after.rows.map((r) => r.id), ['z', 'a', 'b', 'c'], 'the new row must sort in')
  assert.equal(after.rows[after.index].id, 'b', 'the selection must still be the same conversation')
  tap('Escape')
})

check('the feed subscription is dropped when the window closes', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  assert.equal(feed.listeners.length, 1, 'an open window listens to the feed')
  tap('Escape')
  assert.equal(feed.listeners.length, 0, 'closing must unsubscribe')
})

check('typing next to the window leaves the window where it is', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  assert.equal(keydown('f', { target: composer }), false, 'the letter belongs to the field')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the window stays up while you type')
  tap('Escape')
})

check('losing the window leaves the task window up', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  for (const l of listeners.slice()) if (l.type === 'blur') l.fn({})
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'alt-tabbing away must not take it down')
  // The tab going away is the same story as the window going away.
  fire('visibilitychange', { type: 'visibilitychange', target: fakeDocument })
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'nor may switching tabs')
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'Escape still closes it')
})

check('the task-window key stays inert while the composer has focus', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  const swallowed = keydown('f', { target: composer })
  assert.equal(swallowed, false, 'f must reach the composer untouched')
  assert.equal(fakeWindow.__dshVim.palette().open, false)
})

check('Escape takes focus back out of the composer', () => {
  fakeDocument.activeElement = composer
  keydown('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 0, 'a focused composer withholds the scroll keys')
  keydown('Escape')
  assert.equal(blurCount, 1, 'Escape must blur the composer')
  assert.equal(fakeDocument.activeElement, body)
  keydown('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > 0, 'and the scroll keys must work again straight away')
})

check('Escape the shell already claimed is left to the shell', () => {
  fakeDocument.activeElement = composer
  keydown('Escape', { defaultPrevented: true })
  assert.equal(blurCount, 0, 'a handled Escape must not steal focus')
  assert.equal(fakeDocument.activeElement, composer)
})

check('Escape only blurs a focused editable', () => {
  fakeDocument.activeElement = button
  keydown('Escape')
  assert.equal(blurCount, 0, 'a focused button is not the composer')
  fakeDocument.activeElement = composer
  keydown('Escape', { shiftKey: true })
  assert.equal(blurCount, 0, 'a modified Escape is a different gesture')
  keydown('Escape', { key: 'd' })
  assert.equal(blurCount, 0, 'other keys are untouched')
})

check('the Escape gesture can be turned off', () => {
  fakeWindow.__dshVim.update({ escapeBlurs: false })
  assert.equal(fakeWindow.__dshVim.settings().escapeBlurs, false)
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0, 'the setting must actually gate the blur')
})

check('the settings page exposes the Escape gesture', () => {
  const choice = settingsElements().find(
    (e) => Array.isArray(e.props.options) && e.props.options.some((o) => o.value === 'on')
  )
  assert.ok(choice, 'the toggle must be on the page')
  assert.equal(choice.props.value, 'on', 'shipped default is on')
  choice.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().escapeBlurs, false)
  choice.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().escapeBlurs, true)
})

check('arriving never leaves the caret in the message box', () => {
  // The host focuses the box from a render effect on first load, on a switch
  // and when a run ends. All three arrive here the same way: a focusin with no
  // gesture behind it.
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the box must give the keyboard back')
  assert.equal(fakeDocument.activeElement, body, 'and the scroll keys must already work')
  tap('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > 0, 'no key press needed to be productive again')
})

check('switching from the task window leaves focus out of the message box', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  tap('Enter')
  assert.deepEqual(opened, ['a'], 'the selected conversation opens')
  // The box is focused from a render effect, so it arrives after the switch
  // returned; the switch itself must not license it either.
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the switch must not hand the box the keyboard')
  assert.equal(fakeDocument.activeElement, body)
})

check('the box never takes the keyboard by itself, however long it waits', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  tap('Enter')
  clock.advance(5000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the rule stands, it is not a window that expires')
  assert.equal(fakeDocument.activeElement, body)
  // A run ending is the other moment the host reaches for the box.
  clock.advance(30000)
  shellFocus(editor)
  assert.equal(editorBlurs, 2, 'and it holds for the end of a turn too')
})

check('a clipboard tool that brings the window forward keeps the caret', () => {
  // Ditto and the dictation tools work by bringing this window to the front and
  // then *typing* Ctrl+V — they never click into the box. The focus that lands
  // there is theirs, a side effect of the return, and it has to survive long
  // enough for the key they are about to press; refusing it is what made the
  // automatic paste land nowhere while a manual Ctrl+V still worked.
  blurWindow()
  refocusWindow()
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'the box keeps the caret the tool is about to paste into')
  assert.equal(fakeDocument.activeElement, editor, 'which is where the paste goes')
  // The key itself is a chord, so the plugin never claims it.
  assert.equal(keydown('v', { target: editor, ctrlKey: true }), false, 'Ctrl+V is left to the host')
})

check('a focus long after the return is still given back', () => {
  // The licence is for the moment of returning, not for the rest of the session:
  // the shell's render effect reaching for the box a while later is the same
  // rule as ever.
  blurWindow()
  refocusWindow()
  clock.advance(2000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'a late focus is not the tail of the return')
  assert.equal(fakeDocument.activeElement, body, 'so the scroll keys stay live')
})

check('the returned window does not license the box forever', () => {
  // One return, one grace: a focus arriving without a return of its own still
  // meets the standing rule, so the "your fingers get it back" promise holds.
  blurWindow()
  refocusWindow()
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'the tool keeps the caret it asked for')
  clock.advance(2000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the next unrequested focus is refused again')
})

// --- what a send does to the keyboard ---------------------------------------

check('sending hands the keyboard back to the page', () => {
  // The box holds DOM focus across a send: the host's own focus lands on the
  // element it is already on, which changes nothing and raises no focusin. The
  // guard on focus events has nothing to catch here, so this one moment is
  // answered by a blur of the plugin's own — and the caret the typing had
  // licensed is spent by the send that made the draft leave.
  tap(' ')
  editor.textContent = 'a message'
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, false, 'the key is still the host\'s to send with')
  clock.advance(1)
  assert.equal(editorBlurs, 1, 'the box must give the keyboard back')
  assert.equal(fakeDocument.activeElement, body, 'and no Escape is needed to be productive again')
  tap('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > 0, 'd scrolls on the very next keypress')
  // The key this started from: f is a letter the box would otherwise swallow.
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and f opens the task window')
  editor.textContent = ''
})

check('a host focus behind the send is refused like any other', () => {
  tap(' ')
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  // The shell reaching for the box a beat later is nothing the send licensed,
  // so the standing rule answers it on its own.
  shellFocus(editor)
  clock.advance(500)
  assert.equal(editorBlurs, 1, 'one blur, whichever of the two gets there first')
  assert.equal(fakeDocument.activeElement, body)
  editor.textContent = ''
})

check('asking for the keyboard again vetoes the hand-back', () => {
  tap(' ')
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  // A user who wants to keep writing asks for the box again before the probes
  // land; that is a veto, not a suggestion.
  tap(' ')
  clock.advance(500)
  assert.equal(fakeDocument.activeElement, editor, 'the box keeps what was asked for')
  assert.equal(editorBlurs, 0, 'so nothing pulls the caret back out of it')
  editor.textContent = ''
})

check('three keys that look like a send are not one', () => {
  tap(' ')
  // An empty box: Enter has nothing to send, so the caret stays.
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'nothing typed, nothing sent')
  assert.equal(fakeDocument.activeElement, editor)

  // A candidate list: Enter takes the highlighted entry and keeps the draft.
  editor.textContent = '/plan'
  menuOnScreen = true
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'the list arbitrates the key, so the box keeps it')
  menuOnScreen = false

  // A line break: the message is not going anywhere.
  keydown('Enter', { target: editor, shiftKey: true })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'breaking a line must not take the keyboard')
  editor.textContent = ''
})

check('a key an IME is assembling is never read as a send', () => {
  tap(' ')
  editor.textContent = '半个'
  // Taking the caret away mid-word would cost the user the input they are
  // still composing, which is the one outcome worth any amount of guarding.
  keydown('Enter', { target: editor, isComposing: true })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'the composing key belongs to the IME')
  assert.equal(fakeDocument.activeElement, editor)
  editor.textContent = ''
})

check('Ctrl+Enter sends in every mode, and brings the keyboard back with it', () => {
  // In the other two modes Enter is the plugin's own line break, so the host's
  // accelerator is the only send left — and it has to be seen past the guard
  // that keeps chords out of the page.
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  tap(' ')
  editor.textContent = 'a message'
  const prevented = keydown('Enter', { target: editor, ctrlKey: true })
  assert.equal(prevented, false, 'the host keeps its own send accelerator')
  clock.advance(500)
  assert.equal(editorBlurs, 1, 'and the keyboard still comes back')
  assert.equal(fakeDocument.activeElement, body)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  editor.textContent = ''
})

check('the post-send hand-back is a setting, and off means the host wins', () => {
  fakeWindow.__dshVim.update({ sendBlurs: false })
  tap(' ')
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'the caret may stay in the box')
  assert.equal(fakeDocument.activeElement, editor, 'exactly as the host left it')
  fakeWindow.__dshVim.update({ sendBlurs: true })
  editor.textContent = ''
})

check('a plain field is never touched, only the rich-text box', () => {
  // A settings panel or a sidebar search that focuses its own input when it
  // opens is the host's business: only the box that swallows d / e / f is
  // protected, and in this host that is the one rich-text editor there is.
  const field = el({ tag: 'INPUT', className: 'search-field' })
  shellFocus(field)
  assert.equal(fakeDocument.activeElement, field, 'an input keeps its focus')
  shellFocus(composer)
  assert.equal(fakeDocument.activeElement, composer, 'a plain textarea keeps it too')
})

check('a field inside a dialog may take focus for itself', () => {
  shellFocus(modalEditor)
  assert.equal(fakeDocument.activeElement, modalEditor, 'a dialog is a shell of its own')
  assert.equal(editorBlurs, 0)
})

check('the focus key puts the keyboard in the message box', () => {
  const swallowed = tap(' ')
  assert.ok(swallowed, 'the key belongs to the plugin, not to the page')
  assert.equal(fakeDocument.activeElement, editor, 'and it lands in the box')
  // The request made on the way in means a focus arriving right after is still
  // the user's, so the guard leaves the box alone.
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'typing must not be interrupted by the guard')
  assert.equal(fakeDocument.activeElement, editor)
})

check('the focus key is dead while a text field holds focus', () => {
  fakeDocument.activeElement = composer
  const before = blurCount
  const swallowed = keydown(' ', { target: composer })
  assert.equal(swallowed, false, 'space must reach the field as a character')
  assert.equal(blurCount, before, 'only the rich-text box may be left this way')
  assert.notEqual(fakeDocument.activeElement, editor)
})

check('Space still presses a focused button', () => {
  fakeDocument.activeElement = button
  const swallowed = keydown(' ', { target: button })
  assert.equal(swallowed, false, 'a focused button keeps its own Space')
  assert.notEqual(fakeDocument.activeElement, editor, 'and nothing jumps to the box')
})

check('the focus key leaves the empty message box', () => {
  fakeDocument.activeElement = editor
  const before = editorBlurs
  const scrolled = transcript.scrollTop
  const swallowed = tap(' ')
  assert.equal(swallowed, true, 'the key belongs to the plugin, not to the box')
  assert.equal(editorBlurs, before + 1, 'an empty box must give the keyboard back')
  assert.equal(fakeDocument.activeElement, body, 'and the caret must be out of it')
  assert.equal(fakeWindow.__dshVim.probe().composer.empty, true, 'the box must read as empty')
  tap('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > scrolled, 'the scroll keys come back with the focus')
})

check('the focus key types a Space once the box has something in it', () => {
  editor.textContent = 'working on it'
  fakeDocument.activeElement = editor
  const before = editorBlurs
  const swallowed = keydown(' ', { target: editor })
  assert.equal(swallowed, false, 'Space must reach the box as a character')
  assert.equal(editorBlurs, before, 'a draft must not cost the user their keyboard')
  assert.equal(fakeDocument.activeElement, editor)
  editor.textContent = ''
  fakeDocument.activeElement = body
})

check('a box of nothing but whitespace still counts as empty', () => {
  // An empty Lexical root is a paragraph with a line break in it, so the blank
  // text that arrives here is the shape of "nothing typed".
  editor.textContent = '\n\n'
  fakeDocument.activeElement = editor
  const before = editorBlurs
  const swallowed = tap(' ')
  assert.equal(swallowed, true)
  assert.equal(editorBlurs, before + 1, 'blank text is not a draft')
  editor.textContent = ''
  fakeDocument.activeElement = body
})

check('holding the focus key does not toggle the box in and out', () => {
  fakeDocument.activeElement = editor
  assert.equal(tap(' '), true, 'the first press leaves the empty box')
  assert.equal(fakeDocument.activeElement, body)
  const before = editorBlurs
  const swallowed = keydown(' ', { repeat: true })
  assert.equal(swallowed, true, 'a repeat is not a second press, and not a page scroll')
  assert.equal(fakeDocument.activeElement, body, 'so the box must stay out of the way')
  assert.equal(editorBlurs, before)
  // A box that kept its focus is a different story: there the repeats are
  // characters, and the plugin must not get in their way.
  editor.textContent = 'still typing'
  fakeDocument.activeElement = editor
  assert.equal(keydown(' ', { repeat: true, target: editor }), false, 'Space keeps working in a draft')
  editor.textContent = ''
  fakeDocument.activeElement = body
})

check('the leave gesture follows the rebound focus key', () => {
  fakeWindow.__dshVim.update({ focusKey: 'b' })
  fakeDocument.activeElement = editor
  const before = editorBlurs
  assert.equal(tap('b'), true, 'the new key leaves the empty box too')
  assert.equal(editorBlurs, before + 1)
  // The old key is only ever a character from here on.
  fakeDocument.activeElement = editor
  const kept = editorBlurs
  assert.equal(keydown(' ', { target: editor }), false, 'the old key is a plain Space again')
  assert.equal(editorBlurs, kept, 'and it must not take the box away')
  fakeDocument.activeElement = body
  fakeWindow.__dshVim.update({ focusKey: ' ' })
})

check('the leave gesture can be turned off', () => {
  fakeWindow.__dshVim.update({ spaceBlurs: false })
  assert.equal(fakeWindow.__dshVim.settings().spaceBlurs, false)
  fakeDocument.activeElement = editor
  const before = editorBlurs
  assert.equal(keydown(' ', { target: editor }), false, 'the setting must gate the gesture')
  assert.equal(editorBlurs, before, 'the box keeps the keyboard')
  assert.equal(fakeDocument.activeElement, editor)
  fakeDocument.activeElement = body
  fakeWindow.__dshVim.update({ spaceBlurs: true })
})

check('clicking the box asks for it, clicking elsewhere takes the offer back', () => {
  press(editor)
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'a press inside a field is a request')
  assert.equal(fakeDocument.activeElement, editor)
  // Clicking a conversation a moment later supersedes that request.
  press(sidebar)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the next focus is the host talking, not the user')
  assert.equal(fakeDocument.activeElement, body)
})

check('a request the window outlives is not honoured', () => {
  tap(' ')
  assert.equal(fakeDocument.activeElement, editor)
  clock.advance(2000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the user has moved on, so the host is refused again')
})

check('the focus key is rebindable, and cannot collide with the scroll keys', () => {
  const rejected = fakeWindow.__dshVim.update({ focusKey: 'd' })
  assert.equal(rejected.error, 'conflict', 'a scroll key must not double as the focus key')
  assert.equal(fakeWindow.__dshVim.settings().focusKey, ' ')

  const applied = fakeWindow.__dshVim.update({ focusKey: 'b' })
  assert.equal(applied.focusKey, 'b')
  tap('b')
  assert.equal(fakeDocument.activeElement, editor, 'the new key focuses the box')
  fakeDocument.activeElement = body
  tap(' ')
  assert.notEqual(fakeDocument.activeElement, editor, 'and the old one stops doing it')
  fakeWindow.__dshVim.update({ focusKey: ' ' })
})

check('the no-auto-focus behaviour can be turned off', () => {
  fakeWindow.__dshVim.update({ switchBlurs: false })
  assert.equal(fakeWindow.__dshVim.settings().switchBlurs, false)
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'the setting must actually gate the guard')
  assert.equal(fakeDocument.activeElement, editor, 'and the host behaviour comes back')
})

check('the settings page exposes every focus behaviour', () => {
  const toggles = settingsElements().filter(
    (e) => Array.isArray(e.props.options) && e.props.options.some((o) => o.value === 'on')
  )
  assert.equal(toggles.length, 4, 'Escape, the empty box, the switch and the post-send hand-back each get a toggle')
  assert.deepEqual(
    toggles.map((t) => t.props.value),
    ['on', 'on', 'on', 'on'],
    'all four ship on'
  )
  const byLabel = (key) => toggles.find((t) => t.props.label === expectedLabel(key))
  assert.ok(byLabel('escapeBlurs'), 'the Escape toggle must be on the page')
  const spaceToggle = byLabel('spaceBlurs')
  assert.ok(spaceToggle, 'the empty-box toggle must be on the page')
  spaceToggle.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().spaceBlurs, false)
  spaceToggle.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().spaceBlurs, true)
  const switchToggle = byLabel('switchBlurs')
  assert.ok(switchToggle, 'the switch toggle must be on the page')
  switchToggle.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().switchBlurs, false)
  switchToggle.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().switchBlurs, true)
  const sendToggle = byLabel('sendBlurs')
  assert.ok(sendToggle, 'the post-send hand-back toggle must be on the page')
  sendToggle.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().sendBlurs, false)
  sendToggle.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().sendBlurs, true)
})

check('Escape stays the shell\'s while a turn is running', () => {
  // The shell identifies the visible conversation by main-view retention.
  seed([
    { id: 'main', displayTitle: 'the visible one', updatedAt: ago(1), retainedBy: { mainView: 1 } },
    { id: 'other', displayTitle: 'a background one', updatedAt: ago(2), running: true },
  ])
  statusFeed.put('main', { running: true })
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0, 'the plugin must not touch Escape while a turn is in flight')
  assert.equal(fakeDocument.activeElement, composer, 'so the shell can stop the turn')

  // Only the visible conversation counts. A background run must not disarm it.
  statusFeed.put('main', { running: false })
  statusFeed.put('other', { running: true })
  keydown('Escape')
  assert.equal(blurCount, 1, 'a running background conversation is none of our business')
})

check('the catalogue running flag is the fallback when no status is published', () => {
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 }, running: true }])
  assert.equal(statusFeed.map.size, 0, 'no status entry, so the catalogue has to answer')
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0, 'a running turn must be protected even without the status source')
})

check('Escape takes focus back once the run is over', () => {
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 }, running: true }])
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0)
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 }, running: false }])
  keydown('Escape')
  assert.equal(blurCount, 1, 'the block is only while it is actually running')
})

check('the empty box can be left mid-run, where Escape cannot', () => {
  // The shell stops a running turn on Escape, so the plugin stays out of that
  // key. The focus key never reaches the shell, which is what makes it the way
  // out of the box while work is in flight — the moment it is worth most.
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 } }])
  statusFeed.put('main', { running: true })
  fakeDocument.activeElement = editor
  const before = editorBlurs
  assert.equal(tap(' '), true, 'the key must not be left to the shell here')
  assert.equal(editorBlurs, before + 1, 'the empty box gives the keyboard back')
  assert.equal(fakeDocument.activeElement, body)
  statusFeed.put('main', { running: false })
})

// --- the reasoning level ----------------------------------------------------

/**
 * The last transient notice the plugin put on the page, or null when it is not
 * showing.
 * @returns {string|null} the line, or null.
 */
function toastText() {
  const node = toastNode()
  return node ? node.textContent : null
}

/**
 * The notice element itself, or null when none is showing.
 * @param {string} text - the line the notice must be carrying, to tell the
 *   transient pill and the standing hint apart.
 * @returns {object|null} the notice element.
 */
function toastNode(text) {
  for (const child of body.children.slice().reverse()) {
    if (child.getAttribute('role') === 'status') return child
    for (const inner of child.children) {
      if (inner.getAttribute('role') !== 'status') continue
      if (text === undefined || inner.textContent === text) return inner
    }
  }
  return null
}

/**
 * The fixed host a notice is placed in, or null when none is showing.
 * @param {string} text - the line its notice must be carrying.
 * @returns {object|null} the host element.
 */
function toastHost(text) {
  for (const child of body.children.slice().reverse()) {
    if (child.children.some((inner) => inner.getAttribute('role') === 'status')) {
      if (text === undefined) return child
      if (child.children.some((inner) => inner.textContent === text)) return child
    }
  }
  return null
}

/** A conversation on screen, the way the shell's own shortcuts see it. */
function seedVisible(id = 'main') {
  seed([{ id, displayTitle: 'the visible one', updatedAt: ago(1), retainedBy: { mainView: 1 } }])
}

await checkAsync('the reasoning key steps the level and leaves the model alone', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  assert.equal(tap('q'), true, 'q belongs to the plugin on this page')
  await flush()
  assert.deepEqual(
    MODEL.calls,
    [{ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }],
    'the next level, on the same provider and model'
  )
  assert.equal(
    toastText(),
    expectedLabel('effort') + ' 中  2/3',
    'the notice names the level and where it sits, so a press can be read back'
  )
})

await checkAsync('the reasoning key walks the levels and wraps around', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  for (let i = 0; i < 4; i++) {
    tap('q')
    await flush()
  }
  assert.deepEqual(
    MODEL.calls.map((call) => call.reasoningEffort),
    ['medium', 'high', 'low', 'medium'],
    'every press steps once and the end wraps to the start'
  )
  for (const call of MODEL.calls) {
    assert.deepEqual(
      [call.provider, call.model],
      ['deepseek', 'deepseek-reasoner'],
      'the model is never part of the step'
    )
  }
})

await checkAsync('a press while a submit is in flight still steps forward', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  MODEL.hold = true
  tap('q')
  await flush()
  tap('q')
  await flush()
  assert.deepEqual(
    MODEL.calls.map((call) => call.reasoningEffort),
    ['medium', 'high'],
    'the pending selection answers the next press, so holding the key walks the levels'
  )
  MODEL.settle()
  await flush()
  MODEL.settle()
  await flush()
})

await checkAsync('the level in effect falls back to the model default', async () => {
  seedVisible()
  // No explicit effort: the model's own default is what is in effect, exactly as
  // the composer's Effort row reads it — so the first step is the one after it.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner' }, REASONING)
  tap('q')
  await flush()
  assert.deepEqual(MODEL.calls.map((call) => call.reasoningEffort), ['high'], 'medium is the default, high is next')
})

await checkAsync('a model with no levels says so instead of guessing', async () => {
  seedVisible()
  // No Effort row for this model: the adapter publishes no reasoning metadata,
  // which is what the directory reports as `undefined`.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('q')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'nothing may be submitted without levels to submit')
  assert.equal(toastText(), expectedLabel('effortNone'), 'and the press is answered all the same')
})

await checkAsync('a rejected selection keeps its reason on screen', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  MODEL.results.push({ ok: false, error: { code: 'busy', message: 'another writer holds this session' } })
  tap('q')
  await flush()
  assert.equal(MODEL.calls.length, 1, 'the attempt was made')
  assert.equal(
    toastText(),
    expectedLabel('effortFailed') + ': another writer holds this session',
    'the host reason is on screen, not swallowed'
  )
})

await checkAsync('without a conversation on screen there is nothing to step', async () => {
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  seed([])
  tap('q')
  await flush()
  assert.deepEqual(MODEL.calls, [])
  assert.equal(toastText(), expectedLabel('noSession'))
})

await checkAsync('the reasoning key is a plain letter inside a field', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  assert.equal(keydown('q', { target: editor }), false, 'the composer keeps its own letters')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'so nothing may be submitted from in there')
  // The name box in the task window is the same story.
  tap('f')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the name box must be open')
  assert.equal(keydown('q', { target: box }), false, 'the name box keeps every letter too')
  await flush()
  assert.deepEqual(MODEL.calls, [])
  tap('Escape')
  tap('Escape')
})

await checkAsync('auto-repeat does not turn one press into a stream of selections', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  assert.equal(keydown('q', { repeat: true }), true, 'the held key is still ours, not the page scroll')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'but it is not a second press')
})

await checkAsync('the notice floats just above the message box', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  // The box the reader is looking at, sitting 260px down a 900px window.
  editor.__rect = { top: 260, left: 300, width: 600, height: 120, right: 900, bottom: 380 }
  // The plugin remembers the box from a focus; the shell hands the caret back
  // and the plugin lets it go, which is exactly the state it runs in.
  shellFocus(editor)
  fakeDocument.activeElement = body
  tap('q')
  await flush()
  const host = toastHost()
  assert.ok(host, 'the notice must be on the page')
  assert.equal(host.style.position, 'fixed', 'the notice is placed against the window, not the flow')
  assert.equal(host.style.pointerEvents, 'none', 'and it must never swallow a click meant for the box')
  assert.equal(
    host.style.bottom,
    'calc(100vh - 260px + 10px)',
    'the host is lifted to the top edge of the message box, plus a small gap'
  )
  // A composer that moves takes the notice with it: the box is measured per
  // notice, because it grows and shrinks as the draft does.
  editor.__rect = { top: 420, left: 300, width: 600, height: 160, right: 900, bottom: 580 }
  tap('q')
  await flush()
  assert.equal(host.style.bottom, 'calc(100vh - 420px + 10px)', 'a press re-measures the box')
})

await checkAsync('with no box to sit above, the notice falls back to the top edge', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  // A host with no rich-text editor at all: the box the plugin had seen goes
  // away with the page it belonged to, and there is no landmark left to float
  // against — but the press still has to be readable.
  editor.isConnected = false
  editor.isContentEditable = false
  fakeDocument.querySelector = () => null
  tap('q')
  await flush()
  const host = toastHost()
  assert.ok(host, 'the notice must still be on the page')
  assert.equal(host.style.bottom, 'calc(100vh - 12px)', 'so it keeps a small margin from the top of the window')
})

check('the reasoning key can be rebound, and cannot collide with the page keys', () => {  const rejected = fakeWindow.__dshVim.update({ effortKey: 'd' })
  assert.equal(rejected.error, 'conflict', 'a scroll key must not double as the reasoning key')
  assert.equal(rejected.value, undefined)
  assert.equal(fakeWindow.__dshVim.settings().effortKey, 'q')

  const applied = fakeWindow.__dshVim.update({ effortKey: 'z' })
  assert.equal(applied.effortKey, 'z', 'a free key is accepted')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'd', 'and the other seats are untouched')
})

// --- the switchable models ---------------------------------------------------

/** A catalog with three providers, shaped exactly as the host builds it. */
const CATALOG = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', reasoning: REASONING },
    ],
  },
  {
    id: 'bunny',
    name: 'Space Bunny',
    models: [{ id: 'bunny-free', name: 'Space Bunny Free' }],
  },
  {
    id: 'kimi',
    name: 'Moonshot',
    models: [
      {
        id: 'kimi-k2',
        name: 'Kimi K2',
        reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }] },
      },
    ],
  },
]

/** The configured list used by most checks below. */
const FAVORITES = [
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'deepseek', model: 'deepseek-reasoner' },
  { provider: 'bunny', model: 'bunny-free' },
]

/** Configure the list the way the settings page would. */
function useFavorites(list) {
  fakeWindow.__dshVim.update({ favorites: list })
}

/** Every selection submitted so far, as `provider/model` strings. */
function submittedRoutes() {
  return MODEL.calls.map((call) => `${call.provider}/${call.model}`)
}

// --- the model picker --------------------------------------------------------

/**
 * The picker's card, or null when no picker is up.
 *
 * It is told apart from the task window by its own aria-label rather than by
 * being the last child of `body`: both can be mounted, and a check that reads
 * the wrong one would pass while the thing it meant to test was absent.
 * @returns {object|null} the card element.
 */
function modelPickPanel() {
  for (const child of body.children.slice().reverse()) {
    for (const inner of child.children) {
      if (inner.getAttribute('aria-label') === expectedLabel('modelPick')) return inner
    }
  }
  return null
}

/** The rows of the open picker, in order. */
function modelPickRows() {
  const panel = modelPickPanel()
  if (!panel) return []
  const list = panel.children[1]
  return list ? list.children.slice() : []
}

/**
 * One node of a picker row, by the role it carries.
 *
 * Read by role rather than by position, and searched over the whole row: the
 * `current` tag and the name share the name cell, so their roles are nested a
 * level down. A check that counted children would silently read the wrong node
 * the next time the row is reshaped — which is exactly the kind of quiet
 * breakage a suite is supposed to catch.
 * @param {object} row - a picker row.
 * @param {string} role - `here`, `name`, `nameText`, `levels`, `provider`, `level` or `landed`.
 * @returns {object|null} the node.
 */
function modelPickCell(row, role) {
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (child.getAttribute('data-role') === role) return child
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(row)
}

/**
 * The model name printed on each picker row.
 *
 * The `current` tag shares the name cell, so the name is that cell's own span.
 */
function modelPickNames() {
  return modelPickRows().map((row) => modelPickCell(row, 'nameText').textContent)
}

/** Whether a picker row carries the `current` tag. */
function modelPickRowIsHere(row) {
  const tag = row.children[0].children.find((cell) => cell.getAttribute('data-role') === 'here')
  return !!tag && tag.textContent === expectedLabel('modelPickHere')
}

/**
 * The level chips of one picker row, in order.
 *
 * Only the selected row draws chips; every other row carries a single landing
 * level instead, and answers with an empty list here.
 * @param {object} row - a picker row.
 * @returns {Array} the chips.
 */
function modelPickLevelChips(row) {
  const cell = modelPickCell(row, 'levels')
  if (!cell) return []
  return cell.children.filter((chip) => chip.getAttribute('data-role') === 'level')
}

/**
 * The level an unselected row says it would land on, or null when the row draws
 * chips (or says it has none).
 * @param {object} row - a picker row.
 * @returns {string|null} the landing level's name.
 */
function modelPickLanded(row) {
  const cell = modelPickCell(row, 'levels')
  if (!cell) return null
  const land = cell.children.find((chip) => chip.getAttribute('data-role') === 'landed')
  return land ? land.textContent : null
}

/** The level names drawn on one picker row. */
function modelPickLevelNames(row) {
  return modelPickLevelChips(row).map((chip) => chip.textContent)
}

/**
 * The level marked on one picker row, or null when none is.
 *
 * A mark is the violet chip style; the row of the model in effect carries the
 * same style, which is exactly the point — there, the mark and the current level
 * are the same level.
 */
function modelPickLevelOn(row) {
  const chip = modelPickLevelChips(row).find(
    (c) => c.style.background === 'rgba(196, 181, 253, 0.22)'
  )
  return chip ? chip.textContent : null
}

/**
 * The text of each picker row, in document order.
 *
 * The `current` tag leads the row now, so its text is part of this — that is
 * what makes the order itself assertable.
 */
function modelPickRowText() {
  return modelPickRows().map((row) => row.children.map((cell) => cell.textContent).join(' '))
}

/** Which picker row is marked selected, or -1. */
function modelPickSelected() {
  return modelPickRows().findIndex((row) => row.style.background === 'rgba(255, 255, 255, 0.14)')
}

/** The picker's footer line, or null when it is not up. */
function modelPickFooter() {
  const panel = modelPickPanel()
  return panel ? panel.children[2].textContent : null
}

await checkAsync('the model key opens a picker instead of walking the list', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'kimi', model: 'kimi-k2' })
  assert.equal(modelPickPanel(), null, 'nothing is up before the key is pressed')
  assert.equal(tap('w'), true, 'w belongs to the plugin on this page')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'opening is a read: it must submit nothing')
  assert.notEqual(modelPickPanel(), null, 'the picker is up')
  assert.equal(modelPickRows().length, 3, 'every configured model is on it')
  assert.equal(
    modelPickSelected(),
    0,
    'a conversation off the list starts on the first entry rather than nowhere'
  )
})

await checkAsync('the picker opens on the model in effect and tags it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'bunny', model: 'bunny-free' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 2, 'the selection starts on the model in effect')
  const rows = modelPickRows()
  assert.ok(modelPickRowIsHere(rows[2]), 'and that row carries the tag')
  assert.ok(!modelPickRowIsHere(rows[0]), 'no other row does')
  // The tag rides inside the name cell, in front of the name.
  assert.equal(
    modelPickCell(rows[2], 'nameText').textContent,
    'Space Bunny Free',
    'the tagged row names its model'
  )
  assert.equal(
    rows[2].children[0].children[0].getAttribute('data-role'),
    'here',
    'the tag leads the name inside its cell'
  )
  assert.equal(
    rows[2].children[0].children[1].getAttribute('data-role'),
    'nameText',
    'and the name follows it'
  )
  assert.equal(
    rows[0].children[0].children.length,
    1,
    'an untagged row carries no tag, rather than an empty one holding the column'
  )
  assert.equal(modelPickCell(rows[0], 'nameText').textContent, 'DeepSeek Chat', 'a row names its model')
  assert.equal(modelPickCell(rows[0], 'provider').textContent, 'deepseek', 'and names its provider')
  // The row is three cells: name, levels, provider.
  assert.deepEqual(
    rows[0].children.map((c) => c.getAttribute('data-role')),
    ['name', 'levels', 'provider'],
    'a row is name, levels, provider'
  )
  // A model that publishes no levels says so; the selected row draws its chips.
  assert.deepEqual(
    modelPickLevelNames(rows[2]),
    [],
    'the row with no levels draws no chips'
  )
  assert.equal(
    modelPickCell(rows[2], 'levels').textContent,
    expectedLabel('modelPickNoLevel'),
    'and says so in words instead of showing an empty cell'
  )
})

await checkAsync('d and e move the selection and wrap at both ends', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 0, 'the model in effect is where it starts')
  tap('d')
  assert.equal(modelPickSelected(), 1, 'd goes down')
  tap('e')
  assert.equal(modelPickSelected(), 0, 'e comes back up')
  tap('e')
  assert.equal(modelPickSelected(), 2, 'and up from the first wraps to the last')
  tap('d')
  assert.equal(modelPickSelected(), 0, 'as does down from the last')
  assert.deepEqual(MODEL.calls, [], 'moving is not choosing: nothing is submitted')
})

await checkAsync('every level is laid out flat on one line', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  const row = modelPickRows()[1]
  const cell = modelPickCell(row, 'levels')
  assert.ok(cell, 'the level cell must be on the row')
  assert.equal(cell.style.display, 'flex', 'the levels are a flex row')
  assert.equal(cell.style.flexWrap, 'nowrap', 'and they must not wrap onto a second line')
  assert.equal(cell.style.justifyContent, 'flex-start', 'they pack from the start of the leftover width')
  assert.equal(cell.style.minWidth, '0', 'the cell may shrink rather than push the provider off the row')
  // The cell clips what does not fit: a level that cannot fit is a cheaper thing
  // to lose than the provider column, which is also a fact about the row.
  assert.equal(cell.style.overflow, 'hidden', 'the level cell clips its own overflow')
  for (const chip of modelPickLevelChips(row)) {
    assert.equal(chip.style.flex, '0 0 auto', 'a chip must not be squeezed by the cell shrinking')
  }
  // The levels track must be able to shrink. A bare `1fr` carries an automatic
  // minimum of its content's min-content width, and a non-wrapping level row's
  // min-content is every chip added together — the track would refuse to shrink,
  // the row would overrun the card, and the card's overflow would eat the
  // provider column.
  assert.equal(
    row.style.gridTemplateColumns,
    'minmax(0, auto) minmax(0, 1fr) auto',
    'the levels track is a shrinkable 1fr, so the row cannot overrun the card'
  )
  // The row is three cells in the order the eye reads them.
  assert.deepEqual(
    row.children.map((c) => c.getAttribute('data-role')),
    ['name', 'levels', 'provider'],
    'the row reads name, levels, provider'
  )
  // Only the selected row draws its whole scale; the rest say where they land.
  assert.deepEqual(modelPickLevelNames(row), ['低', '中', '高'], 'the selected row lists every level')
  assert.equal(
    modelPickLanded(modelPickRows()[0]),
    expectedLabel('modelPickNoLevel'),
    'a row with no levels says so on any row'
  )
  // Move down to Space Bunny Free: the row just left stops listing its scale,
  // and the newly selected row says where it would land instead.
  tap('d')
  assert.equal(modelPickSelected(), 2, 'on the row that publishes no levels')
  assert.equal(
    modelPickLanded(modelPickRows()[1]),
    '中',
    'the row left behind names the level it would land on instead of listing them'
  )
  assert.deepEqual(modelPickLevelNames(modelPickRows()[1]), [], 'and draws no chips')
  assert.equal(
    modelPickLanded(modelPickRows()[2]),
    expectedLabel('modelPickNoLevel'),
    'the newly selected row says it has no levels'
  )
  tap('Escape')
})

await checkAsync('an unselected row says only which level it would land on', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites([{ provider: 'deepseek', model: 'deepseek-reasoner' }, { provider: 'deepseek', model: 'deepseek-chat' }])
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  // On the reasoner, with `high` in effect: it lists its whole scale.
  assert.deepEqual(modelPickLevelNames(modelPickRows()[0]), ['低', '中', '高'], 'the selected row lists its levels')
  assert.equal(modelPickLevelOn(modelPickRows()[0]), '中', 'with the one in effect lit')
  // Move to the chat model, which publishes none, and back: the reasoner now
  // says where it would land instead of listing everything.
  tap('d')
  assert.deepEqual(modelPickLevelNames(modelPickRows()[0]), [], 'the row left behind draws no chips')
  assert.equal(
    modelPickLanded(modelPickRows()[0]),
    '中',
    'it names the level it would land on instead'
  )
  tap('e')
  assert.deepEqual(modelPickLevelNames(modelPickRows()[0]), ['低', '中', '高'], 'and the row chosen again lists them all')
  assert.equal(modelPickLanded(modelPickRows()[0]), null, 'with no landing word beside them')
  tap('Escape')
})

await checkAsync('Shift with a movement key reorders the row, and the order is remembered', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.deepEqual(modelPickNames(), ['DeepSeek Chat', 'DeepSeek Reasoner', 'Space Bunny Free'], 'the list starts in its configured order')
  // Shift + down moves the row itself, and the selection stays on the model.
  tap('d', { shiftKey: true })
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Reasoner', 'DeepSeek Chat', 'Space Bunny Free'],
    'the row moved down one place'
  )
  assert.equal(modelPickSelected(), 1, 'and the selection stayed on the model that moved')
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites.slice(0, 3),
    [
      { provider: 'deepseek', model: 'deepseek-reasoner' },
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'bunny', model: 'bunny-free' },
    ],
    'and the order was written into the configured list the settings page shows'
  )
  // Shift + up puts it back. The ends refuse rather than wrapping: a row being
  // pushed off the end of the list should stay where it is.
  tap('d', { shiftKey: true })
  assert.deepEqual(modelPickNames(), ['DeepSeek Reasoner', 'Space Bunny Free', 'DeepSeek Chat'], 'moved down again')
  assert.equal(modelPickSelected(), 2, 'the bottom row is now selected')
  tap('d', { shiftKey: true })
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Reasoner', 'Space Bunny Free', 'DeepSeek Chat'],
    'and a move past the end changes nothing'
  )
  tap('e', { shiftKey: true })
  assert.deepEqual(modelPickNames(), ['DeepSeek Reasoner', 'DeepSeek Chat', 'Space Bunny Free'], 'Shift + up moves the row back up')
  // A reorder submits nothing: it is a list edit, not a switch.
  assert.deepEqual(MODEL.calls, [], 'reordering must not switch the model')
  tap('Escape')
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites.slice(0, 3),
    [
      { provider: 'deepseek', model: 'deepseek-reasoner' },
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'bunny', model: 'bunny-free' },
    ],
    'and the order survives the window closing'
  )
  // Reopening shows the same order.
  tap('w')
  await flush()
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Reasoner', 'DeepSeek Chat', 'Space Bunny Free'],
    'so the next time the window opens, the list is as it was left'
  )
  tap('Escape')
  reset()
})

await checkAsync('a model the catalog dropped out keeps its place when the list is reordered', async () => {
  seedVisible()
  // The list holds a model the catalog does not offer, the way a signed-out
  // provider leaves one behind.
  MODEL.offer([
    { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
  ])
  useFavorites([
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'gone', model: 'vanished' },
  ])
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.deepEqual(modelPickNames(), ['DeepSeek Chat'], 'only what the catalog offers is on screen')
  tap('d', { shiftKey: true })
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites,
    [
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'gone', model: 'vanished' },
    ],
    'the unavailable model keeps its place: a reorder is not an edit of a row nobody was looking at'
  )
  tap('Escape')
})

await checkAsync('the window keeps one width, whatever the selection is on', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  const panel = modelPickPanel()
  assert.equal(panel.style.width, 'min(680px, 92vw)', 'the card is one width rather than one per list')
  assert.equal(panel.style.minWidth, undefined, 'with no lower bound that a long name could grow past')
  assert.equal(panel.style.maxWidth, undefined, 'and no content-driven upper bound either')
  // The width must not be a number that changes when the levels change: moving
  // onto a model with a different scale has to leave the card exactly as wide.
  const before = panel.style.width
  tap('d')
  assert.equal(modelPickPanel().style.width, before, 'moving onto a model with levels leaves it as wide')
  tap('d')
  assert.equal(modelPickPanel().style.width, before, 'and moving onto one without them too')
  tap('Escape')
})

await checkAsync('the same key confirms the selection and closes the window', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'the selected model was submitted')
  assert.equal(modelPickPanel(), null, 'and the window is gone')
  assert.equal(toastText(), `${expectedLabel('model')} DeepSeek Reasoner`, 'the notice names it')
})

await checkAsync('Escape cancels without submitting anything', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('Escape')
  assert.equal(modelPickPanel(), null, 'Escape takes the window down')
  assert.deepEqual(MODEL.calls, [], 'and a cancelled choice costs the host nothing')
})

await checkAsync('a picker that was already open is not opened twice', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(keydown('w', { repeat: true }), true, 'a held key is still ours, not the page scroll')
  await flush()
  assert.equal(modelPickSelected(), 0, 'but it is not a second press')
  assert.equal(MODEL.calls.length, 0, 'nor a confirmation')
  tap('Escape')
})

await checkAsync('the picker keeps the keyboard: a stray key does not reach the page', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  // `f` is the task window's key and is not the picker's. The picker answers by
  // swallowing it, so the measure is not that it prevents the default — it is
  // that nothing behind the window acted on it.
  keydown('f', {})
  await flush()
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'no task window appeared behind it')
  assert.notEqual(modelPickPanel(), null, 'the picker is still the one that is up')
  assert.equal(modelPickSelected(), 0, 'and the stray key did not move its selection')
  tap('Escape')
})

await checkAsync('a held model key does not open a second window behind the first', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  const before = modelPickPanel()
  assert.equal(keydown('w', { repeat: true }), true, 'the repeat is the plugin key')
  await flush()
  assert.equal(modelPickPanel(), before, 'and the window it finds open is the same one')
  assert.deepEqual(MODEL.calls, [], 'a held key must not confirm either')
  tap('Escape')
})

await checkAsync('the picker closes on success and stays up on a refusal', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  MODEL.results.push({ ok: false, error: { code: 'busy', message: 'another writer holds this session' } })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.equal(MODEL.calls.length, 1, 'the attempt was made')
  assert.notEqual(modelPickPanel(), null, 'a refused switch leaves the window up to try again')
  assert.equal(
    modelPickFooter(),
    expectedLabel('modelFailed') + ': another writer holds this session',
    'with the host reason readable in its footer, not swallowed'
  )
})

await checkAsync('the picker carries the level over exactly as the walk did', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    'a level the target publishes is carried over'
  )
  // Now the other way. The window reopens on `deepseek-reasoner` — the model
  // just switched to — so one step down reaches `bunny-free`, which publishes
  // no `high` and must therefore be submitted without a level.
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 1, 'it reopens on the model now in effect')
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[1],
    { provider: 'bunny', model: 'bunny-free' },
    'a level the target never published is left off the selection'
  )
  assert.equal('reasoningEffort' in MODEL.calls[1], false, 'not even as an undefined field')
})

await checkAsync('a model the catalog does not offer is not on the picker', async () => {
  seedVisible()
  // `kimi` signed itself out: its group is gone from the catalog entirely.
  MODEL.offer(CATALOG.filter((group) => group.id !== 'kimi'))
  useFavorites([
    ...FAVORITES,
    { provider: 'kimi', model: 'kimi-k2' },
    { provider: 'gone', model: 'never-published' },
  ])
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(modelPickRows().length, 3, 'the unreachable ones are left off the list')
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Chat', 'DeepSeek Reasoner', 'Space Bunny Free'],
    'and the rows read down the list in the configured order, skipping the unreachable ones'
  )
  assert.equal(modelPickRowIsHere(modelPickRows()[0]), true, 'the one in effect is tagged')
  tap('Escape')
})

await checkAsync('every configured model being unavailable says so instead of opening', async () => {
  seedVisible()
  MODEL.offer([])
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'nothing may be submitted')
  assert.equal(modelPickPanel(), null, 'and no empty window is worth opening')
  assert.equal(toastText(), expectedLabel('modelNone'))
})

await checkAsync('an unconfigured list says so instead of opening', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  tap('w')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'a key with nothing configured must not fall through to a default')
  assert.equal(modelPickPanel(), null, 'nor open a window with nothing in it')
  assert.equal(toastText(), expectedLabel('modelEmpty'))
})

await checkAsync('a conversation on its model default submits no level at all', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites([{ provider: 'deepseek', model: 'deepseek-chat' }, { provider: 'deepseek', model: 'deepseek-reasoner' }])
  // Nothing explicit is in effect, so the model's own default is what applies —
  // and there is no level to carry, so the selection must not grow one.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    'a switch must never invent a level the conversation was not on'
  )
  assert.equal('reasoningEffort' in MODEL.calls[0], false, 'not even as an undefined field')
})

await checkAsync('a confirmation while a switch is in flight is not a second one', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  MODEL.hold = true
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'the switch is out')
  // The window freezes while that selection is in flight, so a second confirm
  // cannot race it into two submissions.
  assert.equal(keydown('w', {}), true, 'the key is still the window\'s')
  await flush()
  assert.equal(MODEL.calls.length, 1, 'but it does not submit again')
  MODEL.settle()
  await flush()
})

await checkAsync('the model key is a plain letter inside a field', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  assert.equal(keydown('w', { target: editor }), false, 'the composer keeps its own letters')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'so nothing may be submitted from in there')
  assert.equal(modelPickPanel(), null, 'and no window opens over the draft')
  // The task window is the other place: the model key is a page key, so an open
  // window neither claims it nor hides it.
  tap('f')
  assert.equal(keydown('w', {}), true, 'the task window does not swallow the key')
  await flush()
  assert.notEqual(modelPickPanel(), null, 'the picker opens over it')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the task window stays where it was')
  tap('Escape')
  tap('Escape')
})

await checkAsync('a held model key is not a stream of windows', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  assert.equal(keydown('w', { repeat: true }), true, 'the held key is still ours, not the page scroll')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'but it is not a press')
  assert.equal(modelPickPanel(), null, 'and not a window either')
})

await checkAsync('without a conversation on screen there is nothing to pick', async () => {
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  seed([])
  tap('w')
  await flush()
  assert.deepEqual(MODEL.calls, [])
  assert.equal(modelPickPanel(), null, 'no picker without a conversation to apply it to')
  assert.equal(toastText(), expectedLabel('noSession'), 'the same line the reasoning key uses')
})

await checkAsync('Enter confirms the selection, as the standing alias', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('Enter')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'Enter confirms the selected model')
  assert.equal(modelPickPanel(), null, 'and takes the window down with it')
})

await checkAsync('clicking a row chooses and confirms it in one', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  const rows = modelPickRows()
  // A pointer has no second press of the key, so the click has to be the whole
  // gesture rather than a selection the user then has to confirm.
  const handlers = rows[2].__listeners.click ?? []
  assert.equal(handlers.length, 1, 'the row must carry the click handler')
  handlers[0]({})
  await flush()
  assert.deepEqual(submittedRoutes(), ['bunny/bunny-free'], 'the clicked row is submitted')
  assert.equal(modelPickPanel(), null, 'and the window closes behind it')
})

await checkAsync('Escape during a slow submit leaves the window gone and the result reported', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  // The refusal is queued before the confirm, so the submit that is held is the
  // one that will fail once it lands — which is the case this check is about:
  // the window is gone by then.
  MODEL.results.push({ ok: false, error: { code: 'busy', message: 'the session moved on' } })
  MODEL.hold = true
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'the selection is already out')
  tap('Escape')
  assert.equal(modelPickPanel(), null, 'Escape takes the window down even mid-submit')
  // A refused switch that lands after the window is gone has nowhere in the
  // window to be read, so it must surface on the notice line instead of being
  // swallowed with the window.
  MODEL.settle()
  await flush()
  assert.equal(toastText(), expectedLabel('modelFailed') + ': the session moved on', 'the reason is still said')
  MODEL.hold = false
})

await checkAsync('the picker names the live keys rather than letters it assumes', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  fakeWindow.__dshVim.update({ modelKey: 'm', paletteUpKey: 'k', paletteDownKey: 'j' })
  tap('m')
  await flush()
  const footer = modelPickFooter()
  assert.ok(footer.includes('m'), 'the confirm key is the bound one')
  assert.ok(footer.includes('k') && footer.includes('j'), 'and so are the movement keys')
  assert.equal(footer.includes('w'), false, 'the old binding is not advertised')
  // And the rebound keys are the ones that actually move it.
  tap('j')
  assert.equal(modelPickSelected(), 1, 'the rebound down key moves the selection')
  tap('k')
  assert.equal(modelPickSelected(), 0, 'and so does the rebound up key')
  tap('Escape')
  reset()
})

await checkAsync('the selected row lists its levels with the one in effect lit', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  const rows = modelPickRows()
  // The window opens on the model in effect, so it is the selected row and the
  // one carrying the whole scale.
  assert.deepEqual(modelPickLevelNames(rows[1]), ['低', '中', '高'], 'all three levels of the model in effect are drawn')
  assert.equal(modelPickLevelOn(rows[1]), '中', 'and the one in effect is the lit one')
  // A row with no levels says so wherever it sits.
  assert.equal(
    modelPickCell(rows[0], 'levels').textContent,
    expectedLabel('modelPickNoLevel'),
    'a model with no levels says so in words'
  )
  assert.equal(modelPickLanded(rows[0]), expectedLabel('modelPickNoLevel'), 'and names no landing level')
  tap('Escape')
})

await checkAsync('the level key steps the selected row and wraps, Shift steps back', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 1, 'the model in effect is selected')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'Tab steps to the next level')
  assert.equal(modelPickSelected(), 1, 'without moving the model selection')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '低', 'and wraps at the end')
  tap('Tab', { shiftKey: true })
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'Shift steps the other way')
  // ←/→ are the same move, as fixed aliases.
  tap('ArrowLeft')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'left steps back')
  tap('ArrowRight')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and right steps forward')
  assert.deepEqual(MODEL.calls, [], 'stepping is not choosing: nothing is submitted')
  tap('Escape')
})

await checkAsync('confirming a model at a stepped level submits that level', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  assert.equal(modelPickSelected(), 1, 'on the model with levels')
  // The row starts on the carry-over rule's answer, which for a model whose
  // default is `medium` is `中`; one step from there is `高`.
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'the mark starts where the rule puts it')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'the level was moved')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    'the row and the level it was marked with are submitted together'
  )
  assert.equal(
    toastText(),
    `${expectedLabel('model')} DeepSeek Reasoner · 高`,
    'and the notice names the level as well as the model'
  )
})

await checkAsync('a level carried to a model that publishes it is submitted with it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' })
  tap('w')
  await flush()
  // `deepseek-chat` publishes no levels at all, so a carry-over is impossible
  // and the submission must not grow a level the target never published.
  tap('e')
  assert.equal(modelPickSelected(), 0, 'up to the model with no levels')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-chat' },
    'a target that publishes no level is submitted without one'
  )
  assert.equal('reasoningEffort' in MODEL.calls[0], false, 'not even as an undefined field')
})

await checkAsync('moving between rows drops a level the user had stepped to', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'the level was stepped away from the carry-over')
  tap('d')
  assert.equal(modelPickSelected(), 2, 'moved to the next row')
  tap('e')
  assert.equal(modelPickSelected(), 1, 'and back to the one that was stepped on')
  assert.equal(
    modelPickLevelOn(modelPickRows()[1]),
    '中',
    'the row answers the carry-over rule again, not the level it was left on'
  )
  tap('Escape')
})

await checkAsync('a model that publishes no levels answers the level key in words', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 0, 'on the model with no levels')
  tap('Tab')
  assert.equal(modelPickFooter(), expectedLabel('modelPickNoLevel'), 'the footer says why nothing moved')
  assert.notEqual(modelPickPanel(), null, 'and the window is still up to try something else')
  assert.deepEqual(MODEL.calls, [], 'a press that could not move must not switch anything either')
  tap('Escape')
})

await checkAsync('clicking a level chip switches to that model at that level in one step', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  // Only the selected row draws chips, so move onto the model that has them
  // before reaching for one — a pointer and a key reach the same row.
  tap('d')
  assert.equal(modelPickSelected(), 1, 'on the model with levels')
  const chips = modelPickLevelChips(modelPickRows()[1])
  assert.equal(chips.length, 3, 'the selected row must offer three chips')
  const handlers = chips[2].__listeners.click ?? []
  assert.equal(handlers.length, 1, 'each chip must carry its own click handler')
  let stopped = false
  handlers[0]({ preventDefault() {}, stopPropagation() { stopped = true } })
  await flush()
  assert.deepEqual(
    submittedRoutes(),
    ['deepseek/deepseek-reasoner'],
    'the chip submits its own model'
  )
  assert.equal(MODEL.calls[0].reasoningEffort, 'high', 'at its own level')
  assert.ok(stopped, 'and the click must not reach the row it sits on')
  assert.equal(modelPickPanel(), null, 'the window closes behind it')
})

await checkAsync('a model default that nobody chose is shown but never submitted', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  // Nothing explicit is in effect on `deepseek-reasoner`, so its own declared
  // default (`medium`) is what applies — and it is what the row shows as the
  // landing place. It is still not a choice, so it must not be sent back.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'the row shows the level the host would apply')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    'but a default nobody chose is left off the selection'
  )
  assert.equal('reasoningEffort' in MODEL.calls[0], false, 'not even as an undefined field')
})

await checkAsync('the level key is the model window\'s, and is a plain letter outside it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  // With the window closed, Tab must reach the page as it always did.
  assert.equal(keydown('Tab', {}), false, 'Tab is not the plugin\'s key outside the window')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'and it must not switch anything')
  tap('w')
  await flush()
  const before = MODEL.calls.length
  tap('Tab')
  assert.equal(MODEL.calls.length, before, 'inside the window it steps the level, not the model')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and the level is what moved')
  tap('Escape')
})

await checkAsync('a rebound level key is the one that steps, and Tab goes back to moving rows', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  fakeWindow.__dshVim.update({ modelLevelKey: 'n' })
  tap('w')
  await flush()
  assert.ok(modelPickFooter().includes('N'), 'the footer names the bound level key')
  assert.equal(modelPickFooter().includes('Tab'), false, 'and not the one it no longer is')
  tap('Tab')
  assert.equal(modelPickSelected(), 2, 'Tab moves the row again, as it did before the level seat existed')
  assert.deepEqual(MODEL.calls, [], 'and steps nothing')
  tap('e')
  assert.equal(modelPickSelected(), 1, 'back on the model with levels')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'whose level is where it was')
  tap('n')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and the rebound key is the one that steps')
  tap('Escape')
  reset()
})

await checkAsync('the level key cannot collide with the keys the window shares', async () => {
  assert.equal(fakeWindow.__dshVim.settings().modelLevelKey, 'Tab', 'Tab is the shipped default')
  // The model window answers to the page's two model seats and the task
  // window's movement pair, so its own group has to be checked across both.
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'w' }).error,
    'conflict',
    'the confirm key is already taken'
  )
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'q' }).error,
    'conflict',
    'and so is the reasoning key'
  )
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'd' }).error,
    'conflict',
    'and the window\'s own movement keys'
  )
  // Enter is the standing confirm alias and is not a seat, so the level seat may
  // not take it: doing so would leave the window with no confirm key at all.
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'Enter' }).error,
    'conflict',
    'the standing Enter alias cannot be given up'
  )
  // The other direction too: a page seat may not take the level key.
  assert.equal(
    fakeWindow.__dshVim.update({ modelKey: 'Tab' }).error,
    'conflict',
    'the confirm seat may not take Tab'
  )
  assert.equal(
    fakeWindow.__dshVim.update({ paletteDownKey: 'Tab' }).error,
    'conflict',
    'nor may a movement seat, which lives in the task window\'s own group'
  )
  assert.equal(fakeWindow.__dshVim.settings().paletteDownKey, 'd', 'and that refusal changed nothing either')
  assert.equal(fakeWindow.__dshVim.settings().modelLevelKey, 'Tab', 'and a refusal changes nothing')
  const accepted = fakeWindow.__dshVim.update({ modelLevelKey: 'n' })
  assert.equal(accepted.modelLevelKey, 'n', 'a free key is accepted')
  reset()
})

await checkAsync('the reasoning key steps the level inside the window, not behind it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  // The adapter metadata travels with the publish, which is what the reasoning
  // key reads to know which notch it is stepping from.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }, REASONING)
  tap('w')
  await flush()
  const before = MODEL.calls.length
  tap('q')
  assert.deepEqual(
    MODEL.calls.length,
    before,
    'q must not submit while the window is still choosing: it moves the mark'
  )
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and the mark moves one notch on, as q always means')
  tap('q')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '低', 'every press is still one step')
  assert.deepEqual(MODEL.calls.length, before, 'and nothing is submitted until the window confirms')
  // Confirming takes the mark with it: the level the window was showing is the
  // level the session lands on.
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[before],
    { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' },
    'the level the mark reached is submitted with the model'
  )
  tap('q')
  await flush()
  assert.equal(MODEL.calls.length, before + 2, 'and with the window down q steps the session again')
})

await checkAsync('a press outside the model window cancels it, as Escape does', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }, REASONING)
  tap('w')
  await flush()
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'the picker must be up')
  const before = MODEL.calls.length
  press(cardNode())
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'a press on its own card is inside the window')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'a press beside it cancels the way out')
  assert.equal(body.children.length, 0, 'and the picker unmounts')
  assert.equal(MODEL.calls.length, before, 'cancelling submits nothing, exactly as Escape does')
})

await checkAsync('a window on the card of another keeps both of them up', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }, REASONING)
  tap('f')
  tap('w')
  await flush()
  // Both can be on the page at once, and the picker's card is the one the press
  // lands on: a press inside one window is not a press outside the other.
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  assert.equal(fakeWindow.__dshVim.modelPick().open, true)
  press(cardNode())
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the task window stays')
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'and so does the picker')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'a press that misses both takes both down')
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'the task window and the picker alike')
  assert.equal(body.children.length, 0, 'and neither outlives it')
})

await checkAsync('the model key can be rebound, and cannot collide with the page keys', () => {
  assert.equal(fakeWindow.__dshVim.settings().modelKey, 'w', 'w is the shipped default')
  const rejected = fakeWindow.__dshVim.update({ modelKey: 'q' })
  assert.equal(rejected.error, 'conflict', 'the reasoning key is already taken')
  const accepted = fakeWindow.__dshVim.update({ modelKey: 'm' })
  assert.equal(accepted.modelKey, 'm', 'a free key is accepted')
  assert.equal(fakeWindow.__dshVim.settings().effortKey, 'q', 'and the other seats are untouched')
  reset()
})

check('a configured list is cleaned, and never writes back into the shipped default', () => {
  const stored = [
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    { provider: '  ', model: 'blank-provider' },
    { provider: 'no-model' },
    'not a pair',
    null,
    { provider: 'bunny', model: ' bunny-free ' },
  ]
  const applied = fakeWindow.__dshVim.update({ favorites: stored })
  assert.deepEqual(
    applied.favorites,
    [
      { provider: 'deepseek', model: 'deepseek-reasoner' },
      { provider: 'bunny', model: 'bunny-free' },
    ],
    'a duplicate keeps its first place, and a half-written entry is dropped'
  )
  // The array is rebuilt rather than aliased, so nothing the settings page is
  // handed can reach the shipped default through it — corrupting the live list
  // here must still leave a reset empty.
  applied.favorites.push({ provider: 'late', model: 'arrival' })
  assert.deepEqual(
    fakeWindow.__dshVim.reset().favorites,
    [],
    'and the shipped default is unreachable from what the API handed out'
  )
})

await checkAsync('the settings page reads the catalog instead of asking for an id', async () => {
  MODEL.offer(CATALOG)
  useFavorites([{ provider: 'bunny', model: 'bunny-free' }])
  const before = MODEL.catalogReads
  const elements = settingsElements()
  // The read is a host hop, so the first render is the one that has to admit it.
  assert.ok(
    elements.some((e) => e.children?.includes(expectedLabel('modelCatalogLoading'))),
    'and say it is reading it, rather than showing an empty box'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites,
    [{ provider: 'bunny', model: 'bunny-free' }],
    'the chosen list is read back through the same cleaning it is written through'
  )
  await flush()
  assert.equal(MODEL.catalogReads, before + 1, 'the group must read the catalog off the host, once')
})

// --- the board --------------------------------------------------------------

/**
 * A timestamp inside today, a given number of hours after the local midnight.
 *
 * The board cuts at the local midnight, so a check about "today" cannot be
 * written with `ago()`: three hours before a run at 01:00 is yesterday's
 * evening, and the same check would pass in the afternoon and fail at night.
 * @param {number} hours - hours after midnight, may be 0.
 * @returns {number} epoch milliseconds.
 */
function todayAt(hours) {
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime() + hours * HOUR
}

/**
 * The mounted board's panel, or null when no board is up.
 *
 * Found by the label it publishes rather than by being the last thing on the
 * page: a notice (the one a refused action speaks through) is appended to the
 * body too, and it can sit above the board.
 * @returns {object|null} the panel.
 */
function boardPanel() {
  for (let i = body.children.length - 1; i >= 0; i--) {
    const host = body.children[i]
    const panel = host.children && host.children[0]
    if (!panel || !panel.__attrs) continue
    if (panel.__attrs['aria-label'] !== expectedLabel('board')) continue
    if (panel.__attrs['role'] !== 'dialog') continue
    return panel
  }
  return null
}

/** The board's canvas viewport, or null when no board is up. */
function boardBody() {
  const panel = boardPanel()
  return panel ? panel.children[1] ?? null : null
}

/** The paper inside the canvas (the stage, under its sizing wrapper). */
function boardStage() {
  const body = boardBody()
  const sizer = body ? body.children[0] ?? null : null
  return sizer ? sizer.children[0] ?? null : null
}

/** The workspace and inbox panels, in draw order. */
function boardBlocks() {
  const stage = boardStage()
  if (!stage) return []
  return stage.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'workspaceBlock')
}

/** One panel by the name its heading carries. */
function boardBlock(label) {
  return boardBlocks().find((node) => {
    const name = boardSeat(node, 'blockName')
    return name ? String(name.textContent) === label : false
  }) || null
}

/** Every conversation card under one node, at any depth. */
function cardsIn(node) {
  const out = []
  const walk = (n) => {
    for (const child of n.children || []) {
      if (child.__attrs && child.__attrs['data-session-id'] !== undefined) out.push(child)
      walk(child)
    }
  }
  if (node) walk(node)
  return out
}

/** Every conversation on the canvas, panel by panel. */
function boardCardIds() {
  return boardBlocks().flatMap((block) => cardsIn(block).map((card) => card.__attrs['data-session-id']))
}

/** The loose cards, in draw order. */
function looseCards() {
  const stage = boardStage()
  if (!stage) return []
  return stage.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
}

/** The board's heading line, as `{title, count}`. */
function boardHeading() {
  const head = boardPanel().children[0]
  return { title: String(head.children[0].textContent), count: String(head.children[1].textContent) }
}

/**
 * The board's stored document, read straight out of the fake storage.
 *
 * The arrangement is the plugin's own record rather than anything it projects
 * for a check, so a check about what will survive a reload reads this.
 * @returns {object|null} the stored board, or null when none was written.
 */
function boardDoc() {
  // The board's own key, named exactly: the history keeps its pages and its
  // carried set beside this plugin too, and the first of those is not the board.
  for (const key of stored.keys()) {
    if (key.endsWith('/board/v1')) return JSON.parse(stored.get(key))
  }
  return null
}

/** A named seat inside one node, at any depth. */
function boardSeat(node, role, seen) {
  // A fake element can end up in more than one parent's children (appendChild
  // does not detach it from the old one), so this walk carries the set of nodes
  // it has already been through. Without it a shared or cyclic subtree is not
  // a wrong answer, it is an infinite one — and an infinite walk fills the heap.
  const visited = seen || new Set()
  if (!node || visited.has(node)) return null
  visited.add(node)
  // A walk longer than this is not looking at a card any more: it is looking at
  // the whole page, and it would fill the heap before it answered.
  if (visited.size > 200000) throw new Error(`boardSeat('${role}') walked ${visited.size} nodes without finding one`)
  for (const child of node.children || []) {
    if (child.__attrs && child.__attrs['data-role'] === role) return child
    const found = boardSeat(child, role, visited)
    if (found) return found
  }
  return null
}

/** One panel's heading, as an element to press. */
function blockHead(block) {
  return block.children[0]
}

/** A goal's ⋯ mark, or null when the panel has none (the tray). */
function goalMenuMark(block) {
  return boardSeat(block, 'goalMenuOpen')
}

/**
 * Open a goal's ⋯ menu and return it.
 *
 * The menu is drawn on the paper beside the panel rather than inside it, so it
 * is found from the stage, not by walking the block.
 * @param {object} block - the panel whose ⋯ is pressed.
 * @returns {object|null} the open menu.
 */
function openGoalMenu(block) {
  fireOn(goalMenuMark(block), 'click', { type: 'click', stopPropagation() {} })
  const menus = boardStage().querySelectorAll('[data-role="goalMenu"]')
  return menus[menus.length - 1] ?? null
}

/**
 * A press that may become a drag, delivered the way the DOM delivers one.
 *
 * From the element pressed up to the canvas, so the board's single press
 * handler sees it wherever it started; a handler that stops the press stops
 * the walk, which is how a field keeps a selection to itself.
 */
function pressForDrag(node, x, y) {
  let stopped = false
  const ev = {
    type: 'pointerdown',
    button: 0,
    clientX: x,
    clientY: y,
    target: node,
    preventDefault() {},
    stopPropagation() { stopped = true },
  }
  let cur = node
  while (cur && !stopped) {
    fireOn(cur, 'pointerdown', ev)
    if (cur === body || !cur.parentNode) break
    cur = cur.parentNode
  }
  return ev
}

/** A pointer that has moved, and let go. */
function dragTo(x, y) {
  fire('pointermove', { type: 'pointermove', clientX: x, clientY: y, preventDefault() {} })
  fire('pointerup', { type: 'pointerup' })
}

check('a panel per workspace in play, and the inbox last', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', title: 'api', path: '/work/api', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'design', updatedAt: todayAt(5) },
    { id: 'b', displayTitle: 'code', updatedAt: todayAt(4) },
    { id: 'c', displayTitle: 'endpoint', updatedAt: todayAt(3) },
    { id: 'yesterday', displayTitle: 'yesterday', updatedAt: todayAt(0) - 1 },
  ])
  assert.ok(tap('j'), 'the board key must be the plugin\'s, not a stray letter')
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.open, true, 'j must open the board')
  assert.deepEqual(
    state.blocks.map((block) => block.key),
    ['w1', 'w2', '@inbox'],
    'one panel per workspace in play, newest first, and the inbox last'
  )
  assert.deepEqual(state.blocks.map((block) => block.ids), [['a', 'b'], ['c'], []], 'each holds its own conversations')
  assert.deepEqual(
    boardBlocks().map((block) => String(boardSeat(block, 'blockName').textContent)),
    ['dsh-vim', 'api', expectedLabel('boardInbox')],
    'the headings say what the API says'
  )
  assert.deepEqual(boardCardIds(), ['a', 'b', 'c'], 'only today\'s conversations are drawn, and the old one is not')
  assert.deepEqual(boardHeading(), {
    title: expectedLabel('board'),
    count:
      expectedLabel('boardTodayCount') + '2' + expectedLabel('boardWorkspacesUnit')
      + '3' + expectedLabel('boardSessionsUnit'),
  })
  tap('Escape')
})

check('a goal keeps the order the reader knows, however busy a card gets', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['older', 'newer'] }])
  seed([
    { id: 'older', displayTitle: 'older', updatedAt: todayAt(2) },
    { id: 'newer', displayTitle: 'newer', updatedAt: todayAt(3) },
  ])
  tap('j')
  const order = () => cardsIn(boardBlock('dsh-vim')).map((node) => node.__attrs['data-session-id'])
  const first = order()
  assert.deepEqual(first, ['newer', 'older'], 'the board opens newest first')
  tap('Escape')
  // The older one is used next and starts a turn: it is now the liveliest card on
  // the panel, and it must still be where the reader left it.
  seed([
    { id: 'older', displayTitle: 'older', updatedAt: todayAt(4) },
    { id: 'newer', displayTitle: 'newer', updatedAt: todayAt(3) },
  ])
  statusFeed.put('older', { running: true })
  tap('j')
  assert.deepEqual(order(), first, 'a turn starting moves nothing')
  tap('Escape')
  // Nor does a conversation that arrives later push the others around.
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['older', 'newer', 'last'] }])
  seed([
    { id: 'last', displayTitle: 'last', updatedAt: todayAt(5) },
    { id: 'older', displayTitle: 'older', updatedAt: todayAt(4) },
    { id: 'newer', displayTitle: 'newer', updatedAt: todayAt(3) },
  ])
  tap('j')
  assert.deepEqual(order(), ['newer', 'older', 'last'], 'a new arrival stands at the end; the rest hold still')
  tap('Escape')
})
check('a conversation with no workspace lands in the inbox', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['filed'] }])
  seed([
    { id: 'filed', displayTitle: 'in a workspace', updatedAt: todayAt(3) },
    { id: 'loose', displayTitle: 'nowhere', updatedAt: todayAt(2) },
  ])
  tap('j')
  const state = fakeWindow.__dshVim.board()
  assert.deepEqual(state.blocks[0].ids, ['filed'])
  assert.deepEqual(state.blocks[1].ids, ['loose'], 'the inbox is what no workspace accounts for')
  assert.equal(state.blocks[1].kind, 'inbox')
  assert.deepEqual(boardCardIds(), ['filed', 'loose'])
  tap('Escape')
})

check('a card is a way in: a press on it opens the conversation', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.ok(card, 'the inbox must show the conversation')
  assert.equal(String(boardSeat(card, 'cardTitle').textContent), 'a task', 'the card leads with the conversation\'s name')
  assert.equal(boardSeat(card, 'cardTitle').style.minHeight, '2.8em', 'the title keeps two lines even when its name is shorter')
  // The largest target on the canvas carries the most likely action: the name is
  // part of the card, so a press on it is a press on the conversation.
  clickThrough(boardSeat(card, 'cardTitle'))
  assert.deepEqual(opened.slice(-1), ['task'], 'a press on the name opens the conversation')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'and the board gets out of the way')
})

check('nothing inside a card is a dead zone for that press', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  // The state row is the last thing the eye reads, and it is the same target as
  // the name it read first. The clock that used to sit beside it is gone: a card
  // says what it is doing, not how long ago it was last touched.
  clickThrough(boardSeat(card, 'cardMeta'))
  assert.deepEqual(opened.slice(-1), ['task'], 'the meta line is the card as well')
})

check('renaming lives behind the card \u22ef, one press further away than the card', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  // The name line keeps two things: the name, and the lock that holds it down.
  // Renaming is a host write a card needs rarely - the board names a
  // conversation from the thought that started it - so it lives in the menu,
  // and no word of it stands over the lock's own corner.
  assert.equal(boardSeat(card, 'cardRenameOpen'), null, 'no rename word stands on the name')
  assert.ok(boardSeat(card, 'cardLock'), 'the lock keeps its own seat beside the name')
  const menuMark = boardSeat(card, 'cardMenuOpen')
  assert.ok(menuMark, 'the card carries one mark for what is not worth a seat')
  assert.equal(menuMark.__attrs['aria-expanded'], 'false', 'closed, it says so')
  tapMark(menuMark)
  assert.equal(
    boardSeat(card, 'cardMenuOpen').__attrs['aria-expanded'],
    'true',
    'a press opens the menu and keeps the card it belongs to'
  )
  assert.equal(
    String(boardSeat(card, 'cardRenameOpen').textContent),
    expectedLabel('boardCardRenameHint'),
    'one verb, saying what it does in words'
  )
  const before = opened.length
  // The stop is the whole point: a host write must never be one stray press away
  // from the conversation, so the mark answers and the card behind it does not.
  clickThrough(boardSeat(card, 'cardRenameOpen'))
  assert.equal(opened.length, before, 'the rename mark does not open the conversation')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and the board stays up')
  const field = boardSeat(boardCard('task'), 'cardRename')
  assert.ok(field, 'the name becomes a field in place')
  pressIn(field, 'Escape')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and dropping the field is not a press on the card')
})

check('there is no 进入 button: the card is the way in, and the drop target is not a button', () => {
  seed([{ id: 'task', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = boardCard('task')
  // The card answers a press itself (checked above); the arrow is gone with the
  // rail it lived in, and what remains is the drop overlay an idea card is let go
  // on - not a button, and not in the tab order.
  const dropZone = boardSeat(card, 'cardEnter')
  assert.ok(dropZone, 'the drop target is still there for a carried note')
  assert.equal(dropZone.__attrs['aria-hidden'], 'true', 'but it is not offered as an action')
  assert.equal(dropZone.__attrs['role'], undefined, 'and it is not a button')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'so a press on it opens nothing')
})

await checkAsync('the rename mark renames the conversation', async () => {
  seed([{ id: 'task', displayTitle: 'an old name', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardCard('task'), 'cardRename')
  assert.ok(field, 'the name becomes a field')
  assert.equal(field.value, 'an old name', 'carrying what it said')
  typeIn(field, '  a better name  ')
  pressIn(field, 'Enter')
  await flush()
  assert.equal(renames.calls.length, 1, 'the rename goes to the host')
  assert.equal(renames.calls[0].id, 'task')
  assert.equal(renames.calls[0].title, 'a better name', 'trimmed, as the shell expects')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  assert.equal(boardSeat(boardCard('task'), 'cardRename'), null, 'the field is gone')
  tap('Escape')
})

check('escape closes the board, the key itself too, and so does a press beside it', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(1) }])
  tap('j')
  assert.ok(tap('Escape'), 'escape belongs to the board while it is up')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'escape closes it')
  tap('j')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'the key that opened it puts it away again')
  tap('j')
  press(body)
  assert.equal(fakeWindow.__dshVim.board().open, false, 'a press on the page beside it closes it')
})

check('the board owns the keyboard while it is up', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(1) }])
  tap('j')
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'the task window must not open behind the board')
  tap('w')
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'nor the model window')
  tap(' ')
  assert.notEqual(fakeDocument.activeElement, editor, 'the focus key must not put the caret in the box')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and the board stays up through all of it')
  tap('Escape')
})

check('the task window does not give way to the board', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(1) }])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'one overlay at a time: the board stays shut')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the task window keeps the page')
  tap('Escape')
})

check('a card carries the turn count it manages to read', () => {
  seed([{ id: 'counted', displayTitle: 'a counted one', updatedAt: todayAt(2) }])
  projections.put('sessionStats', { turns: 12 })
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().inbox[0].turns, 12, 'the count is read for the card')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  const badge = boardSeat(card, 'turns')
  assert.ok(badge, 'a card with a count wears it')
  assert.equal(String(badge.textContent), '12 ' + expectedLabel('turnUnit'), 'and says how many turns')
  assert.ok(
    projections.sources.every((source) => source !== 'mainView'),
    'the count must never be read as the main view: that marks the conversation read'
  )
  tap('Escape')
  assert.deepEqual([...projections.live], [], 'and the scope is let go with the window')
})

check('a card with no count to show wears no badge', () => {
  seed([{ id: 'unreadable', displayTitle: 'a', updatedAt: todayAt(3) }])
  tap('j')
  clock.advance(2000)
  assert.equal(fakeWindow.__dshVim.board().inbox[0].turns, null, 'no count is better than a wrong one')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(boardSeat(card, 'turns'), null)
  assert.equal(String(boardSeat(card, 'cardTitle').textContent), 'a', 'and the card is still a card')
  tap('Escape')
})

check('a conversation taken off the board comes back once it is used again', () => {
  seed([{ id: 'gone', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  fireOn(boardSeat(card, 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(boardCardIds(), [], 'the card is off the board')
  assert.ok(boardDoc().muted.gone !== undefined, 'and the decision is written down')
  tap('Escape')
  // A later message is a conversation in play again: the inbox is where it
  // comes back, and the stamp means the old deletion no longer applies.
  seed([{ id: 'gone', displayTitle: 'a task', updatedAt: todayAt(2) + 1 }])
  tap('j')
  assert.deepEqual(boardCardIds(), ['gone'], 'a conversation that moved after being deleted is back')
  tap('Escape')
})

check('a mark keeps an old conversation on the board, and the filter shows only marks', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['old', 'new'] }])
  seed([
    { id: 'old', displayTitle: 'old', updatedAt: todayAt(3) },
    { id: 'new', displayTitle: 'new', updatedAt: todayAt(2) },
  ])
  tap('j')
  const oldCard = cardsIn(boardBlock('dsh-vim')).find((card) => card.__attrs['data-session-id'] === 'old')
  fireOn(boardSeat(oldCard, 'cardStar'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(fakeWindow.__dshVim.board().starred, ['old'], 'the mark is recorded')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and pressing the mark does not open the card')
  // The mark is what keeps a conversation past the day it last moved.
  tap('Escape')
  seed([
    { id: 'old', displayTitle: 'old', updatedAt: todayAt(0) - 2 },
    { id: 'new', displayTitle: 'new', updatedAt: todayAt(2) },
  ])
  tap('j')
  assert.deepEqual(boardCardIds().includes('old'), true, 'a marked conversation is offered whatever day it belongs to')
  const filter = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'starFilter')
  fireOn(filter, 'click', { type: 'click' })
  assert.deepEqual(boardCardIds(), ['old'], 'the filter leaves only what is marked')
  tap('Escape')
})

check('a panel is dragged by its heading, and the place survives a reload', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const block = boardBlock('dsh-vim')
  const before = fakeWindow.__dshVim.board().places.w1
  pressForDrag(blockHead(block), 10, 10)
  dragTo(110, 80)
  const moved = fakeWindow.__dshVim.board().places.w1
  assert.equal(moved.x, before.x + 100, 'the panel moved with the pointer')
  assert.equal(moved.y, before.y + 70)
  assert.equal(String(block.style.left), moved.x + 'px', 'and the drawn panel agrees')
  tap('Escape')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().places.w1.x, moved.x, 'the place was written down')
  assert.equal(String(boardBlock('dsh-vim').style.left), moved.x + 'px', 'and the next board opens there')
  tap('Escape')
})

check('the canvas is panned by dragging the paper', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const canvas = boardBody()
  canvas.scrollLeft = 0
  canvas.scrollTop = 0
  pressForDrag(canvas, 500, 400)
  fire('pointermove', { type: 'pointermove', clientX: 450, clientY: 380, preventDefault() {} })
  fire('pointerup', { type: 'pointerup' })
  assert.equal(canvas.scrollLeft, 50, 'the paper moved left under the pointer')
  assert.equal(canvas.scrollTop, 20, 'and up, by the same gesture')
  tap('Escape')
})

check('a goal lays its conversations out whole, and nothing scrolls inside it', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
  ])
  seed(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, displayTitle: id, updatedAt: todayAt(2) })))
  tap('j')
  const body = boardSeat(boardBlock('one'), 'blockBody')
  assert.ok(body, 'the goal keeps a body for its conversations')
  assert.equal(body.style.maxHeight, undefined, 'no cap is declared on it')
  assert.equal(body.style.overflowY, undefined, 'and nothing inside the panel scrolls')
  assert.equal(cardsIn(boardBlock('one')).length, 8, 'every conversation is spread open on the panel')
  tap('Escape')
})

check('a fresh panel is not packed onto the tail of a tall one', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
    { workspaceId: 'w3', title: 'three', path: '/work/three', sessionIds: ['c'] },
    { workspaceId: 'w4', title: 'four', path: '/work/four', sessionIds: ['d'] },
    { workspaceId: 'w5', title: 'five', path: '/work/five', sessionIds: ['e'] },
  ])
  seed(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, displayTitle: id, updatedAt: todayAt(2) })))
  tap('j')
  // Five workspaces and the inbox fill two grid rows, and the fourth panel
  // sits at the head of the second. Say it grew far past its row - a goal
  // with a long list of conversations - and a sixth workspace arrives: the
  // grid's own height would put the newcomer one row under it, standing on
  // its cards. The place it was given reads the height the tall one measured.
  boardBlock('four').offsetHeight = 900
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
    { workspaceId: 'w3', title: 'three', path: '/work/three', sessionIds: ['c'] },
    { workspaceId: 'w4', title: 'four', path: '/work/four', sessionIds: ['d'] },
    { workspaceId: 'w5', title: 'five', path: '/work/five', sessionIds: ['e'] },
    { workspaceId: 'w6', title: 'six', path: '/work/six', sessionIds: ['f'] },
  ])
  const place = fakeWindow.__dshVim.board().places.w6
  assert.equal(place.x, 440, 'the newcomer takes the next column over')
  assert.equal(place.y, 1092, 'and a row that clears the tall panel\'s own bottom')
  assert.equal(String(boardBlock('six').style.top), '1092px', 'the drawn panel agrees')
  tap('Escape')
})

check('a goal stood from the toolbar steps over a tall panel', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  // The tall panel owns the paper down to its measured bottom; a goal asked
  // for on top of it has to be stood below that, not one grid row below its
  // top.
  boardBlock('one').offsetHeight = 900
  fireOn(boardSeat(boardPanel(), 'addGoal'), 'click', { type: 'click' })
  const goal = boardBlock(expectedLabel('boardNewGoal'))
  assert.ok(goal, 'a goal is standing on the canvas')
  assert.equal(String(goal.style.top), '1092px', 'below the real bottom of the tall panel')
  tap('Escape')
})

check('a card written from the heading lands below the real bottom of the work', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  // The heading's card belongs under everything standing, and a tall panel
  // hangs past the grid row it was planned at: "below everything" has to be
  // measured, or the card would land on its conversations.
  boardBlock('one').offsetHeight = 900
  fireOn(writeCardButton(), 'click', { type: 'click' })
  assert.equal(String(looseCards()[0].style.top), '960px', 'the card opens under the tall panel\'s own bottom')
  tap('Escape')
})

check('every window this plugin mounts wears the shared window rules', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('f')
  assert.equal(cardNode() && cardNode().className, 'dshv-window', 'the task window carries the shared class')
  tap('Escape')
  tap('j')
  assert.equal(boardPanel() && boardPanel().className, 'dshv-window', 'and the board carries it too')
  tap('Escape')
})

check('tidy gathers the untied cards into the inbox, and leaves every panel where it was', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(2) },
  ])
  tap('j')
  // A panel the reader put somewhere by hand, and two thoughts with nothing to
  // be tied to: exactly what a tidy has to gather without touching the work.
  pressForDrag(blockHead(boardBlock('one')), 0, 0)
  dragTo(600, 400)
  const before = JSON.stringify(fakeWindow.__dshVim.board().places)
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '第一条')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[1], 'cardTitleInput'), '第二条')
  fireOn(boardSeat(looseCards()[1], 'cardTitleInput'), 'blur', { type: 'blur' })
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  const state = fakeWindow.__dshVim.board()
  assert.equal(JSON.stringify(state.places), before, 'no panel moved')
  const inbox = state.places['@inbox']
  // Panels are no longer one width - a goal is one column per conversation - so
  // the column clears the tray's own paper rather than its neighbour's.
  const inboxPanel = boardBlocks()[boardBlocks().length - 1]
  const panelWidth = parseFloat(inboxPanel.style.width)
  const first = state.loose[0]
  const second = state.loose[1]
  assert.equal(first.x, inbox.x + panelWidth + 32, 'the tray stands in the first column clear of the inbox')
  assert.ok(first.y >= inbox.y, 'and starts from the top of the inbox down')
  const firstHeight = parseFloat(looseCards()[0].style.height)
  assert.equal(second.y, first.y + firstHeight + 8, 'the second thought stacks under the first')
  // Nothing left to move, so a second press is quiet rather than a replay.
  const settled = JSON.stringify(state.loose)
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  assert.equal(JSON.stringify(fakeWindow.__dshVim.board().loose), settled, 'a second tidy finds nothing to do')
  tap('Escape')
})

check('tidy stands a tied card beside the conversation it belongs to', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  // Put the panel where the tied column has room, so the place is the panel's
  // own doing rather than a neighbour pushing it aside.
  pressForDrag(blockHead(boardBlock('dsh-vim')), 0, 0)
  dragTo(900, 500)
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '把这句话带过去')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.equal(fakeWindow.__dshVim.board().loose[0].link, 'target', 'the card is tied to the conversation')
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  const state = fakeWindow.__dshVim.board()
  const panel = state.places.w1
  const panelWidth = parseFloat(boardBlock('dsh-vim').style.width)
  assert.equal(state.loose[0].x, panel.x + panelWidth + 32, 'the tied card stands beside its panel')
  assert.equal(state.loose[0].y, panel.y + 46, 'level with the top of the working set when nothing can be measured')
  tap('Escape')
})

await checkAsync('a branch made from a card appears under it, joined by a line', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'child'] }])
  seed([{ id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) }])
  tap('j')
  forks.results.push('child')
  const card = cardsIn(boardBlock('dsh-vim'))[0]
  fireOn(boardSeat(card, 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  assert.equal(forks.calls.length, 1, 'the board asked the host to fork')
  assert.equal(forks.calls[0].sessionId, 'parent', 'the conversation it drew')
  assert.deepEqual(fakeWindow.__dshVim.board().lineage, { child: 'parent' }, 'and it remembered where the branch came from')
  // The host publishes the child on its own clock; the board picks it up then.
  seed([
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
  ])
  await flush()
  const ids = cardsIn(boardBlock('dsh-vim')).map((node) => node.__attrs['data-session-id'])
  assert.deepEqual(ids, ['parent', 'child'], 'both cards are drawn, the branch under where it came from')
  const columns = boardSeat(boardBlock('dsh-vim'), 'blockColumns')
  assert.ok(columns, 'a goal lays its conversations out as columns')
  assert.deepEqual(
    columns.children.map((node) => node.__attrs['data-column']),
    ['parent', 'child'],
    'the branch stands in the column immediately after the one it came from'
  )
  assert.equal(boardSeat(cardsIn(boardBlock('dsh-vim'))[0].parentNode, 'forkChildren'), null, 'nothing hangs under a card any more')
  tap('Escape')
})

await checkAsync('a branch whose parent is not here says where it came from', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'child'] }])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
  ])
  tap('j')
  // Fork through the host hop: the watcher records the pair.
  forks.results.push('child')
  const parentCard = cardsIn(boardBlock('dsh-vim')).find((node) => node.__attrs['data-session-id'] === 'parent')
  fireOn(boardSeat(parentCard, 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  // The parent stops being today's work; the child is still here, and the
  // parent is still in the catalogue the board reads names from.
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(0) - 2 },
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
  ])
  await flush()
  const childCard = cardsIn(boardBlock('dsh-vim'))[0]
  const source = boardSeat(childCard, 'forkSource')
  assert.ok(source, 'the child says where it came from instead of drawing a line to nothing')
  assert.equal(String(source.textContent), expectedLabel('boardForkSource') + 'the parent')
  tap('Escape')
})

await checkAsync('one press makes one branch, however often the mark is pressed', async () => {
  seed([{ id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) }])
  tap('j')
  forks.results.push('child')
  fireOn(boardSeat(boardCard('parent'), 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  // The round trip is in flight, and the card says so: a second press is the
  // same intention, not a request for a second branch.
  const busy = boardSeat(boardCard('parent'), 'cardFork')
  assert.equal(busy.__attrs['data-busy'], 'true', 'the mark is waiting on the host')
  assert.equal(busy.__attrs['title'], expectedLabel('boardForkBusy'), 'and says what it is waiting for')
  fireOn(busy, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  assert.equal(forks.calls.length, 1, 'the host was asked once')
  tap('Escape')
})

await checkAsync('a second branch of one conversation gets a name of its own', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['parent', 'first'] }])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    // A branch of this conversation already wears what the host will call the
    // next one: the host numbers a branch off its parent's title, not off the
    // list, so two branches of one conversation land on the same words.
    { id: 'first', displayTitle: 'the parent (1)', updatedAt: todayAt(4) },
  ])
  tap('j')
  forks.results.push('second')
  fireOn(boardSeat(boardCard('parent'), 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  // The host publishes the child on its own clock; the board settles the name
  // once it can see what the child is called.
  seed([
    { id: 'second', displayTitle: 'the parent (1)', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'first', displayTitle: 'the parent (1)', updatedAt: todayAt(4) },
  ])
  await flush()
  assert.equal(renames.calls.length, 1, 'the branch is renamed rather than left wearing a taken name')
  assert.equal(renames.calls[0].id, 'second', 'the branch, not its parent')
  assert.equal(renames.calls[0].title, 'the parent (2)', 'the next free number, in the host\'s own shape')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  tap('Escape')
})

check('two cards wearing one name say which of them each is', () => {
  seed([
    { id: 'twina', displayTitle: 'the same', updatedAt: todayAt(4) },
    { id: 'twinb', displayTitle: 'the same', updatedAt: todayAt(3) },
    { id: 'alone', displayTitle: 'on its own', updatedAt: todayAt(2) },
  ])
  tap('j')
  assert.equal(String(boardSeat(boardCard('twina'), 'cardDupTag').textContent), '#1/2', 'the first of the two')
  assert.equal(String(boardSeat(boardCard('twinb'), 'cardDupTag').textContent), '#2/2', 'and the second')
  assert.equal(boardSeat(boardCard('alone'), 'cardDupTag'), null, 'a name nobody else wears says nothing')
  tap('Escape')
})

check('a panel folds its conversations away, and remembers', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const block = boardBlock('dsh-vim')
  fireOn(boardSeat(block, 'blockFold'), 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, true, 'the panel is folded')
  assert.equal(cardsIn(boardBlock('dsh-vim')).length, 0, 'and draws no conversations')
  tap('Escape')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, true, 'the fold was written down')
  fireOn(boardSeat(boardBlock('dsh-vim'), 'blockFold'), 'click', { type: 'click' })
  assert.equal(cardsIn(boardBlock('dsh-vim')).length, 1, 'and one press brings them back')
  tap('Escape')
})

check('a note opens at its title and two lines, and a press shows the rest', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  // A note is written the way its two rows say: the name, then the thought.
  const firstTitle = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(firstTitle, '第一行')
  pressIn(firstTitle, 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), '第二行\n第三行\n第四行')
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  const paper = () => looseCards()[0]
  assert.equal(String(boardSeat(paper(), 'looseTitle').textContent), '第一行', 'the first line is the title')
  assert.equal(paper().__attrs['data-rows'], '2', 'and the paper spends two lines on the body')
  assert.equal(paper().__attrs['data-clipped'], 'true', 'saying it holds more than it shows')
  assert.equal(boardSeat(paper(), 'cardGrip'), null, 'there is no corner to drag')
  // The card is one thing drawn as two rows: the title in the heading, the body
  // on the paper. That a press opens a field on it is a separate promise, kept
  // by its own check - this one is about the shape.
  assert.equal(String(boardSeat(paper(), 'looseTitle').textContent), '第一行', 'the title keeps its row in the heading')
  assert.equal(boardDoc().cards[0].h, 0, 'and nothing about a height was written down')
  tap('Escape')
})

check('a loose card is written, kept, and taken away', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const write = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
  fireOn(write, 'click', { type: 'click' })
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.loose.length, 1, 'the canvas gets a card')
  assert.equal(state.editingCard, state.loose[0].id, 'with its field already open')
  const editor = boardSeat(looseCards()[0], 'cardTitleInput')
  assert.ok(editor, 'the field is a textarea on the card')
  typeIn(editor, '先记一句')
  assert.equal(boardDoc().cards[0].text, '先记一句', 'what is typed is written as it is typed')
  fireOn(editor, 'blur', { type: 'blur' })
  // One line of text is all title: the heading says it, and the card keeps no
  // empty body line under it.
  const shown = boardSeat(looseCards()[0], 'looseTitle')
  assert.ok(shown, 'the card shows what it says')
  assert.equal(String(shown.textContent), '先记一句')
  assert.equal(boardSeat(looseCards()[0], 'looseText'), null, 'and no body line is kept for it')
  // Pressing the card reopens the field on the same words.
  fireOn(shown, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardSeat(looseCards()[0], 'cardTitleInput').value, '先记一句')
  // The × lives in the card's own menu now: one press opens it, one takes the
  // card away.
  fireOn(boardSeat(looseCards()[0], 'cardMenuOpen'), 'click', { type: 'click', stopPropagation() {} })
  const cardMenu = boardSeat(looseCards()[0], 'ideaMenu')
  assert.ok(cardMenu, 'the ⋯ opens the card\'s own menu')
  fireOn(boardSeat(cardMenu, 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(fakeWindow.__dshVim.board().loose, [], 'the card is gone')
  tap('Escape')
})

check('a loose card is dragged by its heading, and the place survives a reload', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const write = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
  fireOn(write, 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), 'here')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  const before = fakeWindow.__dshVim.board().loose[0]
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(210, 160)
  const after = fakeWindow.__dshVim.board().loose[0]
  assert.equal(after.x, before.x + 200, 'the card followed the pointer')
  assert.equal(after.y, before.y + 150)
  tap('Escape')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().loose[0].x, after.x, 'the place was written down')
  assert.equal(String(looseCards()[0].style.left), after.x + 'px', 'and the next board opens it there')
  tap('Escape')
})
check('a card dropped on a conversation is tied to it and laid beside it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const write = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
  fireOn(write, 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '把这句话带过去')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  // Aim the hit test at the conversation the card is dragged onto.
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  // The card body is the gentler target: it ties the note to the work without
  // opening anything or putting anything in a draft.
  assert.deepEqual(opened, [], 'the board stays up and no conversation opens')
  const card = fakeWindow.__dshVim.board().loose[0]
  assert.equal(card.link, 'target', 'the card is tied to the conversation it was dropped on')
  assert.equal(card.done, false, 'and is still a thought rather than a delivery')
  // A tie is no longer a line drawn across the paper: the thought is drawn in
  // the conversation's own column, under the card it belongs to.
  assert.equal(looseCards().length, 0, 'the card leaves the paper')
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(held.length, 1, 'and is filed under the conversation it was dropped on')
  assert.equal(
    held[0].__attrs['title'],
    expectedLabel('boardCardLinked') + 'the target',
    'the tie is said in the card tooltip, with no line on the paper'
  )
  resetHitTest()
  tap('Escape')
})

check('a card dropped on the 投入 band is delivered, and stays as a greyed trace', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const write = boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
  fireOn(write, 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '把这句话带过去')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  // The button is the target that means "take it into the conversation".
  aimAt(boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  assert.equal(pasted && pasted.command, 'insertText', 'the words go in as typing')
  assert.equal(pasted && pasted.text, '把这句话带过去', 'the card\'s own words')
  assert.deepEqual(opened.slice(-1), ['target'], 'the conversation it was dropped on is open')
  const card = fakeWindow.__dshVim.board().loose[0]
  assert.equal(card.done, true, 'the card is marked done')
  assert.equal(card.link, 'target', 'and tied to where it went')
  // Back on the board it is still there, quieter, with what it is tied to. The
  // caret was put in the composer, so the page has to have the keyboard back
  // before the board key can mean what it means.
  fakeDocument.activeElement = body
  tap('j')
  // The delivered thought is a trace now, and it lives in the column of the
  // conversation it was handed to: no line, no note lying on the paper.
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const trace = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(trace.length, 1, 'the card remains as a trace in its column')
  assert.equal(trace[0].__attrs['data-done'], 'true', 'drawn as done')
  assert.equal(boardSeat(trace[0], 'cardDoneToggle').__attrs['aria-pressed'], 'true', 'with its done box filled in')
  assert.equal(
    trace[0].__attrs['title'],
    expectedLabel('boardCardLinked') + 'the target',
    'the tie is said in the tooltip, not in a line of the card'
  )
  // The tie can be cut without losing the words; the card leaves the column and
  // comes back to the paper beside it. Cutting it is the menu's job now.
  fireOn(boardSeat(trace[0], 'cardMenuOpen'), 'click', { type: 'click', stopPropagation() {} })
  fireOn(boardSeat(boardSeat(trace[0], 'ideaMenu'), 'cardUnlink'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(looseCards().length, 1, 'the card is laid back on the paper')
  const after = fakeWindow.__dshVim.board().loose[0]
  assert.equal(after.link, '', 'the link is gone')
  assert.equal(after.done, false, 'and so is the delivered mark')
  assert.equal(after.text, '把这句话带过去', 'while the words stay')
  resetHitTest()
  tap('Escape')
})

check('a card handed to a conversation names it after the card', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '把这个想法做完')
  pressIn(boardSeat(looseCards()[0], 'cardTitleInput'), 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), '正文一句话')
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  // The band is the deliberate hand-over: the words go in, and the conversation
  // takes the card's title as its own name.
  aimAt(boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  assert.equal(pasted && pasted.command, 'insertText', 'the words still go in as typing')
  assert.equal(pasted && pasted.text, ['把这个想法做完', '正文一句话'].join(String.fromCharCode(10)), 'all of them, title and body together')
  assert.equal(renames.calls.length, 1, 'and the hand-over names the conversation')
  assert.equal(renames.calls[0].id, 'target', 'the conversation the card was dropped on')
  assert.equal(renames.calls[0].title, '把这个想法做完', 'after the card\'s own title, not the whole of its words')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  resetHitTest()
  fakeDocument.activeElement = body
  tap('j')
  tap('Escape')
})

check('a card only tied to a conversation does not name it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '只是连过来')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  // The card around the band is the gentler claim: the thought belongs to this
  // work, and that is all it says.
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.deepEqual(renames.calls, [], 'a tie is a claim about where a thought belongs, not a name')
  assert.equal(fakeWindow.__dshVim.board().loose[0].link, 'target', 'the tie itself is still made')
  tap('Escape')
})

check('a finished card put away on the band does not name anything', () => {
  boardWithFinishedCard('已经收好的一句')
  assert.deepEqual(renames.calls, [], 'putting a card away is not naming the work')
  tap('Escape')
})

check('escape closes the new-conversation sheet and leaves the board up', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  assert.ok(sheet, 'the sheet is up')
  pressIn(boardSeat(sheet, 'newSessionTitle'), 'Escape')
  assert.equal(boardSeat(boardPanel(), 'newSessionSheet'), null, 'escape drops the sheet')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'without closing the board behind it')
  tap('Escape')
})

await checkAsync('the goal plus asks for a title and a body, then opens a conversation', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('fresh')
  tap('j')
  const plus = boardSeat(boardBlock('dsh-vim'), 'goalNewSession')
  assert.ok(plus, 'a goal carries a way to start work, not only a shelf for it')
  assert.equal(plus.__attrs['title'], expectedLabel('boardNewSessionHint'), 'the mark says what it does')
  clickThrough(plus)
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  assert.ok(sheet, 'a press opens the sheet rather than writing anything')
  const title = boardSeat(sheet, 'newSessionTitle')
  const body = boardSeat(sheet, 'newSessionBody')
  assert.ok(title && body, 'with a title and a body to write')
  typeIn(title, '把登录改完')
  typeIn(body, '先看错误提示')
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], "the conversation is made in the goal's own workspace")
  assert.equal(newSessions.prompts.length, 0, "nothing is sent on the reader's behalf")
  assert.equal(pasted && pasted.command, 'insertText', 'the words go in as a draft')
  assert.equal(pasted && pasted.text, '先看错误提示', "the sheet's own body")
  assert.deepEqual(opened, ['fresh'], 'and the new conversation is what opens')
  const named = renames.calls.find((call) => call.id === 'fresh' && call.title === '把登录改完')
  assert.ok(named, 'the title the reader typed names the conversation')
  assert.ok(renames.calls.every((call) => call.source !== 'mainView'), 'and never as the main view: that marks it read')
  assert.equal(boardDoc().placed.fresh, 'w1', 'the conversation is filed under the goal the plus was on')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'the board gets out of the way')
})

await checkAsync('a title on its own stands a conversation up, with nothing said yet', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('quiet')
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  assert.ok(sheet, 'the sheet is up')
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(newSessions.calls, [], 'an empty sheet is not a request')
  assert.ok(boardSeat(boardPanel(), 'newSessionSheet'), 'it stays up instead')
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  typeIn(boardSeat(sheet, 'newSessionTitle'), '把登录改完')
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], "the conversation is still made in the goal's workspace")
  assert.equal(newSessions.prompts.length, 0, 'a title with no body has no message to send')
  assert.equal(pasted, null, 'and there is nothing to put in the message box either')
  assert.deepEqual(opened, ['quiet'], 'and the new conversation is what opens')
  assert.equal(renames.calls.filter((call) => call.id === 'quiet' && call.title).length, 1, 'named once, by the title that was written')
  assert.equal(renames.calls.find((call) => call.id === 'quiet').title, '把登录改完', 'the title the reader typed names it')
  assert.equal(boardDoc().placed.quiet, 'w1', 'filed under the goal the plus was on')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'the board gets out of the way')
})

await checkAsync('the new-conversation sheet can choose the model the conversation starts on', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  newSessions.results.push('choosy')
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  const row = boardSeat(sheet, 'newSessionModel')
  assert.ok(row, 'the sheet carries a row for the model')
  assert.equal(
    boardSeat(row, 'newSessionModelName').textContent,
    expectedLabel('boardNewSessionModelDefault'),
    'which starts on whatever the host would use'
  )
  clickThrough(row)
  await flush()
  assert.notEqual(modelPickPanel(), null, "a press opens the page's own model window")
  assert.equal(modelPickRows().length, 3, 'with the configured list on it')
  assert.deepEqual(MODEL.calls, [], 'opening it submits nothing')
  tap('Escape')
  assert.equal(modelPickPanel(), null, 'escape takes only the window down')
  assert.ok(boardSeat(boardPanel(), 'newSessionSheet'), 'the sheet is still up behind it')
  clickThrough(row)
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.equal(modelPickPanel(), null, 'confirming takes the window down')
  assert.deepEqual(MODEL.calls, [], 'and still submits nothing: there is no conversation yet')
  const named = boardSeat(boardSeat(boardPanel(), 'newSessionSheet'), 'newSessionModelName')
  assert.equal(named.textContent, 'DeepSeek Reasoner', 'the row now names the model that was chosen')
  const openSheet = boardSeat(boardPanel(), 'newSessionSheet')
  typeIn(boardSeat(openSheet, 'newSessionTitle'), '把登录改完')
  typeIn(boardSeat(openSheet, 'newSessionBody'), '先看错误提示')
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  clickThrough(boardSeat(openSheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(
    MODEL.calls,
    [{ provider: 'deepseek', model: 'deepseek-reasoner' }],
    'the chosen model is submitted to the conversation that was made'
  )
  assert.equal(newSessions.prompts.length, 0, "and nothing is sent on the reader's behalf")
  assert.equal(pasted && pasted.text, '先看错误提示', 'the body goes in as a draft')
  assert.deepEqual(opened, ['choosy'], 'the new conversation is what opens')
  assert.ok(
    renames.calls.some((call) => call.id === 'choosy' && call.title === '把登录改完'),
    'named as before, by the title that was written'
  )
})

await checkAsync('a conversation whose words could not be put in the box says so', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('nopaste')
  tap('j')
  clickThrough(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  const sheet = boardSeat(boardPanel(), 'newSessionSheet')
  typeIn(boardSeat(sheet, 'newSessionTitle'), '把登录改完')
  typeIn(boardSeat(sheet, 'newSessionBody'), '先看错误提示')
  // A host whose editor refuses the words, and whose page has no paste event.
  fakeDocument.execCommand = () => false
  clickThrough(boardSeat(sheet, 'newSessionConfirm'))
  await flush()
  assert.deepEqual(opened, ['nopaste'], 'the conversation is still made and opened')
  assert.equal(newSessions.prompts.length, 0, 'and nothing is sent on its behalf')
  assert.equal(toastText(), expectedLabel('boardNewSessionPasteFailed'), 'the lost draft is said out loud')
})

await checkAsync('a card dropped on the goal plus starts a conversation from its words', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('from-card')
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const firstTitle = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(firstTitle, '把登录改完')
  pressIn(firstTitle, 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), '先看错误提示')
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  aimAt(boardSeat(boardBlock('dsh-vim'), 'goalNewSession'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], 'the same workspace the goal names')
  assert.equal(newSessions.prompts.length, 0, 'the card is a draft, not a message')
  assert.equal(
    pasted && pasted.text,
    ['把登录改完', '先看错误提示'].join(String.fromCharCode(10)),
    'all of the card, title and body together'
  )
  assert.deepEqual(opened, ['from-card'], 'the new conversation opens')
  const named = renames.calls.find((call) => call.id === 'from-card' && call.title === '把登录改完')
  assert.ok(named, "and wears the card's own title")
  assert.equal(boardDoc().placed['from-card'], 'w1', 'filed under the goal whose plus took it')
  const receipt = boardDoc().cards[0]
  assert.equal(receipt.done, true, 'the card stays behind as a finished trace')
  assert.equal(receipt.link, 'from-card', 'tied to the conversation it started')
})

await checkAsync('a card dropped on the goal name starts a conversation from its words', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  newSessions.results.push('from-name')
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const firstTitle = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(firstTitle, '把登录改完')
  pressIn(firstTitle, 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), '先看错误提示')
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  // The name is the door, not only the small ＋ at the end of it: a heading is
  // a row a reader aims at, and a card let go on it starts the same work.
  const head = blockHead(boardBlock('dsh-vim'))
  aimAt(boardSeat(boardBlock('dsh-vim'), 'blockName'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  // Read while the hand is still up: letting go takes the light down with it.
  fire('pointermove', { type: 'pointermove', clientX: 300, clientY: 200, preventDefault() {} })
  assert.equal(head.__attrs['data-drop'], 'true', 'the heading says it would take the card')
  fire('pointerup', { type: 'pointerup' })
  resetHitTest()
  await flush()
  assert.deepEqual(newSessions.calls, [{ workspaceId: 'w1' }], 'the conversation starts in the goal it was let go on')
  assert.equal(
    pasted && pasted.text,
    ['把登录改完', '先看错误提示'].join(String.fromCharCode(10)),
    'with the whole card as its draft'
  )
  assert.deepEqual(opened, ['from-name'], 'and opens')
  assert.equal(boardDoc().placed['from-name'], 'w1', 'filed under that goal')
  tap('Escape')
})

await checkAsync('the tray heading has no door: a card let go on it is filed there', async () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const firstTitle = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(firstTitle, '先放着')
  fireOn(firstTitle, 'blur', { type: 'blur' })
  // The tray is where work has no home: starting a conversation there would be
  // starting one nowhere, so its heading answers nothing.
  const tray = boardBlock(expectedLabel('boardInbox'))
  aimAt(boardSeat(tray, 'blockName'))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  fire('pointermove', { type: 'pointermove', clientX: 300, clientY: 200, preventDefault() {} })
  assert.equal(blockHead(tray).__attrs['data-drop'], 'false', 'the tray does not offer to start anything')
  fire('pointerup', { type: 'pointerup' })
  resetHitTest()
  await flush()
  assert.deepEqual(newSessions.calls, [], 'no conversation is made')
  assert.equal(toastText(), expectedLabel('boardFiled'), 'the card is simply put away there')
  tap('Escape')
})

// --- onto the board, and the board's own parts -----------------------------

/** The board heading's "write a card" button. */
function writeCardButton() {
  return boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
}

/** Lines of one note, joined without an escape any tool could double. */
const noteLines = (...parts) => parts.join(String.fromCharCode(10))

/** Press a mark and then click it: the press is what clears a leftover carry. */
function tapMark(node) {
  if (!node) return
  pressForDrag(node, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  fireOn(node, 'click', { type: 'click', stopPropagation() {} })
}

/** The board heading's tidy button. */
function tidyButton() {
  return boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'tidyBoard')
}


/** The list the chip opens, or null while it is closed. */
function doneBinList() {
  return boardSeat(boardPanel(), 'doneBinList')
}

/**
 * One card written, tied to the conversation on the panel, and checked off.
 *
 * The shape the bin is for: a thought that was handed to a conversation and then
 * finished. Written the way a reader writes one - the write button, the words,
 * then dropped on the conversation card (which ties without delivering).
 * @param {string} text - what the card says.
 * @returns {object} the card as the store has it.
 */
function finishedCard(text) {
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const firstField = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(firstField, text)
  pressIn(firstField, 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), text)
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  aimAt(cardsIn(boardBlocks()[0])[0])
  pressForDrag(looseCards()[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  // A real press on the box starts with a pointerdown, and that press is what
  // clears the leftover 'that was a carry, not a click' flag. Firing the click
  // alone leaves the flag of the drop standing, and the box swallows it.
  // The thought lives in the conversation's own column now; its done box is
  // there, under the card it was filed beneath.
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const filed = stack.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  const box = boardSeat(filed, 'cardDoneToggle')
  pressForDrag(box, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  fireOn(box, 'click', { type: 'click', stopPropagation() {} })
  return fakeWindow.__dshVim.board().loose[0]
}

/** A board with one conversation, its card written and tied and finished. */
function boardWithFinishedCard(text) {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  finishedCard(text)
  // Putting it away is the reader's own gesture: a finished note is dragged onto
  // the conversation it belongs to, and lands in that conversation's own list.
  aimAt(boardSeat(boardCard('target'), 'cardEnter'))
  const column = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const trace = column.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  pressForDrag(trace.children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  return fakeWindow.__dshVim.board().loose[0]
}

check('a finished card is put away by the gesture that put it there', () => {
  const card = boardWithFinishedCard('已经交付过的一句')
  assert.equal(card.done, true, 'the card is finished')
  assert.equal(card.link, 'target', 'and tied to the conversation')
  // The card is put away by the reader's own gesture - let go on the band of the
  // conversation it belongs to - rather than by a later clean-up. 整理 has
  // nothing left to do with it, which is the whole point of the gesture.
  assert.equal(looseCards().length, 0, 'the card leaves the paper as it is let go')
  assert.equal(boardDoc().cards[0].filed, '@done', 'and is put away in that conversation')
  const mark = boardSeat(boardCard('target'), 'cardArchive')
  assert.ok(mark, 'the conversation that took it offers its own list')
  assert.equal(String(boardSeat(mark, 'cardArchiveCount').textContent), '1', 'saying how many it holds')
  assert.equal(toastText(), expectedLabel('boardDoneFiledOne'), 'and the press says where it went')
  tap('Escape')
})

check('整理 leaves a finished card alone: the drop is what puts it away', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  // Written, tied and finished, but never handed over: the gesture that puts a
  // finished card away is letting go of it on the conversation's band, so 整理
  // must not put it away behind the reader's back.
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '自己留着的一句')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(boardCard('target'))
  pressForDrag(looseCards()[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  // The drop filed the thought under the conversation, so its box is in that
  // column now.
  const column = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const stacked = column.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  const box = boardSeat(stacked, 'cardDoneToggle')
  pressForDrag(box, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  fireOn(box, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardDoc().cards[0].link, 'target', 'the drop tied it to the conversation')
  assert.equal(boardDoc().cards[0].done, true, 'and the box finished it')
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  assert.equal(looseCards().length, 0, 'the card stays where the drop put it')
  assert.equal(boardDoc().cards[0].filed, '', 'and nothing was filed behind the reader')
  assert.equal(boardSeat(boardCard('target'), 'cardArchive'), null, 'so no card offers a list it never got')
  tap('Escape')
})

check('整理 leaves a finished card nobody is tied to in the inbox', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '没人认领的一句')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  fireOn(tidyButton(), 'click', { type: 'click' })
  clock.advance(800)
  assert.equal(looseCards().length, 1, 'a card nobody owns stays a card, finished or not')
  assert.equal(boardDoc().cards[0].filed, '', 'and is not put away')
  assert.equal(boardSeat(boardCard('target'), 'cardArchive'), null, 'and no card offers a list it could open')
  tap('Escape')
})

check('the finished list is one line per note, with the two marks it needs', () => {
  boardWithFinishedCard('收进去的一句')
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const list = doneBinList()
  assert.ok(list, 'the card mark opens its list')
  const row = boardSeat(list, 'doneRow')
  assert.ok(row, 'with the note as a line of the list')
  assert.equal(String(boardSeat(row, 'doneTitle').textContent), '收进去的一句', 'saying what it said')
  // A line in this list is already finished, and the list already belongs to one
  // conversation: neither switch nor tie is said here a second time.
  assert.equal(boardSeat(row, 'cardDoneToggle'), null, 'no second finished switch here')
  assert.equal(boardSeat(row, 'cardLinkLabel'), null, 'and its tie is not said twice')
  fireOn(boardSeat(row, 'donePutBack'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardDoc().cards[0].filed, '', 'putting it back takes it out of the list')
  const back = boardSeat(boardBlock('dsh-vim'), 'cardStack').children
    .find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.ok(back, 'and it stands in the conversation\'s column again')
  tap('Escape')
})


check('a finished line opens to its whole note', () => {
  const who = '一条已经收起来的想法'
  boardWithFinishedCard(who)
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const row = () => boardSeat(doneBinList(), 'doneRow')
  assert.equal(String(boardSeat(row(), 'doneTitle').textContent), who, 'the list shows one line of title')
  assert.equal(String(row().__attrs['data-open']), 'undefined', 'folded, it is one line')
  // The whole line opens the note, not only its words: a list is read by
  // pointing at a line.
  fireOn(row(), 'click', { type: 'click', stopPropagation() {} })
  // The fixture writes its words into both rows, so the stored note is the two
  // of them; what is being checked here is that the row shows all of what is
  // stored, not just the line the list folded it to.
  assert.equal(
    String(boardSeat(row(), 'doneFull').textContent),
    noteLines(who, who),
    'and the whole of it when the line is pressed'
  )
  assert.equal(String(row().__attrs['data-open']), 'true', 'the row says it is open')
  fireOn(row(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(String(boardSeat(row(), 'doneTitle').textContent), who, 'pressing it again folds it back')
  tap('Escape')
})
check('a put-away card can be dragged back out of the bin', () => {
  boardWithFinishedCard('拖回来的一句')
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const row = boardSeat(doneBinList(), 'doneRow')
  assert.ok(row, 'the list has the card to drag')
  pressForDrag(row, 40, 40)
  dragTo(560, 320)
  assert.equal(boardDoc().cards[0].filed, '', 'the card leaves the bin')
  assert.equal(looseCards().length, 1, 'and is paper under the hand')
  tap('Escape')
})

check('a card offers its finished list only once it holds something', () => {
  // Written, tied and finished, but never handed over: the list a card offers
  // is for what it holds, and it holds nothing yet.
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  finishedCard('交给它的一句')
  clock.advance(800)
  assert.equal(boardSeat(boardCard('target'), 'cardArchive'), null, 'an empty list is not offered')
  // The reader's own gesture hands the card over, and the offer appears.
  aimAt(boardSeat(boardCard('target'), 'cardEnter'))
  const column = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const trace = column.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  pressForDrag(trace.children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  clock.advance(800)
  const mark = boardSeat(boardCard('target'), 'cardArchive')
  assert.ok(mark, 'and the conversation that was handed that card says so')
  assert.equal(String(boardSeat(mark, 'cardArchiveCount').textContent), '1', 'with how many it holds')
  tap('Escape')
})

check('a card mark opens the list already filtered to that conversation', () => {
  boardWithFinishedCard('只给这一条')
  // Already put away by the drop: no tidy is needed before opening the list, and a
  tapMark(boardSeat(boardCard('target'), 'cardArchive'))
  const list = doneBinList()
  assert.ok(list, 'the mark opens the same list the heading opens')
  const rows = list.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'doneRow')
  assert.equal(rows.length, 1, 'holding what was handed to that conversation')
  const head = boardSeat(boardPanel(), 'doneBinHead')
  // The list stands beside the card it belongs to, so the heading says what the
  // list is and how long it is; whose it is is said by where it is.
  assert.equal(
    String(head.textContent),
    expectedLabel('boardDoneBin') + '1\u00d7',
    'and saying what it is, with how many it holds'
  )
  tap('Escape')
})

check('a panel stands the cards still warm above a rule, and the rest under it', () => {
  // The whole rule is about one day, so the check pins the clock to 15:00: an
  // hour inside a day is the only thing that makes "five hours ago" mean
  // "earlier today" whenever the suite happens to run.
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  now = midnight.getTime() + 15 * HOUR
  registry.publish([], [{
    workspaceId: 'w1',
    title: 'one',
    path: '/work/one',
    sessionIds: ['run', 'done', 'early1', 'early2', 'early3'],
  }])
  statusFeed.put('run', { running: true })
  statusFeed.put('done', { running: false, completionUnread: true })
  seed([
    // 11:00, four hours ago, and still warm: a turn in flight is not a clock.
    { id: 'run', displayTitle: 'running', updatedAt: ago(4) },
    // 10:00: finished today and nobody has opened it.
    { id: 'done', displayTitle: 'finished', updatedAt: ago(5) },
    // 09:00 and older: today's work, no longer the thing being worked in.
    { id: 'early1', displayTitle: 'early one', updatedAt: ago(6) },
    { id: 'early2', displayTitle: 'early two', updatedAt: ago(7) },
    { id: 'early3', displayTitle: 'early three', updatedAt: ago(8) },
  ])
  tap('j')
  const grid = boardSeat(boardBlock('one'), 'blockColumns')
  const drawn = grid.children.map((node) => {
    const role = node.__attrs ? node.__attrs['data-role'] : ''
    return role === 'panelRule' ? 'rule' : String(node.__attrs && node.__attrs['data-column'])
  })
  assert.deepEqual(drawn, ['run', 'done', 'rule', 'early1', 'early2', 'early3'],
    'the warm two stand first, then the rule, then what today already used up')
  const rule = boardSeat(boardBlock('one'), 'panelRule')
  assert.equal(String(boardSeat(rule, 'panelRuleText').textContent), expectedLabel('boardRestBefore') + '3' + expectedLabel('boardRestAfter'),
    'the rule says how much stands under it')
  // Two warm cards leave one slot of the row: the rule takes exactly that one,
  // so the first card under it cannot stand beside it.
  assert.equal(rule.style.flex, '0 0 280px', 'the rule fills the row the warm cards left')
  tap('Escape')
  now = was
})

check('a warm row already full gives the rule a row of its own', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  now = midnight.getTime() + 15 * HOUR
  registry.publish([], [{
    workspaceId: 'w1',
    title: 'one',
    path: '/work/one',
    sessionIds: ['a', 'b', 'c', 'early1', 'early2'],
  }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(3) },
    { id: 'early1', displayTitle: 'early one', updatedAt: ago(6) },
    { id: 'early2', displayTitle: 'early two', updatedAt: ago(7) },
  ])
  tap('j')
  const rule = boardSeat(boardBlock('one'), 'panelRule')
  assert.equal(rule.style.flex, '0 0 100%', 'a full warm row pushes the rule onto its own line')
  assert.equal(boardSeat(boardBlock('one'), 'blockColumns').children.indexOf(rule), 3,
    'which stands after the third card and before the rest')
  tap('Escape')
  now = was
})

check('a panel of three has no rule to draw', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  now = midnight.getTime() + 15 * HOUR
  registry.publish([], [{
    workspaceId: 'w1',
    title: 'one',
    path: '/work/one',
    sessionIds: ['run', 'early1', 'early2'],
  }])
  statusFeed.put('run', { running: true })
  seed([
    { id: 'run', displayTitle: 'running', updatedAt: ago(4) },
    { id: 'early1', displayTitle: 'early one', updatedAt: ago(6) },
    { id: 'early2', displayTitle: 'early two', updatedAt: ago(7) },
  ])
  tap('j')
  // Three is one row: the eye takes all three at once, and a rule would only
  // cost the panel a line to say what the row already says.
  assert.equal(boardSeat(boardBlock('one'), 'panelRule'), null, 'nothing to divide')
  assert.deepEqual(
    boardSeat(boardBlock('one'), 'blockColumns').children.map((node) => node.__attrs['data-column']),
    ['run', 'early1', 'early2'],
    'and the order is the one the panel remembers'
  )
  tap('Escape')
  now = was
})

/** The state one conversation's card is wearing, as the words the card shows. */
function cardStateWords(id) {
  const card = cardsIn(boardStage()).find((node) => node.__attrs['data-session-id'] === id)
  if (!card) return ''
  const computed = boardSeat(card, 'status')
  const said = boardSeat(card, 'cardState')
  const offered = boardSeat(card, 'cardStateAdd')
  if (computed) return String(computed.textContent)
  if (said) return String(said.textContent)
  return offered ? '+' : ''
}

/** The card of one conversation, as it stands on the board now. */
function cardOf(id) {
  return cardsIn(boardStage()).find((node) => node.__attrs['data-session-id'] === id) || null
}

check('a completion the reader has opened still says something', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['done'] }])
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: todayAt(2) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('j')
  assert.equal(cardStateWords('done'), expectedLabel('statusDone'), 'the shell says it just finished')
  // The reader opens it. The shell drops the flag the moment the conversation is
  // read, which is the whole reason the board writes the fact down itself.
  statusFeed.put('done', { running: false, completionUnread: false })
  tap('Escape')
  tap('j')
  assert.equal(cardStateWords('done'), expectedLabel('statusFinished'),
    'and after reading it the card says it finished, rather than nothing at all')
  tap('Escape')
})

check('a card with nothing to say offers the two words', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['plain'] }])
  seed([{ id: 'plain', displayTitle: 'plain', updatedAt: todayAt(2) }])
  tap('j')
  assert.equal(boardSeat(cardOf('plain'), 'status'), null, 'the shell has nothing to say about it')
  const add = boardSeat(cardOf('plain'), 'cardStateAdd')
  assert.ok(add, 'so the empty seat is offered')
  fireOn(add, 'click', { type: 'click', stopPropagation() {} })
  const menu = boardSeat(cardOf('plain'), 'verdictMenu')
  assert.ok(menu, 'a press on it opens the two words')
  assert.deepEqual(
    menu.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'verdictPick')
      .map((node) => node.__attrs['data-verdict']),
    ['paused', 'settled'],
    'paused and settled, in that order'
  )
  const paused = menu.children.find((node) => node.__attrs && node.__attrs['data-verdict'] === 'paused')
  fireOn(paused, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(cardStateWords('plain'), expectedLabel('statusPaused'), 'the card wears the word the reader gave it')
  tap('Escape')
  tap('j')
  assert.equal(cardStateWords('plain'), expectedLabel('statusPaused'), 'and it is still there after a round trip')
  tap('Escape')
})

check('a word about an older turn is a word about nothing', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['plain'] }])
  seed([{ id: 'plain', displayTitle: 'plain', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(boardSeat(cardOf('plain'), 'cardStateAdd'), 'click', { type: 'click', stopPropagation() {} })
  const settled = boardSeat(cardOf('plain'), 'verdictMenu').children
    .find((node) => node.__attrs && node.__attrs['data-verdict'] === 'settled')
  fireOn(settled, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(cardStateWords('plain'), expectedLabel('statusSettled'), 'settled, as the reader said')
  // The conversation moves: a new turn, a new message. What the reader said was
  // about the turn before that, and the card must not keep claiming it.
  seed([{ id: 'plain', displayTitle: 'plain', updatedAt: todayAt(2) + 1 }])
  tap('Escape')
  tap('j')
  assert.equal(cardStateWords('plain'), '+', 'so the card is back to offering the seat')
  tap('Escape')
})

check('a card the shell is talking about offers no state control', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['run'] }])
  seed([{ id: 'run', displayTitle: 'running', updatedAt: todayAt(2) }])
  statusFeed.put('run', { running: true })
  tap('j')
  assert.equal(cardStateWords('run'), expectedLabel('statusRunning'), 'the turn in flight owns the slot')
  assert.equal(boardSeat(cardOf('run'), 'cardStateAdd'), null, 'and the seat is not offered while it does')
  tap('Escape')
})

check('a conversation with no goal wears no goal colour', () => {
  // A workspace owns no conversations today, so the one on the board is the
  // tray's: the tray is where work has no home, and a hue would be claiming one.
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: [] }])
  seed([{ id: 'loose', displayTitle: 'nobody filed this', updatedAt: todayAt(3) }])
  tap('j')
  const tray = boardBlock('收件箱')
  assert.ok(tray, 'the conversation is drawn in the tray')
  assert.equal(tray.style.background, 'var(--dshv-board-column, rgba(255, 255, 255, 0.05))',
    'the tray keeps the board\'s own paper: work with no home has no place to wear')
  assert.ok(!tray.style.borderColor, 'and draws no coloured edge')
  tap('Escape')
})

check('two goals wear different colours even when they share a name', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'same', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'same', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(3) },
  ])
  tap('j')
  const dots = boardBlocks().slice(0, 2).map((node) => String(boardSeat(node, 'blockDot').style.background))
  assert.notEqual(dots[0], dots[1], 'two goals are told apart by colour')
  // The colour comes from the place, not from its name: these two are called the
  // same thing and still read apart, which is what a rename cannot undo.
  assert.ok(dots[0].indexOf('hsl(') === 0 && dots[1].indexOf('hsl(') === 0, 'both are hues of their own')
  tap('Escape')
})

check('a note wears the colour of the goal its conversation stands in', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const hueOf = (colour) => {
    const found = /hsl\((\d+)/.exec(String(colour))
    return found ? found[1] : ''
  }
  // A card nobody owns is the amber the board has always drawn.
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '没人认领')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  assert.ok(
    String(looseCards()[0].style.background).indexOf('var(--dshv-board-note') === 0,
    'a note tied to nothing keeps the amber paper'
  )
  // Tied to a conversation, it takes that panel's own hue.
  aimAt(cardsIn(boardBlock('one'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  const tied = boardSeat(boardBlock('one'), 'cardStack').children
    .find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  const dot = String(boardSeat(boardBlocks()[0], 'blockDot').style.background)
  assert.equal(hueOf(tied.style.background), hueOf(dot), 'the paper and the goal dot are one colour')
  assert.equal(hueOf(tied.style.borderLeft), hueOf(dot), 'spine and all')
  tap('Escape')
})


check('a goal keeps the colour it was given when its neighbours come and go', () => {
  // Two ids on the same seat of the wheel: the paint must move one of them, and
  // the moved one has to stay moved. `w1` and `w10` both seed on seat 6.
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w10', title: 'ten', path: '/work/ten', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(3) },
  ])
  tap('j')
  const before = String(boardSeat(boardBlock('ten'), 'blockDot').style.background)
  const doc = boardDoc()
  assert.ok(doc && doc.seats && doc.seats.w1 !== undefined && doc.seats.w10 !== undefined,
    'both seats are written down the first time the places are drawn')
  assert.notEqual(doc.seats.w1, doc.seats.w10, 'and the last one drawn was moved off the taken seat')
  // The neighbour goes away. A seat that lived only in the paint would hand this
  // goal back to its own seed, which is the seat the other one had.
  tap('Escape')
  registry.publish([], [{ workspaceId: 'w10', title: 'ten', path: '/work/ten', sessionIds: ['b'] }])
  tap('j')
  assert.equal(String(boardSeat(boardBlock('ten'), 'blockDot').style.background), before,
    'the colour the reader knows it by is the colour it still wears')
  tap('Escape')
})

check('the dot on a goal opens the wheel, and the colour picked is the one kept', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const dot = boardSeat(boardBlock('one'), 'blockDot')
  fireOn(dot, 'click', { type: 'click' })
  const wheel = boardSeat(boardStage(), 'seatMenu')
  assert.ok(wheel, 'a press on the dot opens the twelve colours')
  assert.equal(wheel.children.length, 12, 'the wheel is the whole of the choice')
  const swatch = wheel.children.find((node) => node.__attrs && node.__attrs['data-seat'] === '7')
  fireOn(swatch, 'click', { type: 'click' })
  // Seat 7 is 216 degrees on the wheel, and the goal wears it everywhere.
  const painted = String(boardSeat(boardBlock('one'), 'blockDot').style.background)
  assert.ok(painted.indexOf('hsl(216') === 0, `the dot takes the seat picked (${painted})`)
  assert.equal(boardDoc().seats.w1, 7, 'the choice is written into the board document')
  assert.equal(boardSeat(boardStage(), 'seatMenu'), null, 'and the wheel puts itself away')
  tap('Escape')
  tap('j')
  assert.ok(String(boardSeat(boardBlock('one'), 'blockDot').style.background).indexOf('hsl(216') === 0,
    'a colour picked by hand outlives the paint it was picked in')
})

check('the pin key puts the conversation on screen onto the board', () => {
  seedCurrent('here')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'nothing is open yet')
  assert.equal(tap('i'), true, 'the pin key belongs to the page')
  assert.equal(toastText(), expectedLabel('pinDone'), 'and the press says what it did')
  // The day turns over: without the mark the board would have let it go.
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(0) - 2 }])
  tap('j')
  assert.deepEqual(boardCardIds(), ['here'], 'a conversation put there by hand outlives the day it moved')
  tap('Escape')
})

check('the pin key says what is missing when nothing is on screen', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('i')
  assert.equal(toastText(), expectedLabel('pinNoSession'), 'a key with nothing to act on says so')
})

check('inside the task window the pin key acts on the selected row', () => {
  seed([
    { id: 'first', displayTitle: 'first', updatedAt: todayAt(4) },
    { id: 'second', displayTitle: 'second', updatedAt: todayAt(3) },
  ])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'the window opens on the newest row')
  assert.equal(tap('i'), true, "the pin key is the window's while the window is up")
  assert.equal(toastText(), expectedLabel('pinDone'))
  tap('Escape')
  // Only the row the cursor stood on was kept.
  seed([{ id: 'first', displayTitle: 'first', updatedAt: todayAt(0) - 2 }])
  tap('j')
  assert.deepEqual(boardCardIds(), ['first'], 'the row the cursor stood on is the one that stayed')
  tap('Escape')
})

/**
 * The native drag a shell row makes, delivered the way the DOM delivers one.
 *
 * The shell's session rows are natively draggable (that is how the list is
 * reordered), and what a row sets on its data transfer is its conversation's
 * id as plain text — the payload the canvas reads at the drop. The words are
 * guarded until then, so the dragover carries only the types.
 * @param {object} node - the element the drag is over.
 * @param {string} [id] - the words aboard, when the drop is allowed to read.
 * @param {object} [extra] - fields folded into the event.
 * @returns {void}
 */
function dragOnto(node, id, extra) {
  const dataTransfer = { types: ['text/plain'] }
  if (id !== undefined) dataTransfer.getData = () => id
  fireOn(node, 'dragover', {
    type: 'dragover', clientX: 600, clientY: 300, dataTransfer, preventDefault() {}, ...extra,
  })
  if (id === undefined) return
  fireOn(node, 'drop', {
    type: 'drop', clientX: 600, clientY: 300, dataTransfer, preventDefault() {}, ...extra,
  })
}

check('a session row dragged in from the sidebar lands on the board', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  dragOnto(boardBody(), 'a')
  assert.equal(toastText(), expectedLabel('pinDone'), 'the drop says what the pin key says')
  // The day turns over: the mark the drop set is what keeps the card.
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(0) - 2 }])
  tap('Escape')
  tap('j')
  assert.deepEqual(boardCardIds(), ['a'], 'a dragged-in conversation outlives the day it moved')
  tap('Escape')
})

check('a session dragged in lands under the goal it is let go on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  // The hit test aims at the goal the row is let go on, as a real pointer over
  // that panel would. The node the dragover lights is the node the drop must
  // unlight: the paint that follows rebuilds the stage, so the assertion reads
  // the old node while it is still the one that was marked.
  aimAt(boardBlock('two'))
  dragOnto(boardBody())
  const lit = boardBlock('two')
  assert.equal(lit.__attrs['data-drop'], 'true', 'the goal under the hand says it would take the card')
  dragOnto(boardBody(), 'a')
  assert.equal(lit.__attrs['data-drop'], 'false', 'and the drop takes that line down')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the drop files the conversation under that goal')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and that goal draws it')
  assert.equal(cardsIn(boardBlock('one')).length, 0, 'while the one its workspace implies does not')
  assert.equal(toastText(), expectedLabel('boardMoved'), 'the filing is the more specific claim, so it is the one spoken')
  resetHitTest()
  tap('Escape')
  tap('j')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the filing was written down')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and the next board opens with it there')
  tap('Escape')
})

check('a drag that is not a conversation is refused with a word', () => {
  seed([{ id: 'old', displayTitle: 'old', updatedAt: todayAt(0) - 2 }])
  tap('j')
  // A workspace row carries its own key, which is not a conversation's id:
  // the canvas took the drag, so it answers the refusal itself.
  dragOnto(boardBody(), 'w-not-a-session')
  assert.equal(toastText(), expectedLabel('boardDragUnknown'), 'the refusal is said, not left to the browser')
  assert.deepEqual(fakeWindow.__dshVim.board().starred, [], 'and nothing was kept')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, {}, 'or filed anywhere')
  tap('Escape')
})

check('the goal highlight follows a native drag and leaves with it', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  aimAt(boardBlock('two'))
  // While the hand is over a goal, that goal says it would take the card.
  dragOnto(boardBody())
  assert.equal(
    boardBlock('two').__attrs['data-drop'], 'true',
    'the goal under the hand is the one that would take the card'
  )
  // A leave that crosses out of the canvas takes the line with it; one that
  // merely steps into a panel's children does not.
  fireOn(boardBody(), 'dragleave', {
    type: 'dragleave', relatedTarget: boardBlock('two'), preventDefault() {},
  })
  assert.equal(boardBlock('two').__attrs['data-drop'], 'true', 'stepping into a child keeps the line up')
  fireOn(boardBody(), 'dragleave', { type: 'dragleave', relatedTarget: null })
  assert.equal(boardBlock('two').__attrs['data-drop'], 'false', 'leaving the canvas takes it down')
  // And a drag cancelled anywhere ends the same way: `dragend` travels with the
  // row that started it, so the canvas hears it from the document.
  dragOnto(boardBody())
  assert.equal(boardBlock('two').__attrs['data-drop'], 'true', 'the line is back while the hand is back in')
  fire('dragend', { type: 'dragend' })
  assert.equal(boardBlock('two').__attrs['data-drop'], 'false', 'and a cancelled drag ends with it down')
  resetHitTest()
  tap('Escape')
})

check('a right press on the conversation is the way back to the board', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  // The sidebar keeps its own right presses — the shell answers those with
  // its row menus — so the press is read from the conversation's marked body
  // alone.
  fire('contextmenu', {
    type: 'contextmenu', target: sidebar, clientX: 120, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  assert.equal(fakeWindow.__dshVim.board().open, false, 'a right press on the sidebar is not ours to take')
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  assert.equal(fakeWindow.__dshVim.board().open, true, 'one on the conversation page goes back to the board')
  tap('Escape')
})

check('the three right presses that keep their meaning', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(2) }])
  // One some other handler answered first.
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: true, preventDefault() {},
  })
  // One in the box being typed into: the composer sits inside the
  // conversation's own body, so the marker alone would not spare it.
  const box = el({ tag: 'DIV', editable: true, parent: transcript })
  fire('contextmenu', {
    type: 'contextmenu', target: box, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  box.parentElement = null
  box.parentNode = null
  // One inside a text selection: that press is a copy.
  fakeDocument.getSelection = () => ({
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => ({ getClientRects: () => [{ left: 0, top: 0, right: 2000, bottom: 2000 }] }),
  })
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  fakeDocument.getSelection = undefined
  assert.equal(fakeWindow.__dshVim.board().open, false, 'none of the three opens the board')
  // And the press nothing else claims still is the way back.
  fire('contextmenu', {
    type: 'contextmenu', target: transcript, clientX: 600, clientY: 300,
    defaultPrevented: false, preventDefault() {},
  })
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the bare conversation answers it')
  tap('Escape')
})

check('a goal is named from its ⋯ menu, and the name is remembered', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  // The name's own press folds; renaming is one deliberate press further away,
  // behind the ⋯. A double press on the name must open no field: the two
  // presses are two folds, not a host write.
  fireOn(boardSeat(boardBlocks()[0], 'blockName'), 'dblclick', { type: 'dblclick', stopPropagation() {} })
  assert.equal(boardSeat(boardBlocks()[0], 'blockRename'), null, 'a double press on the name opens no field')
  const menu = openGoalMenu(boardBlocks()[0])
  assert.ok(menu, 'the ⋯ opens a menu')
  assert.equal(goalMenuMark(boardBlocks()[0]).getAttribute('aria-expanded'), 'true', 'and the mark says so')
  const rename = boardSeat(menu, 'goalRenameOpen')
  assert.ok(rename, 'rename is one of its verbs')
  fireOn(rename, 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardBlocks()[0], 'blockRename')
  assert.ok(field, 'the heading becomes a field')
  assert.equal(fakeDocument.activeElement, field, 'and it takes the keyboard')
  assert.equal(boardStage().querySelectorAll('[data-role="goalMenu"]').length, 0, 'the menu goes with the choice')
  assert.equal(field.value, 'dsh-vim', 'carrying the name it had')
  typeIn(field, '  把登录改完  ')
  pressIn(field, 'Enter')
  assert.ok(boardBlock('把登录改完'), 'the heading says what the reader called it, trimmed')
  assert.equal(fakeWindow.__dshVim.board().goals.w1, '把登录改完', 'and the name is written down')
  tap('Escape')
  tap('j')
  assert.ok(boardBlock('把登录改完'), 'the next board opens with that name')
  // A name is a thing the reader chose; giving it back is how it is taken off.
  fireOn(boardSeat(openGoalMenu(boardBlocks()[0]), 'goalRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const again = boardSeat(boardBlocks()[0], 'blockRename')
  typeIn(again, '   ')
  pressIn(again, 'Enter')
  assert.ok(boardBlock('dsh-vim'), 'an empty name is the workspace name again')
  assert.deepEqual(fakeWindow.__dshVim.board().goals, {}, 'and nothing is left written down')
  tap('Escape')
})



check('a goal menu is one at a time, and Escape puts it away', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  const menus = () => boardStage().querySelectorAll('[data-role="goalMenu"]').length
  const firstMark = goalMenuMark(boardBlock('one'))
  openGoalMenu(boardBlock('one'))
  assert.equal(menus(), 1, 'the ⋯ opens one menu')
  fireOn(firstMark, 'click', { type: 'click', stopPropagation() {} })
  assert.equal(menus(), 0, 'the same ⋯ puts it away')
  assert.equal(firstMark.getAttribute('aria-expanded'), 'false', 'and the mark goes quiet')
  openGoalMenu(boardBlock('one'))
  openGoalMenu(boardBlock('two'))
  assert.equal(menus(), 1, 'a second goal\'s ⋯ takes the first menu away')
  assert.equal(goalMenuMark(boardBlock('two')).getAttribute('aria-expanded'), 'true', 'and says which menu is open')
  tap('Escape')
  assert.equal(menus(), 0, 'Escape puts the menu away')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'without closing the board')
  tap('Escape')
})

check('a note that says nothing is not kept', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 1, 'the card is there to be written in')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'closing it empty takes the paper away')
  tap('Escape')
})
check('the card being worked on is drawn over the one it overlaps', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '底下一张')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[1], 'cardTitleInput'), '上面一张')
  fireOn(boardSeat(looseCards()[1], 'cardTitleInput'), 'blur', { type: 'blur' })
  const zOf = (i) => parseInt(looseCards()[i].style.zIndex, 10)
  assert.ok(zOf(1) > zOf(0), 'every card has a number, so a stack has an order')
  // Pressing the one underneath is what asks for it to be on top.
  pressForDrag(looseCards()[0], 5, 5)
  fire('pointerup', { type: 'pointerup' })
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.front, state.loose[0].id, 'the pressed card is the front one')
  assert.ok(zOf(0) > zOf(1), 'and it is drawn over the card it was under')
  tap('Escape')
})
check('an idea card is a title and two lines, and a press opens the rest', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const card = looseCards()[0]
  assert.equal(card.style.width, '280px', 'a card has a fixed width, whatever it says')
  typeIn(boardSeat(card, 'cardTitleInput'), '只有一行')
  fireOn(boardSeat(card, 'cardTitleInput'), 'blur', { type: 'blur' })
  const one = looseCards()[0]
  assert.equal(String(boardSeat(one, 'looseTitle').textContent), '只有一行', 'a single line is the title')
  assert.equal(one.__attrs['data-rows'], '0', 'and the card keeps no body line under it')
  assert.equal(boardSeat(one, 'looseText'), null, 'so nothing is drawn below the heading')
  // A note with a body: two lines of it, and what does not fit fades.
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const secondTitle = boardSeat(looseCards()[1], 'cardTitleInput')
  typeIn(secondTitle, '标题')
  pressIn(secondTitle, 'Enter')
  typeIn(boardSeat(looseCards()[1], 'cardText'), '一\n二\n三')
  fireOn(boardSeat(looseCards()[1], 'cardText'), 'blur', { type: 'blur' })
  const two = looseCards()[1]
  assert.equal(two.__attrs['data-rows'], '2', 'the paper spends two lines on the body')
  assert.equal(two.__attrs['data-clipped'], 'true', 'and fades what it cannot show')
  const closed = parseFloat(two.style.height)
  // A press on the body opens the body where it is: the title keeps its own row
  // in the heading, and the paper plans for the body the field holds.
  fireOn(boardSeat(two, 'looseText'), 'click', { type: 'click', stopPropagation() {} })
  const bodyField = boardSeat(looseCards()[1], 'cardText')
  assert.ok(bodyField, 'the press opens the body field')
  assert.equal(bodyField.value, noteLines('一', '二', '三'), 'holding the body, not the title again')
  assert.equal(looseCards()[1].__attrs['data-rows'], '3', 'the paper is as tall as the body it holds')
  assert.ok(parseFloat(looseCards()[1].style.minHeight) >= closed, 'never smaller than the paper it replaced')
  pressIn(bodyField, 'Escape')
  tap('Escape')
})

check('a press on the body while the name is being typed opens the thought', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '一条想法')
  // The way the reader moves from the name to the thought: a press on the body
  // offered under the name, delivered as the browser delivers it - the press,
  // the up, then the click on the element that was pressed. The press must
  // keep that element alive for the click, and the paint a settle used to
  // carry here is what used to swallow it.
  const seat = boardSeat(looseCards()[0], 'looseText')
  assert.ok(seat, 'a card being named offers its body under the name')
  pressForDrag(seat, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, '一条想法', 'the press settles the name without taking the card away')
  clickThrough(seat)
  const body = boardSeat(looseCards()[0], 'cardText')
  assert.ok(body, 'the one press opens the body field')
  assert.equal(fakeDocument.activeElement, body, 'with the caret in it')
  typeIn(body, '正文')
  fireOn(body, 'blur', { type: 'blur' })
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, noteLines('一条想法', '正文'), 'and both fields kept their words')
  tap('Escape')
})

check('a press on the paper settles an empty card in one gesture', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 1, 'the empty card is up')
  // The pointerdown settles the words and the pointerup pays the paint, so
  // the card is gone without a second press.
  pressForDrag(boardBody(), 40, 40)
  fire('pointerup', { type: 'pointerup' })
  assert.equal(fakeWindow.__dshVim.board().loose.length, 0, 'an empty card does not survive its own dismissal')
  assert.equal(looseCards().length, 0, 'and the page no longer shows it')
  tap('Escape')
})

check('a press on the name while the thought is open moves the caret there', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '名字')
  pressIn(boardSeat(looseCards()[0], 'cardTitleInput'), 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), '内容')
  // The thought is open and the caret is in it: pressing the name moves the
  // caret to the name in the one press, with the body's words kept where the
  // typing left them.
  const titleSeat = boardSeat(looseCards()[0], 'looseTitle')
  pressForDrag(titleSeat, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  clickThrough(titleSeat)
  const moved = boardSeat(looseCards()[0], 'cardTitleInput')
  assert.ok(moved, 'the name field is up')
  assert.notEqual(moved, titleSeat, 'painted fresh by the move')
  assert.equal(fakeDocument.activeElement, moved, 'with the caret in it')
  assert.equal(moved.value, '名字', 'holding the name it had')
  assert.equal(fakeWindow.__dshVim.board().loose[0].text, noteLines('名字', '内容'), 'and the thought is still written down')
  pressIn(moved, 'Escape')
  tap('Escape')
})

check('a gesture the window lost does not wedge the board', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '一')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[1], 'cardTitleInput'), '二')
  fireOn(boardSeat(looseCards()[1], 'cardTitleInput'), 'blur', { type: 'blur' })
  // A press whose up never comes - the window lost the pointer to another
  // app. The gesture must end with the focus, not wait for an up that is
  // never coming, or the board would answer no press again.
  pressForDrag(looseCards()[0], 5, 5)
  blurWindow()
  pressForDrag(looseCards()[1], 5, 5)
  fire('pointerup', { type: 'pointerup' })
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.front, state.loose[1].id, 'a press after a lost gesture is answered')
  tap('Escape')
})

check('the drop band is up only while a note is being carried', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  tap('j')
  const band = () => boardSeat(cardsIn(boardBlock('dsh-vim'))[0], 'cardEnter')
  assert.equal(band().style.display, 'none', 'nothing in the air: no band')
  assert.equal(band().style.pointerEvents, 'none', 'and it does not answer the hit test')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '带过去')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  pressForDrag(looseCards()[0], 10, 10)
  fire('pointermove', { type: 'pointermove', clientX: 300, clientY: 200, preventDefault() {} })
  assert.equal(band().style.display, 'flex', 'a carried note puts the band on screen')
  assert.equal(band().style.pointerEvents, 'auto', 'and the band answers the drop')
  fire('pointerup', { type: 'pointerup' })
  assert.equal(band().style.display, 'none', 'letting go takes it away again')
  tap('Escape')
})

check('an idea card can be marked done, and the card last pressed sits on top', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '先记一句')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[1], 'cardTitleInput'), '再记一句')
  fireOn(boardSeat(looseCards()[1], 'cardTitleInput'), 'blur', { type: 'blur' })
  const ids = fakeWindow.__dshVim.board().loose.map((card) => card.id)
  // A press raises the sheet it lands on: a pile is read from the top down.
  pressForDrag(looseCards()[0], 5, 5)
  fire('pointerup', { type: 'pointerup' })
  assert.equal(fakeWindow.__dshVim.board().front, ids[0], 'the card that was pressed is the card in front')
  assert.equal(looseCards()[0].__attrs['data-front'], 'true', 'and says so, so a repaint keeps it there')
  // The done mark is the reader's own word about a thought, not a deletion.
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, true, 'the card is marked done')
  assert.equal(boardSeat(looseCards()[0], 'cardDoneToggle').__attrs['aria-pressed'], 'true', 'and its box says so')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().loose[0].done, false, 'and the mark can be taken back')
  tap('Escape')
})

check('a conversation card is moved into the goal it is let go on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  // Aim the hit test at the goal the card is dropped on.
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const state = fakeWindow.__dshVim.board()
  assert.deepEqual(state.placed, { a: 'w2' }, 'the card is filed under the goal it was let go on')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and that goal draws it')
  assert.equal(cardsIn(boardBlock('one')).length, 0, 'while the one it came from does not')
  resetHitTest()
  tap('Escape')
  tap('j')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the filing was written down')
  assert.equal(cardsIn(boardBlock('two')).length, 2, 'and the next board opens with it there')
  tap('Escape')
})

check('the last card in a goal is not let go on the paper', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const before = fakeWindow.__dshVim.board()
  // The default hit test is a pane of the page, not a goal: the card is let go
  // on the paper. A goal giving up its only conversation would build a second
  // goal of one and empty the first - the same arrangement with one more panel.
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const after = fakeWindow.__dshVim.board()
  assert.deepEqual(after.placed, before.placed, 'nothing is filed')
  assert.deepEqual(after.goals, before.goals, 'and no goal is invented for it')
  assert.equal(cardsIn(boardBlock('one')).length, 1, 'the card stays where it was')
  assert.equal(toastText(), expectedLabel('boardGoalLastCard'), 'and the hand is told why')
  tap('Escape')
})

check('a card let go on the paper gets a goal of its own', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(3) },
  ])
  tap('j')
  // One of two: the goal it leaves keeps a card, so the move leaves two places
  // that both mean something.
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const state = fakeWindow.__dshVim.board()
  assert.deepEqual(Object.keys(state.placed), ['a'], 'the card is filed somewhere')
  const goal = state.placed.a
  assert.notEqual(goal, 'w1', 'and not in the goal it came from')
  assert.equal(cardsIn(boardBlock('one')).length, 1, 'so that goal draws one fewer')
  assert.equal(state.goals[goal], 'one 2', 'the new goal is named after the one it left, numbered')
  assert.equal(cardsIn(boardBlock('one 2')).length, 1, 'and the card stands in it')
  tap('Escape')
})
await checkAsync('a rename shows on the card before the shell has answered', async () => {
  seed([{ id: 'task', displayTitle: 'an old name', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardCard('task'), 'cardRename')
  typeIn(field, 'a new name')
  pressIn(field, 'Enter')
  // The host has not answered yet, and the card already wears what was typed:
  // a rename that goes back to the old name for a frame reads as a failed one.
  assert.equal(
    String(boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardTitle').textContent),
    'a new name',
    'the card wears the name the moment Enter is pressed'
  )
  await flush()
  assert.equal(renames.calls.length, 1, 'and the host was asked')
  // The list catches up: the stand-in word and the shell's word are one word.
  seed([{ id: 'task', displayTitle: 'a new name', updatedAt: todayAt(1) }])
  await flush()
  assert.equal(
    String(boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardTitle').textContent),
    'a new name',
    'and the name survives the shell agreeing with it'
  )
  tap('Escape')
})

await checkAsync('a refused rename puts the words back in the field', async () => {
  seed([{ id: 'task', displayTitle: 'kept', updatedAt: todayAt(1) }])
  tap('j')
  renames.result = { ok: false, error: { code: 'nope', message: 'no' } }
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  fireOn(boardSeat(card, 'cardRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardCard('task'), 'cardRename')
  typeIn(field, 'refused name')
  pressIn(field, 'Enter')
  await flush()
  const reopened = boardSeat(boardCard('task'), 'cardRename')
  assert.ok(reopened, 'the field comes back rather than the words going nowhere')
  assert.equal(reopened.value, 'refused name', 'with what was typed still in it')
  // Letting the field go leaves the card called what the shell calls it: a
  // refused rename must not have moved the name anywhere.
  pressIn(reopened, 'Escape')
  assert.equal(
    String(boardSeat(cardsIn(boardBlock(expectedLabel('boardInbox')))[0], 'cardTitle').textContent),
    'kept',
    'and nothing was renamed'
  )
})

await checkAsync('a branch is filed in the goal its parent is in', async () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['parent', 'other'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['child'] },
  ])
  seed([
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'other', displayTitle: 'the other', updatedAt: todayAt(4) },
  ])
  tap('j')
  // The parent is pulled out onto the paper, into a goal of its own.
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const home = fakeWindow.__dshVim.board().placed.parent
  assert.ok(home, 'the parent stands in a goal of its own')
  const card = cardsIn(boardBlock('one 2'))[0]
  assert.ok(card, 'and the goal is drawn')
  // A drag swallows the click that follows it; a press that does not move puts
  // the guard back.
  pressForDrag(boardSeat(card, 'cardFork'), 60, 300)
  fire('pointerup', { type: 'pointerup' })
  forks.results.push('child')
  fireOn(boardSeat(card, 'cardFork'), 'click', { type: 'click', stopPropagation() {} })
  await flush()
  assert.equal(
    fakeWindow.__dshVim.board().placed.child,
    home,
    'the branch is filed where its parent is, so the line has two ends'
  )
  // The host publishes the child on its own clock.
  seed([
    { id: 'child', displayTitle: 'the branch', updatedAt: todayAt(6) },
    { id: 'parent', displayTitle: 'the parent', updatedAt: todayAt(5) },
    { id: 'other', displayTitle: 'the other', updatedAt: todayAt(4) },
  ])
  await flush()
  assert.equal(cardsIn(boardBlock('one 2')).length, 2, 'and it is drawn beside its parent')
  tap('Escape')
})

check('a completion beats once, not on every repaint', () => {
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: todayAt(2) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('j')
  const card = () => cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(card().__attrs['data-fresh'], 'true', 'the beat is owed, so the first draw plays it')
  assert.equal(card().__attrs['data-unread'], 'true', 'and the quiet ring stays behind')
  // Every repaint rebuilds the card; the beat belongs to the completion, not to
  // the drawing of it.
  fireOn(boardSeat(boardPanel(), 'addCard'), 'click', { type: 'click' })
  assert.equal(card().__attrs['data-fresh'], undefined, 'a repaint does not play it again')
  assert.equal(card().__attrs['data-unread'], 'true', 'the ring is still there')
  fireOn(boardSeat(boardPanel(), 'addCard'), 'click', { type: 'click' })
  assert.equal(card().__attrs['data-fresh'], undefined, 'and it stays played')
  tap('Escape')
})

check('a running card breathes and one waiting on the reader holds still', () => {
  seed([
    { id: 'run', displayTitle: 'in flight', updatedAt: todayAt(2) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: todayAt(3) },
  ])
  statusFeed.put('run', { running: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('j')
  const cards = cardsIn(boardBlock(expectedLabel('boardInbox')))
  const runCard = cards.find((node) => node.__attrs['data-session-id'] === 'run')
  const askCard = cards.find((node) => node.__attrs['data-session-id'] === 'ask')
  assert.equal(runCard.__attrs['data-live'], 'true', 'a turn in flight is live')
  assert.equal(runCard.__attrs['data-waiting'], undefined, 'and it is working')
  assert.equal(runCard.__attrs['data-fresh'], undefined, 'with no completion beat')
  assert.equal(askCard.__attrs['data-live'], 'true', 'a parked turn is still live')
  assert.equal(askCard.__attrs['data-waiting'], 'true', 'but the card is not what is moving')
  tap('Escape')
})


check('a goal gives up its place when its last conversation moves on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(5) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(4) },
    { id: 'c', displayTitle: 'c task', updatedAt: todayAt(3) },
  ])
  tap('j')
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const made = fakeWindow.__dshVim.board().placed.a
  assert.ok(boardBlock('one 2'), 'the card stands in a goal of its own')
  // The card that stood alone is filed somewhere else: nothing is left here.
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one 2'))[0], 60, 300)
  dragTo(600, 300)
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.placed.a, 'w2', 'the card is filed in the goal it was let go on')
  assert.equal(boardBlock('one 2'), null, 'and the goal it emptied is gone')
  assert.equal(state.goals[made], undefined, 'with its name')
  assert.equal(boardDoc().blocks[made], undefined, 'and its place in the document')
  resetHitTest()
  tap('Escape')
})

check('a goal with a written purpose stays when its conversations leave', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(5) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(4) },
    { id: 'c', displayTitle: 'c task', updatedAt: todayAt(3) },
  ])
  tap('j')
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  const goal = boardBlock('one 2')
  assert.ok(goal, 'the card stands in a goal of its own')
  // The click that ends a drag is the drag's, not the reader's: a press that does
  // not move is what puts the guard back.
  pressForDrag(boardSeat(goal, 'blockIntentText'), 60, 300)
  fire('pointerup', { type: 'pointerup' })
  fireOn(boardSeat(goal, 'blockIntentText'), 'click', { type: 'click', stopPropagation() {} })
  const field = boardSeat(boardBlock('one 2'), 'blockIntentField')
  assert.ok(field, 'a press on the line opens it as a field')
  typeIn(field, '  把登录改完  ')
  pressIn(field, 'Enter')
  assert.equal(
    String(boardSeat(boardBlock('one 2'), 'blockIntentText').textContent),
    '把登录改完',
    'and what was typed is kept, trimmed'
  )
  // Its only conversation leaves: the place still says what it is for.
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one 2'))[0], 60, 300)
  dragTo(600, 300)
  assert.equal(fakeWindow.__dshVim.board().placed.a, 'w2', 'the card moved')
  assert.ok(boardBlock('one 2'), 'the goal stays, because it says what it is for')
  assert.equal(cardsIn(boardBlock('one 2')).length, 0, 'with nothing in it')
  resetHitTest()
  tap('Escape')
})

check('the toolbar stands a goal, and keeps it only while the board is up', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  fireOn(boardSeat(boardPanel(), 'addGoal'), 'click', { type: 'click' })
  const name = expectedLabel('boardNewGoal')
  assert.ok(boardBlock(name), 'a goal is standing on the canvas')
  const field = boardSeat(boardBlock(name), 'blockIntentField')
  assert.ok(field, 'with its line open for what it is for')
  // A repaint must not take the goal the reader is about to name.
  fireOn(boardSeat(boardPanel(), 'starFilter'), 'click', { type: 'click' })
  assert.ok(boardBlock(name), 'and a repaint leaves it alone')
  // Leaving the line empty is what a goal with nothing said about it is; the
  // board going away is what lets it go.
  boardSeat(boardBlock(name), 'blockIntentField').blur()
  tap('Escape')
  tap('j')
  assert.equal(boardBlock(name), null, 'closing the board lets a goal nobody named go')
  tap('Escape')
})

check('closing a goal gives its conversations back, and the notice can bring it back', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(4) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(3) },
  ])
  tap('j')
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  assert.equal(cardsIn(boardBlock('one 2')).length, 1, 'the card stands in a goal of its own')
  pressForDrag(boardSeat(boardBlock('one 2'), 'goalRemove'), 60, 300)
  fire('pointerup', { type: 'pointerup' })
  fireOn(boardSeat(boardBlock('one 2'), 'goalRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardBlock('one 2'), null, 'the goal is closed')
  assert.equal(cardsIn(boardBlock('one')).length, 2, 'and its conversation is back where it came from')
  assert.ok(
    String(toastText()).indexOf(expectedLabel('boardGoalUndo')) >= 0,
    'the notice offers the way back'
  )
  fireOn(toastNode(), 'click', { type: 'click' })
  assert.ok(boardBlock('one 2'), 'and the way back puts the goal back')
  assert.equal(cardsIn(boardBlock('one 2')).length, 1, 'with its conversation')
  tap('Escape')
})

check('a goal is moved by dragging anywhere on it, not only its heading', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const block = boardBlock('one')
  const before = fakeWindow.__dshVim.board().places.w1
  pressForDrag(block, 20, 20)
  dragTo(120, 90)
  const moved = fakeWindow.__dshVim.board().places.w1
  assert.equal(moved.x, before.x + 100, 'the panel moved with the hand')
  assert.equal(moved.y, before.y + 70)
  tap('Escape')
})

check('a press anywhere on an idea card opens its field', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), 'x'.repeat(8))
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  // The card is taller than its words, so the paper below the last line is the
  // part a reader actually presses.
  fireOn(looseCards()[0], 'click', { type: 'click', stopPropagation() {} })
  assert.ok(boardSeat(looseCards()[0], 'cardTitleInput'), 'the field opens from the card, not only from its words')
  pressIn(boardSeat(looseCards()[0], 'cardTitleInput'), 'Escape')
  tap('Escape')
})

await checkAsync('a turn count landing does not take an open field away', async () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const editor = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(editor, '正在写')
  // Every paint asks the host for a turn count, and the answer lands a moment
  // later; that paint used to rebuild the whole stage under the caret.
  clock.advance(2000)
  await flush()
  const still = boardSeat(looseCards()[0], 'cardTitleInput')
  assert.equal(still, editor, 'the field survives the paint the count asked for')
  assert.equal(still.value, '正在写', 'with the sentence still in it')
  assert.equal(fakeDocument.activeElement, still, 'and the caret where the reader left it')
  pressIn(still, 'Escape')
  tap('Escape')
})
// --- one press, one owner ---------------------------------------------------

check("a press on the goal's own name drags the whole goal", () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const block = boardBlock('one')
  const before = fakeWindow.__dshVim.board().places.w1
  pressForDrag(boardSeat(block, 'blockName'), 40, 20)
  dragTo(140, 90)
  const moved = fakeWindow.__dshVim.board().places.w1
  assert.equal(moved.x, before.x + 100, 'the name is part of the handle, not a thing that eats presses')
  assert.equal(moved.y, before.y + 70)
  tap('Escape')
})

check('a press on a card carries the card, never the goal under it', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  const home = fakeWindow.__dshVim.board().places.w1
  aimAt(boardBlock('two'))
  pressForDrag(cardsIn(boardBlock('one'))[0], 60, 300)
  dragTo(600, 300)
  assert.deepEqual(fakeWindow.__dshVim.board().places.w1, home, 'the goal stayed where it was')
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the card is what moved')
  resetHitTest()
  tap('Escape')
})

check('a press on a goal name folds the panel, and another brings it back', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const name = () => boardSeat(boardBlock('one'), 'blockName')
  fireOn(name(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, true, 'a press on the name folds the panel')
  assert.equal(cardsIn(boardBlock('one')).length, 0, 'and its conversations go with the fold')
  fireOn(name(), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.board().blocks[0].folded, false, 'another press unfolds it again')
  assert.equal(cardsIn(boardBlock('one')).length, 1, 'and the conversations are back')
  tap('Escape')
})

check("a press inside a field is the field's, not a gesture", () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) }])
  tap('j')
  const before = fakeWindow.__dshVim.board().places.w1
  fireOn(boardSeat(openGoalMenu(boardBlock('one')), 'goalRenameOpen'), 'click', { type: 'click', stopPropagation() {} })
  pressForDrag(boardSeat(boardBlocks()[0], 'blockRename'), 10, 10)
  dragTo(200, 200)
  assert.deepEqual(fakeWindow.__dshVim.board().places.w1, before, 'the field kept the press, so the goal stayed')
  tap('Escape')
})

check('a drag on an idea card moves it instead of opening its field', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '先记一句')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  const before = fakeWindow.__dshVim.board().loose[0]
  pressForDrag(looseCards()[0], 10, 10)
  dragTo(210, 110)
  assert.equal(fakeWindow.__dshVim.board().loose[0].x, before.x + 200, 'the card followed the hand')
  assert.equal(boardSeat(looseCards()[0], 'cardTitleInput'), null, 'and no field opened on the way')
  tap('Escape')
})

// --- undo and redo -----------------------------------------------------------

/** One of the board header's history buttons, or null. */
function historyButton(role) {
  const head = boardPanel().children[0]
  return head.children.find((node) => node.__attrs && node.__attrs['data-role'] === role) || null
}

check('a deleted idea can be taken back, and deleted again', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const titleField = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(titleField, '标题')
  pressIn(titleField, 'Enter')
  typeIn(boardSeat(looseCards()[0], 'cardText'), '正文')
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  assert.equal(fakeWindow.__dshVim.board().history.canUndo, false, 'nothing to take back yet')
  fireOn(boardSeat(looseCards()[0], 'cardMenuOpen'), 'click', { type: 'click', stopPropagation() {} })
  fireOn(boardSeat(boardSeat(looseCards()[0], 'ideaMenu'), 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(looseCards().length, 0, 'the card is gone')
  assert.equal(fakeWindow.__dshVim.board().history.canUndo, true, 'and the board remembers it')
  assert.equal(historyButton('boardUndo').__attrs['aria-disabled'], 'false', 'so the button is live')
  fireOn(historyButton('boardUndo'), 'click', { type: 'click' })
  assert.equal(looseCards().length, 1, 'the card is back')
  assert.equal(String(boardSeat(looseCards()[0], 'looseTitle').textContent), '标题', 'with what it said')
  assert.equal(fakeWindow.__dshVim.board().history.canRedo, true, 'and the delete can be repeated')
  fireOn(historyButton('boardRedo'), 'click', { type: 'click' })
  assert.equal(looseCards().length, 0, 'the redo deletes it again')
  tap('Escape')
})

check('a conversation taken off the board can be taken back', () => {
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  fireOn(boardSeat(card, 'cardRemove'), 'click', { type: 'click', stopPropagation() {} })
  assert.deepEqual(boardCardIds(), [], 'the conversation is off the board')
  fireOn(historyButton('boardUndo'), 'click', { type: 'click' })
  assert.deepEqual(boardCardIds(), ['target'], 'and the way back puts it where it was')
  tap('Escape')
})

check('the history buttons say when there is nothing to step to', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  assert.equal(historyButton('boardUndo').__attrs['aria-disabled'], 'true', 'nothing done yet')
  assert.equal(historyButton('boardRedo').__attrs['aria-disabled'], 'true', 'nothing taken back either')
  tap('Escape')
})
// --- the tray ---------------------------------------------------------------

/** Put one written note away in the tray, and hand back the board. */
function fileANote(text) {
  seed([
    { id: 'filed', displayTitle: 'filed work', updatedAt: todayAt(3) },
    { id: 'loose', displayTitle: 'nowhere', updatedAt: todayAt(2) },
  ])
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['filed'] }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), text)
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(boardBlock(expectedLabel('boardInbox')))
  pressForDrag(looseCards()[0], 60, 300)
  dragTo(600, 300)
  resetHitTest()
}

check('a conversation in the tray wears the ideas paper', () => {
  seed([
    { id: 'filed', displayTitle: 'filed work', updatedAt: todayAt(3) },
    { id: 'loose', displayTitle: 'nowhere', updatedAt: todayAt(2) },
  ])
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['filed'] }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '算个参照')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  const notePaper = looseCards()[0].style.background
  assert.ok(notePaper, 'the idea card has a paper')
  // The conversation that landed in the tray must wear exactly that paper: the
  // card's surface is an inline style, so this is the only place it can be read.
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.ok(card, 'the inbox holds the conversation')
  assert.equal(card.style.background, notePaper, 'and it is the idea paper, not the goal paper')
  assert.equal(card.style.borderLeft, looseCards()[0].style.borderLeft, 'spine and all: the same piece of paper')
  // The same card outside the tray keeps the neutral ink.
  const goalCard = cardsIn(boardBlock('one'))[0]
  assert.notEqual(goalCard.style.background, notePaper, 'a goal keeps its own paper')
  tap('Escape')
})
check('a note put away in an empty tray is still there', () => {
  // The bug this covers: the tray's body used to be drawn only when the inbox
  // held a conversation, so a note filed into an inbox with no sessions had
  // nowhere to be drawn - and simply disappeared.
  seed([{ id: 'filed', displayTitle: 'filed work', updatedAt: todayAt(3) }])
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['filed'] }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '一个人待着')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(boardBlock(expectedLabel('boardInbox')))
  pressForDrag(looseCards()[0], 60, 300)
  dragTo(600, 300)
  resetHitTest()
  const inbox = boardBlock(expectedLabel('boardInbox'))
  assert.equal(fakeWindow.__dshVim.board().loose[0].filed, '@inbox', 'the note is filed in the tray')
  assert.equal(looseCards().length, 0, 'and is off the paper')
  const row = boardSeat(inbox, 'inboxNote')
  assert.ok(row, 'the empty tray still draws it')
  assert.equal(String(boardSeat(row, 'inboxNoteText').textContent), '一个人待着', 'with its words')
  tap('Escape')
})
check('the tray holds both kinds, and names its two sections', () => {
  fileANote('先问一句')
  const state = fakeWindow.__dshVim.board()
  assert.equal(state.loose[0].filed, '@inbox', 'the note is put away in the tray')
  assert.equal(looseCards().length, 0, 'and is no longer a card on the paper')
  // A second note stays on the canvas, so the tray's paper can be compared
  // against what an idea card actually wears.
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '留在纸面上的参照')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  const paper = looseCards()[0]
  const inbox = boardBlock(expectedLabel('boardInbox'))
  const row = boardSeat(inbox, 'inboxNote')
  assert.equal(boardSeat(inbox, 'inboxBody').className, 'dshv-tray', 'the tray body is one material, for the stylesheet to ink')
  // The panel is a panel: the paper belongs to the notes in it, not to the box.
  assert.notEqual(inbox.style.background, paper.style.background,
    'the tray panel keeps the neutral container ink')
  assert.ok(row, 'the tray draws it as a line')
  // This is the whole of what the reader asked for: an idea in the tray wears
  // the same paper as one left on the canvas, even though its shape is a line.
  assert.equal(row.style.background, paper.style.background, 'the row is the note paper')
  assert.equal(row.style.borderLeft, paper.style.borderLeft, 'spine and all')
  // The regression this covers: taking the sheet's whole style made every row
  // absolutely placed, which piled them all onto one spot.
  assert.equal(row.style.position, undefined, 'a row stays in the list, not absolutely placed')
  assert.equal(String(boardSeat(row, 'inboxNoteText').textContent), '先问一句', 'with its words')
  const words = []
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.__attrs && child.__attrs['data-role'] === 'trayCaption') words.push(String(child.children[0].textContent))
      walk(child)
    }
  }
  walk(inbox)
  assert.deepEqual(
    words,
    [expectedLabel('boardInboxSessions'), expectedLabel('boardInboxNotes')],
    'conversations first, then ideas: the tray says which is which'
  )
  tap('Escape')
})

check('a line of the tray is lifted back out onto the paper', () => {
  fileANote('lift me')
  const row = boardSeat(boardBlock(expectedLabel('boardInbox')), 'inboxNote')
  pressForDrag(row, 100, 300)
  dragTo(400, 420)
  assert.equal(fakeWindow.__dshVim.board().loose[0].filed, '', 'the note is back on the paper')
  assert.equal(looseCards().length, 1, 'and drawn as a card again')
  tap('Escape')
})

check('the tray is not a goal: it has no ⋯ and its name cannot be changed', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  const tray = boardBlock(expectedLabel('boardInbox'))
  assert.equal(goalMenuMark(tray), null, 'the tray carries no ⋯')
  fireOn(boardSeat(tray, 'blockName'), 'dblclick', { type: 'dblclick', stopPropagation() {} })
  assert.equal(boardSeat(boardBlocks()[0], 'blockRename'), null, 'no field opens on the tray')
  tap('Escape')
})

check('a card says what it is doing in its material as well as in a word', () => {
  seed([{ id: 'live', displayTitle: 'live', updatedAt: todayAt(2) }])
  statusFeed.put('live', { running: true })
  tap('j')
  const live = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(live.__attrs['data-live'], 'true', 'a turn in flight sets the frame moving')
  // The way in is the card itself now; what is left of the arrow is a drop target
  // for a carried idea card, drawn only while something is being carried.
  const dropZone = boardSeat(live, 'cardEnter')
  assert.ok(String(dropZone.textContent).indexOf('\u21B5') === 0, 'the drop band is drawn, glyph first')
  assert.equal(String(dropZone.textContent), '\u21B5' + expectedLabel('boardCardEnterHint'), 'and it says what letting go does')
  assert.equal(dropZone.__attrs['aria-hidden'], 'true', 'and is not offered as a button')
  assert.ok(boardSeat(live, 'cardFork'), 'with the branch mark beside it')
  tap('Escape')
  statusFeed.put('live', { running: false, completionUnread: true })
  tap('j')
  const done = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  assert.equal(done.__attrs['data-fresh'], 'true', 'a completion not yet looked at gets its own beat')
  tap('Escape')
})

// --- a line pinned to a conversation ----------------------------------------

/** One conversation, on screen, inside today — the shape the note needs. */
function seedCurrent(id = 'here') {
  seed([{ id, displayTitle: 'where I am', updatedAt: todayAt(3), retainedBy: { mainView: 1 } }])
}

/** The board card for one conversation, or null when it is not on the canvas. */
function boardCard(id) {
  for (const block of boardBlocks()) {
    const found = cardsIn(block).find((card) => card.__attrs['data-session-id'] === id)
    if (found) return found
  }
  return null
}

/** The field a card's line is typed into, or null. */
function cardNoteBox(card) {
  return boardSeat(card, 'cardNoteBox')
}

/** The line a card carries, or null. */
function cardNoteLine(card) {
  return boardSeat(card, 'note')
}

/** The mark that starts a line on a card that has none. */
function cardNotePin(card) {
  return boardSeat(card, 'cardNotePin')
}

/** Every card drawn under one element, at any depth. */
function cardsUnder(node) {
  const out = []
  const walk = (n) => {
    for (const child of n.children || []) {
      if (child.__attrs && child.__attrs['data-session-id'] !== undefined) out.push(child)
      walk(child)
    }
  }
  walk(node)
  return out
}

/** Start a line on one card and type it, the way a reader does. */
function writeCardNote(id, text) {
  const card = boardCard(id)
  const pin = cardNotePin(card)
  if (pin) fireOn(pin, 'click', { type: 'click' })
  else fireOn(cardNoteLine(card), 'click', { type: 'click' })
  const box = cardNoteBox(boardCard(id))
  typeIn(box, text)
  return box
}

check('a line is typed on the card it belongs to, and the card carries it', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const pin = cardNotePin(boardCard('here'))
  assert.ok(pin, 'a card with no line offers the way in')
  fireOn(pin, 'click', { type: 'click' })
  const box = cardNoteBox(boardCard('here'))
  assert.ok(box, 'the field opens inside the card, not over the page')
  assert.equal(fakeDocument.activeElement, box, 'with the caret already in it')
  assert.equal(fakeWindow.__dshVim.note('here').editing, 'here', 'and the board knows whose line it is')
  typeIn(box, '  换个顺序试试  ')
  pressIn(box, 'Enter')
  assert.equal(cardNoteBox(boardCard('here')), null, 'Enter closes the field')
  assert.equal(fakeWindow.__dshVim.note('here').line, '换个顺序试试', 'keeping the line, trimmed')
  assert.equal(String(cardNoteLine(boardCard('here')).textContent), '换个顺序试试', 'and the card now carries it')
  tap('Escape')
})

check('pressing the line edits it, and an empty line takes it away', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  writeCardNote('here', 'first')
  pressIn(cardNoteBox(boardCard('here')), 'Enter')
  fireOn(cardNoteLine(boardCard('here')), 'click', { type: 'click' })
  const box = cardNoteBox(boardCard('here'))
  assert.equal(box.value, 'first', 'the field opens on the line it already carries')
  typeIn(box, '   ')
  pressIn(box, 'Enter')
  assert.equal(fakeWindow.__dshVim.note('here').line, '', 'an empty line is how a note is taken away')
  assert.equal(cardNoteLine(boardCard('here')), null, 'and the card carries nothing')
  assert.ok(cardNotePin(boardCard('here')), 'with the way in back')
  tap('Escape')
})

check('Escape drops the line without writing it down', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const box = writeCardNote('here', 'discarded')
  pressIn(box, 'Escape')
  assert.equal(cardNoteBox(boardCard('here')), null, 'Escape closes the field')
  assert.equal(fakeWindow.__dshVim.note('here').line, '', 'and files nothing')
  tap('Escape')
})

check('a press elsewhere keeps what was typed', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const box = writeCardNote('here', 'looked away')
  // A press outside a real input moves the focus, and the browser reports the
  // blur; the harness delivers that one event.
  fireOn(box, 'blur', { type: 'blur' })
  assert.equal(cardNoteBox(boardCard('here')), null, 'the field goes away with the focus')
  assert.equal(fakeWindow.__dshVim.note('here').line, 'looked away', 'but the thought is kept')
  tap('Escape')
})

check('a feed tick does not take the field away mid-sentence', () => {
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  const box = writeCardNote('here', 'half a thought')
  // A turn starting is exactly the kind of tick that repaints the board.
  statusFeed.put('here', { running: true })
  const still = cardNoteBox(boardCard('here'))
  assert.equal(still, box, 'the field must survive a repaint it did not ask for')
  assert.equal(still.value, 'half a thought', 'with the sentence still in it')
  pressIn(still, 'Escape')
  tap('Escape')
})

check('the note key opens the board on the conversation on screen, field waiting', () => {
  seedCurrent('here')
  assert.equal(tap('n'), true, 'the note key must belong to the plugin on the page')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and it opens the board')
  const box = cardNoteBox(boardCard('here'))
  assert.ok(box, 'with the field already on that card')
  assert.equal(fakeDocument.activeElement, box, 'and the caret in it')
  typeIn(box, 'from the keyboard')
  pressIn(box, 'Enter')
  assert.equal(fakeWindow.__dshVim.note('here').line, 'from the keyboard', 'what is typed lands on that conversation')
  tap('Escape')
})

check('with no conversation on screen the note key says where to go', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('n')
  assert.equal(fakeWindow.__dshVim.board().open, false, 'a board whose field would go nowhere must not open')
  assert.equal(toastText(), expectedLabel('noteNoSession'), 'and the notice must say what is missing')
})

check('the note key is a page key and cannot take one that is already live', () => {
  assert.equal(fakeWindow.__dshVim.update({ noteKey: 'j' }).error, 'conflict', 'the board key is live too')
  assert.equal(fakeWindow.__dshVim.update({ noteKey: 'd' }).error, 'conflict', 'and so is the scroll key')
  assert.equal(fakeWindow.__dshVim.update({ noteKey: 'n' }).noteKey, 'n', 'its own seat is fine')
})

check('the page mounts the same board without a window', () => {
  const root = fakeDocument.createElement('div')
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  assert.equal(fakeWindow.__dshVim.boardPage(root), true, 'the page mounts into the element the host gave it')
  const board = fakeWindow.__dshVim.board()
  assert.equal(board.open, true)
  assert.equal(String(root.children[0].children[0].textContent), expectedLabel('board'), 'the page leads with the board title')
  assert.equal(cardsUnder(root).length, 1, 'and draws the same cards')
  assert.equal(String(root.children[2].textContent), expectedLabel('boardPageHint'), 'with the page footer')
  // A page is not a window: Escape belongs to the shell, and the key that
  // opened the floating board has nothing to put away here.
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'Escape must not close a page')
  tap('j')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'and neither must a key with no panel to go back to')
  // Editing works the same on the page: same cards, same field.
  const card = cardsUnder(root).find((node) => node.__attrs['data-session-id'] === 'here')
  fireOn(cardNotePin(card), 'click', { type: 'click' })
  const box = cardsUnder(root).map(cardNoteBox).find(Boolean)
  assert.ok(box, 'the page card carries the same field')
  typeIn(box, 'on the page')
  pressIn(box, 'Enter')
  assert.equal(fakeWindow.__dshVim.note('here').line, 'on the page')
  fakeWindow.__dshVim.boardPage(null, false)
  assert.equal(fakeWindow.__dshVim.board().open, false, 'unmounting the page drops the board')
})

check('one board at a time: the page refuses while the window is up', () => {
  const root = fakeDocument.createElement('div')
  seed([{ id: 'here', displayTitle: 'where I am', updatedAt: todayAt(3) }])
  tap('j')
  assert.equal(fakeWindow.__dshVim.boardPage(root), false, 'a second mount would fight the first for the feeds')
  assert.equal(root.children.length, 0, 'and it drew nothing')
  tap('Escape')
})

// --- lifecycle --------------------------------------------------------------

check('the popup honours the configured size, spacing and position', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  fakeWindow.__dshVim.update({ paletteFont: 18, palettePlace: 'bottom', paletteWidth: 1000, paletteHeight: 60, paletteRow: 11 })
  tap('f')
  const host = body.children[body.children.length - 1]
  const panel = host.children[0]
  assert.equal(panel.style.fontSize, '18px', 'the panel must carry the configured size')
  assert.equal(panel.style.width, 'min(1000px, 94vw)', 'the width setting must survive the viewport cap')
  assert.equal(panel.style.maxHeight, '60vh', 'and the height setting is what the list scrolls inside')
  assert.equal(host.style.alignItems, 'flex-end', 'a bottom window sits at the bottom')
  assert.equal(panel.style.marginBottom, '14vh', 'a short window keeps the shipped margin')
  assert.equal(rowNodes()[0].style.paddingTop, '11px', 'row spacing is the vertical half of the row padding')
  assert.equal(rowNodes()[0].style.paddingBottom, '11px')
  tap('Escape')

  fakeWindow.__dshVim.update({ paletteFont: 11, palettePlace: 'center' })
  tap('f')
  const middle = body.children[body.children.length - 1]
  assert.equal(middle.children[0].style.fontSize, '11px')
  assert.equal(middle.style.alignItems, 'center')
  assert.equal(middle.children[0].style.marginTop, '0', 'a centred window has no top margin')
  tap('Escape')
})

check('a tall window gives up the margin, not the height', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  fakeWindow.__dshVim.update({ paletteHeight: 95, palettePlace: 'top' })
  tap('f')
  const host = body.children[body.children.length - 1]
  const panel = host.children[0]
  assert.equal(panel.style.maxHeight, '95vh', 'the height the user asked for is the height it gets')
  assert.equal(panel.style.marginTop, '3vh', 'and the top margin shrinks so it still fits on screen')
  tap('Escape')
})

check('the popup navigates with its own keys, not the scroll keys', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(3) },
  ])
  fakeWindow.__dshVim.update({ paletteUpKey: 'k', paletteDownKey: 'j' })
  tap('f')
  const index = () => fakeWindow.__dshVim.palette().index
  tap('j')
  assert.equal(index(), 1)
  tap('j')
  tap('j')
  assert.equal(index(), 0, 'the window keys wrap like the scroll keys did')
  tap('k')
  assert.equal(index(), 2)
  // With the window's own keys moved off `d`/`e`, those two are the page's
  // again: the window ignores them and the conversation behind it scrolls.
  assert.equal(tap('d'), true, 'd is a scrolling key again')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'so it reads the conversation')
  assert.equal(index(), 2, 'and the selection must not move')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'with the window still up')
  tap('Escape')
})

/**
 * The position chooser's element on the settings page. Matched on its options,
 * not on order, because the Escape toggle is a chooser too.
 * @returns {object} the choice element.
 */
function placeChoice() {
  const found = settingsElements().find(
    (e) => Array.isArray(e.props.options) && e.props.options.some((o) => o.value === 'top')
  )
  assert.ok(found, 'the position chooser must be on the page')
  return found
}

check('the settings page exposes every binding, plus font size and position', () => {
  const elements = settingsElements()
  assert.deepEqual(
    keyBindings(),
    {
      [expectedLabel('down')]: 'd',
      [expectedLabel('up')]: 'e',
      [expectedLabel('focusComposer')]: ' ',
      [expectedLabel('effort')]: 'q',
      [expectedLabel('model')]: 'w',
      [expectedLabel('modelLevel')]: 'Tab',
      [expectedLabel('board')]: 'j',
      [expectedLabel('note')]: 'n',
      [expectedLabel('pin')]: 'i',
      [expectedLabel('palette')]: 'f',
      [expectedLabel('paletteRename')]: 'r',
      [expectedLabel('paletteUp')]: 'e',
      [expectedLabel('paletteDown')]: 'd',
      [expectedLabel('paletteEnter')]: 'o',
      [expectedLabel('paletteStage')]: 's',
      [expectedLabel('paletteArchive')]: 'g',
    },
    'all sixteen rebindable keys must be on the page'
  )
  // A space is invisible in a box of its own, so the page spells it out.
  const focusBox = elements.find((e) => e.props['aria-label'] === expectedLabel('focusComposer'))
  assert.ok(focusBox, 'the focus key must have its own box')
  assert.equal(focusBox.props.value, 'Space', 'and the box must name the key')
  // The level seat ships as a named key, so its box must spell that out too
  // rather than upper-casing it into a key nobody can press.
  const levelBox = elements.find((e) => e.props['aria-label'] === expectedLabel('modelLevel'))
  assert.ok(levelBox, 'the model window level key must have its own box')
  assert.equal(levelBox.props.value, 'Tab', 'and the box must name the key')
  const font = elements.find((e) => e.props.id === 'dsh-vim-palette-font')
  assert.ok(font, 'the font size slider must be on the page')
  assert.deepEqual([font.props.min, font.props.max, font.props.value], [11, 20, 13])
  const choice = placeChoice()
  assert.deepEqual(choice.props.options.map((o) => o.value), ['top', 'center', 'bottom'])
  assert.equal(choice.props.value, 'top')
})

check('the settings page exposes the window size and spacing sliders', () => {
  const byId = (id) => settingsElements().find((e) => e.props.id === id)
  const width = byId('dsh-vim-palette-width')
  assert.ok(width, 'the width slider must be on the page')
  assert.equal(width.props.label, expectedLabel('panelWidth'), 'and be named in both languages')
  assert.deepEqual(
    [width.props.min, width.props.max, width.props.step, width.props.value],
    [480, 1400, 20, 900],
    'width: 480–1400, shipping at 900'
  )
  width.props.onChange(1200)
  assert.equal(fakeWindow.__dshVim.settings().paletteWidth, 1200, 'a drag must apply at once')
  const height = byId('dsh-vim-palette-height')
  assert.ok(height, 'the height slider must be on the page')
  assert.equal(height.props.label, expectedLabel('panelHeight'))
  assert.deepEqual(
    [height.props.min, height.props.max, height.props.value],
    [40, 95, 82],
    'height: 40–95vh, shipping at 82'
  )
  height.props.onChange(60)
  assert.equal(fakeWindow.__dshVim.settings().paletteHeight, 60)
  const spacing = byId('dsh-vim-palette-row')
  assert.ok(spacing, 'the row-spacing slider must be on the page')
  assert.equal(spacing.props.label, expectedLabel('rowSpacing'))
  assert.deepEqual([spacing.props.min, spacing.props.max, spacing.props.value], [3, 14, 7])
  spacing.props.onChange(10)
  assert.equal(fakeWindow.__dshVim.settings().paletteRow, 10)
})

check('a key row on the settings page rebinds the plugin', () => {
  const row = settingsElements().find(
    (e) => e.props.label === expectedLabel('palette') && e.props.recordingText
  )
  assert.ok(row, 'the task-window key must be bindable from the page')
  // A letter neither window owns: the two overlays refuse to share one, which
  // is checked on its own below.
  row.props.onSet('x')
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'x', 'pressing a key in the page must take effect at once')
  row.props.onSet('f')
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'f')
})

check('the two overlay keys refuse to share one letter', () => {
  // The board's key is live on the page and the task window's key opens the
  // other overlay: one press cannot mean both, and the two seats sit in
  // different groups, so the group checks alone would let them collide.
  const rejected = fakeWindow.__dshVim.update({ paletteKey: 'j' })
  assert.equal(rejected.error, 'conflict', 'the board key must not be taken by the task window')
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'f')
  assert.equal(fakeWindow.__dshVim.update({ boardKey: 'f' }).error, 'conflict', 'nor the other way round')
  assert.equal(fakeWindow.__dshVim.settings().boardKey, 'j')
  // A page key it may share with anything in the other group, as before.
  assert.ok(!fakeWindow.__dshVim.update({ boardKey: 'g' }).error, 'the archive key may collide with it')
  fakeWindow.__dshVim.update({ boardKey: 'j' })
})

check('a position choice on the settings page applies immediately', () => {
  const choice = placeChoice()
  choice.props.onSet('center')
  assert.equal(fakeWindow.__dshVim.settings().palettePlace, 'center')
  choice.props.onSet('top')
  assert.equal(fakeWindow.__dshVim.settings().palettePlace, 'top')
})

check('each position toggle applies its own value, not the last one', () => {
  const buttons = choiceButtons(PLACE_LABELS())
  assert.equal(buttons.length, 3, 'the row must render one button per option')
  // Each button must carry its own value through the closure. A shared loop
  // variable made every button apply the final option instead, so 顶部 and 居中
  // looked dead.
  const wanted = {
    [expectedLabel('placeTop')]: 'top',
    [expectedLabel('placeCenter')]: 'center',
    [expectedLabel('placeBottom')]: 'bottom',
  }
  for (const button of buttons) {
    fakeWindow.__dshVim.update({ palettePlace: 'top' })
    button.props.onClick()
    const label = button.children[0]
    assert.equal(
      fakeWindow.__dshVim.settings().palettePlace,
      wanted[label],
      `clicking "${label}" must apply ${wanted[label]}`
    )
  }
})

check('the active position toggle is marked pressed', () => {
  fakeWindow.__dshVim.update({ palettePlace: 'center' })
  const pressed = choiceButtons(PLACE_LABELS()).map((b) => b.props['aria-pressed'])
  assert.deepEqual(pressed, ['false', 'true', 'false'], 'exactly the current position is pressed')
})

/**
 * The status chips rendered in the mounted window, row by row.
 *
 * Found by the state labels rather than by "any coloured cell": the stage chip
 * sits in the same strip, an idle stage has a colour of its own, and a filter
 * on colour would start reporting the stage as the status.
 *
 * Read through `rowNodes`, not the list's own children: the list now carries a
 * heading above each attention block, and walking the raw children would count
 * a heading as a row and report a phantom entry per block.
 * @returns {Array<Array<string>>} one array of labels per row.
 */
function renderedStatuses() {
  return rowNodes().map((row) => {
    const chip = stateChip(row)
    return chip ? [chip.textContent] : []
  })
}

/**
 * How the row clock writes a duration, in the harness locale.
 *
 * Minutes are the whole resolution now: the chip has no seconds to show, and a
 * turn inside its first minute shows no duration at all.
 * @param {number} minutes - whole minutes elapsed.
 * @returns {string} the label the plugin should have painted.
 */
function elapsedLabel(minutes) {
  return minutes + expectedLabel('elapsedMinutes')
}

/**
 * The text of a state chip that carries a clock: the state, then the duration.
 * @param {string} key - the state's dictionary key.
 * @param {number} minutes - whole minutes elapsed.
 * @returns {string} the label the plugin should have painted.
 */
function liveChip(key, minutes) {
  return expectedLabel(key) + ' · ' + elapsedLabel(minutes)
}

check('each conversation shows what it is doing right now', () => {
  seed([
    { id: 'running', displayTitle: 'in flight', updatedAt: ago(1) },
    { id: 'done', displayTitle: 'finished', updatedAt: ago(2) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: ago(3) },
    { id: 'quiet', displayTitle: 'idle', updatedAt: ago(2.5) },
  ])
  statusFeed.put('running', { running: true })
  statusFeed.put('done', { running: false, completionUnread: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('quiet', { running: false, completionUnread: false })
  tap('f')
  const labels = renderedStatuses()
  // The list leads with what is waiting on the reader, then what is in flight,
  // then the rest — so this is no longer recency's order. Inside the waiting
  // block the oldest debt comes first, and neither of these two was watched
  // starting, so `updatedAt` decides: `ask` was touched before `done`.
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['ask', 'done', 'running', 'quiet'],
    'the attention blocks lead, and the idle row trails'
  )
  assert.deepEqual(
    labels,
    [[expectedLabel('statusWaitApproval')], [expectedLabel('statusDone')], [expectedLabel('statusRunning')], []],
    'one label per non-idle conversation, in list order'
  )
  tap('Escape')
})

check('the just-finished chip draws the eye once when the window opens', () => {
  seed([{ id: 'done', displayTitle: 'finished while I was away', updatedAt: ago(0.1) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  const chip = () => stateChip(rowNodes()[0])
  assert.ok(chip(), 'the chip says "just done" before anything moves')
  // The first frame is due on the next tick, so a little virtual time is what
  // makes the beat visible — the same shape a real browser gives it.
  clock.advance(180)
  const swell = Number((String(chip().style.transform || '').match(/scale\(([\d.]+)\)/) || [])[1])
  assert.ok(swell > 1, 'the chip swells so the eye lands on it')
  assert.ok(
    String(chip().style.boxShadow || '').includes('rgba(125, 211, 252'),
    'and it wears a ring in the just-finished colour'
  )
  clock.advance(900)
  assert.equal(chip().style.transform, '', 'when the beat is over the chip is back where it was')
  assert.equal(chip().style.boxShadow, '', 'and nothing is left behind to dismiss')
  tap('Escape')
})

check('reduced motion gets no beat at all', () => {
  mediaReduce = true
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  clock.advance(180)
  assert.ok(
    !stateChip(rowNodes()[0]).style.transform,
    'the chip already says the fact in words; the beat is decoration on top of it'
  )
  assert.ok(!stateChip(rowNodes()[0]).style.boxShadow, 'and nothing else moves either')
  tap('Escape')
})

check('only the just-finished chip beats', () => {
  seed([
    { id: 'done', displayTitle: 'finished', updatedAt: ago(0.5) },
    { id: 'ask', displayTitle: 'waiting on you', updatedAt: ago(1) },
    { id: 'busy', displayTitle: 'running', updatedAt: ago(2) },
  ])
  statusFeed.put('done', { running: false, completionUnread: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('busy', { running: true })
  tap('f')
  clock.advance(180)
  const rows = rowNodes()
  const order = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  const chipFor = (id) => stateChip(rows[order.indexOf(id)])
  assert.ok(String(chipFor('done').style.transform || '').includes('scale('), 'the one that just finished is the news')
  assert.ok(!chipFor('ask').style.transform, 'a debt already on the list does not need pointing at')
  assert.ok(!chipFor('busy').style.transform, 'nor does a run the reader is watching')
  clock.advance(900)
  tap('Escape')
})

check('a feed update does not restart the beat', () => {
  const done = { id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }
  seed([done])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  clock.advance(1000)
  assert.ok(!stateChip(rowNodes()[0]).style.transform, 'the beat is over')
  // A repaint arrives — the kind that used to be able to replay a cue tied to
  // painting. It must land on a still chip: the beat answers "what changed while
  // this window was closed", and it has already been answered.
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  clock.advance(180)
  assert.ok(!stateChip(rowNodes()[0]).style.transform, 'a repaint must not fire it again')
  tap('Escape')
})

check('a repaint in the middle of the beat keeps it on the new chips', () => {
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  clock.advance(200)
  const first = stateChip(rowNodes()[0])
  assert.ok(String(first.style.transform || '').includes('scale('), 'the beat is running')
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  const rebuilt = stateChip(rowNodes()[0])
  assert.notEqual(rebuilt, first, 'the repaint really did replace the chip node')
  assert.ok(String(rebuilt.style.transform || '').includes('scale('), 'so the beat must continue on the replacement')
  clock.advance(900)
  assert.equal(rebuilt.style.transform, '', 'and end on it too')
  tap('Escape')
})

check('a pending question outranks a completion reminder', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false, completionUnread: true, pendingInteraction: { kind: 'answer' } })
  tap('f')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusWaitAnswer')]])
  tap('Escape')
})

check('an unrecognised pending kind still shows something', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false, pendingInteraction: { kind: 'somethingNew' } })
  tap('f')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusWaiting')]], 'unknown kinds must not render blank')
  tap('Escape')
})

check('a live status change repaints the open window', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(renderedStatuses(), [[], []])
  statusFeed.put('b', { running: true })
  // `b` moves into the "in flight" block, which leads the list, so it is the
  // first row now rather than the second. The point of the check is that the
  // open window repaints at all, not where the row lands.
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')], []],
    'a finished run must appear live'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['b', 'a'],
    'and it is the attention block that leads the list'
  )
  tap('Escape')
  assert.equal(statusFeed.listeners.length, 1, 'the window lets go of the feed; the run watch stays')
})

check('a running row shows how long it has been going', () => {
  seed([
    { id: 'a', displayTitle: 'in flight', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'idle', updatedAt: ago(2) },
  ])
  // The shell publishes every conversation it lists, idle ones included, so a
  // turn starting is a false -> true transition the watch can see.
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(90 * 1000)
  tap('f')
  assert.deepEqual(
    renderedStatuses(),
    [[liveChip('statusRunning', 1)], []],
    'the clock rides inside the state chip, and an idle row carries neither'
  )
  // The turn count is still out when the window opens, and the repaint that
  // settles it rebuilds the list — its own behaviour, and not the tick's. Let it
  // land first, so what follows is testing the tick and nothing else.
  clock.advance(2000)
  const chip = stateChip(rowNodes()[0])
  assert.ok(chip, 'the running row carries a state chip')
  assert.equal(chip.getAttribute('title'), expectedLabel('elapsedFor') + ' ' + elapsedLabel(1))
  assert.equal(
    fakeWindow.__dshVim.palette().rows[0].since > 0,
    true,
    'the debug API must expose the stamp the row is drawn from'
  )
  // A minute later, in place: a tick must not rebuild the list under the user's
  // selection, nor under a half-typed rename.
  clock.advance(60 * 1000)
  assert.equal(
    chip.textContent,
    liveChip('statusRunning', 2),
    'the chip ticks while the window is open'
  )
  assert.equal(
    stateChip(rowNodes()[0]),
    chip,
    'the chip is updated, not replaced'
  )
  tap('Escape')
})

check('a new turn starts its clock over', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(60 * 1000)
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(10 * 1000)
  tap('f')
  // Ten seconds in, there is no duration to show yet: the chip keeps the plain
  // state rather than a count of seconds nobody acts on. The second turn is
  // still its own, and is not charged for the first.
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')], []],
    'the second turn is not charged for the first'
  )
  // A turn parked on a question is the same turn waiting on the user: in
  // flight, and timed from where it started.
  statusFeed.put('b', { running: false })
  statusFeed.put('b', { running: false, pendingInteraction: { kind: 'approval' } })
  clock.advance(5 * 1000)
  // Both are in the attention blocks now, and `mine` leads: the parked question
  // comes before the turn in flight, whatever the clock says.
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusWaitApproval')], [expectedLabel('statusRunning')]],
    'a conversation waiting on a question keeps its own clock'
  )
  tap('Escape')
})

check('the columns on the right line up down the list', () => {
  projections.put('sessionStats', { turns: 13 })
  // Ids and stamps of their own: the turn-count cache is keyed by session and
  // updatedAt, and a check that reuses another's would inherit its count.
  seed([
    { id: 'col-a', displayTitle: 'a', updatedAt: ago(10) },
    { id: 'col-b', displayTitle: 'b', updatedAt: ago(11) },
  ])
  // One row with a clock in its state chip, one with a settlement reminder:
  // two chips of different widths, in one column.
  statusFeed.put('col-a', { running: false })
  statusFeed.put('col-a', { running: true })
  statusFeed.put('col-b', { running: false, completionUnread: true })
  // A minute in, so the clocked chip actually carries a duration: at minute
  // resolution a fresh turn shows the plain state, and the two chips would be
  // the same width for a reason this check is not about.
  clock.advance(60 * 1000)
  tap('f')
  const rows = rowNodes()
  assert.equal(
    rows[1].style.gridTemplateColumns,
    rows[0].style.gridTemplateColumns,
    'every row reserves the same columns, whatever its own content is'
  )
  const tracks = rightTracks(rows[0])
  assert.match(
    tracks.join(' '),
    /^\d+px \d+px \d+px$/,
    'stage, turns and time are sized once for the list, not per row'
  )
  const chips = rows.map((row) => stateChip(row))
  // The settled row leads the list now, because it is the one waiting on the
  // reader; the running row trails it. The two chips differ in width, which is
  // the point — the column is fitted to the wider of them, not to each row.
  const running = fakeWindow.__dshVim.palette().rows.findIndex((r) => r.id === 'col-a')
  const settled = fakeWindow.__dshVim.palette().rows.findIndex((r) => r.id === 'col-b')
  assert.ok(running >= 0 && settled >= 0, 'both conversations are on the list')
  assert.ok(
    chips[settled].scrollWidth < chips[running].scrollWidth,
    'the settled row has the narrower chip'
  )
  // The state gutter leads the row, so it is the first track in the template —
  // and it is fitted to the widest state on screen, which is what keeps every
  // name starting at the same x.
  assert.equal(
    statusTrack(rows[0]),
    chips[running].scrollWidth + 'px',
    'the state gutter is as wide as the widest state on screen'
  )
  assert.equal(statusTrack(rows[1]), statusTrack(rows[0]), 'and it is shared by every row')
  for (const chip of chips) {
    assert.equal(chip.style.justifySelf, 'start', 'a state chip starts at the same x on every row')
  }
  const turns = rows[0].children.find((c) => c.style.opacity === '0.38')
  assert.ok(turns, 'the turn count is on the row')
  assert.equal(turns.style.gridColumn, '4', 'in its own column, right of the state')
  assert.equal(turns.style.justifySelf, 'end', 'the turn count is right aligned')
  const meta = rows[0].children.find((c) => c.style.opacity === '0.5')
  assert.ok(meta, 'the time is on the row')
  assert.equal(meta.style.gridColumn, '5', 'and the time is the last column')
  assert.equal(meta.style.justifySelf, 'end', 'and the time is right aligned')
  // Measured cells must not wrap: a cell that wrapped would report the width it
  // wrapped into, and the column would be fitted to that instead of its text —
  // which is exactly how "2 小时前" ended up on two lines.
  for (const cell of [chips[0], chips[1], turns, meta]) {
    assert.equal(cell.style.whiteSpace, 'nowrap', 'a measured cell is one line')
  }
  tap('Escape')
})

check('without a status source the catalogue running flag is all there is', () => {
  seed([
    { id: 'a', displayTitle: 'busy', updatedAt: ago(1), running: true },
    { id: 'b', displayTitle: 'idle', updatedAt: ago(2) },
  ])
  // statusFeed is empty, so this exercises the no-entry path as well. The busy
  // one leads the list: it is the one in flight.
  tap('f')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusRunning')], []])
  tap('Escape')
})

check('the debug API reports each row status', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false, completionUnread: true })
  tap('f')
  const row = fakeWindow.__dshVim.palette().rows[0]
  assert.equal(row.status.key, 'done')
  assert.equal(row.status.text, expectedLabel('statusDone'))
  tap('Escape')
})

check('o switches out of the box, with nothing configured', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'o', 'o is the shipped switch default now')
  tap('f')
  tap('d')
  tap('o')
  assert.deepEqual(opened, ['b'], 'o must work without touching the settings')
  assert.equal(fakeWindow.__dshVim.palette().open, false)
  tap('f')
  tap('d')
  tap('Enter')
  assert.deepEqual(opened, ['b', 'b'], 'Enter works too, on the shipped default')
})

check('the switch key is honoured when rebound to something else', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  fakeWindow.__dshVim.update({ paletteEnterKey: 'k' })
  tap('f')
  tap('d')
  assert.equal(tap('o'), false, 'the old key must stop switching')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'and must not switch either')
  tap('k')
  assert.deepEqual(opened, ['b'])
  assert.equal(fakeWindow.__dshVim.palette().open, false)

  tap('f')
  tap('d')
  tap('Enter')
  assert.deepEqual(opened, ['b', 'b'], 'Enter still switches after a rebind')
})

check('the footer advertises the switch key', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.ok(footerText().includes('f/o/Enter'), 'the footer names the key that opened the window too')
  assert.ok(
    footerText().includes('r ' + expectedLabel('rename')),
    'and the key that renames the selected conversation'
  )
  fakeWindow.__dshVim.update({ paletteEnterKey: 'k' })
  assert.ok(footerText().includes('f/k/Enter'), 'a rebound key is shown alongside Enter')
  fakeWindow.__dshVim.update({ paletteKey: 'p' })
  assert.ok(footerText().includes('p/k/Enter'), 'and a rebound open key is shown as well')
  tap('Escape')
})

check('the switch key cannot share a key with the rest of its group', () => {
  fakeWindow.__dshVim.update({ paletteEnterKey: 'f' })
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'o', 'a collision must be refused')
  // downKey is a different group, so the same letter is fine there
  fakeWindow.__dshVim.update({ downKey: 'o', paletteEnterKey: 'k' })
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'k')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'o')
})

/** The turn counts painted in the mounted window, row by row. */
function renderedTurns() {
  return rowNodes().map((row) => {
    const hit = row.children.find((c) => c.style.opacity === '0.38')
    return hit ? hit.textContent : null
  })
}

check('turn counts appear after the window is already open', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(renderedTurns(), [null, null], 'the window opens without waiting for a count')
  // The count lands later, exactly as the shell serves it.
  projections.put('sessionStats', { turns: 13 })
  assert.deepEqual(
    renderedTurns(),
    [13 + ' ' + expectedLabel('turnUnit'), 13 + ' ' + expectedLabel('turnUnit')],
    'a count paints itself in once it arrives'
  )
  assert.equal(fakeWindow.__dshVim.palette().rows[0].turns, 13)
  tap('Escape')
})

check('peeking never retains a session as the main view', () => {
  seed([{ id: 'mv', displayTitle: 'a', updatedAt: ago(3) }])
  tap('f')
  projections.put('sessionStats', { turns: 4 })
  tap('Escape')
  // Retaining as mainView would clear the completion reminder in
  // uiSession.reconcileStatus(), wiping the "just done" badge off every row.
  assert.ok(projections.sources.length > 0, 'the plugin must retain scopes to read projections')
  for (const source of projections.sources) {
    assert.notEqual(source, 'mainView', `peeked as "${source}": that marks the conversation read`)
  }
})

check('a peeked scope is released whatever happens', () => {
  seed([
    { id: 'rel1', displayTitle: 'a', updatedAt: ago(4) },
    { id: 'rel2', displayTitle: 'b', updatedAt: ago(5) },
  ])
  tap('f')
  projections.put('sessionStats', { turns: 2 })
  assert.deepEqual([...projections.live], [], 'a settled peek must not hold its scope')

  // Closing mid-flight must let the held reference go too.
  tap('Escape')
  projections.values.delete('sessionStats')
  seed([{ id: 'rel3', displayTitle: 'c', updatedAt: ago(6) }])
  tap('f')
  assert.deepEqual([...projections.live], ['rel3'], 'the unsettled peek is still held')
  tap('Escape')
  assert.deepEqual([...projections.live], [], 'closing the window releases it')
})

check('a count is re-read once the conversation moves on', () => {
  seed([{ id: 'fresh', displayTitle: 'a', updatedAt: ago(7) }])
  projections.put('sessionStats', { turns: 13 })
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].turns, 13)
  tap('Escape')

  // A new message changes updatedAt, so the cached count is stale.
  feed.publish(['fresh'], {
    fresh: { id: 'fresh', displayTitle: 'a', updatedAt: ago(0.5), blank: false, running: false },
  })
  projections.values.delete('sessionStats')
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].turns, null, 'a stale count is not shown')
  tap('Escape')
})

check('a host with no projection source just shows no count', () => {
  seed([{ id: 'none', displayTitle: 'a', updatedAt: ago(8) }])
  tap('f')
  clock.advance(2000)
  assert.deepEqual(renderedTurns(), [null], 'no count is better than a wrong one')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the window still works')
  assert.deepEqual([...projections.live], [], 'a source that never answers must not hold a scope')
  tap('Escape')
})

check('probe() reports the target it would scroll', () => {
  const info = fakeWindow.__dshVim.probe()
  assert.equal(info.element, transcript)
  assert.equal(info.tag, 'DIV')
  assert.equal(info.pointer.seen, false, 'no move has happened, so no point is claimed')
  assert.equal(info.composer.known, true, 'the message box must be findable')
  assert.equal(info.composer.focused, false)
})

check('probe() reports the pointer it is following', () => {
  movePointer(120, 300)
  const info = fakeWindow.__dshVim.probe()
  assert.deepEqual(info.pointer, { x: 120, y: 300, seen: true })
  assert.equal(info.element, sidebar, 'and the pane that point resolves to')
})

check('probe() reports the message box it is protecting', () => {
  tap(' ')
  assert.equal(fakeWindow.__dshVim.probe().composer.focused, true, 'the focus key put the caret there')
  fakeDocument.activeElement = body
  assert.equal(fakeWindow.__dshVim.probe().composer.focused, false)
})

await checkAsync('disposal unmounts the task window, the picker, the notice, and every listener', async () => {
  // A notice is a line the plugin owns; nothing may leave it on the page, and
  // nothing else can ever take it down.
  seed([])
  tap('q')
  assert.ok(body.children.length > 0, 'the notice must be mounted')
  // One conversation, and it is the one on screen: the task window lists it and
  // the picker can act on it, so both windows have something to show.
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000, retainedBy: { mainView: 1 } }])
  tap('f')
  assert.ok(body.children.length > 1, 'the task window must be mounted')
  // The picker is the other window this plugin mounts, and it has to go with
  // the rest: a card left on the page would outlive the key that opened it.
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'the picker must be mounted beside it')
  const mounted = body.children.length
  assert.ok(mounted > 2, 'both windows are on the page together')
  cleanup()
  assert.equal(body.children.length, 0, 'no window and no notice may outlive the plugin')
  assert.equal(feed.listeners.length, 0, 'the feed subscription must be dropped too')
  assert.equal(statusFeed.listeners.length, 0, 'the run watch must go with the plugin')
  assert.equal(listeners.length, 0, 'no listener may outlive the plugin')
  assert.equal(fakeWindow.__dshVim, undefined)
})
// Seed storage directly so this check covers load(), not earlier writes.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'k', upKey: 'f', step: 200, tau: 90, repeatDelay: 300 })
  )
  const second = await loadBundle('?reload=1')
  const ctx2 = makeCtx()
  second.apply(ctx2)
  const restored = fakeWindow.__dshVim.settings()
  assert.equal(restored.downKey, 'k', 'the reloaded plugin must read the stored key')
  // This store predates the task window, so its up key was the default f. Now
  // that scrolling and the window are separate key groups, f is unambiguous
  // (scroll up outside, close the window inside) and the old binding is kept.
  assert.equal(restored.upKey, 'f', 'a pre-task-window up key must survive untouched')
  assert.equal(restored.paletteKey, 'f')
  assert.equal(restored.paletteUpKey, 'e', 'seats the store never knew take their defaults')
  assert.equal(restored.paletteDownKey, 'd')
  assert.equal(restored.spaceBlurs, true, 'a store written before the empty-box key ships it on')
  assert.equal(restored.step, 200, 'the reloaded plugin must read the stored step')
  assert.equal(restored.tau, 90)
  assert.equal(restored.repeatDelay, 300)
  assert.equal(ctx2.log.sections.length, 1, 'the reloaded plugin must register its settings page again')
  ctx2.log.cleanups[0]()
  checks++
  console.log('  ok  stored preferences survive a reload, and new seats take their defaults')
}

// A stored send mode must come back with the line that names the send key: the
// mode alone is not enough, because the hint is what tells the user the mode
// took effect.
{
  fakeStorage.setItem('dsh-vim/settings/v1', JSON.stringify({ sendMode: 'newline' }))
  const hinted = await loadBundle('?reload=sendmode')
  const ctxH = makeCtx()
  hinted.apply(ctxH)
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'newline', 'the mode survived the reload')
  // The reloaded plugin registered its own dock contribution, so the line has
  // to come from that registration rather than from the page's first one.
  const dock = (ctxH.log.slots['conversation.composer.dock'] ?? [])[0]
  assert.ok(dock, 'the reloaded plugin must contribute the hint to the composer dock again')
  const line = dock.component({ t: (k) => k })
  assert.ok(line, 'and the mode it stored must make it render something')
  assert.ok(/\+Enter/.test(line.children.join('')), 'naming the key that sends')
  // Unloading drops the slot registration, so the shell stops asking for it:
  // there is nothing left to render null against.
  ctxH.log.cleanups[0]()
  checks++
  console.log('  ok  a stored send mode reloads with its hint in the composer dock')
}

// A stored model list must come back cleaned: it is the one preference a
// hand-edited store could turn into something the key would submit.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({
      modelKey: 'm',
      favorites: [
        { provider: 'deepseek', model: 'deepseek-reasoner' },
        { provider: 'deepseek', model: 'deepseek-reasoner' },
        { provider: 'bunny' },
        'nonsense',
      ],
    })
  )
  const listed = await loadBundle('?reload=favorites')
  const ctxF = makeCtx()
  listed.apply(ctxF)
  const restored = fakeWindow.__dshVim.settings()
  assert.equal(restored.modelKey, 'm', 'the rebound model key must survive the reload')
  assert.deepEqual(
    restored.favorites,
    [{ provider: 'deepseek', model: 'deepseek-reasoner' }],
    'the list must come back in order, deduplicated, with half-written entries dropped'
  )
  ctxF.log.cleanups[0]()
  checks++
  console.log('  ok  a stored model list reloads cleaned, and its key with it')
}

// A hand-edited store that collides inside one group must be repaired.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'd', upKey: 'd', paletteUpKey: 'k', paletteDownKey: 'k' })
  )
  const repaired = await loadBundle('?reload=7')
  const ctxR = makeCtx()
  repaired.apply(ctxR)
  const fixed = fakeWindow.__dshVim.settings()
  assert.equal(fixed.downKey, 'd', 'the earlier seat in a group keeps its value')
  assert.equal(fixed.upKey, 'e', 'the later one falls back to its default')
  assert.equal(fixed.paletteUpKey, 'k', 'each group is repaired on its own')
  assert.equal(fixed.paletteDownKey, 'd')
  ctxR.log.cleanups[0]()
  checks++
  console.log('  ok  a hand-edited collision inside a group is repaired on load')
}

// A hand-edited level seat that collides across the two groups it draws from
// must be repaired too: the model window's own group is the only place that
// collision is visible.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ modelLevelKey: 'q', downKey: 'd', upKey: 'e' })
  )
  const repairedLevel = await loadBundle('?reload=level-seat')
  const ctxL = makeCtx()
  repairedLevel.apply(ctxL)
  const fixedLevel = fakeWindow.__dshVim.settings()
  assert.equal(fixedLevel.effortKey, 'q', 'the page seat keeps the key it had')
  assert.notEqual(fixedLevel.modelLevelKey, 'q', 'and the level seat steps aside')
  assert.notEqual(fixedLevel.modelLevelKey, fixedLevel.modelKey, 'without landing on the confirm key')
  assert.notEqual(fixedLevel.modelLevelKey, fixedLevel.paletteDownKey, 'nor on a movement key')
  ctxL.log.cleanups[0]()
  checks++
  console.log('  ok  a level seat that collides with the page seats is repaired on load')
}

// A hand-damaged store must not brick the plugin.
{
  fakeStorage.setItem('dsh-vim/settings/v1', '{ this is not json')
  const quiet = console.warn
  console.warn = () => {}
  const third = await loadBundle('?reload=2')
  const ctx3 = makeCtx()
  third.apply(ctx3)
  console.warn = quiet
  const fallback = fakeWindow.__dshVim.settings()
  assert.deepEqual(fallback, SHIPPED)
  ctx3.log.cleanups[0]()
  checks++
  console.log('  ok  malformed stored settings fall back to the defaults')
}

// A host without the two services must lose the task window only.
{
  fakeStorage.clear()
  feed.clear()
  const fourth = await loadBundle('?reload=5')
  const ctx4 = makeCtx({ services: false })
  fourth.apply(ctx4)
  const api4 = fakeWindow.__dshVim
  assert.equal(api4.palette().available, false, 'the task window must report itself unavailable')
  const swallowed = tap('f')
  assert.equal(swallowed, false, 'an unavailable task window must not eat the key')
  assert.equal(api4.palette().open, false)
  assert.equal(opened.length, 0, 'nothing may be switched without the navigator')
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'scrolling must survive a host without the services')
  ctx4.log.cleanups[0]()
  checks++
  console.log('  ok  a host without sessions/uiWorkspace keeps scrolling and drops the task window')
}

// A host that refuses the dock must lose the hint and nothing else: the whole
// reason this plugin exists is the keyboard, and a line of text is not worth a
// broken scroll engine.
{
  fakeStorage.clear()
  feed.clear()
  const refused = await loadBundle('?reload=nodock')
  const ctxN = makeCtx()
  // A host whose slot registry rejects this contribution — an older build with
  // no dock, or one that answers to a different owner. It throws, as the real
  // registry does for a slot it did not declare.
  ctxN.slots.inject = (name, callback) => {
    ctxN.log.injected.push(name)
    if (name === 'conversation.composer.dock') throw new Error('slot not declared')
    return callback()
  }
  const quiet = console.warn
  console.warn = () => {}
  refused.apply(ctxN)
  console.warn = quiet
  assert.ok(fakeWindow.__dshVim, 'the plugin must still be there')
  transcript.scrollTop = 0
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'and scrolling must still work')
  assert.equal(
    (ctxN.log.slots['conversation.composer.dock'] ?? []).length,
    0,
    'the hint simply is not contributed'
  )
  // The send mode itself still applies; only the line is missing.
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'newline')
  assert.equal(keydown('Enter', { target: editor }), true, 'and Enter still breaks the line')
  ctxN.log.cleanups[0]()
  checks++
  console.log('  ok  a host that refuses the composer dock loses the hint and keeps the keyboard')
}

// A host with the sessions feed but no archive registry still gets a window.
{
  fakeStorage.clear()
  feed.clear()
  registry.archivedSessionIds = ['would-be-archived']
  const fifth = await loadBundle('?reload=6')
  const ctx5 = makeCtx({ registry: false })
  fifth.apply(ctx5)
  seed([{ id: 'would-be-archived', displayTitle: 'unfiltered', updatedAt: ago(1) }])
  tap('f')
  const state5 = fakeWindow.__dshVim.palette()
  assert.equal(state5.available, true, 'the task window must still work')
  assert.deepEqual(state5.rows.map((r) => r.id), ['would-be-archived'], 'without the registry, nothing is filtered')
  tap('Escape')
  ctx5.log.cleanups[0]()
  checks++
  console.log('  ok  a host without a workspace registry gets an unfiltered task window')
}

// A turn already in flight when the plugin arrives is shown but not timed: the
// start was never seen, and a clock invented for it would be a lie.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  statusFeed.put('a', { running: true })
  const sixth = await loadBundle('?reload=8')
  const ctx6 = makeCtx()
  sixth.apply(ctx6)
  seed([{ id: 'a', displayTitle: 'in flight', updatedAt: Date.now() }])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].status.key, 'running', 'the row still shows what it is doing')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusRunning')]], 'but no clock: this plugin never saw this turn begin')
  // The next turn is its own, and is timed from where it started.
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(7 * 1000)
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')]],
    'a turn that starts under the watch is timed — and seven seconds in, that still shows nothing'
  )
  clock.advance(60 * 1000)
  assert.deepEqual(
    renderedStatuses(),
    [[liveChip('statusRunning', 1)]],
    'once the turn passes a minute the duration appears'
  )
  tap('Escape')
  ctx6.log.cleanups[0]()
  checks++
  console.log('  ok  a turn already in flight when the plugin arrives gets no clock')
}

// A host without the model picker must lose the reasoning key and the model key,
// and nothing else.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  transcript.scrollTop = 0
  const seventh = await loadBundle('?reload=9')
  const ctx7 = makeCtx({ model: null })
  seventh.apply(ctx7)
  seedVisible()
  assert.equal(tap('q'), true, 'the key is still the plugin\u2019s, and must not fall through to the page')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'nothing may be submitted without a directory to submit to')
  assert.equal(toastText(), expectedLabel('effortUnsupported'), 'the press is answered all the same')
  // The model key sits in the same place and loses the same thing: both read one
  // directory service, and neither may scroll the page instead.
  fakeWindow.__dshVim.update({ favorites: [{ provider: 'deepseek', model: 'deepseek-chat' }] })
  assert.equal(tap('w'), true, 'the model key is claimed the same way')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'and there is still nowhere to submit to')
  assert.equal(toastText(), expectedLabel('modelUnsupported'), 'and the press is answered all the same')
  fakeWindow.__dshVim.reset()
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().available, true, 'the task window must not be affected')
  tap('Escape')
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'nor may scrolling')
  ctx7.log.cleanups[0]()
  checks++
  console.log('  ok  a host without a model directory loses the two model keys only')
}

// A client rebuild must not restart the clocks: the host keeps the turn running
// while the page is replaced around it, so the stamp has to outlive the page.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  const first = await loadBundle('?reload=10')
  const ctxFirst = makeCtx()
  first.apply(ctxFirst)
  seed([{ id: 'long', displayTitle: 'a long turn', updatedAt: ago(1) }])
  statusFeed.put('long', { running: false }) // seen idle first
  statusFeed.put('long', { running: true }) // then seen starting: this is the stamp
  const written = JSON.parse(fakeStorage.getItem('dsh-vim/runs/v1') || '{}')
  assert.ok(written.long > 0, 'the start of a turn in flight is left behind for the next page')

  // The old client goes away exactly as a reload takes it away...
  ctxFirst.log.cleanups[0]()
  assert.equal(fakeWindow.__dshVim, undefined, 'the reloaded page must be a different instance')

  // ...and the new one arrives while the host is still running that same turn.
  const second = await loadBundle('?reload=11')
  second.apply(makeCtx())
  // A minute of the turn goes by, so there is a duration to show: under that,
  // the chip deliberately shows the plain state and this could not tell a kept
  // stamp from a lost one.
  clock.advance(60 * 1000)
  fakeWindow.__dshVim.palette(true)
  const row = fakeWindow.__dshVim.palette().rows.find((r) => r.id === 'long')
  assert.ok(row, 'the conversation must still be listed')
  assert.equal(row.since, written.long, 'the rebuilt client keeps the clock it had')
  assert.ok(
    renderedStatuses()[0][0].startsWith(expectedLabel('statusRunning') + ' · '),
    'and the row shows the clock again, not just the bare state'
  )
  fakeWindow.__dshVim.palette(false)
  checks++
  console.log('  ok  a turn that outlives a client rebuild keeps its clock')
}

// The ledger is a note about a turn, not about a conversation: once the status
// source says nothing is running there, the stamp goes with the turn.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  fakeStorage.setItem('dsh-vim/runs/v1', JSON.stringify({ ended: Date.now() - 60 * 1000 }))
  const third = await loadBundle('?reload=12')
  third.apply(makeCtx())
  statusFeed.put('ended', { running: false })
  assert.deepEqual(
    JSON.parse(fakeStorage.getItem('dsh-vim/runs/v1') || '{}'),
    {},
    'a turn that ended while the page was away keeps no clock'
  )
  checks++
  console.log('  ok  the stamp of a finished turn is dropped')
}

// A stamp too old to be about the turn running now is not adopted: it would be a
// clock of hours that never happened.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  fakeStorage.setItem('dsh-vim/runs/v1', JSON.stringify({ stale: Date.now() - 13 * 60 * 60 * 1000 }))
  const fourth = await loadBundle('?reload=13')
  fourth.apply(makeCtx())
  assert.deepEqual(
    JSON.parse(fakeStorage.getItem('dsh-vim/runs/v1') || '{}'),
    {},
    'an expired stamp is pruned on the way in'
  )
  seed([{ id: 'stale', displayTitle: 'a stale one', updatedAt: ago(1) }])
  statusFeed.put('stale', { running: true })
  fakeWindow.__dshVim.palette(true)
  const row = fakeWindow.__dshVim.palette().rows.find((r) => r.id === 'stale')
  assert.equal(row.since, 0, 'so the row shows no clock rather than a day that never happened')
  assert.equal(renderedStatuses()[0][0], expectedLabel('statusRunning'), 'the plain state is all it claims')
  fakeWindow.__dshVim.palette(false)
  checks++
  console.log('  ok  a stamp too old to be this turn is not adopted')
}

// A page that has been up for a while must not adopt a stamp from an older one:
// a conversation it only now meets starting a turn is not that turn.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  fakeStorage.setItem('dsh-vim/runs/v1', JSON.stringify({ late: Date.now() - 25 * 60 * 1000 }))
  const late = await loadBundle('?reload=14')
  late.apply(makeCtx())
  seed([{ id: 'late', displayTitle: 'met late', updatedAt: ago(1) }])
  const realNow = Date.now
  try {
    // Two minutes of this page's life go by before the conversation shows up.
    Date.now = () => realNow() + 2 * 60 * 1000
    statusFeed.put('late', { running: true })
    fakeWindow.__dshVim.palette(true)
    const row = fakeWindow.__dshVim.palette().rows.find((r) => r.id === 'late')
    assert.equal(row.since, 0, 'the old stamp must not become this turn’s clock')
    assert.equal(renderedStatuses()[0][0], expectedLabel('statusRunning'), 'so the row claims only the state')
    fakeWindow.__dshVim.palette(false)
  } finally {
    Date.now = realNow
  }
  checks++
  console.log('  ok  a stamp is not adopted by a page that has moved on')
}

// The last check, because it unloads the plugin it drives: the send hint is a
// slot contribution, so it leaves with the registration rather than with a node
// the plugin painted — but it must leave all the same.
{
  const ctxLast = makeCtx()
  const last = await loadBundle('?reload=last')
  last.apply(ctxLast)
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const dock = (ctxLast.log.slots['conversation.composer.dock'] ?? [])[0]
  assert.ok(dock, 'the dock contribution is registered')
  assert.ok(dock.component({ t: (k) => k }), 'and it renders while the mode asks for it')
  ctxLast.log.cleanups[0]()
  assert.equal(fakeWindow.__dshVim, undefined, 'unloading leaves the page with no plugin on it')
  checks++
  console.log('  ok  the send hint leaves with the plugin that contributed it')
}

// A rebuild mounts the same module again, and the dock is a list slot the shell
// renders entry by entry: a plugin that registers per apply stacks the same
// sentence on the page until the row is unreadable. Counted here rather than
// described, because one registration is the only thing standing between a
// setting and a wall of copies.
{
  const rebuilt = await loadBundle('?rebuild=once')
  const ctxA = makeCtx()
  rebuilt.apply(ctxA)
  ctxA.log.cleanups[0]()
  // The same bundle instance, mounting again — what a client rebuild does.
  const ctxB = makeCtx()
  rebuilt.apply(ctxB)
  const entries = ctxB.log.slots['conversation.composer.dock'] ?? []
  assert.equal(
    entries.length,
    0,
    'a second mount must not add a second copy of the hint to the dock'
  )
  checks++
  console.log('  ok  the composer dock is contributed once, however often the plugin mounts')
}

// A stage is a fact about a conversation, not about a page: a reload must not
// lose it, and a value a newer build no longer knows must not come back as one.
{
  fakeStorage.clear()
  feed.clear()
  fakeStorage.setItem(
    'dsh-vim/phases/v1',
    JSON.stringify({ kept: 'check', stale: 'a-stage-from-another-vocabulary' })
  )
  const stageFirst = await loadBundle('?stage=1')
  const stageCtx = makeCtx()
  stageFirst.apply(stageCtx)
  assert.equal(fakeWindow.__dshVim.phase('kept'), 'check', 'a known stage is carried over')
  assert.equal(
    fakeWindow.__dshVim.phase('stale'),
    '',
    'a stage this build cannot label is dropped at load, not shown as one'
  )
  assert.deepEqual(
    JSON.parse(fakeStorage.getItem('dsh-vim/phases/v1') || '{}'),
    { kept: 'check' },
    'and the store is rewritten without it'
  )
  stageCtx.log.cleanups[0]()
  checks++
  console.log('  ok  stages are carried across a reload, and unknown ones are dropped')
}

// A host whose navigator publishes no archive action: the key must not be a
// silent no-op, because the user pressed it and the footer has to answer.
//
// This runs last, and clears every other instance first. The earlier reload
// blocks left their own windows and listeners behind, and one of those hosts
// does publish the action — so a stray listener would archive the row before
// this check could see the fallback, and `footerText` would read somebody
// else's window.
{
  cleanup()
  for (let i = listeners.length - 1; i >= 0; i--) {
    if (listeners[i].type === 'keydown') listeners.splice(i, 1)
  }
  body.children.length = 0
  fakeStorage.clear()
  feed.clear()
  registry.clear()
  const host = await loadBundle('?reload=archive-unavailable')
  const ctxA = makeCtx()
  const inner = ctxA.get
  ctxA.get = (name) => (name === 'uiWorkspace' ? { openSession() {} } : inner(name))
  host.apply(ctxA)
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.deepEqual(renderedRowIds(), ['a'], 'the row must be there before the key is pressed')
  tap('g')
  assert.ok(
    footerText().includes(expectedLabel('archiveUnavailable')),
    'the footer must name the missing capability'
  )
  assert.deepEqual(renderedRowIds(), ['a'], 'and the row must still be there')
  tap('Escape')
  ctxA.log.cleanups[0]()
  checks++
  console.log('  ok  a host without an archive action says so instead of doing nothing')
}

// The archive seat arrived in 0.16, and `g` used to be the switch seat's
// shipped default. A store written before that must come out with `g` on the
// archive seat and the switch seat on its new default — otherwise the user is
// left with an archive key they never chose and a switch key that no longer
// matches the docs.
{
  fakeStorage.clear()
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'd', paletteEnterKey: 'g', step: 140 })
  )
  const migrated = await loadBundle('?reload=archive-migrate')
  const ctxM = makeCtx()
  migrated.apply(ctxM)
  const after = fakeWindow.__dshVim.settings()
  assert.equal(after.paletteArchiveKey, 'g', 'g must land on the archive seat')
  assert.equal(after.paletteEnterKey, 'o', 'and the untouched switch seat moves to its new default')
  assert.notEqual(after.paletteEnterKey, after.paletteArchiveKey, 'the two must not collide')
  ctxM.log.cleanups[0]()
  checks++
  console.log('  ok  a pre-archive store keeps g for archiving and moves the switch seat')
}

// The other half of the same migration: a user who had chosen their own switch
// key must keep it, and the archive seat must find somewhere else to live.
{
  fakeStorage.clear()
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'd', paletteEnterKey: 'k', step: 140 })
  )
  const kept = await loadBundle('?reload=archive-migrate-2')
  const ctxK = makeCtx()
  kept.apply(ctxK)
  const after = fakeWindow.__dshVim.settings()
  assert.equal(after.paletteEnterKey, 'k', 'a chosen switch key must survive the migration')
  assert.notEqual(after.paletteArchiveKey, 'k', 'and the archive seat must not take it')
  assert.ok(after.paletteArchiveKey, 'the archive seat must still have a key')
  ctxK.log.cleanups[0]()
  checks++
  console.log('  ok  a chosen switch key survives the migration and the archive seat steps aside')
}

// --- the history ----------------------------------------------------------
//
// A day's page is what the board read at that moment. These checks file one,
// read it back, and prove the two promises the design makes: a page is a copy
// (so a later edit cannot change it) and restoring one copies it into today
// rather than writing to the page.

// The migration checks above reload the bundle and take it down again, so the
// plugin is not mounted when this section starts: mount it, and let `reset` own
// the rest.
{
  const live = await loadBundle('?reload=history')
  const liveCtx = makeCtx()
  live.apply(liveCtx)
}

/** The board's own key, found by shape: the settings key is not it. */
function boardKey() {
  for (const key of stored.keys()) if (key.endsWith('/board/v1')) return key
  return null
}

await checkAsync('a page is filed when the day turns over, in the words it was drawn in', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  assert.equal(days.length, 1, 'one page for one day of drawing')
  const page = await fakeWindow.__dshVim.history(days[0])
  assert.equal(page.date, days[0], 'the page is filed under its own date')
  assert.equal(page.view.sessions.length, 1, 'the page remembers its members')
  assert.equal(page.view.sessions[0].id, 'kept')
  assert.equal(page.view.sessions[0].title, 'a task', 'the name is the one that was drawn')
  assert.ok(page.doc && page.doc.blocks, 'and the arrangement travelled with it')
  assert.ok(!('order' in page.doc), 'a page keeps five tables, not the whole document')
  tap('Escape')
})

await checkAsync('a conversation carried in is a quiet line that says how long', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  await flush()
  // The day brought it along, so it is on the board - but nothing has been done
  // in it since, so it is a line at the foot of the panel rather than a column of
  // its own. What the old card promised is the line's promise now: still here,
  // and still saying how long it has been.
  const panel = boardBlocks()[0]
  assert.ok(panel, 'the panel is still drawn')
  const head = boardSeat(panel, 'quietHead')
  assert.ok(head, 'and the conversation is still on the board, as the panel\'s quiet line')
  assert.equal(
    String(head.textContent),
    '▸ ' + expectedLabel('boardQuiet') + ' 1 · '
      + expectedLabel('boardQuietLongest') + ' 1 ' + expectedLabel('boardQuietDays'),
    'which says how many are quiet and how long the oldest has waited'
  )
  // Unfolding is the reader asking which ones: the lines are drawn then, and the
  // conversation is in one of them, with its own day count on it.
  head.__listeners.click[0]({ type: 'click', target: head, preventDefault() {}, stopPropagation() {} })
  const line = boardSeat(boardBlocks()[0], 'quietRow')
  assert.ok(line, 'unfolded, the carried conversation is a line of its own')
  assert.equal(line.__attrs['data-session-id'], 'kept', 'and it is the one that was carried')
  const waited = boardSeat(line, 'quietDays')
  assert.equal(
    String(waited ? waited.textContent : ''),
    '1 ' + expectedLabel('boardQuietDays'),
    'for one day, which is how long it has been'
  )
  assert.deepEqual(
    cardsIn(boardBlocks()[0]).map((card) => card.__attrs['data-session-id']),
    ['kept'],
    'and it is drawn once, not twice'
  )
  tap('Escape')
})

await checkAsync('a busy goal keeps its row at three and starts another under it', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a', 'b', 'c', 'd'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(6) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(5) },
    { id: 'c', displayTitle: 'c', updatedAt: todayAt(4) },
    { id: 'd', displayTitle: 'd', updatedAt: todayAt(3) },
  ])
  tap('j')
  const grid = boardSeat(boardBlock('dsh-vim'), 'blockColumns')
  assert.ok(grid, 'the panel still reads as columns')
  // Three across is the row's whole width. The fourth starts another row under
  // the first instead of making the panel a fourth column wider - which is what
  // used to turn a busy goal into two screens of paper.
  assert.equal(String(grid.style.width), (3 * 280 + 2 * 12) + 'px', 'the row is three columns wide')
  assert.deepEqual(
    cardsIn(grid).map((card) => card.__attrs['data-session-id']),
    ['a', 'b', 'c', 'd'],
    'and every conversation is still drawn'
  )
  tap('Escape')
})

await checkAsync('a page is copied into today, and the page itself is never written to', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  // A card written today belongs to the page being filed.
  const key = boardKey()
  const drawn = JSON.parse(stored.get(key))
  drawn.cards.push({ id: 'c1', x: 10, y: 10, text: 'a thought', link: '', done: false, filed: '', h: 0 })
  stored.set(key, JSON.stringify(drawn))
  tap('Escape')
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  const filed = await fakeWindow.__dshVim.history(days[0])
  assert.equal(filed.doc.cards.length, 1, 'the page carries the card that was on the board')
  // Today starts empty: the arrangement is gone, and the card with it.
  fakeStorage.setItem(key, JSON.stringify({ v: 2, blocks: {}, cards: [] }))
  tap('Escape')
  tap('j')
  assert.equal(boardDoc().cards.length, 0, 'today has no card of its own')
  const done = await fakeWindow.__dshVim.restoreDay(days[0])
  await flush()
  assert.equal(done, true, 'the page was copied in')
  assert.equal(boardDoc().cards.length, 1, 'the copy carries the page\'s card')
  assert.equal(boardDoc().cards[0].text, 'a thought')
  const again = await fakeWindow.__dshVim.history(days[0])
  assert.deepEqual(again, filed, 'and the page itself is exactly as it was')
  tap('Escape')
})

await checkAsync('a full store keeps the change, says so, and writes it once there is room', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const key = boardKey()
  const before = stored.get(key)
  fakeStorage.fail = true
  fireOn(boardSeat(boardBlock('dsh-vim'), 'blockFold'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(toastText(), expectedLabel('boardSaveFailed'), 'the window says the store is full')
  assert.equal(stored.get(key), before, 'and nothing was half-written')
  fakeStorage.fail = false
  clock.advance(6000)
  tap('Escape')
  tap('j')
  await flush()
  const after = boardDoc()
  assert.ok(after.blocks.w1, 'the fold is written once there is room again')
  assert.equal(after.blocks.w1.folded, true, 'with the value the press asked for')
  tap('Escape')
})

check('a panel forgets a conversation that is gone for good', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  const key = boardKey()
  const doc = JSON.parse(stored.get(key))
  doc.order.w1 = ['dead', 'kept']
  stored.set(key, JSON.stringify(doc))
  clock.advance(61 * 1000)
  tap('Escape')
  tap('j')
  const after = JSON.parse(stored.get(key))
  assert.deepEqual(after.order.w1, ['kept'], 'the id of a conversation that is gone is dropped')
  tap('Escape')
})


await checkAsync('the history panel reads a day back, and arming it writes nothing', async () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['kept'] }])
  seed([{ id: 'kept', displayTitle: 'a task', updatedAt: todayAt(2) }])
  tap('j')
  clock.jump(24 * HOUR)
  await flush()
  const days = await fakeWindow.__dshVim.history()
  const filed = await fakeWindow.__dshVim.history(days[0])

  assert.equal(fakeWindow.__dshVim.historyPanel(true), true, 'the panel opens')
  await flush()
  const panel = boardSeat(boardPanel(), 'boardHistoryPanel')
  assert.ok(panel, 'and it sits beside the canvas')
  const row = boardSeat(panel, 'historyDay')
  assert.ok(row, 'the day is listed')
  assert.equal(String(row.__attrs['data-date']), days[0], 'by its own date')

  fireOn(row, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  const opened = boardSeat(boardSeat(boardPanel(), 'boardHistoryPanel'), 'historyDetail')
  assert.ok(opened, 'opening a day shows its page')
  const listed = []
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.__attrs && child.__attrs['data-role'] === 'historySession') listed.push(child)
      walk(child)
    }
  }
  walk(opened)
  assert.equal(listed.length, 1, 'with the conversations it held')
  assert.ok(String(listed[0].textContent).includes('a task'), 'in the words it was drawn in')

  const restore = boardSeat(opened, 'historyRestore')
  assert.ok(restore, 'and one press to copy it into today')
  fireOn(restore, 'click', { type: 'click', stopPropagation() {} })
  await flush()
  const armed = boardSeat(boardSeat(boardPanel(), 'boardHistoryPanel'), 'historyRestore')
  assert.equal(String(armed && armed.__attrs['data-armed']), 'true', 'the first press only arms it')
  const again = await fakeWindow.__dshVim.history(days[0])
  assert.deepEqual(again, filed, 'and the page is exactly as it was')

  fakeWindow.__dshVim.historyPanel(false)
  assert.equal(boardSeat(boardPanel(), 'boardHistoryPanel'), null, 'closing takes it away')
  tap('Escape')
})


check('a drop files the conversation under the panel the event landed on', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'two', path: '/work/two', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a task', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b task', updatedAt: todayAt(2) },
  ])
  tap('j')
  // The hit test is pointed at the paper, and the event is what names the goal:
  // a drop is delivered to the element under the pointer, so the board reads the
  // event's own target before it asks the layout anything.
  aimAt(fakeDocument.body)
  dragOnto(boardBody(), 'a', { target: boardBlock('two') })
  resetHitTest()
  assert.deepEqual(fakeWindow.__dshVim.board().placed, { a: 'w2' }, 'the event target is the goal that took it')
  tap('Escape')
})

check('a drag that carries more than the id still names its conversation', () => {
  seed([{ id: 'ses_one', displayTitle: 'first task', updatedAt: todayAt(2) }])
  tap('j')
  dragOnto(boardBody(), '  (ses_one)  ')
  assert.equal(toastText(), expectedLabel('pinDone'), 'the words around the id do not hide it')
  tap('Escape')
})

check('a row that carries its name instead of its id still lands', () => {
  seed([{ id: 'ses_two', displayTitle: 'second task', updatedAt: todayAt(2) }])
  tap('j')
  dragOnto(boardBody(), 'second task')
  assert.equal(toastText(), expectedLabel('pinDone'), 'the name is the other thing a row can carry')
  tap('Escape')
})

await checkAsync('a notice never lands below the window', async () => {
  seedVisible()
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' }, REASONING)
  // A box measured before the page it belonged to was replaced: its top is past
  // the bottom of the window, which used to turn into a negative offset and put
  // the line under the screen.
  editor.__rect = { top: 2400, left: 300, width: 600, height: 160, right: 900, bottom: 2560 }
  tap('q')
  await flush()
  const host = toastHost()
  assert.ok(host, 'the notice is still on the page')
  assert.equal(host.style.bottom, 'calc(100vh - 12px)', 'and it keeps its margin instead of leaving the window')
})

check('a thought filed under a conversation is one line, and the newest sits on top', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const fileOne = (text) => {
    fireOn(writeCardButton(), 'click', { type: 'click' })
    typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), text)
    fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
    aimAt(cardsIn(boardBlock('dsh-vim'))[0])
    pressForDrag(looseCards()[0].children[0], 10, 10)
    dragTo(300, 200)
    resetHitTest()
  }
  fileOne('先写的一句')
  fileOne('后写的一句')
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(held.length, 2, 'both thoughts are filed under the conversation')
  assert.equal(held[0].__attrs['data-compact'], 'true', 'a filed thought is drawn as one line')
  assert.equal(Boolean(boardSeat(held[0], 'looseText')), false, 'with no body line spent on it')
  assert.equal(String(boardSeat(held[0], 'looseTitle').textContent), '后写的一句', 'the newest filing sits on top')
  // The rest of the card's verbs live behind the ⋯. The two filings above left
  // the hand mid-carry, and a click straight after a drag is that drag's
  // leftover rather than a request, so the mark is pressed before it is
  // clicked — the same idiom every other mark on the board is tapped with.
  tapMark(boardSeat(held[0], 'cardMenuOpen'))
  const menu = boardSeat(held[0], 'ideaMenu')
  assert.equal(Boolean(menu), true, 'the ⋯ opens its own menu')
  assert.equal(Boolean(boardSeat(menu, 'ideaMenuOpen')), true, 'with a way to the whole note')
  // Writing the two thoughts left the caret in a card's field, and the board
  // withholds its keys from a field while one is being typed into: the page has
  // to have the keyboard back before Escape can mean "put this menu away".
  fakeDocument.activeElement = body
  tap('Escape')
  // The press was made on the paint before this one, so what Escape is asked
  // about is the board itself: the menu is gone from it, and it is still up.
  assert.equal(Boolean(boardSeat(boardBlock('dsh-vim'), 'ideaMenu')), false, 'and Escape puts it away without closing the board')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'the board itself stays up')
  tap('Escape')
})

check('the 投入 button pastes the thought and leaves a finished trace', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '把这句话发过去')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  // The drop just above left the hand mid-carry, so the mark is pressed before
  // it is clicked: a click straight after a drag belongs to that drag.
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(pasted && pasted.command, 'insertText', 'the words are pasted as typing')
  assert.equal(pasted && pasted.text, '把这句话发过去', "the thought's own words")
  assert.equal(boardDoc().cards[0].done, true, 'and the card is marked delivered')
  assert.equal(boardDoc().cards[0].link, 'target', 'still tied to where it went')
})

check('a conversation is sorted across its panel by dragging it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['a', 'b'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: todayAt(3) },
    { id: 'b', displayTitle: 'b', updatedAt: todayAt(2) },
  ])
  tap('j')
  const block = boardBlock('dsh-vim')
  const body = boardSeat(block, 'blockBody')
  body.__rect = { top: 100, left: 0, width: 900, height: 600, right: 900, bottom: 700 }
  // The panel is the boundary's own place when the body cannot be measured.
  block.__rect = { top: 60, left: 0, width: 920, height: 700, right: 920, bottom: 760 }
  const columns = boardSeat(block, 'blockColumns').children
  columns.forEach((column, at) => {
    column.__rect = { top: 120, left: at * 292, width: 280, height: 300, right: at * 292 + 280, bottom: 420 }
  })
  assert.deepEqual(boardDoc().order.w1, ['a', 'b'], 'the panel starts in the order it was drawn in')
  // Take the second conversation past the first one's middle, then let go.
  pressForDrag(cardsIn(columns[1])[0], 400, 200)
  // Letting go asks the page what is under the hand, so the hit test is pointed
  // at the column the conversation is being taken to.
  aimAt(columns[0])
  dragTo(40, 200)
  assert.deepEqual(boardDoc().order.w1, ['b', 'a'], 'the order the hand chose is written down')
  tap('Escape')
})

/**
 * The conversations a panel draws as columns, in the order it draws them.
 * @param {object} block - the panel.
 * @returns {Array<string>} session ids.
 */
function drawnColumns(block) {
  const grid = boardSeat(block, 'blockColumns')
  if (!grid) return []
  return grid.children
    .filter((node) => node.__attrs && node.__attrs['data-column'] !== undefined)
    .map((node) => String(node.__attrs['data-column']))
}

check('the warm run keeps the panel\'s own order, however recently a card moved', () => {
  // Mid-afternoon, so "three hours ago" is earlier today whatever the hour the
  // suite happens to run at. A check about warm and cold is a check about one
  // day.
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  now = midnight.getTime() + 15 * HOUR
  const first = [
    { id: 'q', displayTitle: 'q', updatedAt: ago(1) },
    { id: 's', displayTitle: 's', updatedAt: ago(2) },
    { id: 'p', displayTitle: 'p', updatedAt: ago(4) },
    { id: 'r', displayTitle: 'r', updatedAt: ago(5) },
    { id: 't', displayTitle: 't', updatedAt: ago(6) },
  ]
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['q', 's', 'p', 'r', 't'] }])
  seed(first)
  tap('j')
  assert.deepEqual(drawnColumns(boardBlock('dsh-vim')), ['q', 's', 'p', 'r', 't'],
    'the warm two lead in the order the panel wrote down')
  tap('Escape')
  // s is now the newest card on the panel. A sort by when a card last moved
  // would stand it first; the page the reader already learned does not move.
  seed([
    { id: 'q', displayTitle: 'q', updatedAt: ago(2) },
    { id: 's', displayTitle: 's', updatedAt: ago(1) },
    { id: 'p', displayTitle: 'p', updatedAt: ago(4) },
    { id: 'r', displayTitle: 'r', updatedAt: ago(5) },
    { id: 't', displayTitle: 't', updatedAt: ago(6) },
  ])
  tap('j')
  assert.deepEqual(drawnColumns(boardBlock('dsh-vim')), ['q', 's', 'p', 'r', 't'],
    'the same five read in the same order, and nothing moved because a clock did')
  tap('Escape')
  now = was
})

check('a conversation that arrives later is appended, not seated by when it arrived', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  now = midnight.getTime() + 15 * HOUR
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['p', 'q'] }])
  seed([
    { id: 'p', displayTitle: 'p', updatedAt: ago(1) },
    { id: 'q', displayTitle: 'q', updatedAt: ago(2) },
  ])
  tap('j')
  const before = drawnColumns(boardBlock('dsh-vim'))
  tap('Escape')
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['p', 'q', 'u'] }])
  seed([
    { id: 'p', displayTitle: 'p', updatedAt: ago(1) },
    { id: 'q', displayTitle: 'q', updatedAt: ago(2) },
    { id: 'u', displayTitle: 'u', updatedAt: ago(0.5) },
  ])
  tap('j')
  assert.deepEqual(drawnColumns(boardBlock('dsh-vim')), before.concat(['u']),
    'the new conversation takes the end, and the ones already there keep their places')
  tap('Escape')
  now = was
})

check('a sort across a wrapped panel reads the row the hand is in', () => {
  const was = now
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  now = midnight.getTime() + 15 * HOUR
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['p', 'q', 'r', 's', 't'] }])
  seed([
    { id: 'p', displayTitle: 'p', updatedAt: ago(4) },
    { id: 'q', displayTitle: 'q', updatedAt: ago(5) },
    { id: 'r', displayTitle: 'r', updatedAt: ago(6) },
    { id: 's', displayTitle: 's', updatedAt: ago(7) },
    { id: 't', displayTitle: 't', updatedAt: ago(8) },
  ])
  tap('j')
  const block = boardBlock('dsh-vim')
  const before = drawnColumns(block)
  assert.equal(before.length, 5, 'five cold conversations are three columns over two rows')
  block.__rect = { top: 60, left: 0, width: 920, height: 900, right: 920, bottom: 960 }
  // The body is the older boundary, kept measurable so the check also says what
  // the sort used to do with the page.
  const body = boardSeat(block, 'blockBody')
  if (body) body.__rect = { top: 100, left: 0, width: 900, height: 800, right: 900, bottom: 900 }
  const columns = boardSeat(block, 'blockColumns').children
  columns.forEach((column, at) => {
    const row = at < 3 ? 0 : 1
    const col = at < 3 ? at : at - 3
    column.__rect = {
      top: 120 + row * 320,
      left: col * 292,
      width: 280,
      height: 300,
      right: col * 292 + 280,
      bottom: 420 + row * 320,
    }
  })
  // Take the first conversation down into the second row, between the fourth
  // and the fifth. The hand is beside the fourth card, not below the second one,
  // so p takes the hole after it instead of the first row's first hole.
  pressForDrag(cardsIn(columns[0])[0], 100, 200)
  dragTo(300, 500)
  assert.deepEqual(boardDoc().order.w1,
    [before[1], before[2], before[3], before[0], before[4]],
    'the hand was beside the second row, and the order says so')
  tap('Escape')
  now = was
})

check('a goal keeps its conversations while their thoughts are put away', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '一条想法')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  assert.ok(boardSeat(boardBlock('dsh-vim'), 'cardStack'), 'the thought sits under the conversation')
  tapMark(boardSeat(boardBlock('dsh-vim'), 'blockIdeas'))
  assert.equal(boardSeat(boardBlock('dsh-vim'), 'cardStack'), null, 'the switch puts every thought away')
  assert.equal(boardDoc().blocks.w1.ideas, false, 'and the choice is written down')
  assert.equal(cardsIn(boardBlock('dsh-vim')).length, 1, 'while the conversation stays')
  tap('Escape')
  tap('j')
  assert.equal(boardSeat(boardBlock('dsh-vim'), 'cardStack'), null, 'the reload keeps them away')
  tapMark(boardSeat(boardBlock('dsh-vim'), 'blockIdeas'))
  assert.ok(boardSeat(boardBlock('dsh-vim'), 'cardStack'), 'and one press brings them back')
  tap('Escape')
})

check('an opened thought grows to the whole of what it says', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const title = boardSeat(looseCards()[0], 'cardTitleInput')
  typeIn(title, '长句')
  pressIn(title, 'Enter')
  const lines = []
  for (let at = 1; at <= 14; at++) lines.push('第' + at + '行')
  typeIn(boardSeat(looseCards()[0], 'cardText'), lines.join(String.fromCharCode(10)))
  fireOn(boardSeat(looseCards()[0], 'cardText'), 'blur', { type: 'blur' })
  tapMark(boardSeat(looseCards()[0], 'looseText'))
  const editor = boardSeat(looseCards()[0], 'cardText')
  assert.ok(editor, 'the field is open')
  assert.equal(Number(editor.getAttribute('rows')), 14, 'all fourteen lines are in the field')
  assert.equal(/px$/.test(String(editor.style.maxHeight || '')), false, 'and nothing clips it')
  tap('Escape')
})

check('a locked title survives a hand-over and refuses a rename', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  tapMark(boardSeat(boardCard('target'), 'cardLock'))
  assert.equal(boardDoc().locks.target, true, 'the lock is written down')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '修个 bug')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  assert.equal(pasted && pasted.text, '修个 bug', 'the words still land in the box')
  assert.equal(renames.calls.length, 0, 'but a locked title is never renamed')
  // Handing the words over opens the conversation, which puts the board away:
  // the press that refuses a rename has to come back to the card it is about.
  tap('j')
  const menuMark = boardSeat(boardCard('target'), 'cardMenuOpen')
  assert.ok(menuMark, 'the locked card still carries its menu mark')
  tapMark(menuMark)
  const renameItem = boardSeat(boardCard('target'), 'cardRenameOpen')
  assert.ok(renameItem, 'the menu is up on a locked card too')
  tapMark(renameItem)
  assert.equal(boardSeat(boardCard('target'), 'cardRename'), null, 'no field opens on a locked title')
  assert.equal(toastText(), expectedLabel('boardCardLocked'), 'and the press says why')
  tap('Escape')
})

check('escape puts the card menu away and leaves the board up', () => {
  seed([{ id: 'a', displayTitle: 'a task', updatedAt: todayAt(1) }])
  tap('j')
  const card = cardsIn(boardBlock(expectedLabel('boardInbox')))[0]
  tapMark(boardSeat(card, 'cardMenuOpen'))
  assert.ok(boardSeat(boardCard('a'), 'cardRenameOpen'), 'the menu is up')
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.board().open, true, 'escape closes the menu, not the board')
  assert.equal(boardSeat(boardCard('a'), 'cardRenameOpen'), null, 'and the menu leaves with it')
  assert.equal(
    boardSeat(boardCard('a'), 'cardMenuOpen').__attrs['aria-expanded'],
    'false',
    'so the mark says it is closed'
  )
  tap('Escape')
})

check('finished thoughts are counted after three, and unfold on a press', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  const fileDone = (text) => {
    fireOn(writeCardButton(), 'click', { type: 'click' })
    typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), text)
    fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
    aimAt(cardsIn(boardBlock('dsh-vim'))[0])
    pressForDrag(looseCards()[0].children[0], 10, 10)
    dragTo(300, 200)
    resetHitTest()
    const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
    const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
    tapMark(boardSeat(held, 'cardDoneToggle'))
  }
  for (let at = 1; at <= 5; at++) fileDone('完成 ' + at)
  const stackNow = () => boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const drawn = () => stackNow().children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  assert.equal(drawn().length, 3, 'only three finished thoughts are drawn')
  const more = boardSeat(stackNow(), 'cardDoneMore')
  assert.ok(more, 'with a count for the rest')
  assert.equal(String(more.textContent), expectedLabel('boardDoneMore') + ' 2 ' + expectedLabel('boardDoneMoreUnit'))
  tapMark(more)
  assert.equal(drawn().length, 5, 'one press shows them all')
  tapMark(boardSeat(stackNow(), 'cardDoneMore'))
  assert.equal(drawn().length, 3, 'and the same press folds them again')
  tap('Escape')
})

check('a thought handed into a box already holding words starts a new paragraph', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '第二段')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  aimAt(cardsIn(boardBlock('dsh-vim'))[0])
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  let pasted = null
  fakeDocument.execCommand = (command, _showUI, text) => {
    pasted = { command, text }
    return true
  }
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const held = stack.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')[0]
  tapMark(boardSeat(held, 'cardDeliver'))
  // The fake host's box is always empty, so the blank line this path adds when a
  // reader has already written something cannot be observed here; the words
  // landing is what this check can see, and the break is one branch beside it.
  assert.equal(pasted && pasted.command, 'insertText', 'the words land in the box')
  assert.equal(String(pasted && pasted.text).slice(-3), '第二段', 'and they are the card\'s own')
})

/** Every line the journal holds, oldest first, read straight out of the fake database. */
function journalLines() {
  const db = fakeDatabases.get('dsh-vim-journal')
  if (!db) return []
  const entry = db.stores.get('events')
  if (!entry) return []
  return [...entry.records.values()].sort((left, right) => String(left.k).localeCompare(String(right.k)))
}

check('a thought keeps the moment it was written, and the moment it was dealt with', () => {
  registry.publish([], [])
  seed([])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '先想清楚再动手')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  const written = boardDoc().cards[0]
  assert.ok(written.w > 0, 'the card remembers when it was written')
  assert.equal(written.d, 0, 'and has no done moment yet')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  const after = boardDoc().cards[0]
  assert.ok(after.d > 0, 'dealing with it stamps the second clock')
  assert.equal(after.w, written.w, 'and leaves the first one alone')
  fireOn(boardSeat(looseCards()[0], 'cardDoneToggle'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(boardDoc().cards[0].d, 0, 'taking the mark back takes the moment with it')
  tap('Escape')
})

await checkAsync('the morning after, the day that ended is read back once', async () => {
  registry.publish([], [])
  seed([])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '给重试加个幂等键')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  await flush()
  // Read by its words rather than by its count: the journal is a database and
  // its writes land a microtask later, so lines other checks queued can still
  // be draining into it when this one starts.
  const written = journalLines().filter((line) => line.kind === 'note/written'
    && line.text === '给重试加个幂等键')
  assert.equal(written.length, 1, 'writing a thought leaves one line, carrying its words')

  tap('Escape')
  clock.jump(24 * HOUR)
  await flush()
  tap('j')
  await flush()
  const seal = boardSeat(boardPanel(), 'boardSeal')
  assert.ok(seal, 'the day that ended is shown when the board comes back')
  assert.ok(String(boardSeat(seal, 'sealDate').textContent).length > 4, 'under its own date')
  assert.ok(String(boardSeat(seal, 'sealLine').textContent).includes(expectedLabel('boardSealWritten')),
    'counting the thoughts it recorded')
  assert.ok(String(boardSeat(seal, 'sealLeft').textContent).includes(expectedLabel('boardSealWaiting')),
    'and saying what the desk still owes')
  tap('Enter')
  assert.equal(boardSeat(boardPanel(), 'boardSeal'), null, 'and one key puts it away')
  tap('Escape')
  tap('j')
  await flush()
  assert.equal(boardSeat(boardPanel(), 'boardSeal'), null, 'it is not shown a second time')
  tap('Escape')
})

await checkAsync('a sentence can be found across the pages', async () => {
  registry.publish([], [])
  seed([])
  tap('j')
  fireOn(writeCardButton(), 'click', { type: 'click' })
  typeIn(boardSeat(looseCards()[0], 'cardTitleInput'), '灰度先放百分之一')
  fireOn(boardSeat(looseCards()[0], 'cardTitleInput'), 'blur', { type: 'blur' })
  await flush()
  tap('Escape')
  clock.jump(24 * HOUR)
  await flush()
  tap('j')
  await flush()
  if (boardSeat(boardPanel(), 'boardSeal')) tap('Enter')
  assert.equal(fakeWindow.__dshVim.historyPanel(true), true, 'the history opens')
  await flush()
  const field = boardSeat(boardPanel(), 'historySearch')
  assert.ok(field, 'with a line to search in')
  field.value = '灰度'
  fireOn(field, 'input', { type: 'input' })
  for (let round = 0; round < 6; round++) await flush()
  const hit = boardSeat(boardPanel(), 'historyHit')
  assert.ok(hit, 'the page it was written on comes back')
  assert.ok(String(hit.textContent || '').includes('灰度'), 'with the words it was found by')
  fakeWindow.__dshVim.historyPanel(false)
  tap('Escape')
})


// --- entry anchor: where an opened conversation starts reading ---------------

/**
 * Put one flow row on screen, the way the chat renders it: a shell-tagged row
 * inside the conversation's own body, at a measured place in a scrollport
 * parked at its floor.
 *
 * The geometry is written as the browser would report it at that floor, so the
 * plugin's anchor arithmetic is exercised against real coordinates rather than
 * a row that merely exists.
 * @param {object} [options] - `{ kind, session, scrollHeight, clientHeight, top, height }`.
 * @returns {object} the row.
 */
function arriveInputRow(options = {}) {
  const height = options.height ?? 120
  const top = options.top ?? 380
  const scrollerHeight = options.clientHeight ?? 800
  const content = options.scrollHeight ?? 5000
  transcript.scrollHeight = content
  transcript.clientHeight = scrollerHeight
  transcript.__rect = { top: 100, left: 0, width: 900, height: scrollerHeight, right: 900, bottom: 100 + scrollerHeight }
  transcript.scrollTop = options.scrollTop ?? content - scrollerHeight
  transcript.setAttribute('data-conversation-session', options.session ?? 's1')
  const row = el({ tag: 'DIV', parent: transcript })
  row.setAttribute('data-chat-flow-kind', options.kind ?? 'user')
  row.__rect = { top, left: 0, width: 900, height, right: 900, bottom: top + height }
  transcript.appendChild(row)
  arrivedRows.push(row)
  return row
}

check('a conversation opened at its tail starts at the last thing the reader wrote', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  currentBinding.open('s1')
  clock.advance(80)
  // The prompt's top is 6000 in the content and the answer runs to 9000, so
  // the anchor is within the scrollport's range: 16px of air above the message.
  assert.equal(transcript.scrollTop, 5984, 'the last prompt sits at the top of the viewport')
})

check('a conversation the shell restored mid-answer keeps the position it saved', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', top: 380, height: 120, scrollTop: 1000 })
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 1000, 'the reader\'s saved place outranks an arrival anchor')
})

check('a turn still in flight is read from its end, not anchored to its prompt', () => {
  statusFeed.put('s1', { running: true })
  arriveInputRow({ session: 's1', top: 380, height: 120 })
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 4200, 'the live tail stays where the shell put it')
})

check('a prompt taller than the screen is anchored by its end, with its answer in reach', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  // A 1100px prompt at content y=3600, scrolled out of a viewport whose floor
  // is 8200: anchoring its top would leave the answer entirely off screen.
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -4500, height: 1100 })
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 4636, 'the prompt\'s last line and a line of context stand above the answer')
})

check('the same conversation arriving again is not re-anchored', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 5984)
  // A status tick that republishes the same main view is not a new arrival.
  transcript.scrollTop = 8200
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 8200, 'the arrival already answered stays answered')
})

check('the wheel before the page settles keeps the position the reader made', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  currentBinding.open('s1')
  clock.advance(16)
  wheel()
  clock.advance(200)
  assert.equal(transcript.scrollTop, 8200, 'a reading gesture outranks an anchor nobody asked for')
})

check('leaving the conversation and coming back makes it an arrival again', () => {
  statusFeed.put('s1', { running: false, completionUnread: true })
  arriveInputRow({ session: 's1', scrollHeight: 9000, top: -2100, height: 120 })
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 5984)
  currentBinding.open('')
  transcript.scrollTop = 8200
  currentBinding.open('s1')
  clock.advance(80)
  assert.equal(transcript.scrollTop, 5984, 'a second visit is read from the same boundary')
})

console.log(`\nselftest: ${checks} checks passed`)
// Attribution, on the way out either way: an OOM or a failed assertion should
// still say which check was the greediest.
process.on('exit', () => {
  if (!peak.label) return
  console.log(`peak heap: ${Math.round(peak.heap / 1048576)} MB, left by "${peak.label}"`)
})
