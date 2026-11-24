/**
 * Turn counts read out of the shell: a count lives behind a session scope
 * the host has to open, so the reads are queued, budgeted and remembered.
 * The window that asked supplies the repaint; nothing here paints.
 */
import { PEEK_CONCURRENCY, PEEK_SOURCE, PEEK_TIMEOUT_MS } from './constants.js'
import { taskServices } from './sessions.js'

/**
 * The turn counts this plugin has read out of the shell.
 *
 * A count cannot be asked for casually: the number lives behind a session
 * scope the shell has to open to answer, so asking costs a retain and
 * releasing it later. Keeping what we have already read is what lets a row
 * show its count without opening every conversation on the list again.
 *
 * Everything about that — what has been read, what is still owed, what is
 * out being asked for — lives here, so no caller of a count has to know any
 * of it is happening. Read through `count()`, `take()`, and `release()`.
 *
 * A count is held against the moment the conversation was last touched, so
 * a row that has moved on since is asked for again rather than shown stale.
 */
var TURNS = makeTurnPeek()

/**
 * The ledger behind `TURNS`, and the only thing that touches it.
 *
 * `read of(id)` answers what we know; `take(summary)` queues one we do not
 * and starts what the budget allows; `release()` drops everything owed,
 * which is what closing the window has to do — a peek landing later would
 * repaint a list that is gone, and would leave conversations held open on
 * behalf of a window nobody is looking at.
 *
 * @returns {object} the ledger.
 */
function makeTurnPeek() {
  /** id -> { updatedAt, turns } — what has been read, however long ago. */
  var values = Object.create(null)
  /** id -> true | cancel() — what is out being asked for. */
  var inflight = Object.create(null)
  /** Rows we still owe a count, in the order they were asked for. */
  var queue = []
  /** How many asks are out at once, against PEEK_CONCURRENCY. */
  var active = 0

  return {
    /**
     * The count already read for a conversation, or none.
     *
     * None is also the answer for a count that has gone stale: a row that
     * moved on since is owed a fresh read, and saying we have nothing is
     * what asks for one.
     */
    read(summary) {
      var hit = values[summary.id]
      if (!hit || hit.updatedAt !== summary.updatedAt) return null
      return hit.turns
    },
    /** Whether this conversation is already out being asked about. */
    pending(id) {
      return !!inflight[id]
    },
    /** Start as many queued asks as the concurrency budget allows. */
    drain(take, paint) {
      while (active < PEEK_CONCURRENCY && queue.length) {
        var summary = queue.shift()
        if (this.read(summary) !== null) {
          delete inflight[summary.id]
          continue
        }
        active++
        take(summary, this, {
          settle: (id, turns, updatedAt) => {
            if (typeof turns === 'number') values[id] = { updatedAt: updatedAt, turns: turns }
          },
          clear: (id) => {
            delete inflight[id]
          },
          done: () => {
            active--
          },
          // What to repaint when the answer lands. The ledger is shared by
          // the two windows, so which window to redraw is the caller's
          // fact, not the ledger's — a count that arrived for the task
          // window must not repaint a board that is not even up.
          paint: paint,
        })
      }
    },
    /** Queue one row we owe a count for, unless we already have it. */
    owe(summary) {
      inflight[summary.id] = true
      queue.push(summary)
    },
    /** Mark one ask as cancellable once the host has been reached. */
    watch(id, cancel) {
      inflight[id] = cancel
    },
    /** Drop every queued and in-flight ask. */
    release() {
      queue.length = 0
      for (var id in inflight) {
        if (!Object.prototype.hasOwnProperty.call(inflight, id)) continue
        var cancel = inflight[id]
        if (typeof cancel === 'function') cancel()
        else delete inflight[id]
      }
      active = 0
    },
  }
}

/**
 * The turn count already peeked for a conversation, or null.
 * @param {object} summary - session summary.
 * @returns {number|null} the count, or null while unknown.
 */
function turnsOf(summary) {
  return TURNS.read(summary)
}

/**
 * Queue a turn count for every loaded row that does not have one yet.
 *
 * Nothing here can fail loudly and nothing blocks the window: rows render
 * with the count absent, and a count paints itself in when it lands. The
 * shell serves `sessionStats` per session, so the only way to read it for
 * a conversation that is not open is to briefly retain that conversation
 * under a private source — never `mainView`, see PEEK_SOURCE.
 */
function requestTurns(rows, paint) {
  var services = taskServices()
  var sessions = services && services.controller
  if (!sessions || typeof sessions.retainScope !== 'function') return
  for (var i = 0; i < rows.length; i++) {
    var summary = rows[i]
    if (turnsOf(summary) !== null || TURNS.pending(summary.id)) continue
    TURNS.owe(summary)
  }
  drainPeeks(paint)
}

/** Start as many queued peeks as the concurrency budget allows. */
function drainPeeks(paint) {
  TURNS.drain(peekTurns, function () {
    if (paint) paint()
  })
}

/**
 * Read one session's `sessionStats.turns` and let go of it again.
 *
 * The reference is released on every path — value, cancel, timeout, or a
 * throwing host — because a held one keeps a whole session scope alive.
 * @param {object} summary - session summary.
 * @param {object} book - the ledger that asked for this read.
 * @param {object} sink - what to do with the answer, and who to tell.
 */
function peekTurns(summary, book, sink) {
  var settled = false
  var reference = null
  var off = null
  var timer = null

  function finish(turns) {
    if (settled) return
    settled = true
    if (timer) window.clearTimeout(timer)
    if (off) {
      try {
        off()
      } catch (error) {
        /* the host is already gone; nothing to do */
      }
    }
    if (reference) {
      try {
        reference.release()
      } catch (error) {
        /* ditto */
      }
    }
    sink.clear(summary.id)
    sink.settle(summary.id, turns, summary.updatedAt)
    sink.done()
    // A count landed, so whichever window asked can show it. That repaint
    // is also where the asking window opens the next slot: the queue is per
    // window, and only the window knows whether it still wants the rest.
    if (sink.paint) sink.paint()
  }

  book.watch(summary.id, finish)
  try {
    var services = taskServices()
    reference = services.controller.retainScope(summary.id, PEEK_SOURCE)
    var projections = reference && reference.binding && reference.binding.session
      ? reference.binding.session.projections
      : null
    if (!projections || typeof projections.faceOf !== 'function') {
      finish()
      return
    }
    var face = projections.faceOf('sessionStats')
    function accept() {
      var value = face.getSnapshot()
      if (!value) return false
      finish(typeof value.turns === 'number' ? value.turns : null)
      return true
    }
    if (!accept() && typeof face.subscribe === 'function') {
      off = face.subscribe(function () {
        accept()
      })
      timer = window.setTimeout(function () {
        finish()
      }, PEEK_TIMEOUT_MS)
      // The value may have landed between the read and the subscription.
      accept()
    } else if (!settled) {
      finish()
    }
  } catch (error) {
    finish()
  }
}

/** Drop every queued and in-flight peek; the window closed or unloaded. */
function cancelPeeks() {
  TURNS.release()
}


export { requestTurns, drainPeeks, cancelPeeks, turnsOf }
