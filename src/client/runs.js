/**
 * When each turn in flight was seen to start: a watch on the shell's status
 * feed for the life of the page, and the stamps a previous page left behind.
 * It owns no window; the rows that read a clock ask it for the start.
 */
import { serviceOf, statusOf, taskCtx } from './sessions.js'
import { paletteText } from './strings.js'

/**
 * When the turn in flight in each conversation was seen to start.
 *
 * The shell publishes no start time: a status entry is `{ running,
 * pendingInteraction, completionUnread }` and a session summary carries no
 * stamp at all, so "how long has this been going?" can only come from
 * watching the transitions. That is also why the watch runs for the life of
 * the page rather than only while the window is open — a stamp taken when
 * the user presses the key would show a ten-minute turn as if it had just
 * begun.
 *
 * A turn that was already in flight when the watch arrived keeps no stamp of
 * its own — but the page it arrives on may have left one behind (see
 * `RUNS_KEY`), and a turn that survived a reload is the same turn: the host
 * keeps running it while the client is rebuilt around it. Adopting that
 * stamp is not inventing a clock, it is reading back the one this plugin
 * already took. With no stamp to read back, the row shows the plain status
 * until the next turn starts, which is the honest answer.
 */
var RUNS = makeRunLedger()

/**
 * The ledger behind `RUNS`, and the only thing that touches it.
 *
 * Keeping it here means every question about a running turn is answered in
 * one voice: `since(id)` for when one started, `note(id, live)` when the
 * status feed disagrees with what we last heard, and `forget()` when the
 * page lets go of the whole thing. The watch is ours to arm and to drop, so
 * nothing outside has to know there is a subscription in here at all.
 *
 * @returns {object} the ledger.
 */
function makeRunLedger() {
  /** id -> { live, since }; `since` is 0 until a start is seen. */
  var seen = Object.create(null)
  /** Stamps left behind by an earlier page, read once per activation. */
  var stored = Object.create(null)
  /** When this page's ledger was read; stamps are only adopted while fresh. */
  var loadedAt = 0
  /** The last map written, so an unchanged one is not rewritten. */
  var written = ''
  /** Tear-down for the always-on status watch, or null while unwatched. */
  var off = null

  /** Write the ledger back, so the next page can pick it up where this one left it. */
  function persist() {
    var serialized = JSON.stringify(stored)
    if (serialized === written) return
    written = serialized
    try {
      window.localStorage.setItem(RUNS_KEY, serialized)
    } catch (error) {
      console.warn('[dsh-vim] could not persist the run ledger', error)
    }
  }

  return {
    /** The watch is already armed; arming it twice would answer every change twice. */
    watching() {
      return !!off
    },
    arm(stop) {
      off = stop
    },
    /**
     * Fold one status entry in.
     *
     * Only a transition into flight is stamped, so a stamp always means
     * "the turn started here". A conversation first met already in flight
     * adopts the stamp an earlier page left, when this page is young enough
     * for that to still be the same turn; with nothing to adopt the start
     * stays unknown, and saying so by showing no clock beats a wrong one.
     */
    note(id, live) {
      if (!id) return
      var entry = seen[id]
      if (!entry) {
        seen[id] = { live: !!live, since: live ? this.adopt(id) : 0 }
        if (!live) this.drop(id)
        return
      }
      if (live === entry.live) return
      entry.live = live
      entry.since = live ? Date.now() : 0
      if (live) this.keep(id, entry.since)
      else this.drop(id)
    },
    /** Fold the whole status snapshot in, letting go of what it no longer carries. */
    sync(status, liveOf) {
      var snapshot = null
      try {
        snapshot = status.getSnapshot()
      } catch (error) {
        return
      }
      if (!snapshot || typeof snapshot.forEach !== 'function') return
      var present = Object.create(null)
      snapshot.forEach(function (entry, id) {
        present[id] = true
        this.note(id, liveOf(entry))
      }, this)
      this.release(function (id) {
        return !present[id]
      })
    },
    /** Read the stamps the previous page left, dropping ones too old to be this turn. */
    load() {
      var parsed = null
      try {
        var raw = window.localStorage.getItem(RUNS_KEY)
        parsed = raw ? JSON.parse(raw) : null
      } catch (error) {
        parsed = null
      }
      stored = Object.create(null)
      if (parsed && typeof parsed === 'object') {
        var now = Date.now()
        for (var id in parsed) {
          if (!Object.prototype.hasOwnProperty.call(parsed, id)) continue
          var since = Number(parsed[id])
          if (!isFinite(since) || since <= 0) continue
          if (now - since > RUN_STAMP_MAX_AGE_MS) continue
          stored[id] = since
        }
      }
      written = ''
      loadedAt = Date.now()
      persist()
    },
    /** A turn in flight in one conversation, as of `since`. */
    keep(id, since) {
      if (stored[id] === since) return
      stored[id] = since
      persist()
    },
    /** No turn in flight in one conversation any more. */
    drop(id) {
      if (stored[id] === undefined) return
      delete stored[id]
      persist()
    },
    /** The stamp an earlier page left for this conversation, if it could be this turn. */
    adopt(id) {
      var since = stored[id]
      if (!since) return 0
      var now = Date.now()
      if (now - loadedAt > RUN_ADOPT_WINDOW_MS) return 0
      return now - since > RUN_STAMP_MAX_AGE_MS ? 0 : since
    },
    /** When the turn in flight in one conversation was seen to start. */
    since(id) {
      var entry = seen[id]
      return entry && entry.live && entry.since ? entry.since : 0
    },
    /** Let go of every conversation the status source no longer carries. */
    release(gone) {
      for (var id in seen) {
        if (!Object.prototype.hasOwnProperty.call(seen, id)) continue
        if (!gone(id)) continue
        delete seen[id]
        this.drop(id)
      }
    },
    /** Stop watching, and forget every stamp this page took. */
    forget() {
      if (off) {
        try {
          off()
        } catch (error) {
          /* the host is going away; nothing left to unsubscribe from */
        }
        off = null
      }
      seen = Object.create(null)
    },
  }
}

