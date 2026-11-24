/**
 * The model picker (w): a small window over the conversation listing the
 * configured models, each with every reasoning level it publishes. Confirming
 * submits through the conversation's own directory; the new-conversation
 * sheet's variant hands the choice back to the board through a setter.
 */
import { failureText, refusal } from './errors.js'
import { applyPatch, keyLabel, settings } from './preferences.js'
import { isCurrentEntry, levelIndex, levelName, modelDirectoryOfCurrent, modelEntries, modelIndex, readModelList, readNewSessionModelList, rowMarkedLevel, rowSubmitLevel, switchModel } from './models.js'
import { stopAnim, stopHold, state } from './scroll.js'
import { paletteText } from './strings.js'
import { showToast } from './toast.js'
import { clearFocusRequest } from './focus.js'

/**
 * Where a new-conversation sheet's model choice goes. The board owns the sheet;
 * this window only knows that a confirm made one.
 * @type {?Function}
 */
let sheetPick = null

/**
 * Register the sheet's receiver for a confirmed model.
 * @param {?Function} fn - called with `{provider, model, name, level, levelName}`.
 * @returns {void}
 */
export function setSheetPick(fn) {
  sheetPick = fn
}

/**
 * Whether the board's new-conversation sheet is up. The picker opened for the
 * sheet has no conversation to read a directory from.
 * @type {Function}
 */
let sheetReady = function () {
  return false
}

/**
 * Register the sheet's own open probe.
 * @param {Function} fn - returns whether the sheet is on screen.
 * @returns {void}
 */
export function setSheetReady(fn) {
  sheetReady = fn || function () {
    return false
  }
}


/**
 * Live task-window state. `pool` is every eligible conversation, newest
 * first; `rows` is the slice of it the user has reached so far.
 *
 * `renaming` is the row whose name is being edited, or null: `{ id, value,
 * fresh, busy }`. It outlives a repaint — a feed update mid-edit rebuilds
 * the list, and the draft is what puts the same text back in the box.
 */
/**
 * The model picker: the small window `w` opens instead of walking the list
 * one press at a time.
 *
 * It is a second window beside `PALETTE`, not a mode of it. The two answer
 * different questions — "which conversation" and "which model" — and they
 * are opened by different keys, so keeping them apart is what lets the task
 * window's own keys stay untouched.
 *
 * `entries` is the reduced list one press could land on; `index` is where
 * the selection is; `submitting` freezes the window while a selection is
 * out, so a second confirm cannot race the first.
 *
 * `level` is the level the selected row would submit, and `levelSet` says
 * whether the user moved it there or the rule put it there. The distinction
 * matters on every repaint: a row the user has not stepped on must keep
 * answering the rule, or moving away and back would freeze a level the
 * current model was never on.
 */
var MODELPICK = {
  open: false,
  entries: [],
  index: 0,
  here: null,
  level: undefined,
  levelSet: false,
  submitting: false,
  /**
   * Whether this window was opened for the new-conversation sheet.
   *
   * The rows are the page's own — same catalog, same configured list, same
   * keys — and only where confirming puts the choice changes: on the sheet,
   * because there is no conversation to submit it to until the sheet's own
   * button is pressed.
   */
  forNewSession: false,
  host: null,
  list: null,
  footer: null,
  notice: '',
  rows: [],
  /**
   * The catalog groups this window's rows were read from. Held so a reorder
   * can rebuild the rows against the same catalog: rebuilding from the
   * edited list instead would quietly backfill a model that had dropped out
   * of the catalog while the window was open.
   */
  groups: [],
}

/**
 * Open the model window for the sheet's model row.
 *
 * The window is the page's own — the same rows, the same levels, the same
 * keys — because a second list would be a second answer to the same
 * question. What changes is only where a confirm goes: onto the sheet.
 * @returns {void}
 */
function openNewSessionModelPick() {
  if (!sheetReady()) return
  // The sheet's fields keep the caret, and a window over them must not be
  // typed through: every key it does not claim would land in the field
  // behind it.
  var active = document.activeElement
  if (active && typeof active.blur === 'function') active.blur()
  readNewSessionModelList()
    .then(function (read) {
      if (!read.entries.length) {
        throw refusal(
          settings.favorites.length ? paletteText('modelNone') : paletteText('modelEmpty')
        )
      }
      if (!openModelWindow(read.entries, read.selection, read.level, read.chosen, read.groups, true)) {
        throw refusal(paletteText('modelUnsupported'))
      }
    })
    .catch(function (error) {
      showToast(
        error && error.explainsItself
          ? String(error.message)
          : paletteText('modelFailed') + ': ' + failureText(error)
      )
    })
}

