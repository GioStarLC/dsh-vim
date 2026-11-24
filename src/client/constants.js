/**
 * Constants: the selectors, storage keys, timings and measurements every
 * module shares. Nothing here runs at import time; a constant that only one
 * module reads moves into that module when it is extracted.
 */

/** Locale namespace owned by this plugin. */
var NS = 'dsh-vim'

/** Where the browser keeps this plugin's preferences. */
var STORAGE_KEY = 'dsh-vim/settings/v1'

/** Subtrees that must keep receiving raw keystrokes (terminal helper input). */
var RAW_INPUT_SELECTOR = '.xterm'

/**
 * The message box in this host: the root of the rich-text editor the shell
 * focuses on entry. Lexical marks its own root, and no other package in the
 * shell ships an editor, so the marker names the composer exactly. It is a
 * shortcut, not a requirement — a host without it is handled through the
 * element a focus actually landed on.
 */
var COMPOSER_SELECTOR = '[data-lexical-editor="true"]'

/** A shell of its own: fields inside one may take focus for themselves. */
var MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [data-shortcut-modal]'

/** Controls a bare Space activates by itself, and must keep doing so. */
var ACTIVATING_SELECTOR = 'button, a[href], summary, [role="button"], input, select, textarea'

/**
 * A suggestion menu that has taken Enter away from the composer is not ours
 * to take back: while one is open, the key belongs to it. The shell marks
 * the floating candidate list the input-trigger service renders; probing
 * for `role="listbox"` instead would also match lists that never arbitrate
 * keys, and missing this one turns "accept the highlighted candidate" into
 * a line break the user did not ask for.
 */
var TRIGGER_MENU_SELECTOR = '[data-trigger-menu]'

/**
 * How long the user's own request for the keyboard stays valid: a press on a
 * text field, a Tab, a keystroke typed into one. The shell hands out focus
 * from a render effect, so the request is always spent a beat later.
 */
var FOCUS_REQUEST_MS = 1200

/**
 * When the keyboard is taken back after a send, in milliseconds after the
 * keystroke that sent it.
 *
 * The editor keeps DOM focus across a send — the shell's own focus lands on
 * the element it is already on, which is a no-op and raises no `focusin` —
 * so nothing waits for an event that may never come. The first probe runs
 * after the shell has had its turn with the key, the second covers a host
 * that only reaches for the box once the draft has cleared. Both are
 * no-ops once the caret is anywhere else.
 */
var SEND_HAND_BACK_MS = [0, 120]

/**
 * How long a second Enter has to follow the first for the pair to send.
 *
 * Long enough to be a deliberate double tap at typing speed, short enough
 * that a pause between paragraphs is not one. The window is measured from
 * the first press, so the second one never waits: the first Enter breaks the
 * line at once, exactly as it does in `newline`.
 */
var DOUBLE_ENTER_MS = 250

/**
 * Set on a keydown this plugin rewrote and handed back to the message box.
 *
 * Such a copy bubbles up to this plugin's own capture listener on `window`,
 * where it would otherwise be read as a keystroke of the user's own — the
 * rewritten `Shift+Enter` of a line break would clear the double-Enter pair
 * it belongs to, and a rewritten chord would arm a focus request nobody
 * made. The flag is the one thing that tells the two apart.
 */
var REWRITTEN_FLAG = '__dshVimRewritten'

/**
 * What a bare Enter does in the message box, and — the other half of the
 * same decision — what sends the message instead.
 *
 * - `host`: nothing changes. Enter sends, Shift+Enter breaks the line.
 * - `newline`: Enter breaks the line; Ctrl/Cmd+Enter sends.
 * - `silent`: Enter does nothing at all; Ctrl/Cmd+Enter sends.
 * - `double`: Enter breaks the line, and a second Enter within
 *   `DOUBLE_ENTER_MS` sends. The pair is what sends, so there is no
 *   accelerator to remember; Ctrl/Cmd+Enter keeps working as well.
 *
 * `host` ships as the default because changing how every conversation sends
 * is not something a scrolling plugin should do on install.
 */
var SEND_MODES = ['host', 'newline', 'silent', 'double']