/**
 * Where the run ledger survives a page load.
 *
 * The client can be rebuilt (a refresh, a plugin reload, the app restarting
 * the renderer) while the host keeps the turn running, and a clock that
 * silently restarts at zero on every reload answers "how long has this been
 * going?" with a wrong number. So the stamps live in storage next to the
 * settings — only for sessions a turn is actually in flight in, so the entry
 * is also a note that says "this turn was running the last time we looked".
 */
var RUNS_KEY = 'dsh-vim/runs/v1'

/**
 * Fold the shell's whole status snapshot into the ledger, and forget the
 * conversations the snapshot no longer carries.
 * @param {object} status - the `uiSession.sessionStatus` service.
 * @returns {void}
 */
/**
 * The conversations this page has watched run.
 *
 * A delivery is a transition, and a transition is only visible to a page
 * that saw the other side of it. A conversation already finished when the
 * page opened is not a turn that finished today, and the journal must not
 * say it was.
 */
var LIVE_SEEN = Object.create(null)

/**
 * The journal's note that a thread finished. The history subsystem owns the
 * journal; this module only knows that a completion is worth recording, so the
 * write is injected rather than imported.
 * @type {?Function}
 */
let deliveryHook = null

/**
 * Register what a finished thread is noted with.
 * @param {?Function} fn - called with the session id.
 * @returns {void}
 */
export function setDeliveryHook(fn) {
  deliveryHook = fn
}

/**
 * Note the turn ends: a conversation this page watched run, no longer running.
 *
 * The status chip says what a conversation is doing; this says when it stopped
 * doing it, which is the only thing a day can be counted by.
 * @param {object} status - the shell's session status service.
 * @returns {void}
 */
function noteDeliveries(status) {
  var snapshot = null
  try {
    snapshot = status.getSnapshot()
  } catch (error) {
    return
  }
  if (!snapshot || typeof snapshot.forEach !== 'function') return
  snapshot.forEach(function (entry, id) {
    if (!id) return
    var live = !!(entry && (entry.running === true
      || (entry.pendingInteraction && entry.pendingInteraction.kind)))
    if (live) {
      LIVE_SEEN[id] = true
      return
    }
    if (!LIVE_SEEN[id]) return
    delete LIVE_SEEN[id]
    // A turn that was stopped is not a turn that finished: the host says
    // which one this was, and only a completion it still calls unread is
    // a thread this day brought to an end.
    if (!entry || entry.completionUnread !== true) return
        if (deliveryHook) deliveryHook(id)
  })
}

function syncRuns(status) {
  RUNS.sync(status, function (entry) {
    return !!(entry && (entry.running === true || (entry.pendingInteraction && entry.pendingInteraction.kind)))
  })
  noteDeliveries(status)
}