/**
 * One press of the model key: open the picker on the list of models the
 * settings page configured.
 *
 * The key no longer walks the list itself. A window is the better seat for
 * a list you choose from once — the press opens it, `d` / `e` move, and a
 * press of the same key confirms, so the whole gesture is one key seen
 * three times rather than a guess at how many presses a target is away.
 *
 * Nothing is submitted here. Opening is a read, so a press that decides
 * against every model costs the host nothing.
 * @returns {void}
 */
function openModelPick() {
  var resolved = modelDirectoryOfCurrent()
  if (!resolved.ok) {
    showToast(resolved.reason)
    return
  }
  readModelList(resolved.directory)
    .then(function (read) {
      if (!read.entries.length) {
        // The same two lines the walk used, so an unconfigured list and a
        // list with nothing on offer still read the way they always did.
        throw refusal(
          settings.favorites.length ? paletteText('modelNone') : paletteText('modelEmpty')
        )
      }
      openModelWindow(read.entries, read.selection, read.level, read.chosen, read.groups)
    })
    .catch(function (error) {
      showToast(
        error && error.explainsItself
          ? String(error.message)
          : paletteText('modelFailed') + ': ' + failureText(error)
      )
    })
}

// ---------------------------------------------------------------------
// the model picker
// ---------------------------------------------------------------------

