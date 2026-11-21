/**
 * dsh-vim — Vim-style keyboard scrolling for the DeepSeek Harness web client.
 *
 *   d  ->  scroll down     (rebindable)
 *   e  ->  scroll up       (rebindable)
 *   f  ->  task window     (rebindable): the most recent conversations, with
 *                             the down/up keys to move and Enter to switch
 *   space -> put the keyboard in the message box (rebindable); the box never
 *            takes focus on its own, so arriving anywhere — first load, a
 *            switch, the end of a run — leaves the keys live until you ask,
 *            and a message you send hands the keyboard straight back
 *
 * Target: the pane under the pointer. Hover the conversation and the keys work
 * the transcript, hover the sidebar and they work the sidebar; a session with
 * no pointer to follow falls back to the focused pane, then to the middle of
 * the window, then to the largest scroll container.
 *
 * Feel: each press glides the container toward a target with frame-rate
 * independent exponential easing, and holding the key accelerates instead of
 * waiting on the operating system's ~500 ms key-repeat delay. Keys are handled
 * only when focus is NOT inside a text field, so typing is never affected.
 *
 * Preferences (keys, step, easing, repeat delay) live in localStorage and are
 * edited from a page this plugin registers under Settings → Vim scrolling.
 *
 * Built to the DSH client-module contract: a single file that registers a
 * factory with `window.__ModuleLoader__`, exactly like the bundled `dsh-at-file`
 * plugin. The host must mount the `dsh-vim` row for this bundle to reach the page.
 */
window.__ModuleLoader__.load({
  id: 'dsh-vim',
  factory: (require) => {
    'use strict'

    var module = { exports: {} }
    var React = require('react')

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
      snapshotKeepDays: 90,
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
     * The pages the board used to be.
     *
     * A day's page is frozen rather than derived, because the feed it was drawn
     * from has moved on: after midnight, yesterday's members are no longer in
     * the projection. One file per local day, keyed by `YYYY-MM-DD`, each one a
     * copy of the arrangement and of the page as it read (see `view`). The
     * history is its own key on purpose: a board that cannot be read, a board
     * reset, and a notes reset must never take the record with them.
     */
    var SNAPSHOT_KEY = NS + '/board/snapshots/v1'

    /**
     * The last page the board actually drew.
     *
     * Written on every repaint that changes the page, so a day can still be
     * frozen after the app has been closed: the next open reads this moment,
     * files it under its own day, and starts the new day from it. Without it,
     * "yesterday" would have to be reconstructed from a feed that no longer
     * remembers it.
     */
    var SNAPSHOT_MOMENT_KEY = NS + '/board/moment/v1'

    /**
     * The sessions a day inherited from the day before.
     *
     * The board is a day's view, so a conversation that stopped moving falls
     * off it. This is the exception the reader asked for: the members of the
     * last page come along until they move, are taken off the board, or are
     * archived. Kept apart from the arrangement so settling a day costs one
     * small write rather than a rewrite of everything.
     */
    var CARRY_KEY = NS + '/board/carried/v1'

    /**
     * What the board looked like just before a restore or an import.
     *
     * One slot, overwritten by the next such action. It is the way back when
     * an in-page undo would die with a reload, and it is what the history
     * panel offers as "before the restore".
     */
    var BACKUP_KEY = NS + '/board/backup/v1'

    /** The snapshot document's own version, apart from the board's. */
    var SNAPSHOT_VERSION = 1

    /** How many days of history the board keeps when the reader has not said. */
    var SNAPSHOT_KEEP_DEFAULT = 90

    /** One day in milliseconds, for measuring how long a card has been carried. */
    var DAY_MS = 24 * 60 * 60 * 1000

    /**
     * The identity the sidebar entry and the main-panel page share.
     *
     * One string, used twice: the entry that selects the panel and the panel
     * it opens must agree, and the layout service resolves one from the other.
     */
    var BOARD_PANEL_ID = 'dsh-vim-board'

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
    var BOARD_CARD_W = 280
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
    var BOARD_EDITOR_MAX_ROWS = 10

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
    /** How far the canvas may be magnified, and how far it may be shrunk. */
    var BOARD_ZOOM_MIN = 0.5
    var BOARD_ZOOM_MAX = 1.6
    /** The step one press of the zoom buttons takes. */
    var BOARD_ZOOM_STEP = 1.12

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

    // ---------------------------------------------------------------------
    // strings
    // ---------------------------------------------------------------------

    var ZH = {
      nav: 'Vim 滚动',
      keys: '快捷键',
      down: '向下滚动',
      up: '向上滚动',
      focusComposer: '聚焦输入框',
      hintFocus: '默认，输入框不会自己抢焦点：进入页面、切换会话、发完一条消息、任务跑完，宿主都想把光标放回去，这里一律拦下，所以落地就能按 d / e / f。要用输入框就点一下、Tab 过去，或者按这个键。',
      effort: '推理等级',
      hintEffort: '按一次换下一档，到头回绕；只改推理等级，模型不动。当前选中的模型没公布等级时，会提示一句，什么都不会发生。',
      effortProviderDefault: '提供方默认',
      noSession: '没有打开的对话',
      effortUnsupported: '这个宿主不支持调整推理等级',
      effortNoModel: '这个对话还没有选模型',
      effortNone: '这个模型没有可调的推理等级',
      effortFailed: '推理等级没能切换',
      model: '模型',
      hintModel: '按一次弹出一个小窗，每一行是一个模型；选中的那一行列出它所有的推理档位，高亮的那一档就是这一行会提交的档位，其余行只标会落在哪一档。用弹窗的上下键选模型，按住 Shift + 上下键把这一行换个位置（顺序会记住，和下面那份清单是同一份），用档位键（默认 Tab，Shift 反向）或 ←/→ 在选中行里换档位，再按一次这个键确定；Esc 取消，取消不提交任何东西；点窗口外面的任何地方同样是取消。只选模型不动档位时：新模型也提供当前那一档就带过去，否则用它自己的默认档。直接点某个档位 = 切到这个模型 + 这个档位。只改当前这条对话，不改「新会话的默认」。',
      modelEmpty: '还没配置常用模型',
      modelNone: '常用模型当前都不可用',
      modelUnsupported: '这个宿主不支持切换模型',
      modelFailed: '模型没能切换',
      modelList: '常用模型',
      modelChosen: '已选（切换顺序）',
      modelAddable: '可添加',
      modelAdd: '加入常用模型',
      modelRemove: '移出常用模型',
      modelUp: '上移',
      modelDown: '下移',
      modelUnavailable: '当前不可用',
      modelAllChosen: '目录里的模型都已经选上了',
      modelNoCatalog: '这个宿主没有发布模型目录，w 不会工作',
      modelCatalogLoading: '正在读模型目录…',
      modelCatalogFailed: '模型目录没能读出来',
      modelCatalogRetry: '重读',
      modelPick: '切换模型',
      modelPickHere: '当前',
      modelPickConfirm: '确定',
      modelPickCancel: '取消',
      modelPickBusy: '正在切换…',
      modelPickEmpty: '没有可切换的模型',
      modelPickLevel: '档位',
      modelPickNoLevel: '无档位',
      modelPickReorder: '调顺序',
      modelLevel: '模型窗：换档位',
      hintModelLevel: '模型窗里换推理档位：按一下下一档，到头回绕；按住 Shift 按是上一档。←/→ 是同一个动作的固定别名，`q` 在模型窗里也是同一档（窗关着时 `q` 仍是页面的推理等级键）。这个键只在模型窗里有效，窗关着时它是普通字符。',
      palette: '任务窗',
      window: '任务窗',
      paletteRename: '重命名对话',
      rename: '重命名',
      archive: '归档',
      renameFailed: '重命名失败',
      renameUnavailable: '这个宿主不支持重命名对话',
      renameNoName: '名字不能为空',
      renameBusy: '正在重命名…',
      focus: '焦点',
      escapeBlurs: 'Esc 离开输入框',
      hintEscape: '输入框吃掉所有按键，Esc 会把焦点还回来，d / e 立刻恢复。宿主自己要用 Esc 的时候不受影响。',
      spaceBlurs: '空格离开空输入框',
      hintSpace: '输入框里一个字都没打的时候，再按一次聚焦键就离开输入框——不用 Esc，也不会碰到正在跑的任务。里面有东西时它还是普通的空格。跟着上面绑定的那个键走。',
      switchBlurs: '不自动聚焦输入框',
      hintSwitch: '输入框只在你要的时候才拿焦点。关掉它就退回宿主的行为：每次进入页面、切换会话、任务结束，光标都会被放进输入框，得先按 Esc 才能继续滚。',
      sendBlurs: '发完消息交还键盘',
      hintSendBlurs: '消息发出去的那一刻，焦点就还给页面，d / e / f 当场可用——按 f 打开任务窗时，它不会变成往草稿里打的第二个字。想接着写下一条，按一下聚焦键（默认空格）就行，草稿一个字都不会少。候选列表开着的时候、框里本来就是空的时候，都不动。关掉它就退回宿主的行为：发完之后光标留在输入框里，得先按 Esc。',
      sendMode: 'Enter 做什么',
      sendHost: '发送',
      sendNewline: '换行',
      sendSilent: '什么都不做',
      sendDouble: '连按两下 Enter 发送',
      hintSend: '默认 Enter 就把消息发出去了。改成「换行」之后，Enter 插入换行、Ctrl/⌘+Enter 发送（这是宿主自己的发送快捷键，不是插件加的）；改成「什么都不做」则 Enter 完全静默，换行走 Shift+Enter；改成「连按两下 Enter 发送」则第一下照常换行，250 毫秒内再按一下才发送——不用记快捷键，Ctrl/⌘+Enter 也照旧可用。斜杠菜单、@ 菜单这类候选列表开着时，Enter 永远归它——插件不插手。输入框之外的地方不受影响。',
      hintSendNewline: 'Enter 换行 · ',
      hintSendSilent: 'Enter 不发送 · ',
      hintSendDouble: 'Enter 换行 · 连按两下 Enter 发送 · ',
      hintSendSends: '发送',
      on: '开',
      off: '关',
      paletteUp: '弹窗上翻',
      paletteDown: '弹窗下翻',
      paletteEnter: '切换到选中的对话',
      board: '看板',
      hintBoard: '按一次打开看板：一块地方一个目标（默认是今天动过的工作区，双击标题可以改成你正在做的事），会话排在下面，分叉用线连起来；会话卡片按住能拖出来单独放在画布上，拖回目标里就收回去。空白处拖动平移画布，标题栏拖动移动目标。再按一次回到对话；在对话页里右键一下，也是回去的那条路。',
      note: '想法',
      hintNote: '在输入框外按一次，会在当前对话上弹出一行：写一句话，按 Enter 就把它钉在这个对话上。再按一次是改它，清空就是删掉。',
      notePlaceholder: '给这个对话钉一句话',
      noteNoSession: '先打开一个对话，再记想法',
      noteEdit: '点一下改这句',
      boardAddNote: '记一条想法',
      boardPageHint: '拖目标任意处移动它 · 双击标题改名 · 拖空白平移 · 拖会话卡片到另一个目标里 · ＋卡片写想法 · 目标头上的 ＋ 开新会话，想法卡拖到它上面也会开一条 · 卡片拖到会话上连线，拖到会话右侧的箭头上升成草稿 · 侧栏的会话行拖进来即上板，松在哪个目标上就归哪个目标',
      // The faded words in the title's place, which is also what the field says
      // while it is empty: one sentence, in the place the reader types.
      boardNoteUntitled: '聚焦一个主题',
      boardCardOpenHint: '点一下看全文',
      boardNoteTitleHint: '聚焦一个主题',
      boardCardFileHint: '收纳这个卡片',
      boardDoneFiledOne: '已收进这条会话的已完成',
      boardInbox: '收件箱',
      boardInboxSessions: '会话',
      boardInboxNotes: '想法',
      boardInboxHint: '收件箱是托盘：还没归位的东西都在这里，会话和想法一起收',
      boardEmptyTrayIdeas: '想法卡拖进来，会收成一行',
      boardFiled: '收进收件箱了',
      boardEmptyInbox: '没有落在工作区里的会话',
      boardEmptyBoard: '今天还没有动过的会话。写一张卡片，或先立一个目标，把要做的事写下来。',
      boardTodayCount: '今天 ',
      boardWorkspacesUnit: ' 个目标 · ',
      boardSessionsUnit: ' 条会话',
      boardHint: 'Esc 关闭 · 拖目标任意处移动它 · 拖空白平移 · 拖会话卡片到另一个目标里 · 目标头上的 ＋ 开新会话，想法卡拖到它上面也会开一条 · 卡片拖到会话上连线，拖到会话右侧的箭头上升成草稿 · 侧栏的会话行拖进来即上板，松在哪个目标上就归哪个目标',
      boardArrange: '整理',
      boardArrangeHint: '把想法卡收好：已完成且连上会话的收进「已完成」，没连上的收进收件箱',
      boardDoneBin: '已完成',
      boardDoneBinHint: '这条会话收到过的已完成想法：在卡片右侧列出来，点一行看全文',
      boardDoneBinEmpty: '还没有收进来的卡片',
      boardDoneFiled: '收好 ',
      boardDoneFiledTail: ' 张已完成的卡片',
      boardDoneBack: '已放回纸面',
      boardUndo: '撤销',
      boardHistory: '历史',
      boardHistoryHint: '每天一页的看板快照：打开看板时，把上一次的样子收进历史；可以只读地看回去',
      boardHistoryEmpty: '还没有快照。下一次打开看板时，今天这一页会收进历史。',
      boardHistoryDayCount: ' 天',
      boardHistoryGoalsUnit: ' 个目标',
      boardHistorySessionsUnit: ' 条会话',
      boardHistoryCardsUnit: ' 张卡片',
      boardHistoryRestore: '恢复为今天的起点',
      boardHistoryRestoreArmed: '再按一次：覆盖今天',
      boardHistoryRestored: '已恢复到 ',
      boardHistoryRestoredTail: ' 的起点',
      boardHistoryExport: '导出',
      boardHistoryImport: '导入',
      boardHistoryExported: '已导出看板、想法和全部历史',
      boardHistoryImported: '已导入；原来的数据还在历史里的「恢复前」',
      boardHistoryImportFailed: '导入失败：',
      boardHistoryBefore: '恢复前',
      boardHistoryBeforeHint: '上一次恢复或导入之前的看板；按一下拿回来',
      boardHistoryBeforeDone: '已拿回上一次的样子',
      boardHistoryClose: '关闭',
      boardHistoryRetention: '保留 ',
      boardHistoryRetentionTail: ' 天',
      boardHistoryCarried: '承 ',
      boardHistoryCarriedUnit: ' 天',
      boardHistoryCarriedHint: '从这一天带过来的会话，直到它再动、被删掉或归档',
      boardSnapshotFailed: '快照没能保存：存储已满',
      snapshotKeep: '历史保留',
      hintSnapshotKeep: '看板每天最多收一页；超过这个天数的快照从最旧的删。90 天大约 1MB。',
      boardAddCard: '＋ 卡片',
      boardAddCardHint: '在画布空白处写一条想法；也可以双击画布',
      boardZoomIn: '放大画布',
      boardZoomOut: '缩小画布',
      boardZoomReset: '恢复 100%',
      boardCardPlaceholder: '写点什么…',

      boardCardRemove: '删掉这张卡片',
      boardDropFailed: '没找到输入框，卡片还留在看板上',
      boardDragUnknown: '拖进来的不是一条会话，看板没有接',
      boardCardEnter: '进入',
      boardCardEnterHint: '投入这个会话',
      boardCardExpandHint: '展开这张卡',
      boardCardCollapseHint: '收成一行',
      /// The mark that opens the name field. A press on the card itself enters
      /// the conversation now, so renaming needs a target of its own.
      boardCardRenameHint: '改名',
      boardCardDupHint: '这张卡和别的卡同名：末尾是它自己的编号',

      boardCardLinked: '已连到 ',
      boardCardLinkedUnknown: '已连到一条不在看板上的会话',
      boardCardUnlink: '断开',
      boardFork: '分叉',
      boardForkHint: '从这条会话开一条新分支',
      boardForkBusy: '正在分叉…',
      boardForkDone: '已分叉：',
      boardNamedFromCard: '已命名为：',
      boardForkFailed: '没能分叉，请再试一次',
      boardForkUnavailable: '这个宿主没有提供分叉',
      boardForkSource: '分叉自 ',
      boardForkSourceUnknown: '分叉自一条不在看板上的会话',
      boardStar: '收藏这个对话',
      boardUnstar: '取消收藏',
      boardOnlyStarred: '★ 只看收藏',
      boardChatRemove: '把这条对话移出看板（它动一下会自己回来）',
      pin: '放到看板',
      hintPin: '把屏幕上的这个对话放到看板。看板只收今天动过的会话，这一下给它盖个收藏，隔了夜、停了工也还在。任务窗开着的时候，这一下作用在选中的那一行上。',
      pinNoSession: '先打开一个对话，再把它放到看板',
      pinDone: '已放到看板',
      pinAlready: '已经在看板上了',
      boardGoalName: '目标',
      boardUndo: '撤销',
      boardRedo: '重做',
      boardUndoHint: '撤回上一次删除',
      boardRedoHint: '再删一次刚才撤回来的',
      boardUndoIdea: '想法',
      boardUndoSession: '会话',
      boardUndoGoal: '目标',
      boardNewGoal: '未命名目标',
      boardGoalRenameHint: '双击标题改名；清空就用工作区原来的名字',
      boardGoalPlaceholder: '这个目标叫…',
      boardCardMarkDone: '标为已完成',
      boardCardMarkOpen: '标回未完成',
      boardDoneUnit: '已完成',
      boardOpenUnit: '未完成',
      boardCardMoveHint: '点一下进入这个对话 · 按住拖动放进另一个目标',
      boardMoved: '已放进这个目标',
      boardGoalDragHint: '拖这块板移动它 · 双击标题改名 · 🎯 写要做什么',
      boardGoalIntent: '这个目标要做什么',
      boardGoalIntentHint: '点一下就能写：这个目标要做什么。写了这一句，它没有会话也留在看板上；空着就会随会话一起收起',
      boardGoalIntentPlaceholder: '这个目标要做什么？（写了才会留住它）',
      boardGoalRemove: '收起这个目标，会话回到各自工作区',
      boardGoalRemoved: '已收起 ',
      boardGoalReleased: ' 条会话回到各自工作区',
      boardGoalUndo: '撤销',
      boardGoalLastCard: '这是它最后一条会话：拖到别的目标里，或先给目标写一句 🎯',
      boardAddGoal: '＋ 目标',
      boardAddGoalHint: '在画布中间立一个目标，先写下要做的事',
      boardGoalAdded: '立了新目标，写一句要做什么',
      boardNewSession: '新建会话',
      boardNewSessionHint: '点一下写标题和正文，开一条新会话；也可以把想法卡拖到这里',
      boardNewSessionTitle: '开一条新会话',
      boardNewSessionTitleLabel: '标题',
      boardNewSessionTitlePlaceholder: '这条会话叫什么',
      boardNewSessionBodyLabel: '正文',
      boardNewSessionBodyPlaceholder: '要让它做什么……',
      boardNewSessionModelLabel: '模型',
      boardNewSessionModelDefault: '默认（跟宿主走）',
      boardNewSessionModelHint: '用哪条模型开这条会话',
      boardNewSessionHelper: '标题会作为会话名，正文会作为第一条消息发出去；只写标题就只建一条会话，什么都不发。',
      boardNewSessionKeys: 'Esc 取消 · Ctrl/⌘+Enter 创建',
      boardNewSessionConfirm: '创建',
      boardNewSessionCancel: '取消',
      boardNewSessionCreated: '已新建会话：',
      boardNewSessionDropped: '已用这张卡开了一条新会话',
      boardNewSessionFailed: '没能新建会话：',
      boardNewSessionEmpty: '至少写个标题',
      boardNewSessionNoWorkspace: '这个目标还没有工作区：先在侧边栏开一条会话，再把它拖进来',
      boardNewSessionUnavailable: '这个宿主没有提供新建会话',

      appearance: '弹窗外观',
      fontSize: '字体大小',
      panelWidth: '弹窗宽度',
      panelHeight: '弹窗高度',
      rowSpacing: '行距',
      place: '弹出位置',
      placeTop: '顶部',
      placeCenter: '居中',
      placeBottom: '底部',
      speed: '速度与手感',
      step: '滚动步长',
      tau: '缓动时长',
      repeatDelay: '连发延迟',
      hint: '点一下方框，再按下你想用的键。焦点落在输入框里时，这些键不会触发滚动。',
      hintEnter: '「切换」这一项是额外的键：Enter 始终可用，不受它影响。它出厂是 o——原来的 g 已经让给「归档选中的对话」了。',
      hintPalette: '任务窗开着的时候，打开它的那个键不是"关闭"，而是"前往选中的对话"——选好再按一次就过去了。列表空着没地方可去时才用它关闭；Esc 永远能关。点窗口外面的任何地方也能关（那一次点击照常作用在页面上）。',
      reset: '恢复默认',
      conflict: '同一组里的键不能重复：滚动、聚焦、推理、模型、看板、想法、放到看板是「下/上/聚焦/推理/模型/看板/想法/放到看板」，任务窗是「打开/重命名/上翻/下翻/切换/阶段/放到看板」，模型窗是「模型/推理/上翻/下翻/换档位」；看板和任务窗是两个窗口，它们的键也不能相同',
      recording: '按键…',
      tasks: '最近的对话',
      tasksEmpty: '没有可切换的对话',      tasksUnavailable: '任务窗不可用',
      groupMine: '球在你这边',
      groupLive: '进行中',
      groupRecent: '最近',
      groupHistory: '更早',
      headQuiet: '没有要你处理的',
      headMine: '条等你',
      headLive: '条在跑',
      navigate: '选择',
      select: '切换',
      close: '关闭',
      moreHint: '「更多」展开',
      groupMore: '更多',
      turnUnit: '轮',
      current: '当前',
      phaseDiscuss: '讨论',
      phaseCode: '编码',
      phaseCheck: '检查',
      phaseHint: '点一下标上这个阶段',
      phaseUnmark: '再点一次取消标记',
      paletteStage: '切换阶段',
      hintStage: '任务窗每一行都把「讨论 / 编码 / 检查」摆出来，当前阶段高亮——直接点那个词就标上了，再点一次取消。也可以按这个键按顺序推进。标注跟着对话走，关掉任务窗也在。',
      paletteArchive: '归档选中的对话',
      hintArchive: '把选中的对话归档，它就从这个列表和侧边栏里收起来。**正在跑任务的对话不会被归档**：这个键不替你停任务（和 Esc 同一条原则——一次按键毁掉你没打算停的任务是最坏的一种意外），而是提示你先停下来。归档走宿主自己的动作，成功后宿主会把它从列表里拿掉；如果归档的正是屏幕上这条，主视图会跟着清空，和你在侧边栏里手动归档完全一样。归档没有撤销键，但宿主自己的「已归档」入口能找回来。',
      archiveBusy: '正在归档…',
      archiveActive: '这条对话正在跑任务，先停下来再归档',
      archiveFailed: '归档失败',
      archiveUnavailable: '这个宿主不支持归档对话',
      statusRunning: '进行中',
      statusDone: '刚刚完成',
      statusWaitApproval: '等待批准',
      statusWaitPlan: '等待计划审阅',
      statusWaitAnswer: '等待回答',
      statusWaiting: '等待中',
      justNow: '刚刚',
      minutesAgo: ' 分钟前',
      hoursAgo: ' 小时前',
      daysAgo: ' 天前',
      elapsedFor: '已运行',
      elapsedSeconds: ' 秒',
      elapsedMinutes: ' 分',
      elapsedHours: ' 小时',
    }

    var EN = {
      nav: 'Vim scrolling',
      keys: 'Keys',
      down: 'Scroll down',
      up: 'Scroll up',
      focusComposer: 'Focus the message box',
      hintFocus: 'By default the message box never takes focus by itself: on first load, on a switch, after a send, and when a run ends the shell hands the caret back, and every one of those is refused — so d / e / f work the moment a page appears. Click the box, Tab to it, or press this key to type.',
      effort: 'Reasoning level',
      hintEffort: 'Each press steps to the next level and wraps around at the end. Only the reasoning level moves — the model is left alone. A model that publishes no levels says so instead of doing nothing quietly.',
      effortProviderDefault: 'Provider default',
      noSession: 'No conversation is open',
      effortUnsupported: 'This host cannot change the reasoning level',
      effortNoModel: 'This conversation has no model selected yet',
      effortNone: 'This model offers no reasoning levels',
      effortFailed: 'The reasoning level was not changed',
      model: 'Model',
      hintModel: 'A press opens a small window with one row per model: the selected row lists every reasoning level that model publishes, with the one it would submit highlighted, and every other row just says which level it would land on. Move between models with the window\'s up/down keys, Shift with those same keys to move the selected row to another place (the order is remembered, and is the same list as the one below), move between levels with the level key (Tab by default, Shift for the other way) or ←/→, then press this key again to confirm; Escape cancels, and cancelling submits nothing — as does a press anywhere outside the window. Picking a model without touching the level carries the current level over whenever that model publishes it too, and otherwise falls back to its own default. Clicking a level switches to that model at that level in one step. Only the conversation on screen is changed — the default for a new conversation is not.',
      modelEmpty: 'No switchable models are configured yet',
      modelNone: 'None of your switchable models is available right now',
      modelUnsupported: 'This host cannot switch models',
      modelFailed: 'The model was not changed',
      modelList: 'Switchable models',
      modelChosen: 'Chosen (the order the key walks)',
      modelAddable: 'Available to add',
      modelAdd: 'Add to the switchable models',
      modelRemove: 'Remove from the switchable models',
      modelUp: 'Move up',
      modelDown: 'Move down',
      modelUnavailable: 'Not available now',
      modelAllChosen: 'Every model in the catalog is already on the list',
      modelNoCatalog: 'This host publishes no model catalog, so this key does nothing',
      modelCatalogLoading: 'Reading the model catalog…',
      modelCatalogFailed: 'The model catalog could not be read',
      modelCatalogRetry: 'Read again',
      modelPick: 'Switch model',
      modelPickHere: 'Current',
      modelPickConfirm: 'confirm',
      modelPickCancel: 'cancel',
      modelPickBusy: 'Switching…',
      modelPickEmpty: 'No model to switch to',
      modelPickLevel: 'level',
      modelPickNoLevel: 'no levels',
      modelPickReorder: 'reorder',
      modelLevel: 'Model window: change level',
      hintModelLevel: 'Changes the reasoning level inside the model window: a press steps to the next level and wraps at the end, Shift steps the other way, and ←/→ are the same move as fixed aliases. q is that same step while the window is up (with it down, q stays the page\'s reasoning key). The key does nothing outside that window — with it closed it is an ordinary character.',
      palette: 'Task window',
      window: 'Task window',
      paletteRename: 'Rename the conversation',
      rename: 'rename',
      archive: 'archive',
      renameFailed: 'Rename failed',
      renameUnavailable: 'This host cannot rename conversations',
      renameNoName: 'A name is required',
      renameBusy: 'Renaming…',
      focus: 'Focus',
      escapeBlurs: 'Esc leaves the composer',
      hintEscape: 'A focused composer swallows every key, so Esc hands focus back and d / e work again. Escape the shell claims itself is left alone.',
      spaceBlurs: 'Space leaves an empty box',
      hintSpace: 'While the box holds nothing at all, pressing the focus key again hands the keyboard back — no Escape, and nothing done to a running turn. With anything typed it stays a plain Space. It follows whichever key is bound above.',
      switchBlurs: 'The box never grabs focus',
      hintSwitch: 'The message box only takes focus when you ask for it. Turning this off restores the host behaviour: entering a page, switching conversations and finishing a run all put the caret back in the box, and Escape is the only way out.',
      sendBlurs: 'Send hands back the keyboard',
      hintSendBlurs: 'The moment a message goes out the caret goes back to the page, so d / e / f work at once — pressing f opens the task window instead of typing a second f into the draft. To keep writing, press the focus key again; not one character of the draft is touched. A candidate list being open and an empty box are both left alone. Turning this off restores the host behaviour: the caret stays in the box after a send, and Escape is the only way out.',
      sendMode: 'What Enter does',
      sendHost: 'Sends',
      sendNewline: 'Breaks the line',
      sendSilent: 'Nothing',
      sendDouble: 'Sends on a double Enter',
      hintSend: 'By default Enter sends the message. Set it to "breaks the line" and Enter inserts a line break while Ctrl/Cmd+Enter sends — that accelerator is the host\'s own, not something this plugin adds. Set it to "nothing" and Enter goes silent, leaving Shift+Enter to break the line. Set it to "sends on a double Enter" and the first press breaks the line as usual while a second press within 250 ms sends, so there is no accelerator to remember; Ctrl/Cmd+Enter keeps working too. While a candidate list is open — the slash menu, an @-mention — Enter always belongs to that list and stays untouched. Anywhere outside the message box is unaffected.',
      hintSendNewline: 'Enter breaks the line · ',
      hintSendSilent: 'Enter does not send · ',
      hintSendDouble: 'Enter breaks the line · double Enter sends · ',
      hintSendSends: 'sends',
      on: 'On',
      off: 'Off',
      paletteUp: 'Window up',
      paletteDown: 'Window down',
      paletteEnter: 'Switch to the selected one',
      board: 'Board',
      hintBoard: 'Open the board with one press: each panel is a goal (it starts as a workspace that moved today, and a double press on its title renames it to what you are working toward), its conversations under it, forks joined by lines. A conversation card can be dragged out to stand on the paper, and dropped back on a goal to return. Drag bare paper to pan, drag a panel by its heading to move it. Press again to go back to the conversation — or right-press anywhere on it.',
      note: 'Note',
      hintNote: 'Outside the message box, one line opens over the conversation you are in: type a thought, press Enter, and it is pinned to that conversation. Press again to edit it; empty it to take it away.',
      notePlaceholder: 'One line for this conversation',
      noteNoSession: 'Open a conversation first, then write it down',
      noteEdit: 'Click to edit',
      boardAddNote: 'Pin a note',
      boardPageHint: 'Drag a heading to move a panel · drag the background to pan · ＋ card to jot something down · the ＋ on a goal starts a conversation, and a card dropped on it starts one too · drop a card on a conversation to link it, on Enter to make it a draft · drag a session row in from the sidebar to put it on the board, and let go on a goal to file it there',
      boardNoteUntitled: 'Focus on a topic',
      boardCardOpenHint: 'Click to read all of it',
      boardNoteTitleHint: 'Focus on a topic',
      boardCardFileHint: 'File this card away',
      boardDoneFiledOne: 'Filed with this conversation',
      boardInbox: 'Inbox',
      boardInboxSessions: 'Sessions',
      boardInboxNotes: 'Ideas',
      boardInboxHint: 'The inbox is a tray: everything that has not found a place yet, conversations and ideas together',
      boardEmptyTrayIdeas: 'Drag an idea card in and it is kept as one line',
      boardFiled: 'Put away in the inbox',
      boardEmptyInbox: 'Nothing outside a workspace',
      boardEmptyBoard: 'Nothing has moved today. Write a card, or stand a goal and say what is to be done.',
      boardTodayCount: 'Today ',
      boardWorkspacesUnit: ' goals · ',
      boardSessionsUnit: ' conversations',
      boardHint: 'Escape closes · drag a heading to move a panel · drag the background to pan · the ＋ on a goal starts a conversation, and a card dropped on it starts one too · drop a card on a conversation to link it, on Enter to make it a draft · drag a session row in from the sidebar to put it on the board, and let go on a goal to file it there',
      boardArrange: 'Tidy',
      boardArrangeHint: 'Put the idea cards away: the finished ones tied to a conversation into Done, the rest into the inbox',
      boardDoneBin: 'Done',
      boardDoneBinHint: 'Ideas finished for this conversation: they are listed beside the card, press a line to read it',
      boardDoneBinEmpty: 'Nothing put away yet',
      boardDoneFiled: 'Put away ',
      boardDoneFiledTail: ' finished cards',
      boardDoneBack: 'Back on the canvas',
      boardUndo: 'Undo',
      boardHistory: 'History',
      boardHistoryHint: 'One page a day: opening the board files the last page it drew; read back through them here',
      boardHistoryEmpty: 'No pages yet. The next time the board opens, today is filed here.',
      boardHistoryDayCount: ' days',
      boardHistoryGoalsUnit: ' goals',
      boardHistorySessionsUnit: ' conversations',
      boardHistoryCardsUnit: ' cards',
      boardHistoryRestore: 'Restore as today',
      boardHistoryRestoreArmed: 'Press again: replace today',
      boardHistoryRestored: 'Restored ',
      boardHistoryRestoredTail: ' as today',
      boardHistoryExport: 'Export',
      boardHistoryImport: 'Import',
      boardHistoryExported: 'Exported the board, notes and all history',
      boardHistoryImported: 'Imported; the previous data is under "Before"',
      boardHistoryImportFailed: 'Import failed: ',
      boardHistoryBefore: 'Before',
      boardHistoryBeforeHint: 'The board as it was just before the last restore or import; press to take it back',
      boardHistoryBeforeDone: 'The previous board is back',
      boardHistoryClose: 'Close',
      boardHistoryRetention: 'Keeps ',
      boardHistoryRetentionTail: ' days',
      boardHistoryCarried: 'Carried ',
      boardHistoryCarriedUnit: 'd',
      boardHistoryCarriedHint: 'Carried over from that day until it moves, is taken off the board or is archived',
      boardSnapshotFailed: 'The page could not be stored: storage is full',
      snapshotKeep: 'History',
      hintSnapshotKeep: 'At most one page a day; older pages are dropped past this many days. Ninety days is about 1 MB.',
      boardAddCard: '+ Card',
      boardAddCardHint: 'Jot a thought on the canvas; a double click works too',
      boardZoomIn: 'Zoom in',
      boardZoomOut: 'Zoom out',
      boardZoomReset: 'Reset to 100%',
      boardCardPlaceholder: 'Write something…',

      boardCardRemove: 'Delete this card',
      boardDropFailed: 'No message box to drop it in; the card is still here',
      boardDragUnknown: 'That was not a conversation, so the board took nothing',
      boardCardEnter: 'Enter',
      boardCardEnterHint: 'Hand it to this conversation',
      boardCardExpandHint: 'Open this card up',
      boardCardCollapseHint: 'Fold it back to one line',
      boardCardRenameHint: 'Rename',
      boardCardDupHint: 'Another card wears this name: the number at the end is this one\'s own',

      boardCardLinked: 'Linked to ',
      boardCardLinkedUnknown: 'Linked to a conversation not on the board',
      boardCardUnlink: 'Unlink',
      boardFork: 'Fork',
      boardForkHint: 'Start a new branch from this conversation',
      boardForkBusy: 'Branching…',
      boardForkDone: 'Forked: ',
      boardNamedFromCard: 'Named: ',
      boardForkFailed: 'The branch could not be made. Try again.',
      boardForkUnavailable: 'This host does not offer forking',
      boardForkSource: 'Forked from ',
      boardForkSourceUnknown: 'Forked from a conversation not on the board',
      boardStar: 'Mark this conversation',
      boardUnstar: 'Remove the mark',
      boardOnlyStarred: '★ Only marked',
      boardChatRemove: 'Take this conversation off the board (it comes back once it moves again)',
      pin: 'Put on the board',
      hintPin: 'Put the conversation on screen onto the board. The board only keeps what moved today, and this marks it so it stays past the day it last moved. While the task window is open the same press acts on the selected row.',
      pinNoSession: 'Open a conversation first, then put it on the board',
      pinDone: 'Put on the board',
      pinAlready: 'Already on the board',
      boardGoalName: 'Goal',
      boardGoalRenameHint: 'Double-click the title to rename it; clearing it restores the workspace name',
      boardGoalPlaceholder: 'This goal is called…',
      boardUndo: 'Undo',
      boardRedo: 'Redo',
      boardUndoHint: 'Take back the last delete',
      boardRedoHint: 'Do that delete again',
      boardUndoIdea: 'Idea',
      boardUndoSession: 'Conversation',
      boardUndoGoal: 'Goal',
      boardNewGoal: 'Untitled goal',
      boardCardMarkDone: 'Mark as done',
      boardCardMarkOpen: 'Mark as not done',
      boardDoneUnit: 'Done',
      boardOpenUnit: 'Open',
      boardCardMoveHint: 'Click to open this conversation · press and drag to file it in another goal',
      boardMoved: 'Filed under this goal',
      boardGoalDragHint: 'Drag this panel to move it · double-click the title to rename it · 🎯 says what it is for',
      boardGoalIntent: 'What this goal is for',
      boardGoalIntentHint: 'Click to write what is to be done here. A goal with a line stays on the board with nothing in it; a goal without one goes when its last conversation does',
      boardGoalIntentPlaceholder: 'What is this goal for? (a line keeps it)',
      boardGoalRemove: 'Close this goal; its conversations go back to their workspaces',
      boardGoalRemoved: 'Closed ',
      boardGoalReleased: ' conversations back in their workspaces',
      boardGoalUndo: 'Undo',
      boardGoalLastCard: 'This is the last conversation here: file it in another goal, or write what this goal is for',
      boardAddGoal: '+ Goal',
      boardAddGoalHint: 'Stand a goal in the middle of the canvas and write what is to be done',
      boardGoalAdded: 'Goal added — write what it is for',
      boardNewSession: 'New conversation',
      boardNewSessionHint: 'Click to write a title and a body and start a new conversation; or drag an idea card here',
      boardNewSessionTitle: 'Start a new conversation',
      boardNewSessionTitleLabel: 'Title',
      boardNewSessionTitlePlaceholder: 'What this conversation is called',
      boardNewSessionBodyLabel: 'Body',
      boardNewSessionBodyPlaceholder: 'What should it do…',
      boardNewSessionModelLabel: 'Model',
      boardNewSessionModelDefault: 'Default (whatever the host uses)',
      boardNewSessionModelHint: 'Which model this conversation starts on',
      boardNewSessionHelper: 'The title names the conversation; the body goes out as its first message. A title on its own just stands the conversation up.',
      boardNewSessionKeys: 'Esc to cancel · Ctrl/Cmd+Enter to create',
      boardNewSessionConfirm: 'Create',
      boardNewSessionCancel: 'Cancel',
      boardNewSessionCreated: 'Started: ',
      boardNewSessionDropped: 'Started a conversation from the card',
      boardNewSessionFailed: 'Could not start a conversation: ',
      boardNewSessionEmpty: 'Give it a title first',
      boardNewSessionNoWorkspace: 'This goal has no workspace yet: start a conversation in the sidebar and drag it here first',
      boardNewSessionUnavailable: 'This host does not offer starting conversations',

      appearance: 'Task window appearance',
      fontSize: 'Font size',
      panelWidth: 'Window width',
      panelHeight: 'Window height',
      rowSpacing: 'Row spacing',
      place: 'Position',
      placeTop: 'Top',
      placeCenter: 'Middle',
      placeBottom: 'Bottom',
      speed: 'Speed and feel',
      step: 'Step',
      tau: 'Easing time',
      repeatDelay: 'Repeat delay',
      hint: 'Click a box, then press the key you want. These keys stay inert while a text field has focus.',
      hintEnter: '"Switch" is an extra key: Enter always works, whatever this is set to. It ships as o — the old g now belongs to "Archive the selected conversation".',
      hintPalette: 'While the window is open the key that opened it goes to the selected conversation instead of closing it — pick a row, press it again, and you are there. It closes that way only when there is nothing to go to; Escape always closes, and so does a press anywhere outside the window (that press still reaches the page).',
      reset: 'Restore defaults',
      conflict: 'Keys must be unique within a group: down/up/focus/reasoning/model/board/note/pin for the page, open/rename/up/down/switch/stage/pin for the task window, model/reasoning/up/down/level for the model window. The board and the task window are the two overlays, so their keys must differ as well',
      recording: 'Press a key…',
      tasks: 'Recent conversations',
      tasksEmpty: 'No conversations to switch to',
      tasksUnavailable: 'Task window unavailable',
      groupMine: 'Waiting on you',
      groupLive: 'In flight',
      groupRecent: 'Recent',
      groupHistory: 'Earlier',
      headQuiet: 'Nothing needs you',
      headMine: 'waiting on you',
      headLive: 'in flight',
      navigate: 'select',
      select: 'switch',
      close: 'close',
      moreHint: 'More below',
      groupMore: 'More',
      turnUnit: 'turns',
      current: 'Here',
      phaseDiscuss: 'Discuss',
      phaseCode: 'Code',
      phaseCheck: 'Check',
      phaseHint: 'Mark this stage',
      phaseUnmark: 'Click again to unmark',
      paletteArchive: 'Archive the selected conversation',
      hintArchive: 'Files the selected conversation away, out of this list and the sidebar. **A conversation with work in flight is never archived**: this key does not stop a turn for you — the same rule Escape follows, because one keystroke destroying a task you never meant to stop is the worst kind of accident. It tells you to stop it first instead. Archiving goes through the host\'s own action, so the host drops the row itself; and when the conversation being archived is the one on screen, the main view clears with it, exactly as archiving by hand from the sidebar does. There is no un-archive key here, but the host\'s own archived list can bring it back.',
      archiveBusy: 'Archiving…',
      archiveActive: 'This conversation has work in flight — stop it first',
      archiveFailed: 'Archiving failed',
      archiveUnavailable: 'This host cannot archive conversations',
      paletteStage: 'Cycle stage',
      hintStage: 'Every row lays out Discuss / Code / Check with the current stage lit — click a word to mark it, click the lit one to take the mark off. The stage key steps through the same order. The mark lives with the conversation, so it is still there with the window closed.',
      statusRunning: 'Running',
      statusDone: 'Just done',
      statusWaitApproval: 'Needs approval',
      statusWaitPlan: 'Reviewing plan',
      statusWaitAnswer: 'Needs your answer',
      statusWaiting: 'Waiting',
      justNow: 'just now',
      minutesAgo: 'm ago',
      hoursAgo: 'h ago',
      daysAgo: 'd ago',
      elapsedFor: 'running for',
      elapsedSeconds: 's',
      elapsedMinutes: 'm',
      elapsedHours: 'h',
    }

    /** Best-effort locale guess, used for the nav label and fallback strings. */
    function localeIsZh() {
      var lang = typeof navigator !== 'undefined' ? navigator.language || navigator.userLanguage || '' : ''
      return /^zh/i.test(lang)
    }

    // ---------------------------------------------------------------------
    // preferences
    // ---------------------------------------------------------------------

    /** Live preferences; replaced wholesale on every accepted change. */
    var settings = null

    /** Subscribers re-render the settings page when preferences change. */
    var watchers = []

    /**
     * Shipped defaults as a fresh object, derived from DEFAULTS so a new
     * preference cannot be added to one and forgotten in the other.
     *
     * A list is copied rather than aliased: the one structured seat here is an
     * array, and a settings object that shared the shipped one would let an edit
     * in the settings page rewrite the default every later reset starts from.
     * @returns {object} a mutable copy.
     */
    function defaults() {
      var out = {}
      for (var field in DEFAULTS) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULTS, field)) continue
        out[field] = Array.isArray(DEFAULTS[field]) ? DEFAULTS[field].slice() : DEFAULTS[field]
      }
      return out
    }

    /** Current preferences as a fresh object. */
    function copy() {
      var next = {}
      for (var field in DEFAULTS) {
        next[field] = settings[field]
      }
      return next
    }

    /**
     * The named keys a seat may take. `Enter` is here because a list you cannot
     * confirm with the keyboard is a trap, and `Tab` because the model window's
     * level key ships as one — a named key that is the natural "next" gesture
     * for a row of choices. Anything else longer than one character (modifiers,
     * arrows, function keys, `Escape`) stays unboundable.
     */
    var NAMED_KEYS = ['Enter', 'Tab']

    /**
     * A single printable character, or one of `NAMED_KEYS`, is the only thing
     * worth binding; anything longer (modifiers, arrows, function keys, `Escape`)
     * is rejected.
     * @param {unknown} value - candidate key.
     * @returns {boolean} whether it may be bound.
     */
    function isBindableKey(value) {
      if (typeof value !== 'string') return false
      if (value.length === 1) return true
      var lower = value.toLowerCase()
      for (var i = 0; i < NAMED_KEYS.length; i++) {
        if (NAMED_KEYS[i].toLowerCase() === lower) return true
      }
      return false
    }

    /**
     * Normalise a bound key to its stored form: lower case for characters,
     * canonical capitalisation for the named keys.
     * @param {string} key - the raw `KeyboardEvent.key`.
     * @returns {string} the stored form.
     */
    function normalizeKey(key) {
      if (key.length === 1) return key.toLowerCase()
      var lower = key.toLowerCase()
      for (var i = 0; i < NAMED_KEYS.length; i++) {
        if (NAMED_KEYS[i].toLowerCase() === lower) return NAMED_KEYS[i]
      }
      return lower
    }

    /**
     * How a bound key reads in the settings box. A space is invisible in a box
     * of its own, so it gets its name; the named keys keep their canonical
     * spelling; everything else is upper-cased.
     * @param {string} value - the stored key.
     * @returns {string} the label.
     */
    function keyLabel(value) {
      if (value === ' ') return 'Space'
      if (NAMED_KEYS.indexOf(value) >= 0) return value
      return String(value).toUpperCase()
    }

    /** Clamp a numeric preference to its accepted range. */
    function clampNumber(value, spec, fallback) {
      var n = Number(value)
      if (!isFinite(n)) return fallback
      return Math.max(spec.min, Math.min(spec.max, Math.round(n)))
    }

    /**
     * The switchable models as a fresh list of `{provider, model}` pairs.
     *
     * Every entry is rebuilt rather than kept: the stored value may have been
     * hand-edited, and the pairs handed to a selection must not carry anything
     * the host never published. A model listed twice keeps its first place, so
     * a duplicated entry cannot make the key appear to skip one.
     * @param {unknown} value - the candidate list.
     * @returns {Array<{provider: string, model: string}>} the accepted pairs.
     */
    function sanitizeFavorites(value) {
      if (!Array.isArray(value)) return []
      var out = []
      var seen = {}
      for (var i = 0; i < value.length; i++) {
        var entry = value[i]
        if (!entry || typeof entry !== 'object') continue
        var provider = typeof entry.provider === 'string' ? entry.provider.trim() : ''
        var model = typeof entry.model === 'string' ? entry.model.trim() : ''
        if (provider === '' || model === '') continue
        var key = provider + '/' + model
        if (seen[key]) continue
        seen[key] = true
        out.push({ provider: provider, model: model })
      }
      return out
    }

    /** Persist the current preferences; storage failures are not fatal. */
    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      } catch (error) {
        console.warn('[dsh-vim] could not persist settings', error)
      }
    }

    /** Notify the settings page that preferences changed. */
    function announce() {
      for (var i = 0; i < watchers.length; i++) {
        try {
          watchers[i]()
        } catch (error) {
          console.error('[dsh-vim] settings watcher failed', error)
        }
      }
    }

    /**
     * Validate and apply one patch. Rejected patches leave preferences intact.
     * @param {object} patch - partial preferences.
     * @returns {string|null} 'conflict' when two seats collide, else null.
     */
    function applyPatch(patch) {
      if (!patch || typeof patch !== 'object') return null
      var next = copy()
      for (var g = 0; g < KEY_GROUPS.length; g++) {
        var group = KEY_GROUPS[g]
        for (var i = 0; i < group.length; i++) {
          if (patch[group[i]] === undefined) continue
          if (!isBindableKey(patch[group[i]])) return 'conflict'
          next[group[i]] = normalizeKey(patch[group[i]])
        }
        for (var a = 0; a < group.length; a++) {
          for (var b = a + 1; b < group.length; b++) {
            if (next[group[a]] === next[group[b]]) return 'conflict'
          }
        }
      }
      for (var n = 0; n < NUMERIC_SEATS.length; n++) {
        var field = NUMERIC_SEATS[n]
        if (patch[field] !== undefined) {
          next[field] = clampNumber(patch[field], LIMITS[field], DEFAULTS[field])
        }
      }
      // The board and the task window are the two overlays, and one key cannot
      // open both. They live in different groups (the task window's keys are
      // dead while it is open, the board's is not), so the two seats are checked
      // against each other here.
      if (next.boardKey === next.paletteKey) return 'conflict'
      // The model window's own group, checked after the two above so a seat it
      // shares with them is already holding its new value.
      for (var s = 0; s < MODEL_SEATS.length; s++) {
        if (patch[MODEL_SEATS[s]] === undefined) continue
        if (!isBindableKey(patch[MODEL_SEATS[s]])) return 'conflict'
        next[MODEL_SEATS[s]] = normalizeKey(patch[MODEL_SEATS[s]])
      }
      for (var p = 0; p < MODEL_SEATS.length; p++) {
        for (var q = p + 1; q < MODEL_SEATS.length; q++) {
          if (next[MODEL_SEATS[p]] === next[MODEL_SEATS[q]]) return 'conflict'
        }
      }
      // The model window confirms with Enter whatever its seats are bound to —
      // that alias is the reason a list you can confirm with the keyboard is not
      // a trap. A level seat sitting on it would take the alias away and leave
      // the window with no confirm key at all, so it is refused.
      if (patch.modelLevelKey !== undefined && next.modelLevelKey === 'Enter') return 'conflict'
      if (patch.palettePlace !== undefined) {
        if (PLACES.indexOf(patch.palettePlace) < 0) return 'conflict'
        next.palettePlace = patch.palettePlace
      }
      if (patch.sendMode !== undefined) {
        if (SEND_MODES.indexOf(patch.sendMode) < 0) return 'conflict'
        next.sendMode = patch.sendMode
      }
      for (var b = 0; b < BOOL_SEATS.length; b++) {
        var seat = BOOL_SEATS[b]
        if (patch[seat] !== undefined) next[seat] = !!patch[seat]
      }
      if (patch.favorites !== undefined) next.favorites = sanitizeFavorites(patch.favorites)
      settings = next
      persist()
      announce()
      // The footer advertises the live bindings, so an open window has to
      // re-render when they change. The send hint does not need telling: it is
      // a component that subscribes to this same announce.
      if (PALETTE.open) refreshPalette()
      if (MODELPICK.open) renderModelPick()
      return null
    }

    /**
     * The preferred key when it is free, else the first free letter.
     * @param {string} preferred - that seat's shipped default.
     * @param {object} taken - keys already in use, read as a set.
     * @returns {string} a free lower-cased key.
     */
    function firstFree(preferred, taken) {
      if (!taken[preferred]) return preferred
      for (var code = 97; code <= 122; code++) {
        var letter = String.fromCharCode(code)
        if (!taken[letter]) return letter
      }
      return preferred
    }

    /**
     * Force each key group to be conflict-free. Groups are repaired back to
     * front, so the earlier seat in a group keeps whatever it has and a later
     * one falls back to its shipped default; two passes, because a fallback can
     * itself land on a key the seat before it just gave up.
     *
     * Only a hand-edited store can reach this with a real collision, since the
     * settings page refuses one.
     * @param {object} next - candidate preferences, repaired in place.
     * @returns {object} the same object.
     */
    function repairKeys(next) {
      for (var g = 0; g < KEY_GROUPS.length; g++) {
        var group = KEY_GROUPS[g]
        for (var i = 0; i < group.length; i++) {
          if (!isBindableKey(next[group[i]])) next[group[i]] = DEFAULTS[group[i]]
        }
        for (var pass = 0; pass < 2; pass++) {
          for (var j = group.length - 1; j >= 0; j--) {
            var taken = {}
            for (var k = 0; k < group.length; k++) {
              if (k !== j) taken[next[group[k]]] = true
            }
            if (!taken[next[group[j]]]) continue
            next[group[j]] = firstFree(DEFAULTS[group[j]], taken)
          }
        }
      }
      // The two overlay keys are checked against each other last of all: a store
      // that had them collide would leave one of the windows unreachable. The
      // board is the younger seat, so it is the one that steps aside.
      if (next.boardKey === next.paletteKey) {
        var boardTaken = { [next.paletteKey]: true }
        for (var bg = 0; bg < KEY_GROUPS[0].length; bg++) boardTaken[next[KEY_GROUPS[0][bg]]] = true
        next.boardKey = firstFree(DEFAULTS.boardKey, boardTaken)
      }
      // The model window's group, repaired last: it draws its members from the
      // two groups above, so their own repairs have to have settled first.
      for (var m = 0; m < MODEL_SEATS.length; m++) {
        if (!isBindableKey(next[MODEL_SEATS[m]])) next[MODEL_SEATS[m]] = DEFAULTS[MODEL_SEATS[m]]
      }
      // The standing Enter alias is not a seat and cannot be given up, so a
      // stored level seat sitting on it is moved off before the group pass below.
      if (next.modelLevelKey === 'Enter') next.modelLevelKey = DEFAULTS.modelLevelKey
      for (var mp = 0; mp < 2; mp++) {
        for (var mj = MODEL_SEATS.length - 1; mj >= 0; mj--) {
          var mtaken = {}
          for (var mk = 0; mk < MODEL_SEATS.length; mk++) {
            if (mk !== mj) mtaken[next[MODEL_SEATS[mk]]] = true
          }
          if (!mtaken[next[MODEL_SEATS[mj]]]) continue
          next[MODEL_SEATS[mj]] = firstFree(DEFAULTS[MODEL_SEATS[mj]], mtaken)
        }
      }
      return next
    }

    /**
     * Move the archive seat into place for a store written before it existed.
     *
     * `g` used to be the switch seat's shipped default, and it is now the
     * archive seat's. A store from that era has no `paletteArchiveKey` at all,
     * so without this the old `g` would be read back onto the switch seat and
     * the new seat would collide with it — leaving the user with an archive key
     * they never chose and a switch key that no longer matches the docs.
     *
     * Two cases, and the distinction is the user's own intent:
     * - The switch seat is absent or still the old shipped `g`: the user never
     *   chose it, so it moves to its new default and `g` goes to archiving.
     * - The switch seat is something the user picked: their binding is left
     *   exactly as it is, and the archive seat takes the first free letter.
     * @param {object} parsed - the raw stored preferences.
     * @param {object} next - the candidate preferences, migrated in place.
     * @returns {object} the same object.
     */
    function migrateArchiveSeat(parsed, next) {
      if (parsed.paletteArchiveKey !== undefined) return next
      if (parsed.paletteEnterKey === undefined || parsed.paletteEnterKey === 'g') {
        next.paletteEnterKey = DEFAULTS.paletteEnterKey
        next.paletteArchiveKey = DEFAULTS.paletteArchiveKey
        return next
      }
      var taken = {}
      for (var i = 0; i < KEY_GROUPS[1].length; i++) {
        if (KEY_GROUPS[1][i] !== 'paletteArchiveKey') taken[next[KEY_GROUPS[1][i]]] = true
      }
      next.paletteArchiveKey = firstFree(DEFAULTS.paletteArchiveKey, taken)
      return next
    }

    /** Read stored preferences over the defaults. */
    function load() {
      settings = defaults()
      var raw = null
      try {
        raw = window.localStorage.getItem(STORAGE_KEY)
      } catch (error) {
        raw = null
      }
      if (!raw) return
      var parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        console.warn('[dsh-vim] ignoring malformed stored settings', error)
        return
      }
      if (!parsed || typeof parsed !== 'object') return
      var next = defaults()
      for (var field in next) {
        if (parsed[field] !== undefined) next[field] = parsed[field]
      }
      migrateArchiveSeat(parsed, next)
      for (var n = 0; n < NUMERIC_SEATS.length; n++) {
        var seat = NUMERIC_SEATS[n]
        next[seat] = clampNumber(next[seat], LIMITS[seat], DEFAULTS[seat])
      }
      if (PLACES.indexOf(next.palettePlace) < 0) next.palettePlace = DEFAULTS.palettePlace
      if (SEND_MODES.indexOf(next.sendMode) < 0) next.sendMode = DEFAULTS.sendMode
      // A stored value of anything other than `false` is "on": the shipped
      // default is on, so an absent or hand-edited value must not read as off.
      for (var b = 0; b < BOOL_SEATS.length; b++) {
        var seat = BOOL_SEATS[b]
        next[seat] = next[seat] !== false
      }
      next.favorites = sanitizeFavorites(next.favorites)
      settings = repairKeys(next)
      persist()
      announce()
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

    /**
     * Subscribe to preference changes.
     * @param {Function} watcher - called after every accepted change.
     * @returns {Function} unsubscriber.
     */
    function subscribe(watcher) {
      watchers.push(watcher)
      return function () {
        var i = watchers.indexOf(watcher)
        if (i >= 0) watchers.splice(i, 1)
      }
    }

    // ---------------------------------------------------------------------
    // scroll engine
    // ---------------------------------------------------------------------

    var state = { debug: false }

    /** Animation currently owning one container. */
    var anim = { el: null, current: 0, target: 0, raf: 0, last: 0, suppressed: false, behavior: '' }

    /** Auto-repeat for the held key; the OS repeat is deliberately ignored. */
    var hold = { key: '', dir: 0, timer: 0, interval: 0, el: null }

    /**
     * Where the pointer last was, in client coordinates.
     *
     * The pane being pointed at is the pane being read, so this is what
     * `pickScroller` consults first: hover the conversation and the scroll keys
     * work the transcript, hover the sidebar and they work the sidebar. `seen`
     * stays false until the first move, so a keyboard-only session keeps the
     * old focus-then-centre order, and a blur drops the point again because the
     * browser delivers no moves while another window is in front.
     */
    var pointer = { x: 0, y: 0, seen: false }

    /**
     * True when the element consumes printable characters itself.
     * @param {Element|null} node - candidate element.
     * @returns {boolean} whether keystrokes must pass through untouched.
     */
    function isEditable(node) {
      if (!node || node.nodeType !== 1) return false
      if (node.isContentEditable === true) return true
      var tag = node.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return typeof node.closest === 'function' && node.closest(RAW_INPUT_SELECTOR) !== null
    }

    /**
     * True when the element is a non-editable box that overflows vertically and
     * is allowed to scroll.
     * @param {Element|null} node - candidate element.
     * @returns {boolean} whether the element can scroll vertically.
     */
    function isScrollable(node) {
      if (!node || node.nodeType !== 1) return false
      if (isEditable(node)) return false
      if (node.scrollHeight - node.clientHeight <= 1) return false
      var overflow = getComputedStyle(node).overflowY
      return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay'
    }

    /**
     * Parent element, crossing shadow boundaries through the host node.
     * @param {Element} node - current element.
     * @returns {Element|null} ancestor element.
     */
    function parentOf(node) {
      if (node.parentElement) return node.parentElement
      var root = typeof node.getRootNode === 'function' ? node.getRootNode() : null
      return root && root.host ? root.host : null
    }

    /**
     * Nearest scrollable ancestor, inclusive.
     * @param {Element|null} node - starting element.
     * @returns {Element|null} scroll container, if any.
     */
    function scrollerFrom(node) {
      var cur = node
      while (cur && cur.nodeType === 1) {
        if (isScrollable(cur)) return cur
        cur = parentOf(cur)
      }
      return null
    }

    /** Largest visible scroll container; the last-resort target. */
    function largestScroller() {
      var best = null
      var bestSize = 0
      var nodes = document.querySelectorAll('*')
      for (var i = 0; i < nodes.length; i++) {
        if (!isScrollable(nodes[i])) continue
        var size = nodes[i].scrollHeight - nodes[i].clientHeight
        if (size > bestSize) {
          bestSize = size
          best = nodes[i]
        }
      }
      return best
    }

    /**
     * The topmost element at a point, when the document can be asked. A host
     * without hit-testing — or one that throws on it — simply has no pointer
     * rule, and the older heuristics decide.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {Element|null} the element there, or null.
     */
    function elementAt(x, y) {
      if (typeof document.elementFromPoint !== 'function') return null
      try {
        return document.elementFromPoint(x, y)
      } catch (error) {
        return null
      }
    }

    /**
     * Choose the container to scroll. Deterministic order: whatever sits under
     * the pointer (the pane the user is pointing at is the pane they mean),
     * then whatever holds focus, then whatever sits under the centre of the
     * viewport (the main content area), then the largest scroll container.
     *
     * The two later rules are not dead code: they carry a keyboard-only session
     * and any spot where the pointer rests on something that cannot scroll —
     * a pane header, a gap between panes — where falling back to the
     * conversation beats scrolling nothing at all.
     * @returns {Element|null} the element to scroll.
     */
    function pickScroller() {
      if (pointer.seen) {
        var fromPointer = scrollerFrom(elementAt(pointer.x, pointer.y))
        if (fromPointer) return fromPointer
      }
      var focused = document.activeElement
      if (focused && focused !== document.body && focused !== document.documentElement && !isEditable(focused)) {
        var fromFocus = scrollerFrom(focused)
        if (fromFocus) return fromFocus
      }
      if (typeof document.elementFromPoint === 'function') {
        var centre = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
        var fromCentre = scrollerFrom(centre)
        if (fromCentre) return fromCentre
      }
      return largestScroller()
    }

    /**
     * Whether the container still has room in the requested direction.
     * @param {Element} el - scroll container.
     * @param {number} dir - 1 for down, -1 for up.
     * @returns {boolean} whether it can move.
     */
    function canMove(el, dir) {
      var max = el.scrollHeight - el.clientHeight
      return dir > 0 ? el.scrollTop < max - 1 : el.scrollTop > 1
    }

    /**
     * Walk from the picked container up to the first one that can move. This is
     * what makes the end of a pane hand the gesture to its parent, like a wheel.
     * @param {Element|null} start - picked container.
     * @param {number} dir - 1 for down, -1 for up.
     * @returns {Element|null} the container that will actually move.
     */
    function resolveTarget(start, dir) {
      var cur = start
      while (cur && cur.nodeType === 1) {
        if (isScrollable(cur) && canMove(cur, dir)) return cur
        cur = parentOf(cur)
      }
      return null
    }

    /** Honour the OS "reduce motion" preference. */
    function reducedMotion() {
      return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    /**
     * Pin `scroll-behavior: auto` for the animated element. Without this, a
     * container styled with `scroll-behavior: smooth` would animate every
     * per-frame write and the result would stutter.
     * @param {Element} el - scroll container.
     */
    function suppressSmooth(el) {
      if (!el.style) return
      if (getComputedStyle(el).scrollBehavior !== 'smooth') return
      anim.suppressed = true
      anim.behavior = el.style.scrollBehavior || ''
      el.style.scrollBehavior = 'auto'
    }

    /** Stop the animation loop and restore anything it changed. */
    function stopAnim() {
      if (anim.raf) {
        window.cancelAnimationFrame(anim.raf)
        anim.raf = 0
      }
      if (anim.el && anim.suppressed && anim.el.style) anim.el.style.scrollBehavior = anim.behavior
      anim.el = null
      anim.suppressed = false
      anim.behavior = ''
      anim.last = 0
    }

    /**
     * One animation frame: ease `current` toward `target`, frame-rate
     * independent through `1 - exp(-dt / tau)`.
     * @param {number} ts - frame timestamp.
     */
    function frame(ts) {
      anim.raf = 0
      if (!anim.el || anim.el.isConnected === false) {
        stopAnim()
        return
      }
      var dt = anim.last ? Math.min(ts - anim.last, 64) : 16
      anim.last = ts
      var diff = anim.target - anim.current
      if (Math.abs(diff) < 0.5) {
        anim.el.scrollTop = anim.target
        stopAnim()
        return
      }
      anim.current += diff * (1 - Math.exp(-dt / Math.max(1, settings.tau)))
      anim.el.scrollTop = anim.current
      anim.raf = window.requestAnimationFrame(frame)
    }

    /**
     * Queue a scroll step. Resolves (or reuses) the container, extends the
     * animation target, and starts the loop when it is idle.
     * @param {number} delta - pixels to add to the target, signed.
     * @param {Element|null} pinned - container captured earlier in this hold.
     * @returns {Element|null} the container that will move, or null.
     */
    function push(delta, pinned) {
      var dir = delta > 0 ? 1 : -1
      var el = pinned && pinned.isConnected !== false && isScrollable(pinned) ? pinned : resolveTarget(pickScroller(), dir)
      if (!el) return null

      var max = el.scrollHeight - el.clientHeight
      if (reducedMotion()) {
        el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + delta))
        return el
      }

      if (anim.el !== el) {
        stopAnim()
        anim.el = el
        suppressSmooth(el)
        anim.current = el.scrollTop
        anim.target = el.scrollTop
      }
      anim.target = Math.max(0, Math.min(max, anim.target + delta))
      if (!anim.raf) {
        anim.last = 0
        anim.raf = window.requestAnimationFrame(frame)
      }
      return el
    }

    /** Cancel the held-key auto-repeat. */
    function stopHold() {
      if (hold.timer) {
        window.clearTimeout(hold.timer)
        hold.timer = 0
      }
      hold.key = ''
      hold.dir = 0
      hold.interval = 0
      hold.el = null
    }

    /** Auto-repeat tick: one more step, then schedule the next sooner. */
    function tickHold() {
      hold.timer = 0
      if (!hold.dir) return
      var el = push(hold.dir * settings.step, hold.el)
      if (!el) {
        stopHold()
        return
      }
      hold.el = el
      hold.interval = Math.max(MIN_REPEAT_INTERVAL, hold.interval - REPEAT_RAMP)
      hold.timer = window.setTimeout(tickHold, hold.interval)
    }

    /**
     * Start a hold: one immediate step, then our own accelerating repeat. The
     * operating system's repeat is ignored, which removes its initial delay and
     * its uneven burst rate.
     * @param {string} key - lower-cased key.
     * @param {number} dir - 1 for down, -1 for up.
     * @returns {boolean} whether anything is scrolling.
     */
    function startHold(key, dir) {
      stopHold()
      var el = push(dir * settings.step, null)
      if (!el) return false
      hold.key = key
      hold.dir = dir
      hold.el = el
      hold.interval = REPEAT_INTERVAL
      hold.timer = window.setTimeout(tickHold, settings.repeatDelay)
      return true
    }

    /**
     * Which direction a pressed key drives, if any.
     * @param {string} key - lower-cased key.
     * @returns {number|undefined} 1 for down, -1 for up, undefined when unbound.
     */
    function directionOf(key) {
      if (key === settings.downKey) return 1
      if (key === settings.upKey) return -1
      return undefined
    }

    /**
     * Capture-phase key handler. Runs before the app's own handlers so the
     * composer never sees an intercepted key, and bails out on anything the
     * user is typing into.
     *
     * The task window is modal: while it is open it owns every keystroke, and
     * the scroll engine stays suspended.
     * @param {KeyboardEvent} ev - keydown event.
     */
    function onKeyDown(ev) {
      if (ev.defaultPrevented) return
      // The composition guard comes first because a send must never be read out
      // of a key an IME is still assembling — Enter confirms a candidate there,
      // and taking the caret away mid-word would cost the user their input.
      if (ev.isComposing || ev.keyCode === 229) return
      // A key this plugin rewrote and handed to the box is not a key the user
      // pressed. It bubbles back up to this same capture listener, so ignoring
      // it here is what keeps a rewritten gesture from being read as a second,
      // separate keystroke — which would clear the double-Enter pair, or arm a
      // focus request nobody made.
      if (ev[REWRITTEN_FLAG]) return
      var key = ev.key ? ev.key.toLowerCase() : ''

      // Anything but a bare Enter in the message box ends the pair: the
      // double-Enter gesture is a rhythm, and a letter, a Shift+Enter or an
      // Enter aimed somewhere else in the middle of it means the user was not
      // confirming. Only the bare Enter the pair is made of leaves the stamp
      // alone, because that is the second half of it.
      if (key !== 'enter') doubleEnter.at = 0
      else if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || !inComposer(ev.target)) doubleEnter.at = 0

      // A send ends the message, and with it the claim on the keyboard. This is
      // asked before the chord bail-out below, which would otherwise hide
      // Ctrl/Cmd+Enter — the host's own send key.
      if (onSendKey(ev, key)) {
        doubleEnter.at = 0
        clearFocusRequest()
        handBackAfterSend()
        // The key is still the host's to send with; nothing below has anything
        // to say about it. Falling through to the editable yield instead would
        // re-arm the very request this send has just spent, and that request is
        // the licence the caret needs to stay in the box.
        return
      }

      if (ev.ctrlKey || ev.altKey || ev.metaKey) return

      // The model window is the innermost of this plugin's windows: it can be
      // opened from the conversation, from the task window, or from the board's
      // new-conversation sheet, and each of those would otherwise answer first
      // and take the keys the window is drawing with. So it is answered here,
      // before every other surface: Escape is its own, the model key confirms
      // (the same meaning it has wherever the window is up), and the movement,
      // level and reorder keys are the task window's own.
      if (MODELPICK.open) {
        if (key !== '' && key === settings.modelKey) {
          ev.preventDefault()
          if (!ev.repeat) confirmModelPick()
          return
        }
        if (modelPickKeyDown(ev, key)) {
          ev.preventDefault()
          return
        }
        // Anything it does not claim is swallowed rather than passed on: like
        // the task window, the point of being modal is that a press cannot do
        // two things at once.
        return
      }

      // The sheet owns Escape and the board's own key while it is up. Its
      // fields answer Escape themselves and stop it there; this is for a press
      // that landed on the sheet's buttons instead, and for the page mount,
      // which has no overlay branch to fall through.
      if (BOARD.newSessionHost && !isEditable(ev.target)) {
        if (key === 'escape') {
          ev.preventDefault()
          ev.stopPropagation()
          closeNewSessionSheet()
          return
        }
        if (key === settings.boardKey) {
          ev.preventDefault()
          ev.stopPropagation()
          return
        }
        // The page's two model seats act on the conversation behind the board,
        // and this sheet is a form in front of it: a stray `w` must not change
        // what that conversation runs on, and the sheet has a row of its own for
        // the question it would ask.
        if (key === settings.modelKey || key === settings.effortKey) {
          ev.preventDefault()
          ev.stopPropagation()
          return
        }
      }

      // The board as a page is not a window: it owns no keys of its own beyond
      // the one that goes back to the conversation, and everything the page
      // answers to keeps working. A gesture in progress is the exception — a
      // drag is the gesture's while it is up.
      if (BOARD.open && BOARD.mode === 'page') {
        if (BOARD.drag) {
          if (key === 'escape') {
            ev.preventDefault()
            ev.stopPropagation()
            cancelBoardDrag()
          } else {
            ev.stopPropagation()
          }
          return
        }
        if (key === settings.boardKey) {
          ev.preventDefault()
          toggleBoard()
          return
        }
      }

      // The floating board answers before the page does. It is a pointer window,
      // so everything the page owns — the reasoning key, the model window, the
      // task window, the focus key — must not act on what the board is standing
      // in front of. Two keys are its own: its own key puts it away, and Escape
      // is the way out every window in this plugin has. A scroll key is let
      // through, because the canvas is an ordinary scroller and reading it is
      // the only thing the keyboard can usefully do here.
      if (BOARD.open && BOARD.mode === 'overlay') {
        // The name box is the plugin's own field, so the keyboard is its while it
        // is being typed into: Enter keeps the name, Escape throws it away, and
        // neither may be read as a key of the window.
        if (isEditable(ev.target)) return
        // Escape is the one way out of a gesture, and it is the gesture's while
        // one is in progress: dropping a card is an easier mistake to make than
        // closing a window by accident.
        if (BOARD.drag) {
          if (key === 'escape') {
            ev.preventDefault()
            ev.stopPropagation()
            cancelBoardDrag()
          } else {
            ev.stopPropagation()
          }
          return
        }
        if (key === settings.boardKey) {
          ev.preventDefault()
          closeBoard()
          return
        }
        if (key === 'escape') {
          ev.preventDefault()
          ev.stopPropagation()
          closeBoard()
          return
        }
        var columnAhead = directionOf(key)
        if (columnAhead === undefined || key === settings.paletteKey) {
          // A stray letter must not reach the page behind the board, and the
          // task window's own key must not open a second overlay over it.
          ev.stopPropagation()
          return
        }
        if (ev.repeat) {
          if (hold.key === key) ev.preventDefault()
          return
        }
        if (!startHold(key, columnAhead)) return
        ev.preventDefault()
        return
      }

      // The reasoning key and the model key belong to the page, not to a window:
      // they act on the conversation on screen, so they keep working with the
      // task window open. They are answered before every other branch, and only
      // when the caret is not in a field — there they are plain letters.
      // Auto-repeat is swallowed for both: a handful of levels and a short model
      // list are not something a held key should stream through.
      //
      // The one window the reasoning key hands over to is the model picker. That
      // window draws the levels and marks the one in effect, so a press that
      // changed the level behind it would leave the mark lying. Rather than
      // swallowing it — a key that does nothing quietly is the worst kind — it
      // is routed into the window below, where it means the same thing it means
      // everywhere else: one level further.
      if (key !== '' && key === settings.effortKey && !isEditable(ev.target) && !MODELPICK.open) {
        ev.preventDefault()
        if (!ev.repeat) cycleEffort()
        return
      }

      // The model key sits beside the reasoning key because it is the same kind
      // of seat with one thing to move: a key of the page rather than of a
      // window, a plain letter inside a field, and no auto-repeat — a held key
      // must not open a second window behind the first.
      //
      // Where the reasoning key walks, this one opens a picker: the list is
      // chosen from, not stepped through, and a window is the only seat that can
      // say which model is in effect before you move. While that window is up
      // the key confirms instead, and the window's own branch above answers it
      // before this one is reached.
      if (key !== '' && key === settings.modelKey && !isEditable(ev.target)) {
        ev.preventDefault()
        if (!ev.repeat) openModelPick()
        return
      }

      if (PALETTE.open) {
        // The window owns the keyboard while it is open, the scroll keys
        // included — wherever the pointer happens to be parked, `f`, `d`, `d`,
        // `f` picks a conversation, so the result of a press never depends on
        // where the mouse was left.
        //
        // The one key it lets through is a scroll key it does not claim itself:
        // move its own up/down keys onto something else (j/k, say) and `d`/`e`
        // go back to reading the conversation behind the window. Everything
        // else stays the window's — a stray letter must not reach the page.
        if (paletteKeyDown(ev, key)) {
          ev.preventDefault()
          return
        }
        if (directionOf(key) === undefined) return
      }

      var focusKey = key !== '' && key === settings.focusKey

      // Enter in the message box, before the editable yield below. Everything
      // reaching here is a bare Enter: a Ctrl/Alt/Meta chord returns at the top
      // (Ctrl/Cmd+Enter is the host's own send accelerator and must stay one),
      // Shift+Enter is already the host's line break, and a composing key
      // returns earlier still.
      if (key === 'enter' && !ev.shiftKey && settings.sendMode !== 'host' && inComposer(ev.target)) {
        // A suggestion menu arbitrates Enter after us: while one is open, the
        // key is how a candidate gets accepted, and taking it here would turn
        // "pick /plan" into a line break. Yield, and the menu keeps its key.
        if (!menuOpen()) {
          // The double-Enter mode: the first press breaks the line like any
          // other, and only a second press inside the window sends. The
          // confirmation is a gesture, not a key to remember.
          if (settings.sendMode === 'double') {
            ev.stopPropagation()
            if (doubleEnterSends(ev)) {
              // The line break the first press inserted stays in the draft. The
              // host trims it on send; if a build ever does not, the cost is one
              // trailing blank line, never a lost character.
              ev.preventDefault()
              sendFromComposer()
              // The rewritten key may re-enter this same handler as a chord and
              // hand the keyboard back there; doing it here as well means the
              // gesture does not depend on that, and a second hand-back is a
              // no-op because each probe retires the one before it.
              if (settings.sendBlurs) {
                clearFocusRequest()
                handBackAfterSend()
              }
            } else breakLine(ev)
            return
          }
          ev.stopPropagation()
          if (settings.sendMode === 'newline') breakLine(ev)
          else ev.preventDefault()
        }
        return
      }

      // The focus key pressed again inside the box it filled: an empty box is a
      // place to pass through, so the key hands the keyboard back instead of
      // typing a Space into a message nobody started. Asked before the editable
      // yield below, which is otherwise where a key aimed at the box dies. A
      // repeat is not a second press, and holding the key must not toggle the
      // box in and out.
      if (focusKey && !ev.repeat && leaveEmptyComposer()) {
        // A traced line, because this is the one key path that makes a Space
        // disappear and moves the caret out of the box: if something odd follows
        // a Space, the console should say whether it was this.
        if (state.debug) console.log('[dsh-vim] focus key: handed the empty box back')
        ev.preventDefault()
        return
      }

      if (isEditable(ev.target)) {
        // Typing is the user's own focus request: the host may hand the caret
        // back while they work, and that must not read as stealing it.
        noteFocusRequest()
        return
      }

      // Tabbing is how the keyboard reaches a field; the focus it lands on is
      // the user's doing, however long it takes to arrive.
      if (key === 'tab') noteFocusRequest()

      // The board is a page key: it opens the second window and nothing else.
      // Asked after the task window's key so that a store which somehow holds
      // the same letter on both seats keeps opening the window it always did —
      // `repairKeys` is what stops such a store from existing.
      if (key && key === settings.boardKey) {
        if (toggleBoard()) ev.preventDefault()
        return
      }

      if (key && key === settings.paletteKey) {
        if (openPalette()) ev.preventDefault()
        return
      }

      // The note key opens the board on the conversation on screen with its
      // note field already waiting. It is asked after both windows so that
      // whichever is up keeps the keyboard, and never on auto-repeat — a held
      // key is not a second thought.
      if (key && key === settings.noteKey) {
        if (!ev.repeat && openNote()) ev.preventDefault()
        return
      }

      // The pin key is the way onto the board from the conversation itself. It
      // is asked after both windows, so whichever is up keeps the keyboard —
      // inside the task window it acts on the selected row instead.
      if (key && key === settings.pinKey) {
        if (!ev.repeat && pinToBoard()) ev.preventDefault()
        return
      }

      if (focusKey) {
        // A bare Space belongs to a focused control first: that is how a button
        // is pressed from the keyboard, and the plugin must not take it away.
        if (isActivating(ev.target)) return
        // A held key is not a second press: re-filling the box on every repeat
        // would fight the press that just left it, and the page must not start
        // scrolling under the key either. Repeats aimed at a box that kept its
        // focus are answered above, as characters, so nothing types differently.
        if (ev.repeat) {
          ev.preventDefault()
          return
        }
        if (focusComposer()) {
          if (state.debug) console.log('[dsh-vim] focus key: caret put in the box')
          ev.preventDefault()
        }
        return
      }

      var dir = directionOf(key)
      if (dir === undefined) return
      if (ev.repeat) {
        if (hold.key === key) ev.preventDefault()
        return
      }
      if (!startHold(key, dir)) return
      ev.preventDefault()
      if (state.debug) console.log('[dsh-vim]', key, dir * settings.step, anim.el)
    }

    /** Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. */
    function onKeyUp() {
      stopHold()
    }

    /**
     * Escape leaves a focused composer, so the scroll keys come back.
     *
     * The scroll keys are withheld from every editable element, which is right
     * while typing but leaves the whole plugin dead whenever the composer holds
     * focus. The shell's own Escape handling closes popups and arbitrates a run
     * stop, but never gives focus back, so the key is otherwise unclaimed.
     *
     * A turn in flight is the exception, and the important one. The shell stops
     * a running turn on Escape, and it does so without marking the event
     * handled, so the yield above cannot see it. Blurring here would mean one
     * keystroke destroys work the user never asked to stop. So while the
     * conversation on screen is running, Escape belongs to the shell and this
     * handler does nothing at all. That costs the user nothing in practice:
     * arriving via the task window already leaves focus out of the composer, so
     * Escape is not how they get unstuck.
     *
     * Listens in the bubble phase, after the composer has had its turn, and
     * yields whenever the shell marked the event handled. It blurs without
     * preventing anything, so a host gesture on the same Escape still runs.
     * @param {Event} ev - the keydown, after the shell's own handlers.
     */
    function onEscapeBlur(ev) {
      if (!settings.escapeBlurs) return
      if (ev.key !== 'Escape' || ev.defaultPrevented) return
      if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return
      // Either window already answered this Escape in the capture phase, and
      // blurring behind an open window would move the caret for no reason.
      if (PALETTE.open || MODELPICK.open || BOARD.open) return
      var active = document.activeElement
      if (!isEditable(active)) return
      if (currentSessionRunning()) return
      if (typeof active.blur === 'function') active.blur()
    }

    /**
     * Remember where the pointer is.
     *
     * Recording a position is all this does: nothing scrolls until a scroll key
     * is pressed, so the listener costs a pointer session nothing it was not
     * already paying. A hold is the one thing that reacts here — moving onto
     * another pane mid-repeat hands the rest of the burst over, so a burst never
     * keeps scrolling a pane the pointer has left. A failed re-pick (the pointer
     * came to rest where nothing can move) leaves the current target alone; the
     * burst is not cut short by a stray crossing.
     * @param {PointerEvent} ev - pointermove event.
     */
    function onPointerMove(ev) {
      var x = Number(ev.clientX)
      var y = Number(ev.clientY)
      if (!isFinite(x) || !isFinite(y)) return
      pointer.x = x
      pointer.y = y
      pointer.seen = true
      if (hold.dir) {
        var el = resolveTarget(pickScroller(), hold.dir)
        if (el) hold.el = el
      }
    }

    /**
     * Forget the remembered pointer, so the focus and centre rules decide again.
     *
     * Called when the window loses focus: the browser delivers no moves while
     * another window is in front, so a point kept across a blur can be stale,
     * and acting on it would scroll a pane the user is no longer pointing at.
     * The next move restores the pointer rule on its own.
     */
    function forgetPointer() {
      pointer.seen = false
    }

    /** The user took over with the wheel or a touch: abandon our animation. */
    function onUserScroll() {
      if (!anim.el) return
      stopAnim()
    }

    /**
     * Losing the window or the tab must not leave a hold or a stale pointer
     * behind. The task window is deliberately not part of this: it stays up
     * until Escape or a switch takes it away, so reading the page behind it,
     * alt-tabbing away and coming back all leave it where it was.
     *
     * The user's own request for the keyboard is dropped as well: it was made
     * for the page the user was on before they left, and a request kept across
     * a trip to another window would licence a focus nobody asked for now. What
     * the return itself gets is `noteFocusReturn` at the level of the page.
     */
    function onFocusLoss() {
      stopHold()
      forgetPointer()
      clearFocusRequest()
    }

    // ---------------------------------------------------------------------
    // task window
    // ---------------------------------------------------------------------

    /** The client root context, kept for the two services below. */
    var taskCtx = null

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
       * A press settled the open field's words without painting them. The
       * paint is owed by whoever ends that press: it is what lets a press
       * keep the elements it aims at alive for the click that follows it.
       */
      paintOwed: false,
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
      inbox: [],
      /** Every conversation drawn on this repaint, block by block. */
      rows: [],
      /** The conversation card elements of this repaint, in draw order. */
      nodes: [],
      /** The loose card elements of this repaint, by card id, for measuring lines. */
      looseNodes: Object.create(null),
      /** The goal the pointer is standing in while a card is carried, or null. */
      dropGoal: null,
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
      /**
       * The status fingerprint of this repaint: one word per card, in draw
       * order. The status feed can tick without anything on screen changing
       * shape; this is what tells a tick worth a repaint from one that is not.
       */
      statuses: '',
      unsubscribes: [],
    }

    /**
     * The turn counts this plugin has read out of the shell.
     *
     * A count cannot be asked for casually: the number lives behind a session
     * scope the shell has to open to answer, so asking costs a retain and
     * releasing it later. Keeping what we have already read is what lets a row
     * show its count without opening every conversation on the list again.
     *
     * Everything about that — what has been read, what is still owed, what is
     * out being asked for — lives here, so no caller of a count has to know any
     * of it is happening. Read through `count()`, `take()`, and `release()`.
     *
     * A count is held against the moment the conversation was last touched, so
     * a row that has moved on since is asked for again rather than shown stale.
     */
    var TURNS = makeTurnPeek()

    /**
     * The turn counts the board has read, kept apart from the task window's.
     *
     * Separate on purpose: the two windows hold their counts against different
     * moments, and closing one must not drop what the other is still owed. It
     * is the same ledger object — what is shared is the machinery, not the
     * numbers.
     */
    var BOARD_TURNS = makeTurnPeek()

    /**
     * The ledger behind `TURNS`, and the only thing that touches it.
     *
     * `read of(id)` answers what we know; `take(summary)` queues one we do not
     * and starts what the budget allows; `release()` drops everything owed,
     * which is what closing the window has to do — a peek landing later would
     * repaint a list that is gone, and would leave conversations held open on
     * behalf of a window nobody is looking at.
     *
     * @returns {object} the ledger.
     */
    function makeTurnPeek() {
      /** id -> { updatedAt, turns } — what has been read, however long ago. */
      var values = Object.create(null)
      /** id -> true | cancel() — what is out being asked for. */
      var inflight = Object.create(null)
      /** Rows we still owe a count, in the order they were asked for. */
      var queue = []
      /** How many asks are out at once, against PEEK_CONCURRENCY. */
      var active = 0

      return {
        /**
         * The count already read for a conversation, or none.
         *
         * None is also the answer for a count that has gone stale: a row that
         * moved on since is owed a fresh read, and saying we have nothing is
         * what asks for one.
         */
        read(summary) {
          var hit = values[summary.id]
          if (!hit || hit.updatedAt !== summary.updatedAt) return null
          return hit.turns
        },
        /** Whether this conversation is already out being asked about. */
        pending(id) {
          return !!inflight[id]
        },
        /** Start as many queued asks as the concurrency budget allows. */
        drain(take, paint) {
          while (active < PEEK_CONCURRENCY && queue.length) {
            var summary = queue.shift()
            if (this.read(summary) !== null) {
              delete inflight[summary.id]
              continue
            }
            active++
            take(summary, this, {
              settle: (id, turns, updatedAt) => {
                if (typeof turns === 'number') values[id] = { updatedAt: updatedAt, turns: turns }
              },
              clear: (id) => {
                delete inflight[id]
              },
              done: () => {
                active--
              },
              // What to repaint when the answer lands. The ledger is shared by
              // the two windows, so which window to redraw is the caller's
              // fact, not the ledger's — a count that arrived for the task
              // window must not repaint a board that is not even up.
              paint: paint,
            })
          }
        },
        /** Queue one row we owe a count for, unless we already have it. */
        owe(summary) {
          inflight[summary.id] = true
          queue.push(summary)
        },
        /** Mark one ask as cancellable once the host has been reached. */
        watch(id, cancel) {
          inflight[id] = cancel
        },
        /** Drop every queued and in-flight ask. */
        release() {
          queue.length = 0
          for (var id in inflight) {
            if (!Object.prototype.hasOwnProperty.call(inflight, id)) continue
            var cancel = inflight[id]
            if (typeof cancel === 'function') cancel()
            else delete inflight[id]
          }
          active = 0
        },
      }
    }

    /**
     * When the turn in flight in each conversation was seen to start.
     *
     * The shell publishes no start time: a status entry is `{ running,
     * pendingInteraction, completionUnread }` and a session summary carries no
     * stamp at all, so "how long has this been going?" can only come from
     * watching the transitions. That is also why the watch runs for the life of
     * the page rather than only while the window is open — a stamp taken when
     * the user presses the key would show a ten-minute turn as if it had just
     * begun.
     *
     * A turn that was already in flight when the watch arrived keeps no stamp of
     * its own — but the page it arrives on may have left one behind (see
     * `RUNS_KEY`), and a turn that survived a reload is the same turn: the host
     * keeps running it while the client is rebuilt around it. Adopting that
     * stamp is not inventing a clock, it is reading back the one this plugin
     * already took. With no stamp to read back, the row shows the plain status
     * until the next turn starts, which is the honest answer.
     */
    var RUNS = makeRunLedger()

    /**
     * The stage of each conversation, as this plugin's own idea of it.
     *
     * This is the stage module proper, and it is deliberately self-contained:
     * it holds `id -> phase` (one of PHASES), persists it, and answers reads.
     * It knows nothing of where a stage came from and nothing of the chip that
     * shows it. A SOURCE writes a stage in (today the only source is a hand
     * press, see the window's stage key and the chip click; a goal projection
     * or an agent-written mark could be added later as another source without
     * touching this ledger), and the chip reads one out — the two never meet.
     *
     * Persisted under PHASES_KEY so a stage survives a page reload, a plugin
     * reload, and a renderer restart, the same promise the run clock keeps.
     */
    var PHASES_MODEL = makePhaseLedger()

    /**
     * The ledger behind `PHASES_MODEL`, and the only thing that touches the
     * store. Read through `get`, write through `set`, `cycle`, and `clear`;
     * `load()` reads the previous page's map back once per activation.
     *
     * A value outside PHASES is treated as no stage: a hand-edited store, or a
     * vocabulary that shrank between versions, can never make a row show a
     * stage this build does not know how to label.
     * @returns {object} the ledger.
     */
    function makePhaseLedger() {
      /** id -> phase; only PHASES members are ever stored. */
      var map = Object.create(null)
      /** The last serialized map written, so an unchanged one is not rewritten. */
      var written = ''

      /** Write the map back; a storage failure is not fatal. */
      function persist() {
        var serialized = JSON.stringify(map)
        if (serialized === written) return
        written = serialized
        try {
          window.localStorage.setItem(PHASES_KEY, serialized)
        } catch (error) {
          console.warn('[dsh-vim] could not persist stages', error)
        }
      }

      return {
        /**
         * The stage of one conversation, or '' when none is marked.
         * @param {string} id - session id.
         * @returns {string} a PHASES member, or '' for idle.
         */
        get(id) {
          if (!id) return ''
          var value = map[id]
          return PHASES.indexOf(value) >= 0 ? value : ''
        },
        /**
         * Set one conversation's stage. A value outside PHASES clears it, so a
         * source can pass '' or 'idle' to mean "no stage".
         * @param {string} id - session id.
         * @param {string} phase - a PHASES member, or anything else to clear.
         * @returns {string} the stage now in effect ('' when cleared).
         */
        set(id, phase) {
          if (!id) return ''
          if (PHASES.indexOf(phase) < 0) {
            if (map[id] !== undefined) {
              delete map[id]
              persist()
            }
            return ''
          }
          if (map[id] !== phase) {
            map[id] = phase
            persist()
          }
          return phase
        },
        /**
         * Advance one conversation to the next stage in the cycle. Off the last
         * member it lands on idle (cleared); off idle it lands on the first.
         * @param {string} id - session id.
         * @returns {string} the stage now in effect ('' when it cycled to idle).
         */
        cycle(id) {
          if (!id) return ''
          var current = this.get(id)
          var at = PHASES.indexOf(current)
          // -1 (idle) -> 0; last -> length (one past the end) -> idle.
          var nextAt = at + 1
          return this.set(id, nextAt >= PHASES.length ? '' : PHASES[nextAt])
        },
        /** Drop one conversation's stage. */
        clear(id) {
          return this.set(id, '')
        },
        /** The whole map as a plain object, for the debug surface. */
        all() {
          var out = {}
          for (var id in map) {
            if (Object.prototype.hasOwnProperty.call(map, id)) out[id] = map[id]
          }
          return out
        },
        /** Drop every stage (debug reset). */
        reset() {
          map = Object.create(null)
          persist()
        },
        /** Read the previous page's map back, keeping only known PHASES. */
        load() {
          var parsed = null
          try {
            var raw = window.localStorage.getItem(PHASES_KEY)
            parsed = raw ? JSON.parse(raw) : null
          } catch (error) {
            parsed = null
          }
          map = Object.create(null)
          if (parsed && typeof parsed === 'object') {
            for (var id in parsed) {
              if (!Object.prototype.hasOwnProperty.call(parsed, id)) continue
              if (PHASES.indexOf(parsed[id]) >= 0) map[id] = parsed[id]
            }
          }
          written = ''
          persist()
        },
      }
    }

    /**
     * The ledger behind `RUNS`, and the only thing that touches it.
     *
     * Keeping it here means every question about a running turn is answered in
     * one voice: `since(id)` for when one started, `note(id, live)` when the
     * status feed disagrees with what we last heard, and `forget()` when the
     * page lets go of the whole thing. The watch is ours to arm and to drop, so
     * nothing outside has to know there is a subscription in here at all.
     *
     * @returns {object} the ledger.
     */
    function makeRunLedger() {
      /** id -> { live, since }; `since` is 0 until a start is seen. */
      var seen = Object.create(null)
      /** Stamps left behind by an earlier page, read once per activation. */
      var stored = Object.create(null)
      /** When this page's ledger was read; stamps are only adopted while fresh. */
      var loadedAt = 0
      /** The last map written, so an unchanged one is not rewritten. */
      var written = ''
      /** Tear-down for the always-on status watch, or null while unwatched. */
      var off = null

      /** Write the ledger back, so the next page can pick it up where this one left it. */
      function persist() {
        var serialized = JSON.stringify(stored)
        if (serialized === written) return
        written = serialized
        try {
          window.localStorage.setItem(RUNS_KEY, serialized)
        } catch (error) {
          console.warn('[dsh-vim] could not persist the run ledger', error)
        }
      }

      return {
        /** The watch is already armed; arming it twice would answer every change twice. */
        watching() {
          return !!off
        },
        arm(stop) {
          off = stop
        },
        /**
         * Fold one status entry in.
         *
         * Only a transition into flight is stamped, so a stamp always means
         * "the turn started here". A conversation first met already in flight
         * adopts the stamp an earlier page left, when this page is young enough
         * for that to still be the same turn; with nothing to adopt the start
         * stays unknown, and saying so by showing no clock beats a wrong one.
         */
        note(id, live) {
          if (!id) return
          var entry = seen[id]
          if (!entry) {
            seen[id] = { live: !!live, since: live ? this.adopt(id) : 0 }
            if (!live) this.drop(id)
            return
          }
          if (live === entry.live) return
          entry.live = live
          entry.since = live ? Date.now() : 0
          if (live) this.keep(id, entry.since)
          else this.drop(id)
        },
        /** Fold the whole status snapshot in, letting go of what it no longer carries. */
        sync(status, liveOf) {
          var snapshot = null
          try {
            snapshot = status.getSnapshot()
          } catch (error) {
            return
          }
          if (!snapshot || typeof snapshot.forEach !== 'function') return
          var present = Object.create(null)
          snapshot.forEach(function (entry, id) {
            present[id] = true
            this.note(id, liveOf(entry))
          }, this)
          this.release(function (id) {
            return !present[id]
          })
        },
        /** Read the stamps the previous page left, dropping ones too old to be this turn. */
        load() {
          var parsed = null
          try {
            var raw = window.localStorage.getItem(RUNS_KEY)
            parsed = raw ? JSON.parse(raw) : null
          } catch (error) {
            parsed = null
          }
          stored = Object.create(null)
          if (parsed && typeof parsed === 'object') {
            var now = Date.now()
            for (var id in parsed) {
              if (!Object.prototype.hasOwnProperty.call(parsed, id)) continue
              var since = Number(parsed[id])
              if (!isFinite(since) || since <= 0) continue
              if (now - since > RUN_STAMP_MAX_AGE_MS) continue
              stored[id] = since
            }
          }
          written = ''
          loadedAt = Date.now()
          persist()
        },
        /** A turn in flight in one conversation, as of `since`. */
        keep(id, since) {
          if (stored[id] === since) return
          stored[id] = since
          persist()
        },
        /** No turn in flight in one conversation any more. */
        drop(id) {
          if (stored[id] === undefined) return
          delete stored[id]
          persist()
        },
        /** The stamp an earlier page left for this conversation, if it could be this turn. */
        adopt(id) {
          var since = stored[id]
          if (!since) return 0
          var now = Date.now()
          if (now - loadedAt > RUN_ADOPT_WINDOW_MS) return 0
          return now - since > RUN_STAMP_MAX_AGE_MS ? 0 : since
        },
        /** When the turn in flight in one conversation was seen to start. */
        since(id) {
          var entry = seen[id]
          return entry && entry.live && entry.since ? entry.since : 0
        },
        /** Let go of every conversation the status source no longer carries. */
        release(gone) {
          for (var id in seen) {
            if (!Object.prototype.hasOwnProperty.call(seen, id)) continue
            if (!gone(id)) continue
            delete seen[id]
            this.drop(id)
          }
        },
        /** Stop watching, and forget every stamp this page took. */
        forget() {
          if (off) {
            try {
              off()
            } catch (error) {
              /* the host is going away; nothing left to unsubscribe from */
            }
            off = null
          }
          seen = Object.create(null)
        },
      }
    }

    /**
     * Where the run ledger survives a page load.
     *
     * The client can be rebuilt (a refresh, a plugin reload, the app restarting
     * the renderer) while the host keeps the turn running, and a clock that
     * silently restarts at zero on every reload answers "how long has this been
     * going?" with a wrong number. So the stamps live in storage next to the
     * settings — only for sessions a turn is actually in flight in, so the entry
     * is also a note that says "this turn was running the last time we looked".
     */
    var RUNS_KEY = 'dsh-vim/runs/v1'

    /**
     * A stamp older than this is not adopted.
     *
     * Storage can only say "a turn in this conversation was running when this
     * page last looked". If the client was away long enough for that turn to end
     * and another to start — a page closed for the night, the host finishing the
     * first turn and someone starting a second from another client — the stamp
     * belongs to the wrong turn, and using it would show hours that never
     * happened. The cap is generous enough for any turn worth watching and small
     * enough that yesterday's cannot be mistaken for today's.
     */
    var RUN_STAMP_MAX_AGE_MS = 12 * 60 * 60 * 1000

    /**
     * How long after a page loads a stored stamp still counts as its own.
     *
     * The stamp is only there to bridge a rebuild: the page goes away and comes
     * back within moments while the host keeps the turn running. A page that has
     * been up for minutes is a different case — a conversation it has not met
     * before, starting a turn now, is not the turn that stamp was taken for, and
     * the clock would show time that never passed. The window covers a slow
     * connection publishing the first status snapshot; nothing else needs it.
     */
    var RUN_ADOPT_WINDOW_MS = 60 * 1000

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
    var CHAR_NEWLINE = String.fromCharCode(10)

    var NOTE_PAPER = {
      // Opaque, and one shade: a card has to hide what is under it, or a pile on
      // the canvas reads as two half-transparent sheets instead of a pile.
      background: BOARD_INK.note,
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
      historyDayOpen: {
        background: BOARD_INK.column,
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
      historyDayMeta: {
        fontSize: '0.76em',
        lineHeight: '1.4',
        color: BOARD_INK.dim,
      },
      historyDetail: {
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        padding: '6px 8px 8px 10px',
        borderTop: '1px solid ' + BOARD_INK.noteEdge,
      },
      historyGoal: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      },
      historyGoalHead: {
        fontSize: '0.8em',
        lineHeight: '1.4',
        color: BOARD_INK.text,
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
      historyStatus: {
        color: BOARD_INK.dim,
        fontSize: '0.92em',
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
        background: BOARD_INK.column,
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
        background: BOARD_INK.card,
        border: '1px solid ' + BOARD_INK.cardEdge,
        // The card is a way in, so the pointer says so. Carrying it still works
        // from anywhere on it - the press and the first four pixels decide
        // which of the two the gesture is - and the carried copy takes the
        // grabbing cursor while it is in the air.
        cursor: 'pointer',
        userSelect: 'none',
      },
      cardTitle: {
        display: '-webkit-box',
        WebkitLineClamp: '2',
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        fontSize: '1em',
        fontWeight: '500',
        lineHeight: '1.4',
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
       * The count and the marks, right after the state they belong to.
       *
       * They used to sit at the far end of the line, which put them under the
       * band a carried note opens on the card's right side - the one place a
       * hand is aiming at. Read left to right, the state and its marks are one
       * sentence; nothing on this line needs the far edge.
       */
      cardTail: { display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' },
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
      /** The turn count. */
      cardBadge: {
        flex: '0 0 auto',
        padding: '1px 7px',
        borderRadius: '999px',
        fontSize: '0.9em',
        color: BOARD_INK.accent,
        background: BOARD_INK.accentSoft,
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
        opacity: '0.96',
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
       * The mark that opens the name field.
       *
       * It stands over the end of the name's first line and takes no width: the
       * card's own columns are spoken for (the state row yields its clock before
       * anything else), so a mark in the flow would charge every card a slice of
       * its facts for a word most cards never use. `.dshv-rename` is what
       * brings it up on hover; until then it is not there to press.
       *
       * A word rather than a pencil: the card already carries a pencil-shaped
       * note mark, and two pencils doing different things on one card is exactly
       * the ambiguity this design is trying to remove.
       */
      cardRenameOpen: {
        position: 'absolute',
        top: '0',
        right: '0',
        padding: '0 4px',
        borderRadius: '4px',
        fontSize: '0.78em',
        lineHeight: '1.6',
        color: BOARD_INK.dim,
        background: BOARD_INK.card,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
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
      /** The × that takes a card off the board. Quiet, and never the whole card. */
      cardRemove: {
        flex: '0 0 auto',
        padding: '0 2px',
        fontSize: '1.1em',
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
        background: BOARD_INK.note,
        borderColor: BOARD_INK.noteEdge,
        // The spine is half of what makes a note look like a note: without it the
        // paper alone reads as a faint tint next to a neutral card.
        borderLeft: '3px solid ' + BOARD_INK.noteSpine,
      },
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
        minHeight: '1.65em',
        maxHeight: '240px',
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
     * One host service, however this context publishes it. These two are read
     * with `ctx.get` on purpose rather than declared in `inject`: a host
     * without them must lose the task window only, never the scrolling engine.
     * @param {object} ctx - client root context.
     * @param {string} name - service name.
     * @returns {object|null} the service, or null when it is absent.
     */
    function serviceOf(ctx, name) {
      if (!ctx) return null
      try {
        var value = typeof ctx.get === 'function' ? ctx.get(name) : null
        if (value) return value
      } catch (error) {
        /* unknown service name */
      }
      return ctx[name] || null
    }

    /**
     * The session feed, the workspace registry, and the workspace navigator.
     * The first and last are required; the registry is optional, because a host
     * that does not publish it should still get a task window — just one with no
     * archive filter and no folder on its rows. Resolved once per activation, so
     * an absent host costs one probe rather than one probe per keypress.
     * @returns {{list: object, nav: object, controller: object, workspaces: object|null, status: object|null}|null}
     */
    function taskServices() {
      if (taskServices.cache === undefined) {
        taskServices.cache = null
        var sessions = serviceOf(taskCtx, 'sessions')
        var nav = serviceOf(taskCtx, 'uiWorkspace')
        var workspaces = serviceOf(taskCtx, 'workspaces')
        var uiSession = serviceOf(taskCtx, 'uiSession')
        var list = sessions && sessions.list
        var registry = workspaces && workspaces.list
        if (list && typeof list.getSnapshot === 'function' && nav && typeof nav.openSession === 'function') {
          taskServices.cache = {
            list: list,
            nav: nav,
            controller: sessions,
            workspaces: registry && typeof registry.getSnapshot === 'function' ? registry : null,
            status: (uiSession && uiSession.sessionStatus) || null,
          }
        } else if (state.debug) {
          console.warn('[dsh-vim] task window unavailable', { sessions: !!list, nav: !!nav })
        }
      }
      return taskServices.cache
    }

    /**
     * The shell's unified status entry for one conversation, if it publishes one.
     * @param {string} id - session id.
     * @returns {object|null} { running, pendingInteraction, completionUnread }.
     */
    function statusFor(id) {
      var services = taskServices()
      if (!services || !services.status) return null
      try {
        var snapshot = services.status.getSnapshot()
        return snapshot && typeof snapshot.get === 'function' ? snapshot.get(id) : null
      } catch (error) {
        return null
      }
    }

    /**
     * The conversation on screen, as the shell's own shortcuts see it: the one
     * row the main view still retains. The reasoning key needs the same answer
     * the status badge needs, so both read it here.
     * @returns {object|null} the catalogue row, or null when nothing is open.
     */
    function currentSession() {
      var services = taskServices()
      if (!services) return null
      var list = services.list.getSnapshot()
      var byId = list && list.byId
      if (!byId) return null
      for (var id in byId) {
        if (!Object.prototype.hasOwnProperty.call(byId, id)) continue
        var row = byId[id]
        if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return row
      }
      return null
    }

    /**
     * True when the conversation on screen has a turn in flight.
     *
     * Status outranks the catalogue's own flag, matching the shell.
     * @returns {boolean} whether a turn is running in the visible conversation.
     */
    function currentSessionRunning() {
      var current = currentSession()
      if (!current) return false
      var status = statusFor(current.id)
      if (status && status.running !== undefined) return !!status.running
      return !!current.running
    }

    /**
     * What one conversation is doing right now, as a short label.
     *
     * The facts come from the shell's own unified session status, and the
     * precedence is the shell's: something waiting on the reader outranks live
     * activity, which outranks a completion reminder. On a host that publishes
     * no status source, the catalogue's own `running` flag is all there is.
     * @param {object} summary - session summary.
     * @returns {{key: string, text: string}|null} the label, or null when idle.
     */
    function statusOf(summary) {
      var status = statusFor(summary.id)
      if (!status) {
        return summary.running ? { key: 'running', text: paletteText('statusRunning') } : null
      }
      var kind = status.pendingInteraction && status.pendingInteraction.kind
      if (kind) {
        return { key: 'pending', text: paletteText(PENDING_LABELS[kind] || 'statusWaiting') }
      }
      var running = status.running === undefined ? summary.running : status.running
      if (running) return { key: 'running', text: paletteText('statusRunning') }
      if (status.completionUnread) return { key: 'done', text: paletteText('statusDone') }
      return null
    }

    /**
     * The turn count already peeked for a conversation, or null.
     * @param {object} summary - session summary.
     * @returns {number|null} the count, or null while unknown.
     */
    function turnsOf(summary) {
      return TURNS.read(summary)
    }

    /**
     * True for the statuses that mean a turn is in flight: one that is running,
     * and one parked on a question, which is the same turn waiting on the user.
     * @param {object|null} status - the label `statusOf` produced.
     * @returns {boolean} whether the conversation is mid-turn.
     */
    function statusIsLive(status) {
      return !!status && (status.key === 'running' || status.key === 'pending')
    }

    /**
     * Fold the shell's whole status snapshot into the ledger, and forget the
     * conversations the snapshot no longer carries.
     * @param {object} status - the `uiSession.sessionStatus` service.
     * @returns {void}
     */
    function syncRuns(status) {
      RUNS.sync(status, function (entry) {
        return !!(entry && (entry.running === true || (entry.pendingInteraction && entry.pendingInteraction.kind)))
      })
    }

    /**
     * Follow the status source for the life of the page, so a turn is stamped
     * when it starts rather than when the window opens.
     *
     * The probe deliberately does not go through `taskServices`: its answer is
     * cached for the palette, and a host that has not published the service yet
     * must not cost the window itself anything. Arming is retried whenever the
     * window opens, so a late-arriving service still gets a watch.
     * @returns {void}
     */
    function watchRuns() {
      if (RUNS.watching()) return
      var uiSession = serviceOf(taskCtx, 'uiSession')
      var status = uiSession && uiSession.sessionStatus
      if (!status || typeof status.getSnapshot !== 'function') return
      syncRuns(status)
      if (typeof status.subscribe !== 'function') return
      try {
        RUNS.arm(
          status.subscribe(function () {
            syncRuns(status)
          })
        )
      } catch (error) {
        RUNS.arm(null)
      }
    }

    /**
     * Read the stamps the previous page left behind, dropping the ones that are
     * too old to be about the turn running now.
     * @returns {void}
     */
    function loadRunStamps() {
      RUNS.load()
    }

    /**
     * Stop watching, and forget every stamp the watch had taken.
     * @returns {void}
     */
    function forgetRuns() {
      RUNS.forget()
    }

    /**
     * The moment the turn in flight in one conversation was seen to start.
     * @param {string} id - session id.
     * @returns {number} epoch milliseconds, or 0 when the start was never seen.
     */
    function runSince(id) {
      return RUNS.since(id)
    }

    /**
     * How long a turn has been in flight, at minute resolution.
     *
     * Seconds are deliberately gone (see CLOCK_INTERVAL_MS): a number that
     * changes every time the reader looks at it is a number they are invited to
     * keep looking at. Under a whole minute there is no duration worth reading —
     * an empty answer, which leaves the chip saying the plain state, exactly as
     * it does for a turn whose start was never seen. Nothing is invented, and
     * the first minute of a turn is quiet.
     * @param {number} ms - milliseconds since the turn was seen to start.
     * @returns {string} the duration, or '' while it is under a minute.
     */
    function elapsedText(ms) {
      var total = Math.max(0, Math.floor(ms / 60000))
      if (!total) return ''
      var minutes = total % 60
      var hours = Math.floor(total / 60)
      if (hours) return hours + paletteText('elapsedHours') + minutes + paletteText('elapsedMinutes')
      return minutes + paletteText('elapsedMinutes')
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
     * Queue a turn count for every loaded row that does not have one yet.
     *
     * Nothing here can fail loudly and nothing blocks the window: rows render
     * with the count absent, and a count paints itself in when it lands. The
     * shell serves `sessionStats` per session, so the only way to read it for
     * a conversation that is not open is to briefly retain that conversation
     * under a private source — never `mainView`, see PEEK_SOURCE.
     */
    function requestTurns() {
      var services = taskServices()
      var sessions = services && services.controller
      if (!sessions || typeof sessions.retainScope !== 'function') return
      for (var i = 0; i < PALETTE.rows.length; i++) {
        var summary = PALETTE.rows[i]
        if (turnsOf(summary) !== null || TURNS.pending(summary.id)) continue
        TURNS.owe(summary)
      }
      drainPeeks()
    }

    /** Start as many queued peeks as the concurrency budget allows. */
    function drainPeeks() {
      TURNS.drain(peekTurns, function () {
        if (!PALETTE.open) return
        renderPalette()
        // The board's repaint re-asks by itself; the palette's does not (it
        // draws no counts of its own on the way), so the next slot opens here.
        drainPeeks()
      })
    }

    /**
     * Read one session's `sessionStats.turns` and let go of it again.
     *
     * The reference is released on every path — value, cancel, timeout, or a
     * throwing host — because a held one keeps a whole session scope alive.
     * @param {object} summary - session summary.
     * @param {object} book - the ledger that asked for this read.
     * @param {object} sink - what to do with the answer, and who to tell.
     */
    function peekTurns(summary, book, sink) {
      var settled = false
      var reference = null
      var off = null
      var timer = null

      function finish(turns) {
        if (settled) return
        settled = true
        if (timer) window.clearTimeout(timer)
        if (off) {
          try {
            off()
          } catch (error) {
            /* the host is already gone; nothing to do */
          }
        }
        if (reference) {
          try {
            reference.release()
          } catch (error) {
            /* ditto */
          }
        }
        sink.clear(summary.id)
        sink.settle(summary.id, turns, summary.updatedAt)
        sink.done()
        // A count landed, so whichever window asked can show it. That repaint
        // is also where the asking window opens the next slot: the queue is per
        // window, and only the window knows whether it still wants the rest.
        if (sink.paint) sink.paint()
      }

      book.watch(summary.id, finish)
      try {
        var services = taskServices()
        reference = services.controller.retainScope(summary.id, PEEK_SOURCE)
        var projections = reference && reference.binding && reference.binding.session
          ? reference.binding.session.projections
          : null
        if (!projections || typeof projections.faceOf !== 'function') {
          finish()
          return
        }
        var face = projections.faceOf('sessionStats')
        function accept() {
          var value = face.getSnapshot()
          if (!value) return false
          finish(typeof value.turns === 'number' ? value.turns : null)
          return true
        }
        if (!accept() && typeof face.subscribe === 'function') {
          off = face.subscribe(function () {
            accept()
          })
          timer = window.setTimeout(function () {
            finish()
          }, PEEK_TIMEOUT_MS)
          // The value may have landed between the read and the subscription.
          accept()
        } else if (!settled) {
          finish()
        }
      } catch (error) {
        finish()
      }
    }

    /** Drop every queued and in-flight peek; the window closed or unloaded. */
    function cancelPeeks() {
      TURNS.release()
    }

    /** Built-in string for the task window; it is plugin chrome, not shell copy. */
    function paletteText(key) {
      var table = localeIsZh() ? ZH : EN
      return table[key] || key
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
     * Every conversation worth offering, newest first.
     *
     * The exclusions mirror the shell's own `sessionVisible`: subagent children
     * are not conversations, empty provisional slots have nothing to switch
     * back to, and archived sessions were put away on purpose.
     *
     * The order is plain recency, with the id as a deterministic tie-break. It
     * used to be grouped by folder, folder blocks in the registry's own order —
     * that made the folder the unit the reader navigated in, and it meant a busy
     * folder could push a quiet one off the list entirely. The folder is a
     * label on a row now (see `namesOwnFolder`), not a container, so there is
     * nothing here to group.
     *
     * Nothing is ever moved for being the conversation on screen: a list that
     * reshuffles itself when you switch is a list whose positions cannot be
     * learned, and the position of the row you are in is exactly what
     * `hereIndex` reads instead of rewriting.
     * @returns {Array<object>} session summaries, newest first.
     */
    function conversationPool() {
      var services = taskServices()
      if (!services) return []
      var snapshot = services.list.getSnapshot()
      if (!snapshot) return []
      var byId = snapshot.byId || {}
      var ids = snapshot.ids && snapshot.ids.length ? snapshot.ids : Object.keys(byId)

      var archive = null
      if (services.workspaces) {
        try {
          var registry = services.workspaces.getSnapshot()
          if (registry && registry.archivedSessionIds) {
            archive = {}
            for (var k = 0; k < registry.archivedSessionIds.length; k++) {
              archive[registry.archivedSessionIds[k]] = true
            }
          }
        } catch (error) {
          console.warn('[dsh-vim] archive set unavailable', error)
        }
      }

      var pool = []
      for (var i = 0; i < ids.length; i++) {
        var summary = byId[ids[i]]
        if (!summary) continue
        if (summary.origin === 'subagent') continue
        if (summary.blank) continue
        if (archive && archive[summary.id]) continue
        pool.push(summary)
      }
      sortByRecency(pool)
      return pool
    }

    /**
     * Sort rows by recency, newest first, with the id as a deterministic
     * tie-break.
     *
     * The tie-break matters more than it looks: two conversations touched in
     * the same millisecond would otherwise swap places between repaints, and a
     * list that reorders itself while you are reading it is the thing this
     * whole grouping exists to avoid.
     * @param {Array<object>} rows - rows to sort in place.
     * @returns {void}
     */
    function sortByRecency(rows) {
      rows.sort(function (a, b) {
        var gap = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
        if (gap) return gap
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })
    }

    /**
     * Where the conversation on screen sits in a list, or 0 when it is not
     * there.
     *
     * This is what replaced putting it at the front: the window opens with the
     * selection on the row you are already in, wherever the folder order put
     * it. A conversation that is not in the list — archived, or filtered out —
     * leaves the selection at the top, which is the only row left to point at.
     * @param {Array<object>} rows - the rows on screen.
     * @returns {number} the index to select.
     */
    function hereIndex(rows) {
      var here = currentSession()
      if (!here) return 0
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === here.id) return i
      }
      return 0
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
     * Which attention block a conversation belongs to, or null for the plain
     * browsing block.
     *
     * This is the one axis the top of the window is cut along, and it is a
     * different question from "which folder is this in" or "how new is this".
     * The three answers are:
     *
     * - `mine` — the ball is in the reader's court. A turn parked on an
     *   approval, a plan review or a question, and a run that finished with
     *   nobody having looked at it yet. The two are the same fact from the
     *   reader's side (something of theirs is waiting on them) and different
     *   only in what they owe it: a decision, or a look.
     * - `live` — a turn is in flight and needs nobody. It is here so that it can
     *   be seen without being watched, and so that it is not mistaken for a
     *   conversation that is simply sitting there.
     * - `null` — nothing is happening and nothing is owed.
     *
     * `statusOf` already carries the precedence (waiting outranks running
     * outranks just-finished), so this reads that one answer rather than
     * rebuilding it.
     * @param {object} summary - session summary.
     * @returns {string|null} 'mine', 'live', or null.
     */
    function attentionOf(summary) {
      var status = statusOf(summary)
      if (!status) return null
      if (status.key === 'running') return 'live'
      return 'mine'
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
     * Which folder each conversation lives in, as `{ label, path }` keyed by
     * session id.
     *
     * The Session catalogue carries no folder — its summaries are id, title,
     * state and time — so membership is read the way the sidebar reads it: a
     * Workspace lists the sessions that belong to it. A conversation no
     * Workspace accounts for is left without a chip rather than labelled: that
     * is the sidebar's own "ungrouped" bucket, and an empty chip on every row of
     * a host that publishes no registry would be noise.
     * @returns {object} session id -> folder, for the rows about to be drawn.
     */
    function folderIndex() {
      var index = Object.create(null)
      var services = taskServices()
      if (!services || !services.workspaces) return index
      var snapshot = null
      try {
        snapshot = services.workspaces.getSnapshot()
      } catch (error) {
        return index
      }
      var items = (snapshot && snapshot.items) || []
      for (var i = 0; i < items.length; i++) {
        var workspace = items[i]
        if (!workspace || !workspace.sessionIds) continue
        var folder = {
          // The id is what the board's panels are keyed by; the task window's
          // rows only read the label and the path.
          id: String(workspace.workspaceId || ''),
          label: folderLabel(workspace),
          path: String(workspace.path || ''),
        }
        for (var j = 0; j < workspace.sessionIds.length; j++) {
          index[workspace.sessionIds[j]] = folder
        }
      }
      return index
    }

    /**
     * One workspace, by the id the board files its goals under.
     *
     * Read from the registry rather than from the conversation that is being
     * drawn: a goal can outlive its conversations, and the label it was cut
     * from is a fact about the workspace, not about what is currently in it.
     * @param {string} id - workspace id.
     * @returns {{label: string, path: string}|null} the folder, or null.
     */
    function folderById(id) {
      if (!id || id === BOARD_INBOX) return null
      var services = taskServices()
      if (!services || !services.workspaces) return null
      var snapshot = null
      try {
        snapshot = services.workspaces.getSnapshot()
      } catch (error) {
        return null
      }
      var items = (snapshot && snapshot.items) || []
      for (var i = 0; i < items.length; i++) {
        var workspace = items[i]
        if (!workspace) continue
        if (String(workspace.workspaceId || '') !== String(id)) continue
        return { label: folderLabel(workspace), path: String(workspace.path || '') }
      }
      return null
    }

    /**
     * The workspace a new conversation started from one goal would join.
     *
     * A workspace panel is its own answer. A goal the reader made is a label
     * over work that already lives somewhere, so the first conversation filed
     * here names the workspace it came from; a goal with nothing in it falls
     * back to the conversation on screen, then to the first workspace the host
     * still lists. The answer is only a starting point — the card is placed
     * under the goal the reader pressed, whichever workspace made it.
     * @param {object} block - the goal whose plus was pressed.
     * @returns {string} a workspace id, or '' when this host has none.
     */
    function workspaceForGoal(block) {
      if (!block) return ''
      if (block.kind === 'workspace') return String(block.key || '')
      var folders = folderIndex()
      for (var i = 0; i < block.rows.length; i++) {
        var home = folders[block.rows[i].id]
        if (home && home.id) return home.id
      }
      var current = currentSession()
      if (current && folders[current.id] && folders[current.id].id) return folders[current.id].id
      var services = taskServices()
      var snapshot = null
      try {
        snapshot = services && services.workspaces ? services.workspaces.getSnapshot() : null
      } catch (error) {
        snapshot = null
      }
      var items = (snapshot && snapshot.items) || []
      for (var w = 0; w < items.length; w++) {
        if (items[w] && items[w].workspaceId) return String(items[w].workspaceId)
      }
      return ''
    }

    /**
     * One goal of the last paint, by the key a card is filed under.
     * @param {string} key - block id.
     * @returns {object|null} the block, or null.
     */
    function boardBlockByKey(key) {
      for (var i = 0; i < BOARD.blocks.length; i++) {
        if (BOARD.blocks[i].key === key) return BOARD.blocks[i]
      }
      return null
    }

    /**
     * What a folder reads as on a row: the Workspace's own title, else the last
     * segment of its path. The same precedence the sidebar's group header uses,
     * so a row and its group cannot disagree.
     * @param {object} workspace - one registry item.
     * @returns {string} the label, empty when there is nothing to show.
     */
    function folderLabel(workspace) {
      var title = workspace.title ? String(workspace.title).trim() : ''
      if (title) return title
      var path = workspace.path ? String(workspace.path) : ''
      var parts = path.split(/[\\/]/).filter(function (part) {
        return part !== ''
      })
      return parts.length ? parts[parts.length - 1] : path
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
        activateSession(summary.id)
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
      return activateSession(row.id)
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
      if (BOARD.open) return false
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
        if (pinned) pinToBoard(pinned.id)
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

    /** The message box, once a focus has shown us which element it is. */
    var composer = null

    /** Whether a gesture of the user's own has asked for the keyboard in a field. */
    var focusRequest = { pending: false, timer: 0 }

    /**
     * How long a focus arriving after the window got the front back is left
     * alone, in milliseconds.
     *
     * A dictation or clipboard tool (Ditto and its relatives) does not stamp a
     * caret into the box: it brings this window to the front and then presses
     * Ctrl+V on the keyboard, as the user's own keystroke. The box has to be
     * holding the caret by the time that key arrives, or there is nothing to
     * paste into, and a caret this plugin had just refused is exactly the case
     * the user reported. The gesture is therefore honoured while the window is
     * coming back from the outside — the press that landed is indistinguishable
     * from a click — and nowhere else, so arriving from the shell's own render
     * effect (a switch, the first load, the end of a turn) is untouched.
     */
    var REFOCUS_GRACE_MS = 400

    /**
     * When the window last got the front back, in `Date.now()` milliseconds.
     * Zero means it has never lost it since this page woke up.
     */
    var refocusAt = 0

    /**
     * Probes a send has queued to give the keyboard back, counted rather than
     * timed: a counter retires every probe still in flight by making them stale,
     * so the user asking for the keyboard again needs no timer bookkeeping of
     * its own.
     */
    var handBack = { token: 0 }

    /**
     * When the last bare Enter was seen, in `Date.now()` milliseconds, for the
     * double-Enter send mode. Zero means no pair is in progress.
     */
    var doubleEnter = { at: 0 }

    /**
     * The message box: the rich-text editor root the shell puts the caret into.
     *
     * `rememberComposer` supplies it from a focus that actually landed, and
     * `COMPOSER_SELECTOR` supplies it when the host names its own editor, which
     * is the case before anything has been focused. Returning null is
     * survivable: the guard then has nothing to protect and the focus key has
     * nothing to focus.
     * @returns {Element|null} the editor root, or null when there is none.
     */
    function composerRoot() {
      if (composer && composer.isConnected !== false) return composer
      if (typeof document.querySelector !== 'function') return null
      try {
        return document.querySelector(COMPOSER_SELECTOR)
      } catch (error) {
        return null
      }
    }

    /**
     * Remember the element a focus landed on. It is the fallback for a host
     * whose box carries no marker, and the element the focus key will reach for
     * as long as it is still in the document.
     * @param {Element} node - the focused editor root.
     * @returns {void}
     */
    function rememberComposer(node) {
      if (node && node.nodeType === 1) composer = node
    }

    /**
     * True when an element is a rich-text editor, i.e. the message box — and
     * deliberately not a plain field.
     *
     * The whole rule hangs off this narrow test. A settings panel or a sidebar
     * search that focuses its own input when it opens is the host's business;
     * only the box that swallows the scroll keys is worth taking the keyboard
     * from, and in this shell that is the one rich-text editor there is. A
     * field inside a modal is left alone as well, because a dialog is a shell
     * of its own and may hand out focus inside itself.
     * @param {Element|null} node - candidate element.
     * @returns {boolean} whether the element is the kind of box to protect.
     */
    function isComposerEditor(node) {
      if (!node || node.nodeType !== 1) return false
      if (node.isContentEditable !== true) return false
      if (typeof node.closest !== 'function') return true
      try {
        return node.closest(MODAL_SELECTOR) === null
      } catch (error) {
        return true
      }
    }

    /**
     * Mark that the user just asked for the keyboard themselves, so the focus
     * arriving a beat later is theirs and must be left alone.
     * @returns {void}
     */
    function noteFocusRequest() {
      focusRequest.pending = true
      // The user wants the keyboard after all, so a send that owed it back has
      // been overtaken: its probes are stale now, and must not pull the caret
      // out of the box the user has just asked for.
      handBack.token++
      if (focusRequest.timer) window.clearTimeout(focusRequest.timer)
      focusRequest.timer = window.setTimeout(function () {
        focusRequest.timer = 0
        focusRequest.pending = false
      }, FOCUS_REQUEST_MS)
    }

    /**
     * Drop a request the user has just superseded by doing something else.
     * Clicking a conversation a moment after clicking the box must not license
     * the box of the conversation being opened.
     * @returns {void}
     */
    function clearFocusRequest() {
      if (focusRequest.timer) {
        window.clearTimeout(focusRequest.timer)
        focusRequest.timer = 0
      }
      focusRequest.pending = false
    }

    /**
     * True for a control a bare Space activates by itself. Such a control keeps
     * the key: pressing a focused button with Space is how the keyboard works,
     * and the focus key must not turn that into a jump to the message box.
     * @param {Element|null} node - the keydown target.
     * @returns {boolean} whether Space belongs to that control.
     */
    function isActivating(node) {
      if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return false
      try {
        return node.closest(ACTIVATING_SELECTOR) !== null
      } catch (error) {
        return false
      }
    }

    /**
     * Put the keyboard in the message box: what the focus key is for.
     * @returns {boolean} whether a box was found and focused.
     */
    function focusComposer() {
      var root = composerRoot()
      if (!root || typeof root.focus !== 'function') return false
      rememberComposer(root)
      noteFocusRequest()
      try {
        root.focus({ preventScroll: true })
      } catch (error) {
        root.focus()
      }
      return true
    }

    /**
     * True when the message box holds nothing the user put there.
     *
     * Read from the editor's own text, which is the same thing the shell reads
     * to decide whether to show its placeholder: an empty Lexical root is a
     * paragraph with a line break in it, so nothing typed reads as blank. A
     * reference the shell encodes into the draft (a mention, a chip) is a
     * character in that text, so a box holding one is not empty and keeps its
     * Space — which is what the shell does with its placeholder too.
     * @param {Element} root - the editor root.
     * @returns {boolean} whether nothing has been typed.
     */
    function composerIsEmpty(root) {
      var text = root.textContent
      if (typeof text !== 'string') return false
      return text.trim() === ''
    }

    /**
     * The focus key pressed again, inside the box it put the caret in: hand the
     * keyboard back.
     *
     * The box is a place to pass through, and with nothing typed there is no
     * draft to protect, so a Space there would only be a stray character in a
     * message nobody started. Escape does the same job, but it is not always
     * available: while a turn is in flight the shell owns Escape and the plugin
     * deliberately leaves it alone, which is exactly when the user most wants
     * out of the box without touching anything. This key never reaches the
     * shell, so it is safe in every state — it gives focus back and nothing
     * else.
     *
     * Anything typed at all flips the answer: with a draft in the box the key
     * is an ordinary Space, as it must be.
     * @returns {boolean} whether the keyboard was handed back.
     */
    function leaveEmptyComposer() {
      if (!settings.spaceBlurs) return false
      var root = composerRoot()
      if (!isComposerEditor(root)) return false
      var active = document.activeElement
      if (active !== root) {
        if (!active || typeof root.contains !== 'function' || !root.contains(active)) return false
      }
      if (!composerIsEmpty(root)) return false
      // The user is done with the box, so a request that put them in it is
      // spent: a host focus arriving a beat later must not undo this.
      clearFocusRequest()
      if (typeof active.blur === 'function') active.blur()
      return true
    }

    /**
     * True when a keystroke was aimed at the message box.
     *
     * `isComposerEditor` decides what counts as the box — a rich-text editor
     * outside any modal — and this asks whether the key landed in one, which
     * is not the same as being *on* its root: with the caret inside a chip or
     * a nested node, the event target sits below the root. Everything else —
     * the terminal, the task window's rename box, a plan editor, a setting
     * field — is not the box and keeps Enter exactly as the host made it.
     * @param {Element|null} node - the keydown target.
     * @returns {boolean} whether the key belongs to the composer.
     */
    function inComposer(node) {
      var root = composerRoot()
      if (!isComposerEditor(root)) return false
      if (!node || node.nodeType !== 1) return false
      if (node === root) return true
      if (typeof root.contains !== 'function') return false
      try {
        return root.contains(node)
      } catch (error) {
        return false
      }
    }

    /**
     * True while a suggestion menu is waiting to be confirmed.
     *
     * The menu accepts its highlighted candidate on Enter, and it does so
     * later in the same event than this plugin — so intercepting the key
     * would turn "take this slash command" into a line break. Yielding here
     * costs nothing: a menu that cannot be confirmed by keyboard is worse
     * than a line break that has to be typed another way.
     * @returns {boolean} whether such a menu is on screen.
     */
    function menuOpen() {
      if (typeof document.querySelector !== 'function') return false
      try {
        return document.querySelector(TRIGGER_MENU_SELECTOR) !== null
      } catch (error) {
        return false
      }
    }

    /**
     * True when this keystroke is a send, and the keyboard should not stay in
     * the message box afterwards.
     *
     * A send is a thing the user types, so it is seen here rather than guessed
     * at from the shell: `Ctrl/Cmd+Enter` is the host's own send accelerator and
     * works in every mode, while a bare Enter only sends while the host is left
     * to send it — in the other three modes this plugin swallows the key itself
     * (see the send-mode branch in `onKeyDown`).
     *
     * Three keys that look like a send are not one, and each is left alone: a
     * candidate list open, where Enter takes the highlighted entry; a box with
     * nothing in it, where Enter sends nothing; and a key being composed by an
     * IME, which never reaches this function at all. Reading the draft is what
     * makes the second one safe — and a wrong guess here is cheap, since the
     * probes only ever move focus and never touch a character.
     * @param {KeyboardEvent} ev - the keydown, before the editable yield.
     * @param {string} key - its lower-cased `key`.
     * @returns {boolean} whether the keyboard should be handed back afterwards.
     */
    function onSendKey(ev, key) {
      if (!settings.sendBlurs) return false
      if (PALETTE.open) return false
      if (key !== 'enter') return false
      if (ev.shiftKey) return false
      if (!inComposer(ev.target)) return false
      if (menuOpen()) return false
      var chord = ev.ctrlKey || ev.metaKey
      var bare = !chord && !ev.altKey
      if (!chord && !(bare && settings.sendMode === 'host')) return false
      return !composerIsEmpty(composerRoot())
    }

    /**
     * True when this Enter is the second half of a double-Enter send.
     *
     * The pair is a rhythm, so the decision is made from the two presses alone:
     * the previous Enter was inside `DOUBLE_ENTER_MS`, the box still holds a
     * draft, and the key is not an auto-repeat — holding Enter must never send.
     * A menu open, an empty box, a composing key and a mode that is not
     * `double` are all handled before this is asked, so a `true` here means
     * exactly one thing: the user pressed Enter twice on purpose.
     *
     * The first press is never delayed: it breaks the line on the spot, and this
     * only decides what the second one does. That is what keeps the mode's
     * typing feel identical to `newline` until the moment it sends.
     * @param {KeyboardEvent} ev - the second Enter keydown.
     * @returns {boolean} whether it sends.
     */
    function doubleEnterSends(ev) {
      if (ev.repeat) return false
      var root = composerRoot()
      var empty = composerIsEmpty(root)
      var previous = doubleEnter.at
      if (previous !== 0 && Date.now() - previous <= DOUBLE_ENTER_MS && !empty) {
        doubleEnter.at = 0
        return true
      }
      // A press that cannot be the first half of a pair — nothing in the box to
      // send — leaves no stamp behind. Otherwise Enter on an empty box followed
      // by a pasted draft and a second Enter would send a message the user
      // never confirmed with two presses.
      doubleEnter.at = empty ? 0 : Date.now()
      return false
    }

    /**
     * Send the draft by handing the host the key it already sends with.
     *
     * `Ctrl/Cmd+Enter` is the host's own accelerator, so a rewritten copy of it
     * is the whole send: no button to find, no message to rebuild, and the
     * draft is left exactly as the user typed it. This is the same trick
     * `breakLine` plays with `Shift+Enter`, and it is why the double-Enter mode
     * adds no send path of its own.
     *
     * The host's focus and the caret are untouched: the key is dispatched on the
     * editor root, which is where the host's own composer keymap listens.
     * @returns {void}
     */
    function sendFromComposer() {
      var root = composerRoot()
      if (!isComposerEditor(root) || typeof root.dispatchEvent !== 'function') return
      var synth = null
      try {
        synth = new window.KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          shiftKey: false,
          ctrlKey: true,
          altKey: false,
          metaKey: false,
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      } catch (error) {
        synth = null
      }
      if (!synth) return
      // Marked, because this copy bubbles back into the plugin's own capture
      // listener: without the flag the send would be read as a second bare
      // Enter and could start a pair of its own.
      try {
        synth[REWRITTEN_FLAG] = true
      } catch (error) {
        // A frozen event cannot be marked; the send still goes through.
      }
      try {
        root.dispatchEvent(synth)
      } catch (error) {
        if (state.debug) console.warn('[dsh-vim] could not hand the send to the box', error)
      }
    }

    /**
     * Give the keyboard back to the page after a send, without waiting for a
     * focus event that may never come.
     *
     * The editor holds DOM focus across a send — the host's own focus lands on
     * the element it is already on, which changes nothing and raises no
     * `focusin` — so `onFocusIn` has nothing to refuse and the caret would stay
     * in the box with every key swallowed by it. A `blur` this plugin issues
     * itself is the only way out, so this is what the send does: drop the
     * request the typing had armed, then probe.
     *
     * Each probe is a no-op unless the caret is still in the box, and both are
     * dropped the moment the user asks for the keyboard again — a click, a Tab,
     * the focus key, the first keystroke of the next message.
     * @returns {void}
     */
    function handBackAfterSend() {
      var token = ++handBack.token
      for (var i = 0; i < SEND_HAND_BACK_MS.length; i++) {
        window.setTimeout(function () {
          if (token !== handBack.token) return
          if (focusRequest.pending) return
          var active = document.activeElement
          if (!inComposer(active)) return
          if (typeof active.blur === 'function') active.blur()
          if (state.debug) console.log('[dsh-vim] send: keyboard handed back to the page')
        }, SEND_HAND_BACK_MS[i])
      }
    }

    /**
     * Turn a bare Enter into the host's own line break.
     *
     * Nothing here edits the draft. The shell already knows how to break a
     * line: its composer keymap yields on `event.shiftKey === true` and lets
     * the editor's own line-break command through, which is a soft `<br>`
     * rather than a new paragraph. So the key is swallowed and a shift-flagged
     * copy is handed to the box in its place — the one path that reaches the
     * real thing instead of an imitation of it, and the reason a rewritten
     * key beats inserting text ourselves.
     *
     * A key the editor cannot be given one of becomes a swallowed key: losing
     * a line break is recoverable, while letting the original through would
     * send a half-written message.
     * @param {KeyboardEvent} ev - the original Enter keydown.
     * @returns {void}
     */
    function breakLine(ev) {
      ev.preventDefault()
      var root = composerRoot()
      if (!isComposerEditor(root) || typeof root.dispatchEvent !== 'function') return
      var synth = null
      try {
        synth = new window.KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          shiftKey: true,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      } catch (error) {
        synth = null
      }
      if (!synth) return
      // Marked, for the same reason as the send above: this copy bubbles back
      // into the plugin's own capture listener, and an unmarked one would be
      // read there as a real Shift+Enter — which is exactly the keystroke that
      // ends a double-Enter pair.
      try {
        synth[REWRITTEN_FLAG] = true
      } catch (error) {
        // A frozen event cannot be marked; the line break still goes through.
      }
      try {
        root.dispatchEvent(synth)
      } catch (error) {
        if (state.debug) console.warn('[dsh-vim] could not hand the line break to the box', error)
      }
    }

    /**
     * Keep the message box from taking the keyboard on its own.
     *
     * The host focuses the composer from a render effect, keyed on the
     * conversation and on whether a run is in flight, so arriving anywhere —
     * first load, a switch, the end of a turn — used to land the caret in the
     * box and take d / e / f away until Escape. The focus is honoured only when
     * the user asked for it: a press inside a text field, a Tab, a keystroke
     * being typed, or this plugin's focus key. Anything else is given back to
     * the page, which is what keeps the scroll keys live on arrival.
     *
     * One arrival is the user's too, without being a gesture of theirs: the
     * window coming back to the front with the box focused, a beat before a
     * tool of theirs presses Ctrl+V into it. See `noteFocusReturn`.
     * @param {FocusEvent} ev - the focusin.
     * @returns {void}
     */
    function onFocusIn(ev) {
      if (!settings.switchBlurs) return
      var target = ev.target
      if (!isComposerEditor(target)) return
      rememberComposer(target)
      if (focusRequest.pending) return
      if (justReturned()) return
      if (typeof target.blur === 'function') target.blur()
    }

    /**
     * Widen the licence to a focus arriving right after the window got the
     * front back.
     *
     * This is the half of the rule that keeps clipboard and dictation tools
     * working. They bring the window forward and then *type* Ctrl+V themselves,
     * so the caret has to be in the box when that key arrives — but the focus
     * that puts it there is not a click, just a side effect of coming back. The
     * two are told apart by where they sit in time: the shell's own render
     * effect focuses the box the moment the page is up, while a tool's focus
     * lands in the instant after the page regained focus.
     *
     * It only ever widens: a request the user made is untouched, and a focus
     * that arrives on its own long after the return is still given back.
     * @returns {void}
     */
    function noteFocusReturn() {
      // Only the return is stamped; the licence itself is `justReturned`. Asking
      // for the keyboard here would widen it to a full `FOCUS_REQUEST_MS` window
      // and to every field on the page, which is exactly the "the box grabbed
      // the caret" behaviour this guard exists to stop.
      refocusAt = Date.now()
    }

    /**
     * Whether a focus arriving now is the tail of the window coming back.
     * @returns {boolean} true inside the grace period after a return.
     */
    function justReturned() {
      return refocusAt !== 0 && Date.now() - refocusAt <= REFOCUS_GRACE_MS
    }

    /**
     * A press says where the keyboard should be: inside a text field it asks
     * for that field, anywhere else it cancels a request the user made a moment
     * ago — and, when a window is up, it also says the window is no longer what
     * they are looking at.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function onPointerDown(ev) {
      if (isEditable(ev && ev.target)) noteFocusRequest()
      else clearFocusRequest()
      dismissOutsidePress(ev)
    }

    /**
     * Put an open window away when the press landed beside it.
     *
     * This is the way out that needs no key: a window you opened to look at
     * something else in, and then clicked something else, has told you what it
     * was for. The press itself is not touched — it still reaches the page, which
     * is what a press on the backdrop has always done — so one click both looks
     * at whatever was underneath and clears the window off the screen.
     *
     * Only the main button counts. A right-click is asking for a menu, and a
     * window that vanished under it would lose the selection the menu was about
     * to act on.
     *
     * Both windows can be on the page at once, so the press has to miss all of
     * them before any of them goes: a press on the card of one is not a press
     * outside the other.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function dismissOutsidePress(ev) {
      if (!ev || (ev.button !== undefined && ev.button !== 0)) return
      var target = ev.target
      if (!target) return
      if (PALETTE.open && !pressMissesWindow(PALETTE.host, target)) return
      if (MODELPICK.open && !pressMissesWindow(MODELPICK.host, target)) return
      if (BOARD.open && !pressMissesWindow(BOARD.host, target)) return
      if (PALETTE.open) closePalette()
      if (MODELPICK.open) closeModelPick()
      if (BOARD.open && BOARD.mode !== 'page') closeBoard()
    }

    /**
     * Whether a press landed outside an open window's card.
     *
     * The card is the whole of the window. The backdrop is `pointer-events: none`
     * so the page behind keeps answering presses, which means a press beside the
     * card arrives here with the page's own element as its target — and with the
     * backdrop itself only in a synthetic event. Both are outside.
     *
     * A host we cannot ask stays open: a wrong guess here throws away a window
     * the user is still reading, which is worse than making them press Escape.
     * @param {Element|null} host - the backdrop element, or null when closed.
     * @param {EventTarget|null} target - what the press landed on.
     * @returns {boolean} true when the window is up and the press missed its card.
     */
    function pressMissesWindow(host, target) {
      if (!host || !target) return false
      if (target === host) return true
      if (typeof host.contains !== 'function') return false
      return !host.contains(target)
    }

    /**
     * Switch the main view to one conversation.
     * @param {string} id - session id.
     * @returns {boolean} whether the navigator took it.
     */
    function activateSession(id) {
      var services = taskServices()
      closePalette()
      closeModelPick()
      // The floating board must get out of the way; the page does not — the
      // shell switches back to the conversation, which unmounts it.
      if (BOARD.mode !== 'page') closeBoard()
      if (!services || !id) return false
      try {
        services.nav.openSession(id)
      } catch (error) {
        console.error('[dsh-vim] could not open session', id, error)
        return false
      }
      if (state.debug) console.log('[dsh-vim] opened session', id)
      return true
    }

    /**
     * The board's stored arrangement, and the only thing that touches it.
     *
     * A canvas is a place, not a filing cabinet. What is stored is where things
     * sit and what the reader did to them: a workspace panel's position (and
     * whether it is folded away), the loose cards written on the canvas, the
     * conversations marked ★ or deleted from the board, and the fork lines this
     * plugin watched happen. The panels themselves, and the conversations
     * inside them, are read off the feed on every repaint — which workspace a
     * conversation belongs to is a fact about the conversation, not about the
     * board.
     *
     * Version 1 was the column board. Reading one keeps the two marks that still
     * mean something — ★ and a deleted conversation — and drops the columns: a
     * workspace is what a column used to be now, and the reader no longer has to
     * arrange it.
     *
     * Cleaned on the way in: a hand-edited store can only ever produce something
     * this build knows how to draw.
     * @returns {object} the store.
     */
    function makeBoardStore() {
      /** The last serialized form written, so an unchanged one is not rewritten. */
      var written = ''

      /** A board with nothing on it: no places, no cards, no marks. */
      function seed() {
        return {
          v: BOARD_STORE_VERSION,
          seq: 1,
          blocks: {},
          cards: [],
          muted: {},
          starred: {},
          lineage: {},
          blockLabels: {},
          intents: {},
          placed: {},
          // The order the reader knows each goal by: a conversation keeps the
          // place it was first drawn in until the reader moves it, however much
          // it is used afterwards.
          order: {},
          zoom: 1,
        }
      }

      /** A finite number, or null when the stored value is not one. */
      function finite(value) {
        var number = Number(value)
        return isFinite(number) ? number : null
      }

      /**
       * Whether one block id is a goal this board made itself.
       *
       * A workspace's id comes from the workspace registry, and a workspace
       * that is out of sight for one paint - no conversations today, or a
       * registry that has not answered yet - must keep its place on the paper.
       * Only the ids this store mints are places the store may forget.
       * @param {string} key - the block id.
       * @returns {boolean} whether the board invented it.
       */
      function madeGoal(key) {
        return typeof key === 'string' && /^g:\d+$/.test(key)
      }

      /** The two marks and the fork lines, shared by both document versions. */
      function cleanMarks(raw, doc) {
        var muted = raw.muted
        if (muted && typeof muted === 'object') {
          for (var id in muted) {
            if (!Object.prototype.hasOwnProperty.call(muted, id)) continue
            var stamp = finite(muted[id])
            if (stamp === null) continue
            doc.muted[id] = stamp
          }
        }
        var starred = raw.starred
        if (starred && typeof starred === 'object') {
          for (var mark in starred) {
            if (!Object.prototype.hasOwnProperty.call(starred, mark)) continue
            if (starred[mark] !== true) continue
            doc.starred[mark] = true
          }
        }
        var lineage = raw.lineage
        if (lineage && typeof lineage === 'object') {
          for (var child in lineage) {
            if (!Object.prototype.hasOwnProperty.call(lineage, child)) continue
            var parent = lineage[child]
            if (typeof parent !== 'string' || !parent || parent === child) continue
            doc.lineage[child] = parent
          }
        }
        return doc
      }

      /** Whatever was stored, reduced to a document this build can draw. */
      function clean(raw) {
        if (!raw || typeof raw !== 'object') return null
        var version = Number(raw.v)
        // Version 1 held columns and no places: there is nothing to carry over
        // but the marks, and a column board's cards were filed by hand — a
        // fact the workspace panels make for themselves now.
        if (version !== 1 && version !== BOARD_STORE_VERSION) return null
        var doc = seed()
        if (version === BOARD_STORE_VERSION) {
          var blocks = raw.blocks
          if (blocks && typeof blocks === 'object') {
            for (var key in blocks) {
              if (!Object.prototype.hasOwnProperty.call(blocks, key)) continue
              var entry = blocks[key]
              if (!entry || typeof entry !== 'object') continue
              var x = finite(entry.x)
              var y = finite(entry.y)
              if (x === null || y === null) continue
              doc.blocks[key] = {
                x: Math.max(0, Math.round(x)),
                y: Math.max(0, Math.round(y)),
                folded: entry.folded === true,
              }
            }
          }
          if (Array.isArray(raw.cards)) {
            var seen = Object.create(null)
            for (var i = 0; i < raw.cards.length; i++) {
              var card = raw.cards[i]
              if (!card || typeof card !== 'object') continue
              if (typeof card.id !== 'string' || !card.id || seen[card.id]) continue
              var cardX = finite(card.x)
              var cardY = finite(card.y)
              if (cardX === null || cardY === null) continue
              seen[card.id] = true
              doc.cards.push({
                id: card.id,
                x: Math.max(0, Math.round(cardX)),
                y: Math.max(0, Math.round(cardY)),
                text: typeof card.text === 'string' ? card.text : '',
                // A card can be tied to the conversation it was handed to. The
                // line is not part of the text, so it survives editing it.
                link: typeof card.link === 'string' ? card.link : '',
                done: card.done === true,
                // Where the note lives when it is not lying on the paper: '' is
                // the paper itself, '@inbox' is the tray. Its place is kept, so a
                // note lifted back out returns to where it was.
                filed: typeof card.filed === 'string' ? card.filed : '',
                // The rows the reader dragged it to, or 0 for one line. Clamped
                // on the way in: a hand-edited document cannot ask for a card
                // taller than the canvas knows how to draw.
                h: Math.max(0, Math.min(BOARD_EDITOR_MAX_ROWS,
                  Math.round(finite(card.h) === null ? 0 : finite(card.h)))),
              })
            }
          }
          // The names the reader gave these goals. A goal with no name of its
          // own wears its workspace's, so an empty entry is a name taken back.
          var labels = raw.blockLabels
          if (labels && typeof labels === 'object') {
            for (var labelKey in labels) {
              if (!Object.prototype.hasOwnProperty.call(labels, labelKey)) continue
              var labelText = labels[labelKey]
              if (typeof labelText !== 'string') continue
              var trimmed = labelText.replace(/\s+/g, ' ').trim()
              if (!trimmed) continue
              doc.blockLabels[labelKey] = trimmed.slice(0, BOARD_GOAL_NAME_MAX)
            }
          }
          // What each goal is for. This is the one line that keeps a place on
          // the canvas after its last conversation has left, so it is stored
          // beside the name rather than folded into it.
          var intents = raw.intents
          if (intents && typeof intents === 'object') {
            for (var statedKey in intents) {
              if (!Object.prototype.hasOwnProperty.call(intents, statedKey)) continue
              var statedText = intents[statedKey]
              if (typeof statedText !== 'string') continue
              var statedLine = statedText.replace(/\s+/g, ' ').trim()
              if (!statedLine) continue
              doc.intents[statedKey] = statedLine.slice(0, BOARD_GOAL_INTENT_MAX)
            }
          }
          // Where the reader said each conversation belongs, when that is not
          // where its workspace files it. The goal is the whole record: a card
          // with one is drawn in that goal and in no other.
          // The place each conversation was first drawn in. A stored order is the
          // reader's memory of the panel, so it is kept as written and only ever
          // appended to.
          var order = raw.order
          if (order && typeof order === 'object') {
            for (var orderKey in order) {
              if (!Object.prototype.hasOwnProperty.call(order, orderKey)) continue
              var seenHere = Object.create(null)
              var list = []
              var ids = order[orderKey]
              if (!Array.isArray(ids)) continue
              for (var oi = 0; oi < ids.length && list.length < 500; oi++) {
                var eachId = ids[oi]
                if (typeof eachId !== 'string' || !eachId || seenHere[eachId]) continue
                seenHere[eachId] = true
                list.push(eachId)
              }
              if (list.length) doc.order[orderKey] = list
            }
          }
          var placed = raw.placed
          if (placed && typeof placed === 'object') {
            for (var movedId in placed) {
              if (!Object.prototype.hasOwnProperty.call(placed, movedId)) continue
              var goalKey = placed[movedId]
              if (typeof goalKey !== 'string' || !goalKey) continue
              doc.placed[movedId] = goalKey
            }
          }
          doc.seq = Math.max(1, Math.floor(finite(raw.seq) || 1))
          // Zoom is part of the arrangement: a reader who works at 80% should
          // not have to set it again on every visit. Clamped, because a stored
          // value from a hand-edited document must not leave the canvas lost.
          var zoom = finite(raw.zoom)
          doc.zoom = zoom === null ? 1 : Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, zoom))
        }
        return cleanMarks(raw, doc)
      }

      /**
       * The document: what is stored, else an empty canvas.
       *
       * Read through to storage every time rather than memoized. A few blocks
       * and a handful of cards are cheap to parse, and a cached copy would go
       * stale the moment another tab (or another window of this one) moved
       * something — the board is the one thing this plugin writes that a second
       * page can be looking at.
       * @returns {object} the document.
       */
      function read() {
        var parsed = null
        try {
          parsed = clean(JSON.parse(window.localStorage.getItem(BOARD_KEY) || 'null'))
        } catch (error) {
          parsed = null
        }
        return parsed || seed()
      }

      /**
       * Write a document down, unless it is what was written last time.
       * @param {object} doc - the document to store.
       * @returns {void}
       */
      function save(doc) {
        var serialized = JSON.stringify(doc)
        if (serialized === written) return
        written = serialized
        try {
          window.localStorage.setItem(BOARD_KEY, serialized)
        } catch (error) {
          console.warn('[dsh-vim] the board could not be stored', error)
        }
      }

      /** Read, let `mutate` change the document, and store it when it says so. */
      function update(mutate) {
        var doc = read()
        if (mutate(doc) === false) return false
        save(doc)
        return true
      }

      return {
        read: read,

        /** Every panel's stored place, keyed by block id. */
        blocks() {
          return read().blocks
        },

        /**
         * Put one panel at a place, or move the place it already has.
         *
         * A panel only leaves the grid when the reader drags it there, so this
         * is called for both: the first paint of a workspace, and the end of a
         * drag that moved one.
         */
        placeBlock(id, x, y) {
          if (typeof id !== 'string' || !id) return false
          return update(function (doc) {
            var before = doc.blocks[id]
            doc.blocks[id] = {
              x: Math.max(0, Math.round(x)),
              y: Math.max(0, Math.round(y)),
              folded: before ? before.folded === true : false,
            }
            return true
          })
        },

        /** Whether one panel's conversations are folded away. */
        isFolded(id) {
          var entry = read().blocks[id]
          return Boolean(entry && entry.folded)
        },

        /** Fold one panel's conversations away, or bring them back. */
        toggleBlockFold(id) {
          if (typeof id !== 'string' || !id) return false
          var folded = false
          update(function (doc) {
            var entry = doc.blocks[id]
            if (!entry) entry = doc.blocks[id] = { x: 0, y: 0, folded: false }
            entry.folded = entry.folded !== true
            folded = entry.folded
            return true
          })
          return folded
        },

        /** The loose cards, in the order they were written. */
        cards() {
          return read().cards
        },

        /** Write a new empty card at a place, and answer its id. */
        addCard(x, y) {
          var id = ''
          update(function (doc) {
            id = 'n' + doc.seq
            doc.seq = doc.seq + 1
            doc.cards.push({
              id: id,
              x: Math.max(0, Math.round(Number(x) || 0)),
              y: Math.max(0, Math.round(Number(y) || 0)),
              text: '',
              link: '',
              done: false,
              filed: '',
              // The rows the reader grew this card to, or 0 for the default
              // one-line shape. Paper is the reader's to size: a thought that
              // needed three lines to read stays three lines next time.
              h: 0,
            })
            return true
          })
          return id
        },

        /** Move one card, keeping what it says. */
        moveCard(id, x, y) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].x = Math.max(0, Math.round(x))
              doc.cards[i].y = Math.max(0, Math.round(y))
              return true
            }
            return false
          })
        },

        /** Keep what one card says. A pressed Enter never leaves a line out. */
        setCardText(id, text) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].text = String(text === undefined || text === null ? '' : text)
              return true
            }
            return false
          })
        },

        /**
         * Tie one card to a conversation, without claiming it was delivered.
         *
         * The link is what draws the line and what the card's heading names. It
         * is a record of where the thought belongs, so it is kept when the card
         * is moved: a reader may put it somewhere else and still mean it for
         * that conversation.
         * @param {string} id - the card.
         * @param {string} sessionId - the conversation it points at.
         * @returns {boolean} whether a card was changed.
         */
        linkCard(id, sessionId) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].link = String(sessionId || '')
              return true
            }
            return false
          })
        },

        /**
         * Mark one card as handed over to a conversation.
         *
         * Done is a different fact from linked: a card can be laid beside a
         * conversation and still be a thought, but once its words are in that
         * conversation's box it has been delivered, and the board says so
         * without taking it away. The card stays where the reader can find it.
         * @param {string} id - the card.
         * @param {string} sessionId - the conversation that took it.
         * @returns {boolean} whether a card was changed.
         */
        finishCard(id, sessionId) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].link = String(sessionId || '')
              doc.cards[i].done = true
              return true
            }
            return false
          })
        },

        /** Cut one card loose from the conversation it was tied to. */
        unlinkCard(id) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].link = ''
              doc.cards[i].done = false
              return true
            }
            return false
          })
        },

        /**
         * Put one card back, at the place in the stack it was taken from.
         *
         * The record is the whole card - text, tie, done mark, where it was filed,
         * its height - so an undone delete is the same card, not a new one that
         * reads the same. A card already present is left alone rather than
         * duplicated.
         * @param {object} record - the card as it was.
         * @param {number} index - where it sat in the stack.
         * @returns {boolean} whether it was written.
         */
        restoreCard(record, index) {
          if (!record || typeof record.id !== 'string' || !record.id) return false
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id === record.id) return false
            }
            var at = Math.round(Number(index) || 0)
            at = Math.max(0, Math.min(doc.cards.length, at))
            doc.cards.splice(at, 0, {
              id: record.id,
              x: Math.max(0, Math.round(Number(record.x) || 0)),
              y: Math.max(0, Math.round(Number(record.y) || 0)),
              text: typeof record.text === 'string' ? record.text : '',
              link: typeof record.link === 'string' ? record.link : '',
              done: record.done === true,
              filed: typeof record.filed === 'string' ? record.filed : '',
              h: Math.max(0, Math.min(BOARD_EDITOR_MAX_ROWS, Math.round(Number(record.h) || 0))),
            })
            return true
          })
        },

        /** Take one card off the canvas for good. */
        removeCard(id) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards.splice(i, 1)
              return true
            }
            return false
          })
        },

        /**
         * The name one goal goes by, or '' when the reader has not named it.
         *
         * A goal is a panel on the canvas, and a panel is a place the reader
         * decides the meaning of: the workspace it happens to be cut from only
         * supplies the name it starts with.
         * @param {string} key - the block's id.
         * @returns {string} the chosen name, or ''.
         */
        blockLabel(key) {
          var chosen = read().blockLabels[key]
          return typeof chosen === 'string' ? chosen : ''
        },

        /**
         * Name one goal. A blank name gives it its workspace's name back.
         * @param {string} key - the block's id.
         * @param {string} label - what to call it.
         * @returns {boolean} whether the document changed.
         */
        setBlockLabel(key, label) {
          if (typeof key !== 'string' || !key) return false
          var text = String(label === undefined || label === null ? '' : label)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, BOARD_GOAL_NAME_MAX)
          return update(function (doc) {
            if (text) doc.blockLabels[key] = text
            else delete doc.blockLabels[key]
            return true
          })
        },

        /** Every goal the reader has named, keyed by block id. */
        blockLabels() {
          return read().blockLabels
        },

        /**
         * What one goal is for, or '' when the reader has not said.
         *
         * A name says what a place is called; this says what is to be done
         * there. The difference is load bearing: the name is a label, while
         * this is the one thing that keeps a goal on the canvas with nothing
         * filed in it.
         * @param {string} key - the block's id.
         * @returns {string} the stated purpose, or ''.
         */
        intentOf(key) {
          var said = read().intents[key]
          return typeof said === 'string' ? said : ''
        },

        /**
         * Say what one goal is for. An empty line takes the statement back,
         * which also lets the goal go once its last conversation has left.
         * @param {string} key - the block's id.
         * @param {string} text - what is to be done there.
         * @returns {boolean} whether the document changed.
         */
        setIntent(key, text) {
          if (typeof key !== 'string' || !key) return false
          var said = String(text === undefined || text === null ? '' : text)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, BOARD_GOAL_INTENT_MAX)
          return update(function (doc) {
            if (said) doc.intents[key] = said
            else delete doc.intents[key]
            return true
          })
        },

        /** Every purpose the reader has written, keyed by block id. */
        intents() {
          return read().intents
        },

        /**
         * The order one goal's conversations are drawn in.
         *
         * A board is a map of where things are, so a card that moved because a
         * turn started would be a card the reader has to find again. The order is
         * therefore written down the first time a conversation is drawn in a goal
         * and never re-sorted: what arrives later goes to the end, and nothing
         * else moves.
         * @param {string} key - the block id.
         * @param {Array<string>} ids - the conversations this paint put here.
         * @returns {Array<string>} the order, with any new arrivals appended.
         */
        rememberOrder(key, ids) {
          if (typeof key !== 'string' || !key) return []
          var doc = read()
          var held = Array.isArray(doc.order[key]) ? doc.order[key] : []
          var known = Object.create(null)
          for (var i = 0; i < held.length; i++) known[held[i]] = true
          var added = false
          var next = held.slice()
          for (var j = 0; j < ids.length; j++) {
            var id = ids[j]
            if (typeof id !== 'string' || !id || known[id]) continue
            known[id] = true
            next.push(id)
            added = true
          }
          if (added) {
            doc.order[key] = next
            save(doc)
          }
          return next
        },

        /**
         * Where the reader said each conversation belongs, keyed by session id.
         * @returns {object} session id -> block id.
         */
        placements() {
          return read().placed
        },

        /**
         * The goal a conversation was moved into, or '' when it sits where its
         * workspace puts it.
         * @param {string} id - session id.
         * @returns {string} the block id, or ''.
         */
        placementOf(id) {
          var goal = read().placed[id]
          return typeof goal === 'string' ? goal : ''
        },

        /**
         * File one conversation under a goal of the reader's choosing.
         *
         * A conversation is always drawn inside a goal: its workspace supplies
         * the one it starts in, and this is the one the reader moved it to. The
         * goal is the whole record - the card goes back to following its
         * workspace the moment the record is dropped.
         * @param {string} id - session id.
         * @param {string} goalKey - the block it now belongs to.
         * @returns {boolean} whether it was written down.
         */
        placeSession(id, goalKey) {
          if (typeof id !== 'string' || !id) return false
          if (typeof goalKey !== 'string' || !goalKey) return false
          return update(function (doc) {
            doc.placed[id] = goalKey
            // A card that was just put here stands at the end of this goal: it is
            // the newest arrival, and the panel's other cards did not move.
            var held = Array.isArray(doc.order[goalKey]) ? doc.order[goalKey] : []
            var rest = []
            for (var i = 0; i < held.length; i++) {
              if (held[i] !== id) rest.push(held[i])
            }
            rest.push(id)
            doc.order[goalKey] = rest
            return true
          })
        },

        /** Let one conversation follow its workspace again. */
        clearPlacement(id) {
          return update(function (doc) {
            if (doc.placed[id] === undefined) return false
            delete doc.placed[id]
            return true
          })
        },

        /**
         * Take one goal off the canvas and give its conversations back.
         *
         * Closing a place is not deleting what was in it: every conversation
         * filed here goes back to the goal its workspace gives it, which is
         * the rule a card already follows when it is carried somewhere else.
         * The record is answered so the same goal can be offered back for a
         * few seconds.
         * @param {string} key - the block's id.
         * @returns {object|null} what was removed, or null when there was nothing.
         */
        removeGoal(key) {
          if (typeof key !== 'string' || !key || key === BOARD_INBOX) return null
          if (!madeGoal(key)) return null
          var record = null
          update(function (doc) {
            var place = doc.blocks[key]
            var label = doc.blockLabels[key]
            var intent = doc.intents[key]
            var placed = {}
            var moved = 0
            for (var id in doc.placed) {
              if (!Object.prototype.hasOwnProperty.call(doc.placed, id)) continue
              if (doc.placed[id] !== key) continue
              placed[id] = key
              delete doc.placed[id]
              moved = moved + 1
            }
            record = {
              key: key,
              x: place ? place.x : 0,
              y: place ? place.y : 0,
              folded: place ? place.folded === true : false,
              label: typeof label === 'string' ? label : '',
              intent: typeof intent === 'string' ? intent : '',
              placed: placed,
              moved: moved,
            }
            delete doc.blocks[key]
            delete doc.blockLabels[key]
            delete doc.intents[key]
            return true
          })
          return record
        },

        /**
         * Put a closed goal back exactly as it was, conversations included.
         * @param {object} record - what `removeGoal` answered.
         * @returns {boolean} whether anything was written.
         */
        restoreGoal(record) {
          if (!record || !madeGoal(record.key)) return false
          return update(function (doc) {
            doc.blocks[record.key] = {
              x: Math.max(0, Math.round(Number(record.x) || 0)),
              y: Math.max(0, Math.round(Number(record.y) || 0)),
              folded: record.folded === true,
            }
            if (record.label) doc.blockLabels[record.key] = String(record.label)
            if (record.intent) doc.intents[record.key] = String(record.intent)
            var placed = record.placed || {}
            for (var id in placed) {
              if (!Object.prototype.hasOwnProperty.call(placed, id)) continue
              doc.placed[id] = record.key
            }
            return true
          })
        },

        /**
         * Forget the goals nothing is standing on any more.
         *
         * A goal lives by its conversations or by what the reader said it is
         * for. One with neither is a place nobody is working in - and keeping
         * its name would keep the empty panel with it, which is how a canvas
         * fills up with places nothing is happening in. Only goals this store
         * made are ever forgotten: a workspace's place belongs to the registry
         * and survives a paint in which no conversation from it is in sight.
         * @param {Array<string>} keys - the goals this paint is drawing.
         * @returns {number} how many goals were forgotten.
         */
        pruneGoals(keys) {
          var alive = Object.create(null)
          for (var i = 0; i < (keys || []).length; i++) alive[keys[i]] = true
          alive[BOARD_INBOX] = true
          var forgotten = 0
          update(function (doc) {
            var changed = false
            var key
            for (key in doc.blocks) {
              if (!Object.prototype.hasOwnProperty.call(doc.blocks, key)) continue
              if (alive[key] || !madeGoal(key)) continue
              delete doc.blocks[key]
              forgotten = forgotten + 1
              changed = true
            }
            for (key in doc.blockLabels) {
              if (!Object.prototype.hasOwnProperty.call(doc.blockLabels, key)) continue
              if (alive[key] || !madeGoal(key)) continue
              delete doc.blockLabels[key]
              changed = true
            }
            for (key in doc.intents) {
              if (!Object.prototype.hasOwnProperty.call(doc.intents, key)) continue
              if (alive[key] || !madeGoal(key)) continue
              delete doc.intents[key]
              changed = true
            }
            return changed
          })
          return forgotten
        },

        /**
         * Make a goal and stand it on the canvas at a place.
         *
         * A goal is a place the reader is working toward; it does not have to be
         * a workspace. Its id is the board's own, so a goal made this way can
         * never be mistaken for one cut from a workspace, and the name is the
         * whole of what it is.
         * @param {string} name - what to call it.
         * @param {number} x - canvas coordinate.
         * @param {number} y - canvas coordinate.
         * @returns {string} the new goal's id, or '' when it could not be made.
         */
        addGoal(name, x, y) {
          var id = ''
          update(function (doc) {
            doc.seq = Number(doc.seq) + 1
            id = 'g:' + doc.seq
            doc.blocks[id] = {
              x: Math.max(0, Math.round(Number(x) || 0)),
              y: Math.max(0, Math.round(Number(y) || 0)),
              folded: false,
            }
            var label = String(name === undefined || name === null ? '' : name)
              .replace(/\s+/g, ' ')
              .trim()
            if (label) doc.blockLabels[id] = label.slice(0, BOARD_GOAL_NAME_MAX)
            return true
          })
          return id
        },

        /**
         * Mark one card done, or take the mark back.
         *
         * Done is the reader's own word about a thought: it is not a deletion
         * and it is not a delivery. The card stays where it is, quieter.
         * @param {string} id - the card.
         * @param {boolean} done - whether it is finished.
         * @returns {boolean} whether a card was changed.
         */
        /**
         * Put one note into a place instead of on the paper.
         *
         * A note has a home the way a conversation does: '' is the paper, and a
         * goal id is filed in it. Only the inbox is a tray - it is the one place
         * that holds both kinds - and the place the note keeps is where it comes
         * back to when it is lifted out.
         * @param {string} id - the card.
         * @param {string} goalKey - where to file it.
         * @returns {boolean} whether it was written down.
         */
        fileCard(id, goalKey) {
          if (typeof id !== 'string' || !id) return false
          if (typeof goalKey !== 'string' || !goalKey) return false
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].filed = goalKey
              return true
            }
            return false
          })
        },

        /** Take one note back out of its place, onto the paper. */
        unfileCard(id) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              if (!doc.cards[i].filed) return false
              doc.cards[i].filed = ''
              return true
            }
            return false
          })
        },

        /** Every note filed in one place, oldest first. */
        filedCards(goalKey) {
          var all = read().cards
          var out = []
          for (var i = 0; i < all.length; i++) {
            if (all[i].filed === goalKey) out.push(all[i])
          }
          return out
        },

        /**
         * Set how many lines of paper one card spends.
         *
         * 0 is the default: one line, faded where it runs on. Anything else is
         * the height the reader dragged it to, kept for the next visit - a card
         * they had to open up once is a card they will want open next time.
         * @param {string} id - the card.
         * @param {number} rows - how many lines, or 0 for the default.
         * @returns {boolean} whether the document changed.
         */
        setCardRows(id, rows) {
          var want = Math.max(0, Math.round(Number(rows) || 0))
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              if (Number(doc.cards[i].h) === want) return false
              doc.cards[i].h = want
              return true
            }
            return false
          })
        },

        setCardDone(id, done) {
          return update(function (doc) {
            for (var i = 0; i < doc.cards.length; i++) {
              if (doc.cards[i].id !== id) continue
              doc.cards[i].done = done === true
              return true
            }
            return false
          })
        },

        /**
         * Take back a conversation's deletion, so a deliberate pin can bring it
         * back the same day it was taken off.
         * @param {string} id - session id.
         * @returns {boolean} whether a deletion was lifted.
         */
        unmute(id) {
          return update(function (doc) {
            if (doc.muted[id] === undefined) return false
            delete doc.muted[id]
            return true
          })
        },

        /** The parent of one conversation, or '' when this build never saw it fork. */
        lineageOf(id) {
          var parent = read().lineage[id]
          return typeof parent === 'string' ? parent : ''
        },

        /** Every fork line this build recorded, as child → parent. */
        lineage() {
          return read().lineage
        },

        /** The canvas magnification the reader last chose. */
        zoom() {
          return read().zoom
        },

        /** Remember a canvas magnification, already clamped by the caller. */
        setZoom(value) {
          var next = Number(value)
          if (!isFinite(next)) return false
          next = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, next))
          return update(function (doc) {
            doc.zoom = next
            return true
          })
        },

        /**
         * Record that one conversation was forked from another.
         *
         * The host writes no durable parent for an ordinary fork — the seed is
         * a prefix of events and the child's header does not name its source —
         * so the only honest line this board can draw is one it watched happen.
         * A chain that would close a loop is refused rather than drawn as a
         * circle.
         * @param {string} child - the forked conversation.
         * @param {string} parent - the conversation it was cut from.
         * @returns {boolean} whether a new line was recorded.
         */
        rememberFork(child, parent) {
          if (typeof child !== 'string' || typeof parent !== 'string') return false
          if (!child || !parent || child === parent) return false
          var doc = read()
          if (doc.lineage[child] === parent) return false
          var walk = parent
          var steps = 0
          while (walk && steps < 64) {
            if (walk === child) return false
            walk = doc.lineage[walk] || ''
            steps = steps + 1
          }
          doc.lineage[child] = parent
          save(doc)
          return true
        },

        /**
         * Take a conversation off the board for good, until it moves again.
         *
         * The stamp it is remembered by is the moment it was last touched: a
         * conversation that is deleted and later gets a new message is a
         * conversation that is in play again, and it comes back where it
         * belongs — that is the one exception to being removed.
         * @param {string} id - session id.
         * @param {number} touched - the conversation's updatedAt when deleted.
         * @returns {void}
         */
        mute(id, touched) {
          update(function (doc) {
            doc.muted[id] = Number(touched) || 0
            return true
          })
        },

        /** Whether a conversation is deleted, as of how recently it moved. */
        isMuted(id, touched) {
          var stamp = read().muted[id]
          if (stamp === undefined) return false
          return (Number(touched) || 0) <= stamp
        },

        /**
         * Whether a conversation is marked.
         *
         * A mark, not a place: it does not move a card, and it is not a panel.
         * What it buys is the one thing the day's boundary otherwise cannot do —
         * keep a conversation that has stopped moving on the board.
         * @param {string} id - session id.
         * @returns {boolean} whether it is marked.
         */
        isStarred(id) {
          return read().starred[id] === true
        },

        toggleStar(id) {
          var doc = read()
          if (doc.starred[id]) delete doc.starred[id]
          else doc.starred[id] = true
          save(doc)
          return doc.starred[id] === true
        },
      }
    }

    /**
     * The board's history: what was done, and how to put it back.
     *
     * A module of its own on purpose. It knows nothing about cards, goals or
     * conversations - a step arrives as a pair of closures (`undo`, `redo`), so
     * the only thing shared between the board and its history is the shape of a
     * step. That is what lets a new reversible action be added by recording one
     * more command, rather than by teaching this file about a new kind of thing.
     *
     * Order is the whole of the state: `past` is the way back, `future` the way
     * forward again, and recording anything makes the future meaningless (the
     * reader has chosen a different present).
     * @param {number} limit - how many steps are kept.
     * @returns {object} the history.
     */
    function makeHistory(limit) {
      var past = []
      var future = []
      var watchers = []

      /** Tell whoever is drawing the buttons that the stacks moved. */
      function announce() {
        for (var i = 0; i < watchers.length; i++) {
          try {
            watchers[i]()
          } catch (error) {
            console.warn('[dsh-vim] a history watcher failed', error)
          }
        }
      }

      /**
       * Register one step that has already been taken.
       *
       * `record` runs after the change, not instead of it: the caller has already
       * asked the store to do the work and is handing over the way back.
       * @param {{label: string, undo: Function, redo: Function}} command - the step.
       * @returns {object|null} the command, for a notice to hold on to.
       */
      function record(command) {
        if (!command || typeof command.undo !== 'function') return null
        past.push(command)
        while (past.length > limit) past.shift()
        future.length = 0
        announce()
        return command
      }

      /** Step back one command, and hold it ready to be stepped forward again. */
      function undo() {
        if (!past.length) return null
        var command = past.pop()
        try {
          command.undo()
        } catch (error) {
          console.warn('[dsh-vim] a board undo failed', error)
        }
        future.push(command)
        announce()
        return command
      }

      /** Step forward again, onto a command that was stepped back. */
      function redo() {
        if (!future.length) return null
        var command = future.pop()
        try {
          command.redo()
        } catch (error) {
          console.warn('[dsh-vim] a board redo failed', error)
        }
        past.push(command)
        announce()
        return command
      }

      return {
        record: record,
        undo: undo,
        redo: redo,
        canUndo() {
          return past.length > 0
        },
        canRedo() {
          return future.length > 0
        },
        /**
         * Step back only if this command is still the last one.
         *
         * A notice lives for a few seconds, and another delete can happen inside
         * them: the notice then holds a step that is no longer the top, and undoing
         * it would undo somebody else's work.
         * @param {object} command - the step the notice was made for.
         * @returns {object|null} the command, or null when it is not the top.
         */
        undoTo(command) {
          if (!command || past[past.length - 1] !== command) return null
          return undo()
        },
        depth() {
          return { past: past.length, future: future.length, limit: limit }
        },
        clear() {
          past.length = 0
          future.length = 0
          announce()
        },
        subscribe(watcher) {
          watchers.push(watcher)
          return function () {
            var at = watchers.indexOf(watcher)
            if (at >= 0) watchers.splice(at, 1)
          }
        },
      }
    }

    /**
     * The board's one history.
     *
     * Fifty steps: enough to walk back through a session of tidying, few enough
     * that nothing is held for long. It lives in memory and dies with the page -
     * a delete that survived a reload is a delete the reader meant.
     */
    var BOARD_HISTORY = makeHistory(50)

    var BOARD_STORE = makeBoardStore()

    /**
     * The lines pinned to conversations, and the only thing that touches them.
     *
     * One line per conversation, keyed by the session id the shell already
     * uses: a note is attached to the work it came out of, so the id is the
     * whole of the index and there is nothing to keep in step. The document is
     * versioned and cleaned on the way in for the same reason the board's is —
     * a hand-edited store can only produce something this build can draw — and
     * a blank line is read as "no note" rather than as a note of nothing.
     * @returns {object} the store.
     */
    function makeNoteStore() {
      /** The last serialized form written, so an unchanged one is not rewritten. */
      var written = ''

      /** Whatever was stored, reduced to `id -> line` for the notes still set. */
      function readAll() {
        var parsed = null
        try {
          parsed = JSON.parse(window.localStorage.getItem(NOTE_KEY) || 'null')
        } catch (error) {
          parsed = null
        }
        if (!parsed || parsed.v !== 1 || !parsed.notes || typeof parsed.notes !== 'object') return {}
        var notes = {}
        for (var id in parsed.notes) {
          if (!Object.prototype.hasOwnProperty.call(parsed.notes, id)) continue
          if (typeof parsed.notes[id] !== 'string') continue
          var line = parsed.notes[id].trim()
          if (!line) continue
          notes[id] = line
        }
        return notes
      }

      /** Write the map back unless it is what was written last time. */
      function save(notes) {
        var serialized = JSON.stringify({ v: 1, notes: notes })
        if (serialized === written) return
        written = serialized
        try {
          window.localStorage.setItem(NOTE_KEY, serialized)
        } catch (error) {
          console.warn('[dsh-vim] the note could not be stored', error)
        }
      }

      return {
        /**
         * The line pinned to one conversation, or '' while it has none.
         * @param {string} id - session id.
         * @returns {string} the line.
         */
        get(id) {
          return readAll()[id] || ''
        },

        /**
         * Pin a line to one conversation, replacing whatever it carried.
         *
         * An empty line is how a note is taken away: there is no second
         * gesture to remember, and nothing left behind pointing at nothing.
         * @param {string} id - session id.
         * @param {string} text - the line, trimmed.
         * @returns {string} what was kept — '' when the note was removed.
         */
        set(id, text) {
          var notes = readAll()
          var line = String(text || '').trim()
          if (!line) delete notes[id]
          else notes[id] = line
          save(notes)
          return line
        },
      }
    }

    var NOTE_STORE = makeNoteStore()

    /** Whether this process has contributed the board page and its sidebar entry. */
    var boardPageInstalled = false

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
     * Whether one right press landed inside the words the reader selected.
     *
     * A selection is a claim on the next press: the browser answers it with
     * Copy, and the shell's own text gestures live on it. The rects of the
     * selection are the browser's own rule for where it ends.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {boolean} whether the point sits inside the selection.
     */
    function pointInSelection(x, y) {
      if (typeof document.getSelection !== 'function') return false
      var selection
      try {
        selection = document.getSelection()
      } catch (error) {
        return false
      }
      if (!selection || !selection.rangeCount || selection.isCollapsed) return false
      for (var i = 0; i < selection.rangeCount; i++) {
        var range = selection.getRangeAt(i)
        if (!range || typeof range.getClientRects !== 'function') continue
        var rects
        try {
          rects = range.getClientRects()
        } catch (error) {
          continue
        }
        for (var r = 0; r < rects.length; r++) {
          if (x >= rects[r].left && x <= rects[r].right
            && y >= rects[r].top && y <= rects[r].bottom) return true
        }
      }
      return false
    }

    /**
     * The way back from a conversation: a right press on its page.
     *
     * The conversation's own right button is unemployed — the shell keeps its
     * context menus in the sidebar, and the transcript answers a right press
     * with nothing at all — so the one button with no meaning becomes the
     * shortest way back to the board the conversation was entered from. The
     * press is read from the conversation's own body (the shell marks it, and
     * the sidebar, other pages and every floating window do not carry the
     * mark), and three presses keep the meaning they already have: one some
     * other handler answered first, one in the box being typed into, and one
     * inside a text selection, which is a copy.
     * @param {object} ev - the contextmenu event.
     * @returns {void}
     */
    function onContextMenu(ev) {
      var target = ev && ev.target
      if (!target || target.nodeType !== 1) return
      if (ev.defaultPrevented) return
      if (typeof target.closest !== 'function') return
      if (!target.closest('[data-conversation-content]')) return
      if (isEditable(target)) return
      if (pointInSelection(Number(ev.clientX) || 0, Number(ev.clientY) || 0)) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      showBoard()
    }

    /**
     * Start typing the line on one card.
     *
     * The field is drawn by the next repaint, which is why the focus is asked
     * for there rather than here: the node does not exist yet.
     * @param {string} id - session id.
     * @returns {void}
     */
    function beginBoardNote(id) {
      BOARD.noteEditing = id
      renderBoard()
    }

    /**
     * Keep what the open field says, and close it.
     *
     * An empty line is how a note is taken away; there is no second gesture to
     * remember. Called by a blur as well as by Enter, so a press elsewhere keeps
     * the sentence instead of throwing it away.
     * @returns {boolean} whether a field was open.
     */
    function commitBoardNote() {
      if (!BOARD.noteEditing) return false
      var editor = BOARD.noteEditor
      var id = BOARD.noteEditing
      BOARD.noteEditing = ''
      BOARD.noteEditor = null
      NOTE_STORE.set(id, editor ? editor.value : '')
      renderBoard()
      return true
    }

    /**
     * Throw the open field away, leaving the card as it was.
     * @returns {boolean} whether a field was open.
     */
    function cancelBoardNote() {
      if (!BOARD.noteEditing) return false
      BOARD.noteEditing = ''
      BOARD.noteEditor = null
      renderBoard()
      return true
    }

    /**
     * The note key: open the board on the conversation on screen, with its
     * field waiting.
     *
     * The key names a conversation rather than a place, so it works from the
     * conversation, from the task window and from the board itself.
     * @returns {boolean} whether a board with a field is up.
     */
    function openNote() {
      var current = currentSession()
      if (!current || !current.id) {
        showToast(paletteText('noteNoSession'))
        return false
      }
      BOARD.noteEditing = current.id
      if (!showBoard()) {
        BOARD.noteEditing = ''
        return false
      }
      // A board that is already up is one repaint behind; a page that mounted
      // just now already drew the field. Either way, draw it here and let the
      // repaint put the caret in the field it builds.
      if (BOARD.open) renderBoard()
      return true
    }

    // ---------------------------------------------------------------------
    // board
    // ---------------------------------------------------------------------

    /**
     * Put one conversation on the board by hand.
     *
     * The board is a day's view: a conversation it has not seen move since
     * midnight is gone from it, and until now the only way to keep one was the
     * ★ on the card itself - which meant the card had to still be there. This
     * is the way in from the conversation: one press, and the mark that
     * outlives the day's boundary is set.
     *
     * A conversation taken off the board is taken off until it moves again.
     * Asking for it by hand is a later decision than that one, so the deletion
     * is lifted as well.
     * @param {string} [id] - the conversation; the one on screen when omitted.
     * @returns {boolean} whether a conversation was found to put there.
     */
    function pinToBoard(id) {
      var target = id
      if (!target) {
        var current = currentSession()
        target = current && current.id ? current.id : ''
      }
      if (!target) {
        showToast(paletteText('pinNoSession'))
        return false
      }
      var already = BOARD_STORE.isStarred(target)
      BOARD_STORE.unmute(target)
      if (!already) BOARD_STORE.toggleStar(target)
      if (BOARD.open && !BOARD.noteEditing) renderBoard()
      showToast(paletteText(already ? 'pinAlready' : 'pinDone'))
      return true
    }

    /**
     * Midnight today, in the reader's own zone.
     *
     * The inbox answers "what has been moving today", and that boundary is the
     * reader's clock rather than UTC: a conversation touched at 23:40 belongs to
     * the evening it was touched in.
     * @returns {number} epoch milliseconds of the local day's first instant.
     */
    function startOfToday() {
      var midnight = new Date(Date.now())
      midnight.setHours(0, 0, 0, 0)
      return midnight.getTime()
    }

    /** The one sessions-service `fork` this process wrapped, so a rebuild does not wrap twice. */
    var FORK_WATCH = null

    /**
     * The canvas as it is drawn: one block per workspace in play, the
     * conversations under it, and an inbox for what no workspace accounts for.
     *
     * A workspace is in play when one of its conversations moved today or is
     * marked ★ — the mark is the one thing that keeps a conversation past the
     * day it last moved. The pool is asked rather than the workspace registry
     * for that: the registry carries no activity clock, so "today" is a fact
     * about the conversations, not about the workspace.
     *
     * The pool is the task window's own, so the two windows agree about what a
     * conversation is: no subagent children, no blank placeholders, no archived
     * ones.
     * @param {Array<object>} pool - the catalogue, newest first.
     * @returns {Array<object>} blocks in draw order: workspaces newest first, the inbox last.
     */
    /**
     * One goal, by the id a card is filed under.
     *
     * The two kinds a placement can name are the kinds the canvas already has:
     * a workspace, and the inbox. Anything else is a record this build cannot
     * honour, and the card falls back to the goal its workspace implies.
     * @param {string} key - block id.
     * @returns {{key: string, label: string, path: string, kind: string}|null}
     */
    function goalByKey(key) {
      if (!key) return null
      if (key === BOARD_INBOX) {
        return { key: key, label: paletteText('boardInbox'), path: '', kind: 'inbox' }
      }
      var known = folderById(key)
      if (known) return { key: key, label: known.label, path: known.path, kind: 'workspace' }
      // A goal the board made itself, for a card the reader pulled out onto the
      // paper: it has no workspace behind it, and its name is the whole of it.
      var named = BOARD_STORE.blockLabel(key)
      if (named || BOARD_STORE.blocks()[key]) {
        return { key: key, label: named || paletteText('boardNewGoal'), path: '', kind: 'user' }
      }
      return null
    }

    /**
     * The name a goal cut from a card starts with: the one it came from, plus
     * the first number that is not taken.
     *
     * Pulling a card out of a goal is asking for it to stand on its own, so the
     * goal it gets is named after the one it left - `dsh-vim 2`, `dsh-vim 3` -
     * which says where it came from without the reader having to name it.
     * @param {string} label - the goal the card came from.
     * @returns {string} a name that no goal on this board is using.
     */
    function nextGoalName(label) {
      var base = String(label || '').trim() || paletteText('boardNewGoal')
      var names = BOARD_STORE.blockLabels()
      var used = 1
      for (var key in names) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) continue
        var text = String(names[key] || '')
        if (text === base || text.indexOf(base + ' ') === 0) used = used + 1
      }
      return base + ' ' + (used + 1)
    }

    function boardBlocks(pool) {
      var since = startOfToday()
      var folders = folderIndex()
      var groups = Object.create(null)
      var blocks = []
      var inbox = null
      for (var i = 0; i < pool.length; i++) {
        var row = pool[i]
        // Deleted is deleted until it moves again: the mark is held against the
        // moment it was last touched, so a conversation that gets a new message
        // afterwards is back in play and belongs here again.
        if (BOARD_STORE.isMuted(row.id, row.updatedAt)) continue
        var marked = BOARD_STORE.isStarred(row.id)
        if (BOARD.onlyStarred && !marked) continue
        if (!marked && (Number(row.updatedAt) || 0) < since) continue
        // Which goal this card is drawn in: the one the reader moved it to when
        // there is one, else the one its workspace implies, else the inbox.
        var folder = folders[row.id]
        var goal = null
        var movedTo = BOARD_STORE.placementOf(row.id)
        if (movedTo) goal = goalByKey(movedTo)
        if (!goal) {
          goal = folder && folder.id
            ? { key: folder.id, label: folder.label, path: folder.path, kind: 'workspace' }
            : { key: BOARD_INBOX, label: paletteText('boardInbox'), path: '', kind: 'inbox' }
        }
        var block = groups[goal.key]
        if (!block) {
          // The name the reader gave this goal, else the one it was cut from: a
          // panel starts out meaning "this workspace" and usually becomes
          // something the reader is working toward.
          block = groups[goal.key] = {
            key: goal.key,
            label: BOARD_STORE.blockLabel(goal.key) || goal.label,
            intent: BOARD_STORE.intentOf(goal.key) || '',
            path: goal.path,
            kind: goal.kind,
            rows: [],
          }
          // The inbox is drawn last, so it is not pushed here: the canvas reads
          // workspaces first and the place for everything else after them.
          if (goal.kind === 'inbox') inbox = block
          else blocks.push(block)
        }
        block.rows.push(row)
      }
      // Every goal is drawn in the order the reader knows it by. The new arrivals
      // are appended now, once, so the panel never re-sorts itself later: a
      // conversation that starts running keeps the place it already had.
      for (var b = 0; b < blocks.length; b++) {
        var rowsHere = blocks[b].rows
        if (!rowsHere.length) continue
        var idsHere = []
        for (var r = 0; r < rowsHere.length; r++) idsHere.push(rowsHere[r].id)
        var orderHere = BOARD_STORE.rememberOrder(blocks[b].key, idsHere)
        var rank = Object.create(null)
        for (var o = 0; o < orderHere.length; o++) rank[orderHere[o]] = o
        blocks[b].rows = rowsHere.slice().sort(function (left, right) {
          var a = rank[left.id] === undefined ? Number.MAX_SAFE_INTEGER : rank[left.id]
          var c = rank[right.id] === undefined ? Number.MAX_SAFE_INTEGER : rank[right.id]
          return a - c
        })
      }
      var places = BOARD_STORE.placements()
      var names = BOARD_STORE.blockLabels()
      var intents = BOARD_STORE.intents()
      var keep = []
      var movedId
      for (movedId in places) {
        if (!Object.prototype.hasOwnProperty.call(places, movedId)) continue
        keep.push(places[movedId])
      }
      // A goal stays for one of two reasons: a conversation was filed here, or
      // the reader said what it is for. A name is a label, not a reason - an
      // empty panel that was only renamed is a place with nothing happening in
      // it, and it does not get to hold a spot on the canvas.
      var stated
      for (stated in intents) {
        if (!Object.prototype.hasOwnProperty.call(intents, stated)) continue
        keep.push(stated)
      }
      // A goal the toolbar just stood is drawn too, though nothing holds it yet:
      // it is holding a decision, and a decision has until the board closes.
      var draft
      for (draft in BOARD.drafts) {
        if (!Object.prototype.hasOwnProperty.call(BOARD.drafts, draft)) continue
        keep.push(draft)
      }
      for (var k = 0; k < keep.length; k++) {
        var held = keep[k]
        if (!held || held === BOARD_INBOX || groups[held]) continue
        var known = goalByKey(held)
        if (!known) continue
        groups[held] = {
          key: held,
          label: names[held] || known.label,
          intent: intents[held] || '',
          path: known.path,
          kind: known.kind,
          rows: [],
        }
        blocks.push(groups[held])
      }
      if (!inbox) {        inbox = {
          key: BOARD_INBOX,
          label: BOARD_STORE.blockLabel(BOARD_INBOX) || paletteText('boardInbox'),
          intent: '',
          path: '',
          kind: 'inbox',
          rows: [],
        }
      }
      // The inbox is a place on the canvas even when it holds nothing, so the
      // reader always has somewhere to look for what a workspace did not claim.
      blocks.push(inbox)
      // Whatever the old arrangement still holds for a goal this paint no longer
      // draws is litter: the place it recorded, the name it used, the sentence
      // it said. A goal that is gone takes all three with it.
      var drawn = []
      for (var b = 0; b < blocks.length; b++) drawn.push(blocks[b].key)
      BOARD_STORE.pruneGoals(drawn)
      return blocks
    }

    /**
     * Record a fork this plugin watched, and repaint a board that is up.
     *
     * @param {string} parentId - the conversation the branch was cut from.
     * @param {string} childId - the conversation the branch became.
     * @returns {boolean} whether a new line was recorded.
     */
    function rememberFork(parentId, childId) {
      if (!parentId || !childId) return false
      var parent = String(parentId)
      var child = String(childId)
      var added = BOARD_STORE.rememberFork(child, parent)
      var homed = inheritForkHome(parent, child)
      if ((added || homed) && BOARD.open && !BOARD.noteEditing) renderBoard()
      return added || homed
    }

    /**
     * File a branch in the goal its parent is in.
     *
     * A conversation belongs to a goal, and a branch cut from it belongs beside
     * it: the line the board draws has two ends, and a child drawn in another
     * panel has no line at all. A filing the reader made is copied as it stands.
     * A card sitting in a workspace panel is copied only while the board is up to
     * say which panel that was - the shell's own fork does not name where it came
     * from, so with the board closed there is nothing to copy and nothing to
     * guess.
     * @param {string} parentId - the conversation the branch was cut from.
     * @param {string} childId - the branch.
     * @returns {boolean} whether the child was filed somewhere new.
     */
    function inheritForkHome(parentId, childId) {
      var goal = BOARD_STORE.placementOf(parentId)
      if (!goal && BOARD.open) {
        var home = boardHomeOf(parentId)
        goal = home ? home.key : ''
      }
      if (!goal) return false
      if (BOARD_STORE.placementOf(childId) === goal) return false
      return BOARD_STORE.placeSession(childId, goal)
    }

    /**
     * Bring one card into view, without moving the paper any further than it
     * has to.
     *
     * A branch lands under the card it was cut from, which may stand below
     * the fold of a long panel: a panel is laid out whole now, so the one
     * scroller left is the paper itself, and `nearest` moves it just far
     * enough. The reader who asked for the branch would otherwise be
     * looking at a board that did not change.
     * @param {string} id - session id.
     * @returns {void}
     */
    function revealBoardCard(id) {
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var drawn = BOARD.stage.querySelectorAll('[data-session-id]')
      for (var i = 0; i < drawn.length; i++) {
        if (drawn[i].getAttribute('data-session-id') !== id) continue
        if (typeof drawn[i].scrollIntoView === 'function') drawn[i].scrollIntoView({ block: 'nearest' })
        return
      }
    }

    /**
     * Watch the sessions service for forks, so a branch made anywhere in the
     * shell gets its line here.
     *
     * The host writes no durable parent onto an ordinary fork — the child is a
     * prefix of the source's events, and its header does not name where it came
     * from — so the only honest way to draw a line is to be standing there when
     * the branch is made. Wrapping `fork` observes every caller (the sidebar,
     * the shortcut, and this board's own mark) without changing what any of
     * them get back; a refusal propagates untouched. A host whose service
     * refuses the wrap simply gets the lines this board makes itself.
     * @returns {boolean} whether this process is watching.
     */
    function watchForks() {
      var services = taskServices()
      var controller = services && services.controller
      if (!controller || typeof controller.fork !== 'function') return false
      if (FORK_WATCH && FORK_WATCH.controller === controller && controller.fork === FORK_WATCH.wrapped) {
        return true
      }
      var original = controller.fork
      /** The same fork, with the one fact it does not return remembered beside it. */
      var wrapped = function (options) {
        var result = original.apply(this, arguments)
        if (!result || typeof result.then !== 'function') return result
        var parentId = options && options.sessionId
        return result.then(function (childId) {
          rememberFork(parentId, childId)
          return childId
        })
      }
      try {
        controller.fork = wrapped
      } catch (error) {
        console.warn('[dsh-vim] could not watch session forks', error)
        return false
      }
      if (controller.fork !== wrapped) return false
      FORK_WATCH = { controller: controller, wrapped: wrapped }
      return true
    }

    /**
     * The places the blocks will be drawn at.
     *
     * A stored place wins; a block this build has never seen is packed into the
     * first free grid slot and written down, so a workspace that arrives while
     * the reader is working lands somewhere quiet and stays there next time.
     * @param {Array<object>} blocks - the blocks about to be drawn.
     * @param {object} [heights] - block key -> the height it last measured;
     *   the packing steps over what a standing panel really occupies.
     * @returns {object} block key -> `{x, y}`.
     */
    function boardPlaces(blocks, heights) {
      var stored = BOARD_STORE.blocks()
      var places = Object.create(null)
      var i
      for (i = 0; i < blocks.length; i++) {
        var known = stored[blocks[i].key]
        if (known) places[blocks[i].key] = { x: known.x, y: known.y }
      }
      for (i = 0; i < blocks.length; i++) {
        if (places[blocks[i].key]) continue
        var place = firstFreeSlot(places, heights)
        BOARD_STORE.placeBlock(blocks[i].key, place.x, place.y)
        places[blocks[i].key] = place
      }
      return places
    }

    /** The first grid slot no block already stands on. */
    function firstFreeSlot(places, heights) {
      for (var cursor = 0; cursor < 400; cursor++) {
        var column = cursor % BOARD_BLOCK_COLUMNS
        var row = Math.floor(cursor / BOARD_BLOCK_COLUMNS)
        var x = BOARD_CANVAS_EDGE + column * BOARD_BLOCK_PITCH_X
        var y = BOARD_CANVAS_EDGE + row * BOARD_BLOCK_PITCH_Y
        if (!slotTaken(places, heights, x, y)) return { x: x, y: y }
      }
      return { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
    }

    /**
     * Whether a block already stands on a place.
     *
     * A panel owns the paper down to its own measured bottom, not just to the
     * grid's height — a goal with a long list of conversations hangs past
     * the row it was given, and a block set down on the row below it would
     * land on its cards. The room a panel keeps is never smaller than the
     * grid's own height, so a panel that stands shorter than its row (a quiet
     * goal, or a folded one) still holds the whole of it, and the block that
     * fills in beneath cannot be covered by the panel growing back.
     * @param {object} places - block key -> `{x, y}`.
     * @param {object} [heights] - block key -> measured height; a height
     *   nobody knows is the grid's own.
     * @param {number} x - the place in question.
     * @param {number} y - the place in question.
     * @returns {boolean} whether some panel stands there.
     */
    function slotTaken(places, heights, x, y) {
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        var place = places[key]
        if (Math.abs(place.x - x) >= BOARD_BLOCK_W) continue
        var tall = heights && heights[key] ? Math.max(heights[key], BOARD_BLOCK_H) : BOARD_BLOCK_H
        if (y >= place.y + tall || place.y >= y + BOARD_BLOCK_H) continue
        return true
      }
      return false
    }

    /**
     * How tall each painted panel stands, keyed by the block it is.
     *
     * Read off the page, for the two moments that need it: a paint about to
     * be taken down tells the next paint how much paper its panels occupy,
     * and the decisions made while the board is up (a new goal, a fresh
     * card) step over what is really standing. A panel is as tall as its
     * conversations now, so the height it measured is the only honest word
     * on where its bottom is. A host that reports no boxes — and the first
     * paint of all, before anything is drawn — answers nothing, and the
     * height every panel is planned at stands in.
     * @returns {object} block key -> height in unzoomed pixels.
     */
    function boardPanelHeights() {
      var out = Object.create(null)
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return out
      var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
      for (var i = 0; i < painted.length; i++) {
        var key = painted[i].getAttribute('data-block')
        var tall = Number(painted[i].offsetHeight) || 0
        if (key && tall > 0) out[key] = tall
      }
      return out
    }

    /**
     * How big the stage has to be to hold everything on it.
     *
     * Read off the stored places and the heights the panels measured, rather
     * than off the boxes as they are dragged: a drag moves a panel without a
     * repaint, and this size is only ever written by one. The heights are
     * what the panels themselves decided — a goal stands as tall as its
     * conversations — so the paper covers the bottom of the tallest of them,
     * and the reader's scrollbars describe the work that is actually there.
     * @param {object} places - block key -> `{x, y}`.
     * @param {object} [heights] - block key -> measured height; unknown
     *   heights fall back to the height every panel is planned at.
     * @returns {{width: number, height: number}} the stage, in pixels.
     */
    function boardExtent(places, heights) {
      var width = 720
      var height = 520
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        var place = places[key]
        width = Math.max(width, place.x + BOARD_BLOCK_W + BOARD_CANVAS_EDGE)
        var tall = heights && heights[key] ? heights[key] : BOARD_BLOCK_H
        height = Math.max(height, place.y + tall + BOARD_CANVAS_EDGE)
      }
      var cards = BOARD_STORE.cards()
      for (var i = 0; i < cards.length; i++) {
        width = Math.max(width, cards[i].x + BOARD_CARD_W + BOARD_CANVAS_EDGE)
        height = Math.max(height, cards[i].y + boardCardBox(cards[i].text, cards[i].h).height + BOARD_CANVAS_EDGE)
      }
      return { width: width, height: height }
    }

    /**
     * Put the canvas's magnification on the paper.
     *
     * The stage is drawn at its true size and scaled; the paper around it is
     * sized to the magnified extent so the scrollbars describe what the eye
     * sees. Called on every repaint and on every zoom, and it touches nothing
     * but those three boxes and the readout.
     * @returns {void}
     */
    function applyBoardZoom() {
      if (!BOARD.stage || !BOARD.sizer) return
      var extent = BOARD.extent
      var zoom = BOARD.zoom || 1
      BOARD.stage.style.width = extent.width + 'px'
      BOARD.stage.style.height = extent.height + 'px'
      BOARD.stage.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')'
      BOARD.sizer.style.width = Math.ceil(extent.width * zoom) + 'px'
      BOARD.sizer.style.height = Math.ceil(extent.height * zoom) + 'px'
      if (BOARD.zoomLabel) BOARD.zoomLabel.textContent = Math.round(zoom * 100) + '%'
    }

    /**
     * Zoom the canvas, keeping one point of it where it is on screen.
     *
     * The anchor is what makes a wheel zoom feel like the paper is being
     * pushed rather than the view being reset: the content point under the
     * pointer stays under the pointer.
     * @param {number} value - the wanted magnification.
     * @param {number} [anchorX] - screen x within the viewport; centre by default.
     * @param {number} [anchorY] - screen y within the viewport; centre by default.
     * @returns {boolean} whether the zoom changed.
     */
    function setBoardZoom(value, anchorX, anchorY) {
      if (!BOARD.open || !BOARD.body) return false
      var next = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, Number(value) || 1))
      if (Math.abs(next - BOARD.zoom) < 0.001) return false
      var body = BOARD.body
      var ax = typeof anchorX === 'number' ? anchorX : (body.clientWidth || 0) / 2
      var ay = typeof anchorY === 'number' ? anchorY : (body.clientHeight || 0) / 2
      var contentX = (body.scrollLeft + ax) / BOARD.zoom
      var contentY = (body.scrollTop + ay) / BOARD.zoom
      BOARD.zoom = next
      BOARD_STORE.setZoom(next)
      applyBoardZoom()
      body.scrollLeft = Math.max(0, contentX * next - ax)
      body.scrollTop = Math.max(0, contentY * next - ay)
      return true
    }

    /**
     * Ctrl/Cmd + wheel zooms the canvas, the way every canvas does.
     * @param {WheelEvent} ev - the wheel.
     * @returns {void}
     */
    function onBoardWheel(ev) {
      if (!ev || (!ev.ctrlKey && !ev.metaKey)) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      var rect = BOARD.body && typeof BOARD.body.getBoundingClientRect === 'function'
        ? BOARD.body.getBoundingClientRect()
        : { left: 0, top: 0 }
      var factor = Number(ev.deltaY) < 0 ? 1.1 : 1 / 1.1
      setBoardZoom(BOARD.zoom * factor, (Number(ev.clientX) || 0) - rect.left, (Number(ev.clientY) || 0) - rect.top)
    }

    /**
     * Where a new loose card goes when the reader did not point at a place.
     *
     * Below everything already on the canvas, at the left edge: a card written
     * from the heading is a thought the reader has not placed yet, so it must
     * not land on top of the work they are looking at. "Below everything" is
     * measured — a goal with a long list hangs past its grid row, and the
     * card belongs under its real bottom, not under the row the grid gave it.
     * @returns {{x: number, y: number}} the place.
     */
    function nextCardPlace() {
      var bottom = 0
      var places = BOARD_STORE.blocks()
      var talls = boardPanelHeights()
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        bottom = Math.max(bottom, places[key].y + (talls[key] ? Math.max(talls[key], BOARD_BLOCK_H) : BOARD_BLOCK_H))
      }
      var cards = BOARD_STORE.cards()
      for (var i = 0; i < cards.length; i++) {
        bottom = Math.max(bottom, cards[i].y + boardCardBox(cards[i].text, cards[i].h).height)
      }
      return {
        x: BOARD_CANVAS_EDGE,
        y: bottom ? bottom + BOARD_BLOCK_GAP_Y : BOARD_CANVAS_EDGE,
      }
    }

    /**
     * A place on the paper for a goal that was just asked for, near the eye.
     *
     * The middle of what is on screen is where the reader is looking, so that is
     * where a new goal wants to be. A place another panel already stands on is
     * stepped over rather than covered: a goal drawn on top of one is a goal
     * nobody can read, and the reader would have to move it before it was of any
     * use at all. Stepping goes by what the standing panels measure — a tall
     * one owns the paper down to its own bottom — and never by less than a
     * grid row, so the goal that lands beneath a short one still has the room
     * it was promised.
     * @returns {{x: number, y: number}} canvas coordinates.
     */
    function boardFreePlace() {
      var body = BOARD.body
      var zoom = BOARD.zoom || 1
      var left = body ? Number(body.scrollLeft) || 0 : 0
      var top = body ? Number(body.scrollTop) || 0 : 0
      var wide = body && body.clientWidth ? body.clientWidth : BOARD_BLOCK_W
      var tall = body && body.clientHeight ? body.clientHeight : BOARD_BLOCK_H
      var x = Math.max(BOARD_CANVAS_EDGE, Math.round((left + wide / 2) / zoom - BOARD_BLOCK_W / 2))
      var y = Math.max(BOARD_CANVAS_EDGE, Math.round((top + tall / 2) / zoom - BOARD_BLOCK_H / 2))
      var taken = BOARD_STORE.blocks()
      var talls = boardPanelHeights()
      for (var step = 0; step < 24; step++) {
        var clash = false
        for (var key in taken) {
          if (!Object.prototype.hasOwnProperty.call(taken, key)) continue
          var at = taken[key]
          if (!at) continue
          if (Math.abs(at.x - x) >= BOARD_BLOCK_PITCH_X - 8) continue
          var stands = talls[key] ? Math.max(talls[key], BOARD_BLOCK_H) : BOARD_BLOCK_H
          if (y >= at.y + stands + BOARD_BLOCK_GAP_Y - 8) continue
          if (at.y >= y + BOARD_BLOCK_H + BOARD_BLOCK_GAP_Y - 8) continue
          clash = true
          break
        }
        if (!clash) return { x: x, y: y }
        y = y + BOARD_BLOCK_PITCH_Y
      }
      return { x: x, y: y }
    }

    /**
     * Stand a new goal on the canvas, ready to be given a purpose.
     *
     * A goal used to be something only a conversation could make, which is the
     * wrong way round for work that has not started: the place to write down
     * what is to be done should exist before the first conversation about it.
     * The line opens with the panel, so the next thing typed is what keeps it
     * there.
     * @returns {void}
     */
    function addBoardGoal() {
      var place = boardFreePlace()
      var key = BOARD_STORE.addGoal('', place.x, place.y)
      if (!key) return
      // Held while the board is up: a goal with nothing in it and nothing said
      // about it is a place nobody is working in, and the rule that clears those
      // must not take the one being named out from under the caret.
      BOARD.drafts[key] = true
      BOARD.intentBlock = key
      BOARD.intentInput = null
      renderBoard()
      showToast(paletteText('boardGoalAdded'))
    }

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
     * Show the sheet that asks for a conversation's name and first message.
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
     * The title becomes the name; the body becomes the first message. A title
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
     * @param {string} text - the first message; empty leaves it unsaid.
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
      // A conversation needs a name or a first message. Either one alone is a
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
        if (BOARD.open) renderBoard()
      }
      Promise.resolve(sessions.create({ workspaceId: workspaceId })).then(function (created) {
        sessionId = String(created || '')
        if (!sessionId) throw new Error(paletteText('boardNewSessionUnavailable'))
        // The card is where the reader pointed, not where the workspace would
        // have put it: file it before opening so the next board agrees.
        BOARD_STORE.placeSession(sessionId, goalKey)
        activateSession(sessionId)
        // The Session exists and is open: a second request from here is a
        // second conversation on purpose, not a double press on one button.
        // The prompt's own admission can stay open on the host, and it must not
        // keep the board's plus answering "busy" for the rest of the visit.
        BOARD.newSessionBusy = false
        paintNewSessionBusy()
        // The model goes on before the words do: the first message is the one
        // that shows which model made it. Both happen on this conversation, so
        // a sheet that chose a model and wrote nothing still gets the model.
        return applyNewSessionModel(sessionId, picked).then(function () {
          // Nothing said yet is not a message to send: a conversation made from
          // a title alone opens with its composer waiting. A card always carries
          // words, so this half only comes from the sheet.
          if (!body) return null
          return sessions.using(sessionId, { source: PEEK_SOURCE }, function (reference) {
            var session = reference && reference.binding && reference.binding.session
            if (!session || typeof session.prompt !== 'function') {
              throw new Error(paletteText('boardNewSessionUnavailable'))
            }
            return session.prompt([{ type: 'text', text: body }], 'queue')
          })
        })
      }).then(function (result) {
        if (result && result.ok === false) {
          throw result.error ? { error: result.error } : new Error(paletteText('boardNewSessionUnavailable'))
        }
        if (cardId) BOARD_STORE.finishCard(cardId, sessionId)
        if (name) {
          renameSession(sessionId, name, function (reason) {
            if (reason) console.warn('[dsh-vim] new session rename refused', reason)
          })
        }
        BOARD.newSessionBusy = false
        paintNewSessionBusy()
        if (cardId) showToast(paletteText('boardNewSessionDropped'))
        else showToast(paletteText('boardNewSessionCreated') + (name || noteParts(body).title))
        if (BOARD.open) renderBoard()
      }).catch(fail)
      return true
    }

    // ---------------------------------------------------------------------
    // tidying the canvas
    // ---------------------------------------------------------------------

    /**
     * The panels as a tidy sees them: a rectangle of paper, the conversations
     * it holds, and where each of those conversations was last drawn.
     *
     * Read once, before any card moves. A column laid out against a
     * conversation the repaint has not drawn yet would have to be laid out
     * twice, and the second layout is the one the reader would see jump.
     * @returns {Array<object>} one record per panel, in draw order.
     */
    function tidyPanels() {
      var stored = BOARD_STORE.blocks()
      var stage = BOARD.stage
      var stageRect = stage && typeof stage.getBoundingClientRect === 'function'
        ? stage.getBoundingClientRect()
        : null
      var zoom = BOARD.zoom || 1
      var measured = Object.create(null)
      if (stageRect && typeof stage.querySelectorAll === 'function') {
        var panels = stage.querySelectorAll('[data-role="workspaceBlock"]')
        for (var p = 0; p < panels.length; p++) {
          var panelKey = panels[p].getAttribute('data-block')
          var panelRect = panels[p].getBoundingClientRect()
          if (!panelKey || !panelRect || !panelRect.height) continue
          measured[panelKey] = {
            height: panelRect.height / zoom,
          }
        }
      }
      // Where each conversation stands, in paper coordinates. A host that
      // reports no boxes leaves this empty, and the column then starts at its
      // panel's heading instead - the same place, one measurement worse.
      var anchors = Object.create(null)
      if (stageRect) {
        for (var n = 0; n < BOARD.nodes.length; n++) {
          var node = BOARD.nodes[n]
          var sessionId = node.getAttribute('data-session-id')
          if (!sessionId) continue
          var rect = node.getBoundingClientRect()
          if (!rect || (!rect.width && !rect.height)) continue
          anchors[sessionId] = (rect.top - stageRect.top) / zoom
        }
      }
      var records = []
      for (var i = 0; i < BOARD.blocks.length; i++) {
        var block = BOARD.blocks[i]
        var place = stored[block.key] || { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
        var folded = BOARD_STORE.isFolded(block.key)
        var box = measured[block.key]
        var sessions = []
        for (var r = 0; r < block.rows.length; r++) sessions.push(block.rows[r].id)
        records.push({
          key: block.key,
          kind: block.kind,
          x: place.x,
          y: place.y,
          width: BOARD_BLOCK_W,
          height: box ? box.height : folded ? BOARD_BLOCK_HEAD_H : BOARD_BLOCK_H,
          folded: folded,
          sessions: sessions,
          anchors: anchors,
        })
      }
      return records
    }

    /**
     * Which panel a card belongs beside, if any.
     *
     * A card belongs to the conversation it was tied to, and to nothing else. A
     * tie whose conversation is not on this canvas today - folded away, taken
     * off, or filtered out - has nowhere to be pinned, and that card goes to
     * the inbox with the thoughts that were never tied at all.
     * @param {object} card - the loose card.
     * @param {Array<object>} panels - the panels, in draw order.
     * @returns {{panel: number, order: number, sessionId: string}|null} its home.
     */
    function tidyHomeOf(card, panels) {
      if (!card || !card.link) return null
      for (var p = 0; p < panels.length; p++) {
        var sessions = panels[p].sessions
        for (var s = 0; s < sessions.length; s++) {
          if (sessions[s] !== card.link) continue
          return { panel: p, order: s, sessionId: card.link }
        }
      }
      return null
    }

    /**
     * The first x at or right of `x` that no panel already stands in.
     *
     * A column of cards may stand in front of the paper, never on top of a
     * panel: two panels one pitch apart leave 32px between them, which is not a
     * card wide. One pass per blocker, and the guard is what a hand-edited
     * document with every panel piled on one spot cannot turn into a loop.
     * @param {Array<object>} panels - the panels, in draw order.
     * @param {number} yTop - the column's first row.
     * @param {number} yBottom - the column's last row.
     * @param {number} x - where the column would rather stand.
     * @returns {number} where it can stand.
     */
    function tidyColumnX(panels, yTop, yBottom, x) {
      var left = x
      for (var guard = 0; guard < 8; guard++) {
        var blocker = null
        for (var p = 0; p < panels.length; p++) {
          var panel = panels[p]
          if (left + BOARD_CARD_W <= panel.x + 1) continue
          if (left >= panel.x + panel.width - 1) continue
          if (yBottom <= panel.y + 1 || yTop >= panel.y + panel.height - 1) continue
          blocker = panel
        }
        if (!blocker) return left
        left = blocker.x + blocker.width + BOARD_TIDY_GAP
      }
      return left
    }

    /** The order cards stand in beside their panel: the panel's own order. */
    function tidyBySession(left, right) {
      if (left.order !== right.order) return left.order - right.order
      return left.written - right.written
    }

    /** The order the inbox tray keeps: what is finished sinks to the bottom. */
    function tidyByTray(left, right) {
      var leftDone = left.card.done ? 1 : 0
      var rightDone = right.card.done ? 1 : 0
      if (leftDone !== rightDone) return leftDone - rightDone
      return left.written - right.written
    }

    /**
     * Lay one group of cards out as a column beside its panel.
     *
     * The column starts level with the panel's heading and runs down it; a card
     * tied to a conversation starts level with that conversation instead, so a
     * thought stands beside the work it is about. When the column runs out of
     * panel it starts another one to the right, rather than growing past the
     * paper the panel sits on.
     * @param {object} bucket - one panel's cards, or the inbox tray.
     * @param {Array<object>} panels - every panel, for keeping clear of them.
     * @param {Array<object>} moves - the places found so far.
     * @returns {void}
     */
    function tidyGroup(bucket, panels, moves) {
      var items = bucket.items
      if (!items.length) return
      items.sort(bucket.tray ? tidyByTray : tidyBySession)
      var panel = bucket.panel
      var top = panel ? panel.y + BOARD_BLOCK_HEAD_H : BOARD_CANVAS_EDGE
      var floor = panel && !bucket.tray ? panel.y + panel.height : Infinity
      var base = panel ? panel.x + panel.width + BOARD_TIDY_GAP : BOARD_CANVAS_EDGE
      var x = base
      if (bucket.tray) {
        // The tray is a queue, not a panel's column: it runs as long as it has
        // to, so only its whole run has to keep clear of what is beside it.
        var span = 0
        for (var t = 0; t < items.length; t++) {
          span += boardCardBox(items[t].card.text, items[t].card.h).height + BOARD_TIDY_STEP
        }
        x = tidyColumnX(panels, top, top + span, base)
      } else {
        x = tidyColumnX(panels, top, floor, base)
      }
      var column = 0
      var cursor = top
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        var height = boardCardBox(item.card.text, item.card.h).height
        var want = cursor
        var anchor = panel && item.sessionId && panel.anchors
          ? panel.anchors[item.sessionId]
          : null
        if (typeof anchor === 'number' && anchor > want) want = anchor
        if (floor !== Infinity && want + height > floor - BOARD_TIDY_STEP) {
          // This column is full unless the card is the first one in it: then it
          // is taller than the panel and the only honest place is its bottom.
          if (cursor > top) {
            column = column + 1
            x = tidyColumnX(panels, top, floor, base + column * (BOARD_CARD_W + BOARD_TIDY_STEP))
            cursor = top
            want = top
          }
          if (want + height > floor - BOARD_TIDY_STEP) want = Math.max(top, floor - height)
        }
        moves.push({ id: item.card.id, x: Math.round(x), y: Math.round(want) })
        cursor = want + height + BOARD_TIDY_STEP
      }
    }

    /**
     * Where every idea card belongs, as a list of places and a list of put-aways.
     *
     * The whole of tidying is here, and nothing here touches the page: give it
     * the cards and the panels, and it answers with what to do with them. Panels
     * are not moves - a tidy is about the thoughts pinned around the work, not
     * about the work - so no arrangement this returns can move a goal, a
     * conversation, or the goal a conversation was filed into.
     *
     * Two answers, because a thought has two ways of being done with: it can be
     * given a place on the paper, or it can leave it. A card that is finished and
     * tied to a conversation has stopped waiting beside the work, and the bin is
     * where it goes; everything else still belongs somewhere on the canvas.
     * @param {Array<object>} cards - the cards, in the order they were written.
     * @param {Array<object>} panels - the panels, in draw order.
     * @returns {{moves: Array<object>, filed: Array<string>}} where the cards go.
     */
    function tidyPlan(cards, panels) {
      var moves = []
      if (!cards || !cards.length || !panels || !panels.length) return moves
      var buckets = []
      var inbox = { panel: null, items: [], tray: true }
      var p
      for (p = 0; p < panels.length; p++) {
        buckets.push({ panel: panels[p], items: [], tray: false })
        if (panels[p].kind === 'inbox') inbox.panel = panels[p]
      }
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i]
        // A card already put away is not on the paper, so it is not something a
        // tidy has an opinion about.
        if (card.filed) continue
        var home = tidyHomeOf(card, panels)
        var bucket = home && buckets[home.panel] ? buckets[home.panel] : inbox
        bucket.items.push({
          card: card,
          sessionId: home ? home.sessionId : '',
          order: home ? home.order : i,
          written: i,
        })
      }
      for (var b = 0; b < buckets.length; b++) tidyGroup(buckets[b], panels, moves)
      tidyGroup(inbox, panels, moves)
      return moves
    }

    /**
     * Tidy the canvas: put every idea card where it belongs, and leave the
     * panels and the conversations in them exactly where they are.
     *
     * An idea card has two ways of being done with, and this press is the one
     * thing that decides between them: a card finished and tied to a conversation
     * leaves the canvas for the bin, a card tied to a conversation still being
     * worked on stands beside it, and everything else - a thought written on the
     * paper, or one whose conversation is not here today - goes to the inbox.
     * The places are written only once the cards have arrived, so a tidy the
     * reader cancels by leaving costs nothing; a put-away is written at once,
     * because that is the one part of it a press of Undo has to take back.
     * @returns {boolean} whether anything was moved.
     */
    function tidyBoard() {
      if (!BOARD.open || !BOARD.stage) return false
      if (BOARD.drag || BOARD.tidy || BOARD.glide) return false
      // A card being typed into is about to move: what it says is folded in
      // first, so the place it lands is the place its words ask for.
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
        BOARD.cardEditing = ''
        BOARD.cardEditor = null
      }
      var cards = BOARD_STORE.cards()
      if (!cards.length) return false
      var moves = tidyPlan(cards, tidyPanels())
      var batch = []
      for (var i = 0; i < moves.length; i++) {
        var node = BOARD.looseNodes[moves[i].id]
        if (!node) continue
        var fromX = Number(parseFloat(node.style.left)) || 0
        var fromY = Number(parseFloat(node.style.top)) || 0
        if (Math.abs(fromX - moves[i].x) < 1 && Math.abs(fromY - moves[i].y) < 1) continue
        batch.push({
          id: moves[i].id,
          node: node,
          fromX: fromX,
          fromY: fromY,
          toX: moves[i].x,
          toY: moves[i].y,
        })
      }
      if (!batch.length) return false
      if (typeof window.requestAnimationFrame !== 'function' || reducedMotion()) {
        for (var j = 0; j < batch.length; j++) {
          BOARD_STORE.moveCard(batch[j].id, batch[j].toX, batch[j].toY)
        }
        renderBoard()
        return true
      }
      glideTidyBatch(batch)
      return true
    }

    /**
     * Fly one tidy's cards to their places, a beat apart.
     *
     * A jump would read as the cards being taken away and different cards
     * appearing; a short ease reads as the canvas putting them away. The cards
     * leave in the order they were written, which is the order the eye followed
     * them in, and the lines are redrawn every frame so a tie stays attached on
     * the way.
     * @param {Array<object>} batch - the cards that move, with both places.
     * @returns {void}
     */
    function glideTidyBatch(batch) {
      BOARD.tidy = true
      var stagger = Math.min(24, Math.round(240 / batch.length))
      var total = BOARD_TIDY_GLIDE + stagger * (batch.length - 1)
      var started = 0
      for (var i = 0; i < batch.length; i++) {
        batch[i].delay = i * stagger
        var style = batch[i].node.style
        if (!style) continue
        // Airborne: above the paper it crosses, and not something the pointer
        // can pick up on the way.
        style.zIndex = String(BOARD.zTop + 20)
        style.pointerEvents = 'none'
        style.transform = 'scale(1.015)'
      }
      function settle() {
        BOARD.tidy = false
        for (var s = 0; s < batch.length; s++) {
          BOARD_STORE.moveCard(batch[s].id, batch[s].toX, batch[s].toY)
        }
        renderBoard()
      }
      function step(now) {
        if (!BOARD.open || !BOARD.stage) {
          BOARD.tidy = false
          return
        }
        if (!started) started = now
        var elapsed = now - started
        for (var k = 0; k < batch.length; k++) {
          var item = batch[k]
          if (!item.node.style) continue
          var at = (elapsed - item.delay) / BOARD_TIDY_GLIDE
          if (at <= 0) continue
          if (at > 1) at = 1
          var eased = 1 - Math.pow(1 - at, 3)
          item.node.style.left = (item.fromX + (item.toX - item.fromX) * eased) + 'px'
          item.node.style.top = (item.fromY + (item.toY - item.fromY) * eased) + 'px'
        }
        drawCardLinks()
        if (elapsed < total) {
          window.requestAnimationFrame(step)
          return
        }
        settle()
      }
      window.requestAnimationFrame(step)
    }

    /**
     * Mount the board.
     *
     * A board and a task window never share the page: both take the whole
     * keyboard and both answer Escape, so one of them being up is what keeps the
     * other from opening. That is checked here as well as in the key handler,
     * because the console can open either one directly.
     * @returns {boolean} whether the board is up.
     */
    function openBoard() {
      if (BOARD.open) return true
      if (PALETTE.open || MODELPICK.open) return false
      if (!taskServices()) return false
      if (!document.body) return false
      // A host that had not published the status source when this plugin woke
      // up gets a watch now: without one, no card could show how long its turn
      // has been going. The task window retries the same way.
      watchRuns()
      stopHold()
      stopAnim()
      // A window that takes the keyboard ends any claim the message box had on
      // it, the same way the task window does.
      clearFocusRequest()

      var host = document.createElement('div')
      Object.assign(host.style, BOARD_UI.backdrop)
      var panel = document.createElement('div')
      Object.assign(panel.style, BOARD_UI.panel)
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', paletteText('board'))
      panel.className = 'dshv-window'
      // A canvas is read at a glance from a distance, so it starts at the
      // reader's own preference or larger — never below what a title needs to be
      // read without leaning in. Everything inside is sized in em against this.
      panel.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
      host.appendChild(panel)
      document.body.appendChild(host)
      BOARD.host = host
      if (!mountBoardInto(panel, 'overlay')) {
        document.body.removeChild(host)
        BOARD.host = null
        return false
      }
      if (state.debug) console.log('[dsh-vim] board', BOARD.rows.length, 'conversations')
      return true
    }

    /**
     * Build the board's parts into a root element, whichever mount owns it.
     *
     * The overlay wraps this in a backdrop and a sheet; the sidebar page hands
     * it the page's own column. The header, the column strip and the footer are
     * the board in both, so a change here reaches both without a second
     * implementation to keep in step.
     * @param {Element} root - the element the board is built into.
     * @param {string} mode - 'overlay' or 'page'.
     * @returns {boolean} whether the board was mounted.
     */
    function mountBoardInto(root, mode) {
      if (BOARD.open) return false
      if (!taskServices()) return false
      watchRuns()
      // A page can open long after the branch was made, so the watch is also
      // started here rather than only when the plugin wakes.
      watchForks()
      stopHold()
      stopAnim()
      // A board that takes the keyboard ends any claim the message box had on
      // it; a page does not take the keyboard, so it leaves the claim alone.
      if (mode === 'overlay') clearFocusRequest()
      if (mode === 'page') {
        applyBoardPageInk(root)
        Object.assign(root.style, BOARD_PAGE_UI.surface)
        // A canvas is read at a glance from a distance, so it starts at the
        // reader's own preference or larger — never below what a title needs to
        // be read without leaning in.
        root.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
      }

      var header = document.createElement('div')
      Object.assign(header.style, mode === 'page' ? BOARD_PAGE_UI.header : BOARD_UI.header)
      var title = document.createElement('span')
      Object.assign(title.style, BOARD_UI.titleText)
      title.textContent = paletteText('board')
      var count = document.createElement('span')
      Object.assign(count.style, BOARD_UI.subtitle)
      var only = document.createElement('span')
      Object.assign(only.style, BOARD_UI.starFilter)
      only.setAttribute('role', 'button')
      only.setAttribute('data-role', 'starFilter')
      if (BOARD.onlyStarred) Object.assign(only.style, BOARD_UI.starFilterOn)
      only.textContent = paletteText('boardOnlyStarred')
      only.addEventListener('click', function () {
        BOARD.onlyStarred = !BOARD.onlyStarred
        renderBoard()
      })
      BOARD.starFilter = only
      var zoom = document.createElement('div')
      Object.assign(zoom.style, BOARD_UI.zoomBox)
      var zoomOut = document.createElement('span')
      Object.assign(zoomOut.style, BOARD_UI.zoomButton)
      zoomOut.setAttribute('role', 'button')
      zoomOut.setAttribute('data-role', 'zoomOut')
      zoomOut.setAttribute('title', paletteText('boardZoomOut'))
      zoomOut.textContent = '−'
      zoomOut.addEventListener('click', function () {
        setBoardZoom(BOARD.zoom / BOARD_ZOOM_STEP)
      })
      var zoomLabel = document.createElement('span')
      Object.assign(zoomLabel.style, BOARD_UI.zoomLabel)
      zoomLabel.setAttribute('role', 'button')
      zoomLabel.setAttribute('data-role', 'zoomReset')
      zoomLabel.setAttribute('title', paletteText('boardZoomReset'))
      var zoomIn = document.createElement('span')
      Object.assign(zoomIn.style, BOARD_UI.zoomButton)
      zoomIn.setAttribute('role', 'button')
      zoomIn.setAttribute('data-role', 'zoomIn')
      zoomIn.setAttribute('title', paletteText('boardZoomIn'))
      zoomIn.textContent = '+'
      zoomIn.addEventListener('click', function () {
        setBoardZoom(BOARD.zoom * BOARD_ZOOM_STEP)
      })
      zoomLabel.addEventListener('click', function () {
        setBoardZoom(1)
      })
      zoom.appendChild(zoomOut)
      zoom.appendChild(zoomLabel)
      zoom.appendChild(zoomIn)

      var arrange = document.createElement('span')
      Object.assign(arrange.style, BOARD_UI.action)
      arrange.setAttribute('role', 'button')
      arrange.setAttribute('data-role', 'tidyBoard')
      arrange.setAttribute('title', paletteText('boardArrangeHint'))
      arrange.textContent = paletteText('boardArrange')
      arrange.addEventListener('click', function () {
        tidyBoard()
      })
      var write = document.createElement('span')
      Object.assign(write.style, BOARD_UI.action)
      write.setAttribute('role', 'button')
      write.setAttribute('data-role', 'addCard')
      write.setAttribute('title', paletteText('boardAddCardHint'))
      write.textContent = paletteText('boardAddCard')
      write.addEventListener('click', function () {
        addBoardCard()
      })
      // A place for work that has not started yet. Until this button existed, a
      // goal could only be born from a conversation, which made the board a
      // record of the past rather than a plan for the day.
      var makeGoal = document.createElement('span')
      Object.assign(makeGoal.style, BOARD_UI.action)
      makeGoal.setAttribute('role', 'button')
      makeGoal.setAttribute('data-role', 'addGoal')
      makeGoal.setAttribute('title', paletteText('boardAddGoalHint'))
      makeGoal.textContent = paletteText('boardAddGoal')
      makeGoal.addEventListener('click', function () {
        addBoardGoal()
      })

      header.appendChild(title)
      header.appendChild(count)
      header.appendChild(only)
      // The way back is a button, not a key: the board's keys are letters, and a
      // modifier chord would be the one binding nobody could see. Both buttons say
      // when there is nothing to step to.
      var undo = document.createElement('span')
      Object.assign(undo.style, BOARD_UI.action)
      undo.setAttribute('role', 'button')
      undo.setAttribute('data-role', 'boardUndo')
      undo.setAttribute('title', paletteText('boardUndoHint'))
      undo.textContent = paletteText('boardUndo')
      undo.addEventListener('click', function () {
        if (!BOARD_HISTORY.canUndo()) return
        BOARD_HISTORY.undo()
        if (BOARD.open) renderBoard()
      })
      var redo = document.createElement('span')
      Object.assign(redo.style, BOARD_UI.action)
      redo.setAttribute('role', 'button')
      redo.setAttribute('data-role', 'boardRedo')
      redo.setAttribute('title', paletteText('boardRedoHint'))
      redo.textContent = paletteText('boardRedo')
      redo.addEventListener('click', function () {
        if (!BOARD_HISTORY.canRedo()) return
        BOARD_HISTORY.redo()
        if (BOARD.open) renderBoard()
      })
      BOARD.undoButton = undo
      BOARD.redoButton = redo
      header.appendChild(zoom)
      header.appendChild(undo)
      header.appendChild(redo)
      header.appendChild(arrange)
      header.appendChild(write)
      header.appendChild(makeGoal)

      var body = document.createElement('div')
      Object.assign(body.style, mode === 'page' ? BOARD_PAGE_UI.body : BOARD_UI.body)
      body.setAttribute('data-role', 'boardCanvas')
      body.addEventListener('pointerdown', boardPointerDown)
      body.addEventListener('dblclick', onBoardDoubleClick)
      // A transformed stage cannot size its own scroller: the paper around it
      // takes the magnified measurements, and the stage draws at full size
      // inside it. Without this, zooming out would leave a canvas that scrolls
      // as if nothing had changed.
      var sizer = document.createElement('div')
      Object.assign(sizer.style, BOARD_UI.sizer)
      sizer.setAttribute('data-role', 'boardPaper')
      var stage = document.createElement('div')
      Object.assign(stage.style, BOARD_UI.stage)
      stage.setAttribute('data-role', 'boardStage')
      sizer.appendChild(stage)
      body.appendChild(sizer)
      body.addEventListener('wheel', onBoardWheel, { passive: false })
      // The shell's session rows are natively draggable — the gesture the
      // reader already uses to reorder the sidebar — and what a row carries is
      // its conversation's id as plain text. That makes the same gesture a way
      // in: a row let go on the canvas becomes a card here, so the board is
      // reachable from the very list it is read beside.
      body.addEventListener('dragover', onBoardDragOver)
      body.addEventListener('dragleave', onBoardDragLeave)
      body.addEventListener('drop', onBoardDrop)

      var footer = document.createElement('div')
      Object.assign(footer.style, mode === 'page' ? BOARD_PAGE_UI.footer : BOARD_UI.footer)
      footer.textContent = paletteText(mode === 'page' ? 'boardPageHint' : 'boardHint')

      root.appendChild(header)
      root.appendChild(body)
      root.appendChild(footer)

      // A new gesture starts with no drag behind it. Capture runs before the
      // card's own press, so the click that follows a drag still sees the flag
      // it set — and the next press, however soon, does not.
      root.addEventListener('pointerdown', function () {
        if (!BOARD.drag) BOARD.dragged = false
      }, true)
      BOARD.open = true
      BOARD.mode = mode
      BOARD.panel = root
      BOARD.body = body
      BOARD.sizer = sizer
      BOARD.stage = stage
      BOARD.zoom = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, BOARD_STORE.zoom()))
      BOARD.zoomLabel = zoomLabel
      BOARD.linkLayer = null
      BOARD.glide = ''
      BOARD.count = count
      BOARD.unsubscribes = []
      BOARD.blocks = []
      BOARD.inbox = []
      BOARD.nodes = []
      BOARD.cardEditing = ''
      BOARD.cardEditor = null
      BOARD.paintOwed = false
      renderBoard()

      // Both feeds can change under an open board: a conversation can be
      // touched, archived or created while the board is up. The status feed
      // goes through the throttled repaint, because it can tick often while a
      // turn streams and a tick that changed no card's word is not a repaint.
      var services = taskServices()
      // A tick that arrives by itself is a paint like any other, and the rule
      // about open fields is inside `renderBoard`: this is where the board says
      // what it listens to, not where it decides whether a paint may land.
      if (typeof services.list.subscribe === 'function') {
        BOARD.unsubscribes.push(services.list.subscribe(function () {
          renderBoard()
        }))
      }
      if (services.workspaces && typeof services.workspaces.subscribe === 'function') {
        BOARD.unsubscribes.push(services.workspaces.subscribe(function () {
          renderBoard()
        }))
      }
      if (services.status && typeof services.status.subscribe === 'function') {
        BOARD.unsubscribes.push(services.status.subscribe(function () {
          renderBoardOnStatus()
        }))
      }
      // A native drag that ends anywhere — dropped here, let go back over the
      // sidebar, or cancelled with Escape — owes the canvas its highlight.
      // `dragend` follows the row that started the drag, so the listener lives
      // where every end can reach it, and leaves with the mount.
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('dragend', onNativeDragEnd)
        BOARD.unsubscribes.push(function () {
          document.removeEventListener('dragend', onNativeDragEnd)
        })
      }
      return true
    }

    /**
     * Unmount the board, whichever mount holds it.
     *
     * The page's container belongs to the React component that rendered it, so
     * this drops the state and the subscriptions and leaves the empty element
     * alone; removing the element is the overlay's own job, below.
     * @returns {boolean} whether a board was up.
     */
    function unmountBoard() {
      if (!BOARD.open) return false
      BOARD.open = false
      for (var i = 0; i < BOARD.unsubscribes.length; i++) {
        try {
          BOARD.unsubscribes[i]()
        } catch (error) {
          console.warn('[dsh-vim] board feed unsubscribe failed', error)
        }
      }
      BOARD.unsubscribes = []
      // A window that goes away takes its gesture with it, ghost included.
      endBoardDrag()
      // And its clocks: the tick belongs to the cards on screen, and there
      // are none left to keep honest.
      stopBoardClock()
      BOARD.clocks = []
      BOARD.statuses = ''
      // Whatever is still owed belongs to a window that is gone: a peek landing
      // later would repaint nothing and leave a conversation held open.
      BOARD_TURNS.release()
      BOARD.noteEditing = ''
      BOARD.noteEditor = null
      // The new-conversation sheet belongs to the window that opened it: its
      // fields and its half-written title leave with the board.
      closeNewSessionSheet()
      BOARD.cardEditing = ''
      BOARD.cardEditor = null
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
      BOARD.panel = null
      BOARD.body = null
      BOARD.sizer = null
      BOARD.stage = null
      BOARD.zoomLabel = null
      BOARD.linkLayer = null
      BOARD.undoButton = null
      BOARD.redoButton = null
      BOARD.glide = ''
      // A tidy in flight writes nothing when its board is gone, so the flag it
      // holds must not outlive the window: the next board would draw nothing.
      BOARD.tidy = false
      BOARD.count = null
      BOARD.inbox = []
      BOARD.front = ''
      BOARD.dropGoal = null
      // The line being typed is kept, and a goal the toolbar started that never
      // got one is let go: a draft is a place for a decision, and the board
      // going away is the decision.
      if (BOARD.intentBlock && BOARD.intentInput) commitGoalIntent(false)
      BOARD.intentBlock = ''
      BOARD.intentInput = null
      if (BOARD.blocks.length) {
        var standing = []
        for (var s = 0; s < BOARD.blocks.length; s++) {
          var held = BOARD.blocks[s]
          if (BOARD.drafts[held.key] && !held.rows.length && !BOARD_STORE.intentOf(held.key)) continue
          standing.push(held.key)
        }
        BOARD_STORE.pruneGoals(standing)
      }
      BOARD.drafts = Object.create(null)
      BOARD.renamingBlock = ''
      BOARD.renameBlockInput = null
      BOARD.renameCardDraft = null
      // The names that stood in for the feed, and the completions that have had
      // their beat, both belong to the visit: the next board reads the list
      // again, and a completion still unread gets its beat back.
      if (BOARD.titleTimer) {
        window.clearTimeout(BOARD.titleTimer)
        BOARD.titleTimer = 0
      }
      BOARD.titles = Object.create(null)
      BOARD.freshed = Object.create(null)
      // A branch still being made belongs to a board that is no longer up: its
      // card is gone with the canvas, and the next visit must draw the mark as
      // ready rather than as a press that will never be answered.
      BOARD.forking = Object.create(null)
      BOARD.blocks = []
      BOARD.nodes = []
      BOARD.folders = Object.create(null)
      // The "only marked" view is a way of reading the board for a moment, not
      // a setting: the next opening starts from everything.
      BOARD.onlyStarred = false
      // The bin's chip and list live on this board's heading: the next visit
      // builds its own, and a reference left behind would write into a heading
      // that is no longer on the page.
      BOARD.doneBinOpen = false
      BOARD.doneBinFilter = ''
      BOARD.doneBin = null
      BOARD.doneBinPanel = null
      BOARD.dragged = false
      return true
    }

    /** Take the floating board down, element and all. */
    function closeBoard() {
      if (!BOARD.open && !BOARD.host) return false
      unmountBoard()
      if (BOARD.host && BOARD.host.parentNode) {
        BOARD.host.parentNode.removeChild(BOARD.host)
      }
      BOARD.host = null
      return true
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

    function renderBoard() {
      if (!BOARD.open || !BOARD.body || !BOARD.stage) return
      // A repaint mid-gesture would take the panel out from under the pointer,
      // and one mid-tidy would take a card out of the air.
      if (BOARD.drag || BOARD.glide || BOARD.tidy) return
      // A paint must never land on an open field. The rule lives here, once,
      // rather than in each caller: a feed tick, a landed turn count and the
      // plugin's own housekeeping all end up in this function, and every one of
      // them used to be able to rebuild the stage under the caret. What such a
      // paint would have shown is drawn by the paint that closes the field.
      if (boardFieldOpen()) return
      // The paint a press's settle owed is paid the moment a paint lands: from
      // here on the page says what the store says.
      BOARD.paintOwed = false
      // A card being typed into is rebuilt with the rest, so what it says is
      // folded into the store first. Typing also writes on every input, so this
      // is only the last keystroke that had not landed yet.
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
      }
      // How tall each panel stood on the paint being taken down. A fresh
      // block is packed against the panels already standing, and the only
      // honest word on how much paper a panel occupies is the height it
      // measured: a goal with a long list of conversations hangs past the
      // grid row it was given, and a neighbour set down on the row below it
      // would land on its cards. A host that reports no boxes — and the
      // first paint of all — answers nothing, and the pitch every panel is
      // planned at stands in (see `boardPanelHeights`).
      var carried = boardPanelHeights()
      BOARD.stage.textContent = ''
      BOARD.nodes = []
      BOARD.looseNodes = Object.create(null)
      BOARD.dropZones = []
      BOARD.lines = []
      BOARD.noteEditor = null
      BOARD.cardEditor = null
      BOARD.clocks = []
      BOARD.folders = folderIndex()
      var pool = conversationPool()
      // A name the reader sent and the shell has not echoed yet is dropped here,
      // where the list this paint draws is already in hand.
      settleTitles(pool)
      var blocks = boardBlocks(pool)
      var places = boardPlaces(blocks, carried)
      BOARD.blocks = blocks
      BOARD.slots = boardSlots(blocks)
      BOARD.rows = []
      var workspaces = 0
      var i
      for (i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === 'workspace') workspaces = workspaces + 1
        BOARD.rows = BOARD.rows.concat(blocks[i].rows)
      }
      BOARD.inbox = blocks.length ? blocks[blocks.length - 1].rows.slice() : []
      var titles = Object.create(null)
      for (i = 0; i < pool.length; i++) titles[pool[i].id] = boardTitleOf(pool[i])
      BOARD.dupes = boardNameCollisions(titles)
      for (i = 0; i < blocks.length; i++) {
        BOARD.stage.appendChild(buildBoardBlock(blocks[i], places[blocks[i].key], titles))
      }
      // The paper is sized last, because a panel is as tall as the
      // conversations in it and only the painted panels know that height:
      // the boxes are on the page by now, so the tallest of them can be
      // read rather than guessed, and the scrollbars the reader is about to
      // lean on describe the work that is actually there. A host that
      // reports no boxes falls back to the height every panel is planned at.
      var extent = boardExtent(places, boardPanelHeights())
      BOARD.extent = extent
      applyBoardZoom()
      // The links live under everything else, on one SVG sheet the size of
      // the paper — under by z-index, so it may be appended after the
      // panels it is sized from. A note can be dragged across the canvas
      // without a repaint; only the paths are rewritten.
      BOARD.linkLayer = null
      if (typeof document.createElementNS === 'function') {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('data-role', 'boardLinks')
        svg.setAttribute('width', String(extent.width))
        svg.setAttribute('height', String(extent.height))
        Object.assign(svg.style, BOARD_UI.linkLayer)
        svg.style.width = extent.width + 'px'
        svg.style.height = extent.height + 'px'
        BOARD.stage.appendChild(svg)
        BOARD.linkLayer = svg
      }
      var cards = BOARD_STORE.cards()
      var drawn = 0
      for (i = 0; i < cards.length; i++) {
        // A filed note is drawn where it was filed, not on the paper as well.
        if (cards[i].filed) continue
        var note = buildBoardLooseCard(cards[i], titles)
        // Every card has a number, so overlap has an answer: the one being
        // worked on is the one on top (`BOARD.front`), and the rest stack in the
        // order they are drawn rather than by whichever happened to be last.
        if (BOARD.front !== cards[i].id) note.style.zIndex = String(2 + drawn)
        drawn = drawn + 1
        BOARD.stage.appendChild(note)
      }
      if (!BOARD.rows.length && !cards.length) {
        var empty = document.createElement('div')
        Object.assign(empty.style, BOARD_UI.emptyBoard)
        empty.setAttribute('data-role', 'emptyBoard')
        empty.textContent = paletteText('boardEmptyBoard')
        BOARD.stage.appendChild(empty)
      }
      if (BOARD.count) {
        BOARD.count.textContent =
          paletteText('boardTodayCount') + workspaces + paletteText('boardWorkspacesUnit')
          + BOARD.rows.length + paletteText('boardSessionsUnit')
      }
      paintBoardStarFilter()
      paintHistory()
      paintDoneBin()
      // Counts are not in the session list, so every card that has not been
      // asked about yet owes one. Asking from the repaint rather than from the
      // open is what picks up a conversation that arrived while the board was up.
      requestBoardTurns()
      // The fingerprint this repaint leaves behind is what the throttled status
      // repaint reads itself against.
      BOARD.statuses = boardStatusFingerprint()
      if (BOARD.clocks.length) startBoardClock()
      else stopBoardClock()
      // A field this repaint built is the one the reader asked for: the caret
      // goes in it, at the end of what it already carries.
      if (BOARD.noteEditing && BOARD.noteEditor) {
        BOARD.noteEditor.focus()
        if (typeof BOARD.noteEditor.select === 'function') BOARD.noteEditor.select()
      }
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD.cardEditor.focus()
        if (typeof BOARD.cardEditor.setSelectionRange === 'function') {
          // An empty field starts at its first line - that line is the title, and
          // the reader is about to write it.
          var end = String(BOARD.cardEditor.value || '').length
          BOARD.cardEditor.setSelectionRange(0, end)
          if (!end) BOARD.cardEditor.setSelectionRange(0, 0)
        }
      }
      if (BOARD.renamingCard && BOARD.renameCardInput) {
        BOARD.renameCardInput.focus()
        if (typeof BOARD.renameCardInput.select === 'function') BOARD.renameCardInput.select()
      }
      if (BOARD.intentBlock && BOARD.intentInput) {
        BOARD.intentInput.focus()
        if (typeof BOARD.intentInput.select === 'function') BOARD.intentInput.select()
      }
      // The beat is owed once per completion, so the ledger keeps only what is
      // still finished and still on the canvas: a conversation that runs again
      // and finishes again gets its beat again.
      var owed = Object.create(null)
      for (var f = 0; f < BOARD.rows.length; f++) {
        if (!BOARD.freshed[BOARD.rows[f].id]) continue
        var rowState = statusOf(BOARD.rows[f])
        if (rowState && rowState.key === 'done') owed[BOARD.rows[f].id] = true
      }
      BOARD.freshed = owed
      // Last, because it measures what was just put on the page.
      drawCardLinks()
      // The bin's list is the one thing on the board that floats above the
      // canvas rather than lying on it, so it is mounted last and taken down by
      // the next paint that does not want it.
      mountDoneBin(titles)
    }

    /**
     * The board's reading of every card's status, as one string.
     *
     * Only the status word goes in, not the clock: the minute hand moves by
     * the board's own tick, so folding it in here would make every minute of a
     * long turn read as a change worth a repaint.
     * @returns {string} id:status pairs in draw order, or '' when nothing is drawn.
     */
    function boardStatusFingerprint() {
      var out = ''
      for (var i = 0; i < BOARD.rows.length; i++) {
        var status = statusOf(BOARD.rows[i])
        out += BOARD.rows[i].id + ':' + (status ? status.key : '-') + ';'
      }
      return out
    }

    /**
     * Repaint the board for a status tick, but only if something on screen
     * actually changed shape.
     *
     * The status feed can tick often while a turn streams, and a repaint is
     * wholesale: the whole board is rebuilt, which costs a hover its state and
     * a column its scroll. A tick where every card keeps the word it had is
     * not a change the reader can see, so it is not a repaint either. The
     * clocks are untouched by this guard — they tick in place whatever the
     * feed is doing.
     * @returns {void}
     */
    function renderBoardOnStatus() {
      if (!BOARD.open) return
      if (boardStatusFingerprint() === BOARD.statuses) return
      renderBoard()
    }

    /**
     * Move the running cards' minute hands, in place.
     *
     * The board's twin of `tickClocks`: only the chip's own text is touched,
     * because a clock must never rebuild the board under a hover or a
     * half-finished drag. The card carries no fitted column tracks, so there
     * is nothing to re-fit here — unlike the task window's rows.
     * @returns {void}
     */
    function tickBoardClocks() {
      var now = Date.now()
      for (var i = 0; i < BOARD.clocks.length; i++) {
        var clock = BOARD.clocks[i]
        var elapsed = elapsedText(now - clock.since)
        // The same shape the card was built with, so a turn still inside its
        // first minute keeps the plain state instead of a dangling separator.
        var text = elapsed ? clock.label + ' · ' + elapsed : clock.label
        if (clock.chip.textContent === text) continue
        clock.chip.textContent = text
        clock.chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : clock.label)
      }
    }

    /** Start the tick that keeps the board's clocks honest. */
    function startBoardClock() {
      if (BOARD.clockTimer || !BOARD.clocks.length) return
      BOARD.clockTimer = window.setTimeout(function () {
        BOARD.clockTimer = 0
        if (!BOARD.open) return
        tickBoardClocks()
        startBoardClock()
      }, clockDelay(BOARD.clocks))
    }

    /** Stop the tick: the board closed, or nothing on it is running. */
    function stopBoardClock() {
      if (!BOARD.clockTimer) return
      window.clearTimeout(BOARD.clockTimer)
      BOARD.clockTimer = 0
    }

    /**
     * Ask for the turn counts the board is missing.
     *
     * A count costs a retained scope, so it goes through the same ledger the
     * task window uses: a few at a time, held against the moment the
     * conversation last moved, and released as soon as it lands.
     * @returns {void}
     */
    function requestBoardTurns() {
      var services = taskServices()
      var sessions = services && services.controller
      if (!sessions || typeof sessions.retainScope !== 'function') return
      for (var i = 0; i < BOARD.rows.length; i++) {
        var summary = BOARD.rows[i]
        if (BOARD_TURNS.read(summary) !== null || BOARD_TURNS.pending(summary.id)) continue
        BOARD_TURNS.owe(summary)
      }
      BOARD_TURNS.drain(peekTurns, function () {
        if (BOARD.open) renderBoard()
      })
    }

    /**
     * Paint the "only what is marked" toggle to match the state it stands for.
     *
     * The heading is drawn once, when the window opens; the canvas is what gets
     * repainted. The toggle lives in the heading, so it is repainted here rather
     * than being rebuilt on every pass.
     * @returns {void}
     */
    /**
     * Paint the two history buttons to match what the stacks hold.
     *
     * A button that cannot do anything says so by looking as though it cannot:
     * it keeps its place in the row (so the row does not jump when the first
     * delete arrives), loses its weight, and stops answering the pointer.
     * @returns {void}
     */
    function paintHistory() {
      var seats = [
        [BOARD.undoButton, BOARD_HISTORY.canUndo()],
        [BOARD.redoButton, BOARD_HISTORY.canRedo()],
      ]
      for (var i = 0; i < seats.length; i++) {
        var button = seats[i][0]
        if (!button) continue
        var live = seats[i][1] === true
        button.setAttribute('aria-disabled', live ? 'false' : 'true')
        button.style.opacity = live ? '1' : '0.38'
        button.style.pointerEvents = live ? 'auto' : 'none'
      }
    }

    function paintBoardStarFilter() {
      if (!BOARD.starFilter) return
      Object.assign(BOARD.starFilter.style, BOARD.onlyStarred ? BOARD_UI.starFilterOn : BOARD_UI.starFilter)
    }

    /**
     * One workspace on the canvas: a heading that can be dragged, and the
     * conversations underneath it.
     *
     * The heading is the handle rather than the whole block, because the cards
     * inside are read and clicked: a panel that moved whenever a card was
     * slightly pressed would be a panel you cannot use.
     * @param {object} block - one of `boardBlocks`.
     * @param {{x: number, y: number}} place - where it sits on the stage.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the block.
     */
    function slotHue(slot) {
      return (Math.abs(Math.round(Number(slot) || 0)) % BOARD_SLOTS) * (360 / BOARD_SLOTS) + 6
    }

    /**
     * Which seat a block starts on: its own id, never its name.
     *
     * A colour that follows the name is a colour that changes the moment the
     * panel is renamed, which reads as a different place. The id is the one thing
     * about a goal that never moves.
     * @param {string} key - the block id.
     * @returns {number} a seat on the wheel.
     */
    function slotSeed(key) {
      var text = String(key || '')
      var hash = 0
      for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360
      return hash % BOARD_SLOTS
    }

    /**
     * Give every panel on this paint its own slice of the wheel.
     *
     * Two goals that start on the same seat are told apart by moving the later
     * one to the first free seat after it: the wheel has twelve, a canvas rarely
     * holds a dozen goals, and "the two blue-ish dots" is exactly the confusion
     * this is for. The inbox is not a goal and takes no seat.
     * @param {Array<object>} blocks - the panels, in draw order.
     * @returns {object} block id -> seat.
     */
    function boardSlots(blocks) {
      var taken = Object.create(null)
      var out = Object.create(null)
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === 'inbox') continue
        var seat = slotSeed(blocks[i].key)
        for (var guard = 0; guard < BOARD_SLOTS; guard++) {
          if (!taken[seat]) break
          seat = (seat + 1) % BOARD_SLOTS
        }
        taken[seat] = true
        out[blocks[i].key] = seat
      }
      return out
    }

    /** The seat one block wears, whether or not this paint gave it one. */
    function blockSeat(block) {
      if (!block) return 0
      var seat = BOARD.slots[block.key]
      return seat === undefined ? slotSeed(block.key) : seat
    }

    /** The colour one panel's own mark wears. */
    function blockInk(block) {
      if (!block || block.kind === 'inbox') return BOARD_INK.dim
      return 'hsl(' + slotHue(blockSeat(block)) + ' 46% 56%)'
    }

    /**
     * The paper one note is written on.
     *
     * Opaque, on purpose: cards overlap the moment one is pulled out of its goal,
     * and a see-through card makes a pile unreadable - the one underneath reads
     * through the one on top, so neither is a card any more. The hue is the panel
     * the note belongs to; a note tied to nothing, or to the inbox, keeps the
     * amber it always had, because it belongs to the reader and not to a place.
     * @param {object|null} block - the panel the note's conversation stands in.
     * @returns {object} the paper's own three declarations.
     */
    /** The hue a note is written on: its goal's, or the amber of belonging to nobody. */
    function noteHue(block) {
      return block && block.kind !== 'inbox' ? slotHue(blockSeat(block)) : 45
    }

    function notePaper(block) {
      if (!block || block.kind === 'inbox') return NOTE_PAPER
      var hue = noteHue(block)
      return {
        background: 'hsl(' + hue + ' 46% 92%)',
        border: '1px solid hsl(' + hue + ' 32% 78%)',
        borderLeft: '3px solid hsl(' + hue + ' 58% 46%)',
        boxShadow: '0 16px 30px -22px rgba(8, 12, 20, 0.6), 0 1px 2px rgba(8, 12, 20, 0.2)',
        color: 'hsl(' + hue + ' 36% 17%)',
      }
    }

    /**
     * The ink one note is drawn in.
     *
     * Light paper takes dark ink, and it takes it in the same hue: the words, the
     * marks beside them and the spine are one colour family, so a card reads as
     * one object rather than as a pastel box with a few default marks on it, and
     * a finished card drops the hue for the neutral it has stopped earning.
     * @param {object|null} block - the panel the note's conversation stands in.
     * @param {boolean} done - whether the note is finished.
     * @returns {{text: string, dim: string, edge: string}} the three inks.
     */
    function noteInkOf(block, done) {
      if (done) {
        return {
          text: BOARD_INK.noteDoneInk,
          dim: 'hsl(45 10% 46%)',
          edge: 'hsl(45 10% 72%)',
        }
      }
      var hue = noteHue(block)
      return {
        text: 'hsl(' + hue + ' 36% 17%)',
        dim: 'hsl(' + hue + ' 26% 38%)',
        edge: 'hsl(' + hue + ' 34% 62%)',
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

    /**
     * How many rows an idea card's field needs for what it holds.
     *
     * Not a measurement: the field is sized in the same repaint that puts it
     * on the page, and a mount without `field-sizing` would otherwise open a
     * five-line hole for three words. A CJK character counts double, which is
     * close enough at this width to keep the estimate off a whole line.
     * @param {string} text - what the card says.
     * @returns {number} a row count inside the allowed range.
     */
    /**
     * How many half-widths one line of a note holds.
     *
     * Measured from the card's own edges and its own type rather than kept as a
     * guess: a line is the paper's inner width over half a character's advance,
     * because a CJK character is two half-widths and an average latin one is
     * about one. Under-counting is what leaves a strip of empty paper at the
     * foot of every note - the card is the right size for a line it never had.
     * @returns {number} half-widths to a line.
     */
    function boardNoteCols() {
      var metrics = boardNoteMetrics()
      var inner = BOARD_CARD_W - 26
      return Math.max(12, Math.floor(inner / (metrics.font * 0.5)))
    }

    function boardTextRows(text, least, most) {
      var value = String(text === undefined || text === null ? '' : text)
      var lines = value.split('\n')
      var rows = 0
      for (var i = 0; i < lines.length; i++) {
        var wide = 0
        for (var c = 0; c < lines[i].length; c++) {
          wide += lines[i].charCodeAt(c) > 0x2e80 ? 2 : 1
        }
        rows += Math.max(1, Math.ceil(wide / boardNoteCols()))
      }
      var low = typeof least === 'number' ? least : BOARD_EDITOR_MIN_ROWS
      var high = typeof most === 'number' ? most : BOARD_EDITOR_MAX_ROWS
      return Math.min(high, Math.max(low, rows))
    }

    /**
     * The lines a card's field opens on.
     *
     * A field is never one line tall, even when the card says one thing: a
     * thought is usually a sentence more before it is done, and a field that
     * starts as a slot is a field the reader has to grow before using.
     * @param {string} text - what the card says.
     * @returns {number} the rows the field needs.
     */
    function boardEditorRows(text) {
      return boardTextRows(text, BOARD_EDITOR_MIN_ROWS, BOARD_EDITOR_MAX_ROWS)
    }

    /**
     * How much paper one idea card takes.
     *
     * One function for the whole of it: what a card is drawn as, where a tidy
     * puts it, and how big the canvas has to be all read this, so a card is
     * never planned one size and painted another. The width is the card's and
     * never moves; the height is the lines it holds, between a strip of one
     * and the most it shows - four folded, ten opened.
     * @param {string} text - what the card says.
     * @param {number} [least] - the fewest lines to plan for.
     * @param {number} [most] - the most lines to plan for.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    /**
     * The ruler a note card is drawn with: one line box, and the paper around it.
     *
     * A card's box is planned before it is painted - the canvas extent, the tidy
     * and the next free place all read it - so the plan and the paint have to
     * share one ruler. They share this one: both numbers in pixels, scaled from
     * the board's own base font, and handed to the field and to the words as
     * well, so nothing inside a card can be measured in a different unit than
     * the card itself.
     * @returns {{line: number, chrome: number, font: number}} pixels.
     */
    function boardNoteMetrics() {
      var base = Math.max(settings.paletteFont, BOARD_MIN_FONT)
      var scale = base / BOARD_MIN_FONT
      var line = Math.round(BOARD_CARD_LINE_H * scale)
      return {
        line: line,
        chrome: Math.round(BOARD_CARD_CHROME_H * scale),
        // A line box is 1.65 times its type, the ratio the words and the field
        // are both set in.
        font: Math.round((line / 1.65) * 100) / 100,
      }
    }

    /**
     * How much paper one idea card takes: its heading, and the lines it holds.
     *
     * One shape for every state. A card is the same paper with its field up as
     * it is at rest - a press must never change the size of the thing pressed -
     * and past the last line a card holds it clips rather than scrolls, because
     * a window inside a piece of paper is not paper.
     * The shape is the reader's, not the text's: a card opens at one line and
     * keeps whatever height it was dragged to, so the fade is the only thing
     * that changes when the words run on. What the text needs is still measured,
     * which is what tells the card it has more to say than it is showing.
     * @param {string} text - what the card says.
     * @param {number} [rows] - the height it was dragged to, or 0 for the default.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    /**
     * A note, cut where its title ends: the first line is the heading and the
     * rest is what the card shows of itself.
     * @param {string} text - what the card says.
     * @returns {{title: string, body: string, rows: number}} the parts.
     */
    function noteParts(text) {
      var value = String(text === undefined || text === null ? '' : text)
      // Spelled as a code point rather than an escape: the split is the whole
      // meaning of this function, and it must not depend on how a tool wrote it.
      var cut = value.indexOf(CHAR_NEWLINE)
      var title = cut < 0 ? value : value.slice(0, cut)
      var body = cut < 0 ? '' : value.slice(cut + 1)
      return { title: title, body: body, rows: boardTextRows(body, 0, 999) }
    }

    /**
     * How much paper one idea card takes at rest.
     *
     * The title lives in the heading, so the paper is spent on the body: two
     * lines of it, and none when the card is only a title. `rows` is a height a
     * former build let the reader drag; it still wins when a stored card has one.
     * @param {string} text - what the card says.
     * @param {number} [rows] - a chosen number of body lines.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    function boardCardBox(text, rows) {
      var parts = noteParts(text)
      var chosen = Math.round(Number(rows) || 0)
      // A note that is only a title is only a heading: an empty line kept for a
      // body it does not have is the wasted row this card was complaining about.
      var body = parts.body ? parts.rows : 0
      var lines = chosen > 0
        ? Math.min(chosen, BOARD_EDITOR_MAX_ROWS)
        : Math.min(body, BOARD_NOTE_BODY_ROWS)
      var metrics = boardNoteMetrics()
      return {
        width: BOARD_CARD_W,
        height: metrics.chrome + lines * metrics.line,
        lines: lines,
      }
    }

    /**
     * The paper a note takes while its field is up: all of its body, up to the cap.
     *
     * Opening a card is asking to read it, so the paper grows to hold the whole
     * of what was written - that is what a press now means, in place of the corner
     * that used to have to be dragged.
     * @param {string} text - what the card says.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    function boardCardOpenBox(text) {
      // The field holds the body only - the title has its own row in the heading -
      // so the paper plans for the body, and the field is exactly as tall as it.
      var parts = noteParts(text)
      var lines = Math.min(BOARD_EDITOR_MAX_ROWS, Math.max(1, parts.rows))
      var metrics = boardNoteMetrics()
      return {
        width: BOARD_CARD_W,
        height: metrics.chrome + lines * metrics.line,
        lines: lines,
      }
    }

    /**
     * Where a point on the screen falls on the paper.
     *
     * The canvas is a scroller and the stage inside it is scaled, so a pointer
     * has to lose both before it can name a place a card can be stored at.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {{x: number, y: number}} unzoomed canvas coordinates.
     */
    function canvasPointOf(x, y) {
      var body = BOARD.body
      var rect = body && typeof body.getBoundingClientRect === 'function' ? body.getBoundingClientRect() : null
      var zoom = BOARD.zoom || 1
      if (!rect || (!rect.width && !rect.height)) return { x: Math.max(0, x), y: Math.max(0, y) }
      return {
        x: Math.max(0, (x - rect.left + (Number(body.scrollLeft) || 0)) / zoom),
        y: Math.max(0, (y - rect.top + (Number(body.scrollTop) || 0)) / zoom),
      }
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

    /**
     * Lift one put-away note out of the tray, under the hand.
     *
     * A note in the tray is a line, and a line cannot be dragged around a canvas:
     * so the first movement turns it back into paper where the hand is, and the
     * gesture goes on as the ordinary note drag from there.
     * @param {object} drag - the armed press.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function beginNoteLift(drag, x, y) {
      var id = drag.key
      if (!id) return
      var point = canvasPointOf(x, y)
      var at = {
        x: Math.max(0, point.x - BOARD_CARD_W / 2),
        y: Math.max(0, point.y - 24),
      }
      BOARD_STORE.unfileCard(id)
      BOARD_STORE.moveCard(id, at.x, at.y)
      // The paint has to happen with no gesture in its way, and the row this
      // press started on is replaced by it: so the drag stands aside for that
      // one call and comes back retired to an ordinary note drag.
      BOARD.drag = null
      renderBoard()
      BOARD.drag = drag
      var node = BOARD.looseNodes[id]
      if (!node) {
        BOARD.drag = null
        return
      }
      drag.kind = 'note'
      drag.node = node
      drag.baseX = at.x
      drag.baseY = at.y
      drag.fromX = x
      drag.fromY = y
      drag.x = at.x
      drag.y = at.y
      BOARD.front = id
      node.setAttribute('data-front', 'true')
      // A lifted line is being carried like any note, so the bands belong up.
      showDropZones(true, boardNoteDone(id))
    }

    /**
     * Say which goal would take the card if the hand let go of it here.
     *
     * The carrier is out of the hit test, so the point under it is the goal
     * itself: the panel that answers is the panel the card would be filed in,
     * and saying so before the drop is what makes the gesture readable while
     * it is still going on.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function markDropGoal(x, y) {
      var found = null
      if (typeof document.elementFromPoint === 'function') {
        try {
          var under = document.elementFromPoint(x, y)
          found = under && typeof under.closest === 'function'
            ? under.closest('[data-role="workspaceBlock"]')
            : null
        } catch (error) {
          found = null
        }
      }
      if (BOARD.dropGoal && BOARD.dropGoal !== found) {
        BOARD.dropGoal.setAttribute('data-drop', 'false')
      }
      BOARD.dropGoal = found
      if (found) found.setAttribute('data-drop', 'true')
      markNoDrop(!found, x, y)
    }

    /**
     * The goal one conversation is drawn in on this paint, or null.
     * @param {string} id - session id.
     * @returns {object|null} the block holding it.
     */
    function boardHomeOf(id) {
      for (var i = 0; i < BOARD.blocks.length; i++) {
        var rows = BOARD.blocks[i].rows
        for (var r = 0; r < rows.length; r++) {
          if (rows[r].id === id) return BOARD.blocks[i]
        }
      }
      return null
    }

    /**
     * Say, under the hand, that the paper will not take this card.
     *
     * The drop is refused for a reason the reader can watch coming (see the last
     * conversation rule in `onBoardUp`), so the reason is said while the card is
     * still being carried rather than after it has already been put back. A
     * gesture explained only after it fails teaches nothing.
     * @param {boolean} paper - whether the hand is over the paper.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function markNoDrop(paper, x, y) {
      var drag = BOARD.drag
      var alone = false
      if (paper && drag && drag.kind === 'session') {
        var home = boardHomeOf(drag.key)
        alone = !!home && home.rows.length <= 1
      }
      if (!alone) {
        dropNoDropTip()
        return
      }
      if (!BOARD.noDropTip && BOARD.stage) {
        var tip = document.createElement('div')
        Object.assign(tip.style, BOARD_UI.noDropTip)
        tip.setAttribute('data-role', 'noDropTip')
        BOARD.noDropTip = tip
      }
      if (!BOARD.noDropTip || !BOARD.stage) return
      BOARD.noDropTip.textContent = paletteText('boardGoalLastCard')
      var at = canvasPointOf(x, y)
      BOARD.noDropTip.style.left = Math.round(at.x) + 'px'
      BOARD.noDropTip.style.top = Math.round(at.y + 20) + 'px'
      if (BOARD.noDropTip.parentNode !== BOARD.stage) BOARD.stage.appendChild(BOARD.noDropTip)
    }

    /** Take the "the paper will not take it" line off the page. */
    function dropNoDropTip() {
      if (BOARD.noDropTip && BOARD.noDropTip.parentNode) {
        BOARD.noDropTip.parentNode.removeChild(BOARD.noDropTip)
      }
      BOARD.noDropTip = null
    }

    /**
     * The goal the pointer is standing in, as the id a card is filed under.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {string} the block id, or '' for the paper itself.
     */
    function goalUnder(x, y) {
      if (typeof document.elementFromPoint !== 'function') return ''
      try {
        var under = document.elementFromPoint(x, y)
        var goal = under && typeof under.closest === 'function'
          ? under.closest('[data-role="workspaceBlock"]')
          : null
        return goal ? goal.getAttribute('data-block') || '' : ''
      } catch (error) {
        return ''
      }
    }

    /**
     * Whether a native drag carries words, the one thing the shell's rows set.
     *
     * The words themselves are guarded until the drop, so this is all the
     * `dragover` can ask. The canvas takes a text-bearing drag and says at the
     * drop whether it was a conversation; a drag carrying files, or nothing at
     * all, is not the board's to answer.
     * @param {object} ev - the drag event.
     * @returns {boolean} whether `text/plain` is aboard.
     */
    function boardDragHasText(ev) {
      var transfer = ev && ev.dataTransfer
      if (!transfer || !transfer.types) return false
      try {
        if (typeof transfer.types.indexOf === 'function') {
          return transfer.types.indexOf('text/plain') >= 0
        }
        if (typeof transfer.types.contains === 'function') {
          return transfer.types.contains('text/plain')
        }
      } catch (error) {
        return false
      }
      return false
    }

    /**
     * The words a native drag is carrying, read where the browser allows it.
     * @param {object} ev - the drop event.
     * @returns {string} the plain text aboard, trimmed.
     */
    function boardDragText(ev) {
      var transfer = ev && ev.dataTransfer
      if (!transfer || typeof transfer.getData !== 'function') return ''
      try {
        return String(transfer.getData('text/plain') || '').trim()
      } catch (error) {
        return ''
      }
    }

    /**
     * Take the goal highlight a native drag drew off the paper.
     *
     * The drop reads it first, so this is called after the decision rather
     * than before it: the line belongs to the gesture, and the paint that
     * follows owes it nothing.
     * @returns {void}
     */
    function clearBoardDragGoal() {
      if (BOARD.dropGoal) {
        BOARD.dropGoal.setAttribute('data-drop', 'false')
        BOARD.dropGoal = null
      }
      dropNoDropTip()
    }

    /**
     * A native drag is over, however it ended.
     *
     * `dragend` travels with the row that started the drag, in the sidebar —
     * the canvas never sees it — so the listener that takes the highlight
     * back down lives where every end is the same end. A drop already took it
     * down; this is for the ends that never land here.
     * @returns {void}
     */
    function onNativeDragEnd() {
      if (!BOARD.open) return
      clearBoardDragGoal()
    }

    /**
     * Say, while a native drag is over the canvas, which goal would take it.
     *
     * The same line the board draws under its own carried cards, so two
     * gestures that mean the same thing read the same way while they are still
     * going on.
     * @param {object} ev - the dragover.
     * @returns {void}
     */
    function onBoardDragOver(ev) {
      if (!BOARD.open || !boardDragHasText(ev)) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
      markDropGoal(Number(ev.clientX) || 0, Number(ev.clientY) || 0)
    }

    /**
     * The native drag left the canvas: take the goal highlight with it.
     *
     * `dragleave` also fires on the way into a panel's children, so only the
     * leave that crosses out of the canvas counts — the hand is still in, and
     * the goal it stands on is still the one that would take the card.
     * @param {object} ev - the dragleave.
     * @returns {void}
     */
    function onBoardDragLeave(ev) {
      if (!BOARD.open) return
      var to = ev && ev.relatedTarget
      if (to && BOARD.body && typeof BOARD.body.contains === 'function'
        && BOARD.body.contains(to)) return
      clearBoardDragGoal()
    }

    /**
     * A conversation let go on the canvas, carried in from the host's sidebar.
     *
     * The shell's session rows carry their conversation's id as plain text, so
     * the board does not need rows of its own to reach itself: letting go here
     * puts the conversation on it — under the goal the hand was aiming at when
     * there was one, following its workspace when there was not. Whatever the
     * row was, the canvas has said yes to the drag, so the drop is answered
     * here rather than left to whatever the browser makes of a text drop.
     * @param {object} ev - the drop.
     * @returns {void}
     */
    function onBoardDrop(ev) {
      if (!BOARD.open) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      clearBoardDragGoal()
      var payload = boardDragText(ev)
      if (!payload) return
      var pool = conversationPool()
      var known = null
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].id === payload) known = pool[i]
      }
      if (!known) {
        showToast(paletteText('boardDragUnknown'))
        return
      }
      dropSessionOntoBoard(known.id, goalUnder(Number(ev.clientX) || 0, Number(ev.clientY) || 0))
    }

    /**
     * Take one conversation the reader dragged in, and keep it.
     *
     * The same records the pin key writes — the ★ that outlives the day, the
     * deletion lifted — plus the goal the hand let go on, when it aimed at
     * one. One line says what happened, and the filing is the more specific
     * claim, so it is the one spoken when both are true; letting go on the
     * goal the card already stands in files nothing, exactly as the board's
     * own carried cards behave.
     * @param {string} id - the conversation the row carried.
     * @param {string} overGoal - the block the hand let go on, or '' for the paper.
     * @returns {void}
     */
    function dropSessionOntoBoard(id, overGoal) {
      var already = BOARD_STORE.isStarred(id)
      BOARD_STORE.unmute(id)
      if (!already) BOARD_STORE.toggleStar(id)
      var home = boardHomeOf(id)
      if (overGoal && (!home || home.key !== overGoal)) {
        BOARD_STORE.placeSession(id, overGoal)
        showToast(paletteText('boardMoved'))
      } else {
        showToast(paletteText(already ? 'pinAlready' : 'pinDone'))
      }
      if (BOARD.open && !BOARD.noteEditing) renderBoard()
    }



    function buildBoardBlock(block, place, titles) {
      var node = document.createElement('div')
      Object.assign(node.style, BOARD_UI.block)
      // A panel is a panel, whichever it is: the tray's paper belongs to the
      // notes inside it, not to the box that holds them.
      node.className = 'dshv-block'
      node.style.left = place.x + 'px'
      node.style.top = place.y + 'px'
      node.style.width = BOARD_BLOCK_W + 'px'
      node.setAttribute('data-role', 'workspaceBlock')
      node.setAttribute('data-block', block.key)
      // The whole panel is the handle: a goal is a place, and a place is grabbed
      // where the eye sees it. Cards inside declare a handle of their own, so the
      // nearest one wins and a press on a card is never a press on the goal.
      node.setAttribute('data-handle', 'goal')
      var folded = BOARD_STORE.isFolded(block.key)

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.blockHead)
      head.className = 'dshv-panel-head'
      head.setAttribute('data-role', 'blockHead')
      head.setAttribute('title', (block.path ? block.path + ' · ' : '') + paletteText('boardGoalDragHint'))
      var caret = document.createElement('span')
      Object.assign(caret.style, BOARD_UI.blockCaret)
      caret.textContent = folded ? '▸' : '▾'
      // Folding is the caret's, and only the caret's: the rest of the heading has
      // to stay draggable, and a heading that folds on every press cannot also
      // be what a goal is moved by.
      caret.setAttribute('data-role', 'blockFold')
      caret.setAttribute('role', 'button')
      caret.setAttribute('title', paletteText(folded ? 'boardGoalUnfold' : 'boardGoalFold'))
      caret.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.toggleBlockFold(block.key)
        renderBoard()
      })
      var dot = document.createElement('span')
      Object.assign(dot.style, BOARD_UI.blockDot)
      dot.setAttribute('data-role', 'blockDot')
      dot.style.background = blockInk(block)
      // The goal's name, typed in place. A panel starts as a workspace and
      // usually becomes the thing the reader is working toward, so the name is
      // theirs: a double press on it opens the field, and clearing it gives the
      // workspace's own name back.
      var name
      if (block.kind !== 'inbox' && BOARD.renamingBlock === block.key) {
        name = document.createElement('input')
        Object.assign(name.style, BOARD_UI.blockRenameBox)
        name.setAttribute('type', 'text')
        name.setAttribute('data-role', 'blockRename')
        name.setAttribute('aria-label', paletteText('boardGoalName'))
        name.setAttribute('placeholder', paletteText('boardGoalPlaceholder'))
        name.value = block.label
        name.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBlockRename()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBlockRename()
          }
        })
        name.addEventListener('blur', function () {
          if (BOARD.renamingBlock === block.key && BOARD.renameBlockInput === name) commitBlockRename()
        })
        // A field is the field's: the router reads this and leaves the press
        // alone, so the text in it can be selected with the pointer.
        name.setAttribute('data-no-drag', 'true')
        BOARD.renameBlockInput = name
      } else {
        name = document.createElement('span')
        Object.assign(name.style, BOARD_UI.blockName)
        name.setAttribute('data-role', 'blockName')
        name.setAttribute('title', block.kind === 'inbox'
          ? paletteText('boardInboxHint')
          : paletteText('boardGoalRenameHint'))
        name.textContent = block.label
        // The name is part of the handle: a press on it drags the goal like the
        // rest of the heading, and a double press is the rename. A single press is
        // not the fold - folding belongs to the caret, which is the one part of
        // the heading that has to stay a plain click.
        name.addEventListener('dblclick', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          // The tray's name is its meaning, not a title: renaming it would take
          // the one place in the board that everybody can read at a glance.
          if (block.kind === 'inbox') return
          beginBlockRename(block.key)
        })
      }
      // Only the name: the path is on the heading's tooltip, where a reader who
      // wants it can find it, rather than taking half the line on every panel.
      var count = document.createElement('span')
      Object.assign(count.style, BOARD_UI.blockCount)
      // The tray counts what it holds, both kinds: a folded tray still has to say
      // how much is waiting in it, and a goal counts the conversations it carries.
      var held = block.rows.length
      if (block.kind === 'inbox') held += BOARD_STORE.filedCards(BOARD_INBOX).length
      count.textContent = String(held)
      head.appendChild(caret)
      head.appendChild(dot)
      head.appendChild(name)
      head.appendChild(count)
      // A goal is a place work starts, not only a shelf work is put on. The
      // plus is that start; a card dropped on it is the same start with the
      // words already written. The tray has no plus: it is where work has no
      // home, so starting there would be starting nowhere.
      if (block.kind !== 'inbox') {
        var newSession = document.createElement('span')
        Object.assign(newSession.style, BOARD_UI.blockNewSession)
        newSession.className = 'dshv-goal-new'
        newSession.setAttribute('role', 'button')
        newSession.setAttribute('data-role', 'goalNewSession')
        newSession.setAttribute('data-goal-key', block.key)
        newSession.setAttribute('data-no-drag', 'true')
        newSession.setAttribute('aria-label', paletteText('boardNewSession'))
        newSession.setAttribute('title', paletteText('boardNewSessionHint'))
        newSession.textContent = '+'
        newSession.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          openNewSessionSheet(block)
        })
        head.appendChild(newSession)
      }
      // Closing a place is for the places the reader made. A workspace panel is
      // not theirs to close: it is where its conversations live, and one that is
      // closed comes back the moment a conversation from it moves again.
      if (block.kind === 'user') {
        var kill = document.createElement('span')
        Object.assign(kill.style, BOARD_UI.blockKill)
        kill.className = 'dshv-goal-x'
        kill.setAttribute('role', 'button')
        kill.setAttribute('data-role', 'goalRemove')
        kill.setAttribute('title', paletteText('boardGoalRemove'))
        kill.textContent = '×'
        kill.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          removeBoardGoal(block)
        })
        head.appendChild(kill)
      }
      node.appendChild(head)

      // What the goal is for, in the reader's own words.
      //
      // Under the heading, not in it: the heading is the handle the panel is
      // dragged by, and a sentence meant to be clicked cannot also be the thing
      // that picks the panel up. A goal with a line here keeps standing when its
      // last conversation leaves - that is the whole reason the line exists -
      // so the empty state says as much where it is read.
      var purpose = document.createElement('div')
      Object.assign(purpose.style, BOARD_UI.blockIntent)
      purpose.setAttribute('data-role', 'blockIntent')
      purpose.setAttribute('data-no-drag', 'true')
      var mark = document.createElement('span')
      Object.assign(mark.style, BOARD_UI.blockIntentMark)
      mark.textContent = '🎯'
      purpose.appendChild(mark)
      if (BOARD.intentBlock === block.key) {
        var field = document.createElement('input')
        Object.assign(field.style, BOARD_UI.blockIntentBox)
        field.setAttribute('type', 'text')
        field.setAttribute('data-role', 'blockIntentField')
        field.setAttribute('data-no-drag', 'true')
        field.setAttribute('aria-label', paletteText('boardGoalIntent'))
        field.setAttribute('placeholder', paletteText('boardGoalIntentPlaceholder'))
        field.value = block.intent || ''
        field.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitGoalIntent()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelGoalIntent()
          }
        })
        field.addEventListener('blur', function () {
          if (BOARD.intentBlock === block.key && BOARD.intentInput === field) commitGoalIntent()
        })
        BOARD.intentInput = field
        purpose.appendChild(field)
      } else {
        var said = document.createElement('span')
        Object.assign(said.style, block.intent ? BOARD_UI.blockIntentText : BOARD_UI.blockIntentEmpty)
        said.className = 'dshv-intent-text'
        said.setAttribute('data-role', 'blockIntentText')
        said.textContent = block.intent || paletteText('boardGoalIntentPlaceholder')
        said.setAttribute('title', paletteText('boardGoalIntentHint'))
        said.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginGoalIntent(block.key)
        })
        purpose.appendChild(said)
      }
      // Where the panel came from, when its name no longer says so. A workspace
      // panel still wearing its workspace's name has nothing to add; one renamed
      // to what the reader is doing there owes the reader the source.
      if (block.kind === 'workspace' && block.path && goalBaseName(block.path) !== block.label) {
        var source = document.createElement('span')
        Object.assign(source.style, BOARD_UI.blockIntentFrom)
        source.setAttribute('data-role', 'blockGoalFrom')
        source.textContent = goalBaseName(block.path)
        source.setAttribute('title', block.path)
        purpose.appendChild(source)
      }
      // The inbox is the place for what no workspace claimed, not a plan of
      // its own: a line saying what it is for would be a line about nothing.
      if (block.kind !== 'inbox') node.appendChild(purpose)

      if (!folded) {
        var body = document.createElement('div')
        Object.assign(body.style, BOARD_UI.blockBody)
        body.setAttribute('data-role', 'blockBody')
        if (block.kind === 'inbox') {
          // The tray is not a goal: it holds the conversations that have no home
          // yet *and* the notes that were put away in it, so it has a body of its
          // own rather than the column a goal draws. It is drawn whether or not
          // it holds a conversation - a note put away in an otherwise empty tray
          // is still there, and this body is the only place it is drawn.
          body.appendChild(buildInboxBody(block, titles))
        } else if (!block.rows.length) {
          var empty = document.createElement('div')
          Object.assign(empty.style, BOARD_UI.empty)
          empty.textContent = paletteText('boardEmptyInbox')
          body.appendChild(empty)
        } else {
          body.appendChild(buildBoardTree(block.rows, titles))
        }
        node.appendChild(body)
      }
      return node
    }

    /**
     * The conversations of one block, cut into threads.
     *
     * A thread is a conversation and everything forked from it, so the panel
     * reads top to bottom like the work happened: a branch sits under the
     * conversation it came from, joined by a line, and only a root sits at the
     * panel's own margin. Nothing here sorts — the pool already arrived newest
     * first, and a shelf that rearranges itself is a shelf you cannot learn.
     * @param {Array<object>} rows - the block's conversations, newest first.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the list.
     */
    /**
     * One named section of the tray: what it holds, and how much of it.
     * @param {string} name - the section's word.
     * @param {number} count - how many it holds.
     * @returns {Element} the caption.
     */
    function trayCaption(name, count) {
      var line = document.createElement('div')
      Object.assign(line.style, BOARD_UI.trayCaption)
      line.setAttribute('data-role', 'trayCaption')
      var word = document.createElement('span')
      word.textContent = name
      var many = document.createElement('span')
      Object.assign(many.style, BOARD_UI.trayCount)
      many.textContent = String(count)
      line.appendChild(word)
      line.appendChild(many)
      return line
    }

    /** A quiet line where a section has nothing in it yet. */
    function trayQuiet(text) {
      var line = document.createElement('div')
      Object.assign(line.style, BOARD_UI.trayQuiet)
      line.textContent = text
      return line
    }

    /**
     * One note, as a line of the tray.
     *
     * The tray is a list, not a surface: what is put away is read in a glance and
     * lifted back out when it is wanted. So a note here is one line - a box, its
     * words, and the two things that are about the line itself (its tie and its
     * delete) - and it becomes paper again the moment it is dragged out.
     * @param {object} card - one of the filed notes.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the row.
     */
    function buildTrayNote(card, titles, opts) {
      var row = document.createElement('div')
      // The same paper as a note on the canvas, and the shape of a line. The
      // material comes from NOTE_PAPER - not from `loose`, which also carries the
      // sheet's absolute placement and would stack every row on one spot.
      // A filed note is the same paper as a note on the canvas, and is read in
      // the same ink: one material, one pair of colours.
      var rowInk = noteInkOf(null, card.done)
      Object.assign(row.style, NOTE_PAPER, BOARD_UI.trayRow)
      if (card.done) Object.assign(row.style, BOARD_UI.looseDone)
      row.style.color = rowInk.text
      row.className = 'dshv-tray-row'
      row.setAttribute('data-role', 'inboxNote')
      row.setAttribute('data-card-id', card.id)
      row.setAttribute('data-handle', 'inboxNote')
      if (card.done) row.setAttribute('data-done', 'true')
      if (BOARD.cardEditing === card.id) row.setAttribute('data-editing', 'true')

      var doneToggle = document.createElement('span')
      Object.assign(doneToggle.style, BOARD_UI.cardDoneToggle)
      doneToggle.className = 'dshv-done-toggle'
      doneToggle.setAttribute('role', 'button')
      doneToggle.setAttribute('data-role', 'cardDoneToggle')
      doneToggle.setAttribute('aria-pressed', card.done ? 'true' : 'false')
      doneToggle.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
      doneToggle.setAttribute('data-done', card.done ? 'true' : 'false')
      doneToggle.textContent = card.done ? '\u2713' : ''
      if (card.done) Object.assign(doneToggle.style, BOARD_UI.cardDoneToggleOn)
      doneToggle.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.setCardDone(card.id, !card.done)
        // A card that stops being finished stops belonging in the bin, and the
        // card goes back to the paper rather than staying in a list that would
        // then be lying about its own name.
        if (card.done && ejectFromDoneBin(card)) return
        renderBoard()
      })
      row.appendChild(doneToggle)

      if (BOARD.cardEditing === card.id) {
        var editor = document.createElement('input')
        Object.assign(editor.style, BOARD_UI.trayEditor)
        editor.setAttribute('type', 'text')
        editor.setAttribute('data-role', 'cardText')
        editor.setAttribute('data-no-drag', 'true')
        editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
        editor.value = card.text
        editor.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBoardCard()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardCard()
          }
        })
        editor.addEventListener('blur', function () {
          if (BOARD.cardEditing === card.id && BOARD.cardEditor === editor) commitBoardCard()
        })
        row.appendChild(editor)
        BOARD.cardEditor = editor
      } else {
        // A row in the finished list is read, not written: one line of title until
        // it is pressed, and the whole note when it is. The tray's own rows keep
        // their single line and open their field instead - that is a place you
        // write in, this is a place you look things up in.
        var canOpen = !!(opts && opts.expand)
        var showing = canOpen && BOARD.rowOpen === card.id
        var head = noteParts(card.text)
        var text = document.createElement('span')
        Object.assign(text.style, BOARD_UI.trayText)
        text.style.color = rowInk.text
        if (showing) Object.assign(text.style, BOARD_UI.trayTextOpen)
        text.setAttribute('data-role', 'inboxNoteText')
        text.setAttribute('title', canOpen ? paletteText('boardCardOpenHint') : card.text)
        text.textContent = showing ? card.text : head.title || paletteText('boardCardPlaceholder')
        if (!head.title) text.style.opacity = '0.45'
        text.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          if (!canOpen) {
            beginBoardCard(card.id)
            return
          }
          BOARD.rowOpen = showing ? '' : card.id
          renderBoard()
        })
        row.appendChild(text)
      }

      // Its tie, if it still has one: a word, not a curve. A curve belongs to
      // paper, and this is a line of a list.
      if (card.link) {
        var chip = document.createElement('span')
        Object.assign(chip.style, BOARD_UI.trayChip)
        chip.style.color = rowInk.dim
        chip.style.background = 'rgba(0, 0, 0, 0.06)'
        chip.setAttribute('data-role', 'cardLinkLabel')
        chip.textContent = '\u2192 ' + (titles[card.link] || paletteText('boardCardLinkedUnknown'))
        chip.setAttribute('title', chip.textContent)
        row.appendChild(chip)
      }

      var actions = document.createElement('span')
      actions.className = 'dshv-note-actions'
      actions.setAttribute('data-role', 'cardActions')
      if (card.link) {
        var unlink = document.createElement('span')
        Object.assign(unlink.style, BOARD_UI.looseUnlink)
        unlink.setAttribute('data-role', 'cardUnlink')
        unlink.setAttribute('title', paletteText('boardCardUnlink'))
        unlink.textContent = paletteText('boardCardUnlink')
        unlink.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          BOARD_STORE.unlinkCard(card.id)
          // No tie means it is no longer a finished thought about a conversation.
          if (ejectFromDoneBin(card)) return
          renderBoard()
        })
        actions.appendChild(unlink)
      }
      var remove = document.createElement('span')
      Object.assign(remove.style, BOARD_UI.looseRemove)
      remove.setAttribute('data-role', 'cardRemove')
      remove.setAttribute('title', paletteText('boardCardRemove'))
      remove.textContent = '×'
      remove.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        removeLooseCard(card.id)
      })
      actions.appendChild(remove)
      row.appendChild(actions)
      return row
    }

    /**
     * Ink every conversation inside one node with the tray's paper.
     * @param {Element} node - the list to walk.
     * @returns {void}
     */
    function trayInk(node) {
      var kids = node.children || []
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i]
        if (child.getAttribute && child.getAttribute('data-session-id')) {
          Object.assign(child.style, BOARD_UI.trayCard)
        }
        trayInk(child)
      }
    }

    /** Every note put away in the finished-cards bin, newest first. */
    function doneBinCards() {
      return BOARD_STORE.filedCards(BOARD_DONE).slice().reverse()
    }

    /** The put-away notes one conversation was handed, newest first. */
    function doneBinCardsOf(sessionId) {
      if (!sessionId) return []
      var all = doneBinCards()
      var mine = []
      for (var i = 0; i < all.length; i++) {
        if (all[i].link === sessionId) mine.push(all[i])
      }
      return mine
    }

    /**
     * Open the bin on one conversation's own put-aways.
     *
     * The mark on a card is the same list filtered to that card: a reader who
     * asks "what did I hand to this one" should not have to find it in a list of
     * everything. Pressing the heading's chip is how the filter is dropped.
     * @param {string} sessionId - the conversation whose mark was pressed.
     * @returns {void}
     */
    function openDoneBinFor(sessionId) {
      var same = BOARD.doneBinOpen && BOARD.doneBinFilter === sessionId
      BOARD.doneBinOpen = !same
      BOARD.doneBinFilter = same ? '' : String(sessionId || '')
      renderBoard()
    }

    /**
     * Say how many cards the bin holds, and what it is doing.
     *
     * Written on every paint rather than by rebuilding the chip: the chip is made
     * once with the heading, and a heading that came back wearing a different
     * word on each status tick would be worse than a count a beat old.
     * @returns {void}
     */
    function paintDoneBin() {
      var chip = BOARD.doneBin
      if (!chip) return
      var count = doneBinCards().length
      // A place with nothing in it is not a place yet: the chip is there from
      // the first card onward, and out of the way until then.
      chip.style.display = count ? '' : 'none'
      var label = paletteText('boardDoneBin')
      var text = count ? label + ' \u00b7 ' + count : label
      if (chip.textContent !== text) chip.textContent = text
      Object.assign(chip.style, BOARD.doneBinOpen ? BOARD_UI.doneBinOn : BOARD_UI.doneBin)
      chip.setAttribute('aria-expanded', BOARD.doneBinOpen ? 'true' : 'false')
    }

    /** Open or close the finished-cards list. */
    function toggleDoneBin() {
      // The heading is the list of everything: pressing it is also how a filter
      // put there by a card's own mark is dropped.
      BOARD.doneBinOpen = !BOARD.doneBinOpen
      BOARD.doneBinFilter = ''
      renderBoard()
    }

    /**
     * One finished note, as a line of the card's list.
     *
     * Two lines folded - the title, and the first line of the body under it - so
     * the reader can tell which thought this is without opening it; the whole note
     * when the line is pressed. The marks are the only two things a finished note
     * still needs: put it back on the paper, or drop it.
     * @param {object} card - one of the filed notes.
     * @returns {Element} the row.
     */
    function buildDoneRow(card) {
      var parts = noteParts(card.text)
      var open = BOARD.rowOpen === card.id
      var row = document.createElement('div')
      // A card, not a row: the same paper as the note it was, read one line at a
      // time and opened by pressing it - the tray's own language.
      Object.assign(row.style, NOTE_PAPER, BOARD_UI.doneRow)
      if (open) Object.assign(row.style, BOARD_UI.doneRowOpen)
      row.className = 'dshv-done-row'
      row.setAttribute('data-role', 'doneRow')
      row.setAttribute('data-card-id', card.id)
      // The row is still a note: the same gesture lifts it back onto the paper.
      row.setAttribute('data-handle', 'inboxNote')
      if (open) row.setAttribute('data-open', 'true')

      var main = document.createElement('div')
      Object.assign(main.style, BOARD_UI.doneRowMain)
      if (open) {
        var full = document.createElement('div')
        Object.assign(full.style, BOARD_UI.doneRowFull)
        full.setAttribute('data-role', 'doneFull')
        full.textContent = card.text
        main.appendChild(full)
      } else {
        // One line: what this list is for is telling the finished thoughts apart,
        // and the title does that. The rest is one press away.
        var title = document.createElement('div')
        Object.assign(title.style, BOARD_UI.doneRowTitle)
        title.setAttribute('data-role', 'doneTitle')
        title.setAttribute('title', card.text)
        title.textContent = parts.title || paletteText('boardCardPlaceholder')
        main.appendChild(title)
      }
      row.appendChild(main)

      var putBack = document.createElement('span')
      Object.assign(putBack.style, BOARD_UI.doneRowAction)
      putBack.setAttribute('role', 'button')
      putBack.setAttribute('data-role', 'donePutBack')
      putBack.setAttribute('aria-label', paletteText('boardDoneBack'))
      putBack.setAttribute('title', paletteText('boardDoneBack'))
      putBack.textContent = '\u2193'
      putBack.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        ejectFromDoneBin(card)
      })
      row.appendChild(putBack)

      var remove = document.createElement('span')
      Object.assign(remove.style, BOARD_UI.doneRowAction)
      remove.setAttribute('role', 'button')
      remove.setAttribute('data-role', 'doneRemove')
      remove.setAttribute('aria-label', paletteText('boardCardRemove'))
      remove.setAttribute('title', paletteText('boardCardRemove'))
      remove.textContent = '×'
      remove.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        removeLooseCard(card.id)
      })
      row.appendChild(remove)

      // The whole line opens the note, not just its words: a list is read by
      // pointing at a line.
      row.addEventListener('click', function (ev) {
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        var hit = ev && ev.target
        if (hit && typeof hit.closest === 'function'
          && hit.closest('[data-role="donePutBack"],[data-role="doneRemove"]')) return
        BOARD.rowOpen = open ? '' : card.id
        renderBoard()
      })
      return row
    }

    /**
     * Put the finished-cards list on the board, or take it away.
     *
     * The rows are the inbox tray's own rows, so a card is dragged back onto the
     * canvas by the gesture the reader already knows - and the board's single
     * press handler sees the press, because this list is mounted inside the board
     * it belongs to rather than floating outside it.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {void}
     */
    function mountDoneBin(titles) {
      if (BOARD.doneBinPanel && BOARD.doneBinPanel.parentNode) {
        BOARD.doneBinPanel.parentNode.removeChild(BOARD.doneBinPanel)
      }
      BOARD.doneBinPanel = null
      if (!BOARD.doneBinOpen || !BOARD.panel) return
      var cards = BOARD.doneBinFilter ? doneBinCardsOf(BOARD.doneBinFilter) : doneBinCards()
      // A list with nothing in it is not a list: the card stopped offering the
      // mark, and a panel left standing would be a door onto an empty room.
      if (!cards.length) {
        BOARD.doneBinOpen = false
        BOARD.rowOpen = ''
        return
      }
      var panel = document.createElement('div')
      Object.assign(panel.style, BOARD_UI.doneBinPanel)
      panel.className = 'dshv-done-bin'
      panel.setAttribute('data-role', 'doneBinPanel')
      panel.addEventListener('pointerdown', boardPointerDown)
      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.doneBinHead)
      head.setAttribute('data-role', 'doneBinHead')
      // The card is standing right beside this panel, so the heading says what the
      // list is and how long it is - not whose it is, twice.
      var name = document.createElement('span')
      name.textContent = paletteText('boardDoneBin')
      head.appendChild(name)
      var many = document.createElement('span')
      Object.assign(many.style, BOARD_UI.trayCount)
      many.textContent = String(cards.length)
      head.appendChild(many)
      var close = document.createElement('span')
      Object.assign(close.style, BOARD_UI.doneRowAction)
      close.style.marginLeft = 'auto'
      close.setAttribute('role', 'button')
      close.setAttribute('data-role', 'doneClose')
      close.setAttribute('aria-label', paletteText('close'))
      close.setAttribute('title', paletteText('close'))
      close.textContent = '×'
      close.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        BOARD.doneBinOpen = false
        BOARD.rowOpen = ''
        renderBoard()
      })
      head.appendChild(close)
      panel.appendChild(head)
      var list = document.createElement('div')
      Object.assign(list.style, BOARD_UI.doneBinList)
      list.setAttribute('data-role', 'doneBinList')
      for (var i = 0; i < cards.length; i++) list.appendChild(buildDoneRow(cards[i]))
      panel.appendChild(list)
      // Beside the card whose mark opened it: the list belongs to that card, and a
      // reader who pressed a mark on it expects the answer there - not in the
      // corner of the window, where it would have to be found twice.
      if (BOARD.doneBinFilter && BOARD.panel) {
        var anchor = null
        for (var n = 0; n < BOARD.nodes.length; n++) {
          if (BOARD.nodes[n].getAttribute('data-session-id') === BOARD.doneBinFilter) anchor = BOARD.nodes[n]
        }
        var rootRect = typeof BOARD.panel.getBoundingClientRect === 'function'
          ? BOARD.panel.getBoundingClientRect()
          : null
        var cardRect = anchor && typeof anchor.getBoundingClientRect === 'function'
          ? anchor.getBoundingClientRect()
          : null
        if (rootRect && cardRect && (cardRect.width || cardRect.height)) {
          var zoomNow = BOARD.zoom || 1
          panel.style.right = 'auto'
          panel.style.left = Math.round((cardRect.right - rootRect.left) / zoomNow + 10) + 'px'
          panel.style.top = Math.max(8, Math.round((cardRect.top - rootRect.top) / zoomNow)) + 'px'
        }
      }
      BOARD.panel.appendChild(panel)
      BOARD.doneBinPanel = panel
    }

    /**
     * Put one card back on the paper, out of the finished-cards bin.
     *
     * A bin that kept a card which no longer belongs there would be lying about
     * its own name: the moment a card in it stops being finished - or stops being
     * tied to anything - it goes back where it came from. It keeps its own place,
     * so the card reappears exactly where it left; what should happen to it next
     * is a question for the next tidy, not for this press.
     * @param {object} card - the card being taken out.
     * @returns {boolean} whether it was in the bin at all.
     */
    function ejectFromDoneBin(card) {
      if (!card || card.filed !== BOARD_DONE) return false
      BOARD_STORE.unfileCard(card.id)
      if (BOARD.open) renderBoard()
      showToast(paletteText('boardDoneBack'))
      return true
    }

    /**
     * The tray's body: the conversations nothing accounts for, and the notes put away here.
     *
     * A goal answers "what am I working on", and its rows are all conversations.
     * The inbox answers "what has not found a place", so it holds both kinds and
     * names the two sections rather than running them together: the reader has to
     * be able to see what is work and what is a thought at a glance.
     * @param {object} block - the inbox block.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the body's contents.
     */
    function buildInboxBody(block, titles) {
      var wrap = document.createElement('div')
      Object.assign(wrap.style, BOARD_UI.tray)
      // The tray is one material. Its conversations wear the ideas' paper, so a
      // panel of two kinds reads as one place rather than two lists stacked; the
      // class is what the stylesheet hangs that on, and the ideas keep their one
      // line because a line is what a list is read in.
      wrap.className = 'dshv-tray'
      wrap.setAttribute('data-role', 'inboxBody')
      // Everything filed that is not in the bin is read here - the inbox, and
      // whatever a newer build might have filed somewhere this one cannot draw:
      // a card nobody draws is a card the reader has lost, and the tray is the
      // one place that can always show it.
      var notes = BOARD_STORE.filedCards(BOARD_INBOX)
      var every = BOARD_STORE.cards()
      for (var f = 0; f < every.length; f++) {
        var held = every[f]
        if (!held.filed || held.filed === BOARD_INBOX || held.filed === BOARD_DONE) continue
        notes.push(held)
      }
      wrap.appendChild(trayCaption(paletteText('boardInboxSessions'), block.rows.length))
      if (!block.rows.length) {
        wrap.appendChild(trayQuiet(paletteText('boardEmptyInbox')))
      } else {
        var tree = buildBoardTree(block.rows, titles)
        // Every conversation in the tray wears the ideas' paper. The walk is here
        // rather than in the builder because it is the tray's fact, not a card's:
        // the same card dropped into a goal goes back to the goal's own ink.
        trayInk(tree)
        wrap.appendChild(tree)
      }
      wrap.appendChild(trayCaption(paletteText('boardInboxNotes'), notes.length))
      if (!notes.length) wrap.appendChild(trayQuiet(paletteText('boardEmptyTrayIdeas')))
      for (var i = 0; i < notes.length; i++) wrap.appendChild(buildTrayNote(notes[i], titles))
      return wrap
    }

    function buildBoardTree(rows, titles) {
      var byId = Object.create(null)
      var i
      for (i = 0; i < rows.length; i++) byId[rows[i].id] = rows[i]
      var children = Object.create(null)
      var roots = []
      for (i = 0; i < rows.length; i++) {
        var row = rows[i]
        var parentId = BOARD_STORE.lineageOf(row.id)
        if (parentId && parentId !== row.id && byId[parentId]) {
          if (!children[parentId]) children[parentId] = []
          children[parentId].push(row)
        } else {
          roots.push(row)
        }
      }
      var list = document.createElement('div')
      Object.assign(list.style, BOARD_UI.tree)
      var seen = Object.create(null)
      for (i = 0; i < roots.length; i++) {
        var parent = BOARD_STORE.lineageOf(roots[i].id)
        var orphan = parent && !byId[parent] ? parent : ''
        list.appendChild(buildBoardNode(roots[i], children, titles, false, orphan, seen))
      }
      return list
    }

    /**
     * One conversation and the branches under it.
     *
     * A nested thread carries the short horizontal stroke that meets the
     * vertical rail its block of children hangs from; together they are the line
     * the reader follows back to the conversation this one was cut from.
     * @param {object} summary - session summary.
     * @param {object} children - parent id -> its conversations in the block.
     * @param {object} titles - session id -> the name to call it by.
     * @param {boolean} nested - whether this thread sits under a parent.
     * @param {string} orphan - a parent this block does not carry, or ''.
     * @param {object} seen - ids already drawn, so a broken store cannot loop.
     * @returns {Element} the thread.
     */
    function buildBoardNode(summary, children, titles, nested, orphan, seen) {
      var node = document.createElement('div')
      Object.assign(node.style, BOARD_UI.thread)
      if (nested) Object.assign(node.style, BOARD_UI.threadNested)
      // A store edited by hand can say A came from B and B came from A. The
      // second visit draws nothing rather than walking in a circle.
      if (seen[summary.id]) return node
      seen[summary.id] = true
      node.appendChild(buildBoardCard(summary, orphan, titles))
      var kids = children[summary.id] || []
      if (kids.length) {
        var box = document.createElement('div')
        Object.assign(box.style, BOARD_UI.children)
        box.setAttribute('data-role', 'forkChildren')
        for (var i = 0; i < kids.length; i++) {
          box.appendChild(buildBoardNode(kids[i], children, titles, true, '', seen))
        }
        node.appendChild(box)
      }
      if (nested) {
        var rail = document.createElement('div')
        Object.assign(rail.style, BOARD_UI.connector)
        rail.setAttribute('data-role', 'forkLine')
        node.appendChild(rail)
      }
      return node
    }

    /**
     * Wear the one beat a completion is worth - once.
     *
     * The beat is the task window's own: a fast front edge and a slow settle,
     * over in under a second, leaving a quiet ring behind while the completion is
     * still unread. The board used to hang it on the element and let CSS play it,
     * which meant it played again on every repaint - a drag, a star, a status
     * tick, all of them. The ledger is what makes it once.
     * @param {Element} card - the card being drawn.
     * @param {string} id - session id.
     * @returns {void}
     */
    function markCardFresh(card, id) {
      card.setAttribute('data-unread', 'true')
      if (BOARD.freshed[id]) return
      BOARD.freshed[id] = true
      card.setAttribute('data-fresh', 'true')
    }

    /**
     * One conversation on the board: its name, what it is doing, and the
     * buttons that act on it.
     *
     * The card itself is the way in. It used to be the one thing on the board a
     * press did nothing to - opening was a small arrow on a rail, and the name
     * was a rename field waiting for a mis-click - which made the largest target
     * on the canvas carry the least likely action and the most likely action
     * carry a destructive one. A press that never travels now opens the
     * conversation; the marks and fields inside stop their own presses, so
     * nothing else on the card can be confused with it.
     *
     * Renaming is deliberate instead: it has a mark of its own at the end of the
     * name, out of the way until the pointer arrives (see `cardRenameOpen`).
     * There is no 进入 button: it was a fifth of the card spent on the one action
     * the card already answered to. What is left as a target is the drop - an
     * idea card carried onto this one - and that overlay is drawn only while a
     * card is being carried (see `data-note-drag`).
     * @param {object} summary - session summary.
     * @param {string} orphan - a fork source this block does not carry, or ''.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the card.
     */

    function buildBoardCard(summary, orphan, titles) {
      var card = document.createElement('div')
      Object.assign(card.style, BOARD_UI.card)
      card.className = 'dshv-card'
      card.setAttribute('data-session-id', summary.id)
      card.setAttribute('data-handle', 'card')
      var turns = BOARD_TURNS.read(summary)
      var name = boardTitleOf(summary)
      card.setAttribute('title', paletteText('boardCardMoveHint'))
      // The card itself is the way in. The gesture layer has already settled
      // whether a press was a carry or a click (a press that travels past
      // `BOARD_SLOP` is a carry and repaints), and every control drawn inside
      // this card stops its own press before it reaches here - so what arrives
      // at this handler is, by construction, a press on the conversation.
      card.addEventListener('click', function () {
        // A click that follows a carry is the gesture's leftover, not a request:
        // the same one-shot guard the marks use, in one place instead of five.
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        activateSession(summary.id)
      })
      var status = statusOf(summary)
      // What the card is doing, said in material as well as in a word: a turn in
      // flight wears a ring that breathes, one parked on the reader wears a still
      // ring, and a completion nobody has looked at yet gets one beat.
      if (statusIsLive(status)) {
        card.setAttribute('data-live', 'true')
        // Waiting is not working. The same turn parked on a question or an
        // approval must not look like something moving without the reader.
        if (status.key === 'pending') card.setAttribute('data-waiting', 'true')
      }
      if (status && status.key === 'done') markCardFresh(card, summary.id)
      else if (BOARD.freshed[summary.id]) delete BOARD.freshed[summary.id]
      if (BOARD.front === summary.id) {
        card.setAttribute('data-front', 'true')
        card.style.zIndex = String(BOARD.zTop)
      }

      // Four fifths what the card says, one fifth what can be done with it. The
      // way in used to sit in a row of words under the name, the same size and
      // the same material as the marks beside it, at the bottom of the card.
      var row = document.createElement('div')
      Object.assign(row.style, BOARD_UI.cardRow)
      var main = document.createElement('div')
      Object.assign(main.style, BOARD_UI.cardMain)

      if (BOARD.renamingCard === summary.id) {
        var field = document.createElement('input')
        Object.assign(field.style, BOARD_UI.cardRenameBox)
        field.setAttribute('type', 'text')
        field.setAttribute('data-role', 'cardRename')
        field.setAttribute('aria-label', paletteText('rename'))
        field.setAttribute('data-no-drag', 'true')
        field.value = BOARD.renameCardDraft === null ? name : BOARD.renameCardDraft
        field.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBoardRename()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardRename()
          }
        })
        field.addEventListener('blur', function () {
          if (BOARD.renamingCard === summary.id && BOARD.renameCardInput === field) commitBoardRename()
        })
        field.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        })
        main.appendChild(field)
        BOARD.renameCardInput = field
      } else {
        // The name is a label. A press on it is a press on the conversation and
        // opens it, like the rest of the card; renaming has a target of its own
        // at the end of this line, so a press meant for the conversation can
        // never land in a field.
        var title = document.createElement('div')
        Object.assign(title.style, BOARD_UI.cardTitle)
        title.setAttribute('data-role', 'cardTitle')
        title.textContent = name
        main.appendChild(title)
        // Renaming is a host write on the conversation, so it is not the name
        // itself: it is a mark that arrives when the pointer is already on the
        // card, and a press meant for the conversation can never land in it.
        //
        // It stands over the end of the first line rather than in a column of
        // its own: the state row has no width to spare (it gives way to the
        // clock first), and a mark that took a seat there would cost every card
        // its timestamp to pay for a word most cards never use.
        var renameMark = document.createElement('span')
        Object.assign(renameMark.style, BOARD_UI.cardRenameOpen)
        renameMark.className = 'dshv-rename'
        renameMark.setAttribute('role', 'button')
        renameMark.setAttribute('data-role', 'cardRenameOpen')
        renameMark.setAttribute('title', paletteText('boardCardRenameHint'))
        renameMark.setAttribute('aria-label', paletteText('boardCardRenameHint'))
        renameMark.textContent = paletteText('boardCardRenameHint')
        renameMark.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginBoardRename(summary.id)
        })
        main.appendChild(renameMark)
      }

      // Where a line would run off the panel, the card says in words where the
      // branch came from: the parent is real and named, it is simply not here
      // today. Pressing it opens that conversation.
      if (orphan) {
        var source = document.createElement('div')
        Object.assign(source.style, BOARD_UI.forkSource)
        source.setAttribute('data-role', 'forkSource')
        var parentTitle = titles[orphan]
        if (parentTitle) {
          source.textContent = paletteText('boardForkSource') + parentTitle
          source.setAttribute('title', paletteText('boardForkSource') + parentTitle)
          source.style.cursor = 'pointer'
          source.addEventListener('click', function (ev) {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
            activateSession(orphan)
          })
        } else {
          source.textContent = paletteText('boardForkSourceUnknown')
        }
        main.appendChild(source)
      }

      // What this conversation has been told, read once for both the line it
      // is drawn as and the mark that offers to start one.
      var pinned = NOTE_STORE.get(summary.id)
      if (BOARD.noteEditing === summary.id) {
        var editor = document.createElement('input')
        Object.assign(editor.style, BOARD_UI.cardNoteBox)
        editor.setAttribute('type', 'text')
        editor.setAttribute('data-role', 'cardNoteBox')
        editor.setAttribute('aria-label', paletteText('notePlaceholder'))
        editor.setAttribute('data-no-drag', 'true')
        editor.setAttribute('placeholder', paletteText('notePlaceholder'))
        editor.value = pinned
        editor.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBoardNote()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardNote()
          }
        })
        // A press elsewhere keeps what was typed: a note is a thought already
        // had, and losing it because the reader looked away is the one failure
        // this cannot afford.
        editor.addEventListener('blur', function () {
          if (BOARD.noteEditing === summary.id && BOARD.noteEditor === editor) commitBoardNote()
        })
        editor.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        })
        main.appendChild(editor)
        BOARD.noteEditor = editor
      } else if (pinned) {
        var noteLine = document.createElement('div')
        Object.assign(noteLine.style, BOARD_UI.cardNote)
        noteLine.setAttribute('data-role', 'note')
        noteLine.setAttribute('title', paletteText('noteEdit'))
        noteLine.textContent = pinned
        noteLine.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginBoardNote(summary.id)
        })
        main.appendChild(noteLine)
      }

      var meta = document.createElement('div')
      Object.assign(meta.style, BOARD_UI.cardMeta)
      meta.setAttribute('data-role', 'cardMeta')
      meta.setAttribute('data-role', 'cardMeta')
      // The state chip leads the meta line, the seat it holds on the task
      // window's rows: the eye reads what the conversation is doing before it
      // reads which conversation it is. The clock rides in the chip exactly as
      // it does there, updated in place by the board's own tick.
      if (status) {
        var chip = document.createElement('span')
        Object.assign(
          chip.style,
          BOARD_UI.cardChip,
          BOARD_UI['cardChip' + status.key[0].toUpperCase() + status.key.slice(1)]
        )
        chip.setAttribute('data-role', 'status')
        chip.className = 'dshv-chip'
        if (statusIsLive(status)) chip.setAttribute('data-live', 'true')
        if (status.key === 'pending') chip.setAttribute('data-waiting', 'true')
        var since = statusIsLive(status) ? runSince(summary.id) : 0
        var elapsed = since ? elapsedText(Date.now() - since) : ''
        chip.textContent = elapsed ? status.text + ' · ' + elapsed : status.text
        chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : status.text)
        meta.appendChild(chip)
        if (since) BOARD.clocks.push({ chip: chip, label: status.text, since: since })
      }

      // What was handed to this conversation, put away: the mark only exists
      // when it holds something, because a card's own line has no room to spare
      // for a door that opens on nothing.
      var archived = doneBinCardsOf(summary.id).length
      if (archived) {
        var archive = document.createElement('span')
        Object.assign(archive.style, BOARD_UI.cardArchive)
        archive.className = 'dshv-archive'
        archive.setAttribute('role', 'button')
        archive.setAttribute('data-role', 'cardArchive')
        archive.setAttribute('title', paletteText('boardDoneBinHint'))
        archive.setAttribute('aria-label', paletteText('boardDoneBinHint'))
        archive.appendChild(boardIcon('archive', 13))
        var archiveCount = document.createElement('span')
        archiveCount.setAttribute('data-role', 'cardArchiveCount')
        archiveCount.textContent = String(archived)
        archive.appendChild(archiveCount)
        archive.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          openDoneBinFor(summary.id)
        })
        meta.appendChild(archive)
      }

      // Two conversations can honestly wear one name - a workspace's own title
      // is what an untitled conversation shows, and a branch inherits its
      // parent's. When that happens on the board, both cards say which of them
      // they are, in a form that never moves: the count of namesakes, and this
      // card's place among them.
      var dup = BOARD.dupes[summary.id]
      if (dup) {
        var dupTag = document.createElement('span')
        Object.assign(dupTag.style, BOARD_UI.cardDupTag)
        dupTag.setAttribute('data-role', 'cardDupTag')
        dupTag.setAttribute('title', paletteText('boardCardDupHint'))
        dupTag.textContent = '#' + dup.at + '/' + dup.of
        meta.appendChild(dupTag)
      }

      // The tail is one flex group pushed to the far end, so the count and the
      // marks stay together however many of them are drawn.
      var tail = document.createElement('div')
      Object.assign(tail.style, BOARD_UI.cardTail)
      if (turns !== null) {
        var badge = document.createElement('span')
        Object.assign(badge.style, BOARD_UI.cardBadge)
        badge.setAttribute('data-role', 'turns')
        badge.textContent = turns + ' ' + paletteText('turnUnit')
        badge.setAttribute('title', badge.textContent)
        tail.appendChild(badge)
      }
      // The way in for a card that carries no line yet: a quiet mark before the
      // other marks.
      if (!pinned && BOARD.noteEditing !== summary.id) {
        var pin = document.createElement('span')
        Object.assign(pin.style, BOARD_UI.cardNotePin)
        pin.setAttribute('data-role', 'cardNotePin')
        pin.setAttribute('title', paletteText('boardAddNote'))
        pin.textContent = '✎'
        pin.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginBoardNote(summary.id)
        })
        tail.appendChild(pin)
      }
      var star = document.createElement('span')
      Object.assign(star.style, BOARD_UI.cardStar)
      star.setAttribute('data-role', 'cardStar')
      var marked = BOARD_STORE.isStarred(summary.id)
      star.setAttribute('aria-pressed', marked ? 'true' : 'false')
      star.setAttribute('title', paletteText(marked ? 'boardUnstar' : 'boardStar'))
      star.textContent = marked ? '★' : '☆'
      if (marked) star.style.color = BOARD_INK.accent
      star.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.toggleStar(summary.id)
        renderBoard()
      })
      tail.appendChild(star)
      // Deleting is taking it off the board, not archiving the conversation:
      // the shell keeps it, the sidebar keeps it, and it comes back the next
      // time it is used.
      var drop = document.createElement('span')
      Object.assign(drop.style, BOARD_UI.cardRemove)
      drop.setAttribute('data-role', 'cardRemove')
      drop.setAttribute('title', paletteText('boardChatRemove'))
      drop.textContent = '×'
      drop.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        removeBoardCard(summary)
      })
      tail.appendChild(drop)
      meta.appendChild(tail)
      main.appendChild(meta)

      // The way to branch, beside the other marks: the card has one row of verbs
      // at its foot, and a rail of its own is gone with the button that needed it.
      var fork = document.createElement('span')
      Object.assign(fork.style, BOARD_UI.cardForkButton)
      fork.className = 'dshv-fork'
      fork.setAttribute('role', 'button')
      fork.setAttribute('data-role', 'cardFork')
      fork.setAttribute('aria-label', paletteText('boardForkHint'))
      fork.setAttribute('title', paletteText('boardForkHint'))
      fork.appendChild(boardIcon('fork', 14))
      // A branch in flight is a branch already being made. The mark stays where
      // it is and stops answering until the host has said what the child is
      // called, so a hand that presses twice out of impatience gets one branch
      // rather than two identical ones.
      if (BOARD.forking[summary.id]) {
        fork.setAttribute('data-busy', 'true')
        fork.setAttribute('aria-busy', 'true')
        fork.setAttribute('title', paletteText('boardForkBusy'))
        fork.setAttribute('aria-label', paletteText('boardForkBusy'))
      }
      fork.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        if (BOARD.forking[summary.id]) return
        forkBoardCard(summary)
      })
      tail.appendChild(fork)
      meta.appendChild(tail)
      main.appendChild(meta)
      row.appendChild(main)

      // The way in is a double press on the card, so the only thing that has to
      // still be a target is a card being carried onto this one: the overlay is
      // drawn for that one moment (`data-note-drag`) and is out of the way, and
      // out of the hit test, the rest of the time.
      var enter = document.createElement('span')
      Object.assign(enter.style, BOARD_UI.cardEnter)
      enter.className = 'dshv-enter'
      enter.setAttribute('data-role', 'cardEnter')
      enter.setAttribute('aria-hidden', 'true')
      var enterWord = document.createElement('span')
      enterWord.setAttribute('data-role', 'cardEnterWord')
      enterWord.textContent = paletteText('boardCardEnterHint')
      enter.appendChild(boardIcon('enter', 16))
      // The band keeps its own word: a carry decides what letting go means, and a
      // band that had to be rebuilt for that would be a repaint under the hand.
      enter.enterWord = enterWord
      enter.appendChild(enterWord)
      card.appendChild(enter)
      BOARD.dropZones.push(enter)
      card.appendChild(row)

      BOARD.nodes.push(card)
      return card
    }

    /**
     * Start typing a goal's name into its heading.
     * @param {string} key - the block's id.
     * @returns {void}
     */
    function beginBlockRename(key) {
      BOARD.renamingBlock = key
      renderBoard()
    }

    /** Keep the name the heading says, and close the field. */
    function commitBlockRename() {
      if (!BOARD.renamingBlock) return false
      var field = BOARD.renameBlockInput
      var key = BOARD.renamingBlock
      BOARD.renamingBlock = ''
      BOARD.renameBlockInput = null
      BOARD_STORE.setBlockLabel(key, field ? field.value : '')
      renderBoard()
      return true
    }

    /** Throw the typed name away, leaving the goal as it was called. */
    function cancelBlockRename() {
      if (!BOARD.renamingBlock) return false
      BOARD.renamingBlock = ''
      BOARD.renameBlockInput = null
      renderBoard()
      return true
    }

    /**
     * The last piece of a workspace path: what the workspace is called.
     *
     * A goal renamed to what the reader is doing there still came from
     * somewhere, and the name of that somewhere is the whole of what the panel
     * owes about it.
     * @param {string} path - the workspace's path.
     * @returns {string} its last segment, or ''.
     */
    function goalBaseName(path) {
      var parts = String(path || '').split(/[\\/]+/)
      for (var i = parts.length - 1; i >= 0; i--) {
        if (parts[i]) return parts[i]
      }
      return ''
    }

    /**
     * Start writing what a goal is for.
     * @param {string} key - the block's id.
     * @returns {void}
     */
    function beginGoalIntent(key) {
      BOARD.intentBlock = key
      renderBoard()
    }

    /**
     * Keep what the open line says, and close it.
     *
     * An empty line is a statement withdrawn: the goal stops being held by it,
     * and one with no conversations goes on the next paint. `paint` is false
     * only when the board is closing, where a repaint would draw a page that is
     * already on its way out.
     * @param {boolean} [paint] - false to write without repainting.
     * @returns {boolean} whether a line was open.
     */
    function commitGoalIntent(paint) {
      if (!BOARD.intentBlock) return false
      var key = BOARD.intentBlock
      var field = BOARD.intentInput
      BOARD.intentBlock = ''
      BOARD.intentInput = null
      BOARD_STORE.setIntent(key, field ? field.value : '')
      if (paint !== false) renderBoard()
      return true
    }

    /** Throw the typed line away, leaving the goal as it was. */
    function cancelGoalIntent() {
      if (!BOARD.intentBlock) return false
      BOARD.intentBlock = ''
      BOARD.intentInput = null
      renderBoard()
      return true
    }

    /**
     * Take one goal off the canvas, with a few seconds to bring it back.
     *
     * Nothing is deleted but the place: every conversation filed here goes back
     * to the goal its workspace gives it, which is the rule a card already
     * follows when it is carried into another goal. The notice offers the way
     * back, because a place that disappears under a mis-click must not be a
     * place the reader has to rebuild by hand.
     * @param {object} block - the goal being closed.
     * @returns {void}
     */
    function removeBoardGoal(block) {
      if (!block || block.kind !== 'user') return
      var record = BOARD_STORE.removeGoal(block.key)
      if (!record) return
      if (BOARD.intentBlock === block.key) {
        BOARD.intentBlock = ''
        BOARD.intentInput = null
      }
      delete BOARD.drafts[block.key]
      var line = paletteText('boardGoalRemoved') + (record.label || paletteText('boardNewGoal'))
      if (record.moved) line = line + ' (' + record.moved + paletteText('boardGoalReleased') + ')'
      // The notice is a shortcut into the history, not a second way of undoing:
      // it holds the step it was made for, so a delete that happened after it
      // cannot be undone by pressing this notice.
      var command = BOARD_HISTORY.record({
        label: paletteText('boardUndoGoal'),
        undo: function () {
          BOARD_STORE.restoreGoal(record)
          if (BOARD.open) renderBoard()
        },
        redo: function () {
          BOARD_STORE.removeGoal(block.key)
          if (BOARD.open) renderBoard()
        },
      })
      renderBoard()
      TOAST.sayAction(line, paletteText('boardGoalUndo'), BOARD_UNDO_MS, function () {
        BOARD_HISTORY.undoTo(command)
      })
    }

    /**
     * Which drawn cards share a name, and where each one stands in its group.
     *
     * A name is a handle. Two conversations can honestly wear one - an untitled
     * conversation shows its workspace's name, and a branch inherits its
     * parent's - and the board cannot make them unique, because those names
     * belong to the conversations and renaming them is a write nobody asked for.
     * What it can do is say where this card stands among its namesakes, so a
     * reader looking at two identical lines can name the one they mean.
     *
     * Ordered by id rather than by time: an ordinal that renumbers itself the
     * moment a sibling is touched is worse than no ordinal at all. Nothing is
     * said when there is no collision, which is almost always.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {object} session id -> {at, of}, for the cards that collide.
     */
    function boardNameCollisions(titles) {
      var groups = Object.create(null)
      var i
      for (i = 0; i < BOARD.rows.length; i++) {
        var id = BOARD.rows[i].id
        var name = titles[id] === undefined ? id : titles[id]
        if (!groups[name]) groups[name] = []
        groups[name].push(id)
      }
      var out = Object.create(null)
      for (var key in groups) {
        if (!Object.prototype.hasOwnProperty.call(groups, key)) continue
        var ids = groups[key]
        if (ids.length < 2) continue
        ids.sort()
        for (i = 0; i < ids.length; i++) out[ids[i]] = { at: i + 1, of: ids.length }
      }
      return out
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
     * Put the reader's word on a card before the shell has answered.
     *
     * The list is the truth, but it arrives a moment later. The word stands in
     * for it until the feed agrees, or until the shell has had time to answer at
     * all - a name the host silently dropped must not outlive the attempt.
     * @param {string} id - session id.
     * @param {string} title - the name that was sent.
     * @returns {void}
     */
    function noteCardTitle(id, title) {
      BOARD.titles[id] = { title: title, at: Date.now() }
      if (BOARD.titleTimer) window.clearTimeout(BOARD.titleTimer)
      BOARD.titleTimer = window.setTimeout(function () {
        BOARD.titleTimer = 0
        BOARD.titles = Object.create(null)
        if (BOARD.open) renderBoard()
      }, BOARD_TITLE_SETTLE_MS)
    }

    /**
     * Let go of the stand-in names the feed has caught up with, or outlived.
     * @param {Array<object>} pool - the conversations this paint will draw.
     * @returns {void}
     */
    function settleTitles(pool) {
      var live = Object.create(null)
      var i
      for (i = 0; i < pool.length; i++) live[pool[i].id] = pool[i]
      for (var id in BOARD.titles) {
        if (!Object.prototype.hasOwnProperty.call(BOARD.titles, id)) continue
        var said = BOARD.titles[id]
        var now = live[id]
        if (!now) continue
        if (String(now.displayTitle || '') === said.title) delete BOARD.titles[id]
        else if (Date.now() - said.at > BOARD_TITLE_SETTLE_MS) delete BOARD.titles[id]
      }
    }

    /**
     * Start renaming one conversation from its card.
     * @param {string} id - session id.
     * @returns {void}
     */
    function beginBoardRename(id) {
      BOARD.renamingCard = id
      BOARD.renameCardDraft = null
      renderBoard()
    }

    /**
     * Keep what the open name field says, and rename the conversation.
     *
     * The rename goes through the same private-source hop the task window uses,
     * so renaming from the board never marks the conversation read. An empty
     * name is refused in place rather than sent to the host.
     * @returns {boolean} whether a field was open.
     */
    function commitBoardRename() {
      if (!BOARD.renamingCard) return false
      var field = BOARD.renameCardInput
      var id = BOARD.renamingCard
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
      BOARD.renameCardDraft = null
      if (!field) {
        renderBoard()
        return true
      }
      var title = String(field.value || '').trim()
      if (!title) {
        renderBoard()
        showToast(paletteText('renameNoName'))
        return true
      }
      // The card says the new name before the host is asked, so the rename reads
      // as done the moment Enter is pressed. The list settles it a moment later.
      noteCardTitle(id, title)
      renderBoard()
      renameSession(id, title, function (reason) {
        if (!reason) {
          if (BOARD.open) renderBoard()
          return
        }
        // A refusal takes the stand-in name away and puts the field back, with
        // what was typed still in it: the words are the reader's, and a failed
        // rename must not eat them.
        delete BOARD.titles[id]
        BOARD.renameCardDraft = title
        BOARD.renamingCard = id
        showToast(reason)
        if (BOARD.open) renderBoard()
      })
      return true
    }

    /** Throw the open name field away, leaving the conversation as it was. */
    function cancelBoardRename() {
      if (!BOARD.renamingCard) return false
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
      BOARD.renameCardDraft = null
      renderBoard()
      return true
    }

    /**
     * Start a branch from one conversation, and draw the line when it lands.
     *
     * The host offers no parent on the child, so the pair is remembered here as
     * well as by the watcher: whichever path the fork took, the board can draw
     * the line it just watched. A source that needs migration is left to the
     * host to answer, and a refusal is said out loud rather than swallowed.
     * @param {object} summary - the conversation to fork.
     * @returns {void}
     */
    function forkBoardCard(summary) {
      var services = taskServices()
      var controller = services && services.controller
      if (!controller || typeof controller.fork !== 'function') {
        showToast(paletteText('boardForkUnavailable'))
        return
      }
      // One branch per press. The mark stops answering for as long as the host
      // is making this one; a hand that presses twice out of impatience used to
      // get two children, and two children of one conversation are drawn as two
      // cards with one name.
      BOARD.forking[summary.id] = true
      if (BOARD.open) renderBoard()
      var result
      try {
        result = controller.fork({ sessionId: summary.id, increaseTitle: true })
      } catch (error) {
        console.warn('[dsh-vim] fork failed', error)
        returnForkMark(summary.id)
        showToast(paletteText('boardForkFailed'))
        return
      }
      Promise.resolve(result).then(function (childId) {
        // `rememberFork` repaints: the line, the child, and the goal it was filed
        // in all come from that one paint. What it cannot do is show a card in a
        // panel scrolled out of sight, so the new branch is brought into view
        // here, after the paint that drew it.
        rememberFork(summary.id, childId)
        if (BOARD.open) revealBoardCard(childId)
        // The host names a branch by incrementing its parent's own title, which
        // leaves two branches of one conversation with one name between them -
        // and leaves an untitled parent's child called nothing new at all. The
        // board is the only party holding the whole list, so it settles the
        // name here and says which one the branch got.
        return settleBranchName(childId)
      }).then(function (named) {
        returnForkMark(summary.id)
        if (named) showToast(paletteText('boardForkDone') + named)
      }, function (error) {
        console.warn('[dsh-vim] fork failed', error)
        returnForkMark(summary.id)
        showToast(paletteText('boardForkFailed'))
      })
    }

    /** Let a conversation's branch mark answer again, and say so on the card. */
    function returnForkMark(id) {
      delete BOARD.forking[id]
      if (BOARD.open) renderBoard()
    }

    /**
     * The catalogue row for one conversation, asked for until it arrives.
     *
     * The host resolves a fork before it publishes the child's row, so the list
     * read the instant the promise settles is a list without the branch in it.
     * The wait is bounded and silent: a host that never publishes the row costs
     * one card the host's own name and nothing else.
     * @param {string} id - session id.
     * @param {number} tries - how many more times to ask.
     * @returns {Promise<object|undefined>} the row, or undefined when it never came.
     */
    function waitForBranchRow(id, tries) {
      var pool = conversationPool()
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].id === id) return Promise.resolve(pool[i])
      }
      if (tries <= 0) return Promise.resolve(undefined)
      return new Promise(function (resolve) {
        window.setTimeout(function () {
          resolve(waitForBranchRow(id, tries - 1))
        }, 60)
      })
    }

    /**
     * Give a fresh branch a name nobody else is using, and answer with it.
     *
     * A branch inherits its parent's title, and the host increments a trailing
     * number before it resolves - but it increments the *parent's* title, so the
     * second branch cut from one conversation carries exactly the words the
     * first one got, and a parent with no title of its own passes on nothing at
     * all. Neither is a name a reader can use: two cards answering to the same
     * words leave them with nothing to say when they want one of them. The board
     * reads the child back, and when the name is already spoken for it takes the
     * next free number in the same shape the host uses - the same edit, carried
     * one step further.
     *
     * Answers '' when the child could not be read in time or its name is already
     * its own; the card then says which of several same-named cards it is (see
     * `boardNameCollisions`), which is the fallback rather than the goal.
     * @param {string} childId - the branch's session id.
     * @returns {Promise<string>} the name the branch wears, or '' for unknown.
     */
    function settleBranchName(childId) {
      return waitForBranchRow(childId, 24).then(function (child) {
        if (!child) return ''
        var title = String(child.displayTitle || '')
        var taken = Object.create(null)
        var pool = conversationPool()
        var i
        for (i = 0; i < pool.length; i++) {
          if (pool[i].id === childId) continue
          taken[String(pool[i].displayTitle || pool[i].id)] = true
        }
        if (!title || !taken[title]) return title
        // The base is the title without the number the host just added, so the
        // child reads as the next of its parent's branches rather than as a
        // fresh series of its own.
        var base = title.replace(/\s*[(\uFF08]\d+[)\uFF09]\s*$/, '') || title
        var n = 1
        while (taken[base + ' (' + n + ')']) n = n + 1
        var next = base + ' (' + n + ')'
        noteCardTitle(childId, next)
        if (BOARD.open) renderBoard()
        renameSession(childId, next, function (reason) {
          if (reason) console.warn('[dsh-vim] branch rename refused', reason)
        })
        return next
      }).then(null, function (error) {
        console.warn('[dsh-vim] branch name could not be settled', error)
        return ''
      })
    }

    /**
     * Hand one loose card's words to a conversation's message box.
     *
     * Dropping the card opens the conversation first, and its box mounts a
     * moment later, so this waits a few frames for it instead of assuming it is
     * there. The words arrive as a paste, not as a replaced draft: whatever the
     * reader had already typed stays where it was. Both endings are reported,
     * because a card that found no box must not vanish with the thought on it.
     * @param {string} text - what the card says, trimmed.
     * @param {string} sessionId - the conversation to open.
     * @param {Function} ok - called once the words have been handed over.
     * @param {Function} fail - called when there is no box to put them in.
     * @returns {void}
     */
    function dropCardIntoComposer(text, sessionId, ok, fail) {
      activateSession(sessionId)
      var tries = 0
      function put() {
        var root = composerRoot()
        if (!root) {
          if (tries < 24) {
            tries = tries + 1
            window.setTimeout(put, 60)
            return
          }
          fail()
          return
        }
        focusComposer()
        // A rich-text editor inserts a line through the editing command; it
        // arrives as typing, which is what keeps the draft's own history and
        // the shell's placeholder in step.
        if (typeof document.execCommand === 'function') {
          try {
            if (document.execCommand('insertText', false, text)) {
              ok()
              return
            }
          } catch (error) {
            /* the paste event below is the other way in */
          }
        }
        // A native paste is the honest fallback: it is the same event a real
        // copy-and-paste fires, so the host's own handler decides what to do
        // with it.
        try {
          if (typeof ClipboardEvent !== 'function' || typeof DataTransfer !== 'function') {
            fail()
            return
          }
          var data = new DataTransfer()
          data.setData('text/plain', text)
          root.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }))
          ok()
        } catch (error) {
          console.warn('[dsh-vim] could not paste the card into the conversation', error)
          fail()
        }
      }
      put()
    }

    /**
     * One loose card: a thought the reader put on the canvas rather than in a
     * conversation.
     *
     * It belongs to no workspace and to no conversation, so nothing on the feed
     * can move it. Its heading is the handle, its body is the text, and the ×
     * takes it away. The text is written as it is typed rather than on blur, so
     * a repaint cannot cost a sentence.
     * @param {object} card - one of `BOARD_STORE.cards`.
     * @returns {Element} the card.
     */
    function buildBoardLooseCard(card, titles) {
      var node = document.createElement('div')
      Object.assign(node.style, BOARD_UI.loose)
      node.className = 'dshv-note'
      // A delivered card keeps its place on the board, but quietly: the work it
      // fed is where the attention belongs now, and the card is the receipt.
      if (card.done) Object.assign(node.style, BOARD_UI.looseDone)
      if (BOARD.cardEditing === card.id) Object.assign(node.style, BOARD_UI.looseEditing)
      // What this card is written in: its goal's hue, or the amber of a note that
      // belongs to nobody yet. Read once here, because the paper, the words and
      // every mark on it are the same ink in different weights.
      var ink = null
      node.style.left = card.x + 'px'
      node.style.top = card.y + 'px'
      node.style.width = BOARD_CARD_W + 'px'
      // One shape in every state. The paper is planned from the words, and the
      // words and the field are set in the same ruler (`boardNoteMetrics`), so
      // the card that is planned is the card that is painted - and a press,
      // which swaps the words for the field, cannot change its size.
      // Which panel this card's conversation stands in, read before the paper is
      // inked: the paper and the dot are the same fact said twice.
      var linkedBlock = null
      if (card.link) {
        for (var lb = 0; lb < BOARD.blocks.length; lb++) {
          var rowsHere = BOARD.blocks[lb].rows
          for (var lr = 0; lr < rowsHere.length; lr++) {
            if (rowsHere[lr].id === card.link) linkedBlock = BOARD.blocks[lb]
          }
        }
      }
      if (!card.done) Object.assign(node.style, notePaper(linkedBlock))
      ink = noteInkOf(linkedBlock, card.done)
      node.style.color = ink.text
      var parts = noteParts(card.text)
      var opened = BOARD.cardEditing === card.id
      var box = opened ? boardCardOpenBox(card.text) : boardCardBox(card.text, card.h)
      var metrics = boardNoteMetrics()
      node.style.height = box.height + 'px'
      node.setAttribute('data-rows', String(box.lines))
      // While its field is up the card is a floor rather than a height: the field
      // opens at the paper it replaced, and the card follows it only if the
      // writing needs more room than that paper had.
      if (BOARD.cardEditing === card.id) {
        node.style.height = 'auto'
        node.style.minHeight = box.height + 'px'
      }
      // A card that holds more than it can show says so by fading its last line
      // rather than by hiding the rest behind a scrollbar inside the paper.
      if (parts.rows > box.lines) node.setAttribute('data-clipped', 'true')
      if (BOARD.front === card.id) {
        node.setAttribute('data-front', 'true')
        node.style.zIndex = String(BOARD.zTop)
      }
      // There is no corner to drag: a card is opened by pressing it, which shows
      // the whole of it, and closed by leaving it (see `boardCardOpenBox`).
      node.setAttribute('data-role', 'looseCard')
      node.setAttribute('data-card-id', card.id)
      node.setAttribute('data-handle', 'note')
      node.setAttribute('data-editing', BOARD.cardEditing === card.id ? 'true' : 'false')
      if (card.done) node.setAttribute('data-done', 'true')

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.looseHead)
      head.className = 'dshv-note-head'
      head.setAttribute('data-role', 'looseHead')
      // The whole card is the handle now, so a grip would be a second invitation
      // to the same gesture. What the heading says is only what is true of this
      // card: what state it is in, and what it belongs to.
      // Which conversation the card belongs to is said by the paper it is written
      // on, and in the card's own tooltip - the dot that used to repeat it was a
      // third mark on a heading that already has three.
      var parentTitle = card.link ? titles[card.link] || '' : ''
      if (card.link) {
        node.setAttribute('title', parentTitle
          ? paletteText('boardCardLinked') + parentTitle
          : paletteText('boardCardLinkedUnknown'))
      }
      var unlink = null
      if (card.link) {
        unlink = document.createElement('span')
        Object.assign(unlink.style, BOARD_UI.looseUnlink)
        unlink.setAttribute('role', 'button')
        unlink.setAttribute('data-role', 'cardUnlink')
        unlink.setAttribute('title', paletteText('boardCardUnlink'))
        unlink.setAttribute('aria-label', paletteText('boardCardUnlink'))
        unlink.style.color = ink.dim
        unlink.appendChild(boardIcon('unlink', 13))
        unlink.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          BOARD_STORE.unlinkCard(card.id)
          renderBoard()
        })
      }

      // The done mark, pressed rather than delivered: a thought the reader has
      // finished with says so, and says it quietly — the card stays where it is.
      var doneToggle = document.createElement('span')
      Object.assign(doneToggle.style, BOARD_UI.cardDoneToggle)
      doneToggle.className = 'dshv-done-toggle'
      doneToggle.setAttribute('role', 'button')
      doneToggle.setAttribute('data-role', 'cardDoneToggle')
      doneToggle.setAttribute('aria-pressed', card.done ? 'true' : 'false')
      doneToggle.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
      doneToggle.textContent = card.done ? '\u2713' : ''
      // The box is drawn on paper rather than on the board, so its outline comes
      // from the paper's ink: the board's grey outline vanishes here.
      doneToggle.style.borderColor = ink.edge
      if (card.done) {
        doneToggle.style.background = 'hsl(45 74% 62%)'
        doneToggle.style.borderColor = 'hsl(45 60% 46%)'
        doneToggle.style.color = 'hsl(45 40% 16%)'
      }
      doneToggle.setAttribute('data-done', card.done ? 'true' : 'false')
      doneToggle.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.setCardDone(card.id, !card.done)
        renderBoard()
      })
      var remove = document.createElement('span')
      Object.assign(remove.style, BOARD_UI.looseRemove)
      remove.setAttribute('data-role', 'cardRemove')
      remove.setAttribute('title', paletteText('boardCardRemove'))
      remove.textContent = '×'
      remove.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        removeLooseCard(card.id)
      })
      // Two zones: the state the card is in, then what it belongs to. Deleting
      // and unlinking are secondary, and arrive under the pointer rather than
      // standing in the heading of every card that is not being touched.
      // The first line is the card's title, and it lives here: the row that used
      // to hold nothing but a box now says what the note is about.
      var title = null
      if (opened && BOARD.cardField === 'title') {
        // The name is a field of its own, in the row it belongs to. Typing here is
        // typing the title - the body below is untouched.
        title = document.createElement('input')
        Object.assign(title.style, BOARD_UI.looseTitle, BOARD_UI.looseTitleBox)
        title.setAttribute('type', 'text')
        title.setAttribute('data-role', 'cardTitleInput')
        title.setAttribute('data-no-drag', 'true')
        title.setAttribute('aria-label', paletteText('boardNoteTitleHint'))
        title.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
        title.style.color = ink.text
        title.value = parts.title
        title.addEventListener('input', function () {
          BOARD_STORE.setCardText(card.id, boardJoinText(title.value, parts.body))
        })
        title.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            // The name is done; the thought is next.
            commitBoardCard()
            var all = BOARD_STORE.cards()
            for (var k = 0; k < all.length; k++) {
              if (all[k].id !== card.id) continue
              beginBoardCard(card.id, 'body')
            }
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardCard()
          }
        })
        title.addEventListener('blur', function () {
          if (BOARD.cardEditing === card.id && BOARD.cardField === 'title'
            && BOARD.cardEditor === title) commitBoardCard()
        })
        BOARD.cardEditor = title
      } else {
        title = document.createElement('span')
        Object.assign(title.style, BOARD_UI.looseTitle)
        title.setAttribute('data-role', 'looseTitle')
        title.style.color = ink.text
        title.textContent = parts.title || paletteText('boardNoteUntitled')
        title.style.opacity = parts.title ? '1' : '0.45'
        if (card.link && parentTitle) {
          title.setAttribute('title', paletteText('boardCardLinked') + parentTitle)
        }
        title.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginBoardCard(card.id, 'title')
        })
      }
      head.appendChild(doneToggle)
      // The title is always in this row, whether it is text or a field: the name
      // of the note is the first thing in it, at every moment.
      head.appendChild(title)

      var actions = document.createElement('span')
      actions.className = 'dshv-note-actions'
      actions.setAttribute('data-role', 'cardActions')
      // The card's own height, as one press: a thought too long for one line
      // offers to open up, and offers to fold again once it is open. It holds the
      // same seat whatever it says, so the row never shifts under the pointer.
      var wanted = boardTextRows(card.text, 1, BOARD_EDITOR_MAX_ROWS)
      if (wanted > 1) {
        // `expanded` says the paper is unfolded; the `opened` above says this
        // card is being worked on. One var cannot say both: a var here used to
        // shadow the opened flag, and a press on a folded body stopped opening
        // its field.
        var expanded = box.lines >= wanted
        var fold = document.createElement('span')
        Object.assign(fold.style, BOARD_UI.looseUnlink)
        fold.style.color = ink.dim
        fold.className = 'dshv-fold'
        fold.setAttribute('role', 'button')
        fold.setAttribute('data-role', 'cardFold')
        fold.setAttribute('aria-expanded', expanded ? 'true' : 'false')
        fold.setAttribute('title', paletteText(expanded ? 'boardCardCollapseHint' : 'boardCardExpandHint'))
        fold.setAttribute('aria-label', paletteText(expanded ? 'boardCardCollapseHint' : 'boardCardExpandHint'))
        fold.appendChild(boardIcon(expanded ? 'collapse' : 'expand', 13))
        fold.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          BOARD_STORE.setCardRows(card.id, expanded ? 0 : wanted)
          renderBoard()
        })
        actions.appendChild(fold)
      }
      if (unlink) actions.appendChild(unlink)
      actions.appendChild(remove)
      head.appendChild(actions)
      node.appendChild(head)
      BOARD.looseNodes[card.id] = node

      if (opened && BOARD.cardField === 'body') {
        var editor = document.createElement('textarea')
        Object.assign(editor.style, BOARD_UI.looseEditor)
        editor.setAttribute('data-role', 'cardText')
        editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
        editor.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
        // The field is the card's own ruler: same type, same line box, and the
        // very number of rows the paper was planned for. That is the whole of
        // why a press does not resize the card it pressed.
        editor.style.fontSize = metrics.font + 'px'
        editor.style.lineHeight = metrics.line + 'px'
        editor.setAttribute('rows', String(box.lines))
        editor.style.height = (box.lines * metrics.line) + 'px'
        // A field may hold more than the paper does - that is what it is for -
        // but it stops growing at the most a card ever shows and scrolls inside
        // itself from there.
        editor.style.maxHeight = (BOARD_EDITOR_MAX_ROWS * metrics.line) + 'px'
        editor.setAttribute('placeholder', paletteText('boardCardPlaceholder'))
        editor.value = parts.body
        editor.addEventListener('input', function () {
          BOARD_STORE.setCardText(card.id, boardJoinText(parts.title, editor.value))
          var grown = boardEditorRows(editor.value)
          if (editor.getAttribute('rows') === String(grown)) return
          editor.setAttribute('rows', String(grown))
          editor.style.height = (grown * metrics.line) + 'px'
          // The paper grows with the writing while the field is up, and the
          // paint after it closes lands on the same size it was left at.
          node.style.height = 'auto'
        })
        editor.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardCard()
          } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
            ev.preventDefault()
            commitBoardCard()
          }
        })
        editor.addEventListener('blur', function () {
          if (BOARD.cardEditing === card.id && BOARD.cardEditor === editor) commitBoardCard()
        })
        // A field is the field's: the router leaves the press alone, so text in
        // it can be selected with the pointer.
        editor.setAttribute('data-no-drag', 'true')
        node.appendChild(editor)
        BOARD.cardEditor = editor
      } else if (box.lines > 0) {
        var text = document.createElement('div')
        Object.assign(text.style, BOARD_UI.looseText)
        // The words sit on the card's ruler: the same type and line box the
        // paper was planned with, and exactly the room it was planned to hold.
        text.style.fontSize = metrics.font + 'px'
        text.style.lineHeight = metrics.line + 'px'
        text.style.height = (box.lines * metrics.line) + 'px'
        text.style.color = ink.text
        // The card shows the lines it was given, and fades the rest: resizing is
        // what buys more paper, so the clamp follows the paper rather than the
        // words.
        text.style.WebkitLineClamp = String(Math.max(1, box.lines))
        text.setAttribute('data-role', 'looseText')
        // The body only: the title is the heading's, and repeating it here would
        // spend the card's two lines saying what its first line already said.
        text.textContent = parts.body || paletteText('boardCardPlaceholder')
        if (!parts.body) text.style.opacity = '0.4'
        text.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          beginBoardCard(card.id, 'body')
        })
        node.appendChild(text)
      }
      // The card's own press is the card's, body or no body: a note is opened by
      // pressing it, which is the same gesture that shows all of it.
      node.addEventListener('click', function (ev) {
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        var hit = ev && ev.target
        if (hit && typeof hit.closest === 'function'
          && hit.closest('[data-role="cardRemove"],[data-role="cardDoneToggle"],[data-role="cardUnlink"]')) return
        // The paper opens the thought; a card that has none opens its name.
        beginBoardCard(card.id, parts.body ? 'body' : 'title')
      })
      return node
    }

    /**
     * Join a card's two parts back into the one string the store keeps.
     *
     * A note is written as a title and a body but stored as text, so the first
     * line is the title and everything after it is the body. Joining them here, in
     * one function, is what keeps the two fields from disagreeing about the blank
     * line between them.
     * @param {string} title - the first line.
     * @param {string} body - everything after it.
     * @returns {string} the text.
     */
    function boardJoinText(title, body) {
      var head = String(title === undefined || title === null ? '' : title)
        .replace(/\s+/g, ' ')
        .trim()
      var rest = String(body === undefined || body === null ? '' : body).replace(/^\n+/, '')
      if (!head) return rest
      return rest ? head + '\n' + rest : head
    }

    /**
     * Start typing into one loose card - at its title, or at its body.
     *
     * The title is the heading row, next to the box; the body is the paper under
     * it. They are two fields because they are two things: one line that names
     * the note, and however much the note needs.
     * @param {string} id - the card.
     * @param {string} [field] - 'title' (the default) or 'body'.
     * @returns {void}
     */
    function beginBoardCard(id, field) {
      if (!id) return
      // The press that asked for this may have settled an empty card out from
      // under the seat it aimed at; a field with no paper behind it is not a
      // place to type.
      var all = BOARD_STORE.cards()
      var here = false
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { here = true; break }
      }
      if (!here) return
      var want = field === 'body' ? 'body' : 'title'
      if (BOARD.cardEditing === id && BOARD.cardField === want) return
      // The card being opened is the card being worked on: it comes to the front,
      // and stays there when the paint after this one is drawn.
      raiseBoardCard(id, BOARD.looseNodes[id] || null)
      BOARD.cardEditing = id
      BOARD.cardField = want
      BOARD.cardEditor = null
      renderBoard()
    }

    /**
     * Keep what the open field says, and close it.
     *
     * A note that says nothing is not a note: leaving a blank piece of paper on
     * the canvas is the tidiest way to make a board look unloved, so a card that
     * closes empty is taken away rather than kept.
     * @returns {boolean} whether a field was open.
     */
    /**
     * Settle one open field: keep what it says, and take the paper away if it
     * says nothing.
     *
     * One function because both ways out of a field - confirming it, and asking
     * for another card - have to agree about what an empty note is.
     * @param {string} id - the card.
     * @param {Element} editor - its field.
     * @returns {string} the text that was kept.
     */
    function boardTakeCardText(id, editor) {
      var field = BOARD.cardField === 'body' ? 'body' : 'title'
      var value = editor ? String(editor.value || '') : ''
      var held = null
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) held = all[i]
      }
      var parts = noteParts(held ? held.text : '')
      var text = field === 'title'
        ? boardJoinText(value, parts.body)
        : boardJoinText(parts.title, value)
      BOARD_STORE.setCardText(id, text)
      if (!text.trim()) BOARD_STORE.removeCard(id)
      return text
    }

    function commitBoardCard() {
      if (!BOARD.cardEditing) return false
      var editor = BOARD.cardEditor
      var id = BOARD.cardEditing
      var kept = boardTakeCardText(id, editor)
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      renderBoard()
      return kept !== ''
    }

    /** Throw the open field away, leaving the card as it was last written. */
    function cancelBoardCard() {
      if (!BOARD.cardEditing) return false
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      renderBoard()
      return true
    }

    /**
     * Settle the open card field for a press, without the paint a settle
     * usually carries.
     *
     * A press ends a field the way a click does - the words are kept, and a
     * note that says nothing is taken away - but the press is not the click
     * yet. The click behind it is still on its way, and the paint a settle
     * carries would replace the element that click aims at. So the field is
     * taken off the page (a later paint is allowed again), and the paint is
     * owed to whoever ends the gesture that started here.
     * @returns {void}
     */
    function settleBoardCardForPress() {
      boardTakeCardText(BOARD.cardEditing, BOARD.cardEditor)
      if (BOARD.cardEditor && BOARD.cardEditor.parentNode) {
        BOARD.cardEditor.parentNode.removeChild(BOARD.cardEditor)
      }
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      BOARD.paintOwed = true
    }

    /**
     * Write a new card at a place, and start typing in it.
     * @param {number} x - canvas coordinate.
     * @param {number} y - canvas coordinate.
     * @returns {string} the card's id.
     */
    function addBoardCardAt(x, y) {
      // A card being typed into is finished first. The new card is a thought of
      // its own, and a field that outlived the card it was drawn for would be
      // read as this card's words the moment the board redraws.
      if (BOARD.cardEditing) boardTakeCardText(BOARD.cardEditing, BOARD.cardEditor)
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      var id = BOARD_STORE.addCard(x, y)
      BOARD.cardEditing = id
      // A new note starts at its name: the first thing to write is what this
      // thought is about.
      BOARD.cardField = 'title'
      renderBoard()
      return id
    }

    /**
     * Write a new card where the reader is looking, or below everything when the
     * page is too small (or too fake) to have a middle.
     * @returns {string} the card's id.
     */
    function addBoardCard() {
      var place = nextCardPlace()
      var viewport = BOARD.body
      if (viewport) {
        var width = Number(viewport.clientWidth) || 0
        var height = Number(viewport.clientHeight) || 0
        if (width > BOARD_CARD_W * 2 && height > 240) {
          place = {
            x: (Number(viewport.scrollLeft) || 0) + Math.max(24, (width - BOARD_CARD_W) / 2),
            y: (Number(viewport.scrollTop) || 0) + Math.max(24, (height - boardCardBox('').height) / 2),
          }
        }
      }
      return addBoardCardAt(place.x, place.y)
    }

    /** Take one loose card off the canvas. */
    function removeLooseCard(id) {
      if (BOARD.cardEditing === id) {
        BOARD.cardEditing = ''
        BOARD.cardEditor = null
      }
      // Read it before it goes: an undone delete has to be the same card - its
      // words, its tie, its done mark, where it was filed - not a new one that
      // happens to read the same.
      var held = null
      var at = 0
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id !== id) continue
        held = all[i]
        at = i
      }
      BOARD_STORE.removeCard(id)
      // Record before the paint: the buttons are drawn by the paint, and a step
      // taken after it would leave them one press behind.
      if (!held) {
        renderBoard()
        return
      }
      BOARD_HISTORY.record({
        label: paletteText('boardUndoIdea'),
        undo: function () {
          BOARD_STORE.restoreCard(held, at)
          if (BOARD.open) renderBoard()
        },
        redo: function () {
          BOARD_STORE.removeCard(id)
          if (BOARD.open) renderBoard()
        },
      })
      renderBoard()
    }

    /**
     * Take one conversation off the board.
     *
     * Deleted until it moves again: the mark is held against the moment it last
     * moved, so a conversation used afterwards belongs back on the board.
     * @param {object} summary - session summary.
     * @returns {void}
     */
    function removeBoardCard(summary) {
      var touched = summary.updatedAt
      BOARD_STORE.mute(summary.id, touched)
      // A deleted conversation is a mark held against the moment it last moved,
      // so the way back is simply to lift that mark - and the way forward again
      // is to put it back exactly as it was stamped.
      BOARD_HISTORY.record({
        label: paletteText('boardUndoSession'),
        undo: function () {
          BOARD_STORE.unmute(summary.id)
          if (BOARD.open) renderBoard()
        },
        redo: function () {
          BOARD_STORE.mute(summary.id, touched)
          if (BOARD.open) renderBoard()
        },
      })
      renderBoard()
    }

    /**
     * A press on a block's heading: the handle the panel is dragged by.
     *
     * Nothing moves until the pointer has travelled `BOARD_SLOP`, so a press on
     * the way to the fold toggle still opens and closes the panel.
     * @param {string} key - the block's key.
     * @param {Element} node - the block element.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    /**
     * What the pointer is standing on, as far as the canvas is concerned.
     *
     * There is one press handler on the board, and this is the whole of how it
     * decides what a press means: the nearest element that declares
     * `data-handle` wins, in the order a reader would say it - a card is a card
     * before it is part of a goal - and a field declares `data-no-drag` because
     * a press inside one is the field's (it is how text is selected).
     * @param {Element} target - the element pressed.
     * @returns {{kind: string, el: Element, key: string}|null} what it is, or
     *   null for the paper itself.
     */
    function handleOf(target) {
      if (!target || typeof target.closest !== 'function') return null
      if (target.closest('[data-no-drag]')) return { kind: 'field', el: null, key: '' }
      var card = target.closest('[data-handle="card"]')
      if (card) return { kind: 'card', el: card, key: card.getAttribute('data-session-id') || '' }

      var note = target.closest('[data-handle="note"]')
      if (note) return { kind: 'note', el: note, key: note.getAttribute('data-card-id') || '' }
      // A put-away note is a line of the tray: it is lifted back out onto the
      // paper, so the press belongs to it and not to the panel it stands in.
      var row = target.closest('[data-handle="inboxNote"]')
      if (row) return { kind: 'inboxNote', el: row, key: row.getAttribute('data-card-id') || '' }
      var goal = target.closest('[data-handle="goal"]')
      if (goal) return { kind: 'goal', el: goal, key: goal.getAttribute('data-block') || '' }
      return null
    }

    /**
     * The notes tied to one goal's conversations, so they travel with it.
     *
     * A note is pinned around the work it belongs to, not around the paper, so
     * a goal that moves takes its notes along.
     * @param {string} key - the block id.
     * @returns {Array<object>} the notes, with their places and elements.
     */
    function goalCarry(key) {
      var rows = []
      for (var b = 0; b < BOARD.blocks.length; b++) {
        if (BOARD.blocks[b].key === key) rows = BOARD.blocks[b].rows
      }
      var owned = Object.create(null)
      for (var r = 0; r < rows.length; r++) owned[rows[r].id] = true
      var carry = []
      var cards = BOARD_STORE.cards()
      for (var c = 0; c < cards.length; c++) {
        if (!cards[c].link || !owned[cards[c].link]) continue
        carry.push({
          id: cards[c].id,
          x: cards[c].x,
          y: cards[c].y,
          node: BOARD.looseNodes[cards[c].id] || null,
        })
      }
      return carry
    }

    /**
     * The one press handler on the canvas.
     *
     * Every gesture starts here and nowhere else. What the press *means* is read
     * from the element under it (`handleOf`); what the press *is* is settled by
     * `onBoardMove` on the first movement past `BOARD_SLOP`. The pieces inside -
     * names, notes, buttons, fields - never take a press, so they cannot take one
     * from each other: they answer clicks, and a click that arrived after a real
     * drag is dropped by their own `BOARD.dragged` check.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function boardPointerDown(ev) {
      if (!BOARD.open || !ev || (ev.button !== undefined && ev.button !== 0)) return
      if (BOARD.drag) return
      // Every press starts from "this was not a drag": a flag left over from the
      // gesture before it would swallow the click that follows this one.
      BOARD.dragged = false
      var hit = handleOf(ev.target)
      if (hit && hit.kind === 'field') return
      // A press anywhere but the field being typed into settles that field, the
      // way a press anywhere but a dialog dismisses the dialog. It is also what
      // makes an empty card go away the moment the reader clicks the paper: the
      // card closes empty, and an empty card is not a note.
      //
      // The words are settled here, but the paint is not. The click behind
      // this press is still on its way, and a paint now would replace the
      // element that click aims at: the press that hands the reader from the
      // name to the thought would swallow its own click, and the thought would
      // never open. The field is taken off the page - so a later paint is
      // allowed again - and the paint is owed to whoever ends this gesture.
      // Only a field that is really on the page counts: a stale edit pointer
      // would settle a card the reader is not looking at.
      if (BOARD.cardEditing && boardFieldOpen()) {
        var inField = ev.target && typeof ev.target.closest === 'function'
          ? ev.target.closest('[data-role="cardText"], [data-role="cardTitleInput"]')
          : null
        if (!inField) settleBoardCardForPress()
      }
      var fromX = Number(ev.clientX) || 0
      var fromY = Number(ev.clientY) || 0
      if (!hit) {
        // The paper itself: move the canvas under the eye.
        BOARD.drag = {
          kind: 'pan',
          fromX: fromX,
          fromY: fromY,
          scrollLeft: Number(BOARD.body.scrollLeft) || 0,
          scrollTop: Number(BOARD.body.scrollTop) || 0,
          moved: false,
        }
        boardListen()
        return
      }
      if (!hit.key) return
      if (hit.kind === 'goal') {
        var places = BOARD_STORE.blocks()
        var place = places[hit.key]
        if (!place) return
        BOARD.drag = {
          kind: 'goal',
          key: hit.key,
          node: hit.el,
          carry: goalCarry(hit.key),
          fromX: fromX,
          fromY: fromY,
          baseX: place.x,
          baseY: place.y,
          x: place.x,
          y: place.y,
          moved: false,
        }
        boardListen()
        return
      }

      if (hit.kind === 'note') {
        var cards = BOARD_STORE.cards()
        var found = null
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].id === hit.key) found = cards[i]
        }
        if (!found) return
        raiseBoardCard(hit.key, hit.el)
        BOARD.drag = {
          kind: 'note',
          key: hit.key,
          node: hit.el,
          fromX: fromX,
          fromY: fromY,
          baseX: found.x,
          baseY: found.y,
          x: found.x,
          y: found.y,
          moved: false,
        }
        boardListen()
        return
      }
      if (hit.kind === 'inboxNote') {
        // A line of the tray: a press that moves lifts it back onto the paper.
        BOARD.drag = {
          kind: 'inboxNote',
          key: hit.key,
          node: hit.el,
          fromX: fromX,
          fromY: fromY,
          moved: false,
        }
        boardListen()
        return
      }
      // A conversation card: carried as a copy, and filed into the goal it is
      // let go on.
      raiseBoardCard(hit.key, hit.el)
      BOARD.drag = {
        kind: 'session',
        key: hit.key,
        node: null,
        origin: hit.el,
        carry: [],
        fromX: fromX,
        fromY: fromY,
        baseX: 0,
        baseY: 0,
        x: 0,
        y: 0,
        moved: false,
      }
      boardListen()
    }

    /**
     * Put the drop bands on screen, or take them away.
     *
     * The band's own surface is an inline style, so a stylesheet rule cannot show
     * it: this is the only thing that can, and it is called from the one place
     * that knows a note is in the air.
     * @param {boolean} on - whether a note is being carried.
     * @returns {void}
     */
    /** Whether the note a gesture is carrying has already been finished. */
    function boardNoteDone(id) {
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i].done === true
      }
      return false
    }

    function showDropZones(on, filed) {
      var zones = BOARD.dropZones || []
      var word = paletteText(filed ? 'boardCardFileHint' : 'boardCardEnterHint')
      for (var i = 0; i < zones.length; i++) {
        zones[i].style.display = on ? 'flex' : 'none'
        zones[i].style.pointerEvents = on ? 'auto' : 'none'
        if (zones[i].enterWord && zones[i].enterWord.textContent !== word) {
          zones[i].enterWord.textContent = word
        }
      }
      if (BOARD.body) BOARD.body.setAttribute('data-note-drag', on ? 'true' : 'false')
      BOARD.dropOn = on === true
    }

    /** Start listening for the rest of a gesture, once it has been armed. */
    function boardListen() {
      window.addEventListener('pointermove', onBoardMove, true)
      window.addEventListener('pointerup', onBoardUp, true)
      // A gesture belongs to the window it started in: losing the window -
      // the reader switched apps mid-press - loses the pointer with it, and
      // an up that never comes must not leave the board deaf to the next
      // press.
      window.addEventListener('blur', onBoardBlurDrag)
    }

    /**
     * Give a carried card its body, where the hand is.
     *
     * The copy follows the hand and the card it came from is left dimmed in its
     * place: what the gesture is choosing is which goal to file the conversation
     * under, and both ends of that choice have to stay visible until it is made.
     * @param {object} drag - the armed gesture.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function beginSessionCarrier(drag, x, y) {
      var summary = null
      for (var i = 0; i < BOARD.rows.length; i++) {
        if (BOARD.rows[i].id === drag.key) summary = BOARD.rows[i]
      }
      if (!summary || !BOARD.stage) {
        // Nothing to carry means this paint and the gesture disagree; dropping
        // the gesture is cheaper than moving a card that is not on the page.
        BOARD.drag = null
        return
      }
      var point = canvasPointOf(x, y)
      var at = {
        x: Math.max(0, point.x - BOARD_FLOAT_W / 2),
        y: Math.max(0, point.y - 24),
      }
      var carrier = document.createElement('div')
      Object.assign(carrier.style, BOARD_UI.ghost)
      carrier.className = 'dshv-ghost'
      carrier.setAttribute('data-role', 'dragGhost')
      carrier.setAttribute('data-session-id', drag.key)
      carrier.style.left = at.x + 'px'
      carrier.style.top = at.y + 'px'
      carrier.style.width = BOARD_FLOAT_W + 'px'
      carrier.appendChild(buildBoardCard(summary, '', Object.create(null)))
      BOARD.stage.appendChild(carrier)
      // The copy is not a card of this paint: it must not answer the ties, or a
      // note would be drawn to the hand instead of to the conversation.
      if (BOARD.nodes.length && BOARD.nodes[BOARD.nodes.length - 1].parentNode === carrier) BOARD.nodes.pop()
      if (drag.origin) drag.origin.setAttribute('data-dragging', 'true')
      // The copy becomes the thing the hand holds, and the delta is measured
      // from here: the card must not jump by the distance it has already come.
      drag.node = carrier
      drag.baseX = at.x
      drag.baseY = at.y
      drag.fromX = x
      drag.fromY = y
    }



    /** Follow the pointer: pan the paper, or carry what the hand picked up. */
    function onBoardMove(ev) {
      var drag = BOARD.drag
      if (!drag) return
      var x = Number(ev.clientX) || 0
      var y = Number(ev.clientY) || 0
      if (!drag.moved) {
        if (Math.abs(x - drag.fromX) < BOARD_SLOP && Math.abs(y - drag.fromY) < BOARD_SLOP) return
        drag.moved = true
        // From here the page must not start selecting text under the pointer, and
        // the click that would have followed this press is not a click any more.
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        BOARD.dragged = true
        if (drag.kind === 'session') beginSessionCarrier(drag, x, y)
        else if (drag.kind === 'inboxNote') beginNoteLift(drag, x, y)
        else if (drag.node) drag.node.style.cursor = 'grabbing'
        // A note being carried is the one moment a card offers a place to hand it
        // over: the bands go up here and come down in `endBoardDrag`.
        if (drag.kind === 'note' || drag.kind === 'inboxNote') {
          showDropZones(true, boardNoteDone(drag.key))
        }
        if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = 'grabbing'
      }
      drag.lastX = x
      drag.lastY = y

      if (drag.kind === 'pan') {
        if (!BOARD.body) return
        BOARD.body.scrollLeft = Math.max(0, drag.scrollLeft - (x - drag.fromX))
        BOARD.body.scrollTop = Math.max(0, drag.scrollTop - (y - drag.fromY))
        return
      }
      // A pointer travels screen pixels; the stage is scaled. One pixel of the
      // hand is one over `zoom` pixels of paper.
      var zoom = BOARD.zoom || 1
      var dx = (x - drag.fromX) / zoom
      var dy = (y - drag.fromY) / zoom
      drag.x = Math.max(0, drag.baseX + dx)
      drag.y = Math.max(0, drag.baseY + dy)
      if (!drag.node) return
      // The carried element must not answer the hit test under its own pointer:
      // what the reader is aiming at is what is beneath it.
      drag.node.style.pointerEvents = 'none'
      drag.node.style.left = drag.x + 'px'
      drag.node.style.top = drag.y + 'px'
      drag.node.style.zIndex = '30'
      drag.node.style.transform = 'scale(1.012)'
      // The notes tied to this goal's conversations travel with it: a goal is a
      // place, and the annotations around it belong to that place.
      var carry = drag.carry || []
      for (var c = 0; c < carry.length; c++) {
        var held = carry[c]
        held.nx = Math.max(0, held.x + dx)
        held.ny = Math.max(0, held.y + dy)
        if (held.node) {
          held.node.style.left = held.nx + 'px'
          held.node.style.top = held.ny + 'px'
        }
      }
      if (drag.kind === 'session') markDropGoal(x, y)
      // Live, not after the drop: a tie that only catches up when the hand lets
      // go reads as a rubber band drawn by someone else.
      drawCardLinks()
    }

    /** Let go: write down what the gesture decided, unless it never moved. */
    function onBoardUp() {
      var drag = BOARD.drag
      if (!drag) return
      var moved = drag.moved
      var kind = drag.kind
      var key = drag.key
      var x = drag.x
      var y = drag.y
      // Where it landed, read before the gesture is torn down: the carried
      // element is out of the hit test, so this is what is underneath it. A note
      // can land on two different things, and they mean different things: the way
      // in hands its words to that conversation, while the card around it only
      // ties the note to the work.
      var landedOn = ''
      var byEnter = false
      var newSessionGoal = ''
      if (moved && kind === 'note' && drag.lastX !== undefined
        && typeof document.elementFromPoint === 'function') {
        try {
          var under = document.elementFromPoint(drag.lastX, drag.lastY)
          if (under && typeof under.closest === 'function') {
            var newSession = under.closest('[data-role="goalNewSession"]')
            if (newSession) newSessionGoal = newSession.getAttribute('data-goal-key') || ''
            byEnter = under.closest('[data-role="cardEnter"]') !== null
            var holder = under.closest('[data-session-id]')
            if (holder) landedOn = holder.getAttribute('data-session-id') || ''
          }
        } catch (error) {
          landedOn = ''
          byEnter = false
          newSessionGoal = ''
        }
      }
      var overGoal = moved && drag.lastX !== undefined ? goalUnder(drag.lastX, drag.lastY) : ''
      endBoardDrag()
      // A settle made at a press owes the page a paint, and the end of the
      // gesture is where some of that debt may be paid: a pan's click answers
      // nothing (the paper is the one thing a paint never replaces), and a
      // press on a card the settle took away has no card left for its click
      // to open. Every other press leaves the debt to its own click, which
      // repaints when it opens what it aimed at.
      if (BOARD.paintOwed) {
        if (kind === 'pan') {
          renderBoard()
        } else if (!moved && kind === 'note') {
          var settleCards = BOARD_STORE.cards()
          var stillWritten = false
          for (var sc = 0; sc < settleCards.length; sc++) {
            if (settleCards[sc].id === key) { stillWritten = true; break }
          }
          if (!stillWritten) renderBoard()
        }
      }
      // A press that never moved is a click, and the click is still on its way:
      // the browser dispatches it to the element that was pressed, so repainting
      // here would replace that element and the click would land on nothing.
      if (!moved) return
      BOARD.dragged = true

      if (kind === 'pan') return
      if (kind === 'goal') {
        BOARD_STORE.placeBlock(key, x, y)
        var carried = drag.carry || []
        for (var c = 0; c < carried.length; c++) {
          if (typeof carried[c].nx !== 'number') continue
          BOARD_STORE.moveCard(carried[c].id, carried[c].nx, carried[c].ny)
        }
        renderBoard()
        return
      }
      if (kind === 'session') {
        // A conversation always belongs to a goal. Letting go over one files it
        // there; letting go on the paper gives it a goal of its own, cut from the
        // one it came from - a card standing alone is a goal with one card in it,
        // because a card with no goal is a place the canvas would have to invent.
        var home = boardHomeOf(key)
        var target = overGoal
        if (!target) {
          // Except the last one. A goal that gives up its only conversation to
          // the paper has not moved anything: it has built a second goal of one
          // and emptied the first, which is the same arrangement with one more
          // panel on it. A conversation that wants a place of its own has to be
          // carried into another goal, where the move actually means something.
          if (home && home.rows.length <= 1) {
            showToast(paletteText('boardGoalLastCard'))
            renderBoard()
            return
          }
          var point = canvasPointOf(drag.lastX === undefined ? 0 : drag.lastX,
            drag.lastY === undefined ? 0 : drag.lastY)
          target = BOARD_STORE.addGoal(
            nextGoalName(home ? home.label : ''),
            Math.max(0, point.x - BOARD_FLOAT_W / 2),
            Math.max(0, point.y - 32)
          )
        }
        if (target && (!home || target !== home.key)) {
          BOARD_STORE.placeSession(key, target)
          showToast(paletteText('boardMoved'))
        }
        renderBoard()
        return
      }
      if (kind !== 'note') return
      // The plus's second gesture: a card let go on it starts the conversation
      // the card describes, with no sheet in between. The card is read before
      // the gesture is gone, because the board may be unmounted by the open.
      if (newSessionGoal) {
        var picked = null
        var written = BOARD_STORE.cards()
        for (var np = 0; np < written.length; np++) {
          if (written[np].id === key) picked = written[np]
        }
        var words = picked ? String(picked.text || '').trim() : ''
        if (!words) {
          renderBoard()
          return
        }
        var cardName = noteParts(words).title.trim()
        if (!cardName) cardName = words.slice(0, BOARD_GOAL_NAME_MAX)
        if (!startNewSessionForGoal(newSessionGoal, cardName, words, key) && BOARD.open) renderBoard()
        return
      }
      // Let go over the tray itself (not over a card in it): the note is put
      // away there, and drawn as a line of the tray from the next paint on.
      if (!landedOn && overGoal === BOARD_INBOX) {
        BOARD_STORE.fileCard(key, BOARD_INBOX)
        // A tray that is folded would swallow the card without a trace: the one
        // thing the reader must see is where it went.
        if (BOARD_STORE.isFolded(BOARD_INBOX)) BOARD_STORE.toggleBlockFold(BOARD_INBOX)
        renderBoard()
        showToast(paletteText('boardFiled'))
        return
      }
      if (landedOn) {
        var cards = BOARD_STORE.cards()
        var held = null
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].id === key) held = cards[i]
        }
        var text = held ? String(held.text || '').trim() : ''
        // A note that is already finished is not handed over again: the band it
        // was let go on says "file this card", and filing it is what happens - it
        // joins that conversation's own list of finished thoughts.
        if (byEnter && held && held.done) {
          BOARD_STORE.linkCard(key, landedOn)
          BOARD_STORE.fileCard(key, BOARD_DONE)
          BOARD.rowOpen = ''
          renderBoard()
          showToast(paletteText('boardDoneFiledOne'))
          return
        }
        if (byEnter) {
          // The button is the deliberate target: it means "take this into that
          // conversation", and it is specific enough not to need a question.
          // The place is measured before the conversation opens, because that
          // unmounts the board and there is nothing left to measure afterwards.
          var beside = snappedCardPlace(landedOn, key)
          if (beside) BOARD_STORE.moveCard(key, beside.x, beside.y)
          if (text) {
            BOARD_STORE.linkCard(key, landedOn)
            handCardToSession(key, landedOn, text)
          } else {
            activateSession(landedOn)
          }
          return
        }
        // Anywhere else on the card is the gentler claim: the note belongs
        // beside this work, so it is tied to it and glided next to it - nothing
        // opens, and nothing is sent.
        BOARD_STORE.moveCard(key, x, y)
        BOARD_STORE.linkCard(key, landedOn)
        renderBoard()
        var rail = snappedCardPlace(landedOn, key)
        var glider = BOARD.looseNodes[key]
        if (rail && glider && (rail.x !== x || rail.y !== y)) {
          glideBoardCard(key, glider, x, y, rail.x, rail.y)
        }
        return
      }
      BOARD_STORE.moveCard(key, x, y)
      renderBoard()
    }

    /**
     * Hand one loose card's words to a conversation, and leave a trace behind.
     *
     * The paste opens the conversation and fills its box; the card is not
     * removed but marked done and tied to it, so coming back to the board shows
     * what was said and where it went. A card that found no box stays a plain
     * card and says so. Once the words have landed, the conversation takes the
     * card's title as its own name - see `nameSessionForCard`.
     * @param {string} cardId - the card.
     * @param {string} sessionId - the conversation it was dropped on.
     * @param {string} text - what the card says.
     * @returns {void}
     */
    function handCardToSession(cardId, sessionId, text) {
      dropCardIntoComposer(text, sessionId, function () {
        BOARD_STORE.finishCard(cardId, sessionId)
        nameSessionForCard(sessionId, text)
        if (BOARD.open) renderBoard()
      }, function () {
        if (BOARD.open) renderBoard()
        showToast(paletteText('boardDropFailed'))
      })
    }

    /**
     * Let the conversation a card was handed to wear the card's own name.
     *
     * The title is the first line of what the card says - the line its heading
     * shows, and the line the reader wrote for exactly this moment. The rename
     * takes the private-source hop every other rename here takes, so a name
     * handed over does not mark the conversation read. The words are already in
     * the composer by the time this runs: a hand-over that found no box names
     * nothing, because nothing was handed over. A refusal is said out loud
     * rather than swallowed, and the success says the name too, because the
     * board the gesture left behind is not on the screen to say it.
     * @param {string} sessionId - the conversation the card was handed to.
     * @param {string} text - what the card says, trimmed.
     * @returns {void}
     */
    function nameSessionForCard(sessionId, text) {
      var title = String(noteParts(text).title || '').trim()
      if (!title) return
      renameSession(sessionId, title, function (reason) {
        if (reason) {
          showToast(reason)
          return
        }
        showToast(paletteText('boardNamedFromCard') + title)
      })
    }

    /**
     * Glide one card from where it was let go to the place it snapped to.
     *
     * A jump would read as the note being taken away and a different note
     * appearing; a short ease reads as the canvas accepting it. The tie is
     * redrawn each frame, so it stays attached on the way.
     * @param {string} id - the card.
     * @param {Element} node - its element.
     * @param {number} fromX - where the hand left it.
     * @param {number} fromY - where the hand left it.
     * @param {number} toX - where it belongs.
     * @param {number} toY - where it belongs.
     * @returns {void}
     */
    function glideBoardCard(id, node, fromX, fromY, toX, toY) {
      if (!node || typeof window.requestAnimationFrame !== 'function') {
        BOARD_STORE.moveCard(id, toX, toY)
        renderBoard()
        return
      }
      BOARD.glide = id
      var start = 0
      function step(now) {
        if (!BOARD.open || !node.parentNode) {
          BOARD.glide = ''
          return
        }
        if (!start) start = now
        var k = Math.min(1, (now - start) / 240)
        var e = 1 - Math.pow(1 - k, 3)
        node.style.left = (fromX + (toX - fromX) * e) + 'px'
        node.style.top = (fromY + (toY - fromY) * e) + 'px'
        drawCardLinks()
        if (k < 1) {
          window.requestAnimationFrame(step)
          return
        }
        BOARD.glide = ''
        BOARD_STORE.moveCard(id, toX, toY)
        renderBoard()
      }
      window.requestAnimationFrame(step)
    }

    /**
     * Where a linked card belongs: just outside the panel holding its
     * conversation, level with that conversation's card.
     *
     * Cards already linked to the same conversation stack below the first, so
     * a conversation can collect a few thoughts without them hiding each other.
     * @param {string} sessionId - the conversation.
     * @param {string} cardId - the card being placed.
     * @returns {{x: number, y: number}|null} the place, or null without layout.
     */
    function snappedCardPlace(sessionId, cardId) {
      if (!BOARD.stage || typeof BOARD.stage.getBoundingClientRect !== 'function') return null
      var target = null
      for (var i = 0; i < BOARD.nodes.length; i++) {
        if (BOARD.nodes[i].getAttribute('data-session-id') === sessionId) target = BOARD.nodes[i]
      }
      if (!target) return null
      var zoom = BOARD.zoom || 1
      var stageRect = BOARD.stage.getBoundingClientRect()
      var rect = target.getBoundingClientRect()
      var panel = typeof target.closest === 'function'
        ? target.closest('[data-role="workspaceBlock"]')
        : null
      var panelRect = panel ? panel.getBoundingClientRect() : null
      var aside = panelRect && (panelRect.width || panelRect.height) ? panelRect : rect
      if (!aside || (!aside.width && !aside.height)) return null
      var bottom = 0
      var cards = BOARD_STORE.cards()
      for (var k = 0; k < cards.length; k++) {
        if (cards[k].id === cardId || cards[k].link !== sessionId) continue
        var node = BOARD.looseNodes[cards[k].id]
        if (!node) continue
        var nodeRect = node.getBoundingClientRect()
        if (nodeRect && (nodeRect.width || nodeRect.height)) bottom = Math.max(bottom, nodeRect.bottom)
      }
      return {
        x: Math.max(0, (aside.right - stageRect.left) / zoom + BOARD_TIDY_GAP),
        y: Math.max(0, ((bottom ? bottom + 12 : rect.top) - stageRect.top) / zoom),
      }
    }

    /**
     * Draw the line from every linked card to the conversation it belongs to.
     *
     * Measured after the paint rather than computed from the model: a
     * conversation card's place is the block's layout and its
     * nesting, none of which this plugin owns. A line is a thin rotated
     * element — no canvas, no SVG — so the same code draws in both mounts, and
     * a delivered card's line is dashed to match its dimmed paper.
     * @returns {void}
     */
    function drawCardLinks() {
      if (!BOARD.stage || typeof BOARD.stage.getBoundingClientRect !== 'function') return
      var svg = BOARD.linkLayer
      if (svg) {
        while (svg.firstChild) svg.removeChild(svg.firstChild)
      } else {
        // A host without createElementNS still gets a straight tie: the board
        // must work before it is beautiful.
        for (var old = 0; old < BOARD.lines.length; old++) {
          var previous = BOARD.lines[old]
          if (previous && previous.parentNode) previous.parentNode.removeChild(previous)
        }
        BOARD.lines = []
      }
      var cards = BOARD_STORE.cards()
      if (!cards.length) return
      var zoom = BOARD.zoom || 1
      var stageRect = BOARD.stage.getBoundingClientRect()
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i]
        if (!card.link) continue
        var cardNode = BOARD.looseNodes[card.id]
        var target = null
        for (var n = 0; n < BOARD.nodes.length; n++) {
          if (BOARD.nodes[n].getAttribute('data-session-id') === card.link) target = BOARD.nodes[n]
        }
        if (!cardNode || !target) continue
        var a = cardNode.getBoundingClientRect()
        var b = target.getBoundingClientRect()
        if (!a || !b || (!a.width && !a.height) || (!b.width && !b.height)) continue
        // The tie leaves the note on the side it stands and meets the panel that
        // holds the conversation on the panel's own edge. The last stretch
        // inside the panel would be hidden behind it, so the whole visible line
        // lives in the margin; it is level with the conversation, which is what
        // says which one it belongs to.
        var leftSide = a.left < b.left
        var panel = typeof target.closest === 'function'
          ? target.closest('[data-role="workspaceBlock"]')
          : null
        var edge = panel && panel !== target ? panel.getBoundingClientRect() : b
        var x1 = ((leftSide ? a.right : a.left) - stageRect.left) / zoom
        var y1 = (a.top + a.height / 2 - stageRect.top) / zoom
        var x2 = ((leftSide ? edge.left : edge.right) - stageRect.left) / zoom
        var y2 = (b.top + b.height / 2 - stageRect.top) / zoom
        if (svg && typeof document.createElementNS === 'function') {
          // A cubic, not a ruler: a taut curve answers the note as it moves and
          // still reads as one object when it rests.
          var mid = (x1 + x2) / 2
          var path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', 'M' + x1 + ' ' + y1 + 'C' + mid + ' ' + y1 + ',' + mid + ' ' + y2 + ',' + x2 + ' ' + y2)
          path.setAttribute('fill', 'none')
          path.style.stroke = 'var(--dshv-board-fork, rgba(79, 124, 255, 0.45))'
          path.setAttribute('stroke-width', '1.6')
          path.setAttribute('stroke-linecap', 'round')
          path.setAttribute('opacity', card.done ? '0.42' : '0.6')
          if (card.done) path.setAttribute('stroke-dasharray', '3 5')
          path.setAttribute('data-role', 'cardLink')
          path.setAttribute('data-card-id', card.id)
          path.setAttribute('data-session-id', card.link)
          svg.appendChild(path)
          for (var d = 0; d < 2; d++) {
            var bead = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            bead.setAttribute('cx', String(d ? x2 : x1))
            bead.setAttribute('cy', String(d ? y2 : y1))
            bead.setAttribute('r', '2.4')
            bead.style.fill = 'var(--dshv-board-fork, rgba(79, 124, 255, 0.45))'
            bead.setAttribute('opacity', card.done ? '0.5' : '0.75')
            bead.setAttribute('data-role', 'cardLinkDot')
            svg.appendChild(bead)
          }
          continue
        }
        var length = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))
        var line = document.createElement('div')
        Object.assign(line.style, BOARD_UI.link)
        line.style.left = x1 + 'px'
        line.style.top = y1 + 'px'
        line.style.width = length + 'px'
        line.style.transform = 'rotate(' + Math.atan2(y2 - y1, x2 - x1) + 'rad)'
        if (card.done) {
          line.style.background = 'none'
          line.style.backgroundImage =
            'repeating-linear-gradient(90deg, ' + BOARD_INK.fork + ' 0 6px, transparent 6px 11px)'
          line.style.opacity = '0.65'
        }
        line.setAttribute('data-role', 'cardLink')
        line.setAttribute('data-card-id', card.id)
        line.setAttribute('data-session-id', card.link)
        BOARD.stage.appendChild(line)
        BOARD.lines.push(line)
        for (var d2 = 0; d2 < 2; d2++) {
          var beadDiv = document.createElement('div')
          Object.assign(beadDiv.style, BOARD_UI.linkDot)
          beadDiv.style.left = (d2 ? x2 : x1) + 'px'
          beadDiv.style.top = (d2 ? y2 : y1) + 'px'
          if (card.done) beadDiv.style.opacity = '0.6'
          beadDiv.setAttribute('data-role', 'cardLinkDot')
          BOARD.stage.appendChild(beadDiv)
          BOARD.lines.push(beadDiv)
        }
      }
    }

    /** Drop the gesture and put back what it was carrying. */
    function cancelBoardDrag() {
      if (!BOARD.drag) return false
      var moved = BOARD.drag.moved
      endBoardDrag()
      BOARD.dragged = false
      if (moved) renderBoard()
      return true
    }

    /** Take the gesture's furniture off the page and forget it. */
    function endBoardDrag() {
      var drag = BOARD.drag
      if (!drag) return
      window.removeEventListener('pointermove', onBoardMove, true)
      window.removeEventListener('pointerup', onBoardUp, true)
      window.removeEventListener('blur', onBoardBlurDrag)
      if (drag.node) {
        // The stacking number is not the gesture's: a card that was pressed is
        // the front card, and that is what the next paint reads. Only the lift is
        // undone here.
        drag.node.style.cursor = ''
        drag.node.style.pointerEvents = ''
        drag.node.style.transform = ''
      }
      if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = ''
      if (BOARD.dropOn) showDropZones(false)
      // The carrier was a copy of the card, made for the gesture: it leaves with
      // the gesture. The card it copied is redrawn by the repaint that follows.
      if (drag.kind === 'session' && drag.node && drag.node.parentNode) {
        drag.node.parentNode.removeChild(drag.node)
      }
      if (BOARD.dropGoal) {
        BOARD.dropGoal.setAttribute('data-drop', 'false')
        BOARD.dropGoal = null
      }
      dropNoDropTip()
      BOARD.drag = null
    }

    /**
     * The window losing focus mid-gesture: the pointer left with it.
     *
     * The up that would have ended the gesture is never coming, so the
     * gesture ends here instead - the board answers the next press, and the
     * paint a press-time settle owed is paid now that no click can be on its
     * way.
     * @returns {void}
     */
    function onBoardBlurDrag() {
      if (!BOARD.drag) return
      endBoardDrag()
      if (BOARD.paintOwed && BOARD.open) renderBoard()
    }

    /**
     * A double click on the paper: write a card right there.
     *
     * This is the canvas gesture a canvas is for — pointing at an empty place is
     * how one says "put it here". A double click that arrived after a pan is
     * not one: the press moved the paper, it did not aim at a place.
     * @param {MouseEvent} ev - the double click.
     * @returns {void}
     */
    function onBoardDoubleClick(ev) {
      if (!BOARD.open || !BOARD.stage) return
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      var target = ev && ev.target
      if (target && target !== BOARD.stage && target !== BOARD.body) return
      var rect = typeof BOARD.stage.getBoundingClientRect === 'function'
        ? BOARD.stage.getBoundingClientRect()
        : null
      var zoom = BOARD.zoom || 1
      var x = rect ? ((Number(ev.clientX) || 0) - rect.left) / zoom : BOARD_CANVAS_EDGE
      var y = rect ? ((Number(ev.clientY) || 0) - rect.top) / zoom : BOARD_CANVAS_EDGE
      addBoardCardAt(Math.max(0, x), Math.max(0, y))
    }

    // ---------------------------------------------------------------------
    // reasoning level
    // ---------------------------------------------------------------------

    /**
     * The transient line the plugin speaks in. One element, reused, never a
     * dialog: the reasoning level is the only thing this plugin changes that
     * leaves no trace on the page, so a press has to be readable back — but it
     * is a setting, not a question, so it must not take the keyboard or a click.
     */
    /**
     * The transient line the plugin speaks in. One element, reused, never a
     * dialog: the reasoning level is the only thing this plugin changes that
     * leaves no trace on the page, so a press has to be readable back — but it
     * is a setting, not a question, so it must not take the keyboard or a click.
     * @type {object} the notice.
     */
    var TOAST = makeNotice()

    /**
     * The transient line the plugin speaks in.
     *
     * One element, reused, never a dialog: the reasoning level is the only thing
     * this plugin changes that leaves no trace on the page, so a press has to be
     * readable back — but it is a setting, not a question, so it must not take
     * the keyboard or a click. The shell's own dock row says the other thing
     * that has to be readable, the send key, and does it as a slot.
     * @returns {object} the notice.
     */
    function makeNotice() {
      /** The pill, the fixed host it sits in, its pending timer, its last placement. */
      var el = null
      var host = null
      var timer = 0
      var offset = ''

      /** Take the notice off the page and drop the pending timer. */
      function hideNow() {
        if (timer) {
          window.clearTimeout(timer)
          timer = 0
        }
        if (el && el.parentNode) el.parentNode.removeChild(el)
        if (host && host.parentNode) host.parentNode.removeChild(host)
        el = null
      }

      return {
        /** Say one thing for a moment, replacing whatever was there. */
        say(text, ttl, after) {
          this.show({ text: text, ttl: ttl, after: after })
        },

        /**
         * Say one thing that can be taken back while it is still on screen.
         *
         * This is the one notice that is a click, and it has to be: undoing is
         * a decision the reader can make only in the seconds it is offered, and
         * a line that says what happened without offering the way back is a
         * report rather than a choice.
         * @param {string} text - what happened.
         * @param {string} label - the word on the way back.
         * @param {number} ttl - how long the offer stands.
         * @param {Function} undo - what that word does.
         * @returns {void}
         */
        sayAction(text, label, ttl, undo) {
          this.show({ text: text, action: label, ttl: ttl, undo: undo })
        },

        /** Put one line on screen, plain or with the way back on its right. */
        show(options) {
          if (!document.body) return
          if (!host) {
            host = document.createElement('div')
            Object.assign(host.style, TOAST_HOST_UI)
          }
          if (!el) {
            el = document.createElement('div')
            Object.assign(el.style, TOAST_UI)
            el.setAttribute('role', 'status')
          }
          el.textContent = ''
          // A plain line is never a click target; the one carrying a way back
          // has to be, or the offer is a word nobody can press.
          el.style.pointerEvents = options.action ? 'auto' : 'none'
          el.style.cursor = options.action ? 'pointer' : ''
          // The pill is reused, so the way back is taken off before it is put
          // on again: an offer that stacks two undos on one click would undo
          // twice.
          if (el.__undoClick) {
            el.removeEventListener('click', el.__undoClick)
            el.__undoClick = null
          }
          var line = document.createElement('span')
          line.textContent = String(options.text === undefined || options.text === null ? '' : options.text)
          el.appendChild(line)
          if (options.action) {
            var action = document.createElement('span')
            action.style.marginLeft = '10px'
            action.style.fontWeight = '600'
            action.style.textDecoration = 'underline'
            action.textContent = String(options.action)
            el.appendChild(action)
            var back = options.undo
            el.__undoClick = function () {
              hideNow()
              if (typeof back === 'function') back()
            }
            el.addEventListener('click', el.__undoClick)
          }
          if (!host.parentNode) document.body.appendChild(host)
          if (!el.parentNode) host.appendChild(el)
          this.place()
          if (timer) window.clearTimeout(timer)
          timer = window.setTimeout(function () {
            timer = 0
            if (typeof options.after === 'function') options.after()
            else hideNow()
          }, Number(options.ttl) || TOAST_MS)
        },
        /**
         * Float just above the message box, or fall back to the top edge.
         *
         * The box is the one landmark that does not move, so a notice pinned to
         * the top of the screen is a notice nobody's eye is near. Measured per
         * notice rather than cached, because the box moves when the composer
         * grows or a panel opens around it.
         */
        place() {
          if (!host || !el) return
          var box = composerRoot()
          var measure = box && typeof box.getBoundingClientRect === 'function' ? box.getBoundingClientRect() : null
          var next
          if (measure && measure.top > 0) {
            next = 'calc(100vh - ' + Math.round(measure.top) + 'px + ' + TOAST_GAP + ')'
          } else {
            // No box to sit above — or one off the top of the screen, where the
            // notice would be pushed out of the window.
            next = 'calc(100vh - ' + TOAST_EDGE + ')'
          }
          if (offset !== next) {
            offset = next
            host.style.bottom = next
          }
        },
        /**
         * Take it down and drop the pending timer.
         *
         * The node goes with the host: the host is kept for the next notice, and
         * a node left inside it would be a second line stacked under the next
         * one.
         */
        hide() {
          hideNow()
        },
      }
    }

    /** A fixed host, so the notice can be placed against the message box. */
    var TOAST_HOST_UI = {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      display: 'flex',
      justifyContent: 'center',
      // The host is a container, not a surface: a click must reach whatever is
      // under it — the message box included, which it overlaps by design.
      pointerEvents: 'none',
      // Above the task window (2147483000), so the level stays readable when the
      // window is open — the key works there too.
      zIndex: '2147483001',
    }

    /** The pill that carries the line. */
    var TOAST_UI = {
      maxWidth: '70vw',
      padding: '7px 14px',
      borderRadius: '999px',
      background: 'rgba(26, 26, 30, 0.96)',
      color: '#f2f2f4',
      border: '1px solid rgba(255, 255, 255, 0.16)',
      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)',
      fontSize: '13px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      // Still never a click target of its own.
      pointerEvents: 'none',
    }

    /** How long a notice stays on screen. */
    var TOAST_MS = 1600

    /**
     * How long a closed goal can be brought back.
     *
     * Long enough to notice the panel is gone and reach for it, short enough
     * that the offer is not still standing over the next thing the reader does.
     */
    var BOARD_UNDO_MS = 5000

    /**
     * How long the board repeats a name the shell has not caught up with.
     *
     * A rename is a write to the host and a read of the list, and the two do not
     * land in the same frame. Long enough to cover a slow feed, short enough that
     * a name the shell never accepted falls back to the one it did.
     */
    var BOARD_TITLE_SETTLE_MS = 4000

    /** How far above the message box the notice floats. */
    var TOAST_GAP = '10px'

    /** How much room the notice keeps from the top of the window when it cannot float. */
    var TOAST_EDGE = '12px'

    /**
     * The hint line, inside the shell's dock row.
     *
     * The row is already a centred flex strip, so this sets almost nothing: no
     * placement, no surface, no shadow. What it does set is the tone — the
     * shell's own muted text colour, so the line reads the same in light and
     * dark and steps behind the controls it sits beside — and the two things
     * that keep it harmless: it never takes a pointer, and it never takes a
     * selection. A hint that could be copied out of the page would be a
     * different kind of bug.
     */
    var SEND_HINT_UI = {
      color: 'var(--dsw-alias-label-secondary, rgba(120, 120, 128, 0.9))',
      fontSize: '12px',
      fontWeight: '400',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
      userSelect: 'none',
    }

    /**
     * Say one thing for a moment. A second press replaces the line and restarts
     * the clock rather than stacking notices, so holding the key reads as one
     * counter rather than a pile of cards.
     * @param {string} text - the line to show.
     * @returns {void}
     */
    function showToast(text) {
      TOAST.say(text, TOAST_MS, hideToast)
    }

    /** Take the notice down and drop the pending timer. */
    function hideToast() {
      TOAST.hide()
    }

    /**
     * The line that names the send key, contributed to the shell's own dock row
     * under the message box — the strip that already carries the context meter,
     * laid out and centred by the host. Being a shell slot rather than a node
     * this plugin paints is the whole point: the row places it, the row grows
     * with the draft, and neither is something this plugin has to track.
     */
    /** Whether this process has already contributed the hint to the dock. */
    var hintRegistered = false

    function SendHintLine() {
      var stateRef = React.useState(copy)
      var snapshot = stateRef[0]
      React.useEffect(function () {
        return subscribe(function () {
          stateRef[1](copy())
        })
      }, [])
      // Nothing to say while Enter sends: the hint names a key the user does not
      // have to think about, so a line in that mode would be noise. Rendering
      // nothing at all leaves the row as it was.
      if (snapshot.sendMode === 'host') return null
      var head = paletteText('hintSendNewline')
      if (snapshot.sendMode === 'silent') head = paletteText('hintSendSilent')
      else if (snapshot.sendMode === 'double') head = paletteText('hintSendDouble')
      return React.createElement(
        'div',
        {
          style: SEND_HINT_UI,
          role: 'status',
          title: paletteText('hintSend'),
        },
        head + sendKeyLabel() + '+Enter ' + paletteText('hintSendSends')
      )
    }

    /**
     * The modifier this machine's send accelerator lives on, named the way the
     * user would say it out loud. Ctrl/Cmd+Enter is the accelerator in every
     * build, but a line reading "Ctrl" on a Mac is a line nobody trusts.
     * @returns {string} 'Ctrl' or 'Cmd'.
     */
    function sendKeyLabel() {
      var platform = ''
      try {
        platform = (typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || ''
      } catch (error) {
        platform = ''
      }
      return /Mac|iPod|iPhone|iPad/i.test(platform) ? 'Cmd' : 'Ctrl'
    }

    /**
     * The host's session model-selection service, when it publishes one.
     *
     * Lazy and never injected, like the task window's own services: a host
     * without the model picker must lose this key only, never the scrolling.
     * A miss is not cached, because the service can be mounted after this
     * plugin activates.
     * @returns {object|null} `ctx.modelDirectories`, or null.
     */
    function modelDirectories() {
      if (!modelDirectories.cache) {
        modelDirectories.cache = serviceOf(taskCtx, 'modelDirectories')
      }
      return modelDirectories.cache || null
    }

    /**
     * The reasoning levels one model offers, in the order the composer's own
     * Effort row lists them: the provider default first, but only when the model
     * declares no default of its own, then every level the adapter published.
     * Copying that order is what keeps this key and that menu from disagreeing
     * about what "the next level" is.
     * @param {object|undefined} reasoning - catalog metadata for the selection.
     * @returns {Array<{id: (string|undefined), name: string}>} levels.
     */
    function effortLevels(reasoning) {
      var levels = []
      if (!reasoning) return levels
      if (reasoning.defaultEffort === undefined) {
        levels.push({ id: undefined, name: paletteText('effortProviderDefault') })
      }
      var efforts = reasoning.efforts || []
      for (var i = 0; i < efforts.length; i++) {
        var level = efforts[i]
        if (!level || level.id === undefined) continue
        levels.push({ id: level.id, name: String(level.name === undefined ? level.id : level.name) })
      }
      return levels
    }

    /**
     * Where one level sits in the list. An explicit selection wins; without one
     * the model's own default is what is in effect, exactly as the composer
     * reads it. A level the adapter no longer publishes answers -1, and the step
     * then starts over at the first one.
     * @param {Array} levels - the levels on offer.
     * @param {string|undefined} id - the level in effect.
     * @returns {number} index, or -1.
     */
    function levelIndex(levels, id) {
      for (var i = 0; i < levels.length; i++) {
        if (levels[i].id === id) return i
      }
      return -1
    }

    /**
     * The level in effect for one selection, read the way the composer's own
     * Effort row reads it: an explicit selection wins, and without one the
     * model's own declared default is what applies. `undefined` means the
     * provider default — the level that is in effect by not naming one.
     *
     * This answers "which notch is lit", which is what the reasoning key steps
     * from. It is deliberately not what the picker submits: a model default that
     * was never chosen must not be sent back as an explicit choice, see
     * `rowSubmitLevel`.
     * @param {object} directory - the session's shared model directory.
     * @param {object} selection - the selection in effect.
     * @returns {string|undefined} the level id, or undefined for the default.
     */
    function currentLevelId(directory, selection) {
      if (!selection) return undefined
      if (selection.reasoningEffort !== undefined) return selection.reasoningEffort
      var reasoning =
        directory && directory.catalog && typeof directory.catalog.reasoningFor === 'function'
          ? directory.catalog.reasoningFor(selection)
          : undefined
      return reasoning ? reasoning.defaultEffort : undefined
    }

    /** Whether one entry is the model the conversation is already on. */
    function isCurrentEntry(entry, here) {
      return !!here && !!entry && here.provider === entry.provider && here.model === entry.model
    }

    /**
     * The level one picker row shows as marked, which is the level it would end
     * up on.
     *
     * The row of the model in effect shows the level in effect, whatever put it
     * there. Any other row shows the carried-over level when it publishes it,
     * and otherwise its own default — the level the host would actually land on.
     * This is the display half; `rowSubmitLevel` is the instruction half, and
     * the two differ in exactly one case: a model default that nobody chose is
     * shown as the landing place but is not submitted as a choice.
     * @param {object} entry - a picker entry, with `levels` and `defaultLevel`.
     * @param {object} here - the selection in effect: `{provider, model, level, chosen}`.
     * @returns {string|undefined} the level id, undefined for the provider default.
     */
    function rowMarkedLevel(entry, here) {
      if (!entry) return undefined
      if (isCurrentEntry(entry, here)) return here.level
      if (here && here.chosen !== undefined && levelIndex(entry.levels, here.chosen) >= 0) return here.chosen
      return entry.defaultLevel
    }

    /**
     * The level one picker row would submit if it were confirmed without the
     * level key being touched.
     *
     * Only a level the user is actually on travels: a model whose default is in
     * effect has nothing explicit to carry, so switching away submits no level
     * at all and lets the host apply the target's own default. That is what
     * makes opening the window and confirming it a no-op rather than a silent
     * rewrite of a choice the user never made.
     * @param {object} entry - a picker entry, with `levels`.
     * @param {object} here - the selection in effect: `{provider, model, level, chosen}`.
     * @returns {string|undefined} the level id to submit, undefined for none.
     */
    function rowSubmitLevel(entry, here) {
      if (!entry || !here || here.chosen === undefined) return undefined
      if (isCurrentEntry(entry, here)) return here.chosen
      return levelIndex(entry.levels, here.chosen) >= 0 ? here.chosen : undefined
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

    /**
     * One press of the reasoning key: step the visible conversation's level one
     * notch and leave its model exactly where it is.
     *
     * The level belongs to the session, not to this plugin. The shell keeps one
     * model directory per session, shared by the composer's own Effort row, so
     * reading and writing it here is the same change that row makes — and the
     * `pending` selection answers a press that lands while the previous one is
     * still in flight, so holding the key walks the levels instead of re-sending
     * one target. A press has to be answered either way, so every way out says
     * something.
     * @returns {void}
     */
    function cycleEffort() {
      if (!taskServices()) {
        showToast(paletteText('effortUnsupported'))
        return
      }
      var row = currentSession()
      if (!row) {
        showToast(paletteText('noSession'))
        return
      }
      var directories = modelDirectories()
      if (!directories || typeof directories.directoryFor !== 'function') {
        showToast(paletteText('effortUnsupported'))
        return
      }
      var directory = null
      try {
        directory = directories.directoryFor(row.id)
      } catch (error) {
        showToast(paletteText('effortFailed') + ': ' + failureText(error))
        return
      }
      if (!directory || !directory.store || typeof directory.store.getSnapshot !== 'function') {
        showToast(paletteText('effortUnsupported'))
        return
      }
      stepEffort(directory)
    }

    /**
     * Read the levels off one session directory and submit the next one.
     * @param {object} directory - the session's shared model directory.
     * @returns {void}
     */
    function stepEffort(directory) {
      Promise.resolve()
        .then(function () {
          // Cheap when the catalog is already loaded, and it is what fills the
          // per-model reasoning metadata when it is not.
          return typeof directory.load === 'function' ? directory.load() : null
        })
        .then(function () {
          var snapshot = directory.store.getSnapshot() || {}
          var selection = snapshot.pending || snapshot.current
          if (!selection) throw refusal(paletteText('effortNoModel'))
          var reasoning =
            directory.catalog && typeof directory.catalog.reasoningFor === 'function'
              ? directory.catalog.reasoningFor(selection)
              : undefined
          var levels = effortLevels(reasoning)
          if (!levels.length) throw refusal(paletteText('effortNone'))
          var at = levelIndex(levels, currentLevelId(directory, selection))
          var to = (at + 1) % levels.length
          var next = levels[to]
          return Promise.resolve(
            directory.select({
              provider: selection.provider,
              model: selection.model,
              reasoningEffort: next.id,
            })
          ).then(function (result) {
            if (result && result.ok === false) throw new Error(failureText(result))
            showToast(paletteText('effort') + ' ' + next.name + '  ' + (to + 1) + '/' + levels.length)
          })
        })
        .catch(function (error) {
          showToast(
            error && error.explainsItself
              ? String(error.message)
              : paletteText('effortFailed') + ': ' + failureText(error)
          )
        })
    }

    /**
     * Every provider/model the host currently advertises, for the settings page.
     *
     * The resolver owns one catalog per host generation and publishes it without
     * a session, so the whole list is read off it and the settings page needs no
     * conversation to be open. A host that keeps the catalog only behind a
     * session's directory still answers through that one, which is the same
     * object the reasoning key reads.
     * @returns {Promise<{ok: boolean, groups: Array, failures: Array}>} the groups, or a miss.
     */
    function catalogGroups() {
      var directories = modelDirectories()
      if (!directories) return Promise.resolve({ ok: false, groups: [], failures: [] })
      var catalog = directories.catalog
      if (catalog && typeof catalog.load === 'function') {
        return Promise.resolve()
          .then(function () {
            return catalog.load()
          })
          .then(groupsOf)
          .catch(function () {
            return { ok: false, groups: [], failures: [] }
          })
      }
      var row = currentSession()
      if (!row || typeof directories.directoryFor !== 'function') {
        return Promise.resolve({ ok: false, groups: [], failures: [] })
      }
      try {
        return Promise.resolve(directories.directoryFor(row.id))
          .then(function (directory) {
            return directory && typeof directory.load === 'function' ? directory.load() : null
          })
          .then(groupsOf)
          .catch(function () {
            return { ok: false, groups: [], failures: [] }
          })
      } catch (error) {
        return Promise.resolve({ ok: false, groups: [], failures: [] })
      }
    }

    /**
     * The provider groups out of one loaded catalog or directory snapshot. Both
     * carry the same `groups` shape, so one reader serves both reads.
     * @param {object|null} value - a loaded catalog or directory snapshot.
     * @returns {{ok: boolean, groups: Array, failures: Array}} the groups, or a miss.
     */
    function groupsOf(value) {
      if (!value || !Array.isArray(value.groups)) return { ok: false, groups: [], failures: [] }
      return {
        ok: true,
        groups: value.groups,
        failures: Array.isArray(value.failures) ? value.failures : [],
      }
    }

    /**
     * The catalog as a lookup, one entry per `provider/model`.
     *
     * A model offered by two providers, or twice by one, keeps its first
     * occurrence: the catalog is an answer to "is this exact pair available",
     * and the pair is the whole of the answer.
     * @param {Array} groups - provider groups from the host.
     * @returns {object} `provider/model` -> `{provider, model, name, reasoning}`.
     */
    function offeredModels(groups) {
      var out = {}
      var list = Array.isArray(groups) ? groups : []
      for (var g = 0; g < list.length; g++) {
        var group = list[g]
        if (!group || typeof group.id !== 'string') continue
        var models = Array.isArray(group.models) ? group.models : []
        for (var m = 0; m < models.length; m++) {
          var model = models[m]
          if (!model || typeof model.id !== 'string') continue
          var key = group.id + '/' + model.id
          if (out[key] !== undefined) continue
          out[key] = {
            provider: group.id,
            model: model.id,
            name: String(model.name === undefined ? model.id : model.name),
            reasoning: model.reasoning,
            // The picker's own two reads, resolved once here so no row has to
            // know how a level list is built or what "its default" means.
            levels: effortLevels(model.reasoning),
            defaultLevel: model.reasoning ? model.reasoning.defaultEffort : undefined,
          }
        }
      }
      return out
    }

    /**
     * The configured models the directory currently offers, in the order the
     * user put them in.
     *
     * A model that has dropped out of the catalog keeps its place in the settings
     * page but is left out here, so one signed-out account neither rewrites the
     * list nor takes the key down with it.
     * @param {Array} groups - provider groups from the host.
     * @param {Array} favorites - the configured pairs.
     * @returns {Array<{provider: string, model: string, name: string, levels: Array, defaultLevel: (string|undefined)}>} the ones on offer.
     */
    function modelEntries(groups, favorites) {
      var offered = offeredModels(groups)
      var out = []
      var wanted = sanitizeFavorites(favorites)
      for (var i = 0; i < wanted.length; i++) {
        var hit = offered[wanted[i].provider + '/' + wanted[i].model]
        if (hit !== undefined) out.push(hit)
      }
      return out
    }

    /** Where one model sits in the list; -1 when it is not one of them. */
    function modelIndex(entries, provider, model) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].provider === provider && entries[i].model === model) return i
      }
      return -1
    }

    /**
     * Resolve the model directory behind the conversation on screen.
     *
     * One reader, so the picker and any other caller agree on what "the
     * directory for this conversation" means, and on which failure each
     * missing piece produces. It says nothing itself: the caller decides
     * whether a miss is a notice or a line in a window.
     * @returns {{ok: true, directory: object}|{ok: false, reason: string}} the
     *   directory, or why there is none.
     */
    function modelDirectoryOfCurrent() {
      if (!taskServices()) return { ok: false, reason: paletteText('modelUnsupported') }
      var row = currentSession()
      if (!row) return { ok: false, reason: paletteText('noSession') }
      var directories = modelDirectories()
      if (!directories || typeof directories.directoryFor !== 'function') {
        return { ok: false, reason: paletteText('modelUnsupported') }
      }
      var directory = null
      try {
        directory = directories.directoryFor(row.id)
      } catch (error) {
        return { ok: false, reason: paletteText('modelFailed') + ': ' + failureText(error) }
      }
      if (!directory || !directory.store || typeof directory.store.getSnapshot !== 'function') {
        return { ok: false, reason: paletteText('modelUnsupported') }
      }
      return { ok: true, directory: directory }
    }

    /**
     * Read the list off one session directory.
     *
     * `pending` answers before `current` for the same reason the old walk read
     * it first: a selection already out is the one in effect as far as the next
     * choice is concerned, so confirming right after another selection replaces
     * it rather than re-sending the target that selection already asked for.
     * @param {object} directory - the session's shared model directory.
     * @returns {Promise<{entries: Array, selection: object, level: (string|undefined)}>}
     *   the reduced list, the selection in effect, and the level it is on.
     */
    function readModelList(directory) {
      return Promise.resolve()
        .then(function () {
          // Cheap when the catalog is already loaded, and it is what fills the
          // per-model metadata when it is not.
          return typeof directory.load === 'function' ? directory.load() : null
        })
        .then(function (loaded) {
          var snapshot =
            loaded && typeof loaded === 'object' ? loaded : directory.store.getSnapshot() || {}
          var selection = snapshot.pending || snapshot.current || {}
          return {
            entries: modelEntries(snapshot.groups, settings.favorites),
            selection: selection,
            level: currentLevelId(directory, selection),
            chosen: selection.reasoningEffort,
            groups: snapshot.groups,
          }
        })
        .catch(function () {
          // The load failed where the caller may prefer to read the store it
          // already has rather than lose the key to a bad hop.
          var snapshot = directory.store.getSnapshot() || {}
          var selection = snapshot.pending || snapshot.current || {}
          return {
            entries: modelEntries(snapshot.groups, settings.favorites),
            selection: selection,
            level: currentLevelId(directory, selection),
            chosen: selection.reasoningEffort,
            groups: snapshot.groups,
          }
        })
    }

    /**
     * The list the sheet's model row offers.
     *
     * The conversation on screen says which model to start on, and the catalog
     * says what is on offer — the same configured list, in the same order, the
     * model key shows. A host that publishes its catalog without a session
     * still answers, which is what lets a sheet opened from the board ask.
     * @returns {Promise<object>} the rows, the selection to start on, and the
     *   catalog groups they were read from.
     */
    function readNewSessionModelList() {
      var resolved = modelDirectoryOfCurrent()
      if (resolved.ok) return readModelList(resolved.directory)
      return catalogGroups().then(function (result) {
        if (!result.ok) throw refusal(paletteText('modelUnsupported'))
        return {
          entries: modelEntries(result.groups, settings.favorites),
          selection: {},
          level: undefined,
          chosen: undefined,
          groups: result.groups,
        }
      })
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
      if (!BOARD.newSessionHost) return
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
        // one the sheet is about to make, and lands on it when it exists.
        BOARD.newSessionModel = {
          provider: entry.provider,
          model: entry.model,
          name: entry.name,
          level: level,
          levelName: levelName(entry, level),
        }
        closeModelPick()
        paintNewSessionModel()
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
     * The readable name of one level of one model, or null when there is none.
     * @param {object} entry - a picker entry.
     * @param {string|undefined} level - the level id.
     * @returns {string|null} the level's own name.
     */
    function levelName(entry, level) {
      var levels = entry && entry.levels ? entry.levels : []
      var at = levelIndex(levels, level)
      return at < 0 ? null : levels[at].name
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

    /**
     * Read the catalog off one session directory and submit the model and level
     * asked for.
     *
     * The level arrives already resolved — `rowSubmitLevel` decided it when the
     * row was drawn, and `stepModelPickLevel` replaced it when the user moved it
     * — so this reader only has to decide whether there is a level to submit at
     * all. `undefined` is the provider default, which is submitted by leaving
     * the field off rather than by sending an id the adapter never published.
     * @param {object} directory - the session's shared model directory.
     * @param {object} next - the entry to switch to.
     * @param {string|undefined} level - the level to submit, undefined for none.
     * @returns {Promise<void>} rejects with the host's reason when refused.
     */
    function switchModel(directory, next, level) {
      return Promise.resolve()
        .then(function () {
          return typeof directory.load === 'function' ? directory.load() : null
        })
        .then(function (loaded) {
          var submit = { provider: next.provider, model: next.model }
          if (level !== undefined) submit.reasoningEffort = level
          return Promise.resolve(directory.select(submit)).then(function (result) {
            if (result && result.ok === false) throw new Error(failureText(result))
          })
        })
    }

    // ---------------------------------------------------------------------
    // settings page
    // ---------------------------------------------------------------------

    var UI = {
      group: { marginBottom: '22px' },
      groupTitle: { fontSize: '12px', opacity: 0.55, marginBottom: '6px', letterSpacing: '0.04em' },
      row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', minHeight: '36px' },
      label: { fontSize: '13px' },
      keyInput: {
        width: '88px',
        textAlign: 'center',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '13px',
        padding: '4px 6px',
        borderRadius: '6px',
        border: '1px solid rgba(128,128,128,0.45)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      keyInputActive: { borderStyle: 'dashed', borderColor: 'currentColor' },
      sliderWrap: { display: 'flex', alignItems: 'center', gap: '10px', flex: '0 1 260px' },
      slider: { flex: '1 1 auto', minWidth: '110px' },
      choiceWrap: { display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' },
      choice: {
        fontSize: '12px',
        padding: '4px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        border: '1px solid rgba(128,128,128,0.45)',
        background: 'transparent',
        color: 'inherit',
        opacity: '0.7',
      },
      choiceActive: {
        background: 'rgba(128,128,128,0.18)',
        opacity: '1',
      },
      value: { fontSize: '12px', opacity: 0.7, minWidth: '54px', textAlign: 'right' },
      hint: { fontSize: '12px', opacity: 0.55, lineHeight: 1.6, marginTop: '6px' },
      error: { fontSize: '12px', color: '#e5484d', marginTop: '8px' },
      footer: { display: 'flex', justifyContent: 'flex-end', marginTop: '18px' },
      modelGroup: { fontSize: '12px', marginTop: '10px' },
      modelGroupTitle: { fontSize: '12px', opacity: 0.55, margin: '12px 0 4px' },
      modelChosenBox: { maxHeight: '200px', overflowY: 'auto', marginTop: '4px' },
      modelRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '28px',
        fontSize: '13px',
      },
      modelId: { fontSize: '11px', opacity: 0.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      modelIndex: { fontSize: '11px', opacity: 0.45, minWidth: '14px', textAlign: 'right', flex: '0 0 auto' },
      modelTag: { fontSize: '11px', opacity: 0.6 },
      modelMove: {
        fontSize: '12px',
        width: '24px',
        height: '22px',
        lineHeight: '1',
        borderRadius: '5px',
        cursor: 'pointer',
        border: '1px solid rgba(128,128,128,0.35)',
        background: 'transparent',
        color: 'inherit',
        opacity: 0.7,
        flex: '0 0 auto',
      },
      modelMoveOff: { cursor: 'default', opacity: 0.2 },
      button: {
        fontSize: '13px',
        padding: '5px 14px',
        borderRadius: '7px',
        cursor: 'pointer',
        border: '1px solid rgba(128,128,128,0.45)',
        background: 'transparent',
        color: 'inherit',
      },
    }

    /**
     * Translate through the locale seat when it is wired, else through the
     * built-in dictionary. Never throws: a missing string falls back to the key.
     * @param {Function|undefined} seat - the shell-provided translator.
     * @returns {Function} key -> string.
     */
    function makeTranslator(seat) {
      return function (key) {
        if (typeof seat === 'function') {
          try {
            var value = seat(key)
            if (typeof value === 'string' && value !== key) return value
          } catch (error) {
            /* fall through to the built-in dictionary */
          }
        }
        var table = localeIsZh() ? ZH : EN
        return table[key] || key
      }
    }

    /** One rebindable key: focus the box, press the key you want. */
    function KeyRow(props) {
      var recordingRef = React.useState(false)
      var recording = recordingRef[0]
      var setRecording = recordingRef[1]
      return React.createElement(
        'div',
        { style: UI.row },
        React.createElement('span', { style: UI.label }, props.label),
        React.createElement('input', {
          type: 'text',
          readOnly: true,
          'aria-label': props.label,
          title: props.hint,
          value: recording ? props.recordingText : keyLabel(props.value),
          style: recording ? Object.assign({}, UI.keyInput, UI.keyInputActive) : UI.keyInput,
          onFocus: function () {
            setRecording(true)
          },
          onBlur: function () {
            setRecording(false)
          },
          onKeyDown: function (ev) {
            // The box owns the keystroke: the scroll engine already treats
            // inputs as editable, so nothing scrolls while recording.
            ev.preventDefault()
            ev.stopPropagation()
            if (ev.key === 'Escape') {
              ev.target.blur()
              return
            }
            if (ev.ctrlKey || ev.altKey || ev.metaKey) return
            if (!isBindableKey(ev.key)) return
            props.onSet(normalizeKey(ev.key))
            ev.target.blur()
          },
        })
      )
    }

    /** One numeric preference. */
    function SliderRow(props) {
      return React.createElement(
        'div',
        { style: UI.row },
        React.createElement('label', { style: UI.label, htmlFor: props.id }, props.label),
        React.createElement(
          'div',
          { style: UI.sliderWrap },
          React.createElement('input', {
            id: props.id,
            type: 'range',
            min: props.min,
            max: props.max,
            step: props.step,
            value: props.value,
            style: UI.slider,
            onChange: function (ev) {
              props.onChange(Number(ev.target.value))
            },
          }),
          React.createElement('span', { style: UI.value }, String(props.value) + props.unit)
        )
      )
    }

    /**
     * A short set of mutually exclusive options, as a row of toggles. Used for
     * values that are not a continuum, so a slider would be a lie.
     * @param {object} props - label, options [{value, label}], value, onSet.
     */
    function ChoiceRow(props) {
      var buttons = []
      for (var i = 0; i < props.options.length; i++) {
        var option = props.options[i]
        var active = option.value === props.value
        buttons.push(
          React.createElement(
            'button',
            {
              key: option.value,
              type: 'button',
              'aria-pressed': active ? 'true' : 'false',
              style: active ? Object.assign({}, UI.choice, UI.choiceActive) : UI.choice,
              // `option` is declared with var above, so every button here would
              // share one binding and all of them would pick the last option.
              // Freeze the value per button instead.
              onClick: (function (value) {
                return function () {
                  props.onSet(value)
                }
              })(option.value),
            },
            option.label
          )
        )
      }
      return React.createElement(
        'div',
        { style: UI.row },
        React.createElement('span', { style: UI.label }, props.label),
        React.createElement('div', { style: UI.choiceWrap }, buttons)
      )
    }

    /**
     * The switchable models as one settings group: what is chosen, in the order
     * the model key walks it, and everything else the host currently offers.
     *
     * The list is read from the host's own catalog rather than typed, because a
     * hand-written `provider/model` is exactly the kind of string that is wrong
     * in a way nothing on the page will show. A chosen model the catalog no
     * longer offers stays in the list, marked, so an account that signed itself
     * out does not quietly take the user's configuration with it.
     * @param {object} props - tr, favorites, onChange(favorites).
     * @returns {object} the group.
     */
    function ModelListGroup(props) {
      var readRef = React.useState({ status: 'loading', groups: [], failures: [] })
      var catalog = readRef[0]
      var setCatalog = readRef[1]
      var tr = props.tr

      /** Read the catalog again: it is refilled as adapters and credentials change. */
      function reload() {
        setCatalog({ status: 'loading', groups: [], failures: [] })
        catalogGroups().then(function (result) {
          setCatalog({
            status: result.ok ? 'ready' : 'failed',
            groups: result.groups,
            failures: result.failures,
          })
        })
      }
      React.useEffect(reload, [])

      var favorites = sanitizeFavorites(props.favorites)
      var offered = offeredModels(catalog.groups)
      var chosen = {}
      var rows = []

      for (var i = 0; i < favorites.length; i++) {
        var key = favorites[i].provider + '/' + favorites[i].model
        chosen[key] = true
        var hit = offered[key]
        rows.push({
          key: key,
          pair: favorites[i],
          name: hit ? hit.name : favorites[i].model,
          available: !!hit,
        })
      }

      /** Put one pair at a place in the list, or take it out of it. */
      function reorder(from, to) {
        var next = favorites.slice()
        if (to < 0 || to >= next.length) return
        next.splice(to, 0, next.splice(from, 1)[0])
        props.onChange(next)
      }

      /** Append one pair, or drop whichever entry carries that key. */
      function toggle(pair) {
        var key = pair.provider + '/' + pair.model
        var kept = []
        var seen = false
        for (var i = 0; i < favorites.length; i++) {
          if (favorites[i].provider + '/' + favorites[i].model !== key) kept.push(favorites[i])
          else seen = true
        }
        if (!seen) kept.push({ provider: pair.provider, model: pair.model })
        props.onChange(kept)
      }

      /** One small square button: move an entry, or take it out. */
      function action(label, text, disabled, run) {
        var style = Object.assign({}, UI.modelMove)
        if (text.length > 1) style.width = 'auto'
        if (disabled) style = Object.assign({}, style, UI.modelMoveOff)
        return React.createElement(
          'button',
          {
            type: 'button',
            'aria-label': label,
            title: label,
            disabled: disabled,
            style: style,
            onClick: disabled ? undefined : run,
          },
          text
        )
      }

      var body = null
      if (catalog.status === 'loading') {
        body = React.createElement('div', { style: UI.modelGroup }, tr('modelCatalogLoading'))
      } else if (catalog.status === 'failed') {
        body = React.createElement(
          'div',
          { style: UI.modelGroup },
          tr('modelCatalogFailed'),
          ' ',
          action(tr('modelCatalogRetry'), tr('modelCatalogRetry'), false, reload)
        )
      } else {
        var blocks = []
        blocks.push(
          React.createElement('div', { style: UI.modelGroupTitle }, tr('modelChosen')),
          React.createElement(
            'div',
            { style: UI.modelChosenBox },
            rows.length === 0
              ? React.createElement('div', { style: UI.modelGroup }, tr('modelEmpty'))
              : rows.map(function (row, at) {
                  return React.createElement(
                    'div',
                    { key: row.key, style: UI.modelRow },
                    React.createElement('span', { style: UI.modelIndex }, String(at + 1)),
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: true,
                      'aria-label': row.name,
                      title: tr('modelRemove'),
                      onChange: function () {
                        toggle(row.pair)
                      },
                    }),
                    React.createElement('span', null, row.name),
                    React.createElement('span', { style: UI.modelId }, row.key),
                    row.available ? null : React.createElement('span', { style: UI.modelTag }, tr('modelUnavailable')),
                    action(tr('modelUp'), '↑', at === 0, function () {
                      reorder(at, at - 1)
                    }),
                    action(tr('modelDown'), '↓', at === rows.length - 1, function () {
                      reorder(at, at + 1)
                    }),
                    action(tr('modelRemove'), '✕', false, function () {
                      toggle(row.pair)
                    })
                  )
                })
          )
        )
        var groups = Array.isArray(catalog.groups) ? catalog.groups : []
        var addable = 0
        for (var g = 0; g < groups.length; g++) {
          var group = groups[g]
          if (!group || !Array.isArray(group.models) || group.models.length === 0) continue
          var lines = []
          for (var m = 0; m < group.models.length; m++) {
            var model = group.models[m]
            if (!model || typeof model.id !== 'string') continue
            var addableKey = group.id + '/' + model.id
            if (chosen[addableKey]) continue
            lines.push(
              React.createElement(
                'div',
                { key: addableKey, style: UI.modelRow },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: false,
                  'aria-label': String(model.name === undefined ? model.id : model.name),
                  title: tr('modelAdd'),
                  onChange: (function (pair) {
                    return function () {
                      toggle(pair)
                    }
                  })({ provider: group.id, model: model.id }),
                }),
                React.createElement(
                  'span',
                  null,
                  String(model.name === undefined ? model.id : model.name)
                ),
                React.createElement('span', { style: UI.modelId }, addableKey)
              )
            )
          }
          if (lines.length === 0) continue
          addable += lines.length
          blocks.push(React.createElement('div', { style: UI.modelGroupTitle }, group.name || group.id))
          blocks.push(React.createElement('div', null, lines))
        }
        // Only worth saying when there is something chosen to have chosen
        // everything: on an empty catalog it would contradict the empty list
        // right above it.
        if (addable === 0 && rows.length > 0) {
          blocks.push(React.createElement('div', { style: UI.modelGroup }, tr('modelAllChosen')))
        }
        // A provider whose catalog query failed is listed, not hidden: the
        // shell shows it the same way, and a group that silently vanished would
        // read as "those models were never offered".
        var failures = Array.isArray(catalog.failures) ? catalog.failures : []
        for (var f = 0; f < failures.length; f++) {
          if (!failures[f]) continue
          blocks.push(
            React.createElement(
              'div',
              { style: UI.modelGroup },
              (failures[f].name || failures[f].id) + ': ' + String(failures[f].message || '')
            )
          )
        }
        body = React.createElement('div', { style: UI.modelGroup }, blocks)
      }

      return React.createElement('div', null, body)
    }

    /** The whole Settings → Vim scrolling page. */
    function VimSection(props) {
      var tr = makeTranslator(props.t)
      var stateRef = React.useState(copy)
      var snapshot = stateRef[0]
      var setSnapshot = stateRef[1]
      var errorRef = React.useState('')
      var error = errorRef[0]
      var setError = errorRef[1]

      React.useEffect(function () {
        return subscribe(function () {
          setSnapshot(copy())
        })
      }, [])

      /** Apply a patch and surface a rejection in the page. */
      function set(patch) {
        var failure = applyPatch(patch)
        setError(failure === 'conflict' ? tr('conflict') : '')
      }

      /** One rebindable-key row, bound to its seat. */
      function keyRow(labelKey, seat) {
        return React.createElement(KeyRow, {
          label: tr(labelKey),
          hint: tr('hint'),
          recordingText: tr('recording'),
          value: snapshot[seat],
          onSet: function (key) {
            var patch = {}
            patch[seat] = key
            set(patch)
          },
        })
      }

      /** One numeric row, bound to its seat. */
      function sliderRow(labelKey, seat, id) {
        return React.createElement(SliderRow, {
          id: id,
          label: tr(labelKey),
          value: snapshot[seat],
          min: LIMITS[seat].min,
          max: LIMITS[seat].max,
          step: LIMITS[seat].step,
          unit: LIMITS[seat].unit,
          onChange: function (value) {
            var patch = {}
            patch[seat] = value
            set(patch)
          },
        })
      }

      /**
       * One on/off row, bound to its seat.
       *
       * The row and its hint travel together: a toggle whose reason is a
       * sentence away reads as unexplained. Every seat in `BOOL_SEATS` arrives
       * here, so nothing about the toggle itself is written out per
       * preference.
       */
      function boolRow(labelKey, hintKey, seat) {
        return React.createElement(
          'div',
          null,
          React.createElement(ChoiceRow, {
            label: tr(labelKey),
            value: snapshot[seat] ? 'on' : 'off',
            options: [
              { value: 'on', label: tr('on') },
              { value: 'off', label: tr('off') },
            ],
            onSet: function (value) {
              var patch = {}
              patch[seat] = value === 'on'
              set(patch)
            },
          }),
          React.createElement('div', { style: UI.hint }, tr(hintKey))
        )
      }

      /**
       * One row of mutually exclusive options, bound to its seat. Same shape as
       * boolRow - a row carries its own reason - for a preference that is a
       * choice between named behaviours rather than a plain on/off.
       */
      function choiceRow(labelKey, hintKey, seat, values, labelKeys) {
        var options = []
        for (var i = 0; i < values.length; i++) {
          options.push({ value: values[i], label: tr(labelKeys[i]) })
        }
        return React.createElement(
          'div',
          null,
          React.createElement(ChoiceRow, {
            label: tr(labelKey),
            value: snapshot[seat],
            options: options,
            onSet: function (value) {
              var patch = {}
              patch[seat] = value
              set(patch)
            },
          }),
          React.createElement('div', { style: UI.hint }, tr(hintKey))
        )
      }

      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: UI.group },
          React.createElement('div', { style: UI.groupTitle }, tr('keys')),
          keyRow('down', 'downKey'),
          keyRow('up', 'upKey'),
          keyRow('focusComposer', 'focusKey'),
          React.createElement('div', { style: UI.hint }, tr('hintFocus')),
          keyRow('effort', 'effortKey'),
          React.createElement('div', { style: UI.hint }, tr('hintEffort')),
          keyRow('model', 'modelKey'),
          keyRow('modelLevel', 'modelLevelKey'),
          React.createElement('div', { style: UI.hint }, tr('hintModelLevel')),
          keyRow('board', 'boardKey'),
          React.createElement('div', { style: UI.hint }, tr('hintBoard')),
          keyRow('note', 'noteKey'),
      keyRow('pin', 'pinKey'),
          React.createElement('div', { style: UI.hint }, tr('hintNote'))
        ),
        React.createElement(
          'div',
          { style: UI.group },
          React.createElement('div', { style: UI.groupTitle }, tr('modelList')),
          React.createElement('div', { style: UI.hint }, tr('hintModel')),
          React.createElement(ModelListGroup, {
            tr: tr,
            favorites: snapshot.favorites,
            onChange: function (favorites) {
              set({ favorites: favorites })
            },
          })
        ),
        React.createElement(
          'div',
          { style: UI.group },
          React.createElement('div', { style: UI.groupTitle }, tr('window')),
          keyRow('palette', 'paletteKey'),
          React.createElement('div', { style: UI.hint }, tr('hintPalette')),
          keyRow('paletteRename', 'paletteRenameKey'),
          keyRow('paletteUp', 'paletteUpKey'),
          keyRow('paletteDown', 'paletteDownKey'),
          keyRow('paletteEnter', 'paletteEnterKey'),
          keyRow('paletteStage', 'paletteStageKey'),
          keyRow('paletteArchive', 'paletteArchiveKey'),
          React.createElement('div', { style: UI.hint }, tr('hintStage')),
          React.createElement('div', { style: UI.hint }, tr('hintEnter')),
          React.createElement('div', { style: UI.hint }, tr('hintArchive'))
        ),
        React.createElement(
          'div',
          { style: UI.group },
          React.createElement('div', { style: UI.groupTitle }, tr('focus')),
          boolRow('escapeBlurs', 'hintEscape', 'escapeBlurs'),
          boolRow('spaceBlurs', 'hintSpace', 'spaceBlurs'),
          boolRow('switchBlurs', 'hintSwitch', 'switchBlurs'),
          boolRow('sendBlurs', 'hintSendBlurs', 'sendBlurs'),
          choiceRow('sendMode', 'hintSend', 'sendMode', SEND_MODES, [
            'sendHost',
            'sendNewline',
            'sendSilent',
            'sendDouble',
          ])
        ),
        React.createElement(
          'div',
          { style: UI.group },
          React.createElement('div', { style: UI.groupTitle }, tr('appearance')),
          sliderRow('fontSize', 'paletteFont', 'dsh-vim-palette-font'),
          sliderRow('panelWidth', 'paletteWidth', 'dsh-vim-palette-width'),
          sliderRow('panelHeight', 'paletteHeight', 'dsh-vim-palette-height'),
          sliderRow('rowSpacing', 'paletteRow', 'dsh-vim-palette-row'),
          React.createElement(ChoiceRow, {
            label: tr('place'),
            value: snapshot.palettePlace,
            options: [
              { value: 'top', label: tr('placeTop') },
              { value: 'center', label: tr('placeCenter') },
              { value: 'bottom', label: tr('placeBottom') },
            ],
            onSet: function (place) {
              set({ palettePlace: place })
            },
          })
        ),
        error ? React.createElement('div', { style: UI.error }, error) : null,
        React.createElement(
          'div',
          { style: UI.group },
          React.createElement('div', { style: UI.groupTitle }, tr('speed')),
          sliderRow('step', 'step', 'dsh-vim-step'),
          sliderRow('tau', 'tau', 'dsh-vim-tau'),
          sliderRow('repeatDelay', 'repeatDelay', 'dsh-vim-repeat-delay')
        ),
        React.createElement(
          'div',
          { style: UI.footer },
          React.createElement(
            'button',
            {
              type: 'button',
              style: UI.button,
              onClick: function () {
                set(defaults())
              },
            },
            tr('reset')
          )
        )
      )
    }

    /**
     * The board as the main panel's page.
     *
     * The host owns the panel and renders this component into it; the board
     * itself is still the imperative builder, mounted into the element the
     * component owns. That element is this plugin's own, so nothing is written
     * outside it, and the mount is undone with the component.
     * @returns {object} the page's root element.
     */
    function BoardPage() {
      var hostRef = typeof React.useRef === 'function' ? React.useRef(null) : { current: null }
      React.useEffect(function () {
        var node = hostRef.current
        if (!node) return undefined
        node.setAttribute('data-role', 'boardPage')
        node.className = 'dshv-window'
        mountBoardInto(node, 'page')
        return function () {
          // The page went away with the panel: drop the feeds and the state.
          // The element belongs to the host's tree and is left alone.
          if (BOARD.mode === 'page') unmountBoard()
        }
      }, [])
      return React.createElement('div', {
        ref: hostRef,
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: '1',
          minWidth: '0',
          minHeight: '0',
        },
      })
    }

    /**
     * The sidebar entry's glyph: three columns, which is what the board is.
     *
     * Drawn here rather than taken from the host's icon set: a plugin does not
     * load the host's Client packages as modules, and a small stroke drawing
     * follows the row's text colour by itself.
     * @param {object} props - the sidebar's icon share.
     * @returns {object} the icon element.
     */
    function BoardPanelIcon(props) {
      var size = (props && props.size) || 16
      var bars = [
        { x: 2, y: 2.5, width: 3.2, height: 11 },
        { x: 6.6, y: 2.5, width: 3.2, height: 7 },
        { x: 11.2, y: 2.5, width: 3.2, height: 9 },
      ]
      var children = []
      for (var i = 0; i < bars.length; i++) {
        children.push(
          React.createElement('rect', {
            key: 'bar' + i,
            x: bars[i].x,
            y: bars[i].y,
            width: bars[i].width,
            height: bars[i].height,
            rx: 1,
          })
        )
      }
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          'aria-hidden': 'true',
          focusable: 'false',
        },
        children
      )
    }

    /**
     * Contribute the board as a sidebar entry and a main panel.
     *
     * The entry and the panel share one id: the sidebar selects the panel by
     * it, and the layout service refuses an id no panel is registered under.
     * A host without either seat keeps the floating board instead.
     * @param {object} ctx - client root context.
     * @returns {void}
     */
    function installBoardPage(ctx) {
      // Once per process, not once per `apply`: the sidebar renders every entry
      // in its list, so a second contribution would put two "board" rows in it.
      if (boardPageInstalled) return
      var slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null)
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
      boardPageInstalled = true

      try {
        slots.inject('main', function () {
          return slots.register(
            {
              name: 'main',
              key: BOARD_PANEL_ID,
              locale: NS,
            },
            BoardPage
          )
        })
      } catch (error) {
        console.warn('[dsh-vim] board page registration failed', error)
      }

      try {
        slots.inject('sidebar.panellist', function () {
          return slots.register(
            {
              name: 'sidebar.panellist',
              id: BOARD_PANEL_ID,
              order: 20,
              locale: NS,
              label: function () {
                return paletteText('board')
              },
            },
            BoardPanelIcon
          )
        })
      } catch (error) {
        console.warn('[dsh-vim] board sidebar entry failed', error)
      }
    }

    /** Set once the windows' shared rules have been put on the page. */
    var windowCssInstalled = false

    /**
     * The rules every window this plugin mounts shares, once.
     *
     * Inline styles cannot reach two things a window's feel depends on: the
     * bars the platform draws on its scrollers, and the shade it gives the
     * words. The bars are the loud one - the Mac draws its scroller in the
     * platform's own grey, wide and bright, so every dark window here had a
     * foreign trough carved down its side. Thin bars in a neutral grey that
     * reads on both the dark sheets and the amber paper, and words smoothed
     * the way the platform below the window smooths its own. Every window
     * carries the `dshv-window` class, which is the handle for all of it.
     * @returns {void}
     */
    function installWindowCSS() {
      if (windowCssInstalled) return
      var head = document.head
      if (!head || typeof head.appendChild !== 'function' || typeof document.createElement !== 'function') return
      if (typeof document.getElementById === 'function' && document.getElementById('dsh-vim-window-css')) {
        windowCssInstalled = true
        return
      }
      var style = document.createElement('style')
      style.setAttribute('id', 'dsh-vim-window-css')
      style.textContent = [
        // The platform shades its own words; a window mounted over it asks
        // for the same shade, and everything inside inherits it.
        '.dshv-window{-webkit-font-smoothing:antialiased;}',
        // The scrollers' bars, in the window's own material: no trough, a
        // thin rounded thumb that sits quietly on the dark sheets and stays
        // legible on the amber paper, and no corner where two bars would
        // meet on the panned canvas.
        '.dshv-window ::-webkit-scrollbar{width:8px;height:8px;}',
        '.dshv-window ::-webkit-scrollbar-track{background:transparent;}',
        '.dshv-window ::-webkit-scrollbar-thumb{background:rgba(140,140,150,0.42);border:2px solid transparent;border-radius:999px;background-clip:padding-box;}',
        '.dshv-window ::-webkit-scrollbar-thumb:hover{background:rgba(140,140,150,0.65);background-clip:padding-box;}',
        '.dshv-window ::-webkit-scrollbar-corner{background:transparent;}',
      ].join('\n')
      try {
        head.appendChild(style)
        windowCssInstalled = true
      } catch (error) {
        console.warn('[dsh-vim] window styles failed', error)
      }
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
        // A card in the air turns every goal's plus into a drop target: the same
        // seat the press opens, now saying it will take the card instead.
        '[data-note-drag="true"] .dshv-goal-new{outline:1px dashed var(--dshv-board-accent,#93c5fd);outline-offset:2px;color:var(--dshv-board-accent,#93c5fd);}',
        '.dshv-goal-new{transition:color .14s ease,border-color .14s ease,background-color .14s ease;}',
        '.dshv-goal-new:hover{color:var(--dshv-board-accent,#93c5fd);border-color:var(--dshv-board-accent,rgba(147,197,253,.55));background:var(--dshv-board-accent-soft,rgba(147,197,253,.16));}',
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
        // Renaming steps forward when the pointer is already on the card, the way
        // the idea cards' own secondary marks do. It stands over the end of the
        // name, so while it is invisible it must not take the press that was
        // meant for the card: a guard that is not there is the whole point.
        '.dshv-rename{opacity:0;pointer-events:none;transition:opacity .14s ease,color .14s ease;}',
        '.dshv-card:hover .dshv-rename,.dshv-card[data-front="true"] .dshv-rename{opacity:1;pointer-events:auto;}',
        '.dshv-rename:hover{color:var(--dshv-board-accent,#93c5fd);}',
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
        '.dshv-tray-row:hover{background:var(--dshv-board-note-hover,rgba(250,204,21,.14));}',
        // The prompt in a new card is a place, not a label: it has to be lighter
        // than the words that will replace it.
        '[data-role="cardTitleInput"]::placeholder{color:currentColor;opacity:.3;}',
        '.dshv-done-row:hover{transform:translateY(-1px);}',
        '.dshv-tray-row[data-editing="true"]{background:var(--dshv-board-accent-soft,rgba(147,197,253,.10));}',
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

    /**
     * Contribute the settings page and its vocabulary. Both contributions are
     * best-effort: a failure here must never take the scrolling down with it.
     * @param {object} ctx - client root context.
     */
    function installSettings(ctx) {
      var slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null)
      var locale = ctx.locale || (typeof ctx.get === 'function' ? ctx.get('locale') : null)

      if (locale && typeof locale.register === 'function') {
        try {
          ctx.effect(function () {
            return locale.register(NS, { zh: ZH, en: EN })
          }, 'dsh-vim: dictionaries')
        } catch (error) {
          console.warn('[dsh-vim] locale registration failed', error)
        }
      }

      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
        console.warn('[dsh-vim] settings slot unavailable; scrolling still works')
        return
      }

      try {
        slots.inject('settings.section', function () {
          return slots.register(
            {
              name: 'settings.section',
              id: 'dsh-vim',
              order: 56,
              label: function () {
                return localeIsZh() ? ZH.nav : EN.nav
              },
              locale: NS,
              inject: function () {
                return {}
              },
            },
            VimSection
          )
        })
      } catch (error) {
        console.warn('[dsh-vim] settings section registration failed', error)
      }

      // Once per process, not once per `apply`. The dock is a list slot and
      // the shell renders every entry in it, so a second registration would
      // put the same sentence on the page twice — and a client that rebuilds
      // around a conversation would keep adding one.
      if (!hintRegistered) {
        try {
          slots.inject('conversation.composer.dock', function () {
            return slots.register(
              {
                name: 'conversation.composer.dock',
                id: 'dsh-vim',
                order: 80,
                locale: NS,
                inject: function () {
                  return {}
                },
              },
              SendHintLine
            )
          })
          hintRegistered = true
        } catch (error) {
          // A host without this dock, or one that refuses a second contributor,
          // must cost the hint its place and nothing else: the plugin's whole
          // reason for being is the keyboard, and the keyboard still works.
          console.warn('[dsh-vim] composer dock registration failed', error)
        }
      }
    }

    // ---------------------------------------------------------------------
    // activation
    // ---------------------------------------------------------------------

    /** Debug and tuning surface, also used by tools/selftest.mjs. */
    function makeApi() {
      return {
        probe: function () {
          var el = pickScroller()
          return {
            element: el,
            tag: el ? el.tagName : null,
            className: el ? String(el.className) : null,
            scrollTop: el ? el.scrollTop : null,
            scrollHeight: el ? el.scrollHeight : null,
            clientHeight: el ? el.clientHeight : null,
            pointer: { x: pointer.x, y: pointer.y, seen: pointer.seen },
            composer: {
              known: composerRoot() !== null,
              focused: isComposerEditor(document.activeElement),
              empty: composerRoot() === null ? null : composerIsEmpty(composerRoot()),
            },
          }
        },
        debug: function (on) {
          state.debug = on === undefined ? true : Boolean(on)
          return state.debug
        },
        settings: function () {
          return copy()
        },
        update: function (patch) {
          var failure = applyPatch(patch)
          return failure === null ? copy() : { error: failure }
        },
        tuning: function (patch) {
          if (patch) applyPatch(patch)
          return copy()
        },
        /**
         * What the model key would see right now: the configured list, the
         * catalog the host offers, and the two reduced to the entries one press
         * could actually land on. A list that reads empty here is why the key
         * says so instead of switching something.
         */
        models: function () {
          return catalogGroups().then(function (result) {
            var offered = offeredModels(result.groups)
            return {
              service: modelDirectories() !== null,
              ok: result.ok,
              favorites: settings.favorites.slice(),
              offered: Object.keys(offered),
              entries: modelEntries(result.groups, settings.favorites).map(function (entry) {
                return entry.provider + '/' + entry.model
              }),
            }
          })
        },
        step: function (px) {
          if (px !== undefined) applyPatch({ step: px })
          return settings.step
        },
        reset: function () {
          applyPatch(defaults())
          return copy()
        },
        /**
         * What the board would show right now, and whether it is up.
         *
         * The task window's `palette()` answers the same questions about the
         * other overlay; this one answers them about this one, so a check can
         * read what is on screen rather than guess from the DOM.
         */
        board: function (on) {
          if (on === true && !BOARD.open) openBoard()
          else if (on === false && BOARD.open) closeBoard()
          return {
            available: taskServices() !== null,
            open: BOARD.open,
            mode: BOARD.mode,
            // The canvas as it is drawn: one entry per workspace in play, then
            // the inbox. A card is listed by its conversation's id, and its
            // fork source is named only when this build watched the branch.
            blocks: BOARD.blocks.map(function (block) {
              return {
                key: block.key,
                label: block.label,
                kind: block.kind,
                path: block.path,
                folded: BOARD_STORE.isFolded(block.key),
                ids: block.rows.map(function (row) {
                  return row.id
                }),
              }
            }),
            inbox: BOARD.inbox.map(function (summary) {
              var status = statusOf(summary)
              return {
                id: summary.id,
                title: summary.displayTitle || summary.id,
                turns: BOARD_TURNS.read(summary),
                status: status ? status.key : null,
              }
            }),
            cards: BOARD.nodes.map(function (node) {
              return node.getAttribute('data-session-id')
            }),
            /** What can be stepped back and forward, for a check to read. */
            history: {
              canUndo: BOARD_HISTORY.canUndo(),
              canRedo: BOARD_HISTORY.canRedo(),
              depth: BOARD_HISTORY.depth(),
            },
            /** The names the reader gave these goals, by block id. */
            goals: BOARD_STORE.blockLabels(),
            /** What each goal is for, by block id. */
            intents: BOARD_STORE.intents(),
            /** Where the reader filed each card, when not where its workspace does. */
            placed: BOARD_STORE.placements(),
            /** The card the last press raised, and which goal is being named. */
            front: BOARD.front,
            renamingGoal: BOARD.renamingBlock,
            /** The loose cards: what they say, and where they sit. */
            loose: BOARD_STORE.cards(),
            editingCard: BOARD.cardEditing,
            /** The fork lines this build watched, child → parent. */
            lineage: BOARD_STORE.lineage(),
            /** Where each panel and card sits on the canvas. */
            places: BOARD_STORE.blocks(),
            starred: BOARD.rows.filter(function (row) {
              return BOARD_STORE.isStarred(row.id)
            }).map(function (row) {
              return row.id
            }),
          }
        },
        /**
         * The line pinned to one conversation, and which card is editing one.
         *
         * The editor is a field inside the card, so a check can read it from
         * the DOM; what this adds is the bookkeeping the DOM does not carry —
         * which conversation will be written to when the field is confirmed.
         */
        note: function (id) {
          return {
            editing: BOARD.noteEditing,
            line: id ? NOTE_STORE.get(id) : '',
          }
        },
        /**
         * Mount the board as the sidebar page, into a caller's element.
         *
         * The React page does this in a browser; a headless check has no
         * renderer, so the same mount is reachable here and exercises the page
         * path without a window.
         */
        /**
         * Empty the board's history.
         *
         * It lives in memory for the life of the page, which is right for a
         * reader and wrong for a check: a check must start from no steps at all.
         * @returns {object} the stacks, both empty.
         */
        clearHistory: function () {
          BOARD_HISTORY.clear()
          if (BOARD.open) renderBoard()
          return BOARD_HISTORY.depth()
        },

        boardPage: function (root, on) {
          if (on === false) {
            if (BOARD.open && BOARD.mode === 'page') unmountBoard()
            return false
          }
          if (!root) return false
          return mountBoardInto(root, 'page')
        },
        palette: function (on) {
          if (on === true && !PALETTE.open) openPalette()
          else if (on === false && PALETTE.open) closePalette()
          return {
            available: taskServices() !== null,
            open: PALETTE.open,
            index: PALETTE.index,
            // Whether the cursor is standing on the "More" seat rather than on a
            // conversation. Exposed because it is the one position that is not a
            // row, so a check reading `rows[index]` would otherwise be reading
            // the row the seat is standing in front of.
            onMore: PALETTE.onMore,
            headline: paletteHeadline(),
            total: PALETTE.pool.length,
            // Whether the browsing block is the fallback batch rather than the
            // last three hours. The rows are the same either way; only the
            // heading differs, and a check has to be able to tell which one it
            // is looking at without reading the label.
            stale: PALETTE.stale,
            // The blocks the list is cut into, so the cut can be read without
            // counting elements — a heading is not a row, and `index` counts
            // conversations only.
            sections: PALETTE.sections.map(function (section) {
              return {
                kind: section.kind,
                label: section.kind === 'more' ? paletteText('groupMore') : section.label,
                // How much is still behind the "More" seat, or how many rows the
                // block holds. The two answer different questions on purpose.
                count: section.kind === 'more' ? section.count : section.rows.length,
                ids: section.rows.map(function (row) {
                  return row.id
                }),
              }
            }),
            rows: PALETTE.rows.map(function (row) {
              return {
                id: row.id,
                title: row.displayTitle,
                updatedAt: row.updatedAt,
                status: statusOf(row),
                phase: PHASES_MODEL.get(row.id),
                turns: turnsOf(row),
                // 0 unless a turn is in flight and this plugin watched it start.
                since: statusIsLive(statusOf(row)) ? runSince(row.id) : 0,
              }
            }),
          }
        },
        stop: function () {
          stopHold()
          stopAnim()
          closePalette()
          closeModelPick()
          closeBoard()
          commitBoardNote()
          hideToast()
          doubleEnter.at = 0
        },
        /**
         * What the picker would show right now, and whether it is up.
         *
         * `models()` answers the same question from the catalog side; this one
         * answers it from the window's own side, so a check can prove what is
         * on screen rather than what could be.
         */
        modelPick: function (on) {
          if (on === true && !MODELPICK.open) openModelPick()
          else if (on === false && MODELPICK.open) closeModelPick()
          return {
            open: MODELPICK.open,
            index: MODELPICK.index,
            total: MODELPICK.entries.length,
            submitting: MODELPICK.submitting,
            notice: MODELPICK.notice,
            // The level the selected row would submit, and whether the user put
            // it there. `undefined` is "no level" — the provider default, which
            // is a real answer here and not a missing one.
            level: MODELPICK.open ? confirmLevel() : undefined,
            marked: MODELPICK.open ? markedLevel(MODELPICK.index) : undefined,
            levelSet: MODELPICK.levelSet,
            here: MODELPICK.here ? MODELPICK.here.level : undefined,
            rows: MODELPICK.entries.map(function (entry, at) {
              return {
                provider: entry.provider,
                model: entry.model,
                name: entry.name,
                levels: (entry.levels || []).map(function (level) {
                  return { id: level.id, name: level.name }
                }),
                marked: markedLevel(at),
              }
            }),
          }
        },
        /**
         * Read, mark, cycle and forget stages.
         *
         * `phase()` returns the whole map; `phase(id)` reads one conversation;
         * `phase(id, 'code')` marks it and `phase(id, 'code', true)` cycles it;
         * `clearPhases()` forgets every stage. Marking answers with a repaint
         * when the window is up, exactly as a press of the stage key does, so a
         * stage written here is not one a screen is still showing as absent.
         */
        phase: function (id, value, step) {
          if (id === undefined) return PHASES_MODEL.all()
          if (value === undefined) return PHASES_MODEL.get(id)
          var next
          if (step) next = cyclePhase(id)
          else {
            next = PHASES_MODEL.set(id, value)
            if (PALETTE.open) renderPalette()
          }
          return next
        },
        /** Forget every stage. Kept apart from `phase` so a bare call cannot be a write. */
        clearPhases: function () {
          PHASES_MODEL.reset()
          if (PALETTE.open) renderPalette()
          return PHASES_MODEL.all()
        },
      }
    }

    /**
     * Client activation.
     * @param {object} ctx - client root context.
     */
    function apply(ctx) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return

      taskCtx = ctx
      taskServices.cache = undefined
      closePalette()
      closeModelPick()
      closeBoard()
      // A board being typed into belongs to the page that was rebuilt around
      // it: what was typed is kept, the field itself is not.
      commitBoardNote()
      forgetPointer()
      forgetRuns()
      // There may be a turn in flight whose start the previous page took down,
      // and this page is the same client rebuilt around it.
      loadRunStamps()
      // Stages the previous page marked are this page's too.
      PHASES_MODEL.load()

      load()

      ctx.effect(function () {
        // The run watch is the one thing this plugin does while nothing is
        // being asked of it: without it, no row could ever show how long its
        // turn has been going (the shell publishes no start time).
        watchRuns()
        // Forks are observed from the moment the page wakes, not from the
        // moment the board opens: a branch made in the sidebar while the board
        // was shut still has a line waiting for it.
        watchForks()
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('keyup', onKeyUp, true)
        window.addEventListener('keydown', onEscapeBlur)
        window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
        document.addEventListener('focusin', onFocusIn, true)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('contextmenu', onContextMenu)
        window.addEventListener('wheel', onUserScroll, { capture: true, passive: true })
        window.addEventListener('touchstart', onUserScroll, { capture: true, passive: true })
        window.addEventListener('blur', onFocusLoss)
        window.addEventListener('focus', noteFocusReturn)
        document.addEventListener('visibilitychange', onFocusLoss)

        var api = makeApi()
        window.__dshVim = api

        return function () {
          stopHold()
          stopAnim()
          closePalette()
          closeModelPick()
          closeBoard()
          commitBoardNote()
          hideToast()
          stopClock()
          forgetRuns()
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('keyup', onKeyUp, true)
          window.removeEventListener('keydown', onEscapeBlur)
          window.removeEventListener('pointermove', onPointerMove, true)
          document.removeEventListener('focusin', onFocusIn, true)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('contextmenu', onContextMenu)
          window.removeEventListener('wheel', onUserScroll, true)
          window.removeEventListener('touchstart', onUserScroll, true)
          window.removeEventListener('blur', onFocusLoss)
          window.removeEventListener('focus', noteFocusReturn)
          document.removeEventListener('visibilitychange', onFocusLoss)
          if (window.__dshVim === api) delete window.__dshVim
        }
      })

      installSettings(ctx)
      installWindowCSS()
      installBoardCSS()
      // After the settings contribution, because the sidebar label and the page
      // share the vocabulary it registers.
      installBoardPage(ctx)
    }

    module.exports = { name: 'dsh-vim', inject: ['slots', 'locale'], apply: apply }
    return module.exports
  },
})