/**
 * Follow the status source for the life of the page, so a turn is stamped
 * when it starts rather than when the window opens.
 *
 * The probe deliberately does not go through `taskServices`: its answer is
 * cached for the palette, and a host that has not published the service yet
 * must not cost the window itself anything. Arming is retried whenever the
 * window opens, so a late-arriving service still gets a watch.
 * @returns {void}
 */
function watchRuns() {
  if (RUNS.watching()) return
  var uiSession = serviceOf(taskCtx, 'uiSession')
  var status = uiSession && uiSession.sessionStatus
  if (!status || typeof status.getSnapshot !== 'function') return
  syncRuns(status)
  if (typeof status.subscribe !== 'function') return
  try {
    RUNS.arm(
      status.subscribe(function () {
        syncRuns(status)
      })
    )
  } catch (error) {
    RUNS.arm(null)
  }
}

/**
 * Read the stamps the previous page left behind, dropping the ones that are
 * too old to be about the turn running now.
 * @returns {void}
 */
function loadRunStamps() {
  RUNS.load()
}

/**
 * Stop watching, and forget every stamp the watch had taken.
 * @returns {void}
 */
function forgetRuns() {
  RUNS.forget()
}

/**
 * The moment the turn in flight in one conversation was seen to start.
 * @param {string} id - session id.
 * @returns {number} epoch milliseconds, or 0 when the start was never seen.
 */
function runSince(id) {
  return RUNS.since(id)
}

/**
 * How long a turn has been in flight, at minute resolution.
 *
 * Seconds are deliberately gone (see CLOCK_INTERVAL_MS): a number that
 * changes every time the reader looks at it is a number they are invited to
 * keep looking at. Under a whole minute there is no duration worth reading —
 * an empty answer, which leaves the chip saying the plain state, exactly as
 * it does for a turn whose start was never seen. Nothing is invented, and
 * the first minute of a turn is quiet.
 * @param {number} ms - milliseconds since the turn was seen to start.
 * @returns {string} the duration, or '' while it is under a minute.
 */
function elapsedText(ms) {
  var total = Math.max(0, Math.floor(ms / 60000))
  if (!total) return ''
  var minutes = total % 60
  var hours = Math.floor(total / 60)
  if (hours) return hours + paletteText('elapsedHours') + minutes + paletteText('elapsedMinutes')
  return minutes + paletteText('elapsedMinutes')
}

/**
 * Which attention block a conversation belongs to, or null for the plain
 * browsing block.
 *
 * This is the one axis the top of the window is cut along, and it is a
 * different question from "which folder is this in" or "how new is this".
 * The three answers are:
 *
 * - `mine` — the ball is in the reader's court. A turn parked on an
 *   approval, a plan review or a question, and a run that finished with
 *   nobody having looked at it yet. The two are the same fact from the
 *   reader's side (something of theirs is waiting on them) and different
 *   only in what they owe it: a decision, or a look.
 * - `live` — a turn is in flight and needs nobody. It is here so that it can
 *   be seen without being watched, and so that it is not mistaken for a
 *   conversation that is simply sitting there.
 * - `null` — nothing is happening and nothing is owed.
 *
 * `statusOf` already carries the precedence (waiting outranks running
 * outranks just-finished), so this reads that one answer rather than
 * rebuilding it.
 * @param {object} summary - session summary.
 * @returns {string|null} 'mine', 'live', or null.
 */
function attentionOf(summary) {
  var status = statusOf(summary)
  if (!status) return null
  if (status.key === 'running') return 'live'
  return 'mine'
}


/**
 * A stamp older than this is not adopted.
 *
 * Storage can only say "a turn in this conversation was running when this
 * page last looked". If the client was away long enough for that turn to end
 * and another to start — a page closed for the night, the host finishing the
 * first turn and someone starting a second from another client — the stamp
 * belongs to the wrong turn, and using it would show hours that never
 * happened. The cap is generous enough for any turn worth watching and small
 * enough that yesterday's cannot be mistaken for today's.
 */
var RUN_STAMP_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * How long after a page loads a stored stamp still counts as its own.
 *
 * The stamp is only there to bridge a rebuild: the page goes away and comes
 * back within moments while the host keeps the turn running. A page that has
 * been up for minutes is a different case — a conversation it has not met
 * before, starting a turn now, is not the turn that stamp was taken for, and
 * the clock would show time that never passed. The window covers a slow
 * connection publishing the first status snapshot; nothing else needs it.
 */
var RUN_ADOPT_WINDOW_MS = 60 * 1000

export { RUNS, syncRuns, watchRuns, loadRunStamps, forgetRuns, runSince, elapsedText, attentionOf }