/** Margins, colors and sizing for the picker; a smaller sibling of PALETTE_UI. */
var MODELPICK_UI = {
  backdrop: {
    position: 'fixed',
    left: '0',
    top: '0',
    right: '0',
    bottom: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2147483001',
    // Like the task window: a surface to look through, never a wall. The
    // card is the only part that takes a click, and a press out here
    // cancels the picker the same way Escape does.
    pointerEvents: 'none',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    // One width for every list, not one per list. A card sized to its
    // content resizes itself when the selection moves onto a model with a
    // different number of levels, and a window that changes width under the
    // pointer reads as the page loading rather than as the selection moving.
    // A fixed width with a viewport cap keeps the shape of the card the same
    // for every model; a row that cannot fit clips its own levels, which is
    // cheaper than the card breathing.
    width: 'min(680px, 92vw)',
    maxHeight: '60vh',
    background: 'rgba(26, 26, 30, 0.98)',
    color: '#f2f2f4',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '10px',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
    overflow: 'hidden',
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 13px',
    fontSize: '0.86em',
    letterSpacing: '0.04em',
    opacity: '0.62',
    borderBottom: '1px solid rgba(255, 255, 255, 0.10)',
  },
  list: {
    flex: '1 1 auto',
    overflowY: 'auto',
    padding: '5px',
  },
  // Three cells in a fixed order: the model name, the levels and the
  // provider. The `current` tag lives inside the name cell, so no row is
  // holding an empty column open to keep the names lined up.
  row: {
    display: 'grid',
    // `minmax(0, 1fr)` on the levels track, not a bare `1fr`: a bare `1fr`
    // carries an automatic minimum of its content's min-content width, and a
    // non-wrapping level row has a min-content width of every chip added
    // together. The track would then refuse to shrink, the row would overrun
    // the card, and the card's own `overflow: hidden` would eat the provider
    // column — a bug that only shows on a long name or a many-level model.
    gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  rowActive: {
    background: 'rgba(255, 255, 255, 0.14)',
  },
  name: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: '0',
    overflow: 'hidden',
    fontSize: '0.94em',
  },
  // The name itself, which does the truncating. It is a span of its own so
  // the tag before it can stay a badge of its own size while a long name
  // ellipsises.
  nameText: {
    minWidth: '0',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  // The levels of one model, laid out flat on a single line. The cell clips
  // rather than pushes: the provider column is a fact about the row too, and
  // a level that cannot fit is a cheaper thing to lose than the provider.
  levels: {
    minWidth: '0',
    overflow: 'hidden',
    display: 'flex',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: '4px',
  },
  level: {
    flex: '0 0 auto',
    fontSize: '0.76em',
    padding: '1px 7px',
    borderRadius: '5px',
    whiteSpace: 'nowrap',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(242, 242, 244, 0.62)',
    cursor: 'pointer',
  },
  // The one level this row would submit. Deliberately the same violet family
  // as the `current` tag, because both answer "where am I" — and the row of
  // the model in effect is the one place the two coincide.
  levelOn: {
    background: 'rgba(196, 181, 253, 0.22)',
    color: '#c4b5fd',
  },
  // The landing level of a row that is not the selected one: the same
  // violet, without the chip of a button around it. It is a statement, not
  // a choice — `q` or `w` has to confirm it by moving there first.
  levelMarked: {
    flex: '0 0 auto',
    fontSize: '0.76em',
    padding: '0 2px',
    whiteSpace: 'nowrap',
    color: '#c4b5fd',
    opacity: '0.72',
  },
  levelNone: {
    fontSize: '0.76em',
    opacity: '0.38',
    whiteSpace: 'nowrap',
    cursor: 'default',
  },
  provider: {
    justifySelf: 'end',
    fontSize: '0.8em',
    opacity: '0.42',
    whiteSpace: 'nowrap',
  },
  // The `current` tag, a badge in front of the name inside the name cell.
  // It is not a column of its own: this is a window a user opens a few times
  // a month, and the empty column that kept the names lined up was costing
  // more width than it was buying alignment.
  here: {
    flex: '0 0 auto',
    fontSize: '0.74em',
    padding: '1px 6px',
    borderRadius: '5px',
    whiteSpace: 'nowrap',
    background: 'rgba(196, 181, 253, 0.18)',
    color: '#c4b5fd',
  },
  footer: {
    padding: '8px 13px',
    fontSize: '0.82em',
    opacity: '0.62',
    borderTop: '1px solid rgba(255, 255, 255, 0.10)',
  },
  empty: {
    padding: '14px',
    textAlign: 'center',
    opacity: '0.55',
    fontSize: '0.9em',
  },
  dim: {
    opacity: '0.45',
  },
}

/**
 * The line under the picker: what it is showing, and what the keys do.
 *
 * It names the keys by their live bindings rather than by letters, so
 * rebinding the model key, the level key, or the window's own up/down keys
 * cannot leave the window advertising a key that no longer does anything.
 * The reorder keys are named as the shifted form of the very keys that
 * reorder, because that is all they are: the same gesture, one modifier over.
 * @returns {string} the footer line.
 */
function modelPickHint() {
  if (MODELPICK.notice) return MODELPICK.notice
  if (MODELPICK.submitting) return paletteText('modelPickBusy')
  return (
    settings.modelKey +
    ' ' +
    paletteText('modelPickConfirm') +
    ' · ' +
    settings.paletteUpKey +
    ' / ' +
    settings.paletteDownKey +
    ' ' +
    paletteText('navigate') +
    ' · ' +
    keyLabel(settings.modelLevelKey) +
    ' ' +
    paletteText('modelPickLevel') +
    ' · Shift+' +
    settings.paletteUpKey +
    '/' +
    settings.paletteDownKey +
    ' ' +
    paletteText('modelPickReorder') +
    ' · Esc ' +
    paletteText('modelPickCancel')
  )
}

/** Repaint the picker's rows and footer from `MODELPICK.entries`. */
function renderModelPick() {
  if (!MODELPICK.list) return
  var list = MODELPICK.list
  list.textContent = ''
  MODELPICK.rows = []
  for (var i = 0; i < MODELPICK.entries.length; i++) {
    list.appendChild(buildModelRow(MODELPICK.entries[i], i))
  }
  if (MODELPICK.footer) MODELPICK.footer.textContent = modelPickHint()
  keepModelPickVisible()
}

/**
 * The level one row is currently marked with.
 *
 * A row the user has not stepped on carries the rule's answer. The selected
 * row carries whatever the level key last moved it to. Moving to another row
 * drops that mark — the choice is one row and one level, confirmed once, and
 * a level remembered from a row the user has left would submit something
 * they never looked at.
 * @param {number} index - the row's place on the list.
 * @returns {string|undefined} the level id, undefined for the default.
 */
function markedLevel(index) {
  if (index === MODELPICK.index && MODELPICK.levelSet) return MODELPICK.level
  return rowMarkedLevel(MODELPICK.entries[index], MODELPICK.here)
}

/**
 * The level one confirm would submit.
 *
 * A mark the user placed is submitted as it stands, including "the provider
 * default", which is the one level that is submitted by leaving the field
 * off. An untouched row submits the carried-over level when there is one to
 * carry, and otherwise nothing at all — see `rowSubmitLevel` for why a model
 * default is never sent back as a choice.
 * @returns {string|undefined} the level id, undefined for none.
 */
function confirmLevel() {
  if (MODELPICK.levelSet) return MODELPICK.level
  return rowSubmitLevel(MODELPICK.entries[MODELPICK.index], MODELPICK.here)
}

/**
 * One row of the picker: the model's name with the `current` tag in front of
 * it, the levels it publishes, and its provider.
 *
 * Three cells. The tag leads the row so the eye can find the model in effect
 * without reading across, and it rides inside the name cell rather than in a
 * column of its own: the blank column that kept the names lined up was
 * costing every row its width for an alignment worth little in a list this
 * short.
 *
 * The levels are drawn in full only on the row that is selected. Deciding
 * happens on one row at a time, and the other rows' levels are the whole
 * reason every row was two lines tall; each one still says where it would
 * land, so nothing is hidden that a reader came to look for.
 * @param {object} entry - a catalog entry, with `levels` and `defaultLevel`.
 * @param {number} index - its place on the list.
 * @returns {Element} the row.
 */
function buildModelRow(entry, index) {
  var row = document.createElement('div')
  Object.assign(row.style, MODELPICK_UI.row)
  if (index === MODELPICK.index) Object.assign(row.style, MODELPICK_UI.rowActive)
  row.setAttribute('role', 'option')
  row.setAttribute('aria-selected', index === MODELPICK.index ? 'true' : 'false')
  var name = document.createElement('span')
  Object.assign(name.style, MODELPICK_UI.name)
  name.setAttribute('data-role', 'name')
  if (isCurrentEntry(entry, MODELPICK.here)) {
    var tag = document.createElement('span')
    Object.assign(tag.style, MODELPICK_UI.here)
    tag.setAttribute('data-role', 'here')
    tag.textContent = paletteText('modelPickHere')
    name.appendChild(tag)
  }
  var text = document.createElement('span')
  Object.assign(text.style, MODELPICK_UI.nameText)
  text.setAttribute('data-role', 'nameText')
  text.textContent = entry.name
  name.appendChild(text)
  row.appendChild(name)
  row.appendChild(buildLevelCell(entry, index))
  var provider = document.createElement('span')
  Object.assign(provider.style, MODELPICK_UI.provider)
  provider.setAttribute('data-role', 'provider')
  provider.textContent = entry.provider
  row.appendChild(provider)
  // A click is a choice and a confirmation in one, which is what a pointer
  // has instead of a second press of the key.
  row.addEventListener('click', function () {
    MODELPICK.index = index
    MODELPICK.levelSet = false
    confirmModelPick()
  })
  MODELPICK.rows.push(row)
  return row
}

/**
 * The levels of one model.
 *
 * The selected row gets every level as a chip, because that is the row the
 * decision is being made on. Any other row gets the one level it would land
 * on and nothing else: the full scale of a row nobody is looking at is what
 * makes every row two lines tall, and it is the whole reason a three-model
 * list fills the card.
 *
 * A model that publishes no levels says so in words on either row. The
 * blank would read as "this model has levels I am not being shown", and the
 * one thing worse than no choice is a choice that looks withheld.
 * @param {object} entry - a catalog entry.
 * @param {number} index - the row's place on the list.
 * @returns {Element} the cell.
 */
function buildLevelCell(entry, index) {
  var cell = document.createElement('span')
  Object.assign(cell.style, MODELPICK_UI.levels)
  cell.setAttribute('data-role', 'levels')
  var levels = entry.levels || []
  if (!levels.length) {
    var none = document.createElement('span')
    Object.assign(none.style, MODELPICK_UI.levelNone)
    none.setAttribute('data-role', 'landed')
    none.textContent = paletteText('modelPickNoLevel')
    cell.appendChild(none)
    return cell
  }
  var marked = markedLevel(index)
  var at = levelIndex(levels, marked)
  if (index !== MODELPICK.index) {
    var land = document.createElement('span')
    Object.assign(land.style, MODELPICK_UI.levelMarked)
    land.setAttribute('data-role', 'landed')
    land.textContent = at < 0 ? paletteText('modelPickLevel') : levels[at].name
    cell.appendChild(land)
    return cell
  }
  for (var i = 0; i < levels.length; i++) {
    var level = levels[i]
    var chip = document.createElement('span')
    Object.assign(chip.style, MODELPICK_UI.level)
    if (i === at) Object.assign(chip.style, MODELPICK_UI.levelOn)
    chip.setAttribute('data-role', 'level')
    chip.textContent = level.name
    chip.setAttribute('role', 'button')
    chip.setAttribute('aria-pressed', i === at ? 'true' : 'false')
    chip.addEventListener('click', levelClickHandler(index, level))
    cell.appendChild(chip)
  }
  return cell
}

/**
 * The press handler for one level chip.
 *
 * Built per chip so the row, the level and its place are captured by value:
 * one shared handler would read whichever level the loop had reached by the
 * time the press arrived. The event is stopped because the chip sits on a
 * row that is itself a click-to-confirm target, and a level is not a model.
 *
 * A chip click submits at once rather than only moving the mark. That is the
 * same bargain the row's own click makes — a pointer has no second press of
 * the key — and it is the only way a mouse can reach a level at all.
 * @param {number} index - the row's place on the list.
 * @param {object} level - the level this chip stands for.
 * @returns {Function} the click handler.
 */
function levelClickHandler(index, level) {
  return function (ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault()
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (MODELPICK.submitting) return
    MODELPICK.index = index
    MODELPICK.levelSet = true
    MODELPICK.level = level.id
    renderModelPick()
    confirmModelPick()
  }
}

/** Keep the selected row in sight when the list is longer than the card. */
function keepModelPickVisible() {
  var node = MODELPICK.rows[MODELPICK.index]
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ block: 'nearest' })
  }
}

