/**
 * The new-conversation sheet a goal's plus opens: title, body, model row and
 * the host request that makes the conversation. The board's own verbs come
 * back through board-hooks; the picker is the page's own window.
 */
import { BOARD } from './board-state.js'
import { BOARD_STORE, JOURNAL } from './board-stores.js'
import { BOARD_INK, BOARD_UI } from './board-css.js'
import { boardBlockByKey, noteParts, workspaceForGoal } from './board-canvas.js'
import { boardOpenSession, boardPasteDraft, boardRepaint } from './board-hooks.js'
import { failureText, refusal } from './errors.js'
import { levelName, modelDirectories, switchModel } from './models.js'
import { MODELPICK, closeModelPick, openNewSessionModelPick } from './model-picker.js'
import { renameSession } from './session-actions.js'
import { taskServices } from './sessions.js'
import { paletteText } from './strings.js'
import { showToast } from './toast.js'

/**
 * Take the new-conversation sheet down, and forget what it was writing.
 *
 * The fields belong to the sheet: a press elsewhere, Escape, or the board
 * going away all end the same way. Nothing here touches the host — a sheet
 * that closes has written nothing, which is what Cancel means.
 * @returns {boolean} whether a sheet was up.
 */
function closeNewSessionSheet() {
  var host = BOARD.newSessionHost
  if (!host) return false
  if (host.parentNode) host.parentNode.removeChild(host)
  BOARD.newSessionGoal = ''
  BOARD.newSessionHost = null
  BOARD.newSessionTitle = null
  BOARD.newSessionBody = null
  BOARD.newSessionModel = null
  BOARD.newSessionModelText = null
  // A model window opened for this sheet goes with it: the choice belonged
  // to a conversation nobody is making any more.
  if (MODELPICK.forNewSession) closeModelPick()
  BOARD.newSessionConfirm = null
  BOARD.newSessionError = null
  return true
}

/**
 * Put the sheet's confirm button in step with the one host round trip.
 *
 * A second press while the first is still being made would make a second
 * conversation, so the button stops answering until the answer lands.
 * @returns {void}
 */
function paintNewSessionBusy() {
  var confirm = BOARD.newSessionConfirm
  if (!confirm) return
  confirm.textContent = BOARD.newSessionBusy ? '\u2026' : paletteText('boardNewSessionConfirm')
  confirm.setAttribute('aria-busy', BOARD.newSessionBusy ? 'true' : 'false')
  confirm.style.opacity = BOARD.newSessionBusy ? '0.6' : ''
  confirm.style.pointerEvents = BOARD.newSessionBusy ? 'none' : ''
}

/**
 * Say which model the sheet would start the conversation on.
 *
 * The line is the whole state of the row: no model chosen reads as the
 * host's own default, because that is what the conversation will get.
 * @returns {void}
 */
function paintNewSessionModel() {
  var node = BOARD.newSessionModelText
  if (!node) return
  var pick = BOARD.newSessionModel
  if (!pick) {
    node.textContent = paletteText('boardNewSessionModelDefault')
    node.style.opacity = '0.66'
    return
  }
  node.style.opacity = ''
  node.textContent = pick.levelName ? pick.name + ' · ' + pick.levelName : pick.name
}

/**
 * Paint one of the sheet's fields as focused or not.
 *
 * Inline styles cannot write `:focus`, and the browser's own ring is a black
 * halo on a solid dark sheet. The two properties below are the board's
 * ordinary pair for "this is the thing you are on": the accent edge and its
 * soft ring outside it.
 * @param {Element} input - the field to paint.
 * @param {boolean} on - whether the caret is in it.
 * @returns {void}
 */
function paintNewSessionField(input, on) {
  if (!input || !input.style) return
  input.style.borderColor = on ? BOARD_INK.accent : BOARD_INK.dialogFieldEdge
  input.style.boxShadow = on ? '0 0 0 3px ' + BOARD_INK.accentSoft : 'none'
}

