/**
 * The task window (f): the conversation pool split into what waits on the
 * reader, what is in flight, and the recent list; the rows, the selection and
 * the rename box; and the clocks the running chips carry.
 * 
 * The window is modal while it is up, and it owns no other surface. Where it
 * would otherwise reach into a peer — the board's open flag, switching the
 * main view, pinning a row — the peer supplies the action through a setter.
 */
import { DEFAULTS, DONE_PULSE_MS, PALETTE_LIMIT, PALETTE_STEP, PALETTE_WINDOW_MS, PHASES, PLACES, ROW_CELLS } from './constants.js'
import { paletteText } from './strings.js'
import { settings } from './preferences.js'
import { isEditable } from './dom.js'
import { reducedMotion, state, stopAnim, stopHold } from './scroll.js'
import { clearFocusRequest } from './focus.js'
import { attentionOf, elapsedText, runSince, watchRuns } from './runs.js'
import { conversationPool, currentSession, folderIndex, hereIndex, statusIsLive, statusOf, taskServices } from './sessions.js'
import { archiveSession, renameSession } from './session-actions.js'
import { PHASES_MODEL } from './phases.js'
import { requestTurns as requestTurnCounts, drainPeeks as drainTurnPeeks, cancelPeeks as cancelTurnCounts, turnsOf } from './turns.js'

/**
 * The board's open flag. The task window refuses to open over it; the board
 * itself is built later and supplies the answer.
 * @type {Function}
 */
let boardIsOpen = function () {
  return false
}

/**
 * Register the board's own open probe.
 * @param {Function} fn - returns whether the board window is up.
 * @returns {void}
 */
export function setBoardOpenProbe(fn) {
  boardIsOpen = fn || function () {
    return false
  }
}

/**
 * Switch the main view, supplied by the dispatcher that owns the window stack.
 * @type {Function}
 */
let openSession = function () {}

/**
 * Register the way a row opens its conversation.
 * @param {Function} fn - takes a session id.
 * @returns {void}
 */
export function setSessionOpener(fn) {
  openSession = fn || function () {}
}

/**
 * Put one conversation on the board, supplied by the board itself.
 * @type {Function}
 */
let pinSession = function () {}

/**
 * Register the board's pin action.
 * @param {Function} fn - takes a session id.
 * @returns {void}
 */
export function setPinAction(fn) {
  pinSession = fn || function () {}
}


/**
 * Queue a turn count for every drawn row that does not have one yet. The
 * count paints itself in through the repaint handed to the reader module,
 * and that repaint also opens the next slot.
 * @returns {void}
 */
function requestTurns() {
  requestTurnCounts(PALETTE.rows, turnCountLanded)
}

/**
 * A count landed: the rows are stale, and the next queued slot may open.
 * Only the drain is re-run, not the request — a row the host has no count
 * for must not be asked for again on every landing.
 * @returns {void}
 */
function turnCountLanded() {
  if (!PALETTE.open) return
  renderPalette()
  drainTurnPeeks(turnCountLanded)
}

/** Drop every queued and in-flight turn read. */
function cancelPeeks() {
  cancelTurnCounts()
}

/**
 * Mark one conversation, or take the mark off it, and repaint.
 *
 * Pressing the stage a conversation already carries clears it, which is how
 * a stage is removed: the control offers the same three words either way, so
 * "unmark" needs no word of its own — the lit one is the way back out. The
 * repaint is the point of routing every write through here: the ledger moves
 * at once, but a row still shows the old stage until something redraws it,
 * so a mark made here and one made by the stage key land the same way.
 * @param {string} id - session id.
 * @param {string} phase - the stage to mark, or the one to clear.
 * @returns {string} the stage now in effect ('' when it was cleared).
 */
function setStage(id, phase) {
  var next = PHASES_MODEL.get(id) === phase ? PHASES_MODEL.clear(id) : PHASES_MODEL.set(id, phase)
  if (PALETTE.open) renderPalette()
  return next
}

/**
 * The press handler for one stage word on one row.
 *
 * Built per word so the row and the stage are captured by value: a single
 * shared handler would read whichever row and stage the loop had reached by
 * the time the press arrived. The event is stopped because the row it sits
 * on switches conversations, and marking a stage is not that.
 * @param {string} id - session id.
 * @param {string} phase - the stage this word stands for.
 * @returns {Function} the mousedown handler.
 */
function stageHandler(id, phase) {
  return function (ev) {
    ev.preventDefault()
    ev.stopPropagation()
    setStage(id, phase)
  }
}

/**
 * Advance one conversation to the next stage, and repaint the window.
 *
 * Kept beside the click path as the keyboard's way through the same
 * vocabulary: the words on the row already show the order, so a press of the
 * stage key no longer asks the reader to remember it.
 * @param {string} id - session id.
 * @returns {string} the stage now in effect ('' when it cycled to idle).
 */
function cyclePhase(id) {
  var next = PHASES_MODEL.cycle(id)
  if (PALETTE.open) renderPalette()
  return next
}

// ---------------------------------------------------------------------
// scroll engine
// ---------------------------------------------------------------------

/**
 * Capture-phase key handler. Runs before the app's own handlers so the
 * composer never sees an intercepted key, and bails out on anything the
 * user is typing into.
 *
 * The task window is modal: while it is open it owns every keystroke, and
 * the scroll engine stays suspended.
 * @param {KeyboardEvent} ev - keydown event.
 */

/**
 * The task window: the conversation pool it was opened against, the rows it
 * is showing, the selected index, and the nodes it paints them into.
 *
 * `here` is the conversation on screen for this repaint, by id; the tag
 * column is decided from it before any row is drawn.
 */
var PALETTE = {
  open: false,
  pool: [],
  /**
   * The attention blocks, read off the whole pool before any recency cut:
   * `mine` is what is waiting on the reader, `live` what is in flight and
   * needs nobody. Kept apart from `today` / `older` because they answer a
   * different question and are not subject to the same window or cap.
   */
  mine: [],
  live: [],
  /**
   * The browsing block: today's conversations, and everything older behind
   * the "More" seat. Kept apart so the seat knows what it is revealing and a
   * feed update can hold the depth the reader had already reached.
   */
  today: [],
  /**
   * Whether `today` holds the fallback batch rather than the last three
   * hours. The rows are the same either way; the heading is not, and a
   * heading that says "recent" over three-day-old rows is a lie the reader
   * can read off the screen.
   */
  stale: false,
  older: [],
  /** How many of `older` are currently on screen. Zero until asked for. */
  olderShown: 0,
  rows: [],
  /**
   * The blocks this repaint drew, in order: `{kind, label, count, rows}`.
   * `kind` is `folder`, `plain` (conversations no folder accounts for) or
   * `more`; only the labelled kinds get a header line.
   */
  sections: [],
  /**
   * The row elements, indexed the way `index` is. Headers are not rows and
   * are not in here, which is what keeps "selection index" and "row DOM"
   * from drifting apart now that the list carries headers.
   */
  nodes: [],
  index: 0,
  /**
   * Whether the selection is standing on the "More" seat rather than on a
   * conversation.
   *
   * The seat is a heading, and headings are deliberately not rows — the row
   * index and the row DOM are parallel arrays, and letting a heading into
   * either would put every consumer of "the selected row" out of step with
   * what is on screen. So the seat is a flag beside the index instead: the
   * index keeps pointing at the last row (which is where the seat sits), and
   * this says the selection has stepped off it onto the seat. It is the one
   * exception, and it exists because the seat is the only heading with
   * something behind it to reach.
   */
  onMore: false,
  host: null,
  list: null,
  /** The headline above the list: what is waiting on the reader. */
  label: null,
  count: null,
  footer: null,
  /** The conversation on screen for this repaint, by id; '' when none. */
  here: '',
  /** Whether `here` is one of the rows this repaint is drawing. */
  hereOn: false,
  renameInput: null,
  renaming: null,
  folders: Object.create(null),
  /**
   * The shared column tracks of the rows on screen, and the cells they were
   * fitted to. `auto` until the repaint has measured them, which is what
   * lets the tag, state, turn and time cells line up down the list.
   */
  tracks: { here: 'auto', phase: 'auto', status: 'auto', turns: 'auto', meta: 'auto' },
  /** The template those tracks last produced, so a no-op fit writes nothing. */
  template: '',
  /** The cells of this repaint, per shared column. */
  columns: { here: [], phase: [], status: [], turns: [], meta: [] },
  /** The live clocks of this repaint: { chip, label, since } per running row. */
  clocks: [],
  /** The "just finished" chips of this repaint, in draw order. */
  doneChips: [],
  /** The one-second tick that keeps those clocks honest. */
  clockTimer: 0,
  unsubscribes: [],
}

/**
 * How often the live clocks repaint: one minute, which is the resolution
 * they now show.
 *
 * It used to be a second, and a second is the wrong resolution for the
 * question a clock on this list answers. Nobody decides what to do next from
 * the difference between 3:19 and 3:20. What a one-second tick actually did
 * was put every running conversation on screen into a visible heartbeat at
 * the same moment — which is precisely the sensation of having several
 * things in flight and a grip on none of them. A minute still says "this has
 * been going a while" and stops being a pulse.
 */
var CLOCK_INTERVAL_MS = 60 * 1000

/**
 * Chrome for the task window. A dark card reads correctly under both the
 * light and the dark shell theme, so the plugin never has to read theme
 * state to stay legible.
 */
