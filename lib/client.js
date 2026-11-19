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

    /** Shipped defaults: d down, e up, space into the message box, f the task window, j the board. */
    var DEFAULTS = {
      downKey: 'd',
      upKey: 'e',
      focusKey: ' ',
      effortKey: 'q',
      modelKey: 'w',
      modelLevelKey: 'Tab',
      boardKey: 'j',
      noteKey: 'n',
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
      ['downKey', 'upKey', 'focusKey', 'effortKey', 'modelKey', 'boardKey', 'noteKey'],
      ['paletteKey', 'paletteRenameKey', 'paletteUpKey', 'paletteDownKey', 'paletteEnterKey', 'paletteStageKey', 'paletteArchiveKey'],
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
    var NUMERIC_SEATS = ['step', 'tau', 'repeatDelay', 'paletteFont', 'paletteWidth', 'paletteHeight', 'paletteRow']

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
     * The identity the sidebar entry and the main-panel page share.
     *
     * One string, used twice: the entry that selects the panel and the panel
     * it opens must agree, and the layout service resolves one from the other.
     */
    var BOARD_PANEL_ID = 'dsh-vim-board'

    /** The sentinel the inbox block answers to. */
    var BOARD_INBOX = '@inbox'

    /**
     * The canvas's panel geometry, in unzoomed pixels.
     *
     * A canvas needs a pitch it can pack by and a width every panel shares:
     * panels are laid out in that grid until the reader drags one somewhere
     * else, and the width is what makes a stack of cards readable rather than
     * a column of clipped titles. The body cap keeps a panel with fifty
     * conversations the same height as its neighbours — it scrolls inside
     * itself instead of pushing the canvas down.
     */
    var BOARD_BLOCK_W = 380
    var BOARD_BLOCK_H = 500
    var BOARD_BLOCK_GAP_X = 32
    var BOARD_BLOCK_GAP_Y = 32
    var BOARD_BLOCK_PITCH_X = BOARD_BLOCK_W + BOARD_BLOCK_GAP_X
    var BOARD_BLOCK_PITCH_Y = BOARD_BLOCK_H + BOARD_BLOCK_GAP_Y
    var BOARD_BLOCK_COLUMNS = 3
    var BOARD_BLOCK_BODY_MAX = 428
    var BOARD_CARD_W = 280
    var BOARD_CARD_H = 160
    var BOARD_CANVAS_EDGE = 28

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
      hintBoard: '按一次打开看板：一块一个今天动过的工作区，会话排在工作区下面，分叉用线连起来；空白处拖动平移画布，标题栏拖动移动工作区。再按一次回到对话。',
      note: '想法',
      hintNote: '在输入框外按一次，会在当前对话上弹出一行：写一句话，按 Enter 就把它钉在这个对话上。再按一次是改它，清空就是删掉。',
      notePlaceholder: '给这个对话钉一句话',
      noteNoSession: '先打开一个对话，再记想法',
      noteEdit: '点一下改这句',
      boardAddNote: '记一条想法',
      boardPageHint: '拖标题移动工作区 · 拖空白平移 · ＋卡片写想法 · 卡片拖到会话上连线，拖到「进入」上放进草稿',
      boardInbox: '收件箱',
      boardEmptyInbox: '没有落在工作区里的会话',
      boardEmptyBoard: '今天还没有动过的会话。写一张卡片，先把想法放在这里。',
      boardTodayCount: '今天 ',
      boardWorkspacesUnit: ' 个工作区 · ',
      boardSessionsUnit: ' 条会话',
      boardHint: 'Esc 关闭 · 拖标题移动工作区 · 拖空白平移 · 卡片拖到会话上连线，拖到「进入」上放进草稿',
      boardArrange: '整理',
      boardArrangeHint: '把所有块重新排成齐整的格子',
      boardAddCard: '＋ 卡片',
      boardAddCardHint: '在画布空白处写一条想法；也可以双击画布',
      boardZoomIn: '放大画布',
      boardZoomOut: '缩小画布',
      boardZoomReset: '恢复 100%',
      boardCardPlaceholder: '写点什么…',
      boardCardHint: '拖我换位置 · 拖到会话上连起来 · 拖到「进入」上放进草稿',
      boardCardRemove: '删掉这张卡片',
      boardDropFailed: '没找到输入框，卡片还留在看板上',
      boardCardEnter: '进入',
      boardCardEnterHint: '进入这个对话',
      boardCardRenameHint: '点一下改名',
      boardCardDone: '已完成',
      boardCardLinked: '已连到 ',
      boardCardLinkedUnknown: '已连到一条不在看板上的会话',
      boardCardUnlink: '断开',
      boardFork: '分叉',
      boardForkHint: '从这条会话开一条新分支',
      boardForkFailed: '没能分叉，请再试一次',
      boardForkUnavailable: '这个宿主没有提供分叉',
      boardForkSource: '分叉自 ',
      boardForkSourceUnknown: '分叉自一条不在看板上的会话',
      boardStar: '收藏这个对话',
      boardUnstar: '取消收藏',
      boardOnlyStarred: '★ 只看收藏',
      boardChatRemove: '把这个对话从看板上删掉',
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
      conflict: '同一组里的键不能重复：滚动、聚焦、推理、模型、看板是「下/上/聚焦/推理/模型/看板」，任务窗是「打开/重命名/上翻/下翻/切换/阶段」，模型窗是「模型/推理/上翻/下翻/换档位」；看板和任务窗是两个窗口，它们的键也不能相同',
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
      hintBoard: 'Press once to open the board: one panel per workspace in play today, its conversations stacked underneath, forks joined by a line. Drag the background to pan, a heading to move its panel; Escape or the key again goes back to the conversation.',
      note: 'Note',
      hintNote: 'Outside the message box, one line opens over the conversation you are in: type a thought, press Enter, and it is pinned to that conversation. Press again to edit it; empty it to take it away.',
      notePlaceholder: 'One line for this conversation',
      noteNoSession: 'Open a conversation first, then write it down',
      noteEdit: 'Click to edit',
      boardAddNote: 'Pin a note',
      boardPageHint: 'Drag a heading to move a panel · drag the background to pan · ＋ card to jot something down · drop a card on a conversation to link it, on Enter to make it a draft',
      boardInbox: 'Inbox',
      boardEmptyInbox: 'Nothing outside a workspace',
      boardEmptyBoard: 'Nothing has moved today. Write a card and leave a thought here.',
      boardTodayCount: 'Today ',
      boardWorkspacesUnit: ' workspace(s) · ',
      boardSessionsUnit: ' conversations',
      boardHint: 'Escape closes · drag a heading to move a panel · drag the background to pan · drop a card on a conversation to link it, on Enter to make it a draft',
      boardArrange: 'Tidy',
      boardArrangeHint: 'Lay every panel out on a clean grid again',
      boardAddCard: '+ Card',
      boardAddCardHint: 'Jot a thought on the canvas; a double click works too',
      boardZoomIn: 'Zoom in',
      boardZoomOut: 'Zoom out',
      boardZoomReset: 'Reset to 100%',
      boardCardPlaceholder: 'Write something…',
      boardCardHint: 'Drag to move · drop on a conversation to link it · drop on Enter to make it a draft',
      boardCardRemove: 'Delete this card',
      boardDropFailed: 'No message box to drop it in; the card is still here',
      boardCardEnter: 'Enter',
      boardCardEnterHint: 'Enter this conversation',
      boardCardRenameHint: 'Click to rename',
      boardCardDone: 'Done',
      boardCardLinked: 'Linked to ',
      boardCardLinkedUnknown: 'Linked to a conversation not on the board',
      boardCardUnlink: 'Unlink',
      boardFork: 'Fork',
      boardForkHint: 'Start a new branch from this conversation',
      boardForkFailed: 'The branch could not be made. Try again.',
      boardForkUnavailable: 'This host does not offer forking',
      boardForkSource: 'Forked from ',
      boardForkSourceUnknown: 'Forked from a conversation not on the board',
      boardStar: 'Mark this conversation',
      boardUnstar: 'Remove the mark',
      boardOnlyStarred: '★ Only marked',
      boardChatRemove: 'Delete this conversation from the board',
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
      conflict: 'Keys must be unique within a group: down/up/focus/reasoning/model/board for the page, open/rename/up/down/switch/stage for the task window, model/reasoning/up/down/level for the model window. The board and the task window are the two overlays, so their keys must differ as well',
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
      // say which model is in effect before you move. While that window is open
      // the key confirms, which is why it is answered before the window's own
      // routing below.
      if (key !== '' && key === settings.modelKey && !isEditable(ev.target)) {
        ev.preventDefault()
        if (!ev.repeat) {
          if (MODELPICK.open) confirmModelPick()
          else openModelPick()
        }
        return
      }

      if (MODELPICK.open) {
        // The picker owns the keyboard while it is open, the page's own scroll
        // keys included: `w`, `d`, `e`, `q` and Enter all mean something in here,
        // and a stray one must not reach the conversation behind it.
        if (modelPickKeyDown(ev, key)) {
          ev.preventDefault()
          return
        }
        // Anything it does not claim is swallowed rather than passed on: like
        // the task window, the point of being modal is that a press cannot do
        // two things at once.
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
      cardEditor: null,
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
      /** The headline's count readout, and its "only what is marked" toggle. */
      count: null,
      starFilter: null,
      /** The blocks of this repaint, in draw order, and what the inbox holds. */
      blocks: [],
      inbox: [],
      /** Every conversation drawn on this repaint, block by block. */
      rows: [],
      /** The conversation card elements of this repaint, in draw order. */
      nodes: [],
      /** The loose card elements of this repaint, by card id, for measuring lines. */
      looseNodes: Object.create(null),
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
      note: 'var(--dshv-board-note, rgba(250, 204, 21, 0.07))',
      noteEdge: 'var(--dshv-board-note-edge, rgba(250, 204, 21, 0.28))',
      noteSpine: 'var(--dshv-board-note-spine, #eab308)',
      input: 'var(--dshv-board-input, rgba(255, 255, 255, 0.08))',
      inputEdge: 'var(--dshv-board-input-edge, rgba(167, 139, 250, 0.5))',
      line: 'var(--dshv-board-line, rgba(255, 255, 255, 0.10))',
      accentOn: 'var(--dshv-board-accent-on, #12213a)',
    }

    /**
     * The canvas's own chrome.
     *
     * A sheet you pan, not a list you read: everything is sized so a title is
     * the thing the eye lands on, and the metadata under it stays legible
     * without leaning in. One base size on the mount, everything inside in em.
     */
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
      blockBody: {
        flex: '1',
        minHeight: '0',
        maxHeight: BOARD_BLOCK_BODY_MAX + 'px',
        overflowY: 'auto',
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
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '11px 12px',
        borderRadius: '10px',
        background: BOARD_INK.card,
        border: '1px solid ' + BOARD_INK.cardEdge,
        cursor: 'default',
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
        cursor: 'text',
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
        fontSize: '0.88em',
        lineHeight: '1.45',
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
      cardMetaDim: { opacity: '0.5' },
      /** The count and the marks, kept together at the far end of the line. */
      cardTail: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' },
      /**
       * The status chip, leading the meta line.
       *
       * Same seat it holds on the task window's rows — ahead of the name — and
       * the same three colours, so a card running a turn reads the same here as
       * it does there.
       */
      cardChip: { padding: '1px 7px', borderRadius: '5px', whiteSpace: 'nowrap', fontSize: '0.92em' },
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
      /** The card's two actions: the way in, and the way to branch. */
      cardActions: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' },
      cardEnter: {
        padding: '4px 14px',
        borderRadius: '8px',
        background: BOARD_INK.accentSoft,
        color: BOARD_INK.accent,
        fontSize: '0.84em',
        fontWeight: '600',
        lineHeight: '1.3',
        cursor: 'pointer',
        userSelect: 'none',
      },
      cardForkButton: {
        padding: '4px 10px',
        borderRadius: '8px',
        border: '1px solid ' + BOARD_INK.line,
        color: BOARD_INK.dim,
        fontSize: '0.82em',
        lineHeight: '1.3',
        cursor: 'pointer',
        userSelect: 'none',
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
        padding: '9px 12px 12px 14px',
        borderRadius: '11px',
        background: BOARD_INK.note,
        border: '1px solid ' + BOARD_INK.noteEdge,
        borderLeft: '3px solid ' + BOARD_INK.noteSpine,
        boxShadow: '0 14px 30px -20px rgba(60, 45, 10, 0.45), 0 1px 2px rgba(60, 45, 10, 0.06)',
      },
      /** The card being typed into: a ring, so the field is where the eye is. */
      looseEditing: {
        borderColor: BOARD_INK.accent,
        boxShadow: '0 0 0 2px ' + BOARD_INK.accentSoft + ', 0 12px 28px rgba(12, 16, 24, 0.16)',
      },
      looseHead: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'grab',
        userSelect: 'none',
      },
      /** A dotted grip: the one place the card is picked up, and it looks it. */
      looseGrip: {
        flex: '0 0 auto',
        width: '12px',
        height: '12px',
        borderRadius: '2px',
        color: BOARD_INK.dim,
        opacity: '0.55',
        cursor: 'grab',
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1.3px)',
        backgroundSize: '5px 5px',
      },
      looseLabel: {
        flex: '1 1 auto',
        minWidth: '0',
        fontSize: '0.7em',
        fontWeight: '600',
        letterSpacing: '0.12em',
        color: BOARD_INK.dim,
        opacity: '0.85',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
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
        color: BOARD_INK.dim,
        fontSize: '0.95em',
        lineHeight: '1',
        cursor: 'pointer',
      },
      looseText: {
        marginTop: '2px',
        fontSize: '0.93em',
        lineHeight: '1.65',
        color: BOARD_INK.text,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: '1.65em',
        maxHeight: '260px',
        overflowY: 'auto',
        cursor: 'text',
      },
      looseEditor: {
        marginTop: '2px',
        width: '100%',
        boxSizing: 'border-box',
        minHeight: '84px',
        maxHeight: '260px',
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
      /** A delivered card stays as a trace, quieter than the work it fed. */
      looseDone: { opacity: '0.58', filter: 'grayscale(0.45)' },
      /** The small word that says a card has already been handed over. */
      cardDoneTag: {
        flex: '0 0 auto',
        padding: '1px 6px',
        borderRadius: '999px',
        fontSize: '0.68em',
        letterSpacing: '0.04em',
        color: BOARD_INK.dim,
        border: '1px solid ' + BOARD_INK.line,
      },
      /** What a linked card is tied to, in its heading. */
      looseLink: {
        flex: '1 1 auto',
        minWidth: '0',
        fontSize: '0.76em',
        color: BOARD_INK.accent,
        opacity: '0.9',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
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
          zoom: 1,
        }
      }

      /** A finite number, or null when the stored value is not one. */
      function finite(value) {
        var number = Number(value)
        return isFinite(number) ? number : null
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
              })
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
        var folder = folders[row.id]
        var block
        if (folder && folder.id) {
          block = groups[folder.id]
          if (!block) {
            block = groups[folder.id] = {
              key: folder.id,
              label: folder.label,
              path: folder.path,
              kind: 'workspace',
              rows: [],
            }
            blocks.push(block)
          }
        } else {
          if (!inbox) {
            inbox = {
              key: BOARD_INBOX,
              label: paletteText('boardInbox'),
              path: '',
              kind: 'inbox',
              rows: [],
            }
          }
          block = inbox
        }
        block.rows.push(row)
      }
      if (!inbox) {
        inbox = {
          key: BOARD_INBOX,
          label: paletteText('boardInbox'),
          path: '',
          kind: 'inbox',
          rows: [],
        }
      }
      // The inbox is a place on the canvas even when it holds nothing, so the
      // reader always has somewhere to look for what a workspace did not claim.
      blocks.push(inbox)
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
      var added = BOARD_STORE.rememberFork(String(childId), String(parentId))
      if (added && BOARD.open && !BOARD.noteEditing) renderBoard()
      return added
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
     * @returns {object} block key -> `{x, y}`.
     */
    function boardPlaces(blocks) {
      var stored = BOARD_STORE.blocks()
      var places = Object.create(null)
      var i
      for (i = 0; i < blocks.length; i++) {
        var known = stored[blocks[i].key]
        if (known) places[blocks[i].key] = { x: known.x, y: known.y }
      }
      for (i = 0; i < blocks.length; i++) {
        if (places[blocks[i].key]) continue
        var place = firstFreeSlot(places)
        BOARD_STORE.placeBlock(blocks[i].key, place.x, place.y)
        places[blocks[i].key] = place
      }
      return places
    }

    /** The first grid slot no block already stands on. */
    function firstFreeSlot(places) {
      for (var cursor = 0; cursor < 400; cursor++) {
        var column = cursor % BOARD_BLOCK_COLUMNS
        var row = Math.floor(cursor / BOARD_BLOCK_COLUMNS)
        var x = BOARD_CANVAS_EDGE + column * BOARD_BLOCK_PITCH_X
        var y = BOARD_CANVAS_EDGE + row * BOARD_BLOCK_PITCH_Y
        if (!slotTaken(places, x, y)) return { x: x, y: y }
      }
      return { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
    }

    /** Whether a block already stands within one block's width and height of a place. */
    function slotTaken(places, x, y) {
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        var place = places[key]
        if (Math.abs(place.x - x) < BOARD_BLOCK_W && Math.abs(place.y - y) < BOARD_BLOCK_H) return true
      }
      return false
    }

    /**
     * How big the stage has to be to hold everything on it.
     *
     * Read off the stored places rather than the painted boxes: the boxes have
     * not been laid out yet when this runs, and a canvas whose bounds depended
     * on a measurement would jitter while a panel was being dragged.
     * @param {object} places - block key -> `{x, y}`.
     * @returns {{width: number, height: number}} the stage, in pixels.
     */
    function boardExtent(places) {
      var width = 720
      var height = 520
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        var place = places[key]
        width = Math.max(width, place.x + BOARD_BLOCK_W + BOARD_CANVAS_EDGE)
        height = Math.max(height, place.y + BOARD_BLOCK_H + BOARD_CANVAS_EDGE)
      }
      var cards = BOARD_STORE.cards()
      for (var i = 0; i < cards.length; i++) {
        width = Math.max(width, cards[i].x + BOARD_CARD_W + BOARD_CANVAS_EDGE)
        height = Math.max(height, cards[i].y + BOARD_CARD_H + BOARD_CANVAS_EDGE)
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
     * not land on top of the work they are looking at.
     * @returns {{x: number, y: number}} the place.
     */
    function nextCardPlace() {
      var bottom = 0
      var places = BOARD_STORE.blocks()
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        bottom = Math.max(bottom, places[key].y + BOARD_BLOCK_H)
      }
      var cards = BOARD_STORE.cards()
      for (var i = 0; i < cards.length; i++) {
        bottom = Math.max(bottom, cards[i].y + BOARD_CARD_H)
      }
      return {
        x: BOARD_CANVAS_EDGE,
        y: bottom ? bottom + BOARD_BLOCK_GAP_Y : BOARD_CANVAS_EDGE,
      }
    }

    /**
     * Put every panel back on the grid, in the order they are drawn.
     *
     * The loose cards are left where the reader put them: tidying the panels is
     * about the work, not about the thoughts pinned beside it. A reader who has
     * dragged everything into a heap can get the canvas back without losing what
     * is on it.
     * @returns {void}
     */
    function arrangeBoard() {
      var blocks = BOARD.blocks.length ? BOARD.blocks : boardBlocks(conversationPool())
      var x = BOARD_CANVAS_EDGE
      var y = BOARD_CANVAS_EDGE
      var column = 0
      for (var i = 0; i < blocks.length; i++) {
        BOARD_STORE.placeBlock(blocks[i].key, x, y)
        column = column + 1
        if (column >= BOARD_BLOCK_COLUMNS) {
          column = 0
          x = BOARD_CANVAS_EDGE
          y = y + BOARD_BLOCK_PITCH_Y
        } else {
          x = x + BOARD_BLOCK_PITCH_X
        }
      }
      renderBoard()
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
      arrange.setAttribute('data-role', 'arrangeBoard')
      arrange.setAttribute('title', paletteText('boardArrangeHint'))
      arrange.textContent = paletteText('boardArrange')
      arrange.addEventListener('click', function () {
        arrangeBoard()
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
      header.appendChild(title)
      header.appendChild(count)
      header.appendChild(only)
      header.appendChild(zoom)
      header.appendChild(arrange)
      header.appendChild(write)

      var body = document.createElement('div')
      Object.assign(body.style, mode === 'page' ? BOARD_PAGE_UI.body : BOARD_UI.body)
      body.setAttribute('data-role', 'boardCanvas')
      body.addEventListener('pointerdown', boardCanvasDown)
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
      renderBoard()

      // Both feeds can change under an open board: a conversation can be
      // touched, archived or created while the board is up. The status feed
      // goes through the throttled repaint, because it can tick often while a
      // turn streams and a tick that changed no card's word is not a repaint.
      var services = taskServices()
      // A repaint that arrived by itself must not take the card the reader is
      // typing into out from under them: the field is rebuilt with the card,
      // so a feed tick during a sentence would cost the sentence. Confirming or
      // leaving the field clears the state, and the next tick repaints.
      if (typeof services.list.subscribe === 'function') {
        BOARD.unsubscribes.push(services.list.subscribe(function () {
          if (!BOARD.noteEditing && !BOARD.cardEditing && !BOARD.renamingCard) renderBoard()
        }))
      }
      if (services.workspaces && typeof services.workspaces.subscribe === 'function') {
        BOARD.unsubscribes.push(services.workspaces.subscribe(function () {
          if (!BOARD.noteEditing && !BOARD.cardEditing && !BOARD.renamingCard) renderBoard()
        }))
      }
      if (services.status && typeof services.status.subscribe === 'function') {
        BOARD.unsubscribes.push(services.status.subscribe(function () {
          if (!BOARD.noteEditing && !BOARD.cardEditing && !BOARD.renamingCard) renderBoardOnStatus()
        }))
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
      BOARD.glide = ''
      BOARD.count = null
      BOARD.inbox = []
      BOARD.blocks = []
      BOARD.nodes = []
      BOARD.folders = Object.create(null)
      // The "only marked" view is a way of reading the board for a moment, not
      // a setting: the next opening starts from everything.
      BOARD.onlyStarred = false
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
    function renderBoard() {
      if (!BOARD.open || !BOARD.body || !BOARD.stage) return
      // A repaint mid-gesture would take the panel out from under the pointer.
      if (BOARD.drag || BOARD.glide) return
      // A card being typed into is rebuilt with the rest, so what it says is
      // folded into the store first. Typing also writes on every input, so this
      // is only the last keystroke that had not landed yet.
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
      }
      BOARD.stage.textContent = ''
      BOARD.nodes = []
      BOARD.looseNodes = Object.create(null)
      BOARD.lines = []
      BOARD.noteEditor = null
      BOARD.cardEditor = null
      BOARD.clocks = []
      BOARD.folders = folderIndex()
      var pool = conversationPool()
      var blocks = boardBlocks(pool)
      var places = boardPlaces(blocks)
      var extent = boardExtent(places)
      BOARD.extent = extent
      applyBoardZoom()
      BOARD.blocks = blocks
      BOARD.rows = []
      var workspaces = 0
      var i
      for (i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === 'workspace') workspaces = workspaces + 1
        BOARD.rows = BOARD.rows.concat(blocks[i].rows)
      }
      BOARD.inbox = blocks.length ? blocks[blocks.length - 1].rows.slice() : []
      var titles = Object.create(null)
      for (i = 0; i < pool.length; i++) titles[pool[i].id] = pool[i].displayTitle || pool[i].id
      // The links live under everything else, on one SVG sheet the size of the
      // paper. A note can be dragged across the canvas without a repaint; only
      // the paths are rewritten.
      BOARD.linkLayer = null
      if (typeof document.createElementNS === 'function') {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('data-role', 'boardLinks')
        svg.setAttribute('width', String(extent.width))
        svg.setAttribute('height', String(extent.height))
        Object.assign(svg.style, BOARD_UI.linkLayer)
        BOARD.stage.appendChild(svg)
        BOARD.linkLayer = svg
      }
      for (i = 0; i < blocks.length; i++) {
        BOARD.stage.appendChild(buildBoardBlock(blocks[i], places[blocks[i].key], titles))
      }
      var cards = BOARD_STORE.cards()
      for (i = 0; i < cards.length; i++) {
        BOARD.stage.appendChild(buildBoardLooseCard(cards[i], titles))
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
          var end = String(BOARD.cardEditor.value || '').length
          BOARD.cardEditor.setSelectionRange(end, end)
        }
      }
      if (BOARD.renamingCard && BOARD.renameCardInput) {
        BOARD.renameCardInput.focus()
        if (typeof BOARD.renameCardInput.select === 'function') BOARD.renameCardInput.select()
      }
      // Last, because it measures what was just put on the page.
      drawCardLinks()
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
    function workspaceHue(label) {
      var text = String(label || '')
      var hash = 0
      for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360
      return hash
    }

    function buildBoardBlock(block, place, titles) {
      var node = document.createElement('div')
      Object.assign(node.style, BOARD_UI.block)
      node.className = 'dshv-block'
      node.style.left = place.x + 'px'
      node.style.top = place.y + 'px'
      node.style.width = BOARD_BLOCK_W + 'px'
      node.setAttribute('data-role', 'workspaceBlock')
      node.setAttribute('data-block', block.key)
      var folded = BOARD_STORE.isFolded(block.key)

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.blockHead)
      head.className = 'dshv-panel-head'
      head.setAttribute('data-role', 'blockHead')
      head.setAttribute('title', block.path || block.label)
      var caret = document.createElement('span')
      Object.assign(caret.style, BOARD_UI.blockCaret)
      caret.textContent = folded ? '▸' : '▾'
      var dot = document.createElement('span')
      Object.assign(dot.style, BOARD_UI.blockDot)
      dot.style.background = block.kind === 'inbox'
        ? BOARD_INK.dim
        : 'hsl(' + workspaceHue(block.label) + ' 46% 56%)'
      var name = document.createElement('span')
      Object.assign(name.style, BOARD_UI.blockName)
      name.setAttribute('data-role', 'blockName')
      name.textContent = block.label
      // Only the name: the path is on the heading's tooltip, where a reader who
      // wants it can find it, rather than taking half the line on every panel.
      var count = document.createElement('span')
      Object.assign(count.style, BOARD_UI.blockCount)
      count.textContent = String(block.rows.length)
      head.appendChild(caret)
      head.appendChild(dot)
      head.appendChild(name)
      head.appendChild(count)
      head.addEventListener('pointerdown', function (ev) {
        boardBlockDown(block.key, node, ev)
      })
      head.addEventListener('click', function () {
        // A heading that was dragged is not a heading that was pressed.
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.toggleBlockFold(block.key)
        renderBoard()
      })
      node.appendChild(head)

      if (!folded) {
        var body = document.createElement('div')
        Object.assign(body.style, BOARD_UI.blockBody)
        body.setAttribute('data-role', 'blockBody')
        // A panel's conversations scroll inside it, which moves the cards
        // without a repaint; the lines that point at them have to be measured
        // again, or they would point at where a card used to be.
        body.addEventListener('scroll', function () {
          if (BOARD.open) drawCardLinks()
        })
        if (!block.rows.length) {
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
     * One conversation on the board: its name, what it is doing, and the
     * buttons that act on it.
     *
     * Opening is a button of its own, not a press anywhere on the card: the
     * name is where renaming happens, and a card that took you away whenever
     * the pointer landed a few pixels off is a card you learn to be afraid of.
     * Everything here stops its press from doing anything else, and nothing
     * opens a conversation except the 进入 button.
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
      var turns = BOARD_TURNS.read(summary)
      var name = summary.displayTitle || summary.id

      if (BOARD.renamingCard === summary.id) {
        var field = document.createElement('input')
        Object.assign(field.style, BOARD_UI.cardRenameBox)
        field.setAttribute('type', 'text')
        field.setAttribute('data-role', 'cardRename')
        field.setAttribute('aria-label', paletteText('rename'))
        field.value = name
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
        card.appendChild(field)
        BOARD.renameCardInput = field
      } else {
        var title = document.createElement('div')
        Object.assign(title.style, BOARD_UI.cardTitle)
        title.setAttribute('data-role', 'cardTitle')
        title.setAttribute('title', paletteText('boardCardRenameHint'))
        title.textContent = name
        // A press on the name is the way into renaming, the same gesture the
        // sidebar uses on its own rows. It stays on the card.
        title.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          beginBoardRename(summary.id)
        })
        card.appendChild(title)
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
        card.appendChild(source)
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
        card.appendChild(editor)
        BOARD.noteEditor = editor
      } else if (pinned) {
        var noteLine = document.createElement('div')
        Object.assign(noteLine.style, BOARD_UI.cardNote)
        noteLine.setAttribute('data-role', 'note')
        noteLine.setAttribute('title', paletteText('noteEdit'))
        noteLine.textContent = pinned
        noteLine.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          beginBoardNote(summary.id)
        })
        card.appendChild(noteLine)
      }

      var meta = document.createElement('div')
      Object.assign(meta.style, BOARD_UI.cardMeta)
      // The state chip leads the meta line, the seat it holds on the task
      // window's rows: the eye reads what the conversation is doing before it
      // reads which conversation it is. The clock rides in the chip exactly as
      // it does there, updated in place by the board's own tick.
      var status = statusOf(summary)
      if (status) {
        var chip = document.createElement('span')
        Object.assign(
          chip.style,
          BOARD_UI.cardChip,
          BOARD_UI['cardChip' + status.key[0].toUpperCase() + status.key.slice(1)]
        )
        chip.setAttribute('data-role', 'status')
        var since = statusIsLive(status) ? runSince(summary.id) : 0
        var elapsed = since ? elapsedText(Date.now() - since) : ''
        chip.textContent = elapsed ? status.text + ' · ' + elapsed : status.text
        chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : status.text)
        meta.appendChild(chip)
        if (since) BOARD.clocks.push({ chip: chip, label: status.text, since: since })
      }
      var when = document.createElement('span')
      Object.assign(when.style, BOARD_UI.cardMetaDim)
      when.setAttribute('data-role', 'when')
      when.textContent = relativeTime(summary.updatedAt)
      meta.appendChild(when)

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
        removeBoardCard(summary)
      })
      tail.appendChild(drop)
      meta.appendChild(tail)
      card.appendChild(meta)

      // The two things a card is for. 进入 is the only way into the
      // conversation; 分叉 starts a branch and leaves the board where it is.
      var actions = document.createElement('div')
      Object.assign(actions.style, BOARD_UI.cardActions)
      actions.className = 'dshv-actions'
      var enter = document.createElement('span')
      Object.assign(enter.style, BOARD_UI.cardEnter)
      enter.className = 'dshv-enter'
      enter.setAttribute('role', 'button')
      enter.setAttribute('data-role', 'cardEnter')
      enter.setAttribute('title', paletteText('boardCardEnterHint'))
      enter.textContent = paletteText('boardCardEnter')
      enter.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        activateSession(summary.id)
      })
      actions.appendChild(enter)
      var fork = document.createElement('span')
      Object.assign(fork.style, BOARD_UI.cardForkButton)
      fork.setAttribute('role', 'button')
      fork.setAttribute('data-role', 'cardFork')
      fork.setAttribute('title', paletteText('boardForkHint'))
      fork.textContent = paletteText('boardFork')
      fork.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        forkBoardCard(summary)
      })
      actions.appendChild(fork)
      card.appendChild(actions)

      BOARD.nodes.push(card)
      return card
    }

    /**
     * Start renaming one conversation from its card.
     * @param {string} id - session id.
     * @returns {void}
     */
    function beginBoardRename(id) {
      BOARD.renamingCard = id
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
      renameSession(id, title, function (reason) {
        if (reason) showToast(reason)
        if (BOARD.open) renderBoard()
      })
      renderBoard()
      return true
    }

    /** Throw the open name field away, leaving the conversation as it was. */
    function cancelBoardRename() {
      if (!BOARD.renamingCard) return false
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
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
      var result
      try {
        result = controller.fork({ sessionId: summary.id, increaseTitle: true })
      } catch (error) {
        console.warn('[dsh-vim] fork failed', error)
        showToast(paletteText('boardForkFailed'))
        return
      }
      Promise.resolve(result).then(function (childId) {
        rememberFork(summary.id, childId)
        if (BOARD.open) renderBoard()
      }, function (error) {
        console.warn('[dsh-vim] fork failed', error)
        showToast(paletteText('boardForkFailed'))
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
      node.style.left = card.x + 'px'
      node.style.top = card.y + 'px'
      node.style.width = BOARD_CARD_W + 'px'
      node.setAttribute('data-role', 'looseCard')
      node.setAttribute('data-card-id', card.id)
      if (card.done) node.setAttribute('data-done', 'true')

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.looseHead)
      head.className = 'dshv-note-head'
      var grip = document.createElement('span')
      Object.assign(grip.style, BOARD_UI.looseGrip)
      grip.className = 'dshv-grip'
      grip.setAttribute('data-role', 'cardGrip')
      grip.setAttribute('title', paletteText('boardCardHint'))
      grip.textContent = '⠿'
      var label = document.createElement('span')
      var parentTitle = card.link ? titles[card.link] || '' : ''
      if (card.link) {
        Object.assign(label.style, BOARD_UI.looseLink)
        label.setAttribute('data-role', 'cardLinkLabel')
        label.textContent = parentTitle
          ? paletteText('boardCardLinked') + parentTitle
          : paletteText('boardCardLinkedUnknown')
        label.setAttribute('title', parentTitle || paletteText('boardCardLinkedUnknown'))
      } else {
        Object.assign(label.style, BOARD_UI.looseLabel)
        label.textContent = paletteText('note')
      }
      var unlink = null
      if (card.link) {
        unlink = document.createElement('span')
        Object.assign(unlink.style, BOARD_UI.looseUnlink)
        unlink.setAttribute('data-role', 'cardUnlink')
        unlink.setAttribute('title', paletteText('boardCardUnlink'))
        unlink.textContent = paletteText('boardCardUnlink')
        unlink.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          BOARD_STORE.unlinkCard(card.id)
          renderBoard()
        })
      }
      var done = null
      if (card.done) {
        done = document.createElement('span')
        Object.assign(done.style, BOARD_UI.cardDoneTag)
        done.setAttribute('data-role', 'cardDone')
        done.textContent = paletteText('boardCardDone')
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
      head.appendChild(grip)
      head.appendChild(label)
      if (done) head.appendChild(done)
      if (unlink) head.appendChild(unlink)
      head.appendChild(remove)
      head.addEventListener('pointerdown', function (ev) {
        if (ev && (ev.target === remove || ev.target === unlink)) return
        boardCardDown(card.id, node, ev)
      })
      node.appendChild(head)
      BOARD.looseNodes[card.id] = node

      if (BOARD.cardEditing === card.id) {
        var editor = document.createElement('textarea')
        Object.assign(editor.style, BOARD_UI.looseEditor)
        editor.setAttribute('data-role', 'cardText')
        editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
        editor.setAttribute('placeholder', paletteText('boardCardPlaceholder'))
        editor.setAttribute('rows', '4')
        editor.value = card.text
        editor.addEventListener('input', function () {
          BOARD_STORE.setCardText(card.id, editor.value)
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
        editor.addEventListener('pointerdown', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        })
        node.appendChild(editor)
        BOARD.cardEditor = editor
      } else {
        var text = document.createElement('div')
        Object.assign(text.style, BOARD_UI.looseText)
        text.setAttribute('data-role', 'looseText')
        if (card.text) {
          text.textContent = card.text
        } else {
          text.textContent = paletteText('boardCardPlaceholder')
          text.style.opacity = '0.4'
        }
        text.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          beginBoardCard(card.id)
        })
        node.appendChild(text)
      }
      return node
    }

    /** Start typing into one loose card. */
    function beginBoardCard(id) {
      BOARD.cardEditing = id
      renderBoard()
    }

    /** Keep what the open field says, and close it. */
    function commitBoardCard() {
      if (!BOARD.cardEditing) return false
      var editor = BOARD.cardEditor
      var id = BOARD.cardEditing
      BOARD.cardEditing = ''
      BOARD.cardEditor = null
      if (editor) BOARD_STORE.setCardText(id, editor.value)
      renderBoard()
      return true
    }

    /** Throw the open field away, leaving the card as it was last written. */
    function cancelBoardCard() {
      if (!BOARD.cardEditing) return false
      BOARD.cardEditing = ''
      BOARD.cardEditor = null
      renderBoard()
      return true
    }

    /**
     * Write a new card at a place, and start typing in it.
     * @param {number} x - canvas coordinate.
     * @param {number} y - canvas coordinate.
     * @returns {string} the card's id.
     */
    function addBoardCardAt(x, y) {
      var id = BOARD_STORE.addCard(x, y)
      BOARD.cardEditing = id
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
            y: (Number(viewport.scrollTop) || 0) + Math.max(24, (height - 160) / 2),
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
      BOARD_STORE.removeCard(id)
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
      BOARD_STORE.mute(summary.id, summary.updatedAt)
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
    function boardBlockDown(key, node, ev) {
      if (!ev || (ev.button !== undefined && ev.button !== 0)) return
      if (BOARD.drag) return
      var places = BOARD_STORE.blocks()
      var place = places[key]
      if (!place) return
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      // Everything tied to a conversation on this panel is part of the panel
      // while it moves: the notes are pinned around this work, not around the
      // paper, so they keep their place relative to it.
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
      BOARD.dragged = false
      BOARD.drag = {
        kind: 'block',
        key: key,
        node: node,
        carry: carry,
        fromX: Number(ev.clientX) || 0,
        fromY: Number(ev.clientY) || 0,
        baseX: place.x,
        baseY: place.y,
        x: place.x,
        y: place.y,
        moved: false,
      }
      window.addEventListener('pointermove', onBoardMove, true)
      window.addEventListener('pointerup', onBoardUp, true)
    }

    /**
     * A press on a loose card's heading: the same drag, with a card's own place.
     * @param {string} id - the card's id.
     * @param {Element} node - the card element.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function boardCardDown(id, node, ev) {
      if (!ev || (ev.button !== undefined && ev.button !== 0)) return
      if (BOARD.drag) return
      var cards = BOARD_STORE.cards()
      var found = null
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].id === id) found = cards[i]
      }
      if (!found) return
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      BOARD.dragged = false
      BOARD.drag = {
        kind: 'card',
        key: id,
        node: node,
        fromX: Number(ev.clientX) || 0,
        fromY: Number(ev.clientY) || 0,
        baseX: found.x,
        baseY: found.y,
        x: found.x,
        y: found.y,
        moved: false,
      }
      window.addEventListener('pointermove', onBoardMove, true)
      window.addEventListener('pointerup', onBoardUp, true)
    }

    /**
     * A press on the canvas itself: grab the paper and move it under the eye.
     *
     * This is the pan, not a drag of anything on the paper: the scroll offset is
     * what changes, so the panels keep their positions and the board stays a
     * canvas rather than a free-floating pile.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function boardCanvasDown(ev) {
      if (!ev || (ev.button !== undefined && ev.button !== 0)) return
      if (BOARD.drag || !BOARD.body) return
      BOARD.dragged = false
      BOARD.drag = {
        kind: 'pan',
        fromX: Number(ev.clientX) || 0,
        fromY: Number(ev.clientY) || 0,
        scrollLeft: Number(BOARD.body.scrollLeft) || 0,
        scrollTop: Number(BOARD.body.scrollTop) || 0,
        moved: false,
      }
      window.addEventListener('pointermove', onBoardMove, true)
      window.addEventListener('pointerup', onBoardUp, true)
    }

    /** Follow the pointer: pan the paper, or carry the panel or card it holds. */
    function onBoardMove(ev) {
      var drag = BOARD.drag
      if (!drag) return
      var x = Number(ev.clientX) || 0
      var y = Number(ev.clientY) || 0
      if (!drag.moved) {
        if (Math.abs(x - drag.fromX) < BOARD_SLOP && Math.abs(y - drag.fromY) < BOARD_SLOP) return
        drag.moved = true
        // From here the page must not start selecting text under the pointer.
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        if (drag.node) drag.node.style.cursor = 'grabbing'
        if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = 'grabbing'
      }
      if (drag.kind === 'pan') {
        if (!BOARD.body) return
        BOARD.body.scrollLeft = Math.max(0, drag.scrollLeft - (x - drag.fromX))
        BOARD.body.scrollTop = Math.max(0, drag.scrollTop - (y - drag.fromY))
        return
      }
      drag.lastX = x
      drag.lastY = y
      // The card must not answer the hit test under its own pointer: what the
      // reader is aiming at is the conversation beneath it.
      drag.node.style.pointerEvents = 'none'
      // A pointer travels screen pixels; the stage is scaled. One pixel of the
      // hand is one over `zoom` pixels of paper.
      var zoom = BOARD.zoom || 1
      var dx = (x - drag.fromX) / zoom
      var dy = (y - drag.fromY) / zoom
      drag.x = Math.max(0, drag.baseX + dx)
      drag.y = Math.max(0, drag.baseY + dy)
      drag.node.style.left = drag.x + 'px'
      drag.node.style.top = drag.y + 'px'
      drag.node.style.zIndex = '30'
      drag.node.style.transform = 'scale(1.012)'
      // The notes tied to this panel's conversations travel with it: a panel is
      // a place, and the annotations pinned around it belong to that place.
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
      // Live, not after the drop: a tie that only catches up when the hand lets
      // go reads as a rubber band drawn by someone else.
      drawCardLinks()
    }

    /** Let go: write down where it landed, unless the press never moved. */
    function onBoardUp() {
      var drag = BOARD.drag
      if (!drag) return
      var moved = drag.moved
      var kind = drag.kind
      var key = drag.key
      var x = drag.x
      var y = drag.y
      // A loose card can land on two different things, and they mean different
      // things: the 进入 button hands the words to that conversation, while the
      // card around it only ties the note to the work. The drop is read before
      // the gesture is torn down, and the carried card is out of the hit test so
      // this is what is underneath it.
      var droppedOn = ''
      var byEnter = false
      if (moved && kind === 'card' && drag.lastX !== undefined
        && typeof document.elementFromPoint === 'function') {
        try {
          var under = document.elementFromPoint(drag.lastX, drag.lastY)
          if (under && typeof under.closest === 'function') {
            byEnter = under.closest('[data-role="cardEnter"]') !== null
            var holder = under.closest('[data-session-id]')
            if (holder) droppedOn = holder.getAttribute('data-session-id') || ''
          }
        } catch (error) {
          droppedOn = ''
          byEnter = false
        }
      }
      endBoardDrag()
      // A press that never moved is a click, and the click is still on its way:
      // the browser dispatches it to the element that was pressed, so repainting
      // here would replace that element and the click would land on nothing.
      if (!moved) return
      BOARD.dragged = true
      if (kind === 'block') {
        BOARD_STORE.placeBlock(key, x, y)
        var carried = drag.carry || []
        for (var c = 0; c < carried.length; c++) {
          if (typeof carried[c].nx !== 'number') continue
          BOARD_STORE.moveCard(carried[c].id, carried[c].nx, carried[c].ny)
        }
        renderBoard()
        return
      }
      if (kind !== 'card') return
      if (droppedOn) {
        var cards = BOARD_STORE.cards()
        var held = null
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].id === key) held = cards[i]
        }
        var text = held ? String(held.text || '').trim() : ''
        if (byEnter) {
          // The button is the deliberate target: it means "take this into that
          // conversation", and it is specific enough not to need a question.
          // The place is measured before the conversation opens, because that
          // unmounts the board and there is nothing left to measure afterwards.
          var beside = snappedCardPlace(droppedOn, key)
          if (beside) BOARD_STORE.moveCard(key, beside.x, beside.y)
          if (text) {
            BOARD_STORE.linkCard(key, droppedOn)
            handCardToSession(key, droppedOn, text)
          } else {
            activateSession(droppedOn)
          }
          return
        }
        // Anywhere else on the card is the gentler claim: the note belongs
        // beside this work, so it is tied to it and glided next to it — nothing
        // opens, and nothing is sent.
        BOARD_STORE.moveCard(key, x, y)
        BOARD_STORE.linkCard(key, droppedOn)
        renderBoard()
        var rail = snappedCardPlace(droppedOn, key)
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
     * card and says so.
     * @param {string} cardId - the card.
     * @param {string} sessionId - the conversation it was dropped on.
     * @param {string} text - what the card says.
     * @returns {void}
     */
    function handCardToSession(cardId, sessionId, text) {
      dropCardIntoComposer(text, sessionId, function () {
        BOARD_STORE.finishCard(cardId, sessionId)
        if (BOARD.open) renderBoard()
      }, function () {
        if (BOARD.open) renderBoard()
        showToast(paletteText('boardDropFailed'))
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
        x: Math.max(0, (aside.right - stageRect.left) / zoom + 48),
        y: Math.max(0, ((bottom ? bottom + 12 : rect.top) - stageRect.top) / zoom),
      }
    }

    /**
     * Draw the line from every linked card to the conversation it belongs to.
     *
     * Measured after the paint rather than computed from the model: a
     * conversation card's place is the block's layout, its scroll and its
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
      if (drag.node) {
        drag.node.style.zIndex = ''
        drag.node.style.cursor = ''
        drag.node.style.pointerEvents = ''
        drag.node.style.transform = ''
      }
      if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = ''
      BOARD.drag = null
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

      return {
        /** Say one thing for a moment, replacing whatever was there. */
        say(text, ttl, after) {
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
          el.textContent = text
          if (!host.parentNode) document.body.appendChild(host)
          if (!el.parentNode) host.appendChild(el)
          this.place()
          if (timer) window.clearTimeout(timer)
          timer = window.setTimeout(after, ttl)
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
          if (timer) {
            window.clearTimeout(timer)
            timer = 0
          }
          if (el && el.parentNode) el.parentNode.removeChild(el)
          if (host && host.parentNode) host.parentNode.removeChild(host)
          el = null
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
     * @returns {boolean} whether the window is now open.
     */
    function openModelWindow(entries, selection, level, chosen, groups) {
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
      MODELPICK.open = true

      var host = document.createElement('div')
      Object.assign(host.style, MODELPICK_UI.backdrop)
      var panel = document.createElement('div')
      Object.assign(panel.style, MODELPICK_UI.panel)
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', paletteText('modelPick'))
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
        '.dshv-note{transition:box-shadow .18s ease,border-color .18s ease;}',
        '.dshv-note:hover{box-shadow:0 18px 34px -20px rgba(60,45,10,.45),0 1px 2px rgba(60,45,10,.06);}',
        '.dshv-enter{transition:background .16s ease,color .16s ease;}',
        '.dshv-enter:hover{background:var(--dshv-board-accent,rgba(79,124,255,.9));color:var(--dshv-board-accent-on,#fff);}',
        '.dshv-panel-head,.dshv-note-head{cursor:grab;}',
        '.dshv-block:active .dshv-panel-head,.dshv-note:active .dshv-note-head{cursor:grabbing;}',
        '.dshv-grip{opacity:.55;transition:opacity .16s ease;}',
        '.dshv-note:hover .dshv-grip{opacity:.9;}',
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
          window.removeEventListener('wheel', onUserScroll, true)
          window.removeEventListener('touchstart', onUserScroll, true)
          window.removeEventListener('blur', onFocusLoss)
          window.removeEventListener('focus', noteFocusReturn)
          document.removeEventListener('visibilitychange', onFocusLoss)
          if (window.__dshVim === api) delete window.__dshVim
        }
      })

      installSettings(ctx)
      installBoardCSS()
      // After the settings contribution, because the sidebar label and the page
      // share the vocabulary it registers.
      installBoardPage(ctx)
    }

    module.exports = { name: 'dsh-vim', inject: ['slots', 'locale'], apply: apply }
    return module.exports
  },
})
