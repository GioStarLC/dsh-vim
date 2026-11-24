/**
 * Behaviour checks: the task window, renaming, rebinding, archiving, folders.
 */
import assert from 'node:assert/strict'
import { step, bumpChecks, setMenuOnScreen, setMediaReduce, setNow, ROOT, BUNDLE, now, seq, timers, frames, FRAME_MS, clock, matches, matchesSimple, el, arrivedRows, transcript, sidebar, composer, button, body, root, editor, modal, modalEditor, blurCount, editorBlurs, synthKeys, replayKeydown, listeners, captureOf, record, unrecord, fire, shellFocus, domFocus, fireOn, clickThrough, flush, press, stored, fakeStorage, fakeDatabases, fakeRequest, fakeStoreApi, fakeIndexedDB, mediaReduce, fakeWindow, menu, menuOnScreen, fakeDocument, paneAt, cardNode, aimAt, resetHitTest, ReactStub, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, fakeRequire, feed, registry, newSessions, renames, statusFeed, currentBinding, MODEL, REASONING, projections, forks, opened, archives, makeCtx, captured, loadBundle, client, ctx, cleanup, keydown, keyup, wheel, movePointer, blurWindow, refocusWindow, tap, SHIPPED, expectedLabel, checks, peak, reset, finish, check, checkAsync } from './harness.mjs'
import { seed, ago, headerCount, listNodes, rowNodes, sectionHeaders, sectionNames, moreHeadingNode, clickMore, hereChip, stateChip, STAGE_KEYS, stageBox, stageWord, markedStage, folderPrefix, nameText, rightTracks, renameBox, typeIn, pressIn, footerText, renderedRowIds, renderedStatuses, liveChip } from './helpers.mjs'
// --- settings page ---------------------------------------------------------

check('the board is a sidebar entry with a page beside it', () => {
  const main = (ctx.log.slots.main || [])[0]
  const entry = (ctx.log.slots['sidebar.panellist'] || [])[0]
  assert.ok(main, 'the board must register a main panel')
  assert.equal(main.spec.key, 'dsh-vim-board', 'under the id the sidebar will select')
  assert.ok(entry, 'and a sidebar entry that selects it')
  assert.equal(entry.spec.id, main.spec.key, 'the entry and the panel must share one id')
  assert.equal(entry.spec.order, 20, 'below the plugins and automation entries')
  assert.equal(typeof entry.spec.label, 'function', 'the entry is labelled by the plugin')
  assert.equal(entry.spec.label(), expectedLabel('board'), 'with the same word the board uses')
  assert.equal(typeof entry.component, 'function', 'and it draws its own glyph')
  assert.equal(typeof main.component, 'function', 'while the page is a component')
})

check('the overview is a page of its own, beside the board', () => {
  const main = (ctx.log.slots.main || [])[1]
  const entry = (ctx.log.slots['sidebar.panellist'] || [])[1]
  assert.ok(main, 'a second main panel must stand beside the board')
  assert.equal(main.spec.key, 'dsh-vim-overview', 'with an id of its own')
  assert.ok(entry, 'and an entry that selects it')
  assert.equal(entry.spec.id, main.spec.key, 'the entry and the panel must share one id')
  assert.equal(entry.spec.order, 21, 'right after the board')
  assert.equal(entry.spec.label(), expectedLabel('overview'), 'labelled with the overview word')
  assert.equal(typeof entry.component, 'function', 'and it draws its own glyph')
  assert.equal(typeof main.component, 'function', 'while the page is a component')
})

check('the settings page is registered on the settings.section slot', () => {
  // Two slots: the settings page, and the composer's own dock row, where the
  // send hint goes. Both are the shell's, so neither is scraped out of the DOM.
  assert.deepEqual(
    ctx.log.injected,
    ['settings.section', 'conversation.composer.dock', 'main', 'sidebar.panellist', 'main', 'sidebar.panellist'],
    'must inject the settings section, the composer dock, and the board page with its entry, then the overview and its entry'
  )
  assert.equal(ctx.log.sections.length, 1)
  const { spec, component } = ctx.log.sections[0]
  assert.equal(spec.name, 'settings.section')
  assert.equal(spec.id, 'dsh-vim')
  assert.equal(typeof spec.label, 'function')
  assert.ok(spec.label().length > 0, 'the nav label must not be empty')
  assert.equal(spec.locale, 'dsh-vim')
  assert.equal(typeof component, 'function', 'the slot must receive a component')
})

check('locale dictionaries are registered for the plugin namespace', () => {
  assert.equal(ctx.log.locales.length, 1)
  const { namespace, dictionaries } = ctx.log.locales[0]
  assert.equal(namespace, 'dsh-vim')
  assert.ok(dictionaries.zh && dictionaries.en, 'both dictionaries must be present')
  // Every key, not the ones somebody remembered to list: a hand-maintained
  // selection only catches the strings that were thought about when it was
  // written, and the translator falls back to the raw key rather than failing,
  // so a missing translation ships silently.
  const zhKeys = Object.keys(dictionaries.zh).sort()
  const enKeys = Object.keys(dictionaries.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'the two dictionaries must carry exactly the same keys')
  assert.ok(zhKeys.length > 0, 'the dictionaries must not be empty')
  for (const key of zhKeys) {
    assert.ok(dictionaries.zh[key], `zh dictionary has an empty "${key}"`)
    assert.ok(dictionaries.en[key], `en dictionary has an empty "${key}"`)
  }
  // The keys that were checked one by one before this was made automatic.
  // Kept because their absence is a real bug even though the sweep above now
  // covers them by name.
  for (const key of [
    'nav', 'down', 'up', 'focusComposer', 'hintFocus', 'hintPalette', 'palette', 'paletteRename',
    'rename', 'renameFailed', 'renameUnavailable', 'renameNoName', 'renameBusy',
    'paletteUp', 'paletteDown', 'appearance', 'fontSize', 'place',
    'placeTop', 'placeCenter', 'placeBottom', 'tasks', 'step', 'tau', 'repeatDelay', 'reset', 'turnUnit',
    'statusRunning', 'statusDone', 'statusWaitApproval', 'statusWaitPlan', 'statusWaitAnswer', 'statusWaiting',
  ]) {
    assert.ok(key in dictionaries.zh, `expected key "${key}" is gone from zh`)
    assert.ok(key in dictionaries.en, `expected key "${key}" is gone from en`)
  }
})

check('rebinding takes effect immediately', () => {
  // `k`, not `j`: `j` is the board's shipped key and the two seats are live at
  // the same time, so taking it here is a conflict rather than a rebind.
  const applied = fakeWindow.__dshVim.update({ downKey: 'k' })
  assert.equal(applied.downKey, 'k')
  transcript.scrollTop = 0
  tap('k')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 140, 'the new key must scroll')
  transcript.scrollTop = 0
  tap('d')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0, 'the old key must stop working')
  fakeWindow.__dshVim.update({ downKey: 'd' })
})

check('a conflicting rebind is rejected and changes nothing', () => {
  fakeWindow.__dshVim.update({ downKey: 'k' })
  const rejected = fakeWindow.__dshVim.update({ upKey: 'k' })
  assert.equal(rejected.error, 'conflict')
  assert.equal(fakeWindow.__dshVim.settings().upKey, 'e', 'the old binding must survive')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'k')
  fakeWindow.__dshVim.update({ downKey: 'd' })
})

check('the two key groups are checked independently', () => {
  // Scrolling is {down, up}; the task window is {open, up, down}. The window is
  // modal, so a key may mean "scroll down" outside and "move down" inside.
  const shared = fakeWindow.__dshVim.update({ downKey: 'f' })
  assert.ok(!shared.error, 'a scroll key may reuse a task-window key')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'f')
  fakeWindow.__dshVim.update({ downKey: 'd' })

  for (const seat of ['paletteUpKey', 'paletteDownKey']) {
    const rejected = fakeWindow.__dshVim.update({ [seat]: 'f' })
    assert.equal(rejected.error, 'conflict', `${seat} must not be allowed to take f`)
  }
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'f')
  assert.equal(fakeWindow.__dshVim.settings().paletteUpKey, 'e')
  assert.equal(fakeWindow.__dshVim.settings().paletteDownKey, 'd')
})

check('the task window navigation keys are rebindable on their own', () => {
  const applied = fakeWindow.__dshVim.update({ paletteUpKey: 'k', paletteDownKey: 'j' })
  assert.equal(applied.paletteUpKey, 'k')
  assert.equal(applied.paletteDownKey, 'j')
  const rejected = fakeWindow.__dshVim.update({ paletteDownKey: 'k' })
  assert.equal(rejected.error, 'conflict', 'its own two keys still must not collide')
  assert.equal(fakeWindow.__dshVim.settings().paletteDownKey, 'j')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'd', 'scrolling keeps its own keys')
  fakeWindow.__dshVim.update({ paletteUpKey: 'e', paletteDownKey: 'd' })
})

check('the popup font size and position are adjustable', () => {
  const clamped = fakeWindow.__dshVim.update({ paletteFont: 999 })
  assert.equal(clamped.paletteFont, 20, 'the font size must stay inside its range')
  const placed = fakeWindow.__dshVim.update({ palettePlace: 'bottom' })
  assert.equal(placed.palettePlace, 'bottom')
  const bad = fakeWindow.__dshVim.update({ palettePlace: 'sideways' })
  assert.equal(bad.error, 'conflict', 'an unknown position must be refused')
  assert.equal(fakeWindow.__dshVim.settings().palettePlace, 'bottom')
  fakeWindow.__dshVim.update({ paletteFont: 13, palettePlace: 'top' })
})

check('a named key is rejected as a binding', () => {
  const rejected = fakeWindow.__dshVim.update({ downKey: 'ArrowDown' })
  assert.equal(rejected.error, 'conflict')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'd')
  // Enter and Tab are the two named keys allowed, and only for the seats that
  // want them: a list you cannot confirm with the keyboard is a trap, and the
  // model window's level key ships as Tab.
  assert.equal(fakeWindow.__dshVim.update({ paletteEnterKey: 'Escape' }).error, 'conflict')
  assert.ok(!fakeWindow.__dshVim.update({ paletteEnterKey: 'Enter' }).error, 'Enter is an accepted binding')
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'Enter', 'the stored form is canonical')
  assert.equal(fakeWindow.__dshVim.update({ modelLevelKey: 'Escape' }).error, 'conflict', 'Escape stays unboundable')
  const tabbed = fakeWindow.__dshVim.update({ modelLevelKey: 'tab' })
  assert.ok(!tabbed.error, 'Tab is accepted')
  assert.equal(tabbed.modelLevelKey, 'Tab', 'and stored with its canonical spelling')
  fakeWindow.__dshVim.reset()
})

check('numeric preferences are clamped to their range', () => {
  fakeWindow.__dshVim.update({ step: 99999, tau: 1, repeatDelay: -50, paletteWidth: 99, paletteHeight: 200, paletteRow: 0 })
  const clamped = fakeWindow.__dshVim.settings()
  assert.equal(clamped.step, 600)
  assert.equal(clamped.tau, 10)
  assert.equal(clamped.repeatDelay, 80)
  assert.equal(clamped.paletteWidth, 480, 'a window too narrow to hold a row is not a window')
  assert.equal(clamped.paletteHeight, 95, 'nor one taller than the screen it sits on')
  assert.equal(clamped.paletteRow, 3)
})

check('a custom step drives the slide distance', () => {
  fakeWindow.__dshVim.update({ step: 300 })
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 300)
})

check('the shipped mirror covers every preference the plugin declares', () => {
  // `SHIPPED` is written by hand so it can assert a whole object at once. That
  // only works while it names every seat the plugin actually has, and a seat
  // added to `DEFAULTS` without a line here would otherwise be silently absent
  // from the `reset()` comparison's expectation.
  const shipped = fakeWindow.__dshVim.reset()
  const missing = Object.keys(shipped).filter((key) => !(key in SHIPPED))
  assert.deepEqual(missing, [], `these preferences have no SHIPPED entry: ${missing.join(', ')}`)
  const extra = Object.keys(SHIPPED).filter((key) => !(key in shipped))
  assert.deepEqual(extra, [], `SHIPPED names preferences the plugin does not have: ${extra.join(', ')}`)
})