/**
 * Let a field say where the caret is, for as long as it lives.
 * @param {Element} input - the field to watch.
 * @returns {void}
 */
function watchNewSessionField(input) {
  if (!input || typeof input.addEventListener !== 'function') return
  input.addEventListener('focus', function () { paintNewSessionField(input, true) })
  input.addEventListener('blur', function () { paintNewSessionField(input, false) })
}

/**
 * Show the sheet that asks for a conversation's name and the words it opens with.
 *
 * This is the plus's first gesture. The second is the sheet not existing at
 * all: a card dropped on the same plus already carries its own words, and a
 * question there would only be asking the reader to repeat themselves.
 * @param {object} block - the goal whose plus was pressed.
 * @returns {boolean} whether the sheet opened.
 */
function openNewSessionSheet(block) {
  if (!block || block.kind === 'inbox') return false
  if (BOARD.newSessionHost || BOARD.newSessionBusy) return false
  if (!BOARD.panel) return false
  if (!workspaceForGoal(block)) {
    showToast(paletteText('boardNewSessionNoWorkspace'))
    return false
  }

  var host = document.createElement('div')
  Object.assign(host.style, BOARD_UI.newSessionBackdrop)
  host.setAttribute('data-role', 'newSessionSheet')
  var sheet = document.createElement('div')
  Object.assign(sheet.style, BOARD_UI.newSessionSheet)
  sheet.className = 'dshv-new-sheet'
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-label', paletteText('boardNewSessionTitle'))
  sheet.setAttribute('data-handle', 'newSession')

  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.newSessionHead)
  head.textContent = paletteText('boardNewSessionTitle')
  sheet.appendChild(head)

  // The premise of the form, not its footnote: a reader should know what
  // the two fields turn into before typing into them, not after.
  var helper = document.createElement('div')
  Object.assign(helper.style, BOARD_UI.newSessionHelper)
  helper.textContent = paletteText('boardNewSessionHelper')
  sheet.appendChild(helper)

  var titleField = document.createElement('label')
  Object.assign(titleField.style, BOARD_UI.newSessionField)
  var titleLabel = document.createElement('span')
  Object.assign(titleLabel.style, BOARD_UI.newSessionLabel)
  titleLabel.textContent = paletteText('boardNewSessionTitleLabel')
  var titleInput = document.createElement('input')
  Object.assign(titleInput.style, BOARD_UI.newSessionInput)
  titleInput.setAttribute('type', 'text')
  titleInput.setAttribute('data-role', 'newSessionTitle')
  titleInput.setAttribute('placeholder', paletteText('boardNewSessionTitlePlaceholder'))
  watchNewSessionField(titleInput)
  titleField.appendChild(titleLabel)
  titleField.appendChild(titleInput)
  sheet.appendChild(titleField)

  var bodyField = document.createElement('label')
  Object.assign(bodyField.style, BOARD_UI.newSessionField)
  var bodyLabel = document.createElement('span')
  Object.assign(bodyLabel.style, BOARD_UI.newSessionLabel)
  bodyLabel.textContent = paletteText('boardNewSessionBodyLabel')
  var bodyInput = document.createElement('textarea')
  Object.assign(bodyInput.style, BOARD_UI.newSessionBody)
  bodyInput.setAttribute('data-role', 'newSessionBody')
  bodyInput.setAttribute('placeholder', paletteText('boardNewSessionBodyPlaceholder'))
  watchNewSessionField(bodyInput)
  bodyField.appendChild(bodyLabel)
  bodyField.appendChild(bodyInput)
  sheet.appendChild(bodyField)

  var modelField = document.createElement('div')
  Object.assign(modelField.style, BOARD_UI.newSessionField)
  var modelLabel = document.createElement('span')
  Object.assign(modelLabel.style, BOARD_UI.newSessionLabel)
  modelLabel.textContent = paletteText('boardNewSessionModelLabel')
  var modelPick = document.createElement('span')
  Object.assign(modelPick.style, BOARD_UI.newSessionPick)
  modelPick.className = 'dshv-sheet-pick'
  modelPick.setAttribute('role', 'button')
  modelPick.setAttribute('tabindex', '0')
  modelPick.setAttribute('data-role', 'newSessionModel')
  modelPick.setAttribute('title', paletteText('boardNewSessionModelHint'))
  var modelName = document.createElement('span')
  Object.assign(modelName.style, BOARD_UI.newSessionPickName)
  modelName.setAttribute('data-role', 'newSessionModelName')
  var modelMark = document.createElement('span')
  Object.assign(modelMark.style, BOARD_UI.newSessionPickMark)
  modelMark.textContent = '\u203a'
  modelPick.appendChild(modelName)
  modelPick.appendChild(modelMark)
  modelPick.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    openNewSessionModelPick()
  })
  // A row that is a button answers the keyboard like one: it is reached by
  // Tab, not only by the hand.
  modelPick.addEventListener('keydown', function (ev) {
    var key = ev && ev.key ? String(ev.key) : ''
    if (key !== 'Enter' && key !== ' ') return
    if (typeof ev.preventDefault === 'function') ev.preventDefault()
    if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
    openNewSessionModelPick()
  })
  modelField.appendChild(modelLabel)
  modelField.appendChild(modelPick)
  sheet.appendChild(modelField)

  var error = document.createElement('div')
  Object.assign(error.style, BOARD_UI.newSessionError)
  error.setAttribute('data-role', 'newSessionError')
  error.style.display = 'none'
  sheet.appendChild(error)

  var actions = document.createElement('div')
  Object.assign(actions.style, BOARD_UI.newSessionActions)
  var keys = document.createElement('span')
  Object.assign(keys.style, BOARD_UI.newSessionKeys)
  keys.textContent = paletteText('boardNewSessionKeys')
  actions.appendChild(keys)
  var cancel = document.createElement('span')
  Object.assign(cancel.style, BOARD_UI.newSessionCancel)
  cancel.className = 'dshv-sheet-btn dshv-sheet-btn-ghost'
  cancel.setAttribute('role', 'button')
  cancel.setAttribute('data-role', 'newSessionCancel')
  cancel.textContent = paletteText('boardNewSessionCancel')
  cancel.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    closeNewSessionSheet()
  })
  var confirm = document.createElement('span')
  Object.assign(confirm.style, BOARD_UI.newSessionConfirm)
  confirm.className = 'dshv-sheet-btn dshv-sheet-btn-primary'
  confirm.setAttribute('role', 'button')
  confirm.setAttribute('data-role', 'newSessionConfirm')
  confirm.textContent = paletteText('boardNewSessionConfirm')
  confirm.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    commitNewSessionSheet()
  })
  actions.appendChild(cancel)
  actions.appendChild(confirm)
  sheet.appendChild(actions)

  // A press on the paper around the sheet is a cancel, the way every window
  // in this plugin treats the space beside its card.
  host.addEventListener('pointerdown', function (ev) {
    if (ev && ev.target !== host) return
    if (typeof ev.preventDefault === 'function') ev.preventDefault()
    closeNewSessionSheet()
  })
  host.addEventListener('keydown', function (ev) {
    var key = ev && ev.key ? String(ev.key).toLowerCase() : ''
    if (key === 'escape') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
      closeNewSessionSheet()
      return
    }
    if ((ev.ctrlKey || ev.metaKey) && key === 'enter') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
      commitNewSessionSheet()
    }
  })
  titleInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
      closeNewSessionSheet()
      return
    }
    if (ev.key !== 'Enter') return
    if (typeof ev.preventDefault === 'function') ev.preventDefault()
    if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
    bodyInput.focus()
  })
  bodyInput.addEventListener('keydown', function (ev) {
    var key = ev.key ? String(ev.key).toLowerCase() : ''
    if (key === 'escape') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
      closeNewSessionSheet()
      return
    }
    // The one chord that sends from the body: a bare Enter is a line break,
    // because the body is where a longer thought is written.
    if ((ev.ctrlKey || ev.metaKey) && key === 'enter') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
      commitNewSessionSheet()
    }
  })

  host.appendChild(sheet)
  BOARD.newSessionHost = host
  BOARD.newSessionGoal = String(block.key || '')
  BOARD.newSessionTitle = titleInput
  BOARD.newSessionBody = bodyInput
  BOARD.newSessionModel = null
  BOARD.newSessionModelText = modelName
  BOARD.newSessionConfirm = confirm
  BOARD.newSessionError = error
  BOARD.panel.appendChild(host)
  paintNewSessionBusy()
  paintNewSessionModel()
  if (typeof titleInput.focus === 'function') titleInput.focus()
  return true
}

