/**
 * The board's material: ink and paper for the canvas, the panels' own tokens,
 * the page and overview surfaces, the drawn glyphs, and the one stylesheet
 * every window shares. Nothing here paints; the builders read these tokens.
 */
import { BOARD_NOTE_INDENT, BOARD_CARD_W } from './constants.js'
import { PALETTE_UI } from './task-window.js'

/**
 * The board's own chrome.
 *
 * A second window, not a variant of the first: the task window is one list
 * read downwards and this one is columns read across, so they share the
 * palette and the font preference but not a line of layout. It takes almost
 * the whole screen because a column is somewhere to put things and three of
 * them need the width. Nothing here is sized to keep a selection visible:
 * there is no selection, because the board is driven by the pointer.
 */
/**
 * The board's palette, readable in both mounts.
 *
 * Every colour is a custom property with the overlay's own value as its
 * fallback: the floating board keeps the dark sheet it always had, and the
 * same builders paint the sidebar page in the host's theme by setting the
 * properties on the page root. One board, two coats — rather than two
 * boards that drift apart.
 */
var BOARD_INK = {
  sheet: 'var(--dshv-board-sheet, #2f3644)',
  /**
   * The colour every solid surface is laid on.
   *
   * The canvas is made of washes - a goal's hue, the column's grey, the
   * card's lighter grey, the note's amber - and a wash over nothing is a
   * window: two panels standing on each other read through each other. This
   * is what is underneath them all. The page coat names the host's own base
   * colour, and the floating board falls back to its sheet.
   */
  base: 'var(--dshv-board-base, #2f3644)',
  sheetEdge: 'var(--dshv-board-edge, rgba(255, 255, 255, 0.16))',
  text: 'var(--dshv-board-text, #eef1f7)',
  dim: 'var(--dshv-board-dim, rgba(238, 241, 247, 0.45))',
  column: 'var(--dshv-board-column, rgba(255, 255, 255, 0.05))',
  columnEdge: 'var(--dshv-board-column-edge, rgba(255, 255, 255, 0.10))',
  card: 'var(--dshv-board-card, rgba(255, 255, 255, 0.08))',
  cardEdge: 'var(--dshv-board-card-edge, rgba(255, 255, 255, 0.10))',
  cardHover: 'var(--dshv-board-card-hover, rgba(255, 255, 255, 0.13))',
  accent: 'var(--dshv-board-accent, #93c5fd)',
  accentSoft: 'var(--dshv-board-accent-soft, rgba(147, 197, 253, 0.16))',
  fork: 'var(--dshv-board-fork, rgba(147, 197, 253, 0.5))',
  // The idea paper is light stock with dark ink on it: notes are the one
  // thing on this canvas that is not the board's own material, and a dark
  // card tinted by hue just reads as a smudge on a dark sheet.
  note: 'var(--dshv-board-note, hsl(45 70% 92%))',
  noteEdge: 'var(--dshv-board-note-edge, hsl(45 40% 77%))',
  /** The words and marks on that paper. */
  noteInk: 'var(--dshv-board-note-ink, hsl(42 36% 18%))',
  noteInkDim: 'var(--dshv-board-note-ink-dim, hsl(42 26% 38%))',
  /** A finished note: the same stock, drained of its colour. */
  noteDone: 'var(--dshv-board-note-done, hsl(45 9% 86%))',
  noteDoneEdge: 'var(--dshv-board-note-done-edge, hsl(45 8% 74%))',
  noteDoneInk: 'var(--dshv-board-note-done-ink, hsl(45 10% 30%))',
  noteSpine: 'var(--dshv-board-note-spine, hsl(45 82% 45%))',
  input: 'var(--dshv-board-input, rgba(255, 255, 255, 0.08))',
  inputEdge: 'var(--dshv-board-input-edge, rgba(167, 139, 250, 0.5))',
  line: 'var(--dshv-board-line, rgba(255, 255, 255, 0.10))',
  accentOn: 'var(--dshv-board-accent-on, #12213a)',
  /**
   * The skin of the one window on the board.
   *
   * A form is not a note and not the page: it is a solid stock laid over
   * whichever coat is showing, so it hides what is behind it and keeps its
   * ink readable in both mounts. The page coat lends the host's colours;
   * these fallbacks are the overlay's dark sheet, one step lighter than the
   * board so the edge reads as elevation rather than as a seam.
   */
  dialog: 'var(--dshv-board-dialog, #333b4a)',
  dialogEdge: 'var(--dshv-board-dialog-edge, rgba(255, 255, 255, 0.17))',
  dialogInk: 'var(--dshv-board-dialog-ink, #eef1f7)',
  dialogInkDim: 'var(--dshv-board-dialog-ink-dim, rgba(238, 241, 247, 0.60))',
  dialogField: 'var(--dshv-board-dialog-field, rgba(255, 255, 255, 0.07))',
  dialogFieldEdge: 'var(--dshv-board-dialog-field-edge, rgba(255, 255, 255, 0.16))',
  dialogRule: 'var(--dshv-board-dialog-rule, rgba(255, 255, 255, 0.10))',
  dialogScrim: 'var(--dshv-board-dialog-scrim, rgba(9, 11, 16, 0.52))',
  dialogError: 'var(--dshv-board-dialog-error, hsl(6 78% 66%))',
}

/**
 * The canvas's own chrome.
 *
 * A sheet you pan, not a list you read: everything is sized so a title is
 * the thing the eye lands on, and the metadata under it stays legible
 * without leaning in. One base size on the mount, everything inside in em.
 */
/**
 * The paper a note is made of, wherever a note is drawn.
 *
 * The sheet on the canvas and the line in the tray differ in shape and in
 * nothing else, so the material lives here once: both read these four
 * properties, and neither can drift from the other while the shapes stay
 * their own. Layout is the caller's and is deliberately not in here.
 */
/** A newline, spelled once so no editor or tool can double its escape. */
/**
 * A wash made solid: the tints, laid over the board's own base colour.
 *
 * Every surface on this canvas is a translucent tint - a goal's hue over
 * the sheet, a card's grey over the panel, a note's amber over whatever is
 * behind it. A tint over nothing is a window, which is why cards read
 * through each other where they overlap. Wrapping each tint in a one-stop
 * gradient and standing the base colour under all of them keeps exactly the
 * colour the surface had, and makes it hide what is beneath.
 * @param {...string} tints - the washes, outermost first.
 * @returns {string} a `background` value that cannot see through.
 */
function solidPaper() {
  var layers = []
  for (var i = 0; i < arguments.length; i++) {
    var tint = arguments[i]
    if (!tint) continue
    layers.push('linear-gradient(' + tint + ', ' + tint + ')')
  }
  layers.push(BOARD_INK.base)
  return layers.join(', ')
}

var NOTE_PAPER = {
  // Opaque, and one shade: a card has to hide what is under it, or a pile on
  // the canvas reads as two half-transparent sheets instead of a pile. The
  // amber is itself a wash, so it is laid on the board's base colour.
  background: solidPaper(BOARD_INK.note),
  border: '1px solid ' + BOARD_INK.noteEdge,
  borderLeft: '3px solid ' + BOARD_INK.noteSpine,
  boxShadow: '0 16px 30px -22px rgba(8, 12, 20, 0.6), 0 1px 2px rgba(8, 12, 20, 0.2)',
  color: BOARD_INK.noteInk,
}