var PALETTE_UI = {
  backdrop: {
    position: 'fixed',
    left: '0',
    top: '0',
    right: '0',
    bottom: '0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.35)',
    zIndex: '2147483000',
    // The window stays up while the page behind it is used, so the backdrop
    // is a surface to look through, not a wall: the card takes the clicks,
    // everything under the backdrop keeps working. This is also what lets
    // the pointer tell the two apart — `elementFromPoint` over the card
    // answers with the card, and anywhere else answers with the page.
    // A press out there therefore reaches the page *and* puts the window
    // away, which is the exit that needs no key.
    pointerEvents: 'none',
  },
  panel: {
    marginTop: '14vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(26, 26, 30, 0.98)',
    color: '#f2f2f4',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '12px',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
    overflow: 'hidden',
    // The card is the one part of the overlay that is interactive.
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    fontSize: '0.88em',
    letterSpacing: '0.04em',
    opacity: '0.6',
    borderBottom: '1px solid rgba(255, 255, 255, 0.10)',
  },
  list: {
    flex: '1 1 auto',
    overflowY: 'auto',
    padding: '6px',
  },
  /**
   * A grid, not a row of boxes: every cell keeps its column, so the
   * right-hand cells line up down the list and the names all begin at the
   * same x. The track list itself is per-repaint (see `rowColumns`); this is
   * everything that does not move.
   */
  row: {
    display: 'grid',
    alignItems: 'center',
    gap: '8px',
    // Horizontal padding only: the vertical half is the row-spacing
    // preference, written per row in `buildRow`.
    padding: '0 10px',
    borderRadius: '7px',
    cursor: 'pointer',
  },
  rowActive: {
    background: 'rgba(255, 255, 255, 0.12)',
  },
  /**
   * A row in the "in flight" block: the same row, told to stop asking for
   * attention.
   *
   * It stays fully legible and fully clickable — it is still a conversation
   * the reader may want to open, and hiding it behind a low contrast would
   * trade one problem for a worse one. What it gives up is weight: the
   * block is the window's background noise, and it should read as such at a
   * glance without the reader having to check the heading.
   */
  rowLive: {
    opacity: '0.62',
  },
  /**
   * A block heading: a folder name, or the "More" seat.
   *
   * It is not a row and must not read as one — no hover, no selection, no
   * pointer — so it carries no border, no radius and a weaker colour than
   * any row's text. It sits above its rows rather than beside them, which
   * is why it is not part of the row grid at all.
   *
   * It is dimmer than a row, not faint: with the folder name off every row,
   * this heading is the one thing that says which folder the rows under it
   * belong to, so it has to carry that on its own.
   */
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 10px 2px',
    fontSize: '0.8em',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    opacity: '0.62',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  sectionName: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  sectionCount: {
    flex: '0 0 auto',
    fontVariantNumeric: 'tabular-nums',
  },
  /** The "More" seat: a heading that also says how much is behind it. */
  sectionMore: {
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.10)',
  },
  /**
   * The "More" seat with the cursor on it.
   *
   * It borrows the row selection's background because that is what it is —
   * the cursor is here — and a heading that lit up in some third colour
   * would read as a different kind of thing from every other thing the
   * cursor can stand on.
   */
  sectionActive: {
    background: 'rgba(255, 255, 255, 0.12)',
    borderRadius: '7px',
    opacity: '0.92',
  },
  /**
   * The folder a row lives in, in front of its name rather than beside it.
   *
   * Plain dimmed text, not a badge: the "More" block can be forty rows long
   * and forty little pills in a column of their own is noise, and the whole
   * point of dropping the column is that nothing here costs a row its width.
   * The gap is the separator — the reader is told which folder by reading it,
   * not by a shape that could be mistaken for the state chip's.
   */
  folderPrefix: {
    fontSize: '0.82em',
    opacity: '0.5',
    whiteSpace: 'nowrap',
    marginRight: '8px',
  },
  title: {
    minWidth: '0',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    textAlign: 'left',
  },
  /**
   * The conversation's name, inside the name cell.
   *
   * Dimmed, and deliberately so: the folder prefix in front of it is the
   * thing that says where a row lives, and the name is what the reader reads
   * once the folder has told them this row is worth reading. Weighting them
   * the other way round made every row look equally worth reading, which is
   * what a flat list has to avoid — a screen of names all at full strength
   * is a screen nobody scans.
   *
   * It stays well clear of unreadable: this is still the row's own subject.
   * The opacity sits on this span rather than on the cell around it because
   * the folder prefix is a child of that cell, and opacity multiplies — a
   * dimmed cell would have taken the already-dim prefix down with it.
   */
  nameText: {
    opacity: '0.72',
  },
  renameInput: {
    minWidth: '0',
    font: 'inherit',
    fontSize: '1em',
    padding: '2px 6px',
    borderRadius: '5px',
    border: '1px solid rgba(255, 255, 255, 0.38)',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#f2f2f4',
    outline: 'none',
  },
  meta: {
    justifySelf: 'end',
    fontSize: '0.82em',
    opacity: '0.5',
    // "2 小时前" is one thought, and the column is measured off these cells:
    // see the note on `turns`.
    whiteSpace: 'nowrap',
  },
  turns: {
    justifySelf: 'end',
    fontSize: '0.82em',
    opacity: '0.38',
    // Never wrap, for two reasons: "13 轮" on two lines reads as noise, and
    // a cell that wraps reports the wrapped width as its content width, so
    // the column it shares would be fitted to its own damage.
    whiteSpace: 'nowrap',
  },
  /**
   * The state chip, leading the row.
   *
   * It leads because it answers the question the window exists for, but it
   * must not shout the name down: the chip is a small tinted word, the name
   * is the conversation itself. Left-aligned inside its fitted track so the
   * chips all start on the same x, the way the names behind them do.
   */
  status: {
    justifySelf: 'start',
    fontSize: '0.82em',
    padding: '1px 7px',
    borderRadius: '5px',
    whiteSpace: 'nowrap',
  },
  /**
   * "Where you are", as a chip of its own beside the state.
   *
   * Violet rather than one of the state colours: those mean something —
   * running, waiting on you, just finished — and a tag that is only about
   * which row the window is pointing at must not borrow that language.
   */
  here: {
    justifySelf: 'end',
    fontSize: '0.82em',
    padding: '1px 7px',
    borderRadius: '5px',
    whiteSpace: 'nowrap',
    color: '#c4b5fd',
    background: 'rgba(167, 139, 250, 0.16)',
  },
  statusPending: { color: '#fbbf24', background: 'rgba(251, 191, 36, 0.14)' },
  statusRunning: { color: '#4ade80', background: 'rgba(74, 222, 128, 0.14)' },
  statusDone: { color: '#7dd3fc', background: 'rgba(125, 211, 252, 0.14)' },
  /**
   * The stage control: all three stages laid out on every row, the current
   * one lit.
   *
   * Laying the whole vocabulary out is what removes the guesswork a single
   * chip had. A lone chip showed one word and left the reader to wonder what
   * the other options were, in what order they came, and what an empty seat
   * even meant; here every row shows the same three words, so the set and
   * the order need no remembering, and "unmarked" is plainly all three
   * dimmed rather than a placeholder character nobody can read.
   *
   * A word is a button: press it to mark, press the lit one to take the mark
   * off. Colour alone would be too quiet a signal — dim grey against a
   * coloured word is easy to miss at a glance — so the current one is also
   * weighted heavier, which is both what the eye catches first and a plain
   * fact a test can assert.
   */
  stageBox: {
    justifySelf: 'end',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '0.82em',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  stage: {
    padding: '1px 5px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#8b8f96',
    background: 'transparent',
  },
  /** The stage that is actually marked. */
  stageOn: { fontWeight: '600' },
  stageOnDiscuss: { color: '#f0abfc', background: 'rgba(240, 171, 252, 0.16)' },
  stageOnCode: { color: '#fcd34d', background: 'rgba(252, 211, 77, 0.16)' },
  stageOnCheck: { color: '#6ee7b7', background: 'rgba(110, 231, 183, 0.16)' },
  empty: {
    padding: '18px 12px',
    opacity: '0.5',
    textAlign: 'center',
  },
  footer: {
    padding: '8px 14px',
    fontSize: '0.8em',
    opacity: '0.45',
    borderTop: '1px solid rgba(255, 255, 255, 0.10)',
  },
}

/**
 * Fit the panel to the configured size.
 *
 * The width is capped against the viewport, so a generous setting still fits
 * a narrow window; the height is stored in vh already, so it follows the
 * window instead of fighting it.
 * @param {Element} panel - the card inside the backdrop.
 * @returns {void}
 */
function sizePanel(panel) {
  panel.style.width = 'min(' + settings.paletteWidth + 'px, 94vw)'
  panel.style.maxHeight = settings.paletteHeight + 'vh'
}

/**
 * How far the panel is held off the edge it is parked against.
 *
 * The shipped 14vh while the panel is short enough to leave that much, and
 * less when a taller panel would otherwise run off the bottom of the screen
 * — the margin gives way, the panel keeps the height it was asked for.
 * @returns {number} the margin in vh.
 */
function placementMargin() {
  var room = 100 - settings.paletteHeight - 2
  return Math.max(2, Math.min(14, Math.round(room)))
}

/**
 * Park the panel according to the configured position. The one place that
 * knows about screen placement, so the rest of the window stays a plain
 * vertical stack that scales with the font size.
 * @param {Element} host - the full-screen backdrop.
 * @param {Element} panel - the card inside it.
 */
function placePanel(host, panel) {
  var place = PLACES.indexOf(settings.palettePlace) >= 0 ? settings.palettePlace : DEFAULTS.palettePlace
  if (place === 'center') {
    host.style.alignItems = 'center'
    panel.style.marginTop = '0'
    panel.style.marginBottom = '0'
    return
  }
  var margin = placementMargin() + 'vh'
  if (place === 'bottom') {
    host.style.alignItems = 'flex-end'
    panel.style.marginTop = '0'
    panel.style.marginBottom = margin
    return
  }
  host.style.alignItems = 'flex-start'
  panel.style.marginTop = margin
  panel.style.marginBottom = '0'
}

