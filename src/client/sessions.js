/**
 * The host's session feed, read as plain rows: the services this client
 * resolves once, the conversation pool, the shell's status entry, and the
 * workspace a conversation belongs to. Nothing here draws or paints.
 */
import { BOARD_INBOX, PENDING_LABELS } from './constants.js'
import { paletteText } from './strings.js'
import { state } from './scroll.js'

/** The client root context, kept for the two services below. */
export let taskCtx = null

/**
 * Hand the module the client root context; services are resolved on first use.
 * @param {object} ctx - client root context.
 * @returns {void}
 */
export function setTaskContext(ctx) {
  taskCtx = ctx
}

/**
 * One host service, however this context publishes it. These two are read
 * with `ctx.get` on purpose rather than declared in `inject`: a host
 * without them must lose the task window only, never the scrolling engine.
 * @param {object} ctx - client root context.
 * @param {string} name - service name.
 * @returns {object|null} the service, or null when it is absent.
 */
function serviceOf(ctx, name) {
  if (!ctx) return null
  try {
    var value = typeof ctx.get === 'function' ? ctx.get(name) : null
    if (value) return value
  } catch (error) {
    /* unknown service name */
  }
  return ctx[name] || null
}

/**
 * The session feed, the workspace registry, and the workspace navigator.
 * The first and last are required; the registry is optional, because a host
 * that does not publish it should still get a task window — just one with no
 * archive filter and no folder on its rows. Resolved once per activation, so
 * an absent host costs one probe rather than one probe per keypress.
 * @returns {{list: object, nav: object, controller: object, workspaces: object|null, status: object|null}|null}
 */
function taskServices() {
  if (taskServices.cache === undefined) {
    taskServices.cache = null
    var sessions = serviceOf(taskCtx, 'sessions')
    var nav = serviceOf(taskCtx, 'uiWorkspace')
    var workspaces = serviceOf(taskCtx, 'workspaces')
    var uiSession = serviceOf(taskCtx, 'uiSession')
    var list = sessions && sessions.list
    var registry = workspaces && workspaces.list
    if (list && typeof list.getSnapshot === 'function' && nav && typeof nav.openSession === 'function') {
      taskServices.cache = {
        list: list,
        nav: nav,
        controller: sessions,
        workspaces: registry && typeof registry.getSnapshot === 'function' ? registry : null,
        status: (uiSession && uiSession.sessionStatus) || null,
      }
    } else if (state.debug) {
      console.warn('[dsh-vim] task window unavailable', { sessions: !!list, nav: !!nav })
    }
  }
  return taskServices.cache
}

/**
 * The shell's unified status entry for one conversation, if it publishes one.
 * @param {string} id - session id.
 * @returns {object|null} { running, pendingInteraction, completionUnread }.
 */
function statusFor(id) {
  var services = taskServices()
  if (!services || !services.status) return null
  try {
    var snapshot = services.status.getSnapshot()
    return snapshot && typeof snapshot.get === 'function' ? snapshot.get(id) : null
  } catch (error) {
    return null
  }
}

/**
 * The conversation on screen, as the shell's own shortcuts see it: the one
 * row the main view still retains. The reasoning key needs the same answer
 * the status badge needs, so both read it here.
 * @returns {object|null} the catalogue row, or null when nothing is open.
 */
function currentSession() {
  var services = taskServices()
  if (!services) return null
  var list = services.list.getSnapshot()
  var byId = list && list.byId
  if (!byId) return null
  for (var id in byId) {
    if (!Object.prototype.hasOwnProperty.call(byId, id)) continue
    var row = byId[id]
    if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return row
  }
  return null
}

/**
 * True when the conversation on screen has a turn in flight.
 *
 * Status outranks the catalogue's own flag, matching the shell.
 * @returns {boolean} whether a turn is running in the visible conversation.
 */
function currentSessionRunning() {
  var current = currentSession()
  if (!current) return false
  var status = statusFor(current.id)
  if (status && status.running !== undefined) return !!status.running
  return !!current.running
}

// ---------------------------------------------------------------------
// entry anchor
// ---------------------------------------------------------------------