var BOARD_UI = {
  // The same see-through backdrop the task window uses: a press beside the
  // card still reaches the page, and that is one of the ways out.
  backdrop: Object.assign({}, PALETTE_UI.backdrop),
  panel: {
    position: 'relative',
    marginTop: '6vh',
    width: 'min(1600px, 97vw)',
    height: '88vh',
    display: 'flex',
    flexDirection: 'column',
    background: BOARD_INK.sheet,
    color: BOARD_INK.text,
    border: '1px solid ' + BOARD_INK.sheetEdge,
    borderRadius: '14px',
    boxShadow: '0 22px 56px rgba(12, 16, 24, 0.38)',
    overflow: 'hidden',
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 22px',
    borderBottom: '1px solid ' + BOARD_INK.line,
  },
  titleText: { fontSize: '1.15em', fontWeight: '650', letterSpacing: '0.01em' },
  subtitle: { fontSize: '0.84em', opacity: '0.55' },
  /** The "only what is marked" toggle: a quiet chip until it is in effect. */
  starFilter: {
    marginLeft: 'auto',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '0.84em',
    color: BOARD_INK.dim,
    background: BOARD_INK.column,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The zoom cluster: one quiet segmented control. */
  zoomBox: {
    display: 'flex',
    alignItems: 'stretch',
    height: '26px',
    boxSizing: 'border-box',
    border: '1px solid ' + BOARD_INK.line,
    borderRadius: '8px',
    overflow: 'hidden',
    background: BOARD_INK.input,
  },
  zoomButton: {
    width: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.92em',
    lineHeight: '1',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  zoomLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '42px',
    padding: '0 4px',
    borderLeft: '1px solid ' + BOARD_INK.line,
    borderRight: '1px solid ' + BOARD_INK.line,
    fontSize: '0.76em',
    fontVariantNumeric: 'tabular-nums',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The fit-to-window seat, set off from the zoom pair by the same rule. */
  zoomFit: {
    width: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: '1px solid ' + BOARD_INK.line,
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  starFilterOn: {
    marginLeft: 'auto',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '0.84em',
    color: BOARD_INK.accentOn,
    background: BOARD_INK.accent,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /**
   * The heading's settings sheet: the box that anchors it, the sheet, and
   * its rows.
   *
   * The sheet hangs off the chip that opened it rather than off the window,
   * so it reads as that chip's own and lands in the same place in both
   * mounts - the floating board and the page.
   */
  settingsWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  settingsSheet: {
    position: 'absolute',
    top: '100%',
    right: '0',
    marginTop: '6px',
    zIndex: '40',
    minWidth: '250px',
    maxWidth: '330px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px',
    borderRadius: '10px',
    background: BOARD_INK.dialog,
    border: '1px solid ' + BOARD_INK.dialogEdge,
    boxShadow: '0 14px 28px -16px rgba(8, 12, 20, 0.55)',
    textAlign: 'left',
  },
  settingsTitle: {
    padding: '2px 6px 6px',
    fontSize: '0.78em',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: BOARD_INK.dim,
  },
  settingsRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '6px',
    borderRadius: '7px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The box that fills when a switch is on: the same shape as a note's. */
  settingsBox: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '17px',
    height: '17px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '1px',
    borderRadius: '4px',
    border: '1px solid ' + BOARD_INK.dialogEdge,
    background: 'transparent',
    color: 'transparent',
    fontSize: '0.78em',
    lineHeight: '1',
  },
  settingsBoxOn: {
    borderColor: BOARD_INK.accent,
    background: BOARD_INK.accent,
    color: BOARD_INK.accentOn,
  },
  settingsLabel: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' },
  settingsName: { fontSize: '0.88em', color: BOARD_INK.dialogInk },
  settingsHint: { fontSize: '0.76em', lineHeight: '1.45', color: BOARD_INK.dim },

  /**
   * The finished-cards bin: a chip in the heading, and the list it opens.
   *
   * It is a place, but a hidden one: what is finished has stopped asking for
   * room, so it costs the canvas none. The count on the chip is what keeps
   * that honest - something put away is always one press from being seen.
   */
  doneBin: {
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '0.84em',
    color: BOARD_INK.dim,
    background: BOARD_INK.column,
    cursor: 'pointer',
    userSelect: 'none',
  },
  doneBinOn: {
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '0.84em',
    color: BOARD_INK.accentOn,
    background: BOARD_INK.accent,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /**
   * The finished list: a piece of the card's own paper, standing beside it.
   *
   * The same material as the notes it holds, and the width of the card it
   * came out of - so it reads as that card opening, not as a second window.
   */
  doneBinPanel: {
    position: 'absolute',
    top: '52px',
    right: '14px',
    zIndex: '60',
    width: BOARD_CARD_W + 'px',
    maxHeight: '46vh',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    background: BOARD_INK.note,
    border: '1px solid ' + BOARD_INK.noteEdge,
    borderLeft: '3px solid ' + BOARD_INK.noteSpine,
    borderRadius: '12px',
    overflow: 'hidden',
  },
  doneBinHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 10px',
    borderBottom: '1px solid ' + BOARD_INK.noteEdge,
    fontSize: '0.74em',
    letterSpacing: '0.08em',
    color: BOARD_INK.dim,
    userSelect: 'none',
  },
  doneBinList: {
    display: 'flex',
    flexDirection: 'column',
    // The list is the thing that scrolls: the paper around it keeps its size.
    overflowY: 'auto',
    padding: '4px',
    gap: '2px',
    padding: '6px 8px 8px',
    overflowY: 'auto',
  },
  /**
   * The history: a chip in the heading, and the pages it opens.
   *
   * The same material as the finished list, because it is the same kind of
   * thing - a record that is read rather than worked on. Wider, because a
   * page has goals and conversations in it, not one line.
   */
  historyPanel: {
    position: 'absolute',
    top: '52px',
    right: '14px',
    zIndex: '62',
    width: '360px',
    maxHeight: '72vh',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    background: BOARD_INK.note,
    border: '1px solid ' + BOARD_INK.noteEdge,
    borderLeft: '3px solid ' + BOARD_INK.noteSpine,
    borderRadius: '12px',
    overflow: 'hidden',
  },
  historyTools: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 10px 7px',
    borderBottom: '1px solid ' + BOARD_INK.noteEdge,
    fontSize: '0.74em',
    color: BOARD_INK.dim,
    userSelect: 'none',
  },
  historyTool: {
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid ' + BOARD_INK.noteEdge,
    color: BOARD_INK.text,
    cursor: 'pointer',
    userSelect: 'none',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflowY: 'auto',
    padding: '6px 8px 8px',
  },
  historyDay: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 6px',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  historyDayMain: {
    flex: '1 1 auto',
    minWidth: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  historyDayDate: {
    fontSize: '0.88em',
    lineHeight: '1.4',
    fontVariantNumeric: 'tabular-nums',
  },
  historyGoalIntent: {
    fontSize: '0.76em',
    lineHeight: '1.4',
    color: BOARD_INK.dim,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  historyLine: {
    fontSize: '0.78em',
    lineHeight: '1.5',
    color: BOARD_INK.text,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    paddingLeft: '10px',
  },
  /**
   * The day's summary: a page on top of the desk, not a panel beside it.
   *
   * It is the one surface in the board that is read rather than worked on,
   * so it is centred paper with nothing to drag, and a press anywhere takes
   * it away - the same grammar as closing a window on the paper behind it.
   */
  sealHost: {
    position: 'absolute',
    inset: '0',
    zIndex: '70',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(18, 20, 26, 0.34)',
  },
  sealCard: {
    minWidth: '300px',
    maxWidth: '460px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    boxSizing: 'border-box',
    padding: '20px 22px 16px',
    background: BOARD_INK.note,
    border: '1px solid ' + BOARD_INK.noteEdge,
    borderLeft: '3px solid ' + BOARD_INK.noteSpine,
    borderRadius: '12px',
    cursor: 'pointer',
  },
  sealTitle: {
    fontSize: '0.9em',
    lineHeight: '1.5',
    color: BOARD_INK.dim,
    fontVariantNumeric: 'tabular-nums',
    marginBottom: '4px',
  },
  sealRow: {
    fontSize: '0.86em',
    lineHeight: '1.7',
    color: BOARD_INK.text,
  },
  sealWords: {
    fontSize: '0.78em',
    lineHeight: '1.5',
    color: BOARD_INK.dim,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    paddingLeft: '10px',
    marginBottom: '2px',
  },
  sealClose: {
    alignSelf: 'flex-start',
    marginTop: '10px',
    padding: '3px 12px',
    borderRadius: '999px',
    border: '1px solid ' + BOARD_INK.noteEdge,
    color: BOARD_INK.text,
    fontSize: '0.8em',
    userSelect: 'none',
  },
  historySearch: {
    flex: '1 1 auto',
    minWidth: '0',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid ' + BOARD_INK.noteEdge,
    background: 'transparent',
    color: BOARD_INK.text,
    fontSize: '0.92em',
    outline: 'none',
  },
  historyEmpty: {
    padding: '10px 2px',
    fontSize: '0.82em',
    lineHeight: '1.6',
    color: BOARD_INK.dim,
  },
  historyRestore: {
    alignSelf: 'flex-start',
    marginTop: '2px',
    padding: '3px 10px',
    borderRadius: '999px',
    border: '1px solid ' + BOARD_INK.noteEdge,
    color: BOARD_INK.text,
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '0.8em',
  },
  historyRestoreArmed: {
    borderColor: BOARD_INK.accent,
    color: BOARD_INK.accentOn,
    background: BOARD_INK.accent,
  },
  /**
   * The calendar: the history's way in.
   *
   * A page is asked for by its day, so the panel is a month rather than a
   * list of every day the board was ever drawn on: a day with a page wears
   * a dot, and a press on it drops the canvas onto that page. Same paper as
   * the list it replaced, because it is the same kind of thing - a record
   * that is read rather than worked on.
   */
  historyCalendar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '2px 2px 6px',
  },
  historyCalHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '0 2px 4px',
    fontSize: '0.86em',
    color: BOARD_INK.text,
    userSelect: 'none',
  },
  historyCalNav: {
    width: '22px',
    textAlign: 'center',
    padding: '1px 0',
    borderRadius: '6px',
    cursor: 'pointer',
    color: BOARD_INK.text,
  },
  historyCalNavOff: {
    width: '22px',
    textAlign: 'center',
    padding: '1px 0',
    borderRadius: '6px',
    color: BOARD_INK.dim,
    opacity: '0.35',
  },
  historyCalMonth: {
    flex: '1 1 auto',
    textAlign: 'center',
    fontSize: '0.92em',
    fontVariantNumeric: 'tabular-nums',
  },
  historyCalWeek: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
    padding: '0 2px 2px',
    fontSize: '0.72em',
    color: BOARD_INK.dim,
    userSelect: 'none',
  },
  historyCalWeekday: { textAlign: 'center' },
  historyCalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
    padding: '0 2px',
  },
  /** One day that has a page under it: the calendar's only kind of press. */
  historyCalCell: {
    position: 'relative',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '7px',
    fontSize: '0.82em',
    fontVariantNumeric: 'tabular-nums',
    color: BOARD_INK.text,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** A day with nothing filed under it: still legible, not a press. */
  historyCalCellOff: {
    position: 'relative',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '7px',
    fontSize: '0.82em',
    fontVariantNumeric: 'tabular-nums',
    color: BOARD_INK.dim,
    opacity: '0.45',
    userSelect: 'none',
  },
  historyCalCellToday: { boxShadow: 'inset 0 0 0 1px ' + BOARD_INK.line },
  historyCalCellOn: { background: BOARD_INK.accent, color: BOARD_INK.accentOn },
  historyCalBlank: { height: '28px' },
  /** The dot: this day has a page. */
  historyCalDot: {
    position: 'absolute',
    bottom: '3px',
    left: '50%',
    marginLeft: '-2px',
    width: '4px',
    height: '4px',
    borderRadius: '999px',
    background: BOARD_INK.accent,
  },
  /**
   * The bar a page wears: which day this is, and the presses it offers.
   *
   * It stands on the board's own paper rather than on the scaled stage, so
   * zooming the canvas does not take the way back with it.
   */
  historyBanner: {
    position: 'absolute',
    left: '14px',
    top: '52px',
    zIndex: '58',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 10px',
    borderRadius: '999px',
    background: BOARD_INK.note,
    border: '1px solid ' + BOARD_INK.noteEdge,
    borderLeft: '3px solid ' + BOARD_INK.noteSpine,
    fontSize: '0.8em',
    color: BOARD_INK.text,
    userSelect: 'none',
  },
  historyBannerMark: {
    padding: '1px 7px',
    borderRadius: '999px',
    background: BOARD_INK.column,
    color: BOARD_INK.dim,
    fontSize: '0.9em',
  },
  /** A page's panels: the same boxes, with the thoughts laid out inside. */
  historyBlockBody: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '10px 12px 12px',
  },
  /** A carried card's age: quiet, and never wider than the state chip. */
  cardCarried: {
    flex: '0 0 auto',
    fontSize: '0.9em',
    color: BOARD_INK.dim,
    opacity: '0.8',
  },
  /** A heading button: tidy, or write a card. */
  action: {
    padding: '3px 12px',
    borderRadius: '999px',
    fontSize: '0.84em',
    color: BOARD_INK.text,
    background: BOARD_INK.column,
    border: '1px solid ' + BOARD_INK.line,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  /**
   * The canvas: a scroller with a dotted paper inside it. The dots are the
   * one thing that says "this is a surface you can move" before the reader
   * touches anything.
   */
  body: {
    position: 'relative',
    flex: '1',
    minHeight: '0',
    overflow: 'auto',
    cursor: 'grab',
    backgroundColor: 'transparent',
    backgroundImage:
      'radial-gradient(circle, ' + 'var(--dshv-board-dot, rgba(127, 127, 127, 0.22))' + ' 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    userSelect: 'none',
  },
  /** The sized paper: it, not the stage, decides what the canvas scrolls. */
  sizer: {
    position: 'relative',
    minWidth: '100%',
    minHeight: '100%',
  },
  stage: {
    position: 'absolute',
    left: '0',
    top: '0',
    transformOrigin: '0 0',
  },
  block: {
    position: 'absolute',
    zIndex: '1',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    background: solidPaper(BOARD_INK.column),
    border: '1px solid ' + BOARD_INK.columnEdge,
    borderRadius: '15px',
    boxShadow: '0 24px 60px -42px rgba(24, 18, 6, 0.5), 0 1px 3px rgba(24, 18, 6, 0.06)',
    overflow: 'hidden',
  },
  blockHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 14px',
    borderBottom: '1px solid ' + BOARD_INK.line,
    cursor: 'grab',
    userSelect: 'none',
  },
  blockCaret: { width: '0.9em', opacity: '0.6', flex: '0 0 auto' },
  blockDot: {
    flex: '0 0 auto',
    width: '7px',
    height: '7px',
    borderRadius: '999px',
    boxShadow: '0 0 0 3px rgba(127, 127, 127, 0.08)',
  },
  blockName: {
    flex: '1 1 auto',
    minWidth: '0',
    fontSize: '1.08em',
    fontWeight: '650',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  blockCount: { flex: '0 0 auto', fontSize: '0.82em', opacity: '0.55' },
  /**
   * The wheel a press on the goal's dot opens.
   *
   * Solid stock, like every other thing that has to sit on top of the
   * canvas rather than in it: a menu drawn in a tint would be read as part
   * of the panel it is choosing the colour of.
   */
  seatMenu: {
    position: 'absolute',
    top: '40px',
    left: '10px',
    zIndex: '40',
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 16px)',
    gap: '7px',
    padding: '9px',
    borderRadius: '10px',
    background: BOARD_INK.dialog,
    border: '1px solid ' + BOARD_INK.dialogEdge,
    boxShadow: '0 14px 28px -16px rgba(8, 12, 20, 0.55)',
  },
  /** One colour on that wheel. */
  seatSwatch: {
    width: '16px',
    height: '16px',
    borderRadius: '999px',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  /** The one in use: the same colour, ringed rather than enlarged. */
  seatSwatchOn: {
    boxShadow: '0 0 0 2px ' + BOARD_INK.text,
  },
  /**
   * What the goal is for, on its own line under the name.
   *
   * The heading is the handle a panel is dragged by, so this line declares
   * itself undraggable: a sentence has to be clickable without moving the
   * place it belongs to.
   */
  blockIntent: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 14px 10px',
    fontSize: '0.86em',
    lineHeight: '1.5',
    color: BOARD_INK.dim,
    userSelect: 'none',
  },
  blockIntentMark: { flex: '0 0 auto', opacity: '0.9' },
  blockIntentText: {
    flex: '1 1 auto',
    minWidth: '0',
    // Read before written: the line keeps the canvas's own cursor. A press
    // swaps it for `blockIntentBox`, and that field is where a caret belongs.
    cursor: 'default',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: BOARD_INK.text,
  },
  blockIntentEmpty: {
    flex: '1 1 auto',
    minWidth: '0',
    cursor: 'default',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    opacity: '0.55',
  },
  blockIntentBox: {
    flex: '1 1 auto',
    minWidth: '0',
    boxSizing: 'border-box',
    padding: '2px 6px',
    font: 'inherit',
    fontSize: '0.98em',
    color: BOARD_INK.text,
    background: BOARD_INK.input,
    border: '1px solid ' + BOARD_INK.inputEdge,
    borderRadius: '5px',
    outline: 'none',
  },
  /** Where the goal came from, when its name no longer says so. */
  blockIntentFrom: {
    flex: '0 0 auto',
    maxWidth: '42%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '0.88em',
    opacity: '0.5',
  },
  /** Taking a place away is a mark like the card's, not a button. */
  blockKill: { flex: '0 0 auto', fontSize: '1em', lineHeight: '1', cursor: 'pointer' },
  /**
   * The way to start a conversation where the reader is already working.
   *
   * A small, quiet plus beside the count: it is the goal's own door, and it
   * must not compete with the name that is the panel's whole subject. The
   * dashed ring while a card is in the air is what turns the same mark into
   * a drop target, so one seat carries both gestures.
   */
  /**
   * The one switch that keeps the conversations and drops their thoughts.
   *
   * It stands beside the count because it changes what the panel holds, not
   * what the goal is: a reader comparing several goals flips this to see
   * the shape of the work rather than the notes pinned to it.
   */
  blockIdeas: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '999px',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  blockIdeasOn: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '999px',
    color: BOARD_INK.accent,
    background: BOARD_INK.accentSoft,
    cursor: 'pointer',
    userSelect: 'none',
  },
  blockNewSession: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '21px',
    height: '21px',
    boxSizing: 'border-box',
    borderRadius: '999px',
    border: '1px solid ' + BOARD_INK.columnEdge,
    color: BOARD_INK.dim,
    fontSize: '0.92em',
    lineHeight: '1',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /**
   * The sheet a press on that plus opens.
   *
   * Its own stock, and the only thing on the board that is not the board's
   * paper: a form has to sit on top of whatever is behind it, so it is one
   * solid colour with a hairline edge and a shadow landing under it. It used
   * to wear the note paper, which is deliberately a light wash - a whole
   * form floating in a 10% tint reads as the ghost of a window, not as a
   * window. Every colour here is a custom property, so the page mount lends
   * the host's theme while the overlay keeps its dark sheet.
   */
  newSessionBackdrop: {
    position: 'absolute',
    inset: '0',
    zIndex: '120',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: '24px',
    background: BOARD_INK.dialogScrim,
  },
  newSessionSheet: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    width: 'min(470px, 100%)',
    maxHeight: '100%',
    boxSizing: 'border-box',
    padding: '22px 24px 18px',
    background: BOARD_INK.dialog,
    color: BOARD_INK.dialogInk,
    border: '1px solid ' + BOARD_INK.dialogEdge,
    borderRadius: '16px',
    boxShadow:
      '0 36px 72px -32px rgba(8, 10, 16, 0.62), ' +
      '0 2px 12px -6px rgba(8, 10, 16, 0.28), ' +
      'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    overflow: 'auto',
  },
  /** The one line that names the window; the sentence under it is its premise. */
  newSessionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '1.02em',
    fontWeight: '650',
    letterSpacing: '0.01em',
    lineHeight: '1.45',
  },
  newSessionField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },
  newSessionLabel: {
    fontSize: '0.74em',
    letterSpacing: '0.12em',
    color: BOARD_INK.dialogInkDim,
    userSelect: 'none',
  },
  /**
   * A field is a well, not a sheet of paper: one tint, one hairline, and -
   * while the caret is in it - the accent edge with its soft ring around it.
   * The ring is written by the focus handlers, because inline styles cannot
   * say `:focus`.
   */
  newSessionInput: {
    width: '100%',
    height: '38px',
    boxSizing: 'border-box',
    padding: '0 12px',
    font: 'inherit',
    fontSize: '0.94em',
    color: BOARD_INK.dialogInk,
    caretColor: BOARD_INK.accent,
    background: BOARD_INK.dialogField,
    border: '1px solid ' + BOARD_INK.dialogFieldEdge,
    borderRadius: '9px',
    outline: 'none',
    transition: 'border-color .12s ease, box-shadow .12s ease',
  },
  newSessionBody: {
    width: '100%',
    minHeight: '116px',
    boxSizing: 'border-box',
    padding: '10px 12px',
    font: 'inherit',
    fontSize: '0.94em',
    lineHeight: '1.65',
    color: BOARD_INK.dialogInk,
    caretColor: BOARD_INK.accent,
    background: BOARD_INK.dialogField,
    border: '1px solid ' + BOARD_INK.dialogFieldEdge,
    borderRadius: '9px',
    outline: 'none',
    resize: 'vertical',
    transition: 'border-color .12s ease, box-shadow .12s ease',
  },
  /**
   * The model row: a well like the fields above it, but read rather than
   * typed into. The choice is a list, and the window that shows that list
   * already exists, so this is the one press that opens it.
   */
  newSessionPick: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    width: '100%',
    height: '38px',
    boxSizing: 'border-box',
    padding: '0 12px',
    fontSize: '0.94em',
    color: BOARD_INK.dialogInk,
    background: BOARD_INK.dialogField,
    border: '1px solid ' + BOARD_INK.dialogFieldEdge,
    borderRadius: '9px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  newSessionPickName: {
    minWidth: '0',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  newSessionPickMark: {
    flex: '0 0 auto',
    fontSize: '0.8em',
    color: BOARD_INK.dialogInkDim,
  },
  /** What the two fields become, said before they are written in. */
  newSessionHelper: {
    marginTop: '-4px',
    fontSize: '0.79em',
    lineHeight: '1.62',
    color: BOARD_INK.dialogInkDim,
  },
  newSessionError: {
    fontSize: '0.8em',
    lineHeight: '1.5',
    color: BOARD_INK.dialogError,
  },
  /** The foot: what the keys do on the left, the one press that commits on the right. */
  newSessionActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '2px',
    paddingTop: '14px',
    borderTop: '1px solid ' + BOARD_INK.dialogRule,
  },
  newSessionKeys: {
    flex: '1 1 auto',
    minWidth: '0',
    fontSize: '0.73em',
    letterSpacing: '0.03em',
    color: BOARD_INK.dialogInkDim,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none',
  },
  newSessionConfirm: {
    flex: '0 0 auto',
    padding: '8px 18px',
    borderRadius: '9px',
    fontSize: '0.88em',
    fontWeight: '600',
    color: BOARD_INK.accentOn,
    background: BOARD_INK.accent,
    border: '1px solid transparent',
    boxShadow: '0 1px 2px rgba(8, 10, 16, 0.22)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  newSessionCancel: {
    flex: '0 0 auto',
    padding: '8px 14px',
    borderRadius: '9px',
    fontSize: '0.88em',
    color: BOARD_INK.dialogInkDim,
    background: 'transparent',
    border: '1px solid ' + BOARD_INK.dialogFieldEdge,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /**
   * The focus sheet one idea card opens into, and the compose sheet a new
   * one grows from.
   *
   * The sheet borrows the new-conversation window's solid stock and centred
   * seat rather than the note's wash: a card being read at the centre of the
   * board has the board behind it, and a translucent note would let the
   * canvas read through the words. The note's amber spine and dot are kept,
   * so the thing still says it is a thought rather than a form.
   */
  ideaFocusBackdrop: {
    position: 'absolute',
    inset: '0',
    zIndex: '118',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: '24px',
    background: BOARD_INK.dialogScrim,
  },
  ideaFocusSheet: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: 'min(720px, 100%)',
    height: 'min(620px, 100%)',
    minHeight: 'min(340px, 100%)',
    maxHeight: '100%',
    boxSizing: 'border-box',
    padding: '18px 24px 16px 26px',
    background: BOARD_INK.dialog,
    color: BOARD_INK.dialogInk,
    border: '1px solid ' + BOARD_INK.dialogEdge,
    // The card's own spine, carried onto the big sheet: the one line that
    // says "this is the thought you pressed", not a generic dialog.
    borderLeft: '4px solid ' + BOARD_INK.noteSpine,
    borderRadius: '16px',
    boxShadow:
      '0 36px 72px -32px rgba(8, 10, 16, 0.62), ' +
      '0 2px 12px -6px rgba(8, 10, 16, 0.28), ' +
      'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    willChange: 'transform, opacity',
  },
  ideaFocusHead: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    minHeight: '24px',
    userSelect: 'none',
  },
  ideaFocusDot: {
    flex: '0 0 auto',
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: BOARD_INK.noteSpine,
  },
  ideaFocusLabel: {
    flex: '0 0 auto',
    fontSize: '0.74em',
    letterSpacing: '0.14em',
    color: BOARD_INK.dialogInkDim,
    userSelect: 'none',
  },
  ideaFocusSpacer: { flex: '1 1 auto', minWidth: '0' },
  /** The done box in the sheet: the card's own mark, at the same size. */
  ideaFocusDone: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '19px',
    height: '19px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    borderRadius: '5px',
    border: '1px solid ' + BOARD_INK.dialogFieldEdge,
    color: BOARD_INK.dialogInkDim,
    fontSize: '0.82em',
    lineHeight: '1',
    background: 'transparent',
    cursor: 'pointer',
  },
  ideaFocusDoneOn: {
    background: 'hsl(45 74% 62%)',
    borderColor: 'hsl(45 60% 46%)',
    color: 'hsl(45 40% 16%)',
  },
  ideaFocusClose: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    borderRadius: '999px',
    border: '1px solid transparent',
    color: BOARD_INK.dialogInkDim,
    background: 'transparent',
    fontSize: '1.05em',
    lineHeight: '1',
    cursor: 'pointer',
  },
  /**
   * The title is a field, but it is drawn as the first line of the note:
   * no well, no border, just the words and the rule under them.
   */
  ideaFocusTitle: {
    flex: '0 0 auto',
    width: '100%',
    minHeight: '1.5em',
    maxHeight: '7em',
    boxSizing: 'border-box',
    padding: '2px 0 9px',
    font: 'inherit',
    fontSize: '1.24em',
    fontWeight: '650',
    lineHeight: '1.45',
    color: BOARD_INK.dialogInk,
    caretColor: BOARD_INK.accent,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid ' + BOARD_INK.dialogRule,
    outline: 'none',
    resize: 'none',
    overflow: 'auto',
  },
  /** The body takes the rest of the sheet, and is the whole of what it says. */
  ideaFocusBody: {
    flex: '1 1 auto',
    width: '100%',
    minHeight: '0',
    boxSizing: 'border-box',
    padding: '10px 0 0',
    font: 'inherit',
    fontSize: '0.98em',
    lineHeight: '1.72',
    color: BOARD_INK.dialogInk,
    caretColor: BOARD_INK.accent,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    overflow: 'auto',
  },
  ideaFocusMeta: {
    flex: '0 0 auto',
    minHeight: '18px',
    fontSize: '0.8em',
    lineHeight: '1.45',
    color: BOARD_INK.dialogInkDim,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none',
  },
  ideaFocusActions: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '12px',
    borderTop: '1px solid ' + BOARD_INK.dialogRule,
  },
  ideaFocusKeys: {
    flex: '1 1 auto',
    minWidth: '0',
    fontSize: '0.73em',
    letterSpacing: '0.03em',
    color: BOARD_INK.dialogInkDim,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none',
  },
  ideaFocusGhost: {
    flex: '0 0 auto',
    padding: '8px 13px',
    borderRadius: '9px',
    fontSize: '0.86em',
    color: BOARD_INK.dialogInkDim,
    background: 'transparent',
    border: '1px solid ' + BOARD_INK.dialogFieldEdge,
    cursor: 'pointer',
    userSelect: 'none',
  },
  ideaFocusPrimary: {
    flex: '0 0 auto',
    padding: '8px 17px',
    borderRadius: '9px',
    fontSize: '0.88em',
    fontWeight: '600',
    color: BOARD_INK.accentOn,
    background: BOARD_INK.accent,
    border: '1px solid transparent',
    boxShadow: '0 1px 2px rgba(8, 10, 16, 0.22)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** What the hand is told when the paper will not take the card. */
  noDropTip: {
    position: 'absolute',
    zIndex: '45',
    maxWidth: '250px',
    padding: '5px 9px',
    borderRadius: '8px',
    background: 'rgba(26, 22, 14, 0.95)',
    color: '#fde68a',
    border: '1px solid rgba(234, 179, 8, 0.45)',
    fontSize: '0.78em',
    lineHeight: '1.45',
    pointerEvents: 'none',
    boxShadow: '0 10px 24px -14px rgba(0, 0, 0, 0.7)',
  },
  /**
   * The conversations of one goal, laid out whole.
   *
   * No cap and no inner scroll: a panel is as tall as the cards in it,
   * and the paper under it grows to match, so every conversation is
   * spread open where the eye can take it in at once. A reader who wants
   * the bottom of a long list moves the canvas — the one surface here
   * that already knows how to scroll.
   */
  blockBody: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  /**
   * A goal's body reads across, not down.
   *
   * The canvas has two axes and each one says one thing: a row is
   * conversations, side by side and equal, and a column under one of them is
   * the thoughts filed under that conversation. A goal grows wider as it
   * gains conversations, the way it used to grow taller.
   */
  blockRow: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: '12px',
  },
  /** The row of columns itself: the body's padding is already around it. */
  columns: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: '12px',
  },
  /**
   * The long strip at the foot of a goal: what the reader finished today.
   *
   * It is a place of its own rather than a line across the work above it -
   * a strip that opens, and holds cards, the way the quiet one does. The
   * strip stands whether it holds anything or not: a goal that has not
   * finished a thing today still has a place to put one, and a strip that
   * appeared only after the first drop would be a target the hand cannot
   * aim at before it has used it once.
   */
  doneBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '0 12px 12px',
  },
  /** The whole width is the switch: a bar is easier to hit than a caret. */
  doneHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 10px',
    borderRadius: '9px',
    background: 'rgba(255, 255, 255, 0.035)',
    border: '1px solid ' + BOARD_INK.line,
    fontSize: '0.8em',
    letterSpacing: '0.02em',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background-color .14s ease, border-color .14s ease, color .14s ease',
  },
  /** Open, it says so in its own ink rather than in a second mark. */
  doneHeadOpen: {
    color: BOARD_INK.text,
    background: 'rgba(255, 255, 255, 0.055)',
    borderColor: BOARD_INK.cardEdge,
  },
  /** The count takes the far end: the words are the label, this is the fact. */
  doneCount: {
    marginLeft: 'auto',
    flex: '0 0 auto',
    fontSize: '0.94em',
    opacity: '0.8',
  },
  /** Today's finished cards, laid across the strip like the ones above. */
  doneGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    alignContent: 'flex-start',
    gap: '12px',
    width: '100%',
  },
  /** An empty strip says what it would take rather than staying blank. */
  doneEmpty: {
    padding: '2px 2px 0',
    fontSize: '0.78em',
    lineHeight: '1.55',
    color: BOARD_INK.dim,
    opacity: '0.75',
  },
  /** One conversation, and the thoughts that belong to it underneath. */
  column: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: BOARD_CARD_W + 'px',
  },
  /** The columns of a panel, with the quiet strip standing under them. */
  blockColumnsWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '12px',
    maxWidth: '100%',
  },
  /**
   * The conversations a panel merely carried in: a line to open, then a line
   * each. Quiet, not gone - it is the last thing in the panel.
   */
  quietStrip: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
    paddingTop: '8px',
    borderTop: '1px solid ' + BOARD_INK.line,
  },
  quietHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8em',
    letterSpacing: '0.02em',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  quietRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 6px',
    borderRadius: '8px',
    fontSize: '0.86em',
    cursor: 'pointer',
  },
  /** The goal's own colour, so a line still says where it belongs. */
  quietDot: { flex: '0 0 auto', width: '7px', height: '7px', borderRadius: '50%', opacity: '0.8' },
  quietName: {
    flex: '1 1 auto',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  quietCards: { flex: '0 0 auto', fontSize: '0.92em', color: BOARD_INK.dim, cursor: 'pointer' },
  quietDays: { flex: '0 0 auto', fontSize: '0.92em', color: BOARD_INK.dim, opacity: '0.7' },
  quietStack: { padding: '2px 0 6px 15px', maxWidth: '100%' },
  /** The thoughts under one conversation, in the order the reader keeps. */
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    // The thoughts stand under the conversation, stepped in from its left
    // edge: the column then reads as one piece of work with what was
    // written about it underneath, rather than as a row of equal cards.
    marginLeft: BOARD_NOTE_INDENT + 'px',
    borderRadius: '10px',
    minHeight: '8px',
    transition: 'background-color .12s ease, box-shadow .12s ease',
  },
  tree: { display: 'flex', flexDirection: 'column', gap: '14px' },
  thread: { position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px' },
  /** A thread that sits under a parent: the rail its children hang from. */
  threadNested: {},
  /** The block of branches under one conversation. */
  children: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginLeft: '16px',
    paddingLeft: '14px',
    borderLeft: '2px solid ' + BOARD_INK.fork,
  },
  /** The short stroke from the rail to a branch's card. */
  connector: {
    position: 'absolute',
    left: '-14px',
    top: '22px',
    width: '14px',
    borderTop: '2px solid ' + BOARD_INK.fork,
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxSizing: 'border-box',
    padding: '11px 12px',
    borderRadius: '10px',
    background: solidPaper(BOARD_INK.card),
    border: '1px solid ' + BOARD_INK.cardEdge,
    // The card is a way in, so the pointer says so. Carrying it still works
    // from anywhere on it - the press and the first four pixels decide
    // which of the two the gesture is - and the carried copy takes the
    // grabbing cursor while it is in the air.
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The name and its lock: one line, the name giving way to the mark. */
  cardTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    minWidth: '0',
  },
  /**
   * The rail: every mark the card carries, on its right edge.
   *
   * Three rows of two seats, always six of them. The title and the line
   * under it own the left of the card, and the marks are a column of their
   * own on the right - the eye reads the work first and the verbs second,
   * and a mark never moves to a different place from one card to the next
   * because the grid holds the seat whether or not it holds a mark.
   */
  cardRail: {
    flex: '0 0 auto',
    display: 'grid',
    gridTemplateColumns: '18px 18px',
    gridAutoRows: '18px',
    gap: '6px 8px',
    alignContent: 'center',
    justifyItems: 'center',
    alignItems: 'center',
    marginLeft: '8px',
  },
  /** One seat of that rail, with a mark in it. */
  cardSlot: {
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** An empty seat: it keeps the grid's shape and takes no press. */
  cardSlotOff: {
    width: '18px',
    height: '18px',
    display: 'flex',
    pointerEvents: 'none',
  },
  cardLock: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    marginTop: '1px',
    borderRadius: '999px',
    color: 'inherit',
    opacity: '0.28',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardLockOn: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    marginTop: '1px',
    borderRadius: '999px',
    color: BOARD_INK.accent,
    opacity: '1',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The row that says how many finished thoughts are not drawn. */
  doneMore: {
    alignSelf: 'flex-start',
    marginTop: '2px',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '0.76em',
    color: BOARD_INK.noteInkDim,
    background: 'rgba(255, 255, 255, 0.35)',
    border: '1px solid ' + BOARD_INK.noteEdge,
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardTitle: {
    display: '-webkit-box',
    WebkitLineClamp: '1',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '1em',
    // One line is the name's whole seat. The second line the card used to
    // keep empty now holds what the conversation was last told (see
    // `cardSaid`), so a card is the same height it always was.
    minHeight: '1.4em',
    // A note's own title is 600 at 0.95em; the card keeps the weight and
    // the larger size, because the card is the work and the paper is what
    // was said about it. The eye lands on the work first.
    fontWeight: '600',
    lineHeight: '1.4',
  },
  /**
   * What the conversation was last given, in the reader's own words: one
   * line, under the name.
   *
   * A fact about the work rather than about its state, so it keeps a line
   * of its own: sharing the chip's row leaves about eight characters at
   * this width, which reads worse than saying nothing. Its height is the
   * line the name used to reserve and leave empty, so the card does not
   * grow.
   */
  cardSaid: {
    minHeight: '1.75em',
    fontSize: '0.8em',
    lineHeight: '1.4',
    color: BOARD_INK.text,
    opacity: '0.55',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  /**
   * The line pinned to a card's conversation.
   *
   * Under the name and above the facts, because it is about the
   * conversation rather than about what it is doing: a thought the reader
   * had is the next thing to read after which conversation it belongs to.
   */
  cardNote: {
    marginTop: '2px',
    paddingLeft: '7px',
    borderLeft: '2px solid ' + BOARD_INK.accentSoft,
    fontSize: '0.8em',
    lineHeight: '1.4',
    opacity: '0.78',
    display: '-webkit-box',
    WebkitLineClamp: '2',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  /** The field a line is typed into, in place of the line it replaces. */
  cardNoteBox: {
    marginTop: '2px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '3px 6px',
    font: 'inherit',
    fontSize: '0.88em',
    color: BOARD_INK.text,
    background: BOARD_INK.input,
    border: '1px solid ' + BOARD_INK.inputEdge,
    borderRadius: '5px',
    outline: 'none',
  },
  /** The name field: same material as a note's, because it is the same idea. */
  cardRenameBox: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '3px 6px',
    font: 'inherit',
    fontSize: '1em',
    fontWeight: '500',
    color: BOARD_INK.text,
    background: BOARD_INK.input,
    border: '1px solid ' + BOARD_INK.inputEdge,
    borderRadius: '5px',
    outline: 'none',
  },
  /** Where the branch came from, when that conversation is not on the panel. */
  forkSource: {
    fontSize: '0.8em',
    lineHeight: '1.4',
    color: BOARD_INK.accent,
    opacity: '0.85',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '2px',
    fontSize: '0.82em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
  /**
   * The dim half of the meta line. The dimness lives on the cell rather
   * than on the line, because the line also carries the status chip and a
   * parent's opacity would wash the chip's colour out with everything else.
   */
  cardMetaDim: { opacity: '0.5', flex: '0 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis' },
  /**
   * The status chip, leading the meta line.
   *
   * Same seat it holds on the task window's rows — ahead of the name — and
   * the same three colours, so a card running a turn reads the same here as
   * it does there.
   */
  // The state word never yields: it is the one cell that says what the card
  // is doing. The time beside it is what gives way when the line is tight.
  cardChip: {
    flex: '0 0 auto',
    padding: '1px 7px',
    borderRadius: '5px',
    whiteSpace: 'nowrap',
    fontSize: '0.92em',
  },
  cardChipPending: { color: '#fbbf24', background: 'rgba(251, 191, 36, 0.14)' },
  cardChipRunning: { color: '#4ade80', background: 'rgba(74, 222, 128, 0.14)' },
  cardChipDone: { color: '#7dd3fc', background: 'rgba(125, 211, 252, 0.14)' },
  // The three the card says on its own. They are deliberately quiet: the
  // loud blue is for the one card that wants the reader now, and a word
  // about what already happened must not compete with it.
  cardChipFinished: { color: BOARD_INK.dim },
  cardChipPaused: { color: BOARD_INK.dim, background: BOARD_INK.column },
  cardChipSettled: { color: BOARD_INK.dim, background: BOARD_INK.column },
  /**
   * The empty seat, before the reader has said anything.
   *
   * Drawn as a faint plus rather than nothing, because a slot that appears
   * only once you know it exists is a slot nobody finds.
   */
  cardStateAdd: {
    flex: '0 0 auto',
    padding: '1px 7px',
    borderRadius: '5px',
    fontSize: '0.92em',
    color: BOARD_INK.dim,
    opacity: '0.4',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The two words, and the way back to no word at all. */
  verdictMenu: {
    position: 'absolute',
    top: '24px',
    left: '4px',
    zIndex: '30',
    minWidth: '104px',
    display: 'flex',
    flexDirection: 'column',
    padding: '4px',
    borderRadius: '9px',
    background: BOARD_INK.dialog,
    border: '1px solid ' + BOARD_INK.dialogEdge,
    boxShadow: '0 14px 28px -16px rgba(8, 12, 20, 0.55)',
  },
  verdictItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '0.86em',
    whiteSpace: 'nowrap',
    color: BOARD_INK.dialogInk,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The mark that offers to start a line on a card that has none. */
  cardNotePin: { padding: '0 2px', color: BOARD_INK.dim, cursor: 'pointer' },
  /**
   * The way into what this conversation has had put away.
   *
   * A box and a count, drawn only when there is something in it: the mark is
   * evidence, not a door that is always standing open on an empty room.
   */
  cardArchive: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '0 4px',
    borderRadius: '5px',
    fontSize: '0.9em',
    color: BOARD_INK.dim,
    background: BOARD_INK.column,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The card read left to right: the words first, then what to do with them. */
  cardRow: { display: 'flex', alignItems: 'stretch', gap: '10px' },
  /** The four fifths that say what this conversation is. */
  cardMain: {
    position: 'relative',
    flex: '1 1 0',
    minWidth: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  /**
   * The drop target for a carried idea card.
   *
   * Not a button and not a fifth of the card: the card itself is the way in,
   * so this only exists while something is being carried, and it is the
   * surface a hand can let go on to hand the words to this conversation.
   */
  cardEnter: {
    position: 'absolute',
    top: '4px',
    bottom: '4px',
    right: '4px',
    // A band, not the whole card: letting go here hands the words over, while
    // the rest of the card still means the gentler thing - tie the note to it.
    width: '38%',
    zIndex: '3',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    borderRadius: '7px',
    background: 'rgba(147, 197, 253, 0.16)',
    border: '1px dashed ' + BOARD_INK.accent,
    color: BOARD_INK.accent,
    fontSize: '0.78em',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  /** The branch mark, one of the quiet verbs at the end of the meta line. */
  cardForkButton: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 2px',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The card a hand is carrying, drawn over the paper until it is let go. */
  ghost: {
    position: 'absolute',
    zIndex: '40',
    boxSizing: 'border-box',
    borderRadius: '11px',
    opacity: '1',
    transform: 'rotate(-0.4deg)',
    boxShadow: '0 22px 44px -20px rgba(12, 16, 24, 0.62)',
    pointerEvents: 'none',
  },
  /** The goal's name, typed in the heading it belongs to. */
  blockRenameBox: {
    flex: '1 1 auto',
    minWidth: '0',
    boxSizing: 'border-box',
    padding: '2px 6px',
    font: 'inherit',
    fontSize: '1.02em',
    fontWeight: '650',
    color: BOARD_INK.text,
    background: BOARD_INK.input,
    border: '1px solid ' + BOARD_INK.inputEdge,
    borderRadius: '6px',
    outline: 'none',
  },
  /**
   * The ⋯ at the end of the name line: the card's low-frequency verbs.
   *
   * The board names a conversation from the thought that started it, so
   * typing a name by hand is the rare case - and a word for it that stood
   * over the end of the name cost every card a slice of its title and shared
   * a corner with the lock. One quiet mark for every verb that is not worth
   * a seat of its own is the same bargain the idea cards struck.
   */
  cardMore: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    fontSize: '0.95em',
    lineHeight: '1',
    color: 'inherit',
    opacity: '0.42',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /**
   * The menu behind that ⋯: the one solid stock on the board.
   *
   * A card is a tint of the sheet, so the card's own paper would read
   * straight through its menu. This is the dialog's stock, which hides what
   * is behind it in both mounts, in the card's own shape.
   */
  cardMenu: {
    position: 'absolute',
    top: '26px',
    right: '6px',
    zIndex: '30',
    minWidth: '132px',
    display: 'flex',
    flexDirection: 'column',
    padding: '4px',
    borderRadius: '9px',
    background: BOARD_INK.dialog,
    border: '1px solid ' + BOARD_INK.dialogEdge,
    boxShadow: '0 14px 28px -16px rgba(9, 11, 16, 0.6)',
  },
  cardMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '0.86em',
    whiteSpace: 'nowrap',
    color: BOARD_INK.dialogInk,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /**
   * Which of several same-named cards this is.
   *
   * Only drawn when the board is actually showing a collision, because that
   * is the only time the answer is worth a column of the meta line: two
   * conversations can honestly share a name, and a reader looking at them
   * has no other way to say which one they mean.
   */
  cardDupTag: {
    flex: '0 0 auto',
    fontSize: '0.92em',
    opacity: '0.45',
    fontVariantNumeric: 'tabular-nums',
  },
  /** The mark: quiet until it is set, which is the whole of what it says. */
  cardStar: {
    flex: '0 0 auto',
    padding: '0 2px',
    fontSize: '1.05em',
    lineHeight: '1.2',
    color: BOARD_INK.dim,
    cursor: 'pointer',
  },
  /**
   * One loose card: a note on paper, pinned where the reader put it.
   *
   * Deliberately a different material from a conversation card: warm paper,
   * a spine on the left, and a heading that reads as a handle. The amber is
   * the one thing that says "this is not a conversation" before a word is
   * read, and it is quiet enough to sit beside the work without shouting.
   */
  loose: {
    position: 'absolute',
    zIndex: '2',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    boxSizing: 'border-box',
    // The default size is the card's, set on the element: a thought should
    // occupy the same piece of paper whether it is three words or thirty,
    // and only the field inside it should follow the words.
    padding: '9px 12px 12px 14px',
    borderRadius: '11px',
  },
  /** The card being typed into: a ring, so the field is where the eye is. */
  looseEditing: {
    borderColor: BOARD_INK.accent,
    boxShadow: '0 0 0 2px ' + BOARD_INK.accentSoft + ', 0 12px 28px rgba(12, 16, 24, 0.16)',
  },
  /** The tray's body: two named sections, not one column. */
  tray: { display: 'flex', flexDirection: 'column', gap: '4px' },
  trayCaption: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    marginTop: '4px',
    fontSize: '0.72em',
    letterSpacing: '0.12em',
    color: BOARD_INK.dim,
    userSelect: 'none',
  },
  trayCount: { fontSize: '0.92em', opacity: '0.8', fontVariantNumeric: 'tabular-nums' },
  trayQuiet: { padding: '2px 2px 4px', fontSize: '0.82em', opacity: '0.42' },
  /**
   * A conversation standing in the tray wears the ideas' paper.
   *
   * The tray is one material, so its cards are inked where they are built -
   * a card's surface is an inline style, and a stylesheet cannot reach it.
   */

  trayCard: {
    background: solidPaper(BOARD_INK.note),
    borderColor: BOARD_INK.noteEdge,
    // The spine is half of what makes a note look like a note: without it the
    // paper alone reads as a faint tint next to a neutral card.
    borderLeft: '3px solid ' + BOARD_INK.noteSpine,
  },
  /**
   * The lane at the foot of a goal: what the reader themselves did about it.
   *
   * The board is mostly the agents' work, and the reader's own half of a
   * goal is the one thing it had nowhere to put. This row is that place: a
   * note dragged here is kept as a line under the goal, in the same paper
   * the inbox has always used - the tray, one per goal, which is what let
   * the inbox stop being a kind of card of its own.
   */
  lane: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 12px 10px',
    borderTop: '1px solid ' + BOARD_INK.line,
  },
  laneEmpty: {
    padding: '2px',
    fontSize: '0.82em',
    color: BOARD_INK.dim,
    opacity: '0.75',
  },
  /**
   * A thought filed under a conversation, read the way the inbox reads one.
   *
   * A card on the paper is a piece of paper; a card that has been filed is a
   * line of a list, and both places it can be filed - a goal's lane and a
   * conversation's column - draw that line the same way, so filing a thought
   * reads as one change of state rather than two. What it keeps is its own
   * paper colour and its own marks: the hue says which goal it belongs to,
   * and the marks are what can be done with it from here.
   */
  stackedNote: {
    padding: '4px 6px 4px 10px',
    minHeight: '30px',
    borderRadius: '8px',
    gap: '6px',
  },
  stackedHead: { alignItems: 'center', gap: '6px' },
  stackedTitle: { fontSize: '0.86em', fontWeight: '400', lineHeight: '1.5' },
  /** One put-away note: a line, not a piece of paper. */
  trayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxSizing: 'border-box',
    // A line of the tray, but still a piece of the same paper: the free
    // card's radius is 11px, and the row is a strip cut from it.
    padding: '4px 6px 4px 10px',
    minHeight: '30px',
    borderRadius: '8px',
    cursor: 'grab',
    userSelect: 'none',
  },
  trayText: {
    flex: '1 1 auto',
    minWidth: '0',
    fontSize: '0.86em',
    lineHeight: '1.5',
    color: BOARD_INK.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    // The row is the thing under the pointer, not its words: the row's own
    // grab is the honest cursor, and a caret would claim an edit that only
    // the opened card can offer.
    cursor: 'inherit',
  },
  /**
   * One finished note: the same piece of paper as the card it was.
   *
   * The list is made of cards, not of rows that look like cards: a finished
   * thought is still a thought, and the reader should recognise it here.
   */
  doneRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    boxSizing: 'border-box',
    padding: '5px 6px 5px 9px',
    borderRadius: '8px',
    cursor: 'grab',
    userSelect: 'none',
  },
  doneRowOpen: {
    boxShadow: '0 0 0 2px rgba(147, 197, 253, 0.22)',
  },
  doneRowMain: {
    flex: '1 1 auto',
    minWidth: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  doneRowTitle: {
    fontSize: '0.88em',
    lineHeight: '1.45',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  doneRowBody: {
    fontSize: '0.78em',
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  doneRowFull: {
    fontSize: '0.86em',
    lineHeight: '1.55',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  /** The two marks a line carries: put it back, or drop it. */
  doneRowAction: {
    flex: '0 0 auto',
    padding: '0 2px',
    fontSize: '0.92em',
    lineHeight: '1.5',
    color: BOARD_INK.dim,
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** A put-away row with its whole note showing: the list is read, not written. */
  trayTextOpen: {
    whiteSpace: 'pre-wrap',
    overflow: 'visible',
    textOverflow: 'clip',
    wordBreak: 'break-word',
    lineHeight: '1.55',
  },
  trayEditor: {
    flex: '1 1 auto',
    minWidth: '0',
    boxSizing: 'border-box',
    padding: '0 0 1px',
    font: 'inherit',
    fontSize: '0.86em',
    lineHeight: '1.5',
    color: BOARD_INK.text,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid ' + BOARD_INK.inputEdge,
    outline: 'none',
  },
  trayChip: {
    flex: '0 0 auto',
    maxWidth: '42%',
    fontSize: '0.72em',
    color: BOARD_INK.accent,
    opacity: '0.85',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  /**
   * The card's first line, in the row it shares with its box and its marks.
   *
   * One line, always: a title that wraps is a paragraph. The full sentence is
   * one press away, in the field.
   */
  looseTitle: {
    flex: '1 1 auto',
    minWidth: '0',
    fontSize: '0.95em',
    fontWeight: '600',
    lineHeight: '1.35',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'inherit',
  },
  /**
   * The title when it is being typed: the same line, with a rule under it.
   *
   * This is the one state of that line that does want a caret - a field
   * that is open is a place to write, and it says so.
   */
  looseTitleBox: {
    boxSizing: 'border-box',
    cursor: 'text',
    padding: '0 0 1px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid currentColor',
    outline: 'none',
    font: 'inherit',
  },
  looseHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'grab',
    userSelect: 'none',
  },


  /**
   * The pin on a thought: a lock that keeps a tidy from moving the card.
   *
   * Drawn in the paper's own ink and quiet until it is on, like every other
   * mark on this card: a lock nobody set is a fact about nothing.
   */
  looseLock: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    color: 'inherit',
    opacity: '0.42',
    cursor: 'pointer',
    userSelect: 'none',
  },
  looseLockOn: { opacity: '0.95' },
  /** Cutting the tie: a mark the size of the × beside it, drawn not spelled. */
  looseUnlink: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    borderRadius: '999px',
    border: '1px solid transparent',
    background: 'transparent',
    // Inherited, not named: the mark is drawn on paper, and the paper decides
    // what ink the marks around it are written in.
    color: 'inherit',
    opacity: '0.6',
    cursor: 'pointer',
  },
  /** The two verbs a thought's heading keeps: hand it over, or open the rest. */
  looseDeliver: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    color: 'inherit',
    opacity: '0.62',
    cursor: 'pointer',
    userSelect: 'none',
  },
  looseMore: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    fontSize: '1.05em',
    lineHeight: '1',
    color: 'inherit',
    opacity: '0.55',
    cursor: 'pointer',
    userSelect: 'none',
  },
  /** The menu behind that ⋯: a slip of the card's own paper, pinned under it. */
  ideaMenu: {
    position: 'absolute',
    top: '24px',
    right: '4px',
    zIndex: '30',
    minWidth: '152px',
    display: 'flex',
    flexDirection: 'column',
    padding: '4px',
    borderRadius: '9px',
    background: solidPaper(BOARD_INK.note),
    border: '1px solid ' + BOARD_INK.noteEdge,
    boxShadow: '0 14px 28px -16px rgba(20, 14, 4, 0.6)',
  },
  ideaMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '0.86em',
    whiteSpace: 'nowrap',
    color: BOARD_INK.noteInk,
    cursor: 'pointer',
    userSelect: 'none',
  },
  looseRemove: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    borderRadius: '999px',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'inherit',
    opacity: '0.6',
    fontSize: '0.95em',
    lineHeight: '1',
    cursor: 'pointer',
  },
  looseText: {
    marginTop: '2px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: BOARD_INK.text,
    // A card is paper, not a window: what it cannot hold ends in an
    // ellipsis and a fade (see `data-clipped`), never in a scrollbar inside
    // a piece of paper. Type and line box are written on the element from
    // `boardNoteMetrics`, which is also what planned the card's height.
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: '1',
    overflow: 'hidden',
    // Paper, not a window: the card is lifted by its paper and written in
    // through its editor, so the words carry no caret of their own.
    cursor: 'inherit',
  },
  looseEditor: {
    marginTop: '2px',
    width: '100%',
    boxSizing: 'border-box',
    // The field is as tall as the words in it, and not a line more: the
    // card being edited should be the card it was, not a taller one. The
    // height is written on the element as the row count it needs (see
    // `boardEditorRows`), which is what `rows` alone cannot say.
    // No cap: a thought is read whole, so the field grows with the writing
    // and the paper grows with the field.
    minHeight: '1.65em',
    maxHeight: 'none',
    resize: 'none',
    font: 'inherit',
    fontSize: '0.93em',
    lineHeight: '1.65',
    color: BOARD_INK.text,
    background: 'transparent',
    border: 'none',
    padding: '0',
    outline: 'none',
  },
  /** The line between a card and the conversation it was laid beside. */
  link: {
    position: 'absolute',
    height: '2px',
    zIndex: '0',
    background: BOARD_INK.fork,
    transformOrigin: '0 50%',
    pointerEvents: 'none',
  },
  /** The sheet the curved ties are drawn on. */
  linkLayer: {
    position: 'absolute',
    left: '0',
    top: '0',
    overflow: 'visible',
    zIndex: '0',
    pointerEvents: 'none',
  },
  /** The bead at either end of a link line. */
  linkDot: {
    position: 'absolute',
    width: '5px',
    height: '5px',
    marginLeft: '-2.5px',
    marginTop: '-2.5px',
    borderRadius: '999px',
    background: BOARD_INK.fork,
    zIndex: '1',
    pointerEvents: 'none',
  },
  /**
   * A finished card keeps its paper and loses its urgency.
   *
   * Turning the whole card translucent and grey - which is what this did -
   * is the one way to make a note both greyed out and unreadable. The state
   * is in the ink: the words are struck and dimmed, and the paper goes from
   * amber to neutral, so a done note can still be read for what it said.
   */
  looseDone: {
    background: BOARD_INK.noteDone,
    borderColor: BOARD_INK.noteDoneEdge,
    borderLeftColor: 'hsl(45 10% 56%)',
    color: BOARD_INK.noteDoneInk,
  },
  /** The done mark an idea card carries: a box that fills when it is set. */
  cardDoneToggle: {
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: '17px',
    height: '17px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    // On amber paper a faint outline reads as nothing at all, which is how
    // a control ends up being reported as "not there".
    border: '1px solid ' + BOARD_INK.noteEdge,
    background: 'transparent',
    color: 'transparent',
    fontSize: '0.78em',
    lineHeight: '1',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardDoneToggleOn: {
    borderColor: BOARD_INK.noteSpine,
    background: 'rgba(234, 179, 8, 0.18)',
    color: BOARD_INK.noteSpine,
  },

  /** The colour echo of the panel a note belongs to. */
  noteDot: {
    flex: '0 0 auto',
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    marginRight: '-3px',
  },
  /** Breaking the tie: a word, not a mark, so it cannot be pressed by accident. */
  looseUnlink: {
    flex: '0 0 auto',
    padding: '0 2px',
    fontSize: '0.72em',
    color: BOARD_INK.dim,
    opacity: '0.7',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  empty: { padding: '4px 2px', fontSize: '0.86em', opacity: '0.45' },
  emptyBoard: {
    position: 'absolute',
    left: '50%',
    top: '38%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '440px',
    textAlign: 'center',
    fontSize: '1.05em',
    lineHeight: '1.65',
    opacity: '0.5',
    pointerEvents: 'none',
  },
  footer: {
    padding: '10px 22px',
    fontSize: '0.84em',
    opacity: '0.5',
    borderTop: '1px solid ' + BOARD_INK.line,
  },
}

/**
 * The board as a page in the main column.
 *
 * The page owns the height and the strip below the window chrome; the board
 * owns the rest. The palette is the host's — `applyBoardPageInk` sets the
 * properties the builders read — so the same markup reads as a page instead
 * of as a dark sheet.
 */
// The sheet wears the shared paper: `loose` above is its layout, this is its
// material, and the tray's line reads the same object.
Object.assign(BOARD_UI.loose, NOTE_PAPER)

var BOARD_PAGE_UI = {
  surface: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '0',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    color: BOARD_INK.text,
    // The page owns its surface: it should read as part of the application,
    // not as a dark sheet dropped into it.
    background: 'var(--dshv-board-page, var(--dsw-alias-bg-base, transparent))',
  },
  header: Object.assign({}, BOARD_UI.header, {
    flex: 'none',
    padding: 'calc(24px + var(--dsh-frame-top-clearance, 0px)) clamp(20px, 4vw, 48px) 12px',
  }),
  body: Object.assign({}, BOARD_UI.body, {
    flex: '1',
    minHeight: '0',
  }),
  footer: Object.assign({}, BOARD_UI.footer, {
    flex: 'none',
    padding: '10px clamp(20px, 4vw, 48px) 16px',
  }),
}

/**
 * The overview's own few shapes.
 *
 * The page borrows the board's paper and heading, and adds only what the
 * board has no use for: a row of figures, and a table of conversations.
 * Everything reads a page token, so a host that renamed one loses colour
 * rather than the page.
 */
var OVERVIEW_UI = {
  body: {
    flex: '1',
    minHeight: '0',
    overflow: 'auto',
    boxSizing: 'border-box',
    padding: '4px clamp(20px, 4vw, 48px) 28px',
  },
  /** The day's four counts, read as one line of figures. */
  figures: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 34px',
    padding: '2px 0 16px',
  },
  figure: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '64px' },
  figureValue: {
    fontSize: '1.75em',
    fontWeight: '650',
    lineHeight: '1.1',
    fontVariantNumeric: 'tabular-nums',
  },
  figureLabel: { fontSize: '0.8em', color: 'var(--dshv-board-dim, rgba(127, 127, 127, 0.7))' },
  loose: {
    padding: '0 0 14px',
    fontSize: '0.84em',
    color: 'var(--dshv-board-dim, rgba(127, 127, 127, 0.7))',
  },
  rule: {
    height: '1px',
    background: 'var(--dshv-board-line, rgba(127, 127, 127, 0.22))',
    margin: '0 0 4px',
  },
  table: { display: 'flex', flexDirection: 'column', width: '100%', minWidth: '0' },
  headRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.9fr) repeat(3, minmax(56px, 0.4fr))',
    gap: '12px',
    padding: '8px 0 6px',
    fontSize: '0.78em',
    color: 'var(--dshv-board-dim, rgba(127, 127, 127, 0.7))',
    borderBottom: '1px solid var(--dshv-board-line, rgba(127, 127, 127, 0.22))',
  },
  /** A heading over a left-aligned column. */
  headCell: {
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  /** A heading over a column of numbers: right, like the numbers under it. */
  headCellNum: {
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.9fr) repeat(3, minmax(56px, 0.4fr))',
    gap: '12px',
    alignItems: 'center',
    padding: '9px 0',
    borderBottom: '1px solid var(--dshv-board-line, rgba(127, 127, 127, 0.22))',
  },
  name: {
    fontSize: '0.94em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  goal: {
    fontSize: '0.84em',
    color: 'var(--dshv-board-dim, rgba(127, 127, 127, 0.7))',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  num: {
    fontSize: '0.94em',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  numQuiet: {
    fontSize: '0.94em',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--dshv-board-dim, rgba(127, 127, 127, 0.7))',
  },
  empty: {
    padding: '26px 0',
    fontSize: '0.94em',
    color: 'var(--dshv-board-dim, rgba(127, 127, 127, 0.7))',
  },
}