/**
 * Repaint the live chips, in place.
 *
 * Only the chip's own text is touched: a clock must never rebuild the list
 * under the user's selection, and it must not disturb a half-typed rename
 * either. A chip that grows does re-fit the columns, though — the column it
 * shares has to follow the duration it is showing.
 * @returns {void}
 */
function tickClocks() {
  var clocks = PALETTE.clocks
  var now = Date.now()
  var grew = false
  for (var i = 0; i < clocks.length; i++) {
    var clock = clocks[i]
    var elapsed = elapsedText(now - clock.since)
    // The same shape the row was built with: the duration rides in the chip
    // only once there is one to ride there, so a turn still inside its first
    // minute keeps the plain state instead of a dangling separator.
    var text = elapsed ? clock.label + ' · ' + elapsed : clock.label
    if (clock.chip.textContent === text) continue
    clock.chip.textContent = text
    clock.chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : clock.label)
    grew = true
  }
  if (grew) fitColumns()
}

/**
 * Milliseconds until the next whole minute of the oldest clock given.
 *
 * Anchored on the stamps rather than on the previous tick: a timer that
 * only ever waits a full minute again would let its own lateness accumulate,
 * and a clock meant to answer "how long has this been going?" must not fall
 * behind over a long run. Asked for whichever window's clocks are on
 * screen, so both windows keep their own anchors.
 * @param {Array<object>} clocks - `{since}` entries, the window's own.
 * @returns {number} delay in milliseconds.
 */
function clockDelay(clocks) {
  var anchor = 0
  for (var i = 0; i < clocks.length; i++) {
    if (!anchor || clocks[i].since < anchor) anchor = clocks[i].since
  }
  if (!anchor) return CLOCK_INTERVAL_MS
  var phase = (Date.now() - anchor) % CLOCK_INTERVAL_MS
  return phase === 0 ? CLOCK_INTERVAL_MS : CLOCK_INTERVAL_MS - phase
}

/** Start the tick that keeps the clocks on screen honest. */
function startClock() {
  if (PALETTE.clockTimer || !PALETTE.clocks.length) return
  PALETTE.clockTimer = window.setTimeout(function () {
    PALETTE.clockTimer = 0
    if (!PALETTE.open) return
    tickClocks()
    startClock()
  }, clockDelay(PALETTE.clocks))
}

/** Stop the tick: the window closed, or nothing on screen is running. */
function stopClock() {
  if (!PALETTE.clockTimer) return
  window.clearTimeout(PALETTE.clockTimer)
  PALETTE.clockTimer = 0
}

// ---------------------------------------------------------------------
// opening pulse
// ---------------------------------------------------------------------

/**
 * The one beat the "just finished" chips get when the window opens.
 *
 * The window's whole promise is that it can tell you what changed while you
 * were away, and a finished turn is the one thing in that answer with no
 * decision attached to it — it needs to be *noticed*, not acted on. Its chip
 * is also the quietest thing on the row: a small word at the right edge,
 * beside a name, a stage and a timestamp. The pulse is what puts the eye on
 * it in the first half second, and then it is gone; nothing is left behind
 * for the reader to dismiss, and no row keeps a mark that would have to be
 * cleared later.
 *
 * It is driven by `requestAnimationFrame` rather than a CSS keyframe because
 * this window is built out of inline styles, with no stylesheet to hang an
 * animation on — the same reason the scroll engine eases by hand.
 */
var donePulse = { raf: 0, start: 0 }

/**
 * How far into the beat `progress` (0..1) is, as a 0..1 swell.
 *
 * Sine, raised to a fraction: a fast attack and a slow settle. A plain
 * symmetric hump reads as a breathing loop and the eye reads loops as
 * decoration; the quick front edge is what makes it read as "look here" and
 * the long tail is what keeps it from snapping.
 * @param {number} progress - elapsed fraction of the beat.
 * @returns {number} 0..1.
 */
function donePulseAmount(progress) {
  if (!(progress > 0 && progress < 1)) return 0
  return Math.pow(Math.sin(Math.PI * progress), 0.7)
}

/**
 * Paint the beat on every "just finished" chip on screen.
 *
 * Zero clears the two properties back to what the chip wears at rest, so the
 * same call ends the beat and puts the row back — there is no second place
 * that could leave a scaled chip behind.
 * @param {number} amount - 0..1 from `donePulseAmount`.
 * @returns {void}
 */
function paintDonePulse(amount) {
  var chips = PALETTE.doneChips
  if (!chips || !chips.length) return
  var scale = amount ? 'scale(' + (1 + 0.14 * amount).toFixed(3) + ')' : ''
  var ring = amount
    ? '0 0 0 ' + (2 * amount).toFixed(2) + 'px rgba(125, 211, 252, ' + (0.5 * amount).toFixed(3) + ')'
    : ''
  for (var i = 0; i < chips.length; i++) {
    var chip = chips[i]
    if (!chip || !chip.style) continue
    chip.style.transform = scale
    chip.style.boxShadow = ring
  }
}

/** One frame of the beat; schedules the next, or puts the chips back. */
function tickDonePulse() {
  donePulse.raf = 0
  if (!PALETTE.open || !PALETTE.doneChips.length) {
    stopDonePulse()
    return
  }
  var progress = (Date.now() - donePulse.start) / DONE_PULSE_MS
  if (progress >= 1) {
    stopDonePulse()
    return
  }
  paintDonePulse(donePulseAmount(progress))
  donePulse.raf = window.requestAnimationFrame(tickDonePulse)
}

/**
 * Start the beat, unless there is nothing to point at or the OS asked for
 * less motion.
 *
 * Reduced motion does not get a cheaper animation — it gets none. A pulse is
 * decoration on top of a fact the chip already states in words, so dropping
 * it costs the reader nothing.
 * @returns {void}
 */
function startDonePulse() {
  stopDonePulse()
  if (reducedMotion() || !PALETTE.doneChips.length) return
  donePulse.start = Date.now()
  donePulse.raf = window.requestAnimationFrame(tickDonePulse)
}

/** Cancel the beat and put every chip it touched back. */
function stopDonePulse() {
  if (donePulse.raf) {
    window.cancelAnimationFrame(donePulse.raf)
    donePulse.raf = 0
  }
  donePulse.start = 0
  paintDonePulse(0)
}

/**
 * Coarse "how long ago" for a row. Deliberately four buckets, so a list
 * does not fill up with minute-level noise.
 * @param {unknown} ts - epoch milliseconds.
 * @returns {string} a short label, empty when the stamp is unknown.
 */
function relativeTime(ts) {
  var value = Number(ts) || 0
  if (!value) return ''
  var seconds = Math.round((Date.now() - value) / 1000)
  if (seconds < 60) return paletteText('justNow')
  if (seconds < 3600) return Math.round(seconds / 60) + paletteText('minutesAgo')
  if (seconds < 86400) return Math.round(seconds / 3600) + paletteText('hoursAgo')
  return Math.round(seconds / 86400) + paletteText('daysAgo')
}

/** Footer hint, rebuilt from the live bindings and the current depth. */
function paletteHint() {
  // Every key that goes to the selected conversation, in the order a hand
  // reaches for them: the one that opened the window, the switch key, then
  // the standing Enter alias. Enter is always there, so rebinding the switch
  // seat never takes it away.
  var keys = []
  var seats = [settings.paletteKey, settings.paletteEnterKey, 'Enter']
  for (var i = 0; i < seats.length; i++) {
    if (seats[i] && keys.indexOf(seats[i]) < 0) keys.push(seats[i])
  }
  var base =
    settings.paletteUpKey +
    '/' +
    settings.paletteDownKey +
    ' ' +
    paletteText('navigate') +
    ' · ' +
    settings.paletteRenameKey +
    ' ' +
    paletteText('rename') +
    ' · ' +
    settings.paletteStageKey +
    ' ' +
    paletteText('paletteStage') +
    ' · ' +
    settings.paletteArchiveKey +
    ' ' +
    paletteText('archive') +
    ' · ' +
    keys.join('/') +
    ' ' +
    paletteText('select') +
    ' · Esc ' +
    paletteText('close')
  // "More" is offered only while there is something behind it, so the hint
  // never points at a thing that would do nothing. It is a place the cursor
  // can reach, so the hint says how, not just that it exists.
  if (moreReachable()) {
    base += ' · ' + settings.paletteDownKey + ' ' + paletteText('moreHint')
  }
  return base
}

/**
 * The one line above the list: what is on the reader's plate right now.
 *
 * It is a sentence rather than a count, and the case it exists for is the
 * quiet one. A window whose header can only ever report a number of
 * conversations gives the reader something to worry about even when there is
 * nothing to do; one that can say "nothing needs you" is a window they can
 * close and forget. That sentence is the whole reason this line is not just
 * the total.
 *
 * The quiet wording claims only what it can see. It used to read "all
 * running — nothing needs you", which was a lie in the one case it is used:
 * this branch is reached when nothing is running *and* nothing is waiting.
 * A header is the last place to put a cheerful sentence that is not true.
 * @returns {string} the headline.
 */
function paletteHeadline() {
  var mine = PALETTE.mine.length
  var live = PALETTE.live.length
  if (!mine && !live) return paletteText('headQuiet')
  var parts = []
  if (mine) parts.push(mine + ' ' + paletteText('headMine'))
  if (live) parts.push(live + ' ' + paletteText('headLive'))
  return parts.join(' · ')
}

/**
 * Where the selection opens: the first thing waiting on the reader, else
 * where they already are.
 *
 * The attention block leads the list, so its rows are at the front and "the
 * first owed row" is simply the first one whose block is not the browsing
 * one. Reading it off the blocks rather than off the status again keeps this
 * in step with what was actually drawn.
 *
 * The value is in what happens after a switch. Acting on a row takes it out
 * of the block — the run settles, the approval is given — so the next press
 * of the open key lands on the next thing owed rather than on the row just
 * dealt with. That is the whole gesture this window is for, and it needs no
 * key, no bookmark and nothing remembered.
 * @param {Array<object>} rows - the rows on screen.
 * @returns {number} the index to select.
 */
