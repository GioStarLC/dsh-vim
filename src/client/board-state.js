/**
 * The board's live canvas state: what is open, which card is being typed
 * into, the drag in flight, the clocks, and the feed subscriptions. Owned
 * here so every board module reads one object and no module owns another's.
 */

/**
 * The board: the canvas, and the only surface here driven by the pointer.
 *
 * Kept apart from `PALETTE` on purpose. The two windows answer different
 * questions — the task window is a triage list read top to bottom, the board
 * is a map of where the work lives — and they never share the page, so
 * nothing here is a field the task window also has: no selection index, no
 * cursor, no rows-in-order. `nodes` is the conversation cards of the last
 * repaint, which is what a test reads to know what is on screen.
 */
var BOARD = {
  open: false,
  /**
   * How the board is mounted: 'overlay' for the floating window a host
   * without the layout panel falls back to, 'page' for the sidebar page.
   * The builders are the same; what changes is who owns the keyboard and
   * which keyboard gestures make sense.
   */
  mode: 'overlay',
  /** The card whose note is being typed into, or ''. */
  noteEditing: '',
  /** That card's field, rebuilt with every repaint of it. */
  noteEditor: null,
  /** The loose card being typed into, or '', and its field. */
  cardEditing: '',
  /** Which field of that card is up: 'title' or 'body'. */
  cardField: '',
  cardEditor: null,
  /**
   * The idea focus sheet: the card it is showing, or '' while it is a new
   * thought that has not landed yet.
   *
   * One sheet serves both reading an existing card and writing a new one.
   * The difference is only where the words go when it closes: an existing
   * card is written through on every keystroke, while a new one is held as
   * a draft and becomes a card at `ideaFocusAt` only when the sheet closes
   * with something in it.
   */
  ideaFocus: '',
  ideaFocusHost: null,
  ideaFocusSheet: null,
  ideaFocusTitle: null,
  ideaFocusBody: null,
  ideaFocusDone: null,
  /** Where a brand-new thought lands, in canvas coordinates. */
  ideaFocusAt: null,
  /** The frame that flies a new sheet out from the double-click. */
  ideaFocusRaf: 0,
  /**
   * A press settled the open field's words without painting them. The
   * paint is owed by whoever ends that press: it is what lets a press
   * keep the elements it aims at alive for the click that follows it.
   */
  paintOwed: false,
  /** The frame that repaints the cards once their words land, or 0. */
  saidPaint: 0,
  /** The conversation whose name is being edited from its card, and its field. */
  renamingCard: '',
  renameCardInput: null,
  host: null,
  panel: null,
  /** The scrolling canvas, the sized paper, and the stage drawn on it. */
  body: null,
  sizer: null,
  stage: null,
  /** The magnification this board is drawn at. */
  zoom: 1,
  /** The last measured canvas extent, in unzoomed pixels. */
  extent: { width: 720, height: 520 },
  /** The zoom readout in the header. */
  zoomLabel: null,
  /**
   * Whether the canvas is scaled to the window rather than by hand.
   *
   * A fit is a standing request, not a one-off: while it holds, a window
   * that changes size re-fits instead of leaving the board at a scale its
   * old window chose. Any hand on the zoom takes the request back.
   */
  fits: false,
  /** The SVG layer the link curves live on, when the host can draw it. */
  linkLayer: null,
  /** The card currently gliding to a snapped place, or ''. */
  glide: '',
  /** Whether a tidy is flying its cards home, so a repaint has to wait. */
  tidy: false,
  /** The headline's count readout, and its "only what is marked" toggle. */
  count: null,
  starFilter: null,
  /** The two history buttons, so a step can say whether it is reachable. */
  undoButton: null,
  redoButton: null,
  /** The blocks of this repaint, in draw order, and what the inbox holds. */
  blocks: [],
  /** The colour seat each panel took on this paint: block id -> seat. */
  slots: Object.create(null),
  /** The seats written down, read once per paint: a hue is asked for often. */
  seats: null,
  /** What has been said about each conversation, read once per paint. */
  verdicts: null,
  inbox: [],
  /** Every conversation drawn on this repaint, block by block. */
  rows: [],
  /** The conversation card elements of this repaint, in draw order. */
  nodes: [],
  /** The loose card elements of this repaint, by card id, for measuring lines. */
  looseNodes: Object.create(null),
  /** The goal the pointer is standing in while a card is carried, or null. */
  dropGoal: null,
  /** The finished strip the pointer is over while a session is carried. */
  doneDrop: null,
  /** The drop bands drawn this paint, so a carry can put them on screen. */
  dropZones: [],
  /** The put-away row whose full body is showing, or ''. */
  rowOpen: '',
  /**
   * The card the reader last touched, and the stacking height it was given.
   *
   * Cards overlap as soon as one is dragged out of its goal, and a pile is
   * only readable if the one being worked on is the one on top: the press
   * raises the card, and the repaint remembers which card that was.
   */
  front: '',
  zTop: 3,
  /** The goal whose name is being edited from its heading, and its field. */
  renamingBlock: '',
  renameBlockInput: null,
  /** The goal whose purpose is being written, and the field it is written in. */
  intentBlock: '',
  intentInput: null,
  /**
   * The goal whose new-conversation sheet is open, and the sheet itself.
   *
   * The sheet is the button's other half: a press asks for a title and a
   * body before anything is written to the host, while a card dropped on
   * the same button carries its own words and needs no question.
   */
  newSessionGoal: '',
  newSessionHost: null,
  newSessionTitle: null,
  newSessionBody: null,
  /** The model the sheet's row was set to, and the line that shows it. */
  newSessionModel: null,
  newSessionModelText: null,
  newSessionConfirm: null,
  newSessionError: null,
  /** One host round trip at a time: two presses must not make two conversations. */
  newSessionBusy: false,
  /** The thought whose ⋯ menu is open, or ''. */
  ideaMenu: '',
  /** The goal whose colour wheel is open, or ''. */
  seatMenu: '',
  /** The card whose state menu is open, or ''. */
  verdictMenu: '',
  /** The goal whose ⋯ menu is open, or ''. */
  goalMenu: '',
  /** The conversation whose ⋯ menu is open, or ''. */
  sessionMenu: '',
  /** The ⋯ that opened it, so closing can take the mark's own state down. */
  sessionMenuMark: null,
  /** Whether the heading's settings sheet is up, and what holds it. */
  settingsMenu: false,
  settingsMark: null,
  settingsSheet: null,
  /** The conversations whose finished thoughts are unfolded, one by one. */
  doneExpanded: Object.create(null),
  /**
   * The panels whose quiet strip is unfolded, and the conversations inside
   * one whose thoughts are showing.
   *
   * The strip is a way of reading a panel rather than a fact about the work,
   * so it is remembered for this visit only: a board that reopened with every
   * strip unfolded would be the panel the strip exists to shrink.
   */
  quietOpen: Object.create(null),
  quietCards: Object.create(null),
  /** The panels whose finished strip is open, for this visit only. */
  doneOpen: Object.create(null),
  /** The session column being sorted, while a horizontal drag is sorting one. */
  reorder: null,
  /**
   * The goals this visit started from the toolbar.
   *
   * A goal with no conversations and no purpose is a place nobody is
   * working in, and it goes on the next paint. That rule must not eat the
   * goal the reader is in the middle of naming, so one the toolbar made is
   * held here until the board does.
   */
  drafts: Object.create(null),
  /**
   * The names the reader typed that the shell has not answered yet.
   *
   * A card whose name was just changed would otherwise go back to the old
   * one for as long as the list takes to arrive - which reads as a rename
   * that did not work. This is the reader's word standing in for the feed's.
   * session id -> `{title, at}`.
   */
  titles: Object.create(null),
  /** The field a failed rename is put back into, so the words are not lost. */
  renameCardDraft: null,
  /** The one timer that lets the stand-in words go. */
  titleTimer: 0,
  /**
   * The conversations whose completion beat has already been played.
   *
   * A repaint rebuilds every card, so an animation hung on the element would
   * play again on every drag and every star. The beat is once per completion,
   * and this is what makes it once.
   */
  freshed: Object.create(null),
  /**
   * The cards sharing a name with another card on this paint, and where each
   * one stands in that group: id -> {at, of}.
   *
   * Recomputed by every repaint from what is about to be drawn, because the
   * question is about the board in front of the reader rather than about the
   * catalogue: a namesake that is not on the board cannot be mistaken for
   * the card being read.
   */
  dupes: Object.create(null),
  /**
   * The conversations whose branch mark is waiting on the host, by id.
   *
   * A fork is a host round trip, and the mark answered every press in
   * between: two presses for one intention made two children, which the
   * board then drew as two cards with one name. This is the seat that says
   * "already being made".
   */
  forking: Object.create(null),
  /** The line that says the paper will not take the card, while that is true. */
  noDropTip: null,

  /** The link lines drawn for this paint, so a redraw can take them back. */
  lines: [],
  /** Where each conversation lives, read once per repaint. */
  folders: Object.create(null),
  /** The gesture in progress, or null: what is being moved and where to. */
  drag: null,
  /** Set when a drag just ended, so the click it would have been is dropped. */
  dragged: false,
  /** Whether the canvas is showing only what is marked. */
  onlyStarred: false,
  /**
   * The day the canvas is standing on, or '' for today.
   *
   * This one field is the whole of the history's mode: while it holds a day
   * the canvas draws that page and nothing else. The paint it selects reads
   * a frozen page and no live store, and the nodes it builds carry no
   * handles - so "read only" is a property of the paint rather than a rule
   * every press has to remember to obey.
   */
  historyDate: '',
  /** The month the calendar is standing on, as `YYYY-MM`, or '' for this one. */
  historyMonth: '',
  /** How many days the search above the calendar looked through, for its own line. */
  historySearched: 0,
  /** The chip that says a page is a copy which has already been armed. */
  historyArmed: '',
  /** The bar a page wears, while one is up. */
  historyBanner: null,
  /** The heading's working chips, put away while a page is being read. */
  actionChips: [],
  /**
   * Whether the finished-cards list is open under its chip, and the chip's
   * own count readout.
   *
   * The chip is drawn once, with the heading, and the board is repainted far
   * more often than it is rebuilt - so the count lives here and every paint
   * writes it, rather than a new chip being built per paint.
   */
  doneBinOpen: false,
  doneBinCount: null,
  /**
   * The conversation the open list is showing only, or '' for all of them.
   *
   * The bin is one place read two ways: from the heading, as everything that
   * has been put away, and from a conversation's own mark, as what was handed
   * to that conversation. Same rows, one filter.
   */
  doneBinFilter: '',
  /**
   * The live clocks of this repaint: { chip, label, since } per running
   * card. Kept the way the task window keeps `PALETTE.clocks`, so the
   * board's minute hand moves in place rather than by a repaint.
   */
  clocks: [],
  /** The timer behind those clocks, or 0 while nothing on screen runs. */
  clockTimer: 0,
  /** The day whose summary is waiting to be read, or '' when none is. */
  sealPending: '',
  /** The summary itself, while it is on screen. */
  sealNode: null,
  /** What the history panel is searching for, or '' for the plain list. */
  historyQuery: '',
  /** The search field above the days, so a result can empty it. */
  historySearch: null,
  /**
   * The status fingerprint of this repaint: one word per card, in draw
   * order. The status feed can tick without anything on screen changing
   * shape; this is what tells a tick worth a repaint from one that is not.
   */
  statuses: '',
  unsubscribes: [],
}

