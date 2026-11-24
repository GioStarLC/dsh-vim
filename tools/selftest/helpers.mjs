/**

 * Shared helpers for the behaviour suites: seeding the fake host, reading

 * what the board and the windows drew, and the gestures a check makes.

 * Every suite imports this before its own checks.

 */
import assert from 'node:assert/strict'
import { now, clock, el, arrivedRows, transcript, sidebar, composer, button, body, editor, synthKeys, record, fire, fireOn, clickThrough, press, stored, fakeDatabases, fakeWindow, menu, aimAt, resetHitTest, ReactStub, settingsElements, feed, registry, currentBinding, MODEL, REASONING, ctx, keydown, tap, expectedLabel, checks, reset, check } from './harness.mjs'




/**
 * Arm the double-Enter mode with a draft in the box and the caret in it, which
 * is the state every one of these checks starts from.
 * @param {string} [draft] - what the box holds.
 * @returns {void}
 */
function armDoubleEnter(draft = 'a message') {
  fakeWindow.__dshVim.update({ sendMode: 'double' })
  tap(' ')
  editor.textContent = draft
  synthKeys.length = 0
}

/**
 * Render the registered composer-dock component and return what it produced:
 * the element it made, or null when it chose to render nothing.
 * @returns {object|null} the rendered element.
 */
function renderSendHint() {
  const dock = (ctx.log.slots['conversation.composer.dock'] ?? [])[0]
  if (!dock) {
    throw new Error(
      'the composer dock slot was never registered; injected=' +
        JSON.stringify(ctx.log.injected) +
        ' slots=' +
        JSON.stringify(Object.keys(ctx.log.slots))
    )
  }
  ReactStub.reset()
  const out = dock.component({ t: (k) => k })
  return out === null || out === undefined ? null : out
}

/**
 * The send-key line as text, or null when the component renders nothing.
 * @returns {string|null} the line.
 */
function sendHintText() {
  const out = renderSendHint()
  if (out === null) return null
  // The stub keeps children beside props rather than inside them, the way a
  // real element carries them.
  return out.children.join('')
}

/**
 * Publish a catalogue of conversations, oldest-first in the id list so the
 * ordering assertion has to come from updatedAt rather than from insertion.
 * @param {Array<object>} rows - summaries; updatedAt decides the order.
 */
function seed(rows) {
  const byId = {}
  const ids = []
  for (const row of rows) {
    byId[row.id] = row
    ids.push(row.id)
  }
  feed.publish(ids, byId)
}

const HOUR = 60 * 60 * 1000

/**
 * A timestamp the given number of hours in the past.
 * @param {number} hours - how far back.

 * @returns {number} epoch milliseconds.
 */
function ago(hours) {
  return Date.now() - hours * HOUR
}

/** The header's "loaded / total" readout of the mounted window. */
function headerCount() {
  const host = body.children[body.children.length - 1]
  return host.children[0].children[0].children[1].textContent
}

/** Everything the mounted window's list holds, rows and block headings alike. */
function listNodes() {
  const host = body.children[body.children.length - 1]
  if (!host || !host.children[0]) return []
  const list = host.children[0].children[1]
  return list ? list.children : []
}

/**
 * The mounted window's conversation rows, in order.
 *
 * Block headings sit between the rows they label, so they are filtered out
 * here: every check about "the rows" means the conversations, and the
 * selection counts conversations too. A row is told apart from a heading by
 * carrying the session id it stands for — a heading stands for no session.
 */
function rowNodes() {
  return listNodes().filter((node) => node.__attrs['data-session-id'] !== undefined)
}

/**
 * The block headings of the mounted window, in order, as `{name, count}`.
 * `count` is the "More" seat's readout, or null on a folder heading.
 */
function sectionHeaders() {
  return listNodes()
    .filter((node) => node.__attrs['data-session-id'] === undefined)
    .map((node) => ({
      name: node.children[0] ? String(node.children[0].textContent) : '',
      count: node.children[1] ? String(node.children[1].textContent) : null,
    }))
}

/** The heading texts of the mounted window, in order. */
function sectionNames() {
  return sectionHeaders().map((header) => header.name)
}

/**
 * The mounted window's "More" heading element, or null when there is none.
 *
 * `sectionHeaders` reads the headings without handing back the node, and a
 * check that presses one needs the node itself.
 * @returns {object|null} the heading.
 */
function moreHeadingNode() {
  const label = expectedLabel('groupMore')
  return (
    listNodes().find(
      (node) => node.__attrs['data-session-id'] === undefined && String(node.children[0] ? node.children[0].textContent : '') === label
    ) ?? null
  )
}

/**
 * Press the "More" seat, the way a reader does.
 *
 * The seat answers to a press on the heading itself, not to a key, so every
 * check that wants a deeper list asks for it here rather than reaching for one.
 * @returns {void}
 */
function clickMore() {
  const heading = moreHeadingNode()
  assert.ok(heading, 'the window must be showing a More seat for this check to press it')
  fireOn(heading, 'mousedown', { type: 'mousedown', preventDefault() {}, stopPropagation() {} })
}

