/**
 * Preferences: the live settings object, its shipped defaults, and every
 * accepted change. The store owns writing; other modules import `settings`
 * read-only and subscribe rather than mutating a copy.
 */
import { DEFAULTS, KEY_GROUPS, MODEL_SEATS, STORAGE_KEY, LIMITS, SEND_MODES, PLACES, NUMERIC_SEATS, BOOL_SEATS } from './constants.js'

/** Live preferences; replaced wholesale on every accepted change. */
export let settings = null

/** Subscribers re-render the settings page when preferences change. */
var watchers = []

/**
 * Shipped defaults as a fresh object, derived from DEFAULTS so a new
 * preference cannot be added to one and forgotten in the other.
 *
 * A list is copied rather than aliased: the one structured seat here is an
 * array, and a settings object that shared the shipped one would let an edit
 * in the settings page rewrite the default every later reset starts from.
 * @returns {object} a mutable copy.
 */
function defaults() {
  var out = {}
  for (var field in DEFAULTS) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, field)) continue
    out[field] = Array.isArray(DEFAULTS[field]) ? DEFAULTS[field].slice() : DEFAULTS[field]
  }
  return out
}

/** Current preferences as a fresh object. */
function copy() {
  var next = {}
  for (var field in DEFAULTS) {
    next[field] = settings[field]
  }
  return next
}

/**
 * The named keys a seat may take. `Enter` is here because a list you cannot
 * confirm with the keyboard is a trap, and `Tab` because the model window's
 * level key ships as one — a named key that is the natural "next" gesture
 * for a row of choices. Anything else longer than one character (modifiers,
 * arrows, function keys, `Escape`) stays unboundable.
 */
var NAMED_KEYS = ['Enter', 'Tab']

/**
 * A single printable character, or one of `NAMED_KEYS`, is the only thing
 * worth binding; anything longer (modifiers, arrows, function keys, `Escape`)
 * is rejected.
 * @param {unknown} value - candidate key.
 * @returns {boolean} whether it may be bound.
 */
function isBindableKey(value) {
  if (typeof value !== 'string') return false
  if (value.length === 1) return true
  var lower = value.toLowerCase()
  for (var i = 0; i < NAMED_KEYS.length; i++) {
    if (NAMED_KEYS[i].toLowerCase() === lower) return true
  }
  return false
}

/**
 * Normalise a bound key to its stored form: lower case for characters,
 * canonical capitalisation for the named keys.
 * @param {string} key - the raw `KeyboardEvent.key`.
 * @returns {string} the stored form.
 */
function normalizeKey(key) {
  if (key.length === 1) return key.toLowerCase()
  var lower = key.toLowerCase()
  for (var i = 0; i < NAMED_KEYS.length; i++) {
    if (NAMED_KEYS[i].toLowerCase() === lower) return NAMED_KEYS[i]
  }
  return lower
}

/**
 * How a bound key reads in the settings box. A space is invisible in a box
 * of its own, so it gets its name; the named keys keep their canonical
 * spelling; everything else is upper-cased.
 * @param {string} value - the stored key.
 * @returns {string} the label.
 */
function keyLabel(value) {
  if (value === ' ') return 'Space'
  if (NAMED_KEYS.indexOf(value) >= 0) return value
  return String(value).toUpperCase()
}

/** Clamp a numeric preference to its accepted range. */
function clampNumber(value, spec, fallback) {
  var n = Number(value)
  if (!isFinite(n)) return fallback
  return Math.max(spec.min, Math.min(spec.max, Math.round(n)))
}

/**
 * The switchable models as a fresh list of `{provider, model}` pairs.
 *
 * Every entry is rebuilt rather than kept: the stored value may have been
 * hand-edited, and the pairs handed to a selection must not carry anything
 * the host never published. A model listed twice keeps its first place, so
 * a duplicated entry cannot make the key appear to skip one.
 * @param {unknown} value - the candidate list.
 * @returns {Array<{provider: string, model: string}>} the accepted pairs.
 */
function sanitizeFavorites(value) {
  if (!Array.isArray(value)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < value.length; i++) {
    var entry = value[i]
    if (!entry || typeof entry !== 'object') continue
    var provider = typeof entry.provider === 'string' ? entry.provider.trim() : ''
    var model = typeof entry.model === 'string' ? entry.model.trim() : ''
    if (provider === '' || model === '') continue
    var key = provider + '/' + model
    if (seen[key]) continue
    seen[key] = true
    out.push({ provider: provider, model: model })
  }
  return out
}

/** Persist the current preferences; storage failures are not fatal. */
function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn('[dsh-vim] could not persist settings', error)
  }
}

/**
 * The repaint the store cannot own: the task window and the model picker
 * redraw only while they are open. Registered once by the entry point, so
 * this module never reads window state it does not own.
 * @type {?Function}
 */
let repaint = null

/**
 * Register the repaint that follows an accepted change.
 * @param {?Function} fn - called after the change has been persisted.
 * @returns {void}
 */
export function setRepaint(fn) {
  repaint = fn
}