/** Shipped defaults: d down, e up, space into the message box, f the task window, j the board, i onto the board. */
var DEFAULTS = {
  downKey: 'd',
  upKey: 'e',
  focusKey: ' ',
  effortKey: 'q',
  modelKey: 'w',
  modelLevelKey: 'Tab',
  boardKey: 'j',
  noteKey: 'n',
  pinKey: 'i',
  paletteKey: 'f',
  paletteRenameKey: 'r',
  paletteUpKey: 'e',
  paletteDownKey: 'd',
  paletteEnterKey: 'o',
  paletteStageKey: 's',
  paletteArchiveKey: 'g',
  paletteFont: 13,
  palettePlace: 'top',
  paletteWidth: 900,
  paletteHeight: 82,
  paletteRow: 7,
  step: 140,
  tau: 60,
  repeatDelay: 240,
  escapeBlurs: true,
  spaceBlurs: true,
  switchBlurs: true,
  sendBlurs: true,
  sendMode: 'host',
  snapshotKeepDays: 3650,
  favorites: [],
}

/**
 * The key seats, split into two groups that are checked independently.
 *
 * The task window is modal, so its own navigation keys never fight the
 * scrolling keys: while the window is open the scroll engine is suspended.
 * That is why `d` can mean "down" in both places at once. Within a group
 * the seats must stay distinct, in repair priority order: the focus key,
 * the reasoning key and the model key sit with the scroll keys because all
 * five are live at the same time.
 */
var KEY_GROUPS = [
  ['downKey', 'upKey', 'focusKey', 'effortKey', 'modelKey', 'boardKey', 'noteKey', 'pinKey'],
  // The pin key is live in both places: on the page it acts on the
  // conversation on screen, and inside the task window on the selected row.
  // A seat that answers in two places has to be checked against both.
  ['paletteKey', 'paletteRenameKey', 'paletteUpKey', 'paletteDownKey', 'paletteEnterKey', 'paletteStageKey', 'paletteArchiveKey', 'pinKey'],
]

/**
 * The keys that are live at once inside the model window, which is a third
 * group of its own.
 *
 * `KEY_GROUPS` cannot check these: the model window answers to the page's
 * model key and reasoning key *and* to the task window's movement keys, so a
 * collision here crosses both groups. Without this list, binding the level
 * key to `w` would leave one press meaning "confirm" and "next level" at the
 * same time — and every group would still read as conflict-free.
 */
var MODEL_SEATS = ['modelKey', 'effortKey', 'paletteUpKey', 'paletteDownKey', 'modelLevelKey']

/** Preferences that are plain numbers, clamped to LIMITS. */
var NUMERIC_SEATS = ['step', 'tau', 'repeatDelay', 'paletteFont', 'paletteWidth', 'paletteHeight', 'paletteRow', 'snapshotKeepDays']

/**
 * Preferences that are a plain on/off, and are read as "on unless the user
 * turned it off".
 *
 * They used to be four hand-written sites each — a `DEFAULTS` entry, a
 * branch in `applyPatch`, a line in `load`, and a near-identical block of
 * settings-page calls — which is why the settings page had three rows that
 * differed only by the key names in them. Listing them here keeps a
 * preference we cannot forget to handle: adding one seat is a `DEFAULTS`
 * entry plus its name, and every other path asks this list.
 */
var BOOL_SEATS = ['escapeBlurs', 'spaceBlurs', 'switchBlurs', 'sendBlurs']

/** Where the task window may sit on screen. */
var PLACES = ['top', 'center', 'bottom']

/** Pending-interaction kinds the shell reports, and how to name them. */
var PENDING_LABELS = {
  approval: 'statusWaitApproval',
  planReview: 'statusWaitPlan',
  answer: 'statusWaitAnswer',
}

/** How many conversations the task window loads when it opens. */
var PALETTE_LIMIT = 20

/** How many older ones one press of the "More" seat reveals. */
var PALETTE_STEP = 20

/**
 * On open, the "recent" block prefers conversations touched inside this
 * window.
 *
 * Three hours, not a day: the block answers "what have I been doing just
 * now", and anything older than a working session is not that — it is
 * history, and history belongs behind the "More" seat. A window wide enough
 * to hold a whole day stops being a shortlist and becomes a second sidebar.
 */