/**
 * Read the sheet and start the conversation it describes.
 *
 * The title becomes the name; the body becomes the draft in its message box. A title
 * on its own is a request too: a conversation stood up with nothing said
 * yet. A sheet with neither is not a request, so it stays open with the
 * field focused rather than making an empty conversation.
 * @returns {boolean} whether a conversation was asked for.
 */
function commitNewSessionSheet() {
  if (BOARD.newSessionBusy) return false
  var block = boardBlockByKey(BOARD.newSessionGoal)
  if (!block) {
    closeNewSessionSheet()
    return false
  }
  var title = BOARD.newSessionTitle ? String(BOARD.newSessionTitle.value || '').trim() : ''
  var body = BOARD.newSessionBody ? String(BOARD.newSessionBody.value || '').trim() : ''
  if (!title && !body) {
    if (BOARD.newSessionError) {
      BOARD.newSessionError.textContent = paletteText('boardNewSessionEmpty')
      BOARD.newSessionError.style.display = ''
    }
    if (BOARD.newSessionTitle && typeof BOARD.newSessionTitle.focus === 'function') BOARD.newSessionTitle.focus()
    return false
  }
  if (!title) title = noteParts(body).title.trim()
  if (BOARD.newSessionError) BOARD.newSessionError.style.display = 'none'
  return startNewSessionForGoal(block.key, title, body, '')
}