/**
 * Mount the picker, with the selection already on the model in effect.
 *
 * Opening on the current model is what makes the window answer the question
 * it was opened with: pressing the key and then the key again is a no-op on
 * the model you are already on, and one step is one press of `d`.
 * @param {Array} entries - the models one press could land on.
 * @param {object} selection - the selection in effect.
 * @param {string|undefined} level - the level shown as in effect.
 * @param {string|undefined} chosen - the level explicitly chosen, if any.
 * @param {Array} groups - the catalog groups the entries were read from.
 * @param {boolean} [forNewSession] - whether the choice is for the sheet's
 *   new conversation rather than for the one on screen.
 * @returns {boolean} whether the window is now open.
 */
function openModelWindow(entries, selection, level, chosen, groups, forNewSession) {
  if (MODELPICK.open) return true
  if (!document.body) return false
  stopHold()
  stopAnim()
  // The window is modal, so a caret it left behind must not be handed back
  // when the window closes: this press was not a request for the keyboard.
  clearFocusRequest()
  MODELPICK.entries = entries
  MODELPICK.groups = groups || []
  MODELPICK.here = {
    provider: selection.provider,
    model: selection.model,
    level: level,
    chosen: chosen,
  }
  var at = modelIndex(entries, selection.provider, selection.model)
  // Off the list — the session default, or a model since removed — the
  // selection starts at the top rather than nowhere.
  MODELPICK.index = at < 0 ? 0 : at
  MODELPICK.level = level
  MODELPICK.levelSet = false
  MODELPICK.notice = ''
  MODELPICK.submitting = false
  MODELPICK.forNewSession = !!forNewSession
  MODELPICK.open = true

  var host = document.createElement('div')
  Object.assign(host.style, MODELPICK_UI.backdrop)
  var panel = document.createElement('div')
  Object.assign(panel.style, MODELPICK_UI.panel)
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', paletteText('modelPick'))
  panel.className = 'dshv-window'
  panel.style.fontSize = settings.paletteFont + 'px'
  var header = document.createElement('div')
  Object.assign(header.style, MODELPICK_UI.header)
  var label = document.createElement('span')
  label.textContent = paletteText('modelPick')
  var count = document.createElement('span')
  count.textContent = ''
  header.appendChild(label)
  header.appendChild(count)
  var list = document.createElement('div')
  Object.assign(list.style, MODELPICK_UI.list)
  list.setAttribute('role', 'listbox')
  var footer = document.createElement('div')
  Object.assign(footer.style, MODELPICK_UI.footer)
  footer.textContent = modelPickHint()
  panel.appendChild(header)
  panel.appendChild(list)
  panel.appendChild(footer)
  host.appendChild(panel)
  document.body.appendChild(host)

  MODELPICK.host = host
  MODELPICK.list = list
  MODELPICK.footer = footer
  renderModelPick()
  if (state.debug) {
    console.log('[dsh-vim] model picker', MODELPICK.entries.length, 'entries, at', MODELPICK.index)
  }
  return true
}