function firstOwedIndex(rows) {
  var owed = Object.create(null)
  for (var i = 0; i < PALETTE.mine.length; i++) owed[PALETTE.mine[i].id] = true
  for (var r = 0; r < rows.length; r++) {
    if (owed[rows[r].id]) return r
  }
  return hereIndex(rows)
}

/**
 * Split the pool into the attention blocks and the browsing blocks.
 *
 * The attention blocks are read off the **whole pool**, before the recency
 * window is applied, and that is not a detail. A conversation that has been
 * parked on an approval since yesterday is exactly the one the reader most
 * needs to see, and a window that only ever looked at the last twelve hours
 * would file it under "More" — hiding the oldest debt behind the newest
 * chatter. Nothing that is waiting on the reader may be hidden behind a
 * press.
 *
 * A row appears in exactly one block. The attention blocks take their rows
 * out of the browsing blocks rather than repeating them, for two reasons: a
 * list that shows the same conversation twice cannot be counted, and the
 * browsing block has a cap (`PALETTE_LIMIT`) that a conversation already
 * pinned to the top should not be spending.
 *
 * Inside `mine` the order is how long the reader has owed an answer, longest
 * first — the row that has been waiting on them since yesterday outranks the
 * one that just asked. A stamp this plugin never saw (a turn already parked
 * when the page loaded) falls back to when the conversation was last
 * touched, which is the honest lower bound on how long it has been sitting
 * there; inventing a start for it is what `RUNS` refuses to do elsewhere.
 * `live` keeps the pool's own order, because there is nothing to rank.
 *
 * The recency window is measured on the **whole pool**, attention blocks
 * included, even though their rows are taken out of the browsing blocks
 * before the window is applied. Two different questions, two different
 * scopes: "is anything waiting on me" is asked of everything, and "has
 * anything moved in the last three hours" is asked of everything too. Asking
 * the second of what is left after the first has already taken its rows out
 * makes the window blind to the one thing that is definitely recent — the
 * run the reader is watching — and on a busy afternoon it then reads as a
 * quiet one.
 * @param {Array<object>} pool - candidates, grouped by folder, newest first.
 * @returns {{mine: Array<object>, live: Array<object>, today: Array<object>, older: Array<object>, stale: boolean}} the blocks, and whether `today` is the fallback batch rather than the window's own rows.
 */
function paletteBlocks(pool) {
  var cutoff = Date.now() - PALETTE_WINDOW_MS
  var here = currentSession()
  var hereId = here ? here.id : ''
  var mine = []
  var live = []
  var rest = []
  for (var a = 0; a < pool.length; a++) {
    var block = attentionOf(pool[a])
    if (block === 'mine') mine.push(pool[a])
    else if (block === 'live') live.push(pool[a])
    else rest.push(pool[a])
  }
  // Oldest debt first. The stamp is the one this plugin watched begin, else
  // the last time the conversation moved, else nothing — and a row with no
  // stamp at all sorts last rather than first, so an unknown age is never
  // dressed up as the most urgent thing on the list.
  mine.sort(function (x, y) {
    var gap = waitedSince(x) - waitedSince(y)
    if (gap) return gap
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0
  })

  var fresh = Object.create(null)
  var freshCount = 0
  // The whole pool is read, attention blocks included — and that is the
  // point, not an oversight. The attention blocks were already taken out of
  // `rest` above, so counting freshness on `rest` alone says "nothing has
  // happened for three hours" whenever the only thing that has happened is
  // the run the reader is watching. That turned the window into a history
  // list under a heading that says "recent": the fallback below fired on a
  // day that was anything but quiet.
  for (var i = 0; i < pool.length; i++) {
    if ((Number(pool[i].updatedAt) || 0) < cutoff) continue
    fresh[pool[i].id] = true
    freshCount++
  }
  // A pool with nothing recent in it falls back to the first batch, so the
  // window is never a dead end on a quiet day. What it must not do is
  // pretend: these rows are history, so the block they land in is named for
  // what it holds (`stale`), not for a three-hour window it never had.
  var stale = false
  if (!freshCount) {
    stale = true
    for (var b = 0; b < rest.length && b < PALETTE_LIMIT; b++) {
      fresh[rest[b].id] = true
    }
  }
  // "Where I am" belongs in the browsing block even when the window would
  // have left it out: it is the one row this window must never make you hunt
  // for. It has no pull-in to do when an attention block already holds it.
  if (hereId && rest.length && !fresh[hereId]) fresh[hereId] = true
  var today = []
  var older = []
  // One pass over what is left, so both blocks keep the pool's own order and
  // the folders stay contiguous in each of them. Today is capped like any
  // other batch — a block that grows with how busy the day was is a window
  // whose length depends on the calendar — and the conversation on screen
  // is never the row the cap drops.
  for (var p = 0; p < rest.length; p++) {
    var row = rest[p]
    if (fresh[row.id] && (today.length < PALETTE_LIMIT || row.id === hereId)) today.push(row)
    else older.push(row)
  }
  return { mine: mine, live: live, today: today, older: older, stale: stale && today.length > 0 }
}

/**
 * How long a conversation has been waiting on the reader, as a stamp.
 *
 * Lower is longer. Zero means "no idea", which sorts to the end: the caller
 * compares these directly, so an unknown age must not read as the beginning
 * of time and jump the queue.
 * @param {object} summary - session summary.
 * @returns {number} epoch milliseconds, or 0 when nothing is known.
 */
function waitedSince(summary) {
  var since = runSince(summary.id)
  if (since) return since
  var touched = Number(summary.updatedAt) || 0
  return touched || Number.MAX_SAFE_INTEGER
}

/**
 * Reveal one more batch of older conversations.
 *
 * The seat is reached by a press or by walking onto it with the movement
 * keys; either way this adds one batch and leaves the cursor where it was.
 * A reader standing on the seat stays on it, which is what makes repeated
 * presses keep digging — the seat slides down the list in front of the rows
 * it just revealed, so the cursor is still on "more" and still says how much
 * is left. A reader who pressed it with the pointer, from a row, keeps that
 * row: the list grew underneath and their row did not move.
 * @returns {boolean} whether anything was added.
 */
function revealMore() {
  if (PALETTE.olderShown >= PALETTE.older.length) return false
  PALETTE.olderShown = Math.min(PALETTE.older.length, PALETTE.olderShown + PALETTE_STEP)
  rebuildRows()
  // The seat slid down in front of the rows it revealed, so a cursor that
  // was on it is on it still — but the index has to follow, or it would be
  // left pointing at whichever row now happens to sit at the old number.
  // When that batch was the last one the seat stops being a place at all,
  // and the cursor lands on the first row it revealed rather than on a seat
  // that is no longer there to stand on.
  if (PALETTE.onMore) {
    PALETTE.index = moreSeatAt()
    if (!moreReachable()) PALETTE.onMore = false
  }
  // Nothing else would repaint, and rows that are loaded but not drawn are
  // rows nobody can see.
  renderPalette()
  requestTurns()
  return true
}

/**
 * The blocks to draw, in order, each with its header.
 *
 * Every block is now a single block with one heading, and a row always names
 * its own folder. The folder used to be a container: the browsing block was
 * cut into one block per folder, in the registry's own order, and the folder
 * name was said once on the heading. That made the folder the unit the
 * reader moved in, and it had a cost that only showed up on a busy day — the
 * cap was spent folder by folder in registry order, so a busy folder could
 * take the whole twenty and leave a quiet one with nothing, even when the
 * quiet one held the newest conversations on the list.
 *
 * Flattening it fixes that and simplifies the rest: the browsing block is
 * ordered by recency alone, so the newest conversations are on top whatever
 * folder they are in, and no folder can starve another. The folder is still
 * on every row, just said per row instead of once per block.
 *
 * The "More" seat is drawn as soon as anything is behind it, not only once
 * it has been opened: it is the row that says there is more, so hiding it
 * until the reader has already found the rest would be hiding the sign. Its
 * count is what is still behind it, which reaches zero as the reader walks
 * the block out.
 * @returns {Array<object>} `{kind, label, count, rows}` per block.
 */
function paletteSections() {
  var sections = []
  if (PALETTE.mine.length) {
    sections.push({ kind: 'mine', label: paletteText('groupMine'), rows: PALETTE.mine.slice() })
  }
  if (PALETTE.live.length) {
    sections.push({ kind: 'live', label: paletteText('groupLive'), rows: PALETTE.live.slice() })
  }
  if (PALETTE.today.length) {
    // The block is named for what it holds. On a quiet day the fallback puts
    // history in it, and calling history "recent" is the one lie a heading
    // must not tell — the reader opened this window to find out whether
    // anything happened lately, and the answer is in the label.
    sections.push({
      kind: 'recent',
      label: paletteText(PALETTE.stale ? 'groupHistory' : 'groupRecent'),
      rows: PALETTE.today.slice(),
    })
  }
  if (PALETTE.older.length) {
    sections.push({
      kind: 'more',
      label: '',
      count: PALETTE.older.length - PALETTE.olderShown,
      rows: PALETTE.older.slice(0, PALETTE.olderShown),
    })
  }
  return sections
}

/**
 * Rebuild `rows` and `sections` from the two blocks.
 *
 * Called whenever the depth changes, so one place decides what the list
 * contains and one place decides how it is cut into blocks. `rows` stays a
 * flat list in draw order, which is what every consumer of the selection
 * wants; the headers live only in `sections`.
 * @returns {void}
 */