check('reset restores the shipped defaults', () => {
  const back = fakeWindow.__dshVim.reset()
  assert.deepEqual(back, SHIPPED)
})

check('preferences are persisted', () => {
  fakeWindow.__dshVim.update({ downKey: 'k', step: 200 })
  const raw = fakeStorage.getItem('dsh-vim/settings/v1')
  assert.ok(raw, 'settings must be written to localStorage')
  const parsed = JSON.parse(raw)
  assert.equal(parsed.downKey, 'k')
  assert.equal(parsed.step, 200)
})

check('step() and tuning() stay usable from the console', () => {
  assert.equal(fakeWindow.__dshVim.step(180), 180)
  assert.equal(fakeWindow.__dshVim.tuning().step, 180)
  fakeWindow.__dshVim.step(140)
})

// --- task window ------------------------------------------------------------

























check('f opens the task window on the most recent conversations', () => {
  seed([
    { id: 'a', displayTitle: 'oldest', updatedAt: 1000 },
    { id: 'b', displayTitle: 'newest', updatedAt: 3000 },
    { id: 'c', displayTitle: 'middle', updatedAt: 2000 },
  ])
  const swallowed = tap('f')
  assert.ok(swallowed, 'the task-window key must be swallowed')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.open, true)
  assert.deepEqual(state.rows.map((r) => r.id), ['b', 'c', 'a'], 'rows must be newest first')
})

check('every row lays out the whole vocabulary, marked or not', () => {
  seed([
    { id: 'a', displayTitle: 'marked', updatedAt: 3000 },
    { id: 'b', displayTitle: 'unmarked', updatedAt: 2000 },
  ])
  fakeWindow.__dshVim.phase('a', 'code')
  tap('f')
  const rows = rowNodes()
  assert.ok(stageBox(rows[0]), 'a marked row carries the stage control')
  assert.ok(stageBox(rows[1]), 'an unmarked row carries it too — that is the point')
  for (const key of STAGE_KEYS) {
    assert.ok(stageWord(rows[1], key), `${expectedLabel(key)} must be on every row, marked or not`)
  }
  assert.equal(markedStage(rows[0]), 'phaseCode', 'the marked row lights its own stage')
  assert.equal(markedStage(rows[1]), '', 'an unmarked row lights nothing')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('the stage key steps a conversation through the stages', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  tap('f')
  const lit = () => markedStage(rowNodes()[0])
  assert.equal(lit(), '', 'it starts unmarked')
  tap('s')
  assert.equal(lit(), 'phaseDiscuss', 'first press is a discussion')
  tap('s')
  assert.equal(lit(), 'phaseCode', 'second press is code')
  tap('s')
  assert.equal(lit(), 'phaseCheck', 'third press is the check')
  tap('s')
  assert.equal(lit(), '', 'and the fourth takes it back off')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('the stage key marks the selected row, not the one above it', () => {
  seed([
    { id: 'a', displayTitle: 'first', updatedAt: 3000 },
    { id: 'b', displayTitle: 'second', updatedAt: 2000 },
  ])
  tap('f')
  tap('s')
  assert.equal(fakeWindow.__dshVim.phase('a'), 'discuss', 'the top row is selected')
  assert.equal(fakeWindow.__dshVim.phase('b'), '', 'the row below it is untouched')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('clicking a stage word marks that stage and does not switch conversation', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  tap('f')
  assert.equal(opened.length, 0, 'nothing was switched to yet')
  fireOn(stageWord(rowNodes()[0], 'phaseCheck'), 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.phase('a'), 'check', 'the click marked the word that was clicked')
  assert.equal(opened.length, 0, 'and it did not travel to that conversation')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stayed open')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCheck', 'the control repainted with that stage lit')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('clicking a word that is not the marked one moves the mark to it', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  fakeWindow.__dshVim.phase('a', 'discuss')
  tap('f')
  fireOn(stageWord(rowNodes()[0], 'phaseCode'), 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.phase('a'), 'code', 'the mark moved rather than adding a second one')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCode', 'and only that word is lit')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('clicking the lit word takes the mark off', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  fakeWindow.__dshVim.phase('a', 'code')
  tap('f')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCode', 'it starts marked')
  fireOn(stageWord(rowNodes()[0], 'phaseCode'), 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.phase('a'), '', 'the second press cleared it')
  assert.equal(markedStage(rowNodes()[0]), '', 'and nothing is lit any more')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('a stage is written where a later page can find it', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  fakeWindow.__dshVim.phase('a', 'check')
  const written = JSON.parse(fakeStorage.getItem('dsh-vim/phases/v1') || '{}')
  assert.deepEqual(written, { a: 'check' }, 'the stage is left behind under its own key')
  fakeWindow.__dshVim.clearPhases()
})

check('a stage this build cannot label is not shown as one', () => {
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  // The control reads whatever the ledger holds, so an unknown value from an
  // older build is what the row must show too — never a word this build cannot
  // say, and never a lit word standing for something else.
  fakeWindow.__dshVim.phase('a', 'code')
  fakeWindow.__dshVim.phase('b', 'from-an-older-build')
  assert.equal(fakeWindow.__dshVim.phase('b'), '', 'a value outside the vocabulary reads as no stage')
  tap('f')
  assert.equal(markedStage(rowNodes()[0]), 'phaseCode', 'the known stage is the one lit')
  tap('Escape')
  fakeWindow.__dshVim.clearPhases()
})

check('a stage outlives the list it was marked on', () => {
  fakeWindow.__dshVim.phase('forgotten', 'code')
  assert.equal(fakeWindow.__dshVim.phase('forgotten'), 'code', 'it is still marked')
  seed([{ id: 'a', displayTitle: 'one', updatedAt: 3000 }])
  assert.deepEqual(fakeWindow.__dshVim.phase(), { forgotten: 'code' }, 'a stage outlives the list, on purpose')
  fakeWindow.__dshVim.clearPhases()
})

check('the list is capped so a long history cannot flood the window', () => {
  seed(Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, displayTitle: `s${i}`, updatedAt: i })))
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 20)
  assert.equal(state.rows[0].id, 's24', 'the cap must keep the newest rows')
  tap('Escape')
})

check('subagent children are not offered as conversations', () => {
  seed([
    { id: 'main', displayTitle: 'a conversation', updatedAt: ago(1) },
    { id: 'child', displayTitle: 'a child run', updatedAt: ago(0.5), origin: 'subagent', parentId: 'main' },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['main'])
  tap('Escape')
})

check('archived conversations are not offered', () => {
  registry.publish(['gone'])
  seed([
    { id: 'gone', displayTitle: 'archived', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'still here', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['here'], 'archived rows must not appear')
  tap('Escape')
})

check('archiving while the window is open drops the row', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 2)
  registry.publish(['a'])
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['b'], 'the live archive set must apply')
  tap('Escape')
})

check('empty provisional slots are not offered', () => {
  seed([
    { id: 'real', displayTitle: 'real', updatedAt: ago(1) },
    { id: 'empty', displayTitle: 'New chat', updatedAt: ago(0.5), blank: true },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['real'])
  tap('Escape')
})

check('the window opens on the last three hours only', () => {
  seed([
    { id: 'fresh1', displayTitle: 'fresh 1', updatedAt: ago(0.5) },
    { id: 'fresh2', displayTitle: 'fresh 2', updatedAt: ago(2) },
    { id: 'edge', displayTitle: 'just inside', updatedAt: ago(2.9) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(4) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(50) },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['fresh1', 'fresh2', 'edge'],
    'only the last three hours up front'
  )
  assert.equal(state.total, 5, 'the older ones stay in the pool, unshown')
  assert.equal(headerCount(), '3 / 5', 'the header must say how much is hidden')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the recent rows are under the browsing heading, the rest behind the seat'
  )
  assert.equal(sectionHeaders()[1].count, '2', 'which says how many it is hiding')
  assert.ok(footerText().includes(expectedLabel('moreHint')), 'the footer must say how to reach the rest')
  tap('Escape')
})

check('the window opens with the selection on the conversation on screen', () => {
  seed([
    { id: 'elsewhere', displayTitle: 'touched later', updatedAt: ago(0.01) },
    { id: 'here', displayTitle: 'where I am', updatedAt: ago(3), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['elsewhere', 'here'],
    'recency alone decides the order: no row is moved for being where you are'
  )
  assert.equal(state.rows[state.index].id, 'here', 'the selection is the row you are already in')
  assert.equal(state.index, 1, 'which is not the top of the list')
  const rows = rowNodes()
  assert.equal(rows[0].children[0].textContent, 'touched later', 'the newer row keeps the top')
  assert.equal(rows[1].children[0].textContent, 'where I am', 'and the row you are in stays in its place')
  assert.deepEqual(
    rows.map((row) => (hereChip(row) ? hereChip(row).textContent : null)),
    [null, expectedLabel('current')],
    'the chip still says which row it is'
  )
  tap('Escape')
})

check('switching conversations never reorders the list', () => {
  seed([
    { id: 'a', displayTitle: 'first', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'second', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'third', updatedAt: ago(3) },
  ])
  tap('f')
  const before = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  tap('d')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().rows[2].id, 'c', 'the selection moved down')
  // The conversation on screen changes underneath the open window, as it does
  // when a switch lands: the list must keep the order the reader just learned.
  const feedRows = {
    a: { id: 'a', displayTitle: 'first', updatedAt: ago(1) },
    b: { id: 'b', displayTitle: 'second', updatedAt: ago(2), retainedBy: { mainView: 1 } },
    c: { id: 'c', displayTitle: 'third', updatedAt: ago(3) },
  }
  feed.publish(['a', 'b', 'c'], feedRows)
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    before,
    'the row order is untouched by where the window is pointing'
  )
  tap('Escape')
})

check('the state leads the row, and the here chip follows the name', () => {
  seed([
    { id: 'elsewhere', displayTitle: 'touched later', updatedAt: ago(0.01) },
    { id: 'here', displayTitle: 'where I am', updatedAt: ago(3), retainedBy: { mainView: 1 } },
  ])
  statusFeed.put('here', { running: false })
  statusFeed.put('here', { running: true })
  tap('f')
  const rows = rowNodes()
  // The row on screen is the second one: the attention block leads the list, so
  // the conversation that is actually running is not the one on screen here —
  // `elsewhere` is idle and `here` is in flight, which puts `here` first. The
  // check is about the columns, so it takes whichever row carries the tag.
  const hereAt = rows.findIndex((row) => hereChip(row))
  assert.ok(hereAt >= 0, 'the row on screen carries the chip')
  const tag = hereChip(rows[hereAt])
  const chip = stateChip(rows[hereAt])
  assert.ok(chip, 'and a state chip to lay out beside it')
  // The state is the row's first cell now: the window exists to answer "what
  // needs me", so the row answers it at the edge every row is read from. The
  // name follows, then the here tag, then the run of metadata.
  assert.equal(chip.style.gridColumn, '1', 'the state leads the row')
  assert.equal(tag.style.gridColumn, '3', 'the tag sits after the name')
  assert.equal(stageBox(rows[hereAt]).style.gridColumn, '4', 'and the stage after the tag')
  // Every row reserves the same columns, so the state and time of the other row
  // start at the same x as the ones on this row.
  assert.equal(rows[0].style.gridTemplateColumns, rows[1].style.gridTemplateColumns)
  const tracks = rightTracks(rows[hereAt])
  assert.equal(tracks.length, 4, `tag, stage, turns, time: got ${tracks.join(' | ')}`)
  assert.equal(
    tracks[0],
    tag.scrollWidth + 'px',
    'the tag column is fitted to the tag, like every other right-hand column'
  )
  assert.equal(tag.style.justifySelf, 'end', 'and the tag sits on the right of its column')
  assert.equal(tag.style.whiteSpace, 'nowrap', 'a measured cell is one line')
  assert.equal(chip.style.justifySelf, 'start', 'the state chip starts at the same x on every row')
  assert.ok(
    rows[hereAt].children.every((cell) => cell.style.gridRow === '1'),
    'the status leads visually without creating a second implicit grid row'
  )
  // The point of the whole move: a name behind a tag starts where every other
  // name starts, instead of after a prefix only that row was given.
  const name = rows[hereAt].children[0]
  assert.equal(name.style.gridColumn, '2', 'the name keeps its own column')
  assert.equal(
    rows[0].children[0].style.gridColumn,
    name.style.gridColumn,
    'and the other rows start their names at the same x'
  )
  tap('Escape')
})

check('with nothing on screen the tag column is not reserved', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  const rows = rowNodes()
  assert.equal(hereChip(rows[0]), null, 'no row claims to be where you are')
  assert.equal(
    rightTracks(rows[0]).length,
    3,
    'and the list keeps its three right-hand columns rather than an empty one'
  )
  tap('Escape')
})

check('a tag on one row costs every row the same column, not only that one', () => {
  // The price of the move, stated as an assertion so it cannot be forgotten:
  // the column is shared, so rows with no tag give up the width as well.
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  const bare = rightTracks(rowNodes()[0]).length
  tap('Escape')
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'here', updatedAt: ago(2), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const rows = rowNodes()
  assert.equal(rightTracks(rows[0]).length, bare + 1, 'one column more for the tag')
  assert.ok(hereChip(rows[1]), 'the row on screen carries the tag')
  assert.equal(hereChip(rows[0]), null, 'a row with nothing to say carries no tag')
  assert.equal(
    rows[0].style.gridTemplateColumns,
    rows[1].style.gridTemplateColumns,
    'and it reserves the same empty column, so the two rows still line up'
  )
  tap('Escape')
})

check('a conversation on screen that the filters hide reserves no column', () => {
  // Archived on purpose is archived: the row is not drawn, so a tag nobody can
  // read must not cost every other row a column.
  registry.publish(['gone'])
  seed([
    { id: 'gone', displayTitle: 'archived but on screen', updatedAt: ago(1), retainedBy: { mainView: 1 } },
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(2) },
  ])
  tap('f')
  const rows = rowNodes()
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['fresh'],
    'the hidden conversation is off the list'
  )
  assert.equal(
    rightTracks(rows[0]).length,
    3,
    'so its tag leaves no empty column behind'
  )
  tap('Escape')
})