/** Unmount the picker and forget everything it was showing. */
function closeModelPick() {
  if (!MODELPICK.open && !MODELPICK.host) return false
  MODELPICK.open = false
  if (MODELPICK.host && MODELPICK.host.parentNode) {
    MODELPICK.host.parentNode.removeChild(MODELPICK.host)
  }
  MODELPICK.host = null
  MODELPICK.list = null
  MODELPICK.footer = null
  MODELPICK.rows = []
  MODELPICK.entries = []
  MODELPICK.groups = []
  MODELPICK.index = 0
  MODELPICK.here = null
  MODELPICK.level = undefined
  MODELPICK.levelSet = false
  MODELPICK.notice = ''
  MODELPICK.submitting = false
  MODELPICK.forNewSession = false
  return true
}

/**
 * Move the picker's selection, wrapping at both ends.
 *
 * Wrapping rather than stopping: the list is short and hand-ordered, so the
 * step from the last entry back to the first is the same kind of move as
 * any other, and a key that sometimes does nothing is worse than one that
 * always moves.
 *
 * The level mark is dropped with the move: the marked level belonged to the
 * row the user was on, and carrying it to a model that publishes a different
 * scale would either be rejected by the host or quietly mean something else.
 * @param {number} delta - entries to move, positive is down.
 * @returns {void}
 */