var PALETTE_WINDOW_MS = 3 * 60 * 60 * 1000

/**
 * How long the "just finished" chips pulse when the window opens.
 *
 * One beat, not a loop: the pulse is an answer to "what changed while I was
 * away", and it is asked once, at the moment the window appears. A chip that
 * kept moving would compete with the reader's own progress down the list —
 * the point is to place the eye in the first half second and then get out of
 * the way. Long enough to be noticed, short enough to be over before the
 * reader could have moved the cursor to it.
 */
var DONE_PULSE_MS = 760

/**
 * Where the board keeps what the reader arranged.
 *
 * A canvas is a place rather than a filing cabinet, so what is stored is
 * where each panel and each loose card sits, which panels are folded, what
 * the reader marked or deleted, and the fork lines this plugin has watched
 * happen. The panels themselves — one per workspace in play — and the cards
 * inside them are computed from the feed on every repaint, because "which
 * workspace is this conversation in, and which ones moved today" is a fact
 * about the conversations rather than about the board.
 *
 * Version 2 of the same key: version 1 was the column board, and reading it
 * keeps the two marks that still mean something (★ and a deleted card).
 */
var BOARD_KEY = NS + '/board/v1'

/** A fresh fork source recorded after this build: child → parent. */
var BOARD_STORE_VERSION = 2

/**
 * Where the lines pinned to conversations live.
 *
 * A note is a fact about a conversation, not about the board's arrangement,
 * so it gets its own key: taking the board down — or storing a board this
 * build cannot read — must never cost the reader a thought they wrote
 * down. The conversation id is the whole of the key, so a note follows its
 * conversation wherever the board files it, and a board that has never
 * been opened can still hold one.
 */
var NOTE_KEY = NS + '/notes/v1'

/**
 * The pages the board used to be, in a database of their own.
 *
 * A day's page is frozen rather than derived, because the feed it was drawn
 * from has moved on: after midnight, yesterday's members are no longer in
 * the projection. One record per local day, keyed by `YYYY-MM-DD`, holding a
 * copy of the arrangement and of the page as it read (see `view`).
 *
 * The pages live in IndexedDB rather than beside the board's own key, for
 * two separate reasons: they are read when the panel opens rather than on
 * every repaint, so they do not need a synchronous store; and they are much
 * larger than the arrangement they copy, so they must not share its five
 * megabytes. A board that cannot be read, a board reset, and a notes reset
 * still cannot take the record with them.
 */
var HISTORY_DB_NAME = 'dsh-vim-history'
var HISTORY_DB_VERSION = 1
var HISTORY_STORE_DAYS = 'days'
var HISTORY_STORE_META = 'meta'
var HISTORY_BACKUP_KEY = 'backup'

/**
 * The journal: one append-only line per thing the reader did.
 *
 * A page is a picture, and a picture cannot say what happened between two
 * pictures: a thought written, handed to a conversation and put away in one
 * afternoon leaves the same mark on both as one that was never written.
 * The pages answer "what was on the desk"; this answers "what moved".
 *
 * Its own database, for the same reasons the pages have one: written on a
 * press rather than read by a repaint, and small enough to keep for years
 * but not small enough to share five megabytes with the arrangement. A line
 * is keyed by its day and its millisecond, so one day's lines are one key
 * prefix away and reading a day needs no index.
 */
var JOURNAL_DB_NAME = 'dsh-vim-journal'
var JOURNAL_DB_VERSION = 1
var JOURNAL_STORE_EVENTS = 'events'

/**
 * The last page the board actually drew.
 *
 * Written on every repaint that changes the page, so a day can still be
 * frozen after the app has been closed: the next open reads this moment,
 * files it under its own day, and starts the new day from it. Without it,
 * "yesterday" would have to be reconstructed from a feed that no longer
 * remembers it.
 */
var SNAPSHOT_MOMENT_KEY = NS + '/history/moment/v1'

/**
 * The sessions a day inherited from the day before.
 *
 * The board is a day's view, so a conversation that stopped moving falls
 * off it. This is the exception the reader asked for: the members of the
 * last page come along until they move, are taken off the board, or are
 * archived. Kept apart from the arrangement so settling a day costs one
 * small write rather than a rewrite of everything.
 */
