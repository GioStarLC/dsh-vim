/**
 * The three page-level verbs the keyboard and the pages share: switch the
 * main view to a conversation, toggle the board, show the board or the
 * overview. Each one lets the windows it displaces close first, in the same
 * order the pointer expects.
 */
import { BOARD_PANEL_ID, OVERVIEW_PANEL_ID } from './constants.js'
import { BOARD } from './board-state.js'
import { closeBoard, openBoard } from './board-mount.js'
import { closeModelPick } from './model-picker.js'
import { closePalette } from './task-window.js'
import { armEntry, clearEntryArm } from './entry.js'
import { state } from './scroll.js'
import { serviceOf, taskServices, taskCtx } from './sessions.js'
import { flushHandoff } from './board-view.js'

/**
 * Switch the main view to one conversation.
 * @param {string} id - session id.
 * @param {object} [opts] - `{ anchor: true }` when the board is the way in.
 *   Only that arrival starts at the last prompt the reader wrote; every
 *   other way in (the task window, the sidebar, a rebuild of this client)
 *   keeps the reading position the shell chose.
 * @returns {boolean} whether the navigator took it.
 */
function activateSession(id, opts) {
  var services = taskServices()
  closePalette()
  closeModelPick()
  // The floating board must get out of the way; the page does not — the
  // shell switches back to the conversation, which unmounts it.
  if (BOARD.mode !== 'page') closeBoard()
  if (!services || !id) return false
  if (opts && opts.anchor) armEntry(id)
  try {
    services.nav.openSession(id)
  } catch (error) {
    clearEntryArm()
    console.error('[dsh-vim] could not open session', id, error)
    return false
  }
  // A conversation that was handed cards while the board was up takes them
  // now: its box mounts with it, and the flush waits for exactly that box.
  flushHandoff(id)
  if (state.debug) console.log('[dsh-vim] opened session', id)
  return true
}

/**
 * The board the plugin opens when a page is not available.
 *
 * A host with the layout panel gets the sidebar page; one without it keeps
 * the floating board rather than losing the feature. The page is the one
 * the reader asked for, so it is tried first.
 * @returns {boolean} whether something was opened.
 */
function toggleBoard() {
  var layout = serviceOf(taskCtx, 'layout')
  if (layout && typeof layout.selectPanel === 'function' && layout.panelInfo
    && typeof layout.panelInfo.getSnapshot === 'function') {
    var info = layout.panelInfo.getSnapshot()
    if (info && info.activePanelId === BOARD_PANEL_ID) {
      layout.selectPanel(null)
      return true
    }
  }
  return showBoard()
}

function showBoard() {
  var layout = serviceOf(taskCtx, 'layout')
  if (layout && typeof layout.selectPanel === 'function') {
    closePalette()
    closeModelPick()
    try {
      layout.selectPanel(BOARD_PANEL_ID)
    } catch (error) {
      console.warn('[dsh-vim] could not open the board panel', error)
      return false
    }
    return true
  }
  return openBoard()
}

/**
 * Open the overview page: the board's own button, and the sidebar's row.
 *
 * The page is only a page when the host has the layout panel; a host
 * without one never draws the button, so a door that opens onto nothing is
 * never offered.
 * @returns {boolean} whether the page was asked for.
 */
function showOverview() {
  var layout = serviceOf(taskCtx, 'layout')
  if (!layout || typeof layout.selectPanel !== 'function') return false
  closePalette()
  closeModelPick()
  try {
    layout.selectPanel(OVERVIEW_PANEL_ID)
  } catch (error) {
    console.warn('[dsh-vim] could not open the overview panel', error)
    return false
  }
  return true
}


export { activateSession, showBoard, showOverview, toggleBoard }