/**
 * Paint the page with the host's theme.
 *
 * The builders read custom properties whose fallbacks are the overlay's dark
 * sheet; setting them on the page root is the whole difference between the
 * two coats. Literal values stay as the fallback so an older host that
 * renamed a token loses colour, not the board.
 * @param {Element} root - the page's root element.
 * @returns {void}
 */
function applyBoardPageInk(root) {
  if (!root || !root.style || typeof root.style.setProperty !== 'function') return
  var ink = {
    '--dshv-board-page': 'var(--dsw-alias-bg-base, transparent)',
    '--dshv-board-line': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-accent-on': 'var(--dsw-alias-label-on-color, #ffffff)',
    '--dshv-board-sheet': 'transparent',
    '--dshv-board-base': 'var(--dsw-alias-bg-base, #2f3644)',
    '--dshv-board-edge': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-text': 'var(--dsw-alias-label-primary, inherit)',
    '--dshv-board-dim': 'var(--dsw-alias-label-tertiary, rgba(127, 127, 127, 0.7))',
    '--dshv-board-column': 'var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.06))',
    '--dshv-board-column-edge': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-card': 'var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.10))',
    '--dshv-board-card-edge': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-card-hover': 'var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.16))',
    '--dshv-board-fork': 'var(--dsw-alias-border-selected, rgba(79, 124, 255, 0.45))',
    '--dshv-board-dot': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.20))',
    '--dshv-board-note': 'rgba(234, 179, 8, 0.10)',
    '--dshv-board-note-edge': 'rgba(234, 179, 8, 0.32)',
    '--dshv-board-note-spine': 'var(--dsw-alias-label-warning, #d97706)',
    '--dshv-board-accent': 'var(--dsw-alias-brand-primary, #4f7cff)',
    '--dshv-board-accent-soft': 'var(--dsw-alias-bg-mask-3, rgba(79, 124, 255, 0.16))',
    '--dshv-board-input': 'var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.08))',
    '--dshv-board-input-edge': 'var(--dsw-alias-border-selected, rgba(79, 124, 255, 0.6))',
    // The window is the host's own surface: the page coat sets the base
    // colour, so the dialog reads as part of the application instead of a
    // dark sheet dropped into it. Solids only - a form is not a tint.
    '--dshv-board-dialog': 'var(--dsw-alias-bg-base, #ffffff)',
    '--dshv-board-dialog-edge': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-dialog-ink': 'var(--dsw-alias-label-primary, inherit)',
    '--dshv-board-dialog-ink-dim': 'var(--dsw-alias-label-tertiary, rgba(127, 127, 127, 0.7))',
    '--dshv-board-dialog-field': 'var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.06))',
    '--dshv-board-dialog-field-edge': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-dialog-rule': 'var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22))',
    '--dshv-board-dialog-scrim': 'rgba(17, 20, 27, 0.32)',
    '--dshv-board-dialog-error': 'hsl(6 62% 44%)',
  }
  for (var name in ink) {
    if (!Object.prototype.hasOwnProperty.call(ink, name)) continue
    root.style.setProperty(name, ink[name])
  }
}