// The violet the plugin paints the "you are here" chip with. A status chip and
// this one are the only coloured cells on a row, so the state checks have to
// tell them apart by more than "has a colour".
const HERE_COLOR = '#c4b5fd'

/** Is this cell the "you are here" chip rather than a state chip? */
function isHereChip(cell) {
  return String(cell.style.color || '') === HERE_COLOR
}

/** The "you are here" chip of one row, or null when the row carries none. */
function hereChip(row) {
  return row.children.find(isHereChip) ?? null
}

/**
 * The state chip of one row, or null when the row carries none.
 *
 * Found by what it says rather than by being the first coloured cell: the stage
 * chip sits between the tag and the state, and an idle stage still has a colour,
 * so "first with a colour" now finds the stage and quietly proves nothing about
 * the state.
 * @param {object} row - a rendered row.
 * @returns {object|null} the state chip.
 */
function stateChip(row) {
  const labels = ['statusRunning', 'statusDone', 'statusWaiting', 'statusWaitApproval', 'statusWaitPlan', 'statusWaitAnswer']
  return (
    row.children.find((cell) => labels.some((key) => String(cell.textContent || '').startsWith(expectedLabel(key)))) ?? null
  )
}

/** The three stage words, in the order the control lays them out. */
const STAGE_KEYS = ['phaseDiscuss', 'phaseCode', 'phaseCheck']

/**
 * The stage control of one row, or null when the row carries none.
 *
 * Found by holding the whole vocabulary: every row lays out all three stage
 * words, so a cell whose three children are exactly those words is the stage
 * control and nothing else on the row can be mistaken for it.
 * @param {object} row - a rendered row.
 * @returns {object|null} the stage control.
 */
function stageBox(row) {
  const words = STAGE_KEYS.map((key) => expectedLabel(key))
  return (
    row.children.find(
      (cell) =>
        cell.children &&
        cell.children.length === words.length &&
        words.every((word, i) => String(cell.children[i].textContent || '') === word)
    ) ?? null
  )
}

/** One stage word of one row, or null when the row carries no control. */
function stageWord(row, key) {
  const box = stageBox(row)
  if (!box) return null
  const at = STAGE_KEYS.indexOf(key)
  return at < 0 ? null : box.children[at]
}

/**
 * Which stage one row is showing as marked, as a dictionary key, or ''.
 *
 * Read off the weight rather than the colour: the lit word is the heavier one,
 * which is the same fact the eye picks up, and it keeps the assertion about
 * "which stage is marked" separate from any particular palette.
 * @param {object} row - a rendered row.
 * @returns {string} the marked stage's dictionary key, or '' when none is.
 */
function markedStage(row) {
  const box = stageBox(row)
  if (!box) return ''
  const at = box.children.findIndex((word) => String(word.style.fontWeight || '') === '600')
  return at < 0 ? '' : STAGE_KEYS[at]
}

/**
 * The folder prefix inside one row's name cell, or null when the row carries none.
 *
 * It rides inside the name cell rather than beside it, so it is found among that
 * cell's children and not among the row's — which is also the cheapest way to
 * assert it is not a column: a cell of the row would show up in `row.children`.
 * @param {object} row - a rendered row.
 * @returns {object|null} the prefix span.
 */
function folderPrefix(row) {
  const name = row.children[0]
  if (!name || !name.children) return null
  return name.children.find((child) => child.getAttribute('data-role') === 'folder') ?? null
}

/** The conversation name of one row, with any folder prefix excluded. */
function nameText(row) {
  const name = row.children[0]
  if (!name || !name.children) return String((name && name.textContent) || '')
  const text = name.children.find((child) => child.getAttribute('data-role') === 'nameText')
  return text ? String(text.textContent) : String(name.textContent)
}

/** The tracks to the right of the name column, in order.
 *
 * Splitting the whole template on spaces does not work: `minmax(0, 1fr)` carries
 * a space inside it. Everything after the name track is a plain `<n>px` track, so
 * cutting there gives the right-hand columns exactly.
 * @param {object} row - a rendered row.
 * @returns {Array<string>} the track values.
 */
function rightTracks(row) {
  const template = String(row.style.gridTemplateColumns)
  const NAME_TRACK = ' minmax(0, 1fr) '
  const at = template.indexOf(NAME_TRACK)
  return template.slice(at + NAME_TRACK.length).trim().split(' ')
}

/** The state gutter: the one track in front of the name. */
function statusTrack(row) {
  const template = String(row.style.gridTemplateColumns)
  return template.slice(0, template.indexOf(' minmax(0, 1fr) ')).trim()
}

/** The open name box, or null when no row is being renamed. */
function renameBox() {
  for (const row of rowNodes()) {
    const box = row.children.find((child) => child.tagName === 'INPUT')
    if (box) return box
  }
  return null
}

/** Type into the name box, the way the DOM reports it. */
function typeIn(box, value) {
  box.value = value
  fireOn(box, 'input', { type: 'input' })
}