/**
 * The name one card wears: the reader's word while the shell catches up,
 * else what the shell calls the conversation.
 * @param {object} summary - session summary.
 * @returns {string} the name to draw.
 */
function boardTitleOf(summary) {
  var said = BOARD.titles[summary.id]
  if (said && said.title) return said.title
  return summary.displayTitle || summary.id
}

/**
 * Repaint the whole canvas from the feeds.
 *
 * Cheap enough to do wholesale: a handful of panels, their cards, and the
 * loose cards. A repaint that had to hold a half-finished gesture in place
 * would have to be incremental instead, which is why one returns while a
 * drag is in progress.
 * @returns {void}
 */
/**
 * Whether the reader is typing into one of the board's own fields.
 *
 * The fields are this plugin's elements, rebuilt with everything else, so a
 * paint that lands while one is open takes the caret and the sentence with
 * it - which reads as a field you cannot type in.
 * @returns {boolean} true while a field is open.
 */
function boardFieldOpen() {
  // Only a field that is still on the page can be destroyed by a paint. A field
  // being opened has no element yet, which is what lets the paint that opens
  // it through while every stray paint after it waits. "On the page" is asked
  // of the stage rather than of `isConnected`: the stage is what a paint
  // replaces, so it answers for the paint without depending on a mount having
  // detached what it dropped.
  var fields = [
    BOARD.noteEditor,
    BOARD.cardEditor,
    BOARD.renameCardInput,
    BOARD.renameBlockInput,
    BOARD.intentInput,
  ]
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i]
    if (!field) continue
    if (BOARD.stage && typeof BOARD.stage.contains === 'function') {
      if (BOARD.stage.contains(field)) return true
      continue
    }
    if (field.isConnected) return true
  }
  return false
}

/**
 * Bring one card to the front of the paper.
 *
 * Cards overlap as soon as one is pulled out of its goal, and a pile is
 * only readable if the card being worked on is the one on top. The press
 * raises it, and the repaint remembers which card that was, so a repaint
 * does not put it back under the others.
 * @param {string} id - session id or card id.
 * @param {Element} node - its element, when there is one already.
 * @returns {void}
 */
function raiseBoardCard(id, node) {
  if (!id) return
  BOARD.zTop = BOARD.zTop + 1
  BOARD.front = id
  if (!node) return
  node.setAttribute('data-front', 'true')
  node.style.zIndex = String(BOARD.zTop)
}


export { BOARD, boardFieldOpen, boardTitleOf, raiseBoardCard }