/**
 * The board's own stroke glyphs, drawn the way the host draws its icons.
 *
 * A plugin does not load the host's Client packages as modules, so an icon
 * has to be drawn rather than imported. A 16-unit box, a 1.5 stroke and
 * `currentColor` give the same weight and the same colour as the glyphs
 * the shell puts beside them; a mount without SVG gets the plain mark.
 */
var BOARD_ICONS = {
  /** An arrow going into a frame: the shell's own mark for "open this". */
  enter: {
    paths: [
      'M9.8 2.9h2.6a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H9.8',
      'M2.6 8h7.2',
      'M7 5.2 9.8 8 7 10.8',
    ],
    fallback: '\u21B5',
  },
  /** A flat line pointing down: there is more of this card to see. */
  expand: {
    paths: ['M4.2 6.6 8 10.4 11.8 6.6'],
    fallback: '\u2304',
  },
  /** The same line pointing up: the whole of it is showing. */
  collapse: {
    paths: ['M4.2 9.4 8 5.6 11.8 9.4'],
    fallback: '\u2303',
  },
  /** Four brackets opening onto a frame: fit the whole canvas to the window. */
  fit: {
    paths: [
      'M2.8 6V3.7a.9.9 0 0 1 .9-.9H6',
      'M10 2.8h2.3a.9.9 0 0 1 .9.9V6',
      'M13.2 10v2.3a.9.9 0 0 1-.9.9H10',
      'M6 13.2H3.7a.9.9 0 0 1-.9-.9V10',
    ],
    fallback: '\u26F6',
  },
  /** A box with its lid: what has been put away. */
  archive: {
    paths: [
      'M2.4 5.6h11.2',
      'M3.4 5.6v7a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1v-7',
      'M2.4 5.6 3.7 3.2a.9.9 0 0 1 .8-.5h7a.9.9 0 0 1 .8.5l1.3 2.4',
      'M6.6 8.4h2.8',
    ],
    fallback: '\u1F5C0',
  },
  /** A chain with its middle cut: the tie, undone. */
  unlink: {
    paths: [
      'M6.6 5.2 5.1 6.7a2.7 2.7 0 0 0 0 3.8l.4.4',
      'M9.4 10.8 10.9 9.3a2.7 2.7 0 0 0 0-3.8l-.4-.4',
      'M6.1 9.9 9.9 6.1',
    ],
    fallback: '\u2327',
  },
  /** A padlock, shut: the title is the reader's, not the board's. */
  lock: {
    paths: [
      'M4.6 7.2h6.8v6.2H4.6z',
      'M6.2 7.2V5.4a1.8 1.8 0 0 1 3.6 0v1.8',
    ],
    fallback: '\u1F512',
  },
  /** The same lock, open: the title may be renamed again. */
  unlock: {
    paths: [
      'M4.6 7.2h6.8v6.2H4.6z',
      'M6.2 7.2V5.4a1.8 1.8 0 0 1 3.6 0',
    ],
    fallback: '\u1F513',
  },
  /** Two commits and the branch between them. */
  fork: {
    paths: [
      'M4.2 5.1v5.8',
      'M11.8 5.1v1.1a3.1 3.1 0 0 1-3.1 3.1H4.2',
    ],
    circles: [
      [4.2, 3.4, 1.5],
      [4.2, 12.6, 1.5],
      [11.8, 3.4, 1.5],
    ],
    fallback: '\u2442',
  },
}