/**
 * Whether the conversation still has a turn in flight, or null while the
 * status source has not answered yet.
 *
 * A parked question is not a turn in flight: the answer is finished and
 * waiting, so the reading entry still applies. A host with no status
 * source at all is never anchored — the tail is the shell's own choice
 * there, and this is not a plugin's to overturn.
 * @param {string} id - session id.
 * @returns {boolean|null} live, settled, or not yet known.
 */
function entryRunning(id) {
  var services = taskServices()
  if (!services || !services.status) return null
  var status = statusFor(id)
  if (!status || status.running === undefined) return null
  return status.running === true
}

/**
 * What one conversation is doing right now, as a short label.
 *
 * The facts come from the shell's own unified session status, and the
 * precedence is the shell's: something waiting on the reader outranks live
 * activity, which outranks a completion reminder. On a host that publishes
 * no status source, the catalogue's own `running` flag is all there is.
 * @param {object} summary - session summary.
 * @returns {{key: string, text: string}|null} the label, or null when idle.
 */
function statusOf(summary) {
  var status = statusFor(summary.id)
  if (!status) {
    return summary.running ? { key: 'running', text: paletteText('statusRunning') } : null
  }
  var kind = status.pendingInteraction && status.pendingInteraction.kind
  if (kind) {
    return { key: 'pending', text: paletteText(PENDING_LABELS[kind] || 'statusWaiting') }
  }
  var running = status.running === undefined ? summary.running : status.running
  if (running) return { key: 'running', text: paletteText('statusRunning') }
  if (status.completionUnread) return { key: 'done', text: paletteText('statusDone') }
  return null
}

/**
 * True for the statuses that mean a turn is in flight: one that is running,
 * and one parked on a question, which is the same turn waiting on the user.
 * @param {object|null} status - the label `statusOf` produced.
 * @returns {boolean} whether the conversation is mid-turn.
 */
function statusIsLive(status) {
  return !!status && (status.key === 'running' || status.key === 'pending')
}

/**
 * Every conversation worth offering, newest first.
 *
 * The exclusions mirror the shell's own `sessionVisible`: subagent children
 * are not conversations, empty provisional slots have nothing to switch
 * back to, and archived sessions were put away on purpose.
 *
 * The order is plain recency, with the id as a deterministic tie-break. It
 * used to be grouped by folder, folder blocks in the registry's own order —
 * that made the folder the unit the reader navigated in, and it meant a busy
 * folder could push a quiet one off the list entirely. The folder is a
 * label on a row now (see `namesOwnFolder`), not a container, so there is
 * nothing here to group.
 *
 * Nothing is ever moved for being the conversation on screen: a list that
 * reshuffles itself when you switch is a list whose positions cannot be
 * learned, and the position of the row you are in is exactly what
 * `hereIndex` reads instead of rewriting.
 * @param {boolean} [keepBlank] - keep a conversation the host still calls
 *   blank, one with no turn folded into it yet. The board asks for them: a
 *   blank conversation is one nobody has said anything in, so the shell
 *   hides it unless it is the one on screen, and a card on the board would
 *   otherwise be the one door the board itself could not draw.
 * @returns {Array<object>} session summaries, newest first.
 */
function conversationPool(keepBlank) {
  var services = taskServices()
  if (!services) return []
  var snapshot = services.list.getSnapshot()
  if (!snapshot) return []
  var byId = snapshot.byId || {}
  var ids = snapshot.ids && snapshot.ids.length ? snapshot.ids : Object.keys(byId)

  var archive = null
  if (services.workspaces) {
    try {
      var registry = services.workspaces.getSnapshot()
      if (registry && registry.archivedSessionIds) {
        archive = {}
        for (var k = 0; k < registry.archivedSessionIds.length; k++) {
          archive[registry.archivedSessionIds[k]] = true
        }
      }
    } catch (error) {
      console.warn('[dsh-vim] archive set unavailable', error)
    }
  }

  var pool = []
  for (var i = 0; i < ids.length; i++) {
    var summary = byId[ids[i]]
    if (!summary) continue
    if (summary.origin === 'subagent') continue
    if (summary.blank && !keepBlank) continue
    if (archive && archive[summary.id]) continue
    pool.push(summary)
  }
  sortByRecency(pool)
  return pool
}