var CARRY_KEY = NS + '/history/carried/v1'

/** The snapshot document's own version, apart from the board's. */
var SNAPSHOT_VERSION = 1

/**
 * How many days of history the board keeps when the reader has not said.
 *
 * Ten years, because the history is no longer spending the board's five
 * megabytes: a page is written once and read when the panel opens. The seat
 * is a preference, not a limit the store imposes - what it is for now is the
 * one case this number cannot cover, a database that has run out of room.
 */
var SNAPSHOT_KEEP_DEFAULT = 3650

/** One day in milliseconds, for measuring how long a card has been carried. */
var DAY_MS = 24 * 60 * 60 * 1000

/** How long a document a full store refused waits before it is offered again. */
var BOARD_STORE_RETRY_MS = 5000

/** How often a repaint may spend a write on forgetting conversations gone. */
var BOARD_PRUNE_MS = 60 * 1000

/** What an exported file says it is, so an import can refuse anything else. */
var HISTORY_EXPORT_KIND = 'dsh-vim/history'

/** How long a conversation may sit carried before the panel offers to drop it. */
var BOARD_CARRY_DROP_DAYS = 7

/**
 * The identity the sidebar entry and the main-panel page share.
 *
 * One string, used twice: the entry that selects the panel and the panel
 * it opens must agree, and the layout service resolves one from the other.
 */
var BOARD_PANEL_ID = 'dsh-vim-board'

/**
 * The overview's own page identity.
 *
 * A page of its own rather than a panel on the board: the board answers
 * where the work is, and the overview answers what the day did with it.
 * Read on the same paper, the two would compete for the room the board
 * needs; taken as a separate page, the reader can step out of the canvas,
 * read the day, and step back without either one being squeezed.
 */
var OVERVIEW_PANEL_ID = 'dsh-vim-overview'

/** The sentinel the inbox block answers to. */
var BOARD_INBOX = '@inbox'

/**
 * Where finished thoughts go, once they have been put away.
 *
 * The second container a note can be filed in, and the only one that is not
 * a place on the canvas: a card finished and tied to a conversation has
 * stopped being a thought waiting beside the work, so it leaves the paper
 * and lives in the heading's own list. Note filing is '' (the paper), an
 * inbox, or this.
 */
var BOARD_DONE = '@done'

/**
 * What a card may say about a conversation when the shell says nothing.
 *
 * Three words, and only the last two are the reader's: `finished` is the
 * fact that a turn ended and was read, `paused` and `settled` are decisions.
 * Keeping the fact in the same table as the decisions is what lets one
 * lookup answer the card: the fact and the verdict are the same question -
 * "what is this conversation now" - and the later word wins.
 */
var VERDICT_KEYS = { finished: true, paused: true, settled: true }

/**
 * The canvas's panel geometry, in unzoomed pixels.
 *
 * A canvas needs a pitch it can pack by and a width every panel shares:
 * panels are laid out in that grid until the reader drags one somewhere
 * else, and the width is what makes a stack of cards readable rather than
 * a column of clipped titles. A panel stands as tall as the conversations
 * in it — nothing scrolls inside it — so `BOARD_BLOCK_H` is the height a
 * fresh panel is *planned* at: the paper is sized from what the painted
 * panels measure, and the room a slot keeps clear is never smaller than
 * this, so a quiet or folded panel still holds the row the grid gave it.
 */
var BOARD_BLOCK_W = 380
var BOARD_BLOCK_H = 500
var BOARD_BLOCK_GAP_X = 32
var BOARD_BLOCK_GAP_Y = 32
var BOARD_BLOCK_PITCH_X = BOARD_BLOCK_W + BOARD_BLOCK_GAP_X
var BOARD_BLOCK_PITCH_Y = BOARD_BLOCK_H + BOARD_BLOCK_GAP_Y
var BOARD_BLOCK_COLUMNS = 3
/**
 * How many conversations a panel reads across before it starts another row.
 *
 * A goal used to grow one column wider with every conversation it held, so a
 * dozen of them made a panel three and a half thousand pixels wide - two
 * screens of paper for work the eye reads one conversation at a time. The row
 * stops at three and the panel grows downward instead, which is the axis the
 * paper already scrolls on.
 */