/**
 * One of those glyphs, at a size, as an element.
 * @param {string} name - 'enter' or 'fork'.
 * @param {number} size - pixels.
 * @returns {Element} the drawing, or its plain stand-in.
 */
function boardIcon(name, size) {
  var spec = BOARD_ICONS[name]
  var px = Number(size) || 16
  if (spec && typeof document.createElementNS === 'function') {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', String(px))
    svg.setAttribute('height', String(px))
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.5')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    var i
    for (i = 0; i < spec.paths.length; i++) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', spec.paths[i])
      svg.appendChild(path)
    }
    var dots = spec.circles || []
    for (i = 0; i < dots.length; i++) {
      var bead = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      bead.setAttribute('cx', String(dots[i][0]))
      bead.setAttribute('cy', String(dots[i][1]))
      bead.setAttribute('r', String(dots[i][2]))
      svg.appendChild(bead)
    }
    return svg
  }
  var text = document.createElement('span')
  text.setAttribute('aria-hidden', 'true')
  if (spec) text.textContent = spec.fallback
  return text
}

/** Set once the board's hover and motion rules have been put on the page. */
var boardCssInstalled = false

/**
 * Put the board's hover and motion rules on the page, once.
 *
 * Inline styles can paint a board but cannot say "on hover" or "ease in";
 * those belong in a stylesheet. The class names are the only public surface
 * and they all carry the plugin's prefix, so nothing on the host page can
 * collide with them.
 * @returns {void}
 */