/** Press one key in the name box, the way the DOM delivers it. */
function pressIn(box, key) {
  return fireOn(box, 'keydown', { key, preventDefault() {}, stopPropagation() {} })
}

/** The footer hint line of the mounted window. */
function footerText() {
  const host = body.children[body.children.length - 1]
  return host.children[0].children[2].textContent
}

/** The ids the task window is showing, in order. */
function renderedRowIds() {
  return fakeWindow.__dshVim.palette().rows.map((row) => row.id)
}

/**
 * The last transient notice the plugin put on the page, or null when it is not
 * showing.
 * @returns {string|null} the line, or null.
 */
function toastText() {
  const node = toastNode()
  return node ? node.textContent : null
}

/**
 * The notice element itself, or null when none is showing.
 * @param {string} text - the line the notice must be carrying, to tell the
 *   transient pill and the standing hint apart.
 * @returns {object|null} the notice element.
 */
function toastNode(text) {
  for (const child of body.children.slice().reverse()) {
    if (child.getAttribute('role') === 'status') return child
    for (const inner of child.children) {
      if (inner.getAttribute('role') !== 'status') continue
      if (text === undefined || inner.textContent === text) return inner
    }
  }
  return null
}

/**
 * The fixed host a notice is placed in, or null when none is showing.
 * @param {string} text - the line its notice must be carrying.
 * @returns {object|null} the host element.
 */
function toastHost(text) {
  for (const child of body.children.slice().reverse()) {
    if (child.children.some((inner) => inner.getAttribute('role') === 'status')) {
      if (text === undefined) return child
      if (child.children.some((inner) => inner.textContent === text)) return child
    }
  }
  return null
}

/** A conversation on screen, the way the shell's own shortcuts see it. */
function seedVisible(id = 'main') {
  seed([{ id, displayTitle: 'the visible one', updatedAt: ago(1), retainedBy: { mainView: 1 } }])
}

/** A catalog with three providers, shaped exactly as the host builds it. */
const CATALOG = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', reasoning: REASONING },
    ],
  },
  {
    id: 'bunny',
    name: 'Space Bunny',
    models: [{ id: 'bunny-free', name: 'Space Bunny Free' }],
  },
  {
    id: 'kimi',
    name: 'Moonshot',
    models: [
      {
        id: 'kimi-k2',
        name: 'Kimi K2',
        reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }] },
      },
    ],
  },
]

/** The configured list used by most checks below. */
const FAVORITES = [
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'deepseek', model: 'deepseek-reasoner' },
  { provider: 'bunny', model: 'bunny-free' },
]

/** Configure the list the way the settings page would. */
function useFavorites(list) {
  fakeWindow.__dshVim.update({ favorites: list })
}

/** Every selection submitted so far, as `provider/model` strings. */
function submittedRoutes() {
  return MODEL.calls.map((call) => `${call.provider}/${call.model}`)
}

/**
 * The picker's card, or null when no picker is up.
 *
 * It is told apart from the task window by its own aria-label rather than by
 * being the last child of `body`: both can be mounted, and a check that reads
 * the wrong one would pass while the thing it meant to test was absent.
 * @returns {object|null} the card element.
 */
function modelPickPanel() {
  for (const child of body.children.slice().reverse()) {
    for (const inner of child.children) {
      if (inner.getAttribute('aria-label') === expectedLabel('modelPick')) return inner
    }
  }
  return null
}

/** The rows of the open picker, in order. */
function modelPickRows() {
  const panel = modelPickPanel()
  if (!panel) return []
  const list = panel.children[1]
  return list ? list.children.slice() : []
}

/**
 * One node of a picker row, by the role it carries.
 *
 * Read by role rather than by position, and searched over the whole row: the
 * `current` tag and the name share the name cell, so their roles are nested a
 * level down. A check that counted children would silently read the wrong node
 * the next time the row is reshaped — which is exactly the kind of quiet
 * breakage a suite is supposed to catch.
 * @param {object} row - a picker row.
 * @param {string} role - `here`, `name`, `nameText`, `levels`, `provider`, `level` or `landed`.
 * @returns {object|null} the node.
 */
function modelPickCell(row, role) {
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (child.getAttribute('data-role') === role) return child
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(row)
}

/**
 * The model name printed on each picker row.
 *
 * The `current` tag shares the name cell, so the name is that cell's own span.
 */
function modelPickNames() {
  return modelPickRows().map((row) => modelPickCell(row, 'nameText').textContent)
}

/** Whether a picker row carries the `current` tag. */
function modelPickRowIsHere(row) {
  const tag = row.children[0].children.find((cell) => cell.getAttribute('data-role') === 'here')
  return !!tag && tag.textContent === expectedLabel('modelPickHere')
}

/**
 * The level chips of one picker row, in order.
 *
 * Only the selected row draws chips; every other row carries a single landing
 * level instead, and answers with an empty list here.
 * @param {object} row - a picker row.
 * @returns {Array} the chips.
 */
function modelPickLevelChips(row) {
  const cell = modelPickCell(row, 'levels')
  if (!cell) return []
  return cell.children.filter((chip) => chip.getAttribute('data-role') === 'level')
}