var BOARD_ROW_COLUMNS = 3
var BOARD_CARD_W = 280
/** How tall a card's ⋯ menu stands, for deciding which way it opens. */
var BOARD_CARD_MENU_H = 44
/** The air inside a panel, and the gap between two of its columns. */
var BOARD_BLOCK_PAD = 12
var BOARD_COLUMN_GAP = 12
/**
 * All of a card that is not the words: the two borders, the paper above
 * and below them, the heading, and the gap under it - at the canvas's
 * smallest type. Everything here is one ruler scaled by the base font (see
 * `boardNoteMetrics`), so the box a card is planned in and the box it is
 * painted in are the same box at every font size.
 */
var BOARD_CARD_CHROME_H = 51
/** One line of card text, at the canvas's own smallest type. */
var BOARD_CARD_LINE_H = 23
/**
 * The width of a conversation card the reader pulled out of its goal.
 *
 * Narrower than a panel's card on purpose: standing on the paper it has no
 * column to share, and 380px of it would hide what is behind it.
 */
var BOARD_FLOAT_W = 300
/** A goal's name is a sentence, not an essay. */
var BOARD_GOAL_NAME_MAX = 60
/**
 * What a goal is *for* is a sentence too, and it is the one line the reader
 * writes for themselves: the name says what a place is called, this says
 * what is to be done there, and it is what keeps the place standing when no
 * conversation is in it.
 */
var BOARD_GOAL_INTENT_MAX = 140
/**
 * The lines an idea card's field opens on, and the most it ever grows to.
 *
 * The field is sized to what the card says rather than to a fixed box: a
 * three-word thought should not open a five-line hole in the paper, and a
 * paragraph should not be read through a letterbox. Ten lines is where an
 * opened card stops growing and the field starts scrolling.
 */
var BOARD_EDITOR_MIN_ROWS = 2
/** The body lines a card shows before it is opened. */
var BOARD_NOTE_BODY_ROWS = 2
/** How many finished thoughts one conversation shows before it counts them. */
var BOARD_DONE_PREVIEW = 3
var BOARD_EDITOR_MAX_ROWS = 400

var BOARD_CANVAS_EDGE = 28
/** The air between a panel and the column of cards that keeps it company. */
var BOARD_TIDY_GAP = 32
/** The air between two cards stacked in one column. */
var BOARD_TIDY_STEP = 8
/** How tall a panel's own heading stands, for a column with nothing to measure. */
var BOARD_BLOCK_HEAD_H = 46
/** The longest one tidy glide takes, in milliseconds. */
var BOARD_TIDY_GLIDE = 260

/**
 * The smallest type the canvas is allowed to fall back to.
 *
 * The board used to be set at 13px and everything inside it in fractions of
 * that, which left the meta line under ten pixels. A title has to be
 * readable without leaning in, so the base is never below this, whatever the
 * task window's own preference says.
 */
var BOARD_MIN_FONT = 15
/** How far the canvas may be magnified, and how far it may be shrunk by hand. */
var BOARD_ZOOM_MIN = 0.5
var BOARD_ZOOM_MAX = 1.6
/**
 * How far the fit mark may shrink the canvas.
 *
 * Lower than the hand's floor on purpose: the fit answers "show me all of
 * it", and a board of twenty goals still has to be seen whole. The hand's
 * floor is about reading one card; this one is about the shape of the day.
 */
var BOARD_ZOOM_FIT_MIN = 0.2
/** The step one press of the zoom buttons takes. */
var BOARD_ZOOM_STEP = 1.12
/**
 * How much air "fit the window" leaves around what it fits.
 *
 * A canvas pressed against the window's own edges reads as clipped rather
 * than fitted, and the board's footer sits under the paper: the margin is
 * what keeps the last panel's bottom border visible.
 */
var BOARD_FIT_PAD = 28
/**
 * How many columns a tidy may pack across, however wide the window is.
 *
 * A tidy fills the reader's window, up to this many panel columns. Past
 * four the eye stops reading a row as a row, and the canvas becomes a wall;
 * a narrow window simply takes fewer, which is the first thing the rule is
 * for.
 */