function moveModelPick(delta) {
  var count = MODELPICK.entries.length
  if (!count) return
  var next = (MODELPICK.index + delta) % count
  if (next < 0) next += count
  if (next === MODELPICK.index) return
  MODELPICK.index = next
  MODELPICK.levelSet = false
  renderModelPick()
}

/**
 * Put the selected model somewhere else in the list, and remember it there.
 *
 * The order is the user's, not the catalog's: it is the sequence the `d` /
 * `e` walk follows and the sequence the settings page's list shows, so
 * writing it there is the one way both agree. That makes the window the
 * quicker place to arrange a list of a handful of models, and the choice
 * survives a reload because `applyPatch` persists it like any other setting.
 *
 * Only the *order* moves. The selection stays on the same model, because a
 * move that also changed what is under the cursor would make a two-press
 * reorder land somewhere the user was not looking. Neither end is refused:
 * the ends are where a row is being pushed out of, and stopping at them would
 * make the key answer differently at the top and bottom of a short list.
 * @param {number} delta - places to move, positive is down.
 * @returns {void}
 */
function moveModelPickEntry(delta) {
  var count = MODELPICK.entries.length
  if (count < 2) return
  var from = MODELPICK.index
  var to = from + delta
  if (to < 0 || to >= count) return
  // Take the model out, then put it back where it was asked for. Inserting
  // at `to` in the list it was removed from is what makes both directions
  // land one place away: the same move up as down, mirrored.
  var rest = []
  for (var i = 0; i < count; i++) {
    if (i === from) continue
    rest.push({ provider: MODELPICK.entries[i].provider, model: MODELPICK.entries[i].model })
  }
  rest.splice(to, 0, {
    provider: MODELPICK.entries[from].provider,
    model: MODELPICK.entries[from].model,
  })
  applyPatch({ favorites: reorderFavorites(settings.favorites, rest) })
  // The rows are rebuilt from the catalog this window was opened against, so
  // a model that has dropped out in the meantime is not quietly backfilled
  // from the edited list.
  MODELPICK.entries = modelEntries(MODELPICK.groups, rest)
  MODELPICK.index = to
  MODELPICK.levelSet = false
  renderModelPick()
}