check('the conversation on screen is loaded even when it is outside the window', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(0.01) },
    { id: 'stale', displayTitle: 'stale', updatedAt: ago(30) },
    { id: 'here', displayTitle: 'an old one I am in', updatedAt: ago(48), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['fresh', 'here'],
    'the row on screen is pulled into today, in its own place; the rest is behind More'
  )
  assert.equal(state.rows[state.index].id, 'here', 'and the selection is on it')
  assert.equal(headerCount(), '2 / 3', 'the header still counts what is hidden')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the rest is under the More seat'
  )
  tap('Escape')
})

check('a hidden conversation does not jump the queue', () => {
  // Archived on purpose is archived, even while it is the one on screen: the
  // filters are not something a row order may quietly override.
  registry.publish(['gone'])
  seed([
    { id: 'gone', displayTitle: 'archived but on screen', updatedAt: ago(1), retainedBy: { mainView: 1 } },
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.map((r) => r.id), ['fresh'], 'the filters still win')
  tap('Escape')
})

check('walking the list with the keys never reveals anything', () => {
  seed([
    { id: 'fresh1', displayTitle: 'fresh 1', updatedAt: ago(1) },
    { id: 'fresh2', displayTitle: 'fresh 2', updatedAt: ago(2) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(50) },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'moving inside the loaded rows changes nothing else')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 2)
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the older ones are behind More'
  )
  // The end of the list is not an instruction to fetch the next batch: the More
  // seat is on screen with the number behind it, so loading more is a press.
  // The walk reaches the seat, and standing on it loads nothing by itself.
  tap('d')
  const after = fakeWindow.__dshVim.palette()
  assert.equal(after.rows.length, 2, 'the down key must not add a single row')
  assert.equal(after.onMore, true, 'it steps onto the More seat, which is a place like any other')
  assert.equal(after.index, 1, 'and the row index stays where it was, behind the seat')
  assert.equal(headerCount(), '2 / 4', 'and the readout still says how much is hidden')
  assert.equal(sectionHeaders()[1].count, '2', 'the seat still counts what it is holding')
  tap('d')
  const wrapped = fakeWindow.__dshVim.palette()
  assert.equal(wrapped.onMore, false, 'stepping off the seat wraps round to the top')
  assert.equal(wrapped.rows[wrapped.index].id, 'fresh1', 'which is the first row')
  assert.equal(wrapped.rows.length, 2, 'nothing new was loaded along the way')
  tap('Escape')
})

check('clicking the More seat reveals the next batch and leaves the selection alone', () => {
  seed([
    { id: 'fresh1', displayTitle: 'fresh 1', updatedAt: ago(1) },
    { id: 'fresh2', displayTitle: 'fresh 2', updatedAt: ago(2) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(50) },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 2, 'nothing is loaded until it is asked for')
  assert.equal(moreHeadingNode().style.cursor, 'pointer', 'the seat offers a pointer while it has something to give')
  clickMore()
  const after = fakeWindow.__dshVim.palette()
  assert.equal(after.rows.length, 4, 'the press loads the rest')
  assert.equal(after.rows[after.index].id, 'fresh2', 'and the selection is still the row it was on')
  assert.equal(headerCount(), '4', 'a fully revealed list drops the loaded/total split')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'one More seat holds them all, under the browsing heading'
  )
  assert.equal(sectionHeaders()[1].count, null, 'a fully revealed More has no count left to give')
  // Nothing is left behind it, so it is a heading again: no pointer, and a press
  // on it does nothing at all.
  assert.notEqual(moreHeadingNode().style.cursor, 'pointer', 'an empty seat must not look clickable')
  const before = fakeWindow.__dshVim.palette()
  clickMore()
  assert.deepEqual(fakeWindow.__dshVim.palette().rows.length, before.rows.length, 'a press on it changes nothing')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and it never closes the window')
  tap('Escape')
})

check('the More seat loads one batch at a time, however much is behind it', () => {
  const old = []
  for (let i = 0; i < 25; i++) {
    old.push({ id: 'old' + i, displayTitle: 'old ' + i, updatedAt: ago(20 + i) })
  }
  seed([{ id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) }, ...old])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'only the recent one is up front')
  assert.equal(sectionHeaders()[1].count, '25', 'and the seat counts all of it')
  clickMore()
  const after = fakeWindow.__dshVim.palette()
  assert.equal(after.rows.length, 21, 'one press is one batch, not the whole archive')
  assert.equal(after.index, 0, 'the selection never moved to follow the new rows')
  assert.equal(sectionHeaders()[1].count, '5', 'what is left behind is counted down')
  clickMore()
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 26, 'and the next press takes the rest')
  assert.equal(sectionHeaders()[1].count, null, 'with nothing behind it the count is gone')
  tap('Escape')
})

check('the browsing heading reveals nothing, however it is pressed', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'old', updatedAt: ago(30) },
  ])
  tap('f')
  const heading = listNodes().find(
    (node) => node.__attrs['data-session-id'] === undefined && String(node.children[0].textContent) === expectedLabel('groupRecent')
  )
  assert.ok(heading, 'the browsing block has a heading of its own')
  assert.notEqual(heading.style.cursor, 'pointer', 'and it must not look like something to press')
  fireOn(heading, 'mousedown', { type: 'mousedown', preventDefault() {}, stopPropagation() {} })
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'pressing it adds nothing')
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'and moves nothing')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays')
  tap('Escape')
})

check('with no recent activity the newest batch is shown, not an empty window', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(30) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(40) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(50) },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 3, 'an idle day must not open an empty window')
  assert.deepEqual(state.rows.map((r) => r.id), ['a', 'b', 'c'])
  // The fallback is still history, so the heading must say so: the block answers
  // "did anything happen lately", and the answer here is "no". Calling these rows
  // "recent" is the one lie a heading can tell that the reader cannot check
  // without reading every row's timestamp.
  assert.equal(state.stale, true, 'the block must know it is showing history')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupHistory')],
    'and it must be named for what it holds, not for a window it never had'
  )
  tap('Escape')
})

check('a run the reader is watching keeps the window honest about the time', () => {
  // The bug this pins: freshness used to be counted after the attention blocks
  // had already taken their rows out of `rest`. On an afternoon whose only
  // recent activity was the run in flight, `rest` looked dead, the fallback
  // fired, and three-day-old conversations were listed under "Recent". The
  // window must measure the window against the whole pool, not against what is
  // left once the attention blocks have had their pick.
  seed([
    { id: 'busy', displayTitle: 'the run I am watching', updatedAt: ago(0.2) },
    { id: 'old1', displayTitle: 'three days ago', updatedAt: ago(72) },
    { id: 'old2', displayTitle: 'four days ago', updatedAt: ago(96) },
  ])
  statusFeed.put('busy', { running: true })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.stale, false, 'a run in flight is activity: the day is not quiet')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupLive'), expectedLabel('groupMore')],
    'the old rows stay behind the seat instead of landing under a Recent heading'
  )
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['busy'],
    'and the browsing block holds nothing, because nothing in it is recent'
  )
  assert.equal(sectionHeaders()[1].count, '2', 'the seat still offers the history')
  tap('Escape')
})

check('a row waiting on the reader also keeps the day from reading as quiet', () => {
  // Same scope question, the other attention block: an approval parked five
  // minutes ago is the newest thing in the pool even though it is not in `rest`.
  seed([
    { id: 'ask', displayTitle: 'waiting on you', updatedAt: ago(0.1) },
    { id: 'old', displayTitle: 'last week', updatedAt: ago(168) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.stale, false, 'something happened in the window, and the block must know it')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupMine'), expectedLabel('groupMore')],
    'the week-old row stays behind the seat rather than being dressed up as recent'
  )
  tap('Escape')
})

check('d and e move the selection and wrap at both ends', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  const index = () => fakeWindow.__dshVim.palette().index
  assert.equal(index(), 0, 'the newest row starts selected')
  tap('d')
  assert.equal(index(), 1)
  tap('d')
  tap('d')
  assert.equal(index(), 0, 'moving past the end wraps to the top')
  tap('e')
  assert.equal(index(), 2, 'moving past the top wraps to the bottom')
  tap('Escape')
})

check('the arrow keys move the selection too', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 2000 },
    { id: 'b', displayTitle: 'b', updatedAt: 1000 },
  ])
  tap('f')
  tap('ArrowDown')
  assert.equal(fakeWindow.__dshVim.palette().index, 1)
  tap('ArrowUp')
  assert.equal(fakeWindow.__dshVim.palette().index, 0)
  tap('Escape')
})

check('Enter switches to the selected conversation and closes', () => {
  opened.length = 0
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  tap('d')
  const chosen = fakeWindow.__dshVim.palette().rows[1].id
  tap('Enter')
  assert.deepEqual(opened, [chosen], 'the navigator must receive the selected id')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'the window closes after switching')
})

check('the palette key goes to the conversation it opened on', () => {
  opened.length = 0
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  tap('d')
  const chosen = fakeWindow.__dshVim.palette().rows[1].id
  tap('f')
  assert.deepEqual(opened, [chosen], 'f then f is one jump, not a close')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and the window gets out of the way')
})

check('Esc is the way out; the open key only ever goes somewhere', () => {
  opened.length = 0
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  tap('Escape')
  assert.deepEqual(opened, [], 'cancelling must not switch anything')
  assert.equal(fakeWindow.__dshVim.palette().open, false)

  // Nothing to go to: the key that opened the window does not close it either.
  // The window stays until you say so — that is the whole point of it.
  seed([])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'an empty window stays open')
  assert.deepEqual(opened, [], 'and still switches nothing')
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'Escape is the way out')
})

// --- renaming a conversation ------------------------------------------------