var BOARD_TIDY_COLUMNS = 4

/**
 * How many colours the goals share: one every thirty degrees.
 *
 * Twelve is what a canvas can hold without two goals wearing colours a reader
 * has to compare. Past twelve the wheel repeats, which is the honest limit of
 * telling places apart by hue.
 */
var BOARD_SLOTS = 12

/** How far a press must travel before it is a drag rather than a click. */
var BOARD_SLOP = 4

/**
 * How far outside its panel the hand may wander during a sort.
 *
 * A sort is the panel's own business, so the panel is the boundary - not the
 * body the columns are in, which is narrower than the card the hand picked
 * up. The margin is what keeps a hand that drifts a little past the edge from
 * turning a sort into a move to another goal by accident.
 */
var BOARD_SORT_EDGE = 16

/**
 * The width of a goal's ⋯ menu, for setting it down under its mark.
 *
 * The menu is drawn on the paper rather than in the panel, because a panel
 * clips what leaves it; its right edge is the panel's own, so the width is
 * what turns that edge into a left offset.
 */
var BOARD_GOAL_MENU_W = 140

/**
 * The cells a row lays out, in grid order.
 *
 * The state chip leads. This window is a triage list — its whole thesis is
 * "what needs you first", and the top of the list is already cut along that
 * question. A row should answer it at the same edge the reader starts every
 * row at. The chip used to sit at the far right, which made the eye travel
 * there before it ever read the name and then come back: the reading
 * direction and the attention direction disagreed, and the name was left as
 * the second thing looked at.
 *
 * The name takes the slack, so one long name cannot push anything aside.
 * Everything after it is metadata, right-aligned as one block. The `here`
 * tag stays immediately after the name — it says "this row is the
 * conversation you are in", which is part of the row's identity rather than
 * a detail to go looking for.
 *
 * There is no folder cell: a track sized off the folder names on screen
 * would change width the moment the reader pressed `d`, and every row
 * already on screen would shift sideways with it. A folder that still needs
 * naming rides inside the name cell instead (see
 * `PALETTE_UI.folderPrefix`).
 */
var ROW_CELLS = ['status', 'name', 'here', 'phase', 'turns', 'meta']

/**
 * The conversation stages this plugin tracks, as a cycle. `idle` is the
 * absence of a stage — a conversation nobody has marked yet — so it is not
 * one of the labelled members here; cycling off the last member lands back
 * on it, and from idle the first press lands on the first member.
 *
 * This list is the stage module's own vocabulary. It is deliberately free
 * of where a stage comes from (a hand press now, a goal projection or an
 * agent-written mark later): a source writes one of these values in, the
 * chip reads one out, and neither needs the other.
 */
var PHASES = ['discuss', 'code', 'check']

/** Where this plugin persists per-conversation stages. */
var PHASES_KEY = 'dsh-vim/phases/v1'

/**
 * Retention source used to peek at one session's projections.
 *
 * It must NOT be `mainView`: `uiSession.reconcileStatus()` drops a
 * session's completion reminder whenever `retainedBy.mainView` is above
 * zero, so peeking as the main view would mark every row read and wipe
 * the "just done" badge. Retention counts per source, so a private one
 * costs nothing and `release()` drops the scope again.
 */
var PEEK_SOURCE = 'dsh-vim'

/** How many sessions may be peeked at once, and how long to wait for one. */
var PEEK_CONCURRENCY = 3
var PEEK_TIMEOUT_MS = 1500

/** Accepted range and slider resolution per numeric preference. */
var LIMITS = {
  step: { min: 40, max: 600, step: 10, unit: ' px' },
  tau: { min: 10, max: 250, step: 5, unit: ' ms' },
  repeatDelay: { min: 80, max: 800, step: 20, unit: ' ms' },
  paletteFont: { min: 11, max: 20, step: 1, unit: ' px' },
  paletteWidth: { min: 480, max: 1400, step: 20, unit: ' px' },
  paletteHeight: { min: 40, max: 95, step: 1, unit: ' vh' },
  paletteRow: { min: 3, max: 14, step: 1, unit: ' px' },
  snapshotKeepDays: { min: 7, max: 3650, step: 1, unit: ' 天' },
}