function rebuildRows() {
  // The folder index is what the cutting is done against, so it is read
  // here rather than in the painter: the blocks and the chips a row draws
  // then come from one reading of the registry and cannot disagree.
  PALETTE.folders = folderIndex()
  var sections = paletteSections()
  var rows = []
  for (var i = 0; i < sections.length; i++) {
    for (var j = 0; j < sections[i].rows.length; j++) rows.push(sections[i].rows[j])
  }
  PALETTE.sections = sections
  PALETTE.rows = rows
}

/**
 * The row grid: the state chip, the name, and the metadata — tag, stage,
 * turns, time.
 *
 * A row is its own grid, so these read as the list's columns only because
 * every row is handed the same tracks — see `fitColumns`. The name is the
 * one track that takes the slack and ellipsises, so the cells around it stay
 * where they are however long a name is, and every name starts at the same
 * x after the state gutter.
 *
 * There is no folder track in front of the name, and that is the point of
 * the layout: a track sized off the folder names on screen would be 0 wide
 * until the reader pressed `d` and full width afterwards, and every row
 * already on screen would move sideways with it. A folder that still needs
 * naming rides inside the name cell instead (`PALETTE_UI.folderPrefix`), so
 * there is no column here that a press can resize.
 *
 * The tag track only exists when the conversation on screen is one of the
 * rows on screen: otherwise the tracks behind it would be pushed one column
 * to the right for a column nobody fills.
 * @returns {string} a `grid-template-columns` value.
 */
function rowColumns() {
  var tracks = PALETTE.tracks
  var columns = [tracks.status, 'minmax(0, 1fr)']
  // The stage column is always present (an idle row still shows a seat to
  // click), and the tag column comes and goes with `hereOn`.
  if (PALETTE.hereOn) columns.push(tracks.here)
  columns.push(tracks.phase, tracks.turns, tracks.meta)
  return columns.join(' ')
}

/**
 * The grid column one cell belongs to, on this repaint.
 *
 * The state is column 1 and the name column 2; the tag column comes and goes
 * with `hereOn`, so every cell after it sits one place further left on a
 * repaint that does not carry one. Hard-coded numbers would leave a hole in
 * every row of the list.
 * @param {string} name - one of `status`, `name`, `here`, `phase`, `turns`, `meta`.
 * @returns {string} the column, as a grid line number.
 */
function columnOf(name) {
  var at = ROW_CELLS.indexOf(name)
  // `here` is the only optional cell; dropping it moves everything after it
  // one place left.
  if (!PALETTE.hereOn && at > ROW_CELLS.indexOf('here')) at -= 1
  return String(at + 1)
}

/**
 * The widest content width among one column's cells.
 * @param {Array<Element>} cells - the cells this repaint put in that column.
 * @returns {number} the widest `scrollWidth`, 0 when the column is empty.
 */
function widestCell(cells) {
  var widest = 0
  for (var i = 0; i < cells.length; i++) {
    var width = cells[i].scrollWidth
    if (typeof width === 'number' && width > widest) widest = width
  }
  return widest
}

/**
 * Give every row the same tracks, sized to what is actually on screen.
 *
 * The measurements are what makes the right-hand cells line up: with `auto`
 * tracks each row would size its own, and a state chip or a turn count
 * would start wherever that row's own content happened to leave it. Each
 * cell reports the width its text needs — `scrollWidth` is the content
 * width even while the cell is clipped to its column, which is why every
 * cell measured here is `white-space: nowrap`: a cell that may wrap reports
 * the width it wrapped into, and the column would then be fitted to its own
 * damage instead of to its text.
 *
 * Nothing here is measured off a folder name any more, so no track of this
 * list changes width between one repaint and the next: the only cells that
 * can move the layout are the ones that are on screen in both.
 * @returns {void}
 */
function fitColumns() {
  var columns = PALETTE.columns
  PALETTE.tracks = {
    here: widestCell(columns.here) + 'px',
    phase: widestCell(columns.phase) + 'px',
    status: widestCell(columns.status) + 'px',
    turns: widestCell(columns.turns) + 'px',
    meta: widestCell(columns.meta) + 'px',
  }
  var template = rowColumns()
  if (template === PALETTE.template) return
  PALETTE.template = template
  // Only the rows: a heading is not on the row grid and giving it a track
  // list would make it a row-shaped element the selection could not reach.
  var rows = PALETTE.nodes
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.gridTemplateColumns = template
  }
}

/**
 * Whether a row in this block has to name its own folder.
 *
 * Every block does now. A folder is a label on a row rather than a container
 * around rows (see `paletteSections`), so there is no heading left that
 * could say it once for the rows under it. This stays a function rather than
 * an inline `true` so the one place that decides it is still named, and so
 * a future block that genuinely does not need the prefix has somewhere
 * obvious to say so.
 * @param {object} section - the block this row is drawn under.
 * @returns {boolean} whether the row names its own folder.
 */
function namesOwnFolder(section) {
  return !!section
}

/**
 * One list row. Clicking it switches, so the window is not keyboard-only.
 * @param {object} summary - the conversation this row is about.
 * @param {number} index - its place on the flat list, which is what the
 *   selection counts; the block it sits in is a drawing, not a position.
 * @param {object} section - the block this row is drawn under.
 * @returns {Element} the row.
 */
function buildRow(summary, index, section) {
  // The cursor cannot be on a row while it is standing on the seat, so a row
  // that happens to sit at the cursor's index is not the selected one. The
  // index keeps pointing at the seat's row so that leaving the seat upward
  // lands where the reader expects, and this is what keeps that bookkeeping
  // from painting a highlight on a row nobody selected.
  var selected = index === PALETTE.index && !PALETTE.onMore
  var row = document.createElement('div')
  Object.assign(row.style, PALETTE_UI.row)
  // Row spacing is the preference; the horizontal padding is chrome.
  row.style.paddingTop = settings.paletteRow + 'px'
  row.style.paddingBottom = settings.paletteRow + 'px'
  row.style.gridTemplateColumns = rowColumns()
  if (selected) Object.assign(row.style, PALETTE_UI.rowActive)
  // A row in a block that is only there to be glanced at is dimmed as a
  // whole. The block answers "what is moving", and nothing in it needs the
  // reader; at full weight a list of them reads as a list of demands.
  if (section && section.kind === 'live') Object.assign(row.style, PALETTE_UI.rowLive)
  row.setAttribute('role', 'option')
  row.setAttribute('aria-selected', selected ? 'true' : 'false')
  row.setAttribute('data-session-id', summary.id)

  if (PALETTE.renaming && PALETTE.renaming.id === summary.id) {
    row.appendChild(buildRenameInput())
  } else {
    var title = document.createElement('span')
    Object.assign(title.style, PALETTE_UI.title)
    title.style.gridColumn = columnOf('name')
    // The folder rides in front of the name. It is the only thing on the row
    // that says where the conversation lives — the folder stopped being a
    // container around rows, so no heading says it for a group any more.
    //
    // It goes inside the name cell rather than in a column of its own for the
    // reason the column was dropped: a column is a track every row pays for,
    // and one fitted to the names on screen changes width the moment `d`
    // brings the "More" block in — moving every row already on screen. Text
    // in the cell it belongs to costs the rows that do not carry one nothing
    // at all. While a row is being renamed the prefix is not drawn: the input
    // replaces the whole name cell.
    var folder = PALETTE.folders[summary.id]
    if (namesOwnFolder(section) && folder && folder.label) {
      var where = document.createElement('span')
      Object.assign(where.style, PALETTE_UI.folderPrefix)
      where.textContent = folder.label
      where.setAttribute('data-role', 'folder')
      title.appendChild(where)
    }
    var named = document.createElement('span')
    Object.assign(named.style, PALETTE_UI.nameText)
    named.setAttribute('data-role', 'nameText')
    named.textContent = summary.displayTitle || summary.id
    title.appendChild(named)
    row.appendChild(title)
  }

  // "Where you are" is a cell of the row, not a prefix on its name: the
  // name then starts at the same x as every other name, and a long one is
  // not cut short by a tag it did not ask for. The row order is left alone
  // now — the window opens with the selection on this row instead of
  // moving it to the top — so this chip is the only thing that says why.
  //
  // The folder prefix is the opposite trade and is deliberately not
  // contradicted here: it names where a conversation lives, which no heading
  // says any more now that the folder is a per-row label, and it rides
  // inside the name cell. This chip is about this row — "you are here" — and
  // exactly one row on the whole list can be it, so there is nothing to save
  // by indenting every name for it.
  if (summary.id === PALETTE.here) {
    var tag = document.createElement('span')
    Object.assign(tag.style, PALETTE_UI.here)
    tag.style.gridColumn = columnOf('here')
    tag.textContent = paletteText('current')
    row.appendChild(tag)
    PALETTE.columns.here.push(tag)
  }

  // The stage control. Every row lays out the whole vocabulary and lights
  // the stage that is marked, so the reader never has to hold the set or its
  // order in their head — and an unmarked conversation reads as three dim
  // words rather than as a placeholder character that says nothing.
  //
  // Each word is its own button, and the press is stopped so marking a stage
  // never doubles as switching to that conversation, which is what the rest
  // of the row does.
  var stage = PHASES_MODEL.get(summary.id)
  var stageBox = document.createElement('span')
  Object.assign(stageBox.style, PALETTE_UI.stageBox)
  stageBox.style.gridColumn = columnOf('phase')
  for (var s = 0; s < PHASES.length; s++) {
    var each = PHASES[s]
    var lit = each === stage
    var word = document.createElement('span')
    Object.assign(word.style, PALETTE_UI.stage)
    if (lit) {
      Object.assign(
        word.style,
        PALETTE_UI.stageOn,
        PALETTE_UI['stageOn' + each[0].toUpperCase() + each.slice(1)]
      )
    }
    word.textContent = paletteText('phase' + each[0].toUpperCase() + each.slice(1))
    word.setAttribute('title', lit ? paletteText('phaseUnmark') : paletteText('phaseHint'))
    // Bound by value, not by the loop variable: `each` is `var`-scoped and
    // would otherwise be the last stage by the time a press arrives.
    word.addEventListener('mousedown', stageHandler(summary.id, each))
    stageBox.appendChild(word)
  }
  row.appendChild(stageBox)
  PALETTE.columns.phase.push(stageBox)

  // The state chip carries the clock of a turn in flight: the state and how
  // long it has been going are one fact about the row, so they read as one
  // chip. The start is the one this plugin watched begin; a turn it met
  // mid-flight has none, and its chip keeps the plain state rather than a
  // clock counting from the moment the window opened.
  var status = statusOf(summary)
  if (status) {
    var chip = document.createElement('span')
    Object.assign(chip.style, PALETTE_UI.status, PALETTE_UI['status' + status.key[0].toUpperCase() + status.key.slice(1)])
    chip.style.gridColumn = columnOf('status')
    var since = statusIsLive(status) ? runSince(summary.id) : 0
    var elapsed = since ? elapsedText(Date.now() - since) : ''
    chip.textContent = elapsed ? status.text + ' · ' + elapsed : status.text
    chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : status.text)
    row.appendChild(chip)
    PALETTE.columns.status.push(chip)
    // The opening beat points at this chip if the turn finished while the
    // reader was away. Collected here because this is the only place that
    // knows which status a chip stands for — a later lookup would be reading
    // the same answer twice and could disagree with the paint.
    if (status.key === 'done') PALETTE.doneChips.push(chip)
    // The clock is registered on the stamp, not on the text: a turn that has
    // been going for forty seconds shows the plain state now and must still
    // pick up its first minute while the window is open. Registering only
    // rows that already had something to show would leave that chip frozen
    // at the bare state for as long as the window stayed up.
    if (since) PALETTE.clocks.push({ chip: chip, label: status.text, since: since })
  }

  var when = relativeTime(summary.updatedAt)
  var turns = turnsOf(summary)
  if (turns !== null) {
    var count = document.createElement('span')
    Object.assign(count.style, PALETTE_UI.turns)
    count.style.gridColumn = columnOf('turns')
    count.textContent = turns + ' ' + paletteText('turnUnit')
    count.setAttribute('title', turns + ' ' + paletteText('turnUnit'))
    row.appendChild(count)
    PALETTE.columns.turns.push(count)
  }
  if (when) {
    var meta = document.createElement('span')
    Object.assign(meta.style, PALETTE_UI.meta)
    meta.style.gridColumn = columnOf('meta')
    meta.textContent = when
    row.appendChild(meta)
    PALETTE.columns.meta.push(meta)
  }

  // Each row is one CSS-grid row. The DOM stays in its semantic order
  // (name first), while the explicit columns put status in column 1; without
  // an explicit grid row, auto-placement can wrap that late-appended cell
  // into an implicit second row after the cursor has passed column 1. That
  // makes only status-bearing rows twice as tall.
  for (var c = 0; c < row.children.length; c++) row.children[c].style.gridRow = '1'

  row.addEventListener('mousedown', function (ev) {
    ev.preventDefault()
    PALETTE.index = index
    openSession(summary.id)
  })
  return row
}