/**
 * Put an ordered list of pairs back into the configured one, in the new
 * order, with anything it left out keeping its place at the end.
 *
 * The configured list can hold a model the catalog does not offer right now
 * — a signed-out provider, a model since removed — and those rows are not on
 * screen. Dropping them because the user moved a visible one would be a
 * silent edit of a list nobody was looking at.
 * @param {Array} favorites - the configured pairs, in their old order.
 * @param {Array} order - the pairs to place, in their new order.
 * @returns {Array} the configured pairs, reordered.
 */
function reorderFavorites(favorites, order) {
  var kept = []
  var seen = {}
  for (var i = 0; i < order.length; i++) {
    kept.push(order[i])
    seen[order[i].provider + '/' + order[i].model] = true
  }
  for (var f = 0; f < favorites.length; f++) {
    var key = favorites[f].provider + '/' + favorites[f].model
    if (!seen[key]) kept.push(favorites[f])
  }
  return kept
}

/**
 * Step the level of the selected row, wrapping at both ends.
 *
 * Starting point is the row's own mark when the user has already moved it,
 * and otherwise the level that row would land on — so the first press
 * continues from what is on screen rather than from some other model's
 * scale. A mark the adapter no longer publishes starts the walk over, at the
 * first notch going forward and the last going back, which is where the
 * reasoning key lands from the same state. A model that publishes no levels
 * is answered in words: the row already says so, and a key that silently
 * does nothing reads as broken.
 * @param {number} delta - levels to move, positive is forward.
 * @returns {void}
 */
function stepModelPickLevel(delta) {
  var entry = MODELPICK.entries[MODELPICK.index]
  if (!entry) return
  var levels = entry.levels || []
  if (!levels.length) {
    MODELPICK.notice = paletteText('modelPickNoLevel')
    if (MODELPICK.footer) MODELPICK.footer.textContent = modelPickHint()
    return
  }
  var at = levelIndex(levels, markedLevel(MODELPICK.index))
  var to
  if (at < 0) to = delta > 0 ? 0 : levels.length - 1
  else to = ((at + delta) % levels.length + levels.length) % levels.length
  MODELPICK.level = levels[to].id
  MODELPICK.levelSet = true
  MODELPICK.notice = ''
  renderModelPick()
}

/**
 * Confirm the selected row: submit its model at its marked level, then take
 * the window down.
 *
 * The window closes on success and stays up on failure, with the host's own
 * reason in its footer. That is the whole difference from a cycle: a refused
 * switch has somewhere to be read, and the selection that was refused is
 * still there to try again.
 * @returns {void}
 */
function confirmModelPick() {
  if (!MODELPICK.open || MODELPICK.submitting) return
  var entry = MODELPICK.entries[MODELPICK.index]
  if (!entry) return
  var level = confirmLevel()
  if (MODELPICK.forNewSession) {
    // There is no conversation to submit to yet: the choice is kept for the
    // one the sheet is about to make, and lands on it when it exists. What the
    // sheet does with it belongs to the board, so it is handed over.
    if (sheetPick) {
      sheetPick({
        provider: entry.provider,
        model: entry.model,
        name: entry.name,
        level: level,
        levelName: levelName(entry, level),
      })
    }
    closeModelPick()
    return
  }
  var resolved = modelDirectoryOfCurrent()
  if (!resolved.ok) {
    MODELPICK.notice = resolved.reason
    if (MODELPICK.footer) MODELPICK.footer.textContent = modelPickHint()
    return
  }
  MODELPICK.submitting = true
  MODELPICK.notice = ''
  if (MODELPICK.footer) MODELPICK.footer.textContent = modelPickHint()
  var directory = resolved.directory
  switchModel(directory, entry, level)
    .then(function () {
      closeModelPick()
      showToast(modelToast(entry, level))
    })
    .catch(function (error) {
      // `closeModelPick` may have run underneath us — Escape during a slow
      // submit — in which case the window is gone and the reason belongs on
      // the notice line instead of in a footer nobody can see.
      if (!MODELPICK.open) {
        showToast(
          error && error.explainsItself
            ? String(error.message)
            : paletteText('modelFailed') + ': ' + failureText(error)
        )
        return
      }
      MODELPICK.submitting = false
      MODELPICK.notice =
        error && error.explainsItself
          ? String(error.message)
          : paletteText('modelFailed') + ': ' + failureText(error)
      if (MODELPICK.footer) MODELPICK.footer.textContent = modelPickHint()
    })
}