checkAsync('r turns the selected row into a name box, all of it selected', async () => {
  seed([{ id: 'a', displayTitle: 'first name', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the row must carry an editable name')
  assert.equal(box.value, 'first name', 'seeded with the name it has now')
  assert.deepEqual(box.__selection, [0, 'first name'.length], 'and selected, so typing replaces it')
  assert.equal(fakeDocument.activeElement, box, 'with the caret already in it')
})

checkAsync('Enter in the name box renames the conversation', async () => {
  seed([{ id: 'a', displayTitle: 'old name', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, '  new name  ')
  pressIn(box, 'Enter')
  await flush()
  assert.equal(renames.calls.length, 1, 'the host is asked exactly once')
  assert.equal(renames.calls[0].id, 'a', 'for the selected conversation')
  assert.equal(renames.calls[0].title, 'new name', 'with the name trimmed')
  // Retaining as mainView would clear the completion reminder, exactly as it
  // would for the turn-count peek: the private source is what keeps the row honest.
  assert.notEqual(renames.calls[0].source, 'mainView', 'and never as the main view')
  assert.equal(renameBox(), null, 'the box closes once the host accepted it')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'renaming is not navigating: the window stays')
})

checkAsync('Escape cancels the rename without asking the host', async () => {
  seed([{ id: 'a', displayTitle: 'keep me', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, 'discarded')
  pressIn(box, 'Escape')
  await flush()
  assert.deepEqual(renames.calls, [], 'nothing is sent')
  assert.equal(renameBox(), null, 'and the box is gone')
  assert.ok(rowNodes()[0].textContent.includes('keep me'), 'with the old name back on the row')
})

checkAsync('an empty name is refused and the box stays open', async () => {
  seed([{ id: 'a', displayTitle: 'a name', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, '   ')
  pressIn(box, 'Enter')
  await flush()
  assert.deepEqual(renames.calls, [], 'a nameless conversation is not a name to send')
  assert.equal(renameBox(), box, 'so the box stays open to be fixed')
  assert.ok(footerText().includes(expectedLabel('renameNoName')), 'and the footer says why')
})

checkAsync('a rejected rename shows the reason and keeps the name', async () => {
  renames.result = { ok: false, error: { message: 'the host said no' } }
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  typeIn(box, 'attempt')
  pressIn(box, 'Enter')
  await flush()
  assert.equal(renames.calls.length, 1, 'the attempt was made')
  assert.equal(renameBox(), box, 'the name is not thrown away on a failure')
  assert.ok(footerText().includes('the host said no'), 'and the host reason is on screen')
})

check('typing in the name box does not drive the window', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
  ])
  tap('f')
  tap('r')
  const box = renameBox()
  const before = fakeWindow.__dshVim.palette().index
  assert.equal(keydown('d', { target: box }), false, 'the letter belongs to the name')
  assert.equal(fakeWindow.__dshVim.palette().index, before, 'the selection must not move')
  assert.equal(keydown('f', { target: box }), false, 'and the open key must not jump away mid-edit')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays open')
})

// --- rebinding through the handler the user actually triggers ---------------

check('the plugin does not swallow a key aimed at a settings box', () => {
  // The real path has two halves, and the earlier checks only ever ran the
  // second one: the plugin's window capture listener sees the keydown FIRST
  // (capture runs before the target), and only then does the box's own handler
  // run. If the plugin ate the key there, no amount of working `onKeyDown`
  // would save the control — which is exactly the shape of "rebinding does not
  // work" a user reports.
  const box = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  assert.ok(box, 'the archive box must be on the page')
  fakeDocument.activeElement = box
  const prevented = keydown('a', { target: box })
  assert.equal(prevented, false, 'a key aimed at a settings field is the field\'s, not the plugin\'s')
  assert.equal(
    fakeWindow.__dshVim.settings().paletteArchiveKey,
    'g',
    'and the plugin must not have rebound anything on its own'
  )
})

check('pressing a key in a settings box rebinds that seat', () => {
  // The checks above call `props.onSet` directly, which skips the handler the
  // user actually drives. This one runs `onFocus` + `onKeyDown` — the pair the
  // DOM produces — so a broken recorder cannot hide behind a passing `onSet`.
  // The box is the inner `input`; `KeyRow` is the component around it.
  const boxes = settingsElements().filter(
    (e) => e.type === 'input' && typeof e.props.onKeyDown === 'function' && e.props.readOnly === true
  )
  assert.ok(boxes.length >= 12, `every rebindable seat needs a box, got ${boxes.length}`)
  const box = boxes.find((e) => e.props['aria-label'] === expectedLabel('paletteArchive'))
  assert.ok(box, 'the archive box must be on the page')
  assert.equal(box.props.value, 'G', 'it shows the shipped key before anything is pressed')

  box.props.onFocus()
  let blurred = false
  box.props.onKeyDown({
    key: 'a',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: {
      blur() {
        blurred = true
      },
    },
  })
  assert.equal(fakeWindow.__dshVim.settings().paletteArchiveKey, 'a', 'the pressed key must be stored')
  assert.ok(blurred, 'and the box must hand focus back so the next box is clickable')

  // And the page must show it, which is the part the user sees.
  const after = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  assert.equal(after.props.value, 'A', 'the box must read back the new key')
})

check('Escape in a settings box leaves the binding alone', () => {
  const box = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  box.props.onFocus()
  let blurred = false
  box.props.onKeyDown({
    key: 'Escape',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: {
      blur() {
        blurred = true
      },
    },
  })
  assert.equal(
    fakeWindow.__dshVim.settings().paletteArchiveKey,
    'g',
    'cancelling must not rebind anything'
  )
  assert.ok(blurred, 'but it still leaves the box')
})

check('a key that collides in its group is refused, and the page says so', () => {
  // The archive seat shares the task-window group, so taking the open key is a
  // conflict. The user has to be told: a box that silently does nothing reads
  // as a broken control.
  const box = settingsElements().find(
    (e) => e.type === 'input' && e.props['aria-label'] === expectedLabel('paletteArchive')
  )
  box.props.onFocus()
  box.props.onKeyDown({
    key: 'f',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    target: { blur() {} },
  })
  assert.equal(fakeWindow.__dshVim.settings().paletteArchiveKey, 'g', 'the collision must be refused')
  // The wording goes through the component's own error state, which is what the
  // page renders. Re-rendering here would start that state empty again — the
  // stub resets between renders — so the setter is read directly, which is the
  // same fact: `setError` was handed the conflict sentence.
  assert.ok(
    ReactStub.setters.includes(expectedLabel('conflict')),
    'and the conflict must be written on the page'
  )
})

// --- archiving the selected conversation -----------------------------------


checkAsync('g archives the selected conversation through the host', async () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  tap('d')
  assert.deepEqual(renderedRowIds(), ['a', 'b'], 'b is selected after one move down')
  tap('g')
  await flush()
  assert.equal(archives.calls.length, 1, 'the host archive action was called once')
  assert.equal(archives.calls[0].sessionId, 'b', 'and for the selected row, not the one on screen')
  assert.equal(archives.calls[0].stopActivity, false, 'and never with stopActivity')
  assert.ok(!renderedRowIds().includes('b'), 'the archived row leaves the list')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays open for the next one')
  assert.deepEqual(opened, [], 'archiving is not switching')
})

checkAsync('the archive key never stops a running turn', async () => {
  // The host refuses a busy session unless the caller asks it to stop the work.
  // This plugin must not ask: one keystroke destroying a running task is the
  // worst accident available here, which is the rule Escape already follows.
  seed([{ id: 'busy', displayTitle: 'busy', updatedAt: ago(1) }])
  archives.active.add('busy')
  tap('f')
  tap('g')
  await flush()
  assert.equal(archives.calls.length, 1, 'the attempt reached the host')
  assert.equal(archives.calls[0].stopActivity, false, 'without asking it to stop anything')
  assert.deepEqual(archives.stopped, [], 'so no work was stopped')
  assert.ok(renderedRowIds().includes('busy'), 'and the row is still there')
  assert.ok(
    footerText().includes(expectedLabel('archiveActive')),
    'the footer tells the user to stop it first'
  )
})

checkAsync('an unarchivable session keeps its row and shows the host reason', async () => {
  archives.failure = { error: { message: 'the host said no' } }
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  tap('g')
  await flush()
  assert.ok(renderedRowIds().includes('a'), 'a failure must not remove the row')
  assert.ok(footerText().includes('the host said no'), 'and the host reason is on screen')
})

check('the archive key cannot collide with the rest of its group', () => {
  assert.equal(
    fakeWindow.__dshVim.update({ paletteArchiveKey: 'f' }).error,
    'conflict',
    'the archive key shares the task window group'
  )
  assert.equal(fakeWindow.__dshVim.settings().paletteArchiveKey, 'g')
  assert.equal(
    fakeWindow.__dshVim.update({ paletteArchiveKey: 'o' }).error,
    'conflict',
    'and it may not take the switch key either'
  )
})

check('the footer advertises the archive key', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.ok(
    footerText().includes('g ' + expectedLabel('archive')),
    'the footer names the key that archives the selected conversation'
  )
  tap('Escape')
})

check('the rename key cannot collide with the rest of its group', () => {
  const rejected = fakeWindow.__dshVim.update({ paletteRenameKey: 'f' })
  assert.equal(rejected.error, 'conflict', 'the open key and the rename key are one group')
  assert.equal(fakeWindow.__dshVim.settings().paletteRenameKey, 'r')

  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  fakeWindow.__dshVim.update({ paletteRenameKey: 'n' })
  tap('f')
  tap('r')
  assert.equal(renameBox(), null, 'the old key must stop renaming')
  tap('n')
  assert.ok(renameBox(), 'and the new one must start')
  tap('Escape')
})

// --- the folder a conversation lives in -------------------------------------
//
// A folder is a label on a row now, not a container around rows. It used to be
// a block heading: one block per folder, in the registry's own order. That made
// the folder the unit the reader navigated in, and it had a cost that only
// showed on a busy day — the cap was spent folder by folder in registry order,
// so a busy folder could take the whole twenty and leave a quiet one with
// nothing, even when the quiet one held the newest conversations on the list.
// The block heading is gone; the prefix on every row is what carries the
// folder, and the list is ordered by recency alone.

check('every row names its own folder, and no heading says it for a group', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: 'G:\\桌面\\dsh-vim', sessionIds: ['a'] },
    { workspaceId: 'w2', title: 'api-service', path: 'G:\\work\\api-service', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'in a named folder', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'in another folder', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'loose', updatedAt: ago(3) },
  ])
  tap('f')
  const rows = rowNodes()
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent')],
    'there is one browsing heading, and it does not name a folder'
  )
  assert.equal(folderPrefix(rows[0]).textContent, 'dsh-vim', 'each row carries its own folder')
  assert.equal(folderPrefix(rows[1]).textContent, 'api-service', 'including the second folder')
  assert.equal(folderPrefix(rows[2]), null, 'and a row no folder accounts for carries none')
  assert.equal(nameText(rows[0]), 'in a named folder', 'the name still follows the prefix')
  tap('Escape')
})

check('the list is ordered by recency, not by folder', () => {
  registry.publish([], [
    { workspaceId: 'w2', title: 'second', path: 'G:\\work\\second', sessionIds: ['c'] },
    { workspaceId: 'w1', title: 'first', path: 'G:\\work\\first', sessionIds: ['a', 'b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(3) },
  ])
  tap('f')
  // The registry order is no longer the order of anything: `c` is newest and
  // leads, even though its folder is listed second, and `a` and `b` are no
  // longer held together as a block.
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['a', 'b', 'c'],
    'plain recency decides, whatever folder a row is in'
  )
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent')],
    'and no folder gets a heading of its own'
  )
  tap('Escape')
})

