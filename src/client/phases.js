/**
 * The stage a conversation is marked with. Plugin-owned, persisted beside
 * the preferences, and deliberately not read from the host: it is a note to
 * oneself, not a fact about the session.
 */
import { PHASES, PHASES_KEY } from './constants.js'

/**
 * The stage of each conversation, as this plugin's own idea of it.
 *
 * This is the stage module proper, and it is deliberately self-contained:
 * it holds `id -> phase` (one of PHASES), persists it, and answers reads.
 * It knows nothing of where a stage came from and nothing of the chip that
 * shows it. A SOURCE writes a stage in (today the only source is a hand
 * press, see the window's stage key and the chip click; a goal projection
 * or an agent-written mark could be added later as another source without
 * touching this ledger), and the chip reads one out — the two never meet.
 *
 * Persisted under PHASES_KEY so a stage survives a page reload, a plugin
 * reload, and a renderer restart, the same promise the run clock keeps.
 */
var PHASES_MODEL = makePhaseLedger()

/**
 * The ledger behind `PHASES_MODEL`, and the only thing that touches the
 * store. Read through `get`, write through `set`, `cycle`, and `clear`;
 * `load()` reads the previous page's map back once per activation.
 *
 * A value outside PHASES is treated as no stage: a hand-edited store, or a
 * vocabulary that shrank between versions, can never make a row show a
 * stage this build does not know how to label.
 * @returns {object} the ledger.
 */
function makePhaseLedger() {
  /** id -> phase; only PHASES members are ever stored. */
  var map = Object.create(null)
  /** The last serialized map written, so an unchanged one is not rewritten. */
  var written = ''

  /** Write the map back; a storage failure is not fatal. */
  function persist() {
    var serialized = JSON.stringify(map)
    if (serialized === written) return
    written = serialized
    try {
      window.localStorage.setItem(PHASES_KEY, serialized)
    } catch (error) {
      console.warn('[dsh-vim] could not persist stages', error)
    }
  }

  return {
    /**
     * The stage of one conversation, or '' when none is marked.
     * @param {string} id - session id.
     * @returns {string} a PHASES member, or '' for idle.
     */
    get(id) {
      if (!id) return ''
      var value = map[id]
      return PHASES.indexOf(value) >= 0 ? value : ''
    },
    /**
     * Set one conversation's stage. A value outside PHASES clears it, so a
     * source can pass '' or 'idle' to mean "no stage".
     * @param {string} id - session id.
     * @param {string} phase - a PHASES member, or anything else to clear.
     * @returns {string} the stage now in effect ('' when cleared).
     */
    set(id, phase) {
      if (!id) return ''
      if (PHASES.indexOf(phase) < 0) {
        if (map[id] !== undefined) {
          delete map[id]
          persist()
        }
        return ''
      }
      if (map[id] !== phase) {
        map[id] = phase
        persist()
      }
      return phase
    },
    /**
     * Advance one conversation to the next stage in the cycle. Off the last
     * member it lands on idle (cleared); off idle it lands on the first.
     * @param {string} id - session id.
     * @returns {string} the stage now in effect ('' when it cycled to idle).
     */
    cycle(id) {
      if (!id) return ''
      var current = this.get(id)
      var at = PHASES.indexOf(current)
      // -1 (idle) -> 0; last -> length (one past the end) -> idle.
      var nextAt = at + 1
      return this.set(id, nextAt >= PHASES.length ? '' : PHASES[nextAt])
    },
    /** Drop one conversation's stage. */
    clear(id) {
      return this.set(id, '')
    },
    /** The whole map as a plain object, for the debug surface. */
    all() {
      var out = {}
      for (var id in map) {
        if (Object.prototype.hasOwnProperty.call(map, id)) out[id] = map[id]
      }
      return out
    },
    /** Drop every stage (debug reset). */
    reset() {
      map = Object.create(null)
      persist()
    },
    /** Read the previous page's map back, keeping only known PHASES. */
    load() {
      var parsed = null
      try {
        var raw = window.localStorage.getItem(PHASES_KEY)
        parsed = raw ? JSON.parse(raw) : null
      } catch (error) {
        parsed = null
      }
      map = Object.create(null)
      if (parsed && typeof parsed === 'object') {
        for (var id in parsed) {
          if (!Object.prototype.hasOwnProperty.call(parsed, id)) continue
          if (PHASES.indexOf(parsed[id]) >= 0) map[id] = parsed[id]
        }
      }
      written = ''
      persist()
    },
  }
}



export { PHASES_MODEL }