/**
 * The one-line notice after a switch, naming the level when the row has one.
 *
 * The level is part of what was just chosen, and leaving it off would make a
 * level-only change read as a model change — the two are separate keys, and
 * the notice is where the user finds out which one moved.
 * @param {object} entry - the row that was submitted.
 * @param {string|undefined} level - the level that was submitted.
 * @returns {string} the notice line.
 */
function modelToast(entry, level) {
  var line = paletteText('model') + ' ' + entry.name
  var name = levelName(entry, level)
  return name === null ? line : line + ' · ' + name
}

/**
 * Route one keystroke to the open picker.
 *
 * Escape cancels, which is free: nothing was submitted on the way in. The
 * model movement keys are the task window's own, so one pair of bindings
 * serves both windows; the level keys are the model window's alone, since
 * there is nothing to step a level on anywhere else. The reasoning key
 * joins the level keys rather than standing down — it means "one level
 * further" here too, and answering it is better than swallowing a key the
 * user pressed on purpose. The model key is not here — it confirms, and it is
 * answered before this by the same branch that opened the window, because it
 * has to work whether or not the window is up.
 * @param {KeyboardEvent} ev - keydown event.
 * @param {string} key - lower-cased key.
 * @returns {boolean} whether the picker consumed it.
 */
function modelPickKeyDown(ev, key) {
  if (key === 'escape') {
    closeModelPick()
    return true
  }
  // The level keys come before the row movement, because one of them ships
  // as Tab: Tab used to move the selection here, and a bound key must be
  // answered before the alias it replaced or rebinding it would look like a
  // binding that does nothing. ←/→ are fixed aliases, exactly as ↑/↓ are for
  // the row keys.
  if (key !== '' && key === String(settings.modelLevelKey).toLowerCase()) {
    stepModelPickLevel(ev.shiftKey ? -1 : 1)
    return true
  }
  // The reasoning key, routed here rather than run against the conversation
  // behind the window: this window is drawing that level.
  if (key !== '' && key === settings.effortKey) {
    stepModelPickLevel(1)
    return true
  }
  if (ev.key === 'ArrowRight') {
    stepModelPickLevel(1)
    return true
  }
  if (ev.key === 'ArrowLeft') {
    stepModelPickLevel(-1)
    return true
  }
  // Tab only stops moving the selection while it is the level seat. Rebind
  // the level key elsewhere and Tab goes back to what it always did, rather
  // than becoming a key that does nothing at all.
  var tabMoves = String(settings.modelLevelKey).toLowerCase() !== 'tab'
  var down =
    key === settings.paletteDownKey ||
    ev.key === 'ArrowDown' ||
    (tabMoves && ev.key === 'Tab' && !ev.shiftKey)
  var up =
    key === settings.paletteUpKey || ev.key === 'ArrowUp' || (tabMoves && ev.key === 'Tab' && ev.shiftKey)
  // Shift on a movement key reorders instead of moving the cursor. The same
  // keys and the same arrows, so the gesture is "the same move, but the row
  // itself goes" — no second seat, and a rebind of the movement keys carries
  // the reordering with it.
  if (ev.shiftKey && (down || up)) {
    moveModelPickEntry(up ? -1 : 1)
    return true
  }
  if (down) {
    moveModelPick(1)
    return true
  }
  if (up) {
    moveModelPick(-1)
    return true
  }
  // Enter is the standing alias for confirming, exactly as it is in the
  // task window: a list that swallows the one key every list confirms with
  // is a trap.
  if (key === 'enter') {
    confirmModelPick()
    return true
  }
  return false
}


export { MODELPICK, closeModelPick, confirmLevel, confirmModelPick, markedLevel, modelPickKeyDown, openModelPick, openNewSessionModelPick, renderModelPick }