check('a busy folder cannot starve a quiet one out of the list', () => {
  // The bug this flattening fixes: the cap used to be spent folder by folder in
  // registry order, so thirty conversations in the first folder took the whole
  // batch and the second folder — holding the two newest conversations on the
  // list — never appeared at all.
  const busy = []
  for (let i = 0; i < 30; i++) busy.push('busy' + i)
  registry.publish([], [
    { workspaceId: 'w1', title: 'busy', path: 'G:\\work\\busy', sessionIds: busy },
    { workspaceId: 'w2', title: 'quiet', path: 'G:\\work\\quiet', sessionIds: ['q1', 'q2'] },
  ])
  const rows = busy.map((id, i) => ({ id, displayTitle: id, updatedAt: ago(1 + i * 0.01) }))
  rows.push({ id: 'q1', displayTitle: 'q1', updatedAt: ago(0.1) })
  rows.push({ id: 'q2', displayTitle: 'q2', updatedAt: ago(0.2) })
  seed(rows)
  tap('f')
  const shown = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  assert.ok(shown.includes('q1') && shown.includes('q2'), 'the newest conversations must be shown')
  assert.deepEqual(shown.slice(0, 2), ['q1', 'q2'], 'and being newest, they lead the list')
  tap('Escape')
})

check('More has one heading for many folders, so its rows name their own', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'dsh-vim', path: 'G:\\桌面\\dsh-vim', sessionIds: ['a', 'old1', 'old2'] },
    { workspaceId: 'w2', title: '', path: 'G:\\work\\api-service', sessionIds: ['old3'] },
  ])
  seed([
    { id: 'a', displayTitle: 'today', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'older one', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'older two', updatedAt: ago(30) },
    { id: 'old3', displayTitle: 'older three', updatedAt: ago(40) },
  ])
  tap('f')
  clickMore()
  const rows = rowNodes()
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the recent row is under the browsing heading, the older ones under the seat'
  )
  assert.equal(folderPrefix(rows[0]).textContent, 'dsh-vim', 'the recent row names its folder too')
  assert.equal(nameText(rows[0]), 'today', 'and the name follows the prefix')
  assert.equal(folderPrefix(rows[1]).textContent, 'dsh-vim', 'a row under More says which folder it is')
  assert.equal(folderPrefix(rows[2]).textContent, 'dsh-vim', 'as does its folder mate')
  assert.equal(
    folderPrefix(rows[3]).textContent,
    'api-service',
    'a folder with no title reads as its last segment'
  )
  assert.equal(nameText(rows[1]), 'older one', 'and the conversation name still follows it')
  tap('Escape')
})

check('the folder prefix is text in the name cell, not a column', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'a-much-longer-folder-name', path: 'G:\\work\\api', sessionIds: ['old'] }])
  seed([
    { id: 'a', displayTitle: 'a name', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'an older name', updatedAt: ago(40) },
  ])
  tap('f')
  const before = rowNodes()[0].style.gridTemplateColumns
  clickMore()
  const rows = rowNodes()
  const prefix = folderPrefix(rows[1])
  assert.ok(prefix, 'the row that arrived from More names its folder')
  assert.ok(!prefix.style.gridColumn, 'the prefix claims no grid line of its own')
  assert.equal(
    rows[1].children.some((cell) => cell.getAttribute('data-role') === 'folder'),
    false,
    'so it is not a cell of the row either, and cannot become a column by accident'
  )
  assert.equal(rows[1].children[0].style.gridColumn, '2', 'the name cell is still the name column')
  assert.equal(prefix.style.opacity, '0.5', 'and the prefix reads as dimmed text rather than as a badge')
  assert.ok(!prefix.style.background, 'a pill behind it would put the block back to what it was')
  // The price of the old column, now gone: pressing More cannot move a row that
  // was already on screen, because nothing that is already there is measured.
  assert.equal(
    rows[0].style.gridTemplateColumns,
    before,
    'the template the first row was laid out with is the one it keeps'
  )
  assert.equal(rows.length, 2, 'and the older row did arrive')
  tap('Escape')
})

check('the conversation name is dimmed, and the folder in front of it stays dimmer', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'a folder', path: 'G:\\work\\one', sessionIds: ['a'] }])
  seed([{ id: 'a', displayTitle: 'a name', updatedAt: ago(1) }])
  tap('f')
  const row = rowNodes()[0]
  const name = row.children[0].children.find((c) => c.getAttribute('data-role') === 'nameText')
  const prefix = folderPrefix(row)
  assert.equal(name.style.opacity, '0.72', 'the name is dimmed so a screen of them can be scanned')
  assert.equal(prefix.style.opacity, '0.5', 'and the folder label is dimmer still, being the qualifier')
  // The two must not multiply: the name is dimmed on its own span, so the
  // prefix inside the same cell keeps the opacity it was given.
  assert.ok(!row.children[0].style.opacity, 'the cell around them carries no opacity of its own')
  tap('Escape')
})

check('a conversation no folder accounts for is named by nothing', () => {
  registry.clear()
  seed([{ id: 'a', displayTitle: 'loose', updatedAt: ago(40) }])
  tap('f')
  tap('d')
  assert.equal(folderPrefix(rowNodes()[0]), null, 'no folder, so there is nothing to prefix')
  assert.equal(nameText(rowNodes()[0]), 'loose', 'and the name is still the whole of the name cell')
  tap('Escape')
})

check('a row being renamed shows the name box, not a prefix in front of it', () => {
  registry.publish([], [{ workspaceId: 'w1', title: 'dsh-vim', path: 'G:\\桌面\\dsh-vim', sessionIds: ['old'] }])
  seed([
    { id: 'a', displayTitle: 'today', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'older name', updatedAt: ago(40) },
  ])
  tap('f')
  clickMore()
  // Walk onto the More row and rename it: the input takes the whole name cell.
  tap('d')
  assert.equal(rowNodes()[1].getAttribute('data-session-id'), 'old')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the row under More can be renamed')
  assert.equal(folderPrefix(rowNodes()[1]), null, 'and the prefix steps aside for the box being typed into')
  assert.equal(box.style.gridColumn, '2', 'the name box is still the name column')
  tap('Escape')
})

check('the state is the first column, the name the second, the tag the third', () => {
  // Pinned rather than derived: a column added later would move every one of
  // these numbers, and nothing else in the suite would notice.
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'here', updatedAt: ago(2), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const rows = rowNodes()
  const tag = hereChip(rows[1])
  assert.ok(tag, 'the row on screen carries the tag')
  assert.equal(rows[1].children[0].style.gridColumn, '2', 'the conversation name is the second column')
  assert.equal(tag.style.gridColumn, '3', 'the tag is the third')
  assert.equal(stageBox(rows[1]).style.gridColumn, '4', 'the stage the fourth')
  assert.equal(rightTracks(rows[1]).length, 4, 'tag, stage, turns, time')
  assert.equal(rows[0].children[0].style.gridColumn, '2', 'and every other row starts its name at the same x')
  tap('Escape')
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  const bare = rowNodes()[0]
  assert.equal(hereChip(bare), null, 'no row claims to be where you are')
  assert.equal(rightTracks(bare).length, 3, 'so the list keeps its three right-hand columns')
  assert.equal(stageBox(bare).style.gridColumn, '3', 'and the stage moves into the gap the tag would have left')
  tap('Escape')
})

check('a host without a workspace registry still lists conversations', () => {
  registry.clear()
  seed([{ id: 'a', displayTitle: 'still here', updatedAt: ago(1) }])
  tap('f')
  assert.equal(nameText(rowNodes()[0]), 'still here', 'the row is just the name')
  assert.deepEqual(sectionNames(), [expectedLabel('groupRecent')], 'and the browsing heading is still there')
  tap('Escape')
})

// --- one heading per block, and none of them a folder ------------------------

check('the More heading says how much is behind it', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
    { id: 'old2', displayTitle: 'old 2', updatedAt: ago(30) },
    { id: 'old3', displayTitle: 'old 3', updatedAt: ago(40) },
  ])
  tap('f')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent'), expectedLabel('groupMore')],
    'the fresh one is under the browsing heading, the rest under the seat'
  )
  assert.equal(sectionHeaders()[1].count, '3', 'which counts them')
  clickMore()
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 4, 'the press on it loads them')
  assert.equal(sectionHeaders()[1].count, null, 'and the count goes away when nothing is left behind')
  tap('Escape')
})

check('a heading is not a row: it is never selectable', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  // One browsing heading and two rows, so a selection that counted elements
  // would be able to land on the heading. It must not: the movement keys walk
  // the rows. (Nothing is behind the seat here, so there is no seat.)
  assert.equal(listNodes().length, 3, 'the browsing heading and both rows')
  assert.equal(rowNodes().length, 2, 'but only the rows are rows')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'd moves between conversations')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'and wraps over the heading, not onto it')
  assert.equal(fakeWindow.__dshVim.palette().onMore, false, 'no heading is standable when nothing is behind it')
  tap('Escape')
})

// --- what is waiting on the reader, ahead of where things live ---------------

check('what is waiting on the reader leads the list', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'a folder', path: 'G:\\work\\one', sessionIds: ['idle', 'ask'] },
  ])
  seed([
    { id: 'idle', displayTitle: 'nothing owed', updatedAt: ago(1) },
    { id: 'ask', displayTitle: 'needs an answer', updatedAt: ago(2) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupMine'), expectedLabel('groupRecent')],
    'the attention block is its own heading, and the browsing rows keep theirs'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['ask', 'idle'],
    'the row that needs the reader comes first, however old it is'
  )
  tap('Escape')
})

check('a conversation waiting since yesterday is not hidden behind More', () => {
  // The point of reading the attention blocks off the whole pool: a debt older
  // than the recency window is the one most worth seeing, and a window that only
  // looked at the last twelve hours would file it under "More".
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'stuck', displayTitle: 'stuck since yesterday', updatedAt: ago(30) },
  ])
  statusFeed.put('stuck', { running: false, pendingInteraction: { kind: 'answer' } })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.rows.map((r) => r.id),
    ['stuck', 'fresh'],
    'the old debt is up front, not behind the seat'
  )
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupMine'), expectedLabel('groupRecent')],
    'and it is not under a More heading'
  )
  tap('Escape')
})

check('a row in the attention block is not repeated in the browsing block', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'a folder', path: 'G:\\work\\one', sessionIds: ['ask', 'idle'] },
  ])
  seed([
    { id: 'ask', displayTitle: 'needs an answer', updatedAt: ago(1) },
    { id: 'idle', displayTitle: 'nothing owed', updatedAt: ago(2) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const ids = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  assert.equal(ids.length, new Set(ids).size, 'no conversation appears twice')
  assert.deepEqual(ids, ['ask', 'idle'], 'the owed row is listed once, in the block that claims it')
  // A conversation pinned to the top must not also spend the browsing cap.
  const recent = fakeWindow.__dshVim.palette().sections.find((s) => s.kind === 'recent')
  assert.deepEqual(recent.ids, ['idle'], 'the browsing block no longer holds the row that moved up')
  tap('Escape')
})

check('the oldest debt comes first inside the waiting block', () => {
  seed([
    { id: 'newer', displayTitle: 'just asked', updatedAt: ago(0.1) },
    { id: 'older', displayTitle: 'asked a while ago', updatedAt: ago(3) },
  ])
  // Both were seen entering flight, so the block can order by how long they have
  // been waiting rather than by when they were last touched.
  statusFeed.put('older', { running: true })
  statusFeed.put('newer', { running: true })
  clock.advance(5 * 60 * 1000)
  statusFeed.put('older', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('newer', { running: false, pendingInteraction: { kind: 'answer' } })
  tap('f')
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['older', 'newer'],
    'the conversation that has been waiting longer is on top'
  )
  tap('Escape')
})

check('a conversation in flight is listed apart, and does not lead', () => {
  seed([
    { id: 'busy', displayTitle: 'running now', updatedAt: ago(1) },
    { id: 'idle', displayTitle: 'quiet', updatedAt: ago(2) },
  ])
  statusFeed.put('busy', { running: true })
  tap('f')
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupLive'), expectedLabel('groupRecent')],
    'the in-flight block is named, and the browsing rows keep their own heading'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['busy', 'idle'],
    'it is listed above the browsing rows'
  )
  tap('Escape')
})

