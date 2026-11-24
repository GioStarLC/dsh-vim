/**
 * The few verbs the board's own modules need from each other without owning
 * each other: a repaint, closing the idea sheet, the verdict a row carries,
 * and the tie lines a glide redraws. Wired once at activation, read as
 * functions, so the canvas, the view and the gestures stay a DAG.
 */

/** The wired verbs; no-ops until activation wires them. */
const hooks = {
  repaint: function () {},
  closeIdeaSheet: function () {},
  noteFinished: function () {
    return null
  },
  drawLinks: function () {},
  openSession: function () {},
  pasteDraft: function () {
    return Promise.resolve(false)
  },
}

/**
 * Wire the board's cross-module verbs.
 * @param {object} next - any subset of the verbs.
 * @returns {void}
 */
export function wireBoardHooks(next) {
  if (!next) return
  for (const key of Object.keys(hooks)) {
    if (typeof next[key] === 'function') hooks[key] = next[key]
  }
}

/** Redraw the canvas. */
export function boardRepaint() {
  hooks.repaint()
}

/** Put the idea sheet away, if it is up. */
export function boardCloseIdeaSheet() {
  hooks.closeIdeaSheet()
}

/**
 * The verdict one conversation's row carries.
 * @param {object} summary - session summary.
 * @returns {string|null} the verdict, or null.
 */
export function boardNoteFinished(summary) {
  return hooks.noteFinished(summary)
}

/** Redraw the tie lines between the canvas and its margins. */
export function boardDrawLinks() {
  hooks.drawLinks()
}

/**
 * Switch the main view to one conversation.
 * @param {string} id - session id.
 * @returns {void}
 */
export function boardOpenSession(id) {
  hooks.openSession(id)
}

/**
 * Put words in the conversation's message box as a draft.
 * @param {string} text - the draft.
 * @param {string} [sessionId] - the conversation, when known.
 * @returns {Promise<boolean>} whether the words landed.
 */
export function boardPasteDraft(text, sessionId) {
  return hooks.pasteDraft(text, sessionId)
}