/**
 * Sort rows by recency, newest first, with the id as a deterministic
 * tie-break.
 *
 * The tie-break matters more than it looks: two conversations touched in
 * the same millisecond would otherwise swap places between repaints, and a
 * list that reorders itself while you are reading it is the thing this
 * whole grouping exists to avoid.
 * @param {Array<object>} rows - rows to sort in place.
 * @returns {void}
 */
function sortByRecency(rows) {
  rows.sort(function (a, b) {
    var gap = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
    if (gap) return gap
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Where the conversation on screen sits in a list, or 0 when it is not
 * there.
 *
 * This is what replaced putting it at the front: the window opens with the
 * selection on the row you are already in, wherever the folder order put
 * it. A conversation that is not in the list — archived, or filtered out —
 * leaves the selection at the top, which is the only row left to point at.
 * @param {Array<object>} rows - the rows on screen.
 * @returns {number} the index to select.
 */
function hereIndex(rows) {
  var here = currentSession()
  if (!here) return 0
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === here.id) return i
  }
  return 0
}

/**
 * Which folder each conversation lives in, as `{ label, path }` keyed by
 * session id.
 *
 * The Session catalogue carries no folder — its summaries are id, title,
 * state and time — so membership is read the way the sidebar reads it: a
 * Workspace lists the sessions that belong to it. A conversation no
 * Workspace accounts for is left without a chip rather than labelled: that
 * is the sidebar's own "ungrouped" bucket, and an empty chip on every row of
 * a host that publishes no registry would be noise.
 * @returns {object} session id -> folder, for the rows about to be drawn.
 */
function folderIndex() {
  var index = Object.create(null)
  var services = taskServices()
  if (!services || !services.workspaces) return index
  var snapshot = null
  try {
    snapshot = services.workspaces.getSnapshot()
  } catch (error) {
    return index
  }
  var items = (snapshot && snapshot.items) || []
  for (var i = 0; i < items.length; i++) {
    var workspace = items[i]
    if (!workspace || !workspace.sessionIds) continue
    var folder = {
      // The id is what the board's panels are keyed by; the task window's
      // rows only read the label and the path.
      id: String(workspace.workspaceId || ''),
      label: folderLabel(workspace),
      path: String(workspace.path || ''),
    }
    for (var j = 0; j < workspace.sessionIds.length; j++) {
      index[workspace.sessionIds[j]] = folder
    }
  }
  return index
}

/**
 * One workspace, by the id the board files its goals under.
 *
 * Read from the registry rather than from the conversation that is being
 * drawn: a goal can outlive its conversations, and the label it was cut
 * from is a fact about the workspace, not about what is currently in it.
 * @param {string} id - workspace id.
 * @returns {{label: string, path: string}|null} the folder, or null.
 */
function folderById(id) {
  if (!id || id === BOARD_INBOX) return null
  var services = taskServices()
  if (!services || !services.workspaces) return null
  var snapshot = null
  try {
    snapshot = services.workspaces.getSnapshot()
  } catch (error) {
    return null
  }
  var items = (snapshot && snapshot.items) || []
  for (var i = 0; i < items.length; i++) {
    var workspace = items[i]
    if (!workspace) continue
    if (String(workspace.workspaceId || '') !== String(id)) continue
    return { label: folderLabel(workspace), path: String(workspace.path || '') }
  }
  return null
}

/**
 * What a folder reads as on a row: the Workspace's own title, else the last
 * segment of its path. The same precedence the sidebar's group header uses,
 * so a row and its group cannot disagree.
 * @param {object} workspace - one registry item.
 * @returns {string} the label, empty when there is nothing to show.
 */
function folderLabel(workspace) {
  var title = workspace.title ? String(workspace.title).trim() : ''
  if (title) return title
  var path = workspace.path ? String(workspace.path) : ''
  var parts = path.split(/[\\/]/).filter(function (part) {
    return part !== ''
  })
  return parts.length ? parts[parts.length - 1] : path
}


export { serviceOf, taskServices, statusFor, currentSession, currentSessionRunning, entryRunning, conversationPool, sortByRecency, hereIndex, folderIndex, folderById, folderLabel, statusOf, statusIsLive }