check('the in-flight block is dimmed, and a waiting row is not', () => {
  seed([
    { id: 'busy', displayTitle: 'running now', updatedAt: ago(1) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: ago(2) },
  ])
  statusFeed.put('busy', { running: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const rows = rowNodes()
  const order = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  assert.deepEqual(order, ['ask', 'busy'], 'the waiting row leads')
  // The dimming is the whole difference between "this wants you" and "this is
  // merely moving": same row, same columns, less weight.
  assert.ok(!rows[0].style.opacity, 'a row waiting on the reader is at full weight')
  assert.equal(rows[1].style.opacity, '0.62', 'a row in flight is dimmed')
  tap('Escape')
})

check('the window opens on the first thing waiting on the reader', () => {
  seed([
    { id: 'top', displayTitle: 'newest but quiet', updatedAt: ago(1) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: ago(9) },
  ])
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows[state.index].id, 'ask', 'the selection lands on what is owed, not on the newest row')
  tap('Escape')
})

check('with nothing owed the window opens where the reader already is', () => {
  seed([
    { id: 'newest', displayTitle: 'newest', updatedAt: ago(1) },
    { id: 'here', displayTitle: 'where I am', updatedAt: ago(4), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows[state.index].id, 'here', 'the fallback is the old behaviour, unchanged')
  tap('Escape')
})

check('dealing with one row makes the next press land on the next owed one', () => {
  seed([
    { id: 'first', displayTitle: 'first debt', updatedAt: ago(9) },
    { id: 'second', displayTitle: 'second debt', updatedAt: ago(1) },
  ])
  statusFeed.put('first', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('second', { running: false, pendingInteraction: { kind: 'answer' } })
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].id, 'first', 'the older debt is on top')
  // The reader deals with it: the approval is given, so the turn resumes and the
  // row is no longer waiting. That is the queue behaviour — no key, no bookmark.
  statusFeed.put('first', { running: true })
  tap('Escape')
  tap('f')
  assert.equal(
    fakeWindow.__dshVim.palette().rows[0].id,
    'second',
    'the next press opens on the next thing owed'
  )
  tap('Escape')
})

check('the headline says what is waiting, and can say nothing is', () => {
  seed([{ id: 'busy', displayTitle: 'running', updatedAt: ago(1) }])
  statusFeed.put('busy', { running: true })
  tap('f')
  assert.equal(
    fakeWindow.__dshVim.palette().headline,
    '1 ' + expectedLabel('headLive'),
    'a running turn is reported as in flight, not as waiting on the reader'
  )
  tap('Escape')
  // Nothing owed and nothing moving: the window can say so, which is the one
  // thing a header of raw counts could never do.
  seed([{ id: 'quiet', displayTitle: 'quiet', updatedAt: ago(1) }])
  tap('f')
  assert.equal(
    fakeWindow.__dshVim.palette().headline,
    expectedLabel('headQuiet'),
    'the quiet case gets a sentence, not a count'
  )
  tap('Escape')
})

check('the More seat can be reached with the movement keys', () => {
  const older = []
  for (let i = 1; i <= 21; i++) {
    older.push({ id: 'old' + i, displayTitle: 'old ' + i, updatedAt: ago(20 + i) })
  }
  seed([{ id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) }, ...older])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'only the fresh one is loaded')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'd walks onto the seat, which has something behind it')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 1, 'standing on it loads nothing by itself')
  // Confirming while standing on it is what opens it, so the keyboard reaches
  // the older conversations without any key gaining a second meaning.
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.rows.length, 21, 'the press revealed a batch')
  assert.equal(state.onMore, true, 'and with more still behind it, the cursor stays on the seat')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, false, 'stepping down leaves the seat for a row')
  tap('Escape')
})

check('the seat is not a row: no key acts on the row it stands in front of', () => {
  const older = []
  for (let i = 1; i <= 21; i++) {
    older.push({ id: 'old' + i, displayTitle: 'old ' + i, updatedAt: ago(20 + i) })
  }
  seed([{ id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) }, ...older])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'the cursor is on the seat')
  // Confirming on the seat opens the seat. It must never travel to the row the
  // seat is drawn in front of — that is the conversation the reader has already
  // stepped past.
  opened.length = 0
  tap('Enter')
  assert.deepEqual(opened, [], 'confirming on the seat opens the seat, never the row above it')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'and the cursor is still on the seat')
  assert.equal(fakeWindow.__dshVim.palette().rows.length, 21, 'the seat gave up its batch')
  // The keys that act on "the selected conversation" must find nothing to act
  // on, rather than silently grabbing the row behind the seat.
  tap('r')
  assert.equal(
    listNodes().some((node) => node.children[0] && node.children[0].tagName === 'INPUT'),
    false,
    'rename finds no conversation under the cursor and opens no name box'
  )
  tap('Escape')
})

check('the seat stops being a place once nothing is behind it', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().onMore, true, 'there is something behind it, so it can be stood on')
  // That batch was the last one, so the seat is no longer a place to stand: the
  // cursor comes off it and onto the first row it revealed, rather than staying
  // on a heading that has nothing left to give.
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.equal(state.onMore, false, 'the seat is gone once it is empty')
  assert.equal(state.rows.length, 2, 'and the batch it revealed is on screen')
  assert.equal(state.rows[state.index].id, 'old1', 'with the cursor on the first row it revealed')
  tap('Escape')
})

check('the footer says how to reach the seat while it has something behind it', () => {
  seed([
    { id: 'fresh', displayTitle: 'fresh', updatedAt: ago(1) },
    { id: 'old1', displayTitle: 'old 1', updatedAt: ago(20) },
  ])
  tap('f')
  assert.ok(footerText().includes(expectedLabel('moreHint')), 'the hint names the seat while it can be reached')
  tap('Escape')
  // A list with nothing behind the seat must not advertise one.
  seed([{ id: 'only', displayTitle: 'only', updatedAt: ago(1) }])
  tap('f')
  assert.ok(!footerText().includes(expectedLabel('moreHint')), 'and drops it when there is nothing to reach')
  tap('Escape')
})

check('a clock under a minute shows no duration at all', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(59 * 1000)
  tap('f')
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')]],
    'under a minute there is no duration worth reading, so none is shown'
  )
  clock.advance(1000)
  assert.deepEqual(
    renderedStatuses(),
    [[liveChip('statusRunning', 1)]],
    'and the first whole minute appears'
  )
  tap('Escape')
})

check('a press on a heading switches nothing and moves nothing', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'folder one', path: 'G:\\work\\one', sessionIds: ['a'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'old', updatedAt: ago(30) },
  ])
  tap('f')
  opened.length = 0
  const heading = listNodes().find((node) => node.__attrs['data-session-id'] === undefined)
  assert.ok(heading, 'a heading is on screen')
  fireOn(heading, 'mousedown', { preventDefault() {}, stopPropagation() {} })
  assert.deepEqual(opened, [], 'a heading is not a conversation to travel to')
  assert.equal(fakeWindow.__dshVim.palette().index, 0, 'and it is not a row the selection can land on')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the window stays up')
  tap('Escape')
})

check('a conversation pulled into the window is kept, and the order is recency', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'first', path: 'G:\\work\\first', sessionIds: ['a', 'old'] },
    { workspaceId: 'w2', title: 'second', path: 'G:\\work\\second', sessionIds: ['b'] },
  ])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'old', displayTitle: 'the one I am in', updatedAt: ago(40), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  // The pull-in must not become a new sort key: the list is ordered by recency,
  // and "where I am" is added to the block without being moved to the front of
  // it — or the list would reshuffle every time the reader switched.
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['a', 'b', 'old'],
    'the pulled-in row is loaded without jumping the queue'
  )
  assert.deepEqual(
    sectionNames(),
    [expectedLabel('groupRecent')],
    'it joins the browsing block, which keeps its one heading'
  )
  assert.equal(fakeWindow.__dshVim.palette().rows[2].id, 'old', 'and the selection lands on it')
  tap('Escape')
})

check('the task window reports its own blocks to the console', () => {
  // Two lists, with two shapes: the task window is cut into attention blocks
  // plus one browsing block, and the model picker is a flat list. The debug
  // readout names the blocks so the cut can be read without counting elements —
  // a heading is not a row, and the selection index counts conversations only.
  registry.publish([], [{ workspaceId: 'w1', title: 'folder', path: 'G:\\work\\one', sessionIds: ['a'] }])
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'old', displayTitle: 'old', updatedAt: ago(30) },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(
    state.sections.map((section) => section.kind),
    ['recent', 'more'],
    'block by block, heading by heading'
  )
  assert.equal(state.sections[0].label, expectedLabel('groupRecent'), 'the browsing block names itself, not a folder')
  assert.deepEqual(state.sections[0].ids, ['a'], 'and says which conversations it holds')
  assert.equal(state.sections[0].count, 1, 'a block counts its rows')
  assert.equal(state.sections[1].label, expectedLabel('groupMore'), 'the other block is the More seat')
  assert.equal(state.sections[1].count, 1, 'which counts what is still behind it')
  assert.deepEqual(state.sections[1].ids, [], 'and holds nothing yet')
  tap('Escape')
})

check('opening the window does not reorder a folder for the row you are in', () => {
  registry.publish([], [
    { workspaceId: 'w1', title: 'folder', path: 'G:\\work\\one', sessionIds: ['a', 'b', 'c'] },
  ])
  seed([
    { id: 'a', displayTitle: 'newest', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'middle', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'oldest and current', updatedAt: ago(3), retainedBy: { mainView: 1 } },
  ])
  tap('f')
  const state = fakeWindow.__dshVim.palette()
  assert.deepEqual(state.rows.map((r) => r.id), ['a', 'b', 'c'], 'recency holds, inside the folder')
  assert.equal(state.index, 2, 'the selection is the row you are in, at the bottom')
  assert.ok(hereChip(rowNodes()[2]), 'and the chip marks it there')
  tap('Escape')
})

check('the window keeps the scroll keys wherever the pointer is parked', () => {
  // The result of a press must not depend on where the mouse was left: the
  // window owns `e`/`d` while it is open, over the card or over the page.
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 2000 },
    { id: 'b', displayTitle: 'b', updatedAt: 1000 },
  ])
  tap('f')
  movePointer(600, 300) // the conversation, not the card
  assert.equal(tap('d'), true, 'd belongs to the task window')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'and it moved the selection')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 0, 'nothing may scroll behind the window')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the window stays up')
  tap('Escape')
})

check('a press beside the window puts it away, and the page still gets the press', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  const host = body.children[body.children.length - 1]
  const card = cardNode()
  assert.equal(card.getAttribute('role'), 'dialog', 'the card is the dialog, not the backdrop')
  assert.equal(host.style.pointerEvents, 'none', 'the backdrop must not swallow clicks meant for the page')
  assert.equal(card.style.pointerEvents, 'auto', 'while the card itself stays clickable')
  assert.deepEqual(host.__listeners, {}, 'and the backdrop carries no handler of its own')
  // A click on the backdrop is a click on the page, so it reaches the page — and
  // the window, which the press was aimed past, goes with it.
  let swallowed = false
  fire('pointerdown', {
    type: 'pointerdown',
    target: host,
    button: 0,
    preventDefault() {
      swallowed = true
    },
    stopPropagation() {
      swallowed = true
    },
  })
  assert.equal(swallowed, false, 'the plugin must not swallow the press: the page still gets it')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and the window goes away with it')
  assert.equal(body.children.length, 0, 'which unmounts it')
})

check('a press on the card is the window talking, not a way out', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 2000 },
    { id: 'b', displayTitle: 'b', updatedAt: 1000 },
  ])
  tap('f')
  const at = fakeWindow.__dshVim.palette().index
  press(cardNode())
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the card is the window')
  assert.equal(fakeWindow.__dshVim.palette().index, at, 'and a press on it moves nothing')
  press(rowNodes()[0])
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'a row on the card is inside it too')
  press(body)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'while the page beside the card is not')
})

check('a press outside the task window closes it wherever it lands', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  // The sidebar is the page too: a press there still closes the window, and the
  // host's own click on it is not ours to stop.
  press(sidebar)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'the sidebar is outside the card')
  assert.equal(body.children.length, 0, 'and the window unmounts')
  tap('f')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and so is the conversation')
  assert.equal(body.children.length, 0, 'either way it is gone')
})