/**
 * The level an unselected row says it would land on, or null when the row draws
 * chips (or says it has none).
 * @param {object} row - a picker row.
 * @returns {string|null} the landing level's name.
 */
function modelPickLanded(row) {
  const cell = modelPickCell(row, 'levels')
  if (!cell) return null
  const land = cell.children.find((chip) => chip.getAttribute('data-role') === 'landed')
  return land ? land.textContent : null
}

/** The level names drawn on one picker row. */
function modelPickLevelNames(row) {
  return modelPickLevelChips(row).map((chip) => chip.textContent)
}

/**
 * The level marked on one picker row, or null when none is.
 *
 * A mark is the violet chip style; the row of the model in effect carries the
 * same style, which is exactly the point — there, the mark and the current level
 * are the same level.
 */
function modelPickLevelOn(row) {
  const chip = modelPickLevelChips(row).find(
    (c) => c.style.background === 'rgba(196, 181, 253, 0.22)'
  )
  return chip ? chip.textContent : null
}

/**
 * The text of each picker row, in document order.
 *
 * The `current` tag leads the row now, so its text is part of this — that is
 * what makes the order itself assertable.
 */
function modelPickRowText() {
  return modelPickRows().map((row) => row.children.map((cell) => cell.textContent).join(' '))
}

/** Which picker row is marked selected, or -1. */
function modelPickSelected() {
  return modelPickRows().findIndex((row) => row.style.background === 'rgba(255, 255, 255, 0.14)')
}

/** The picker's footer line, or null when it is not up. */
function modelPickFooter() {
  const panel = modelPickPanel()
  return panel ? panel.children[2].textContent : null
}

/**
 * A timestamp inside today, a given number of hours after the local midnight.
 *
 * The board cuts at the local midnight, so a check about "today" cannot be
 * written with `ago()`: three hours before a run at 01:00 is yesterday's
 * evening, and the same check would pass in the afternoon and fail at night.
 * @param {number} hours - hours after midnight, may be 0.
 * @returns {number} epoch milliseconds.
 */
function todayAt(hours) {
  const midnight = new Date(Date.now())
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime() + hours * HOUR
}

/**
 * The mounted board's panel, or null when no board is up.
 *
 * Found by the label it publishes rather than by being the last thing on the
 * page: a notice (the one a refused action speaks through) is appended to the
 * body too, and it can sit above the board.
 * @returns {object|null} the panel.
 */
function boardPanel() {
  for (let i = body.children.length - 1; i >= 0; i--) {
    const host = body.children[i]
    const panel = host.children && host.children[0]
    if (!panel || !panel.__attrs) continue
    if (panel.__attrs['aria-label'] !== expectedLabel('board')) continue
    if (panel.__attrs['role'] !== 'dialog') continue
    return panel
  }
  return null
}

/** The board's canvas viewport, or null when no board is up. */
function boardBody() {
  const panel = boardPanel()
  return panel ? panel.children[1] ?? null : null
}

/** The paper inside the canvas (the stage, under its sizing wrapper). */
function boardStage() {
  const body = boardBody()
  const sizer = body ? body.children[0] ?? null : null
  return sizer ? sizer.children[0] ?? null : null
}

/** The workspace and inbox panels, in draw order. */
function boardBlocks() {
  const stage = boardStage()
  if (!stage) return []
  return stage.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'workspaceBlock')
}

/** One panel by the name its heading carries. */
function boardBlock(label) {
  return boardBlocks().find((node) => {
    const name = boardSeat(node, 'blockName')
    return name ? String(name.textContent) === label : false
  }) || null
}

/** Every conversation card under one node, at any depth. */
function cardsIn(node) {
  const out = []
  const walk = (n) => {
    for (const child of n.children || []) {
      if (child.__attrs && child.__attrs['data-session-id'] !== undefined) out.push(child)
      walk(child)
    }
  }
  if (node) walk(node)
  return out
}

/** Every conversation on the canvas, panel by panel. */
function boardCardIds() {
  return boardBlocks().flatMap((block) => cardsIn(block).map((card) => card.__attrs['data-session-id']))
}