/** Notify the settings page that preferences changed. */
function announce() {
  for (var i = 0; i < watchers.length; i++) {
    try {
      watchers[i]()
    } catch (error) {
      console.error('[dsh-vim] settings watcher failed', error)
    }
  }
}

/**
 * Validate and apply one patch. Rejected patches leave preferences intact.
 * @param {object} patch - partial preferences.
 * @returns {string|null} 'conflict' when two seats collide, else null.
 */
function applyPatch(patch) {
  if (!patch || typeof patch !== 'object') return null
  var next = copy()
  for (var g = 0; g < KEY_GROUPS.length; g++) {
    var group = KEY_GROUPS[g]
    for (var i = 0; i < group.length; i++) {
      if (patch[group[i]] === undefined) continue
      if (!isBindableKey(patch[group[i]])) return 'conflict'
      next[group[i]] = normalizeKey(patch[group[i]])
    }
    for (var a = 0; a < group.length; a++) {
      for (var b = a + 1; b < group.length; b++) {
        if (next[group[a]] === next[group[b]]) return 'conflict'
      }
    }
  }
  for (var n = 0; n < NUMERIC_SEATS.length; n++) {
    var field = NUMERIC_SEATS[n]
    if (patch[field] !== undefined) {
      next[field] = clampNumber(patch[field], LIMITS[field], DEFAULTS[field])
    }
  }
  // The board and the task window are the two overlays, and one key cannot
  // open both. They live in different groups (the task window's keys are
  // dead while it is open, the board's is not), so the two seats are checked
  // against each other here.
  if (next.boardKey === next.paletteKey) return 'conflict'
  // The model window's own group, checked after the two above so a seat it
  // shares with them is already holding its new value.
  for (var s = 0; s < MODEL_SEATS.length; s++) {
    if (patch[MODEL_SEATS[s]] === undefined) continue
    if (!isBindableKey(patch[MODEL_SEATS[s]])) return 'conflict'
    next[MODEL_SEATS[s]] = normalizeKey(patch[MODEL_SEATS[s]])
  }
  for (var p = 0; p < MODEL_SEATS.length; p++) {
    for (var q = p + 1; q < MODEL_SEATS.length; q++) {
      if (next[MODEL_SEATS[p]] === next[MODEL_SEATS[q]]) return 'conflict'
    }
  }
  // The model window confirms with Enter whatever its seats are bound to —
  // that alias is the reason a list you can confirm with the keyboard is not
  // a trap. A level seat sitting on it would take the alias away and leave
  // the window with no confirm key at all, so it is refused.
  if (patch.modelLevelKey !== undefined && next.modelLevelKey === 'Enter') return 'conflict'
  if (patch.palettePlace !== undefined) {
    if (PLACES.indexOf(patch.palettePlace) < 0) return 'conflict'
    next.palettePlace = patch.palettePlace
  }
  if (patch.sendMode !== undefined) {
    if (SEND_MODES.indexOf(patch.sendMode) < 0) return 'conflict'
    next.sendMode = patch.sendMode
  }
  for (var b = 0; b < BOOL_SEATS.length; b++) {
    var seat = BOOL_SEATS[b]
    if (patch[seat] !== undefined) next[seat] = !!patch[seat]
  }
  if (patch.favorites !== undefined) next.favorites = sanitizeFavorites(patch.favorites)
  settings = next
  persist()
  announce()
  // The footer advertises the live bindings, so an open window has to
  // re-render when they change. The send hint does not need telling: it is
  // a component that subscribes to this same announce.
  if (repaint) repaint()
  return null
}

/**
 * The preferred key when it is free, else the first free letter.
 * @param {string} preferred - that seat's shipped default.
 * @param {object} taken - keys already in use, read as a set.
 * @returns {string} a free lower-cased key.
 */
function firstFree(preferred, taken) {
  if (!taken[preferred]) return preferred
  for (var code = 97; code <= 122; code++) {
    var letter = String.fromCharCode(code)
    if (!taken[letter]) return letter
  }
  return preferred
}

/**
 * Force each key group to be conflict-free. Groups are repaired back to
 * front, so the earlier seat in a group keeps whatever it has and a later
 * one falls back to its shipped default; two passes, because a fallback can
 * itself land on a key the seat before it just gave up.
 *
 * Only a hand-edited store can reach this with a real collision, since the
 * settings page refuses one.
 * @param {object} next - candidate preferences, repaired in place.
 * @returns {object} the same object.
 */