check('a right-button press outside leaves the window alone', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  // A right-click is asking the page for a menu; a window that vanished under it
  // would take the selection the menu was about to act on with it.
  fire('pointerdown', { type: 'pointerdown', target: transcript, button: 2 })
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'only the main button is a way out')
  fire('pointerdown', { type: 'pointerdown', target: transcript, button: 1 })
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the middle button is not one either')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'while the main button still is')
})

check('a press outside with a half-typed name closes the window and drops the name', () => {
  seed([{ id: 'a', displayTitle: 'keep me', updatedAt: ago(1) }])
  tap('f')
  tap('r')
  const box = renameBox()
  assert.ok(box, 'the row must be renaming')
  typeIn(box, 'half typed')
  // The name box is on the card, so a press in it is not a way out — otherwise
  // clicking into the name to fix a character would throw the name away.
  press(box)
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'a press in the name box is inside')
  assert.equal(renameBox(), box, 'and the draft is still being typed')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'a press outside closes, as Escape does at the window')
  assert.equal(renameBox(), null, 'and the half-typed name goes with it')
  assert.deepEqual(renames.calls, [], 'nothing is ever sent for a name nobody finished')
})

check('a press on the page changes nothing when no window is open', () => {
  assert.equal(fakeWindow.__dshVim.palette().open, false)
  assert.equal(fakeWindow.__dshVim.modelPick().open, false)
  press(transcript)
  press(sidebar)
  press(editor)
  assert.equal(body.children.length, 0, 'no window may open itself on a press')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'and none of them opened on the way')
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'either kind')
})

check('a running conversation is marked, and the window is real DOM', () => {
  seed([
    { id: 'a', displayTitle: 'busy one', updatedAt: 2000, running: true },
    { id: 'b', displayTitle: 'idle one', updatedAt: 1000 },
  ])
  tap('f')
  const host = body.children[body.children.length - 1]
  assert.ok(host, 'the window must be appended to the body')
  const list = host.children[0].children[1]
  // The list carries a heading above the "in flight" block now, so "one row per
  // conversation" is counted on the rows, not on the list's raw children.
  const rows = rowNodes()
  assert.equal(rows.length, 2, 'one row per conversation')
  assert.equal(rows[0].getAttribute('data-session-id'), 'a')
  assert.equal(rows[0].getAttribute('aria-selected'), 'true', 'the selected row is announced')
  assert.equal(rows[1].getAttribute('aria-selected'), 'false')
  assert.ok(list.textContent.includes('busy one'))
  tap('Escape')
  assert.equal(body.children.length, 0, 'closing must unmount the window')
})

check('an empty catalogue shows a placeholder instead of nothing', () => {
  seed([])
  tap('f')
  const host = body.children[body.children.length - 1]
  const list = host.children[0].children[1]
  assert.equal(list.children.length, 1)
  assert.ok(list.children[0].textContent.length > 0, 'the empty state must say something')
  assert.deepEqual(opened, [])
  tap('Enter')
  assert.deepEqual(opened, [], 'Enter on an empty list must not switch anything')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and it must stay open')
  tap('Escape')
})

check('a live feed update keeps the selection on the same conversation', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  ])
  tap('f')
  tap('d')
  assert.equal(fakeWindow.__dshVim.palette().index, 1)
  // A new conversation arrives and outranks everything.
  feed.publish(['z', 'a', 'b', 'c'], {
    z: { id: 'z', displayTitle: 'brand new', updatedAt: 9000 },
    a: { id: 'a', displayTitle: 'a', updatedAt: 3000 },
    b: { id: 'b', displayTitle: 'b', updatedAt: 2000 },
    c: { id: 'c', displayTitle: 'c', updatedAt: 1000 },
  })
  const after = fakeWindow.__dshVim.palette()
  assert.deepEqual(after.rows.map((r) => r.id), ['z', 'a', 'b', 'c'], 'the new row must sort in')
  assert.equal(after.rows[after.index].id, 'b', 'the selection must still be the same conversation')
  tap('Escape')
})

check('the feed subscription is dropped when the window closes', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  assert.equal(feed.listeners.length, 1, 'an open window listens to the feed')
  tap('Escape')
  assert.equal(feed.listeners.length, 0, 'closing must unsubscribe')
})

check('typing next to the window leaves the window where it is', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  assert.equal(keydown('f', { target: composer }), false, 'the letter belongs to the field')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the window stays up while you type')
  tap('Escape')
})

check('losing the window leaves the task window up', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  tap('f')
  for (const l of listeners.slice()) if (l.type === 'blur') l.fn({})
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'alt-tabbing away must not take it down')
  // The tab going away is the same story as the window going away.
  fire('visibilitychange', { type: 'visibilitychange', target: fakeDocument })
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'nor may switching tabs')
  tap('Escape')
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'Escape still closes it')
})

check('the task-window key stays inert while the composer has focus', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000 }])
  const swallowed = keydown('f', { target: composer })
  assert.equal(swallowed, false, 'f must reach the composer untouched')
  assert.equal(fakeWindow.__dshVim.palette().open, false)
})

check('Escape takes focus back out of the composer', () => {
  fakeDocument.activeElement = composer
  keydown('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 0, 'a focused composer withholds the scroll keys')
  keydown('Escape')
  assert.equal(blurCount, 1, 'Escape must blur the composer')
  assert.equal(fakeDocument.activeElement, body)
  keydown('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > 0, 'and the scroll keys must work again straight away')
})

check('Escape the shell already claimed is left to the shell', () => {
  fakeDocument.activeElement = composer
  keydown('Escape', { defaultPrevented: true })
  assert.equal(blurCount, 0, 'a handled Escape must not steal focus')
  assert.equal(fakeDocument.activeElement, composer)
})

check('Escape only blurs a focused editable', () => {
  fakeDocument.activeElement = button
  keydown('Escape')
  assert.equal(blurCount, 0, 'a focused button is not the composer')
  fakeDocument.activeElement = composer
  keydown('Escape', { shiftKey: true })
  assert.equal(blurCount, 0, 'a modified Escape is a different gesture')
  keydown('Escape', { key: 'd' })
  assert.equal(blurCount, 0, 'other keys are untouched')
})

check('the Escape gesture can be turned off', () => {
  fakeWindow.__dshVim.update({ escapeBlurs: false })
  assert.equal(fakeWindow.__dshVim.settings().escapeBlurs, false)
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0, 'the setting must actually gate the blur')
})

check('the settings page exposes the Escape gesture', () => {
  const choice = settingsElements().find(
    (e) => Array.isArray(e.props.options) && e.props.options.some((o) => o.value === 'on')
  )
  assert.ok(choice, 'the toggle must be on the page')
  assert.equal(choice.props.value, 'on', 'shipped default is on')
  choice.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().escapeBlurs, false)
  choice.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().escapeBlurs, true)
})

check('arriving never leaves the caret in the message box', () => {
  // The host focuses the box from a render effect on first load, on a switch
  // and when a run ends. All three arrive here the same way: a focusin with no
  // gesture behind it.
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the box must give the keyboard back')
  assert.equal(fakeDocument.activeElement, body, 'and the scroll keys must already work')
  tap('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > 0, 'no key press needed to be productive again')
})

check('switching from the task window leaves focus out of the message box', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  tap('Enter')
  assert.deepEqual(opened, ['a'], 'the selected conversation opens')
  // The box is focused from a render effect, so it arrives after the switch
  // returned; the switch itself must not license it either.
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the switch must not hand the box the keyboard')
  assert.equal(fakeDocument.activeElement, body)
})

check('the box never takes the keyboard by itself, however long it waits', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  tap('Enter')
  clock.advance(5000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the rule stands, it is not a window that expires')
  assert.equal(fakeDocument.activeElement, body)
  // A run ending is the other moment the host reaches for the box.
  clock.advance(30000)
  shellFocus(editor)
  assert.equal(editorBlurs, 2, 'and it holds for the end of a turn too')
})

check('a clipboard tool that brings the window forward keeps the caret', () => {
  // Ditto and the dictation tools work by bringing this window to the front and
  // then *typing* Ctrl+V — they never click into the box. The focus that lands
  // there is theirs, a side effect of the return, and it has to survive long
  // enough for the key they are about to press; refusing it is what made the
  // automatic paste land nowhere while a manual Ctrl+V still worked.
  blurWindow()
  refocusWindow()
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'the box keeps the caret the tool is about to paste into')
  assert.equal(fakeDocument.activeElement, editor, 'which is where the paste goes')
  // The key itself is a chord, so the plugin never claims it.
  assert.equal(keydown('v', { target: editor, ctrlKey: true }), false, 'Ctrl+V is left to the host')
})

check('a focus long after the return is still given back', () => {
  // The licence is for the moment of returning, not for the rest of the session:
  // the shell's render effect reaching for the box a while later is the same
  // rule as ever.
  blurWindow()
  refocusWindow()
  clock.advance(2000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'a late focus is not the tail of the return')
  assert.equal(fakeDocument.activeElement, body, 'so the scroll keys stay live')
})

check('the returned window does not license the box forever', () => {
  // One return, one grace: a focus arriving without a return of its own still
  // meets the standing rule, so the "your fingers get it back" promise holds.
  blurWindow()
  refocusWindow()
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'the tool keeps the caret it asked for')
  clock.advance(2000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the next unrequested focus is refused again')
})

// --- what a send does to the keyboard ---------------------------------------

check('sending hands the keyboard back to the page', () => {
  // The box holds DOM focus across a send: the host's own focus lands on the
  // element it is already on, which changes nothing and raises no focusin. The
  // guard on focus events has nothing to catch here, so this one moment is
  // answered by a blur of the plugin's own — and the caret the typing had
  // licensed is spent by the send that made the draft leave.
  tap(' ')
  editor.textContent = 'a message'
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, false, 'the key is still the host\'s to send with')
  clock.advance(1)
  assert.equal(editorBlurs, 1, 'the box must give the keyboard back')
  assert.equal(fakeDocument.activeElement, body, 'and no Escape is needed to be productive again')
  tap('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > 0, 'd scrolls on the very next keypress')
  // The key this started from: f is a letter the box would otherwise swallow.
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and f opens the task window')
  editor.textContent = ''
})

check('a host focus behind the send is refused like any other', () => {
  tap(' ')
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  // The shell reaching for the box a beat later is nothing the send licensed,
  // so the standing rule answers it on its own.
  shellFocus(editor)
  clock.advance(500)
  assert.equal(editorBlurs, 1, 'one blur, whichever of the two gets there first')
  assert.equal(fakeDocument.activeElement, body)
  editor.textContent = ''
})

check('asking for the keyboard again vetoes the hand-back', () => {
  tap(' ')
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  // A user who wants to keep writing asks for the box again before the probes
  // land; that is a veto, not a suggestion.
  tap(' ')
  clock.advance(500)
  assert.equal(fakeDocument.activeElement, editor, 'the box keeps what was asked for')
  assert.equal(editorBlurs, 0, 'so nothing pulls the caret back out of it')
  editor.textContent = ''
})

check('three keys that look like a send are not one', () => {
  tap(' ')
  // An empty box: Enter has nothing to send, so the caret stays.
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'nothing typed, nothing sent')
  assert.equal(fakeDocument.activeElement, editor)

  // A candidate list: Enter takes the highlighted entry and keeps the draft.
  editor.textContent = '/plan'
  setMenuOnScreen(true)
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'the list arbitrates the key, so the box keeps it')
  setMenuOnScreen(false)

  // A line break: the message is not going anywhere.
  keydown('Enter', { target: editor, shiftKey: true })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'breaking a line must not take the keyboard')
  editor.textContent = ''
})

check('a key an IME is assembling is never read as a send', () => {
  tap(' ')
  editor.textContent = '半个'
  // Taking the caret away mid-word would cost the user the input they are
  // still composing, which is the one outcome worth any amount of guarding.
  keydown('Enter', { target: editor, isComposing: true })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'the composing key belongs to the IME')
  assert.equal(fakeDocument.activeElement, editor)
  editor.textContent = ''
})