function installBoardCSS() {
  if (boardCssInstalled) return
  var head = document.head
  if (!head || typeof head.appendChild !== 'function' || typeof document.createElement !== 'function') return
  if (typeof document.getElementById === 'function' && document.getElementById('dsh-vim-board-css')) {
    boardCssInstalled = true
    return
  }
  var style = document.createElement('style')
  style.setAttribute('id', 'dsh-vim-board-css')
  style.textContent = [
    '.dshv-block{transition:box-shadow .24s ease,border-color .24s ease;}',
    '.dshv-block:hover{box-shadow:0 30px 70px -44px rgba(24,18,6,.55),0 2px 10px -6px rgba(24,18,6,.18);}',
    '.dshv-card{transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;}',
    '.dshv-card:hover{transform:translateY(-1px);box-shadow:0 10px 22px -18px rgba(24,18,6,.5);}',
    // A turn in flight: a still edge, one ring that breathes, one pulse.
    //
    // The frame used to march - dashes running round the card once a second.
    // That is a selection marquee's language, it moves in the tempo band of
    // an alarm, and it repaints the whole outline every frame. A state that
    // lasts minutes should read as a state: the edge and the dot say "live"
    // standing still, and only an opacity moves, which the compositor carries
    // by itself.
    '.dshv-card[data-live="true"]::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;border-radius:0 2px 2px 0;background:var(--dshv-board-accent,#93c5fd);opacity:.55;pointer-events:none;}',
    '.dshv-card[data-live="true"]::after{content:"";position:absolute;inset:-1px;border-radius:inherit;box-shadow:0 0 0 1px var(--dshv-board-accent,rgba(147,197,253,.9)),0 0 18px -6px var(--dshv-board-accent,rgba(147,197,253,.8));opacity:.14;animation:dshv-breath 2.8s ease-in-out infinite alternate;pointer-events:none;}',
    '@keyframes dshv-breath{from{opacity:.14;}to{opacity:.34;}}',
    // Waiting on the reader is not work in flight: the card is not what is
    // moving, so its ring holds still and takes the warning colour.
    '.dshv-card[data-live="true"][data-waiting="true"]::after{animation:none;opacity:.42;box-shadow:0 0 0 1px var(--dsw-alias-label-warning,#d97706);}',
    '.dshv-chip[data-live="true"]::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;margin-right:5px;vertical-align:middle;animation:dshv-beat 1.4s ease-in-out infinite;}',
    '@keyframes dshv-beat{0%,100%{opacity:.55;transform:scale(1);}50%{opacity:1;transform:scale(1.18);}}',
    // The dot beside a waiting card is solid: the pulse belongs to work in
    // flight, and this one is parked.
    '.dshv-chip[data-live="true"][data-waiting="true"]::before{animation:none;opacity:1;}',
    // Just finished: one beat as the card is drawn, then a quiet ring while
    // the completion is still unread. The same beat the task window plays on
    // its chip - 760ms, fast front edge, slow settle - and only once, because
    // the ledger in `markCardFresh` decides when a card wears it.
    '.dshv-card[data-unread="true"]{box-shadow:0 0 0 1px var(--dshv-board-accent,rgba(147,197,253,.45)),0 0 14px -8px var(--dshv-board-accent,rgba(147,197,253,.6));}',
    '.dshv-card[data-fresh="true"]{animation:dshv-fresh .76s ease-out 1;}',
    '@keyframes dshv-fresh{0%{box-shadow:0 0 0 2px var(--dshv-board-accent,rgba(147,197,253,.95)),0 0 30px -4px var(--dshv-board-accent,rgba(147,197,253,.95));}100%{box-shadow:0 0 0 1px var(--dshv-board-accent,rgba(147,197,253,.45)),0 0 14px -8px var(--dshv-board-accent,rgba(147,197,253,.6));}}',
    // Reduced motion gets no loop and no beat: the words and the rings say
    // everything the motion was saying.
    '@media (prefers-reduced-motion: reduce){.dshv-card[data-live="true"]::after,.dshv-chip[data-live="true"]::before,.dshv-card[data-fresh="true"]{animation:none;}}',
    // The card last pressed is the card on top, and says so in a ring of its
    // own so a pile still reads as a pile.
    '.dshv-card[data-front="true"],.dshv-ghost[data-front="true"]{box-shadow:0 16px 34px -20px rgba(12,16,24,.5),0 0 0 1px var(--dshv-board-accent,rgba(147,197,253,.5));}',
    '.dshv-note[data-front="true"]{box-shadow:0 20px 40px -22px rgba(60,45,10,.5),0 0 0 1px var(--dshv-board-note-spine,#eab308);}',
    '.dshv-side svg{display:block;}',

    '.dshv-fork:hover{color:var(--dshv-board-accent,#93c5fd);border-color:var(--dshv-board-accent,rgba(147,197,253,.5));}',
    // Closing a goal is a mark on the panel, not a button in its own right:
    // it stays quiet until the panel is under the hand.
    '.dshv-goal-x{opacity:.38;transition:opacity .16s ease,color .16s ease;}',
    '.dshv-block:hover .dshv-goal-x{opacity:.85;}',
    '.dshv-goal-x:hover{opacity:1;color:#fca5a5;}',
    // The goal's ⋯ is the quiet verbs' door: it stays out of the way until
    // the panel is under the hand, and stays lit while its menu is open.
    '.dshv-goal-more{opacity:.38;transition:opacity .14s ease,color .14s ease;}',
    '.dshv-block:hover .dshv-goal-more,.dshv-goal-more[aria-expanded="true"]{opacity:.85;}',
    '.dshv-goal-more:hover{opacity:1;color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-goal-menu-item:hover{background:rgba(255,255,255,.08);}',
    // The finished strip is a target as well as a fold: under the hand it
    // says it would take the card, and the drop that follows keeps it lit
    // until the paint puts the card in it.
    '.dshv-done-head:hover{color:var(--dshv-board-text,#eef1f7);background:rgba(255,255,255,.06);border-color:var(--dshv-board-card-edge,rgba(255,255,255,.16));}',
    '[data-role="doneBar"][data-drop="true"]{outline:1px dashed var(--dshv-board-accent,#93c5fd);outline-offset:3px;border-radius:10px;}',
    // A card in the air turns every goal's heading into a drop target: the
    // row the plus stands in is the goal's own door, and a card let go
    // anywhere on it starts the conversation the plus would ask for.
    '[data-role="blockHead"][data-drop="true"]{outline:1px dashed var(--dshv-board-accent,#93c5fd);outline-offset:-1px;}',
    '[data-note-drag="true"] .dshv-goal-new{color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-goal-new{transition:color .14s ease,border-color .14s ease,background-color .14s ease;}',
    '.dshv-goal-new:hover{color:var(--dshv-board-accent,#93c5fd);border-color:var(--dshv-board-accent,rgba(147,197,253,.55));background:var(--dshv-board-accent-soft,rgba(147,197,253,.16));}',
    // A thought filed under a conversation is one line until it is opened:
    // the paper shrinks to its heading, and the card keeps the thin spine
    // that says which conversation's paper it is written on.
    '.dshv-note[data-compact="true"]{padding:5px 8px 5px 10px;}',
    '.dshv-note[data-compact="true"] .dshv-note-head{gap:6px;}',
    '.dshv-note[data-compact="true"] .dshv-note-head>span[data-role="looseTitle"]{font-size:0.9em;}',
    '.dshv-deliver:hover,.dshv-more:hover{opacity:1;color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-idea-menu-item:hover{background:rgba(20,14,4,.07);}',
    // A lock is a fact, not a button to advertise: it stays quiet until the
    // pointer is on the card, and says it is on when it is.
    '.dshv-lock{transition:opacity .14s ease,color .14s ease;}',
    '.dshv-card:hover .dshv-lock,.dshv-lock[aria-pressed="true"]{opacity:1;}',
    '.dshv-lock:hover{color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-done-more:hover{background:rgba(255,255,255,.55);color:var(--dshv-board-note-ink,inherit);}',
    '.dshv-ideas-toggle{transition:color .12s ease,background-color .12s ease;}',
    '.dshv-ideas-toggle:hover{color:var(--dshv-board-accent,#93c5fd);background:var(--dshv-board-accent-soft,rgba(147,197,253,.16));}',
    // The quiet strip: the last line of a panel says what it is holding, and
    // each line under it is a conversation the reader can still open or carry.
    '.dshv-quiet-head{transition:color .12s ease;}',
    '.dshv-quiet-head:hover{color:var(--dshv-board-text,#eef1f7);}',
    '.dshv-quiet-row{transition:background-color .12s ease;}',
    '.dshv-quiet-row:hover{background:var(--dshv-board-column,rgba(255,255,255,.05));}',
    '.dshv-quiet-cards:hover{color:var(--dshv-board-accent,#93c5fd);}',
    // A column being sorted follows the hand; the columns it passes make
    // room for it, and nothing else moves.
    '.dshv-col[data-sorting="true"]{box-shadow:0 18px 34px -22px rgba(24,18,6,.55);}',
    // The sheet arrives instead of appearing: one small lift, 160ms, and
    // nothing else moves. No blur and no glass - the stock is solid, so the
    // only thing allowed to move is the window itself.
    '.dshv-new-sheet{animation:dshv-sheet-in .16s cubic-bezier(.2,.85,.3,1);}',
    '@keyframes dshv-sheet-in{from{opacity:0;transform:translateY(8px) scale(.99);}to{opacity:1;transform:none;}}',
    '.dshv-new-sheet input::placeholder,.dshv-new-sheet textarea::placeholder{color:currentColor;opacity:.36;}',
    '.dshv-sheet-pick{transition:border-color .12s ease,background-color .12s ease,color .12s ease;}',
    '.dshv-sheet-pick:hover,.dshv-sheet-pick:focus-visible{border-color:var(--dshv-board-accent,rgba(147,197,253,.55));color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-sheet-btn{transition:background-color .12s ease,border-color .12s ease,color .12s ease,transform .12s ease;}',
    '.dshv-sheet-btn-ghost:hover{background:var(--dshv-board-dialog-field,rgba(255,255,255,.07));color:var(--dshv-board-dialog-ink,inherit);}',
    '.dshv-sheet-btn-primary:hover{filter:brightness(1.06);}',
    '.dshv-sheet-btn-primary:active,.dshv-sheet-btn-ghost:active{transform:translateY(1px);}',
    '@media (prefers-reduced-motion: reduce){.dshv-new-sheet{animation:none;} .dshv-sheet-btn{transition:none;}}',
    '.dshv-intent-text:hover{color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-done-toggle{transition:border-color .16s ease,background .16s ease,color .16s ease;}',
    '.dshv-done-toggle:hover{border-color:var(--dshv-board-note-spine,#eab308);background:rgba(234,179,8,.10);}',
    '.dshv-done-toggle[data-done="true"]{border-color:var(--dshv-board-note-spine,#eab308);background:rgba(234,179,8,.18);color:var(--dshv-board-note-spine,#eab308);}',
    // The box is the state, so a done card's words read as done too.
    '.dshv-note[data-done="true"] [data-role="looseText"]{text-decoration:line-through;text-decoration-color:rgba(234,179,8,.5);opacity:.62;}',
    // A goal the hand is over says it would take the card, before the drop
    // decides it: the panel is the target, and it should look like one.
    '.dshv-block[data-drop="true"]{border-color:var(--dshv-board-accent,rgba(147,197,253,.75));box-shadow:0 0 0 2px var(--dshv-board-accent-soft,rgba(147,197,253,.16)),0 26px 60px -40px rgba(24,18,6,.5);}',
    '.dshv-block[data-drop="true"] .dshv-panel-head{background:var(--dshv-board-accent-soft,rgba(147,197,253,.1));}',
    '.dshv-card[data-dragging="true"]{opacity:.38;}',
    // The ⋯ steps forward when the pointer is on the card, the way the idea
    // cards' own menu mark does; an open one stays forward, because it is
    // the thing the menu belongs to.
    '.dshv-card-more{transition:opacity .14s ease,color .14s ease;}',
    '.dshv-card:hover .dshv-card-more,.dshv-card-more[aria-expanded="true"]{opacity:.85;}',
    '.dshv-card-more:hover{opacity:1;color:var(--dshv-board-accent,#93c5fd);}',
    '.dshv-card-menu-item:hover{background:rgba(255,255,255,.08);}',
    '.dshv-ghost .dshv-card{cursor:grabbing;}',
    // A note is picked up anywhere on its paper, its words included, so the
    // whole card answers with one cursor. Nothing inside claims a caret
    // before it is open for writing; the editor it opens brings its own.
    '.dshv-note{cursor:grab;}',
    '.dshv-note[data-editing="true"]{cursor:default;}',
    '.dshv-note{transition:box-shadow .18s ease,border-color .18s ease;}',
    '.dshv-note:hover{box-shadow:0 18px 34px -20px rgba(60,45,10,.45),0 1px 2px rgba(60,45,10,.06);}',
    '.dshv-enter{transition:background .16s ease,color .16s ease;}',
    '.dshv-enter:hover{background:var(--dshv-board-accent,rgba(79,124,255,.9));color:var(--dshv-board-accent-on,#fff);}',
    '.dshv-panel-head,.dshv-note-head{cursor:grab;}',
    '.dshv-block:active .dshv-panel-head,.dshv-note:active .dshv-note-head{cursor:grabbing;}',
    // Deleting and unlinking are secondary: they arrive under the pointer,
    // and stand out of the way of a card nobody is touching.
    '.dshv-note-actions{display:flex;align-items:center;gap:6px;margin-left:auto;opacity:0;transition:opacity .14s ease;}',
    '.dshv-note:hover .dshv-note-actions,.dshv-note[data-editing="true"] .dshv-note-actions,.dshv-note[data-front="true"] .dshv-note-actions{opacity:1;}',

    // The tray's rows: a list that answers the pointer, and a done line that
    // stays readable.
    // A row is a strip of the note's paper, so its hover and its field are
    // solid too: a tint over the tray would read the lines underneath.
    '.dshv-tray-row:hover{background:linear-gradient(var(--dshv-board-note-hover,rgba(250,204,21,.14)),var(--dshv-board-note-hover,rgba(250,204,21,.14))),var(--dshv-board-base,#2f3644);}',
    // The prompt in a new card is a place, not a label: it has to be lighter
    // than the words that will replace it.
    '[data-role="cardTitleInput"]::placeholder{color:currentColor;opacity:.3;}',
    '.dshv-done-row:hover{transform:translateY(-1px);}',
    '.dshv-tray-row[data-editing="true"]{background:linear-gradient(var(--dshv-board-accent-soft,rgba(147,197,253,.10)),var(--dshv-board-accent-soft,rgba(147,197,253,.10))),var(--dshv-board-base,#2f3644);}',
    '.dshv-tray-row[data-done="true"] [data-role="inboxNoteText"]{text-decoration:line-through;text-decoration-color:rgba(234,179,8,.5);opacity:.55;}',
    '.dshv-tray-row .dshv-note-actions{margin-left:0;}',
    // A card that holds more than it can show ends in a fade, not a scrollbar.
    '.dshv-note[data-clipped="true"] [data-role="looseText"]{-webkit-mask-image:linear-gradient(180deg,#000 72%,rgba(0,0,0,.12) 100%);mask-image:linear-gradient(180deg,#000 72%,rgba(0,0,0,.12) 100%);}',
    // The field is where the card is being worked on, and says so quietly.
    '.dshv-note[data-editing="true"]{box-shadow:0 0 0 2px var(--dshv-board-accent-soft,rgba(147,197,253,.16)),0 16px 32px -22px rgba(60,45,10,.5);}',
  ].join('\n')
  try {
    head.appendChild(style)
    boardCssInstalled = true
  } catch (error) {
    console.warn('[dsh-vim] board styles failed', error)
  }
}

export { BOARD_INK, NOTE_PAPER, BOARD_UI, BOARD_PAGE_UI, OVERVIEW_UI, BOARD_ICONS, boardIcon, installBoardCSS, applyBoardPageInk, solidPaper }