/**
 * Put the model the sheet was set to onto the conversation just made.
 *
 * A selection is a fact about one conversation, so there is nothing to
 * submit until the conversation exists — and it has to exist before the
 * first message, which is the only ordering where the words go out on the
 * model that was chosen. A refusal is reported and the conversation still
 * starts: the sheet asked for a conversation first.
 * @param {string} sessionId - the conversation just created.
 * @param {object|null} pick - the model chosen on the sheet.
 * @returns {Promise<boolean>} whether the model landed.
 */
function applyNewSessionModel(sessionId, pick) {
  if (!pick) return Promise.resolve(false)
  var directories = modelDirectories()
  if (!directories || typeof directories.directoryFor !== 'function') {
    showToast(paletteText('modelUnsupported'))
    return Promise.resolve(false)
  }
  var directory = null
  try {
    directory = directories.directoryFor(sessionId)
  } catch (error) {
    directory = null
  }
  if (!directory) {
    showToast(paletteText('modelUnsupported'))
    return Promise.resolve(false)
  }
  return switchModel(directory, pick, pick.level).then(
    function () {
      return true
    },
    function (error) {
      showToast(paletteText('modelFailed') + ': ' + failureText(error))
      return false
    }
  )
}

/**
 * Start one conversation under one goal, with the reader's words.
 *
 * The workspace creates the Session; the goal is where the card is filed
 * afterwards, because a goal of the reader's own has no workspace of its
 * own. Two sources feed this: the sheet's title and body, and a card
 * dropped on the plus — the latter leaves the card behind as the receipt,
 * exactly as handing it to an existing conversation does.
 * @param {string} goalKey - the goal the conversation is filed under.
 * @param {string} title - the name the conversation should wear.
 * @param {string} text - the words to hand over as a draft; empty hands over none.
 * @param {string} [cardId] - the card that was dropped, when there is one.
 * @returns {boolean} whether the attempt was started.
 */