check('Ctrl+Enter sends in every mode, and brings the keyboard back with it', () => {
  // In the other two modes Enter is the plugin's own line break, so the host's
  // accelerator is the only send left — and it has to be seen past the guard
  // that keeps chords out of the page.
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  tap(' ')
  editor.textContent = 'a message'
  const prevented = keydown('Enter', { target: editor, ctrlKey: true })
  assert.equal(prevented, false, 'the host keeps its own send accelerator')
  clock.advance(500)
  assert.equal(editorBlurs, 1, 'and the keyboard still comes back')
  assert.equal(fakeDocument.activeElement, body)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  editor.textContent = ''
})

check('the post-send hand-back is a setting, and off means the host wins', () => {
  fakeWindow.__dshVim.update({ sendBlurs: false })
  tap(' ')
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 0, 'the caret may stay in the box')
  assert.equal(fakeDocument.activeElement, editor, 'exactly as the host left it')
  fakeWindow.__dshVim.update({ sendBlurs: true })
  editor.textContent = ''
})

check('a plain field is never touched, only the rich-text box', () => {
  // A settings panel or a sidebar search that focuses its own input when it
  // opens is the host's business: only the box that swallows d / e / f is
  // protected, and in this host that is the one rich-text editor there is.
  const field = el({ tag: 'INPUT', className: 'search-field' })
  shellFocus(field)
  assert.equal(fakeDocument.activeElement, field, 'an input keeps its focus')
  shellFocus(composer)
  assert.equal(fakeDocument.activeElement, composer, 'a plain textarea keeps it too')
})

check('a field inside a dialog may take focus for itself', () => {
  shellFocus(modalEditor)
  assert.equal(fakeDocument.activeElement, modalEditor, 'a dialog is a shell of its own')
  assert.equal(editorBlurs, 0)
})

check('the focus key puts the keyboard in the message box', () => {
  const swallowed = tap(' ')
  assert.ok(swallowed, 'the key belongs to the plugin, not to the page')
  assert.equal(fakeDocument.activeElement, editor, 'and it lands in the box')
  // The request made on the way in means a focus arriving right after is still
  // the user's, so the guard leaves the box alone.
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'typing must not be interrupted by the guard')
  assert.equal(fakeDocument.activeElement, editor)
})

check('the focus key is dead while a text field holds focus', () => {
  fakeDocument.activeElement = composer
  const before = blurCount
  const swallowed = keydown(' ', { target: composer })
  assert.equal(swallowed, false, 'space must reach the field as a character')
  assert.equal(blurCount, before, 'only the rich-text box may be left this way')
  assert.notEqual(fakeDocument.activeElement, editor)
})

check('Space still presses a focused button', () => {
  fakeDocument.activeElement = button
  const swallowed = keydown(' ', { target: button })
  assert.equal(swallowed, false, 'a focused button keeps its own Space')
  assert.notEqual(fakeDocument.activeElement, editor, 'and nothing jumps to the box')
})

check('the focus key leaves the empty message box', () => {
  fakeDocument.activeElement = editor
  const before = editorBlurs
  const scrolled = transcript.scrollTop
  const swallowed = tap(' ')
  assert.equal(swallowed, true, 'the key belongs to the plugin, not to the box')
  assert.equal(editorBlurs, before + 1, 'an empty box must give the keyboard back')
  assert.equal(fakeDocument.activeElement, body, 'and the caret must be out of it')
  assert.equal(fakeWindow.__dshVim.probe().composer.empty, true, 'the box must read as empty')
  tap('d')
  clock.advance(1000)
  assert.ok(transcript.scrollTop > scrolled, 'the scroll keys come back with the focus')
})

check('the focus key types a Space once the box has something in it', () => {
  editor.textContent = 'working on it'
  fakeDocument.activeElement = editor
  const before = editorBlurs
  const swallowed = keydown(' ', { target: editor })
  assert.equal(swallowed, false, 'Space must reach the box as a character')
  assert.equal(editorBlurs, before, 'a draft must not cost the user their keyboard')
  assert.equal(fakeDocument.activeElement, editor)
  editor.textContent = ''
  fakeDocument.activeElement = body
})

check('a box of nothing but whitespace still counts as empty', () => {
  // An empty Lexical root is a paragraph with a line break in it, so the blank
  // text that arrives here is the shape of "nothing typed".
  editor.textContent = '\n\n'
  fakeDocument.activeElement = editor
  const before = editorBlurs
  const swallowed = tap(' ')
  assert.equal(swallowed, true)
  assert.equal(editorBlurs, before + 1, 'blank text is not a draft')
  editor.textContent = ''
  fakeDocument.activeElement = body
})

check('holding the focus key does not toggle the box in and out', () => {
  fakeDocument.activeElement = editor
  assert.equal(tap(' '), true, 'the first press leaves the empty box')
  assert.equal(fakeDocument.activeElement, body)
  const before = editorBlurs
  const swallowed = keydown(' ', { repeat: true })
  assert.equal(swallowed, true, 'a repeat is not a second press, and not a page scroll')
  assert.equal(fakeDocument.activeElement, body, 'so the box must stay out of the way')
  assert.equal(editorBlurs, before)
  // A box that kept its focus is a different story: there the repeats are
  // characters, and the plugin must not get in their way.
  editor.textContent = 'still typing'
  fakeDocument.activeElement = editor
  assert.equal(keydown(' ', { repeat: true, target: editor }), false, 'Space keeps working in a draft')
  editor.textContent = ''
  fakeDocument.activeElement = body
})

check('the leave gesture follows the rebound focus key', () => {
  fakeWindow.__dshVim.update({ focusKey: 'b' })
  fakeDocument.activeElement = editor
  const before = editorBlurs
  assert.equal(tap('b'), true, 'the new key leaves the empty box too')
  assert.equal(editorBlurs, before + 1)
  // The old key is only ever a character from here on.
  fakeDocument.activeElement = editor
  const kept = editorBlurs
  assert.equal(keydown(' ', { target: editor }), false, 'the old key is a plain Space again')
  assert.equal(editorBlurs, kept, 'and it must not take the box away')
  fakeDocument.activeElement = body
  fakeWindow.__dshVim.update({ focusKey: ' ' })
})

check('the leave gesture can be turned off', () => {
  fakeWindow.__dshVim.update({ spaceBlurs: false })
  assert.equal(fakeWindow.__dshVim.settings().spaceBlurs, false)
  fakeDocument.activeElement = editor
  const before = editorBlurs
  assert.equal(keydown(' ', { target: editor }), false, 'the setting must gate the gesture')
  assert.equal(editorBlurs, before, 'the box keeps the keyboard')
  assert.equal(fakeDocument.activeElement, editor)
  fakeDocument.activeElement = body
  fakeWindow.__dshVim.update({ spaceBlurs: true })
})

check('clicking the box asks for it, clicking elsewhere takes the offer back', () => {
  press(editor)
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'a press inside a field is a request')
  assert.equal(fakeDocument.activeElement, editor)
  // Clicking a conversation a moment later supersedes that request.
  press(sidebar)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the next focus is the host talking, not the user')
  assert.equal(fakeDocument.activeElement, body)
})

check('a request the window outlives is not honoured', () => {
  tap(' ')
  assert.equal(fakeDocument.activeElement, editor)
  clock.advance(2000)
  shellFocus(editor)
  assert.equal(editorBlurs, 1, 'the user has moved on, so the host is refused again')
})

check('the focus key is rebindable, and cannot collide with the scroll keys', () => {
  const rejected = fakeWindow.__dshVim.update({ focusKey: 'd' })
  assert.equal(rejected.error, 'conflict', 'a scroll key must not double as the focus key')
  assert.equal(fakeWindow.__dshVim.settings().focusKey, ' ')

  const applied = fakeWindow.__dshVim.update({ focusKey: 'b' })
  assert.equal(applied.focusKey, 'b')
  tap('b')
  assert.equal(fakeDocument.activeElement, editor, 'the new key focuses the box')
  fakeDocument.activeElement = body
  tap(' ')
  assert.notEqual(fakeDocument.activeElement, editor, 'and the old one stops doing it')
  fakeWindow.__dshVim.update({ focusKey: ' ' })
})

check('the no-auto-focus behaviour can be turned off', () => {
  fakeWindow.__dshVim.update({ switchBlurs: false })
  assert.equal(fakeWindow.__dshVim.settings().switchBlurs, false)
  shellFocus(editor)
  assert.equal(editorBlurs, 0, 'the setting must actually gate the guard')
  assert.equal(fakeDocument.activeElement, editor, 'and the host behaviour comes back')
})

check('the settings page exposes every focus behaviour', () => {
  const toggles = settingsElements().filter(
    (e) => Array.isArray(e.props.options) && e.props.options.some((o) => o.value === 'on')
  )
  assert.equal(toggles.length, 4, 'Escape, the empty box, the switch and the post-send hand-back each get a toggle')
  assert.deepEqual(
    toggles.map((t) => t.props.value),
    ['on', 'on', 'on', 'on'],
    'all four ship on'
  )
  const byLabel = (key) => toggles.find((t) => t.props.label === expectedLabel(key))
  assert.ok(byLabel('escapeBlurs'), 'the Escape toggle must be on the page')
  const spaceToggle = byLabel('spaceBlurs')
  assert.ok(spaceToggle, 'the empty-box toggle must be on the page')
  spaceToggle.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().spaceBlurs, false)
  spaceToggle.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().spaceBlurs, true)
  const switchToggle = byLabel('switchBlurs')
  assert.ok(switchToggle, 'the switch toggle must be on the page')
  switchToggle.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().switchBlurs, false)
  switchToggle.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().switchBlurs, true)
  const sendToggle = byLabel('sendBlurs')
  assert.ok(sendToggle, 'the post-send hand-back toggle must be on the page')
  sendToggle.props.onSet('off')
  assert.equal(fakeWindow.__dshVim.settings().sendBlurs, false)
  sendToggle.props.onSet('on')
  assert.equal(fakeWindow.__dshVim.settings().sendBlurs, true)
})

check('Escape stays the shell\'s while a turn is running', () => {
  // The shell identifies the visible conversation by main-view retention.
  seed([
    { id: 'main', displayTitle: 'the visible one', updatedAt: ago(1), retainedBy: { mainView: 1 } },
    { id: 'other', displayTitle: 'a background one', updatedAt: ago(2), running: true },
  ])
  statusFeed.put('main', { running: true })
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0, 'the plugin must not touch Escape while a turn is in flight')
  assert.equal(fakeDocument.activeElement, composer, 'so the shell can stop the turn')

  // Only the visible conversation counts. A background run must not disarm it.
  statusFeed.put('main', { running: false })
  statusFeed.put('other', { running: true })
  keydown('Escape')
  assert.equal(blurCount, 1, 'a running background conversation is none of our business')
})

check('the catalogue running flag is the fallback when no status is published', () => {
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 }, running: true }])
  assert.equal(statusFeed.map.size, 0, 'no status entry, so the catalogue has to answer')
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0, 'a running turn must be protected even without the status source')
})

check('Escape takes focus back once the run is over', () => {
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 }, running: true }])
  fakeDocument.activeElement = composer
  keydown('Escape')
  assert.equal(blurCount, 0)
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 }, running: false }])
  keydown('Escape')
  assert.equal(blurCount, 1, 'the block is only while it is actually running')
})

check('the empty box can be left mid-run, where Escape cannot', () => {
  // The shell stops a running turn on Escape, so the plugin stays out of that
  // key. The focus key never reaches the shell, which is what makes it the way
  // out of the box while work is in flight — the moment it is worth most.
  seed([{ id: 'main', displayTitle: 'main', updatedAt: ago(1), retainedBy: { mainView: 1 } }])
  statusFeed.put('main', { running: true })
  fakeDocument.activeElement = editor
  const before = editorBlurs
  assert.equal(tap(' '), true, 'the key must not be left to the shell here')
  assert.equal(editorBlurs, before + 1, 'the empty box gives the keyboard back')
  assert.equal(fakeDocument.activeElement, body)
  statusFeed.put('main', { running: false })
})