/**
 * The name box that replaces a row's title while it is being renamed.
 *
 * Every key is stopped here, because this box is the only thing the user is
 * typing into: the window's own keys must not move the selection or jump
 * away while a name is half-typed, and the plugin's Escape handler must not
 * treat this box as a composer to be blurred. A press inside it is stopped
 * too, so clicking into the name does not switch conversations.
 * @returns {Element} the input, ready to be focused.
 */
function buildRenameInput() {
  var input = document.createElement('input')
  input.type = 'text'
  Object.assign(input.style, PALETTE_UI.renameInput)
  input.style.gridColumn = columnOf('name')
  input.value = PALETTE.renaming.value
  input.setAttribute('aria-label', paletteText('paletteRename'))
  input.addEventListener('input', function () {
    if (PALETTE.renaming) PALETTE.renaming.value = input.value
  })
  input.addEventListener('mousedown', function (ev) {
    ev.stopPropagation()
  })
  input.addEventListener('keydown', function (ev) {
    ev.stopPropagation()
    if (ev.key === 'Enter') {
      ev.preventDefault()
      commitRename()
      return
    }
    if (ev.key === 'Escape') {
      ev.preventDefault()
      cancelRename()
    }
  })
  PALETTE.renameInput = input
  return input
}

/**
 * Put the caret in the name box, with the whole name selected the first time
 * so that typing replaces it. A repaint mid-edit keeps the draft and puts the
 * caret back at the end instead, because the user is already typing.
 * @returns {void}
 */
function focusRename() {
  var input = PALETTE.renameInput
  var renaming = PALETTE.renaming
  if (!input || !renaming || typeof input.focus !== 'function') return
  input.focus()
  if (renaming.fresh) {
    renaming.fresh = false
    if (typeof input.select === 'function') input.select()
    return
  }
  if (typeof input.setSelectionRange === 'function') {
    var end = String(input.value || '').length
    try {
      input.setSelectionRange(end, end)
    } catch (error) {
      /* not a text field after all; nothing to place */
    }
  }
}

/**
 * Start renaming the selected conversation.
 * @returns {boolean} whether there is a row to rename.
 */
function beginRename() {
  var row = selectedRow()
  if (!row) return false
  PALETTE.renaming = { id: row.id, value: String(row.displayTitle || ''), fresh: true, busy: false }
  renderPalette()
  return true
}

/** Drop the edit and repaint the row as it was. */
function cancelRename() {
  if (!PALETTE.renaming) return
  PALETTE.renaming = null
  renderPalette()
}

/**
 * Hand the typed name to the host.
 *
 * An empty name is refused rather than sent — the host would reject it, and
 * a conversation with no name is a row nobody can find again. An unchanged
 * name just closes the box: the host accepts it, but there is nothing to say.
 * @returns {void}
 */
function commitRename() {
  var renaming = PALETTE.renaming
  if (!renaming || renaming.busy) return
  var title = String(renaming.value).trim()
  if (!title) {
    setPaletteNotice(paletteText('renameNoName'))
    return
  }
  var row = selectedRow()
  if (row && row.id === renaming.id && title === String(row.displayTitle || '').trim()) {
    cancelRename()
    return
  }
  renaming.busy = true
  setPaletteNotice(paletteText('renameBusy'))
  renameSession(renaming.id, title, function (error) {
    var current = PALETTE.renaming
    if (!current || current.id !== renaming.id) return
    if (error) {
      current.busy = false
      setPaletteNotice(error)
      return
    }
    cancelRename()
  })
}

/**
 * Archive the selected row, with the footer saying what happened.
 *
 * The window is left open on purpose. The feed does the removing — the host
 * drops the row once the archive set moves, and the window's own
 * subscription repaints it — so this never edits the list itself, and a
 * failure leaves the row exactly where it was for a second try.
 * @returns {boolean} whether there was a row to archive.
 */
function archiveSelected() {
  var row = selectedRow()
  if (!row) return false
  setPaletteNotice(paletteText('archiveBusy'))
  archiveSession(row.id, function (error) {
    if (error) {
      setPaletteNotice(error)
      return
    }
    if (state.debug) console.log('[dsh-vim] archived', row.id)
    refreshPalette()
  })
  return true
}

/**
 * Say something in the footer. The next repaint restores the hint, so a
 * notice lives exactly as long as the state that produced it.
 * @param {string} text - the line to show.
 * @returns {void}
 */
function setPaletteNotice(text) {
  if (PALETTE.footer) PALETTE.footer.textContent = text
}

/**
 * Put this repaint's measurements away, ready for the next one.
 *
 * The shared column tracks are fitted once per repaint off whatever is
 * actually on screen, and a cell can only report the width its own text
 * needs while it sits in an unfitted track. Two places stop showing rows
 * and both must put that back: a repaint about to begin, and the window
 * closing for good. Keeping either honest used to mean editing both.
 *
 * @returns {void}
 */
function resetPaintScratch() {
  PALETTE.tracks = { here: 'auto', phase: 'auto', status: 'auto', turns: 'auto', meta: 'auto' }
  PALETTE.template = ''
  PALETTE.columns = { here: [], phase: [], status: [], turns: [], meta: [] }
  PALETTE.clocks = []
  /**
   * The "just finished" chips of this repaint, in draw order.
   *
   * Kept as the elements themselves, not looked up later: the beat on window
   * open needs the nodes actually on screen, and re-finding them through a
   * selector would be a second reading of what `buildRow` already knew.
   */
  PALETTE.doneChips = []
}

