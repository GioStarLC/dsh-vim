/**
 * Writing to a conversation's own record: renaming it and archiving it.
 * Both open the session under this plugin's private source and report a host
 * refusal in words the reader can act on.
 */
import { PEEK_SOURCE } from './constants.js'
import { archiveFailureText, failureText } from './errors.js'
import { taskServices } from './sessions.js'
import { paletteText } from './strings.js'

/**
 * Rename one conversation, the way the shell's own sidebar does it: retain
 * the session under this plugin's private source, call the binding, release.
 * The source must not be `mainView`, for the reason spelled out on
 * PEEK_SOURCE — renaming a row must not mark it read.
 * @param {string} id - session id.
 * @param {string} title - the new name.
 * @param {function(string|null):void} done - the reason on failure, else null.
 * @returns {void}
 */
function renameSession(id, title, done) {
  var services = taskServices()
  var sessions = services && services.controller
  if (!sessions || typeof sessions.using !== 'function') {
    done(paletteText('renameUnavailable'))
    return
  }
  var settled = false
  function finish(reason) {
    if (settled) return
    settled = true
    done(reason)
  }
  try {
    var pending = sessions.using(id, { source: PEEK_SOURCE }, function (reference) {
      var session = reference && reference.binding && reference.binding.session
      if (!session || typeof session.rename !== 'function') return { ok: false, error: null }
      return session.rename(title)
    })
    Promise.resolve(pending).then(
      function (result) {
        finish(result && result.ok ? null : failureText(result))
      },
      function (error) {
        finish(failureText(error))
      }
    )
  } catch (error) {
    finish(failureText(error))
  }
}

/**
 * Archive the selected conversation, through the host's own action.
 *
 * The one thing this refuses to do is stop a turn. The host's own
 * `archiveSession` would happily do that for us if we passed
 * `stopActivity: true`, and the host answers a bare call on a busy session
 * with `workspace/session-active` naming the work. Both facts are load
 * bearing here: this plugin does not get to destroy a running task with one
 * keystroke, which is the same rule Escape already follows. So a session
 * with work in flight is reported, never stopped — the user can stop it and
 * press the key again.
 *
 * A refusal the host makes for its own reasons is surfaced as it is, so the
 * message is the host's rather than a guess of ours.
 * @param {string} id - session id to archive.
 * @param {function(string|null):void} done - the reason on failure, else null.
 * @returns {void}
 */
function archiveSession(id, done) {
  var services = taskServices()
  var nav = services && services.nav
  if (!nav || typeof nav.archiveSession !== 'function') {
    done(paletteText('archiveUnavailable'))
    return
  }
  var settled = false
  function finish(reason) {
    if (settled) return
    settled = true
    done(reason)
  }
  try {
    // Deliberately no `stopActivity`: the host must refuse a busy session
    // rather than stop it on our behalf. See the doc comment above.
    var pending = nav.archiveSession(id, {})
    Promise.resolve(pending).then(
      function () {
        finish(null)
      },
      function (error) {
        finish(archiveFailureText(error))
      }
    )
  } catch (error) {
    finish(archiveFailureText(error))
  }
}


export { renameSession, archiveSession }