/** The loose cards, in draw order. */
function looseCards() {
  const stage = boardStage()
  if (!stage) return []
  return stage.children.filter((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
}

/** The board's heading line, as `{title, count}`. */
function boardHeading() {
  const head = boardPanel().children[0]
  return { title: String(head.children[0].textContent), count: String(head.children[1].textContent) }
}

/**
 * The board's stored document, read straight out of the fake storage.
 *
 * The arrangement is the plugin's own record rather than anything it projects
 * for a check, so a check about what will survive a reload reads this.
 * @returns {object|null} the stored board, or null when none was written.
 */
function boardDoc() {
  // The board's own key, named exactly: the history keeps its pages and its
  // carried set beside this plugin too, and the first of those is not the board.
  for (const key of stored.keys()) {
    if (key.endsWith('/board/v1')) return JSON.parse(stored.get(key))
  }
  return null
}

/** A named seat inside one node, at any depth. */
function boardSeat(node, role, seen) {
  // A fake element can end up in more than one parent's children (appendChild
  // does not detach it from the old one), so this walk carries the set of nodes
  // it has already been through. Without it a shared or cyclic subtree is not
  // a wrong answer, it is an infinite one — and an infinite walk fills the heap.
  const visited = seen || new Set()
  if (!node || visited.has(node)) return null
  visited.add(node)
  // A walk longer than this is not looking at a card any more: it is looking at
  // the whole page, and it would fill the heap before it answered.
  if (visited.size > 200000) throw new Error(`boardSeat('${role}') walked ${visited.size} nodes without finding one`)
  for (const child of node.children || []) {
    if (child.__attrs && child.__attrs['data-role'] === role) return child
    const found = boardSeat(child, role, visited)
    if (found) return found
  }
  return null
}

/** One panel's heading, as an element to press. */
function blockHead(block) {
  return block.children[0]
}

/** A goal's ⋯ mark, or null when the panel has none (the tray). */
function goalMenuMark(block) {
  return boardSeat(block, 'goalMenuOpen')
}

/**
 * Open a goal's ⋯ menu and return it.
 *
 * The menu is drawn on the paper beside the panel rather than inside it, so it
 * is found from the stage, not by walking the block.
 * @param {object} block - the panel whose ⋯ is pressed.
 * @returns {object|null} the open menu.
 */
function openGoalMenu(block) {
  fireOn(goalMenuMark(block), 'click', { type: 'click', stopPropagation() {} })
  const menus = boardStage().querySelectorAll('[data-role="goalMenu"]')
  return menus[menus.length - 1] ?? null
}

/**
 * A press that may become a drag, delivered the way the DOM delivers one.
 *
 * From the element pressed up to the canvas, so the board's single press
 * handler sees it wherever it started; a handler that stops the press stops
 * the walk, which is how a field keeps a selection to itself.
 */
function pressForDrag(node, x, y) {
  let stopped = false
  const ev = {
    type: 'pointerdown',
    button: 0,
    clientX: x,
    clientY: y,
    target: node,
    preventDefault() {},
    stopPropagation() { stopped = true },
  }
  let cur = node
  while (cur && !stopped) {
    fireOn(cur, 'pointerdown', ev)
    if (cur === body || !cur.parentNode) break
    cur = cur.parentNode
  }
  return ev
}

/** A pointer that has moved, and let go. */
function dragTo(x, y) {
  fire('pointermove', { type: 'pointermove', clientX: x, clientY: y, preventDefault() {} })
  fire('pointerup', { type: 'pointerup' })
}

/** The board heading's "write a card" button. */
function writeCardButton() {
  return boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'addCard')
}

/** Lines of one note, joined without an escape any tool could double. */
function noteLines(...parts) {
  return parts.join(String.fromCharCode(10))
}

/** Press a mark and then click it: the press is what clears a leftover carry. */
function tapMark(node) {
  if (!node) return
  pressForDrag(node, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  fireOn(node, 'click', { type: 'click', stopPropagation() {} })
}

/** The idea sheet's scrim, mounted on the board panel, or null when closed. */
function ideaFocusHost() {
  return boardSeat(boardPanel(), 'ideaFocus')
}

/** The idea sheet itself. */
function ideaFocusSheet() {
  const host = ideaFocusHost()
  return host ? boardSeat(host, 'ideaFocusSheet') : null
}

/** One field or mark inside the idea sheet. */
function ideaFocusField(role) {
  const host = ideaFocusHost()
  return host ? boardSeat(host, role) : null
}

/** The idea sheet's confirm / cancel / close mark. */
function ideaFocusMark(role) {
  return ideaFocusField(role)
}

/** Whether the sheet is on the page at all. */
function ideaFocusOpen() {
  return Boolean(ideaFocusSheet())
}

/**
 * Write one new idea through the compose sheet and let it land.
 *
 * This is the only way a card is made now: the toolbar's write button opens the
 * sheet, and the card appears when the sheet closes with words in it.
 * @param {string} title - the first line.
 * @param {string} [body] - everything after it.
 * @returns {void}
 */
function writeIdea(title, body) {
  fireOn(writeCardButton(), 'click', { type: 'click' })
  const titleField = ideaFocusField('cardTitleInput')
  assert.ok(titleField, 'the write button opens the idea sheet')
  if (title !== undefined) typeIn(titleField, title)
  if (body !== undefined) {
    pressIn(titleField, 'Enter')
    const bodyField = ideaFocusField('cardText')
    assert.ok(bodyField, 'the title hands the caret to the body')
    typeIn(bodyField, body)
  }
  fireOn(ideaFocusMark('ideaFocusConfirm'), 'click', { type: 'click', stopPropagation() {} })
  assert.equal(ideaFocusOpen(), false, 'the sheet is gone once the card lands')
}

/** Open one existing card in the sheet, by its card, title, or body. */
function openIdeaFocusOn(card, part) {
  const node = part === 'title'
    ? boardSeat(card, 'looseTitle')
    : part === 'body'
      ? boardSeat(card, 'looseText')
      : card
  assert.ok(node, `the ${part || 'card'} is on the card`)
  clickThrough(node)
  assert.ok(ideaFocusOpen(), 'the card opens the idea sheet')
  return ideaFocusSheet()
}

/** Close the sheet with its own confirm mark, letting a new draft land. */
function closeIdeaSheet() {
  const confirm = ideaFocusMark('ideaFocusConfirm')
  assert.ok(confirm, 'the sheet has a way to close it')
  fireOn(confirm, 'click', { type: 'click', stopPropagation() {} })
}

/** Throw a new draft away through its cancel mark. */
function cancelIdeaSheet() {
  const cancel = ideaFocusMark('ideaFocusCancel')
  assert.ok(cancel, 'a new sheet has a way to cancel it')
  fireOn(cancel, 'click', { type: 'click', stopPropagation() {} })
}

/** The board heading's tidy button. */
function tidyButton() {
  return boardPanel().children[0].children.find((node) => node.__attrs['data-role'] === 'tidyBoard')
}

/** The list the chip opens, or null while it is closed. */
function doneBinList() {
  return boardSeat(boardPanel(), 'doneBinList')
}

/**
 * One card written, tied to the conversation on the panel, and checked off.
 *
 * The shape the bin is for: a thought that was handed to a conversation and then
 * finished. Written the way a reader writes one - the write button, the words,
 * then dropped on the conversation card (which ties without delivering).
 * @param {string} text - what the card says.
 * @returns {object} the card as the store has it.
 */
function finishedCard(text) {
  writeIdea(text, text)
  aimAt(cardsIn(boardBlocks()[0])[0])
  pressForDrag(looseCards()[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  // A real press on the box starts with a pointerdown, and that press is what
  // clears the leftover 'that was a carry, not a click' flag. Firing the click
  // alone leaves the flag of the drop standing, and the box swallows it.
  // The thought lives in the conversation's own column now; its done box is
  // there, under the card it was filed beneath.
  const stack = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const filed = stack.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  const box = boardSeat(filed, 'cardDoneToggle')
  pressForDrag(box, 5, 5)
  fire('pointerup', { type: 'pointerup' })
  fireOn(box, 'click', { type: 'click', stopPropagation() {} })
  return fakeWindow.__dshVim.board().loose[0]
}

/** A board with one conversation, its card written and tied and finished. */
function boardWithFinishedCard(text) {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: '/work/dsh-vim', sessionIds: ['target'] }])
  seed([{ id: 'target', displayTitle: 'the target', updatedAt: todayAt(2) }])
  tap('j')
  finishedCard(text)
  // Putting it away is the reader's own gesture: a finished note is dragged onto
  // the conversation it belongs to, and lands in that conversation's own list.
  aimAt(boardSeat(boardCard('target'), 'cardEnter'))
  const column = boardSeat(boardBlock('dsh-vim'), 'cardStack')
  const trace = column.children.find((node) => node.__attrs && node.__attrs['data-role'] === 'looseCard')
  pressForDrag(trace.children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  return fakeWindow.__dshVim.board().loose[0]
}

/** The state one conversation's card is wearing, as the words the card shows. */
function cardStateWords(id) {
  const card = cardsIn(boardStage()).find((node) => node.__attrs['data-session-id'] === id)
  if (!card) return ''
  const computed = boardSeat(card, 'status')
  const said = boardSeat(card, 'cardState')
  const offered = boardSeat(card, 'cardStateAdd')
  if (computed) return String(computed.textContent)
  if (said) return String(said.textContent)
  return offered ? '+' : ''
}

/** The card of one conversation, as it stands on the board now. */
function cardOf(id) {
  return cardsIn(boardStage()).find((node) => node.__attrs['data-session-id'] === id) || null
}

/**
 * The native drag a shell row makes, delivered the way the DOM delivers one.
 *
 * The shell's session rows are natively draggable (that is how the list is
 * reordered), and what a row sets on its data transfer is its conversation's
 * id as plain text — the payload the canvas reads at the drop. The words are
 * guarded until then, so the dragover carries only the types.
 * @param {object} node - the element the drag is over.
 * @param {string} [id] - the words aboard, when the drop is allowed to read.
 * @param {object} [extra] - fields folded into the event.
 * @returns {void}
 */
function dragOnto(node, id, extra) {
  const dataTransfer = { types: ['text/plain'] }
  if (id !== undefined) dataTransfer.getData = () => id
  fireOn(node, 'dragover', {
    type: 'dragover', clientX: 600, clientY: 300, dataTransfer, preventDefault() {}, ...extra,
  })
  if (id === undefined) return
  fireOn(node, 'drop', {
    type: 'drop', clientX: 600, clientY: 300, dataTransfer, preventDefault() {}, ...extra,
  })
}

/** One of the board header's history buttons, or null. */
function historyButton(role) {
  const head = boardPanel().children[0]
  return head.children.find((node) => node.__attrs && node.__attrs['data-role'] === role) || null
}

/** Put one written note away in the tray, and hand back the board. */
function fileANote(text) {
  seed([
    { id: 'filed', displayTitle: 'filed work', updatedAt: todayAt(3) },
    { id: 'loose', displayTitle: 'nowhere', updatedAt: todayAt(2) },
  ])
  registry.publish([], [{ workspaceId: 'w1', title: 'one', path: '/work/one', sessionIds: ['filed'] }])
  tap('j')
  writeIdea(text)
  aimAt(boardBlock(expectedLabel('boardInbox')))
  pressForDrag(looseCards()[0], 60, 300)
  dragTo(600, 300)
  resetHitTest()
}

/** One conversation, on screen, inside today — the shape the note needs. */
function seedCurrent(id = 'here') {
  seed([{ id, displayTitle: 'where I am', updatedAt: todayAt(3), retainedBy: { mainView: 1 } }])
}

/** The board card for one conversation, or null when it is not on the canvas. */
function boardCard(id) {
  for (const block of boardBlocks()) {
    const found = cardsIn(block).find((card) => card.__attrs['data-session-id'] === id)
    if (found) return found
  }
  return null
}

/** The field a card's line is typed into, or null. */
function cardNoteBox(card) {
  return boardSeat(card, 'cardNoteBox')
}

/** The line a card carries, or null. */
function cardNoteLine(card) {
  return boardSeat(card, 'note')
}

/** The mark that starts a line on a card that has none. */
function cardNotePin(card) {
  return boardSeat(card, 'cardNotePin')
}

/** Every card drawn under one element, at any depth. */
function cardsUnder(node) {
  const out = []
  const walk = (n) => {
    for (const child of n.children || []) {
      if (child.__attrs && child.__attrs['data-session-id'] !== undefined) out.push(child)
      walk(child)
    }
  }
  walk(node)
  return out
}

/** Start a line on one card and type it, the way a reader does. */
function writeCardNote(id, text) {
  const card = boardCard(id)
  const pin = cardNotePin(card)
  if (pin) fireOn(pin, 'click', { type: 'click' })
  else fireOn(cardNoteLine(card), 'click', { type: 'click' })
  const box = cardNoteBox(boardCard(id))
  typeIn(box, text)
  return box
}

/**
 * One thought handed to a conversation on the open board.
 *
 * Dragged rather than filed from a menu: the drag is the gesture that both
 * ties the thought to the conversation and seats it in that conversation's own
 * column, which is the state the overview counts.
 * @param {string} sessionId - the conversation it is dropped on.
 * @param {string} text - what it says.
 * @returns {object|null} the card as it now stands under the conversation.
 */
function fileThought(sessionId, text) {
  writeIdea(text)
  aimAt(boardCard(sessionId))
  pressForDrag(looseCards()[0].children[0], 10, 10)
  dragTo(300, 200)
  resetHitTest()
  // The stage is searched rather than one panel: a filed thought is drawn in
  // its conversation's own column, and which panel that column stands under is
  // the answer, not the way to find it.
  const cards = boardStage().querySelectorAll('[data-role="looseCard"]')
  for (let i = cards.length - 1; i >= 0; i--) {
    const title = boardSeat(cards[i], 'looseTitle')
    if (title && String(title.textContent) === text) return cards[i]
  }
  return null
}

/**
 * The position chooser's element on the settings page. Matched on its options,
 * not on order, because the Escape toggle is a chooser too.
 * @returns {object} the choice element.
 */
function placeChoice() {
  const found = settingsElements().find(
    (e) => Array.isArray(e.props.options) && e.props.options.some((o) => o.value === 'top')
  )
  assert.ok(found, 'the position chooser must be on the page')
  return found
}

/**
 * The status chips rendered in the mounted window, row by row.
 *
 * Found by the state labels rather than by "any coloured cell": the stage chip
 * sits in the same strip, an idle stage has a colour of its own, and a filter
 * on colour would start reporting the stage as the status.
 *
 * Read through `rowNodes`, not the list's own children: the list now carries a
 * heading above each attention block, and walking the raw children would count
 * a heading as a row and report a phantom entry per block.
 * @returns {Array<Array<string>>} one array of labels per row.
 */
function renderedStatuses() {
  return rowNodes().map((row) => {
    const chip = stateChip(row)
    return chip ? [chip.textContent] : []
  })
}

/**
 * How the row clock writes a duration, in the harness locale.
 *
 * Minutes are the whole resolution now: the chip has no seconds to show, and a
 * turn inside its first minute shows no duration at all.
 * @param {number} minutes - whole minutes elapsed.
 * @returns {string} the label the plugin should have painted.
 */
function elapsedLabel(minutes) {
  return minutes + expectedLabel('elapsedMinutes')
}

/**
 * The text of a state chip that carries a clock: the state, then the duration.
 * @param {string} key - the state's dictionary key.
 * @param {number} minutes - whole minutes elapsed.
 * @returns {string} the label the plugin should have painted.
 */
function liveChip(key, minutes) {
  return expectedLabel(key) + ' · ' + elapsedLabel(minutes)
}

/** The turn counts painted in the mounted window, row by row. */
function renderedTurns() {
  return rowNodes().map((row) => {
    const hit = row.children.find((c) => c.style.opacity === '0.38')
    return hit ? hit.textContent : null
  })
}

/** The board's own key, found by shape: the settings key is not it. */
function boardKey() {
  for (const key of stored.keys()) if (key.endsWith('/board/v1')) return key
  return null
}

/**
 * The conversations a panel draws as columns, in the order it draws them.
 * @param {object} block - the panel.
 * @returns {Array<string>} session ids.
 */
function drawnColumns(block) {
  const grid = boardSeat(block, 'blockColumns')
  if (!grid) return []
  return grid.children
    .filter((node) => node.__attrs && node.__attrs['data-column'] !== undefined)
    .map((node) => String(node.__attrs['data-column']))
}

/** Every line the journal holds, oldest first, read straight out of the fake database. */
function journalLines() {
  const db = fakeDatabases.get('dsh-vim-journal')
  if (!db) return []
  const entry = db.stores.get('events')
  if (!entry) return []
  return [...entry.records.values()].sort((left, right) => String(left.k).localeCompare(String(right.k)))
}

/**
 * Put one flow row on screen, the way the chat renders it: a shell-tagged row
 * inside the conversation's own body, at a measured place in a scrollport
 * parked at its floor.
 *
 * The geometry is written as the browser would report it at that floor, so the
 * plugin's anchor arithmetic is exercised against real coordinates rather than
 * a row that merely exists.
 * @param {object} [options] - `{ kind, session, scrollHeight, clientHeight, top, height }`.
 * @returns {object} the row.
 */
function arriveInputRow(options = {}) {
  const height = options.height ?? 120
  const top = options.top ?? 380
  const scrollerHeight = options.clientHeight ?? 800
  const content = options.scrollHeight ?? 5000
  transcript.scrollHeight = content
  transcript.clientHeight = scrollerHeight
  transcript.__rect = { top: 100, left: 0, width: 900, height: scrollerHeight, right: 900, bottom: 100 + scrollerHeight }
  transcript.scrollTop = options.scrollTop ?? content - scrollerHeight
  transcript.setAttribute('data-conversation-session', options.session ?? 's1')
  const row = el({ tag: 'DIV', parent: transcript })
  row.setAttribute('data-chat-flow-kind', options.kind ?? 'user')
  row.__rect = { top, left: 0, width: 900, height, right: 900, bottom: top + height }
  transcript.appendChild(row)
  arrivedRows.push(row)
  return row
}

/**
 * Enter one conversation the way the board does: put its card on the canvas,
 * press that card, then let the shell paint the conversation the press asked
 * for.
 *
 * The press is what arms the entry anchor; `currentBinding.open` is the
 * shell's own answer to `nav.openSession`, which the fake navigator only
 * records. Every other way in (the task window, the sidebar) calls
 * `currentBinding.open` alone and must leave the page at its tail.
 * @param {string} id - session id.
 * @returns {void}
 */
function enterFromBoard(id) {
  seed([{ id, displayTitle: id, updatedAt: todayAt(1) }])
  tap('j')
  const card = boardCard(id)
  assert.ok(card, 'the board must draw the conversation its card stands for')
  clickThrough(card)
  currentBinding.open(id)
}

export { armDoubleEnter, renderSendHint, sendHintText, seed, HOUR, ago, headerCount, listNodes, rowNodes, sectionHeaders, sectionNames, moreHeadingNode, clickMore, HERE_COLOR, isHereChip, hereChip, stateChip, STAGE_KEYS, stageBox, stageWord, markedStage, folderPrefix, nameText, rightTracks, statusTrack, renameBox, typeIn, pressIn, footerText, renderedRowIds, toastText, toastNode, toastHost, seedVisible, CATALOG, FAVORITES, useFavorites, submittedRoutes, modelPickPanel, modelPickRows, modelPickCell, modelPickNames, modelPickRowIsHere, modelPickLevelChips, modelPickLanded, modelPickLevelNames, modelPickLevelOn, modelPickRowText, modelPickSelected, modelPickFooter, todayAt, boardPanel, boardBody, boardStage, boardBlocks, boardBlock, cardsIn, boardCardIds, looseCards, boardHeading, boardDoc, boardSeat, blockHead, goalMenuMark, openGoalMenu, pressForDrag, dragTo, writeCardButton, noteLines, tapMark, ideaFocusHost, ideaFocusSheet, ideaFocusField, ideaFocusMark, ideaFocusOpen, writeIdea, openIdeaFocusOn, closeIdeaSheet, cancelIdeaSheet, tidyButton, doneBinList, finishedCard, boardWithFinishedCard, cardStateWords, cardOf, dragOnto, historyButton, fileANote, seedCurrent, boardCard, cardNoteBox, cardNoteLine, cardNotePin, cardsUnder, writeCardNote, fileThought, placeChoice, renderedStatuses, elapsedLabel, liveChip, renderedTurns, boardKey, drawnColumns, journalLines, arriveInputRow, enterFromBoard }