/** Repaint the list from `PALETTE.sections`; cheap enough at this size. */
function renderPalette() {
  if (!PALETTE.list) return
  var list = PALETTE.list
  list.textContent = ''
  PALETTE.renameInput = null
  PALETTE.nodes = []
  var onScreen = currentSession()
  PALETTE.here = onScreen ? onScreen.id : ''
  // The tag column is a column of the whole list, so it is decided before a
  // row is drawn, not by one: a conversation on screen that the filters kept
  // off the list leaves every row its plain three columns rather than a hole
  // where the tag would have been.
  PALETTE.hereOn = PALETTE.rows.some(function (row) {
    return row.id === PALETTE.here
  })
  resetPaintScratch()
  var total = PALETTE.pool.length
  if (PALETTE.label) PALETTE.label.textContent = paletteHeadline()
  if (PALETTE.count) {
    // While older rows are still hidden, say so: loaded of total.
    PALETTE.count.textContent = !total
      ? ''
      : PALETTE.rows.length < total
        ? PALETTE.rows.length + ' / ' + total
        : String(total)
  }
  if (PALETTE.footer) PALETTE.footer.textContent = paletteHint()
  if (!PALETTE.rows.length) {
    var empty = document.createElement('div')
    Object.assign(empty.style, PALETTE_UI.empty)
    empty.textContent = paletteText('tasksEmpty')
    list.appendChild(empty)
    return
  }
  // Headers are drawn between the rows they label, and the row index is
  // carried alongside: the selection counts conversations, not elements, so
  // `PALETTE.nodes` is what "the selected row" means from here on. Every
  // block is labelled now — there is no unlabelled "plain" block left, since
  // the folder stopped being a container and became a per-row label.
  var at = 0
  for (var i = 0; i < PALETTE.sections.length; i++) {
    var section = PALETTE.sections[i]
    list.appendChild(buildSectionHeader(section))
    for (var j = 0; j < section.rows.length; j++) {
      var node = buildRow(section.rows[j], at, section)
      list.appendChild(node)
      PALETTE.nodes.push(node)
      at++
    }
  }
  // Only now can the cells say how wide their columns have to be.
  fitColumns()
  scrollSelectionIntoView()
  focusRename()
  startClock()
  // A repaint replaces every chip on the list, so a beat still in flight has
  // to be put on the new ones — otherwise a feed update in the first second
  // would cut the one cue the window opened with.
  if (donePulse.start) {
    paintDonePulse(donePulseAmount((Date.now() - donePulse.start) / DONE_PULSE_MS))
  }
}

/**
 * Whether the "More" seat has anything left to give.
 *
 * This is what decides if it is a place the keyboard can stand on, and it is
 * read in three places that must agree: the heading's own affordances, the
 * movement keys, and the hint line.
 * @returns {boolean} whether more conversations are behind the seat.
 */
function moreReachable() {
  return PALETTE.olderShown < PALETTE.older.length
}

/**
 * One block heading. It is not selectable and not a row: it names the block
 * underneath it and, for the "More" seat, says how much is behind it. The
 * name is its own element so a long folder can be ellipsised without taking
 * the count with it.
 *
 * The "More" seat is the one heading that takes a press, because it is the
 * only way to reach what is behind it — so it is also the only one that
 * offers a pointer, and the only one the keyboard can stand on, and both
 * only while there is something behind it to reach for.
 * @param {object} section - one block from `paletteSections`.
 * @returns {Element} the heading.
 */
function buildSectionHeader(section) {
  var header = document.createElement('div')
  Object.assign(header.style, PALETTE_UI.sectionHeader)
  if (section.kind === 'more') Object.assign(header.style, PALETTE_UI.sectionMore)
  var selected = section.kind === 'more' && PALETTE.onMore
  var name = document.createElement('span')
  Object.assign(name.style, PALETTE_UI.sectionName)
  name.textContent = section.kind === 'more' ? paletteText('groupMore') : section.label
  header.appendChild(name)
  if (section.kind === 'more' && section.count > 0) {
    var count = document.createElement('span')
    Object.assign(count.style, PALETTE_UI.sectionCount)
    count.textContent = String(section.count)
    header.appendChild(count)
  }
  var openable = section.kind === 'more' && section.count > 0
  if (openable) header.style.cursor = 'pointer'
  // The seat can be stood on, so it has to say so when it is: without this
  // the cursor would move onto a heading that looked exactly like the
  // headings it is not allowed to stand on, and the reader would have no way
  // to tell that `d` is what put them there.
  if (selected) {
    Object.assign(header.style, PALETTE_UI.sectionActive)
    header.setAttribute('aria-selected', 'true')
  }
  // A heading is a divider, not a target: a press on it must not switch to
  // the row above or below it, and the pointer must not offer one. The "More"
  // seat is the exception, and only because it has something to give.
  header.addEventListener('mousedown', function (ev) {
    ev.preventDefault()
    ev.stopPropagation()
    if (openable) revealMore()
  })
  return header
}

/**
 * Keep the cursor visible when the list is longer than the panel.
 *
 * The seat is not in `PALETTE.nodes`, so it is found as the heading it is
 * when the cursor is standing on it — otherwise `d` onto the seat would
 * leave it below the fold and the reader would see the cursor vanish.
 * @returns {void}
 */
function scrollSelectionIntoView() {
  var node = PALETTE.onMore ? moreHeadingNode() : PALETTE.nodes[PALETTE.index]
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ block: 'nearest' })
  }
}

/**
 * The "More" heading element currently on screen, or null.
 *
 * Headings carry no session id, so the seat is found by the label it paints
 * rather than by a marker — the same way a reader finds it.
 * @returns {Element|null} the heading.
 */
function moreHeadingNode() {
  if (!PALETTE.list || typeof PALETTE.list.children === 'undefined') return null
  var label = paletteText('groupMore')
  var nodes = PALETTE.list.children
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i]
    var first = node.children && node.children[0]
    if (first && String(first.textContent) === label) return node
  }
  return null
}

/**
 * Re-read both feeds, holding the selection on the same conversation and
 * the depth the user had already reached. The newest conversations stay
 * visible even if the pool grew underneath them.
 */
/**
 * Re-read both feeds, holding the selection on the same conversation and
 * the depth the reader had already reached.
 *
 * The depth is held across a refresh so a run finishing in another
 * conversation does not collapse the list under the reader's hands; and the
 * selection is re-found by id, because a feed update can move a row inside
 * its folder without the conversation changing.
 */
function refreshPalette() {
  if (!PALETTE.open) return
  var current = selectedRow()
  var currentId = current ? current.id : null
  PALETTE.pool = conversationPool()
  var blocks = paletteBlocks(PALETTE.pool)
  PALETTE.mine = blocks.mine
  PALETTE.live = blocks.live
  PALETTE.today = blocks.today
  PALETTE.stale = blocks.stale
  PALETTE.older = blocks.older
  PALETTE.olderShown = Math.min(PALETTE.olderShown, PALETTE.older.length)
  rebuildRows()
  var index = 0
  for (var i = 0; i < PALETTE.rows.length; i++) {
    if (PALETTE.rows[i].id === currentId) {
      index = i
      break
    }
  }
  // A cursor standing on the seat stays there across a repaint: it is a
  // place like any other, and a feed update in some other conversation must
  // not quietly move the reader off it and back onto a row. The seat only
  // goes away when it has nothing left behind it, and then the cursor lands
  // on the last row, which is where the seat was.
  if (PALETTE.onMore && moreReachable()) {
    PALETTE.index = moreSeatAt()
    renderPalette()
    return
  }
  PALETTE.onMore = false
  PALETTE.index = index
  renderPalette()
}

/**
 * The conversation under the cursor, or null when the cursor is standing on
 * the "More" seat.
 *
 * Every key that acts on "the selected conversation" asks this rather than
 * indexing `PALETTE.rows` itself. Standing on the seat must not quietly act
 * on the row above it — renaming, archiving or re-staging the conversation
 * the reader has already stepped past is exactly the kind of accident a
 * cursor that means two things invites. One accessor, one answer.
 * @returns {object|null} the selected summary, or null.
 */
function selectedRow() {
  if (PALETTE.onMore) return null
  return PALETTE.rows[PALETTE.index] || null
}

/**
 * Where the "More" seat stands in the row order, as a row index.
 *
 * The seat is drawn above the rows it has revealed, so it is a position in
 * the list rather than a thing bolted on the end: the revealed rows are the
 * tail of `PALETTE.rows`, so the seat belongs immediately in front of them.
 * With nothing revealed yet that is the end of the list, which is where a
 * reader looking for more would be standing anyway.
 * @returns {number} the index the seat occupies, equal to `rows.length` when
 *   the seat is after every row.
 */
function moreSeatAt() {
  return PALETTE.rows.length - PALETTE.olderShown
}

/**
 * Move the selection, wrapping at both ends.
 *
 * Walking the list never changes how much of it is loaded. Reaching the last
 * row is not an instruction to go and fetch the next batch: a key that
 * changes the length of the list under the cursor is a key whose result the
 * reader cannot predict, and the "More" seat is already on screen saying in
 * numbers that there is more. Loading more is a decision, so it is a press
 * on that seat, or a confirmation while standing on it, and nothing else.
 *
 * The seat is one more place to stand while there is something behind it, and
 * it sits where it is drawn: between the rows above it and the rows it has
 * revealed. So the walk runs over `count + 1` places, one of which is the
 * seat, and the wrap goes round all of them. The seat is a place like any
 * other — stepping on and off it changes nothing but where the cursor is —
 * which is what lets the keyboard reach it without any key gaining a second
 * meaning.
 * @param {number} delta - places to move, positive is down.
 */
function moveSelection(delta) {
  if (!PALETTE.rows.length) return
  var count = PALETTE.rows.length
  var seatAt = moreReachable() ? moreSeatAt() : -1
  if (seatAt < 0) {
    // No seat to stand on. A cursor that was on one — because the batch it
    // opened turned out to be the last — comes off it here, or the flag
    // would outlive the seat and go on suppressing the selected row.
    PALETTE.onMore = false
    var plain = (PALETTE.index + delta) % count
    if (plain < 0) plain += count
    if (plain === PALETTE.index) return
    PALETTE.index = plain
    renderPalette()
    return
  }
  // Walk space: positions 0..count, where `seatAt` is the seat and every
  // other position is a row. The rows keep their order, with one slot
  // inserted for the seat.
  var at = PALETTE.onMore ? seatAt : PALETTE.index < seatAt ? PALETTE.index : PALETTE.index + 1
  var places = count + 1
  var next = (at + delta) % places
  if (next < 0) next += places
  if (next === at) return
  if (next === seatAt) {
    PALETTE.onMore = true
    renderPalette()
    return
  }
  PALETTE.onMore = false
  PALETTE.index = next < seatAt ? next : next - 1
  renderPalette()
}

