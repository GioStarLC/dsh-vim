/**
 * The words a host refusal is said in, and the refusal itself. A failure
 * that explains itself is shown as written; anything else falls back to the
 * sentence that names what the reader was trying to do.
 */
import { paletteText } from './strings.js'

/**
 * A reason from whatever the host rejected an archive with.
 *
 * The busy refusal gets a sentence of its own, because it is the one the
 * user is meant to act on: it is not a fault, and the generic message would
 * read as one. Everything else is the host's own message, and only falls
 * back to our wording when the host sent none.
 * @param {unknown} reason - the rejection.
 * @returns {string} text for the footer.
 */
function archiveFailureText(reason) {
  var code = null
  if (reason && reason.rpcError && reason.rpcError.code) code = String(reason.rpcError.code)
  else if (reason && reason.error && reason.error.code) code = String(reason.error.code)
  else if (reason && reason.code) code = String(reason.code)
  if (code === 'workspace/session-active') return paletteText('archiveActive')
  if (reason && reason.rpcError && reason.rpcError.message) return String(reason.rpcError.message)
  if (reason && reason.error && reason.error.message) return String(reason.error.message)
  if (reason && reason.message) return String(reason.message)
  return paletteText('archiveFailed')
}

/**
 * A short reason from whatever the host rejected with: a remote failure
 * carries `{ error: { message } }`, a thrown one carries `message`.
 * @param {unknown} reason - the rejection.
 * @returns {string} text for the footer.
 */
function failureText(reason) {
  if (reason && reason.error && reason.error.message) return String(reason.error.message)
  if (reason && reason.message) return String(reason.message)
  return paletteText('renameFailed')
}

/**
 * A refusal this plugin can explain on its own, so the notice carries
 * exactly that sentence: "this model offers no levels" needs no "could not
 * change the level" frame around it, which a host failure does.
 * @param {string} text - the line to show.
 * @returns {Error} an error that is its own wording.
 */
function refusal(text) {
  var error = new Error(text)
  error.explainsItself = true
  return error
}


export { failureText, refusal, archiveFailureText }