/** Auto-repeat cadence, deliberately not user-facing. */
var REPEAT_INTERVAL = 65
var MIN_REPEAT_INTERVAL = 45
var REPEAT_RAMP = 3

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
var CHAR_NEWLINE = String.fromCharCode(10)


export {
  CHAR_NEWLINE,
  NS,
  STORAGE_KEY,
  RAW_INPUT_SELECTOR,
  COMPOSER_SELECTOR,
  MODAL_SELECTOR,
  ACTIVATING_SELECTOR,
  TRIGGER_MENU_SELECTOR,
  FOCUS_REQUEST_MS,
  SEND_HAND_BACK_MS,
  DOUBLE_ENTER_MS,
  REWRITTEN_FLAG,
  SEND_MODES,
  DEFAULTS,
  KEY_GROUPS,
  MODEL_SEATS,
  NUMERIC_SEATS,
  BOOL_SEATS,
  PLACES,
  PENDING_LABELS,
  PALETTE_LIMIT,
  PALETTE_STEP,
  PALETTE_WINDOW_MS,
  DONE_PULSE_MS,
  BOARD_KEY,
  BOARD_STORE_VERSION,
  NOTE_KEY,
  HISTORY_DB_NAME,
  HISTORY_DB_VERSION,
  HISTORY_STORE_DAYS,
  HISTORY_STORE_META,
  HISTORY_BACKUP_KEY,
  JOURNAL_DB_NAME,
  JOURNAL_DB_VERSION,
  JOURNAL_STORE_EVENTS,
  SNAPSHOT_MOMENT_KEY,
  CARRY_KEY,
  SNAPSHOT_VERSION,
  SNAPSHOT_KEEP_DEFAULT,
  DAY_MS,
  BOARD_STORE_RETRY_MS,
  BOARD_PRUNE_MS,
  HISTORY_EXPORT_KIND,
  BOARD_CARRY_DROP_DAYS,
  BOARD_PANEL_ID,
  OVERVIEW_PANEL_ID,
  BOARD_INBOX,
  BOARD_DONE,
  VERDICT_KEYS,
  BOARD_BLOCK_W,
  BOARD_BLOCK_H,
  BOARD_BLOCK_GAP_X,
  BOARD_BLOCK_GAP_Y,
  BOARD_BLOCK_PITCH_X,
  BOARD_BLOCK_PITCH_Y,
  BOARD_BLOCK_COLUMNS,
  BOARD_ROW_COLUMNS,
  BOARD_CARD_W,
  BOARD_BLOCK_PAD,
  BOARD_COLUMN_GAP,
  BOARD_CARD_CHROME_H,
  BOARD_CARD_LINE_H,
  BOARD_FLOAT_W,
  BOARD_GOAL_NAME_MAX,
  BOARD_GOAL_INTENT_MAX,
  BOARD_EDITOR_MIN_ROWS,
  BOARD_NOTE_BODY_ROWS,
  BOARD_DONE_PREVIEW,
  BOARD_EDITOR_MAX_ROWS,
  BOARD_CANVAS_EDGE,
  BOARD_TIDY_GAP,
  BOARD_TIDY_STEP,
  BOARD_BLOCK_HEAD_H,
  BOARD_TIDY_GLIDE,
  BOARD_MIN_FONT,
  BOARD_ZOOM_MIN,
  BOARD_ZOOM_MAX,
  BOARD_ZOOM_FIT_MIN,
  BOARD_ZOOM_STEP,
  BOARD_FIT_PAD,
  BOARD_TIDY_COLUMNS,
  BOARD_SLOTS,
  BOARD_SLOP,
  BOARD_SORT_EDGE,
  BOARD_GOAL_MENU_W,
  ROW_CELLS,
  PHASES,
  PHASES_KEY,
  PEEK_SOURCE,
  PEEK_CONCURRENCY,
  PEEK_TIMEOUT_MS,
  LIMITS,
  REPEAT_INTERVAL,
  MIN_REPEAT_INTERVAL,
  REPEAT_RAMP,
}