/**
 * Act on whatever the selection is standing on.
 *
 * One entry point for the three keys that mean "go" — the open key, the
 * switch key and Enter — because the seat and a conversation are the two
 * things that can be under the cursor and each has exactly one meaning for
 * them. Keeping the branch here is what stops each key from having to know
 * about the seat.
 * @returns {boolean} whether anything was there to act on.
 */
function activateSelection() {
  if (PALETTE.onMore) return revealMore()
  var row = PALETTE.rows[PALETTE.index]
  if (!row) return false
  return openSession(row.id)
}

/**
 * Mount the window and read the feed. Rolling state is torn down first:
 * a scroll animation must not keep running behind a modal panel.
 * @returns {boolean} whether the window is now open.
 */
function openPalette() {
  if (PALETTE.open) return true
  // The board takes the whole keyboard and answers Escape; a second overlay
  // on top of it would leave two windows claiming the same presses.
  if (boardIsOpen()) return false
  if (!taskServices()) return false
  // A host that had not published the status source when this plugin woke
  // up gets a watch now: without one, no row could ever show a clock.
  watchRuns()
  stopHold()
  stopAnim()
  // The window is modal, so whatever else was being typed into is no longer
  // the user's target: a switch out of it must not hand the box its focus.
  clearFocusRequest()
  PALETTE.pool = conversationPool()
  var blocks = paletteBlocks(PALETTE.pool)
  PALETTE.mine = blocks.mine
  PALETTE.live = blocks.live
  PALETTE.today = blocks.today
  PALETTE.stale = blocks.stale
  PALETTE.older = blocks.older
  PALETTE.olderShown = 0
  rebuildRows()
  // The window opens pointing at the first thing that is waiting on the
  // reader, when there is one. That is the queue behaviour the window is for:
  // dealing with a row takes it out of the block, so the next press of `f`
  // lands on the next thing owed without the reader holding a position in
  // their head. With nothing owed it falls back to where they already are,
  // which is what the window did before.
  PALETTE.index = firstOwedIndex(PALETTE.rows)
  PALETTE.onMore = false
  PALETTE.open = true
  PALETTE.renaming = null
  PALETTE.renameInput = null
  PALETTE.unsubscribes = []

  var host = document.createElement('div')
  Object.assign(host.style, PALETTE_UI.backdrop)
  var panel = document.createElement('div')
  Object.assign(panel.style, PALETTE_UI.panel)
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', paletteText('tasks'))
  // The handle for the rules every window of this plugin shares - the
  // scroller bars and the word shade (see `installWindowCSS`).
  panel.className = 'dshv-window'
  // One font size on the panel; everything inside is sized in em and scales
  // with it, so the whole window reads as one piece at any size.
  panel.style.fontSize = settings.paletteFont + 'px'
  sizePanel(panel)
  placePanel(host, panel)
  var header = document.createElement('div')
  Object.assign(header.style, PALETTE_UI.header)
  var label = document.createElement('span')
  // Filled by the first repaint: it is a sentence about what is waiting, and
  // that is not known until the blocks have been read.
  label.textContent = paletteText('tasks')
  var count = document.createElement('span')
  header.appendChild(label)
  header.appendChild(count)
  var list = document.createElement('div')
  Object.assign(list.style, PALETTE_UI.list)
  list.setAttribute('role', 'listbox')
  var footer = document.createElement('div')
  Object.assign(footer.style, PALETTE_UI.footer)
  footer.textContent = paletteHint()
  panel.appendChild(header)
  panel.appendChild(list)
  panel.appendChild(footer)
  host.appendChild(panel)
  // Nothing in here closes the window: a press on the card is a press on a
  // row, a heading or the footer, and each of those has its own meaning.
  // The way out from out here is a press beside the card (see
  // `dismissOutsidePress`), Escape, or a switch that takes it away.
  if (!document.body) {
    PALETTE.open = false
    return false
  }
  document.body.appendChild(host)

  PALETTE.host = host
  PALETTE.list = list
  PALETTE.label = label
  PALETTE.count = count
  PALETTE.footer = footer
  renderPalette()
  // Once per open, never per repaint: the beat answers "what changed while
  // this window was closed", and a feed update arriving behind it must not
  // restart it — a cue that fires on every repaint is a tic.
  startDonePulse()
  // Turn counts are not in the session list; each one has to be read per
  // conversation and arrives later, so they paint themselves in.
  requestTurns()

  // Both feeds can change under an open window: new conversations arrive on
  // the session list, and archiving one drops it out of the pool.
  var services = taskServices()
  if (typeof services.list.subscribe === 'function') {
    PALETTE.unsubscribes.push(services.list.subscribe(refreshPalette))
  }
  if (services.workspaces && typeof services.workspaces.subscribe === 'function') {
    PALETTE.unsubscribes.push(services.workspaces.subscribe(refreshPalette))
  }
  if (services.status && typeof services.status.subscribe === 'function') {
    PALETTE.unsubscribes.push(services.status.subscribe(refreshPalette))
  }
  if (state.debug) {
    console.log('[dsh-vim] task window', PALETTE.rows.length, 'of', PALETTE.pool.length)
  }
  return true
}

/** Unmount the window and drop every feed subscription. */
function closePalette() {
  if (!PALETTE.open && !PALETTE.host) return false
  PALETTE.open = false
  for (var i = 0; i < PALETTE.unsubscribes.length; i++) {
    try {
      PALETTE.unsubscribes[i]()
    } catch (error) {
      console.warn('[dsh-vim] feed unsubscribe failed', error)
    }
  }
  PALETTE.unsubscribes = []
  cancelPeeks()
  stopClock()
  stopDonePulse()
  if (PALETTE.host && PALETTE.host.parentNode) {
    PALETTE.host.parentNode.removeChild(PALETTE.host)
  }
  PALETTE.host = null
  PALETTE.list = null
  PALETTE.label = null
  PALETTE.count = null
  PALETTE.footer = null
  PALETTE.renameInput = null
  PALETTE.renaming = null
  PALETTE.here = ''
  PALETTE.hereOn = false
  PALETTE.folders = Object.create(null)
  resetPaintScratch()
  PALETTE.pool = []
  PALETTE.mine = []
  PALETTE.live = []
  PALETTE.today = []
  PALETTE.stale = false
  PALETTE.older = []
  PALETTE.olderShown = 0
  PALETTE.sections = []
  PALETTE.nodes = []
  PALETTE.rows = []
  PALETTE.index = 0
  PALETTE.onMore = false
  return true
}

/**
 * Route one keystroke to the open window.
 *
 * Enter always activates, whether or not it is the bound key: a list that
 * swallows the one key every other list confirms with is a trap, and the
 * user asking for `g` wants `g` *as well as* Enter, not instead of it. So the
 * bound key ships as `g` and Enter is the standing alias. The check runs
 * before navigation, so Enter can never double as a movement key.
 *
 * The key that opened the window activates too: `f` then `f` is one jump,
 * which is the whole point of a window you open to go somewhere. It only
 * closes when there is nothing to go to, so the key stays a toggle in the
 * one case where it cannot act. Escape is the way out, and always was.
 * @param {KeyboardEvent} ev - keydown event.
 * @param {string} key - lower-cased key.
 * @returns {boolean} whether the window consumed it.
 */
function paletteKeyDown(ev, key) {
  // The name box is ours, so it keeps the keyboard. Any other editable means
  // the caret is in a field: the key is that field's, which for the scroll
  // keys is settled before this point. The window itself stays where it is —
  // typing next to it is one of the things it is kept open for.
  if (isEditable(ev.target)) return false
  if (key === 'enter' || key === String(settings.paletteEnterKey).toLowerCase()) {
    activateSelection()
    return true
  }
  if (key === settings.paletteRenameKey) {
    beginRename()
    return true
  }
  // Archiving the selected row. It sits beside rename because it is the
  // same kind of act: one press, one conversation, no dialog — and like
  // rename it is refused rather than forced when the host will not have it.
  if (key === settings.paletteArchiveKey) {
    archiveSelected()
    return true
  }
  // The stage key marks the selected row, and nothing else: it is the one
  // source of a stage that needs no agent cooperation, so a press here is
  // the whole gesture — no typing, no dialog. Off the last stage it lands
  // on idle, which is how a stage is taken back off a conversation.
  if (key === settings.paletteStageKey) {
    var marked = selectedRow()
    if (marked) cyclePhase(marked.id)
    return true
  }
  // The pin key puts the row the cursor stands on onto the board. One
  // press, one conversation, and the board carries it afterwards.
  if (key === settings.pinKey) {
    var pinned = selectedRow()
    if (pinned) pinSession(pinned.id)
    return true
  }
  if (key === settings.paletteKey) {
    // An empty list is not a way out: Escape is the way out. The key that
    // opened the window only ever goes somewhere — and on the "More" seat
    // "somewhere" is the rest of the list, which is the one thing standing
    // there can mean.
    activateSelection()
    return true
  }
  if (key === settings.paletteDownKey) {
    moveSelection(1)
    return true
  }
  if (key === settings.paletteUpKey) {
    moveSelection(-1)
    return true
  }
  if (key === 'escape') {
    closePalette()
    return true
  }
  if (ev.key === 'ArrowDown' || (ev.key === 'Tab' && !ev.shiftKey)) {
    moveSelection(1)
    return true
  }
  if (ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey)) {
    moveSelection(-1)
    return true
  }
  return false
}

// ---------------------------------------------------------------------
// focus
// ---------------------------------------------------------------------


export { PALETTE, PALETTE_UI, clockDelay, closePalette, cyclePhase, fitColumns, openPalette, paletteHeadline, paletteKeyDown, refreshPalette, renderPalette, selectedRow, setPaletteNotice, stopClock, tickClocks }