function startNewSessionForGoal(goalKey, title, text, cardId) {
  if (BOARD.newSessionBusy) return false
  var block = boardBlockByKey(goalKey)
  if (!block) {
    showToast(paletteText('boardNewSessionNoWorkspace'))
    return false
  }
  var workspaceId = workspaceForGoal(block)
  if (!workspaceId) {
    showToast(paletteText('boardNewSessionNoWorkspace'))
    return false
  }
  var services = taskServices()
  var sessions = services && services.controller
  if (!sessions || typeof sessions.create !== 'function') {
    showToast(paletteText('boardNewSessionUnavailable'))
    return false
  }
  var name = String(title || '').trim()
  var body = String(text || '').trim()
  // The sheet's model row, read here: the sheet is gone by the time the
  // conversation comes back from the host, and the choice with it.
  var picked = BOARD.newSessionModel || null
  // A conversation needs a name or some words. Either one alone is a
  // request: the sheet's title names it, and its body is what gets said.
  if (!name && !body) return false
  BOARD.newSessionBusy = true
  paintNewSessionBusy()
  var sessionId = ''
  function fail(error) {
    BOARD.newSessionBusy = false
    var reason = error && error.rpcError && error.rpcError.message
      ? String(error.rpcError.message)
      : failureText(error)
    if (BOARD.newSessionError) {
      BOARD.newSessionError.textContent = paletteText('boardNewSessionFailed') + reason
      BOARD.newSessionError.style.display = ''
    }
    paintNewSessionBusy()
    showToast(paletteText('boardNewSessionFailed') + reason)
    if (BOARD.open) boardRepaint()
  }
  Promise.resolve(sessions.create({ workspaceId: workspaceId })).then(function (created) {
    sessionId = String(created || '')
    if (!sessionId) throw new Error(paletteText('boardNewSessionUnavailable'))
    // The card is where the reader pointed, not where the workspace would
    // have put it: file it before opening so the next board agrees.
    BOARD_STORE.placeSession(sessionId, goalKey)
    boardOpenSession(sessionId)
    JOURNAL.add('thread/born', { session: sessionId, goal: goalKey })
    // The Session exists and is open: a second request from here is a
    // second conversation on purpose, not a double press on one button.
    // The paste below can wait on the message box, and that wait must not
    // keep the board's plus answering "busy" for the rest of the visit.
    BOARD.newSessionBusy = false
    paintNewSessionBusy()
    // The model goes on before the words do: once the draft is sent it is
    // the model on the conversation that answers it.
    return applyNewSessionModel(sessionId, picked).then(function () {
      // The words are handed over as a draft, never as a turn: this plugin
      // opens the conversation and puts the reader's words in its box, and
      // pressing send stays the reader's own decision. A card carries words
      // too, and it goes in the same way.
      if (!body) return true
      return boardPasteDraft(body, sessionId)
    })
  }).then(function (pasted) {
    if (cardId) BOARD_STORE.finishCard(cardId, sessionId)
    if (name) {
      renameSession(sessionId, name, function (reason) {
        if (reason) console.warn('[dsh-vim] new session rename refused', reason)
      })
    }
    BOARD.newSessionBusy = false
    paintNewSessionBusy()
    if (body && pasted === false) {
      // The conversation is open and named; only the words did not land,
      // and saying so is what keeps them from being lost silently.
      showToast(paletteText('boardNewSessionPasteFailed'))
    } else if (cardId) {
      showToast(paletteText('boardNewSessionDropped'))
    } else {
      showToast(paletteText('boardNewSessionCreated') + (name || noteParts(body).title))
    }
    if (BOARD.open) renderBoard()
  }).catch(fail)
  return true
}

// ---------------------------------------------------------------------
// tidying the canvas
// ---------------------------------------------------------------------


export { closeNewSessionSheet, paintNewSessionModel, openNewSessionSheet, startNewSessionForGoal, applyNewSessionModel }