function repairKeys(next) {
  for (var g = 0; g < KEY_GROUPS.length; g++) {
    var group = KEY_GROUPS[g]
    for (var i = 0; i < group.length; i++) {
      if (!isBindableKey(next[group[i]])) next[group[i]] = DEFAULTS[group[i]]
    }
    for (var pass = 0; pass < 2; pass++) {
      for (var j = group.length - 1; j >= 0; j--) {
        var taken = {}
        for (var k = 0; k < group.length; k++) {
          if (k !== j) taken[next[group[k]]] = true
        }
        if (!taken[next[group[j]]]) continue
        next[group[j]] = firstFree(DEFAULTS[group[j]], taken)
      }
    }
  }
  // The two overlay keys are checked against each other last of all: a store
  // that had them collide would leave one of the windows unreachable. The
  // board is the younger seat, so it is the one that steps aside.
  if (next.boardKey === next.paletteKey) {
    var boardTaken = { [next.paletteKey]: true }
    for (var bg = 0; bg < KEY_GROUPS[0].length; bg++) boardTaken[next[KEY_GROUPS[0][bg]]] = true
    next.boardKey = firstFree(DEFAULTS.boardKey, boardTaken)
  }
  // The model window's group, repaired last: it draws its members from the
  // two groups above, so their own repairs have to have settled first.
  for (var m = 0; m < MODEL_SEATS.length; m++) {
    if (!isBindableKey(next[MODEL_SEATS[m]])) next[MODEL_SEATS[m]] = DEFAULTS[MODEL_SEATS[m]]
  }
  // The standing Enter alias is not a seat and cannot be given up, so a
  // stored level seat sitting on it is moved off before the group pass below.
  if (next.modelLevelKey === 'Enter') next.modelLevelKey = DEFAULTS.modelLevelKey
  for (var mp = 0; mp < 2; mp++) {
    for (var mj = MODEL_SEATS.length - 1; mj >= 0; mj--) {
      var mtaken = {}
      for (var mk = 0; mk < MODEL_SEATS.length; mk++) {
        if (mk !== mj) mtaken[next[MODEL_SEATS[mk]]] = true
      }
      if (!mtaken[next[MODEL_SEATS[mj]]]) continue
      next[MODEL_SEATS[mj]] = firstFree(DEFAULTS[MODEL_SEATS[mj]], mtaken)
    }
  }
  return next
}

/**
 * Move the archive seat into place for a store written before it existed.
 *
 * `g` used to be the switch seat's shipped default, and it is now the
 * archive seat's. A store from that era has no `paletteArchiveKey` at all,
 * so without this the old `g` would be read back onto the switch seat and
 * the new seat would collide with it — leaving the user with an archive key
 * they never chose and a switch key that no longer matches the docs.
 *
 * Two cases, and the distinction is the user's own intent:
 * - The switch seat is absent or still the old shipped `g`: the user never
 *   chose it, so it moves to its new default and `g` goes to archiving.
 * - The switch seat is something the user picked: their binding is left
 *   exactly as it is, and the archive seat takes the first free letter.
 * @param {object} parsed - the raw stored preferences.
 * @param {object} next - the candidate preferences, migrated in place.
 * @returns {object} the same object.
 */
function migrateArchiveSeat(parsed, next) {
  if (parsed.paletteArchiveKey !== undefined) return next
  if (parsed.paletteEnterKey === undefined || parsed.paletteEnterKey === 'g') {
    next.paletteEnterKey = DEFAULTS.paletteEnterKey
    next.paletteArchiveKey = DEFAULTS.paletteArchiveKey
    return next
  }
  var taken = {}
  for (var i = 0; i < KEY_GROUPS[1].length; i++) {
    if (KEY_GROUPS[1][i] !== 'paletteArchiveKey') taken[next[KEY_GROUPS[1][i]]] = true
  }
  next.paletteArchiveKey = firstFree(DEFAULTS.paletteArchiveKey, taken)
  return next
}

/** Read stored preferences over the defaults. */
function load() {
  settings = defaults()
  var raw = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    raw = null
  }
  if (!raw) return
  var parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn('[dsh-vim] ignoring malformed stored settings', error)
    return
  }
  if (!parsed || typeof parsed !== 'object') return
  var next = defaults()
  for (var field in next) {
    if (parsed[field] !== undefined) next[field] = parsed[field]
  }
  migrateArchiveSeat(parsed, next)
  for (var n = 0; n < NUMERIC_SEATS.length; n++) {
    var seat = NUMERIC_SEATS[n]
    next[seat] = clampNumber(next[seat], LIMITS[seat], DEFAULTS[seat])
  }
  if (PLACES.indexOf(next.palettePlace) < 0) next.palettePlace = DEFAULTS.palettePlace
  if (SEND_MODES.indexOf(next.sendMode) < 0) next.sendMode = DEFAULTS.sendMode
  // A stored value of anything other than `false` is "on": the shipped
  // default is on, so an absent or hand-edited value must not read as off.
  for (var b = 0; b < BOOL_SEATS.length; b++) {
    var seat = BOOL_SEATS[b]
    next[seat] = next[seat] !== false
  }
  next.favorites = sanitizeFavorites(next.favorites)
  settings = repairKeys(next)
  persist()
  announce()
}

/**
 * Subscribe to preference changes.
 * @param {Function} watcher - called after every accepted change.
 * @returns {Function} unsubscriber.
 */
function subscribe(watcher) {
  watchers.push(watcher)
  return function () {
    var i = watchers.indexOf(watcher)
    if (i >= 0) watchers.splice(i, 1)
  }
}

export { defaults, copy, isBindableKey, normalizeKey, keyLabel, clampNumber, sanitizeFavorites, applyPatch, repairKeys, load, subscribe }
