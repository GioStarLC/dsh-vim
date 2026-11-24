import assert from 'node:assert/strict'
import { now, clock, matches, transcript, sidebar, composer, button, body, editor, listeners, fire, flush, press, stored, fakeStorage, fakeWindow, fakeDocument, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, feed, registry, renames, statusFeed, MODEL, projections, opened, makeCtx, loadBundle, client, cleanup, keydown, movePointer, tap, SHIPPED, expectedLabel, checks, reset, check, checkAsync, step, bumpChecks, setMediaReduce } from './harness.mjs'
import { seed, ago, rowNodes, stateChip, rightTracks, statusTrack, footerText, renderedRowIds, toastText, seedVisible, CATALOG, FAVORITES, useFavorites, placeChoice, renderedStatuses, elapsedLabel, liveChip, renderedTurns, boardKey } from './helpers.mjs'

check('the popup honours the configured size, spacing and position', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  fakeWindow.__dshVim.update({ paletteFont: 18, palettePlace: 'bottom', paletteWidth: 1000, paletteHeight: 60, paletteRow: 11 })
  tap('f')
  const host = body.children[body.children.length - 1]
  const panel = host.children[0]
  assert.equal(panel.style.fontSize, '18px', 'the panel must carry the configured size')
  assert.equal(panel.style.width, 'min(1000px, 94vw)', 'the width setting must survive the viewport cap')
  assert.equal(panel.style.maxHeight, '60vh', 'and the height setting is what the list scrolls inside')
  assert.equal(host.style.alignItems, 'flex-end', 'a bottom window sits at the bottom')
  assert.equal(panel.style.marginBottom, '14vh', 'a short window keeps the shipped margin')
  assert.equal(rowNodes()[0].style.paddingTop, '11px', 'row spacing is the vertical half of the row padding')
  assert.equal(rowNodes()[0].style.paddingBottom, '11px')
  tap('Escape')

  fakeWindow.__dshVim.update({ paletteFont: 11, palettePlace: 'center' })
  tap('f')
  const middle = body.children[body.children.length - 1]
  assert.equal(middle.children[0].style.fontSize, '11px')
  assert.equal(middle.style.alignItems, 'center')
  assert.equal(middle.children[0].style.marginTop, '0', 'a centred window has no top margin')
  tap('Escape')
})

check('a tall window gives up the margin, not the height', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  fakeWindow.__dshVim.update({ paletteHeight: 95, palettePlace: 'top' })
  tap('f')
  const host = body.children[body.children.length - 1]
  const panel = host.children[0]
  assert.equal(panel.style.maxHeight, '95vh', 'the height the user asked for is the height it gets')
  assert.equal(panel.style.marginTop, '3vh', 'and the top margin shrinks so it still fits on screen')
  tap('Escape')
})

check('the popup navigates with its own keys, not the scroll keys', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
    { id: 'c', displayTitle: 'c', updatedAt: ago(3) },
  ])
  fakeWindow.__dshVim.update({ paletteUpKey: 'k', paletteDownKey: 'j' })
  tap('f')
  const index = () => fakeWindow.__dshVim.palette().index
  tap('j')
  assert.equal(index(), 1)
  tap('j')
  tap('j')
  assert.equal(index(), 0, 'the window keys wrap like the scroll keys did')
  tap('k')
  assert.equal(index(), 2)
  // With the window's own keys moved off `d`/`e`, those two are the page's
  // again: the window ignores them and the conversation behind it scrolls.
  assert.equal(tap('d'), true, 'd is a scrolling key again')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'so it reads the conversation')
  assert.equal(index(), 2, 'and the selection must not move')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'with the window still up')
  tap('Escape')
})

check('the settings page exposes every binding, plus font size and position', () => {
  const elements = settingsElements()
  assert.deepEqual(
    keyBindings(),
    {
      [expectedLabel('down')]: 'd',
      [expectedLabel('up')]: 'e',
      [expectedLabel('focusComposer')]: ' ',
      [expectedLabel('effort')]: 'q',
      [expectedLabel('model')]: 'w',
      [expectedLabel('modelLevel')]: 'Tab',
      [expectedLabel('board')]: 'j',
      [expectedLabel('note')]: 'n',
      [expectedLabel('pin')]: 'i',
      [expectedLabel('palette')]: 'f',
      [expectedLabel('paletteRename')]: 'r',
      [expectedLabel('paletteUp')]: 'e',
      [expectedLabel('paletteDown')]: 'd',
      [expectedLabel('paletteEnter')]: 'o',
      [expectedLabel('paletteStage')]: 's',
      [expectedLabel('paletteArchive')]: 'g',
    },
    'all sixteen rebindable keys must be on the page'
  )
  // A space is invisible in a box of its own, so the page spells it out.
  const focusBox = elements.find((e) => e.props['aria-label'] === expectedLabel('focusComposer'))
  assert.ok(focusBox, 'the focus key must have its own box')
  assert.equal(focusBox.props.value, 'Space', 'and the box must name the key')
  // The level seat ships as a named key, so its box must spell that out too
  // rather than upper-casing it into a key nobody can press.
  const levelBox = elements.find((e) => e.props['aria-label'] === expectedLabel('modelLevel'))
  assert.ok(levelBox, 'the model window level key must have its own box')
  assert.equal(levelBox.props.value, 'Tab', 'and the box must name the key')
  const font = elements.find((e) => e.props.id === 'dsh-vim-palette-font')
  assert.ok(font, 'the font size slider must be on the page')
  assert.deepEqual([font.props.min, font.props.max, font.props.value], [11, 20, 13])
  const choice = placeChoice()
  assert.deepEqual(choice.props.options.map((o) => o.value), ['top', 'center', 'bottom'])
  assert.equal(choice.props.value, 'top')
})

check('the settings page exposes the window size and spacing sliders', () => {
  const byId = (id) => settingsElements().find((e) => e.props.id === id)
  const width = byId('dsh-vim-palette-width')
  assert.ok(width, 'the width slider must be on the page')
  assert.equal(width.props.label, expectedLabel('panelWidth'), 'and be named in both languages')
  assert.deepEqual(
    [width.props.min, width.props.max, width.props.step, width.props.value],
    [480, 1400, 20, 900],
    'width: 480–1400, shipping at 900'
  )
  width.props.onChange(1200)
  assert.equal(fakeWindow.__dshVim.settings().paletteWidth, 1200, 'a drag must apply at once')
  const height = byId('dsh-vim-palette-height')
  assert.ok(height, 'the height slider must be on the page')
  assert.equal(height.props.label, expectedLabel('panelHeight'))
  assert.deepEqual(
    [height.props.min, height.props.max, height.props.value],
    [40, 95, 82],
    'height: 40–95vh, shipping at 82'
  )
  height.props.onChange(60)
  assert.equal(fakeWindow.__dshVim.settings().paletteHeight, 60)
  const spacing = byId('dsh-vim-palette-row')
  assert.ok(spacing, 'the row-spacing slider must be on the page')
  assert.equal(spacing.props.label, expectedLabel('rowSpacing'))
  assert.deepEqual([spacing.props.min, spacing.props.max, spacing.props.value], [3, 14, 7])
  spacing.props.onChange(10)
  assert.equal(fakeWindow.__dshVim.settings().paletteRow, 10)
})

check('a key row on the settings page rebinds the plugin', () => {
  const row = settingsElements().find(
    (e) => e.props.label === expectedLabel('palette') && e.props.recordingText
  )
  assert.ok(row, 'the task-window key must be bindable from the page')
  // A letter neither window owns: the two overlays refuse to share one, which
  // is checked on its own below.
  row.props.onSet('x')
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'x', 'pressing a key in the page must take effect at once')
  row.props.onSet('f')
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'f')
})

check('the two overlay keys refuse to share one letter', () => {
  // The board's key is live on the page and the task window's key opens the
  // other overlay: one press cannot mean both, and the two seats sit in
  // different groups, so the group checks alone would let them collide.
  const rejected = fakeWindow.__dshVim.update({ paletteKey: 'j' })
  assert.equal(rejected.error, 'conflict', 'the board key must not be taken by the task window')
  assert.equal(fakeWindow.__dshVim.settings().paletteKey, 'f')
  assert.equal(fakeWindow.__dshVim.update({ boardKey: 'f' }).error, 'conflict', 'nor the other way round')
  assert.equal(fakeWindow.__dshVim.settings().boardKey, 'j')
  // A page key it may share with anything in the other group, as before.
  assert.ok(!fakeWindow.__dshVim.update({ boardKey: 'g' }).error, 'the archive key may collide with it')
  fakeWindow.__dshVim.update({ boardKey: 'j' })
})

check('a position choice on the settings page applies immediately', () => {
  const choice = placeChoice()
  choice.props.onSet('center')
  assert.equal(fakeWindow.__dshVim.settings().palettePlace, 'center')
  choice.props.onSet('top')
  assert.equal(fakeWindow.__dshVim.settings().palettePlace, 'top')
})

check('each position toggle applies its own value, not the last one', () => {
  const buttons = choiceButtons(PLACE_LABELS())
  assert.equal(buttons.length, 3, 'the row must render one button per option')
  // Each button must carry its own value through the closure. A shared loop
  // variable made every button apply the final option instead, so 顶部 and 居中
  // looked dead.
  const wanted = {
    [expectedLabel('placeTop')]: 'top',
    [expectedLabel('placeCenter')]: 'center',
    [expectedLabel('placeBottom')]: 'bottom',
  }
  for (const button of buttons) {
    fakeWindow.__dshVim.update({ palettePlace: 'top' })
    button.props.onClick()
    const label = button.children[0]
    assert.equal(
      fakeWindow.__dshVim.settings().palettePlace,
      wanted[label],
      `clicking "${label}" must apply ${wanted[label]}`
    )
  }
})

check('the active position toggle is marked pressed', () => {
  fakeWindow.__dshVim.update({ palettePlace: 'center' })
  const pressed = choiceButtons(PLACE_LABELS()).map((b) => b.props['aria-pressed'])
  assert.deepEqual(pressed, ['false', 'true', 'false'], 'exactly the current position is pressed')
})

check('each conversation shows what it is doing right now', () => {
  seed([
    { id: 'running', displayTitle: 'in flight', updatedAt: ago(1) },
    { id: 'done', displayTitle: 'finished', updatedAt: ago(2) },
    { id: 'ask', displayTitle: 'needs me', updatedAt: ago(3) },
    { id: 'quiet', displayTitle: 'idle', updatedAt: ago(2.5) },
  ])
  statusFeed.put('running', { running: true })
  statusFeed.put('done', { running: false, completionUnread: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('quiet', { running: false, completionUnread: false })
  tap('f')
  const labels = renderedStatuses()
  // The list leads with what is waiting on the reader, then what is in flight,
  // then the rest — so this is no longer recency's order. Inside the waiting
  // block the oldest debt comes first, and neither of these two was watched
  // starting, so `updatedAt` decides: `ask` was touched before `done`.
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['ask', 'done', 'running', 'quiet'],
    'the attention blocks lead, and the idle row trails'
  )
  assert.deepEqual(
    labels,
    [[expectedLabel('statusWaitApproval')], [expectedLabel('statusDone')], [expectedLabel('statusRunning')], []],
    'one label per non-idle conversation, in list order'
  )
  tap('Escape')
})

check('the just-finished chip draws the eye once when the window opens', () => {
  seed([{ id: 'done', displayTitle: 'finished while I was away', updatedAt: ago(0.1) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  const chip = () => stateChip(rowNodes()[0])
  assert.ok(chip(), 'the chip says "just done" before anything moves')
  // The first frame is due on the next tick, so a little virtual time is what
  // makes the beat visible — the same shape a real browser gives it.
  clock.advance(180)
  const swell = Number((String(chip().style.transform || '').match(/scale\(([\d.]+)\)/) || [])[1])
  assert.ok(swell > 1, 'the chip swells so the eye lands on it')
  assert.ok(
    String(chip().style.boxShadow || '').includes('rgba(125, 211, 252'),
    'and it wears a ring in the just-finished colour'
  )
  clock.advance(900)
  assert.equal(chip().style.transform, '', 'when the beat is over the chip is back where it was')
  assert.equal(chip().style.boxShadow, '', 'and nothing is left behind to dismiss')
  tap('Escape')
})

check('reduced motion gets no beat at all', () => {
  setMediaReduce(true)
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  clock.advance(180)
  assert.ok(
    !stateChip(rowNodes()[0]).style.transform,
    'the chip already says the fact in words; the beat is decoration on top of it'
  )
  assert.ok(!stateChip(rowNodes()[0]).style.boxShadow, 'and nothing else moves either')
  tap('Escape')
})

check('only the just-finished chip beats', () => {
  seed([
    { id: 'done', displayTitle: 'finished', updatedAt: ago(0.5) },
    { id: 'ask', displayTitle: 'waiting on you', updatedAt: ago(1) },
    { id: 'busy', displayTitle: 'running', updatedAt: ago(2) },
  ])
  statusFeed.put('done', { running: false, completionUnread: true })
  statusFeed.put('ask', { running: false, pendingInteraction: { kind: 'approval' } })
  statusFeed.put('busy', { running: true })
  tap('f')
  clock.advance(180)
  const rows = rowNodes()
  const order = fakeWindow.__dshVim.palette().rows.map((r) => r.id)
  const chipFor = (id) => stateChip(rows[order.indexOf(id)])
  assert.ok(String(chipFor('done').style.transform || '').includes('scale('), 'the one that just finished is the news')
  assert.ok(!chipFor('ask').style.transform, 'a debt already on the list does not need pointing at')
  assert.ok(!chipFor('busy').style.transform, 'nor does a run the reader is watching')
  clock.advance(900)
  tap('Escape')
})

check('a feed update does not restart the beat', () => {
  const done = { id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }
  seed([done])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  clock.advance(1000)
  assert.ok(!stateChip(rowNodes()[0]).style.transform, 'the beat is over')
  // A repaint arrives — the kind that used to be able to replay a cue tied to
  // painting. It must land on a still chip: the beat answers "what changed while
  // this window was closed", and it has already been answered.
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  clock.advance(180)
  assert.ok(!stateChip(rowNodes()[0]).style.transform, 'a repaint must not fire it again')
  tap('Escape')
})

check('a repaint in the middle of the beat keeps it on the new chips', () => {
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  statusFeed.put('done', { running: false, completionUnread: true })
  tap('f')
  clock.advance(200)
  const first = stateChip(rowNodes()[0])
  assert.ok(String(first.style.transform || '').includes('scale('), 'the beat is running')
  seed([{ id: 'done', displayTitle: 'finished', updatedAt: ago(0.1) }])
  const rebuilt = stateChip(rowNodes()[0])
  assert.notEqual(rebuilt, first, 'the repaint really did replace the chip node')
  assert.ok(String(rebuilt.style.transform || '').includes('scale('), 'so the beat must continue on the replacement')
  clock.advance(900)
  assert.equal(rebuilt.style.transform, '', 'and end on it too')
  tap('Escape')
})

check('a pending question outranks a completion reminder', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false, completionUnread: true, pendingInteraction: { kind: 'answer' } })
  tap('f')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusWaitAnswer')]])
  tap('Escape')
})

check('an unrecognised pending kind still shows something', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false, pendingInteraction: { kind: 'somethingNew' } })
  tap('f')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusWaiting')]], 'unknown kinds must not render blank')
  tap('Escape')
})

check('a live status change repaints the open window', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(renderedStatuses(), [[], []])
  statusFeed.put('b', { running: true })
  // `b` moves into the "in flight" block, which leads the list, so it is the
  // first row now rather than the second. The point of the check is that the
  // open window repaints at all, not where the row lands.
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')], []],
    'a finished run must appear live'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.palette().rows.map((r) => r.id),
    ['b', 'a'],
    'and it is the attention block that leads the list'
  )
  tap('Escape')
  assert.equal(statusFeed.listeners.length, 1, 'the window lets go of the feed; the run watch stays')
})

check('a running row shows how long it has been going', () => {
  seed([
    { id: 'a', displayTitle: 'in flight', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'idle', updatedAt: ago(2) },
  ])
  // The shell publishes every conversation it lists, idle ones included, so a
  // turn starting is a false -> true transition the watch can see.
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(90 * 1000)
  tap('f')
  assert.deepEqual(
    renderedStatuses(),
    [[liveChip('statusRunning', 1)], []],
    'the clock rides inside the state chip, and an idle row carries neither'
  )
  // The turn count is still out when the window opens, and the repaint that
  // settles it rebuilds the list — its own behaviour, and not the tick's. Let it
  // land first, so what follows is testing the tick and nothing else.
  clock.advance(2000)
  const chip = stateChip(rowNodes()[0])
  assert.ok(chip, 'the running row carries a state chip')
  assert.equal(chip.getAttribute('title'), expectedLabel('elapsedFor') + ' ' + elapsedLabel(1))
  assert.equal(
    fakeWindow.__dshVim.palette().rows[0].since > 0,
    true,
    'the debug API must expose the stamp the row is drawn from'
  )
  // A minute later, in place: a tick must not rebuild the list under the user's
  // selection, nor under a half-typed rename.
  clock.advance(60 * 1000)
  assert.equal(
    chip.textContent,
    liveChip('statusRunning', 2),
    'the chip ticks while the window is open'
  )
  assert.equal(
    stateChip(rowNodes()[0]),
    chip,
    'the chip is updated, not replaced'
  )
  tap('Escape')
})

check('a new turn starts its clock over', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(60 * 1000)
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(10 * 1000)
  tap('f')
  // Ten seconds in, there is no duration to show yet: the chip keeps the plain
  // state rather than a count of seconds nobody acts on. The second turn is
  // still its own, and is not charged for the first.
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')], []],
    'the second turn is not charged for the first'
  )
  // A turn parked on a question is the same turn waiting on the user: in
  // flight, and timed from where it started.
  statusFeed.put('b', { running: false })
  statusFeed.put('b', { running: false, pendingInteraction: { kind: 'approval' } })
  clock.advance(5 * 1000)
  // Both are in the attention blocks now, and `mine` leads: the parked question
  // comes before the turn in flight, whatever the clock says.
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusWaitApproval')], [expectedLabel('statusRunning')]],
    'a conversation waiting on a question keeps its own clock'
  )
  tap('Escape')
})

check('the columns on the right line up down the list', () => {
  projections.put('sessionStats', { turns: 13 })
  // Ids and stamps of their own: the turn-count cache is keyed by session and
  // updatedAt, and a check that reuses another's would inherit its count.
  seed([
    { id: 'col-a', displayTitle: 'a', updatedAt: ago(10) },
    { id: 'col-b', displayTitle: 'b', updatedAt: ago(11) },
  ])
  // One row with a clock in its state chip, one with a settlement reminder:
  // two chips of different widths, in one column.
  statusFeed.put('col-a', { running: false })
  statusFeed.put('col-a', { running: true })
  statusFeed.put('col-b', { running: false, completionUnread: true })
  // A minute in, so the clocked chip actually carries a duration: at minute
  // resolution a fresh turn shows the plain state, and the two chips would be
  // the same width for a reason this check is not about.
  clock.advance(60 * 1000)
  tap('f')
  const rows = rowNodes()
  assert.equal(
    rows[1].style.gridTemplateColumns,
    rows[0].style.gridTemplateColumns,
    'every row reserves the same columns, whatever its own content is'
  )
  const tracks = rightTracks(rows[0])
  assert.match(
    tracks.join(' '),
    /^\d+px \d+px \d+px$/,
    'stage, turns and time are sized once for the list, not per row'
  )
  const chips = rows.map((row) => stateChip(row))
  // The settled row leads the list now, because it is the one waiting on the
  // reader; the running row trails it. The two chips differ in width, which is
  // the point — the column is fitted to the wider of them, not to each row.
  const running = fakeWindow.__dshVim.palette().rows.findIndex((r) => r.id === 'col-a')
  const settled = fakeWindow.__dshVim.palette().rows.findIndex((r) => r.id === 'col-b')
  assert.ok(running >= 0 && settled >= 0, 'both conversations are on the list')
  assert.ok(
    chips[settled].scrollWidth < chips[running].scrollWidth,
    'the settled row has the narrower chip'
  )
  // The state gutter leads the row, so it is the first track in the template —
  // and it is fitted to the widest state on screen, which is what keeps every
  // name starting at the same x.
  assert.equal(
    statusTrack(rows[0]),
    chips[running].scrollWidth + 'px',
    'the state gutter is as wide as the widest state on screen'
  )
  assert.equal(statusTrack(rows[1]), statusTrack(rows[0]), 'and it is shared by every row')
  for (const chip of chips) {
    assert.equal(chip.style.justifySelf, 'start', 'a state chip starts at the same x on every row')
  }
  const turns = rows[0].children.find((c) => c.style.opacity === '0.38')
  assert.ok(turns, 'the turn count is on the row')
  assert.equal(turns.style.gridColumn, '4', 'in its own column, right of the state')
  assert.equal(turns.style.justifySelf, 'end', 'the turn count is right aligned')
  const meta = rows[0].children.find((c) => c.style.opacity === '0.5')
  assert.ok(meta, 'the time is on the row')
  assert.equal(meta.style.gridColumn, '5', 'and the time is the last column')
  assert.equal(meta.style.justifySelf, 'end', 'and the time is right aligned')
  // Measured cells must not wrap: a cell that wrapped would report the width it
  // wrapped into, and the column would be fitted to that instead of its text —
  // which is exactly how "2 小时前" ended up on two lines.
  for (const cell of [chips[0], chips[1], turns, meta]) {
    assert.equal(cell.style.whiteSpace, 'nowrap', 'a measured cell is one line')
  }
  tap('Escape')
})

check('without a status source the catalogue running flag is all there is', () => {
  seed([
    { id: 'a', displayTitle: 'busy', updatedAt: ago(1), running: true },
    { id: 'b', displayTitle: 'idle', updatedAt: ago(2) },
  ])
  // statusFeed is empty, so this exercises the no-entry path as well. The busy
  // one leads the list: it is the one in flight.
  tap('f')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusRunning')], []])
  tap('Escape')
})

check('the debug API reports each row status', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  statusFeed.put('a', { running: false, completionUnread: true })
  tap('f')
  const row = fakeWindow.__dshVim.palette().rows[0]
  assert.equal(row.status.key, 'done')
  assert.equal(row.status.text, expectedLabel('statusDone'))
  tap('Escape')
})

check('o switches out of the box, with nothing configured', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'o', 'o is the shipped switch default now')
  tap('f')
  tap('d')
  tap('o')
  assert.deepEqual(opened, ['b'], 'o must work without touching the settings')
  assert.equal(fakeWindow.__dshVim.palette().open, false)
  tap('f')
  tap('d')
  tap('Enter')
  assert.deepEqual(opened, ['b', 'b'], 'Enter works too, on the shipped default')
})

check('the switch key is honoured when rebound to something else', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  fakeWindow.__dshVim.update({ paletteEnterKey: 'k' })
  tap('f')
  tap('d')
  assert.equal(tap('o'), false, 'the old key must stop switching')
  assert.equal(fakeWindow.__dshVim.palette().index, 1, 'and must not switch either')
  tap('k')
  assert.deepEqual(opened, ['b'])
  assert.equal(fakeWindow.__dshVim.palette().open, false)

  tap('f')
  tap('d')
  tap('Enter')
  assert.deepEqual(opened, ['b', 'b'], 'Enter still switches after a rebind')
})

check('the footer advertises the switch key', () => {
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.ok(footerText().includes('f/o/Enter'), 'the footer names the key that opened the window too')
  assert.ok(
    footerText().includes('r ' + expectedLabel('rename')),
    'and the key that renames the selected conversation'
  )
  fakeWindow.__dshVim.update({ paletteEnterKey: 'k' })
  assert.ok(footerText().includes('f/k/Enter'), 'a rebound key is shown alongside Enter')
  fakeWindow.__dshVim.update({ paletteKey: 'p' })
  assert.ok(footerText().includes('p/k/Enter'), 'and a rebound open key is shown as well')
  tap('Escape')
})

check('the switch key cannot share a key with the rest of its group', () => {
  fakeWindow.__dshVim.update({ paletteEnterKey: 'f' })
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'o', 'a collision must be refused')
  // downKey is a different group, so the same letter is fine there
  fakeWindow.__dshVim.update({ downKey: 'o', paletteEnterKey: 'k' })
  assert.equal(fakeWindow.__dshVim.settings().paletteEnterKey, 'k')
  assert.equal(fakeWindow.__dshVim.settings().downKey, 'o')
})

check('turn counts appear after the window is already open', () => {
  seed([
    { id: 'a', displayTitle: 'a', updatedAt: ago(1) },
    { id: 'b', displayTitle: 'b', updatedAt: ago(2) },
  ])
  tap('f')
  assert.deepEqual(renderedTurns(), [null, null], 'the window opens without waiting for a count')
  // The count lands later, exactly as the shell serves it.
  projections.put('sessionStats', { turns: 13 })
  assert.deepEqual(
    renderedTurns(),
    [13 + ' ' + expectedLabel('turnUnit'), 13 + ' ' + expectedLabel('turnUnit')],
    'a count paints itself in once it arrives'
  )
  assert.equal(fakeWindow.__dshVim.palette().rows[0].turns, 13)
  tap('Escape')
})

check('peeking never retains a session as the main view', () => {
  seed([{ id: 'mv', displayTitle: 'a', updatedAt: ago(3) }])
  tap('f')
  projections.put('sessionStats', { turns: 4 })
  tap('Escape')
  // Retaining as mainView would clear the completion reminder in
  // uiSession.reconcileStatus(), wiping the "just done" badge off every row.
  assert.ok(projections.sources.length > 0, 'the plugin must retain scopes to read projections')
  for (const source of projections.sources) {
    assert.notEqual(source, 'mainView', `peeked as "${source}": that marks the conversation read`)
  }
})

check('a peeked scope is released whatever happens', () => {
  seed([
    { id: 'rel1', displayTitle: 'a', updatedAt: ago(4) },
    { id: 'rel2', displayTitle: 'b', updatedAt: ago(5) },
  ])
  tap('f')
  projections.put('sessionStats', { turns: 2 })
  assert.deepEqual([...projections.live], [], 'a settled peek must not hold its scope')

  // Closing mid-flight must let the held reference go too.
  tap('Escape')
  projections.values.delete('sessionStats')
  seed([{ id: 'rel3', displayTitle: 'c', updatedAt: ago(6) }])
  tap('f')
  assert.deepEqual([...projections.live], ['rel3'], 'the unsettled peek is still held')
  tap('Escape')
  assert.deepEqual([...projections.live], [], 'closing the window releases it')
})

check('a count is re-read once the conversation moves on', () => {
  seed([{ id: 'fresh', displayTitle: 'a', updatedAt: ago(7) }])
  projections.put('sessionStats', { turns: 13 })
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].turns, 13)
  tap('Escape')

  // A new message changes updatedAt, so the cached count is stale.
  feed.publish(['fresh'], {
    fresh: { id: 'fresh', displayTitle: 'a', updatedAt: ago(0.5), blank: false, running: false },
  })
  projections.values.delete('sessionStats')
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].turns, null, 'a stale count is not shown')
  tap('Escape')
})

check('a host with no projection source just shows no count', () => {
  seed([{ id: 'none', displayTitle: 'a', updatedAt: ago(8) }])
  tap('f')
  clock.advance(2000)
  assert.deepEqual(renderedTurns(), [null], 'no count is better than a wrong one')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the window still works')
  assert.deepEqual([...projections.live], [], 'a source that never answers must not hold a scope')
  tap('Escape')
})

check('probe() reports the target it would scroll', () => {
  const info = fakeWindow.__dshVim.probe()
  assert.equal(info.element, transcript)
  assert.equal(info.tag, 'DIV')
  assert.equal(info.pointer.seen, false, 'no move has happened, so no point is claimed')
  assert.equal(info.composer.known, true, 'the message box must be findable')
  assert.equal(info.composer.focused, false)
})

check('probe() reports the pointer it is following', () => {
  movePointer(120, 300)
  const info = fakeWindow.__dshVim.probe()
  assert.deepEqual(info.pointer, { x: 120, y: 300, seen: true })
  assert.equal(info.element, sidebar, 'and the pane that point resolves to')
})

check('probe() reports the message box it is protecting', () => {
  tap(' ')
  assert.equal(fakeWindow.__dshVim.probe().composer.focused, true, 'the focus key put the caret there')
  fakeDocument.activeElement = body
  assert.equal(fakeWindow.__dshVim.probe().composer.focused, false)
})

checkAsync('disposal unmounts the task window, the picker, the notice, and every listener', async () => {
  // A notice is a line the plugin owns; nothing may leave it on the page, and
  // nothing else can ever take it down.
  seed([])
  tap('q')
  assert.ok(body.children.length > 0, 'the notice must be mounted')
  // One conversation, and it is the one on screen: the task window lists it and
  // the picker can act on it, so both windows have something to show.
  seed([{ id: 'a', displayTitle: 'a', updatedAt: 1000, retainedBy: { mainView: 1 } }])
  tap('f')
  assert.ok(body.children.length > 1, 'the task window must be mounted')
  // The picker is the other window this plugin mounts, and it has to go with
  // the rest: a card left on the page would outlive the key that opened it.
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'the picker must be mounted beside it')
  const mounted = body.children.length
  assert.ok(mounted > 2, 'both windows are on the page together')
  cleanup()
  assert.equal(body.children.length, 0, 'no window and no notice may outlive the plugin')
  assert.equal(feed.listeners.length, 0, 'the feed subscription must be dropped too')
  assert.equal(statusFeed.listeners.length, 0, 'the run watch must go with the plugin')
  assert.equal(listeners.length, 0, 'no listener may outlive the plugin')
  assert.equal(fakeWindow.__dshVim, undefined)
})

step(async () => {
// Seed storage directly so this check covers load(), not earlier writes.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'k', upKey: 'f', step: 200, tau: 90, repeatDelay: 300 })
  )
  const second = await loadBundle('?reload=1')
  const ctx2 = makeCtx()
  second.apply(ctx2)
  const restored = fakeWindow.__dshVim.settings()
  assert.equal(restored.downKey, 'k', 'the reloaded plugin must read the stored key')
  // This store predates the task window, so its up key was the default f. Now
  // that scrolling and the window are separate key groups, f is unambiguous
  // (scroll up outside, close the window inside) and the old binding is kept.
  assert.equal(restored.upKey, 'f', 'a pre-task-window up key must survive untouched')
  assert.equal(restored.paletteKey, 'f')
  assert.equal(restored.paletteUpKey, 'e', 'seats the store never knew take their defaults')
  assert.equal(restored.paletteDownKey, 'd')
  assert.equal(restored.spaceBlurs, true, 'a store written before the empty-box key ships it on')
  assert.equal(restored.step, 200, 'the reloaded plugin must read the stored step')
  assert.equal(restored.tau, 90)
  assert.equal(restored.repeatDelay, 300)
  assert.equal(ctx2.log.sections.length, 1, 'the reloaded plugin must register its settings page again')
  ctx2.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  stored preferences survive a reload, and new seats take their defaults')
}
})

step(async () => {
// took effect.
{
  fakeStorage.setItem('dsh-vim/settings/v1', JSON.stringify({ sendMode: 'newline' }))
  const hinted = await loadBundle('?reload=sendmode')
  const ctxH = makeCtx()
  hinted.apply(ctxH)
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'newline', 'the mode survived the reload')
  // The reloaded plugin registered its own dock contribution, so the line has
  // to come from that registration rather than from the page's first one.
  const dock = (ctxH.log.slots['conversation.composer.dock'] ?? [])[0]
  assert.ok(dock, 'the reloaded plugin must contribute the hint to the composer dock again')
  const line = dock.component({ t: (k) => k })
  assert.ok(line, 'and the mode it stored must make it render something')
  assert.ok(/\+Enter/.test(line.children.join('')), 'naming the key that sends')
  // Unloading drops the slot registration, so the shell stops asking for it:
  // there is nothing left to render null against.
  ctxH.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a stored send mode reloads with its hint in the composer dock')
}
})

step(async () => {
// hand-edited store could turn into something the key would submit.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({
      modelKey: 'm',
      favorites: [
        { provider: 'deepseek', model: 'deepseek-reasoner' },
        { provider: 'deepseek', model: 'deepseek-reasoner' },
        { provider: 'bunny' },
        'nonsense',
      ],
    })
  )
  const listed = await loadBundle('?reload=favorites')
  const ctxF = makeCtx()
  listed.apply(ctxF)
  const restored = fakeWindow.__dshVim.settings()
  assert.equal(restored.modelKey, 'm', 'the rebound model key must survive the reload')
  assert.deepEqual(
    restored.favorites,
    [{ provider: 'deepseek', model: 'deepseek-reasoner' }],
    'the list must come back in order, deduplicated, with half-written entries dropped'
  )
  ctxF.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a stored model list reloads cleaned, and its key with it')
}
})

step(async () => {
// A hand-edited store that collides inside one group must be repaired.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'd', upKey: 'd', paletteUpKey: 'k', paletteDownKey: 'k' })
  )
  const repaired = await loadBundle('?reload=7')
  const ctxR = makeCtx()
  repaired.apply(ctxR)
  const fixed = fakeWindow.__dshVim.settings()
  assert.equal(fixed.downKey, 'd', 'the earlier seat in a group keeps its value')
  assert.equal(fixed.upKey, 'e', 'the later one falls back to its default')
  assert.equal(fixed.paletteUpKey, 'k', 'each group is repaired on its own')
  assert.equal(fixed.paletteDownKey, 'd')
  ctxR.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a hand-edited collision inside a group is repaired on load')
}
})

step(async () => {
// collision is visible.
{
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ modelLevelKey: 'q', downKey: 'd', upKey: 'e' })
  )
  const repairedLevel = await loadBundle('?reload=level-seat')
  const ctxL = makeCtx()
  repairedLevel.apply(ctxL)
  const fixedLevel = fakeWindow.__dshVim.settings()
  assert.equal(fixedLevel.effortKey, 'q', 'the page seat keeps the key it had')
  assert.notEqual(fixedLevel.modelLevelKey, 'q', 'and the level seat steps aside')
  assert.notEqual(fixedLevel.modelLevelKey, fixedLevel.modelKey, 'without landing on the confirm key')
  assert.notEqual(fixedLevel.modelLevelKey, fixedLevel.paletteDownKey, 'nor on a movement key')
  ctxL.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a level seat that collides with the page seats is repaired on load')
}
})

step(async () => {
// A hand-damaged store must not brick the plugin.
{
  fakeStorage.setItem('dsh-vim/settings/v1', '{ this is not json')
  const quiet = console.warn
  console.warn = () => {}
  const third = await loadBundle('?reload=2')
  const ctx3 = makeCtx()
  third.apply(ctx3)
  console.warn = quiet
  const fallback = fakeWindow.__dshVim.settings()
  assert.deepEqual(fallback, SHIPPED)
  ctx3.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  malformed stored settings fall back to the defaults')
}
})

step(async () => {
// A host without the two services must lose the task window only.
{
  fakeStorage.clear()
  feed.clear()
  const fourth = await loadBundle('?reload=5')
  const ctx4 = makeCtx({ services: false })
  fourth.apply(ctx4)
  const api4 = fakeWindow.__dshVim
  assert.equal(api4.palette().available, false, 'the task window must report itself unavailable')
  const swallowed = tap('f')
  assert.equal(swallowed, false, 'an unavailable task window must not eat the key')
  assert.equal(api4.palette().open, false)
  assert.equal(opened.length, 0, 'nothing may be switched without the navigator')
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'scrolling must survive a host without the services')
  ctx4.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a host without sessions/uiWorkspace keeps scrolling and drops the task window')
}
})

step(async () => {
// broken scroll engine.
{
  fakeStorage.clear()
  feed.clear()
  const refused = await loadBundle('?reload=nodock')
  const ctxN = makeCtx()
  // A host whose slot registry rejects this contribution — an older build with
  // no dock, or one that answers to a different owner. It throws, as the real
  // registry does for a slot it did not declare.
  ctxN.slots.inject = (name, callback) => {
    ctxN.log.injected.push(name)
    if (name === 'conversation.composer.dock') throw new Error('slot not declared')
    return callback()
  }
  const quiet = console.warn
  console.warn = () => {}
  refused.apply(ctxN)
  console.warn = quiet
  assert.ok(fakeWindow.__dshVim, 'the plugin must still be there')
  transcript.scrollTop = 0
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'and scrolling must still work')
  assert.equal(
    (ctxN.log.slots['conversation.composer.dock'] ?? []).length,
    0,
    'the hint simply is not contributed'
  )
  // The send mode itself still applies; only the line is missing.
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'newline')
  assert.equal(keydown('Enter', { target: editor }), true, 'and Enter still breaks the line')
  ctxN.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a host that refuses the composer dock loses the hint and keeps the keyboard')
}
})

step(async () => {
// A host with the sessions feed but no archive registry still gets a window.
{
  fakeStorage.clear()
  feed.clear()
  registry.archivedSessionIds = ['would-be-archived']
  const fifth = await loadBundle('?reload=6')
  const ctx5 = makeCtx({ registry: false })
  fifth.apply(ctx5)
  seed([{ id: 'would-be-archived', displayTitle: 'unfiltered', updatedAt: ago(1) }])
  tap('f')
  const state5 = fakeWindow.__dshVim.palette()
  assert.equal(state5.available, true, 'the task window must still work')
  assert.deepEqual(state5.rows.map((r) => r.id), ['would-be-archived'], 'without the registry, nothing is filtered')
  tap('Escape')
  ctx5.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a host without a workspace registry gets an unfiltered task window')
}
})

step(async () => {
// start was never seen, and a clock invented for it would be a lie.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  statusFeed.put('a', { running: true })
  const sixth = await loadBundle('?reload=8')
  const ctx6 = makeCtx()
  sixth.apply(ctx6)
  seed([{ id: 'a', displayTitle: 'in flight', updatedAt: Date.now() }])
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().rows[0].status.key, 'running', 'the row still shows what it is doing')
  assert.deepEqual(renderedStatuses(), [[expectedLabel('statusRunning')]], 'but no clock: this plugin never saw this turn begin')
  // The next turn is its own, and is timed from where it started.
  statusFeed.put('a', { running: false })
  statusFeed.put('a', { running: true })
  clock.advance(7 * 1000)
  assert.deepEqual(
    renderedStatuses(),
    [[expectedLabel('statusRunning')]],
    'a turn that starts under the watch is timed — and seven seconds in, that still shows nothing'
  )
  clock.advance(60 * 1000)
  assert.deepEqual(
    renderedStatuses(),
    [[liveChip('statusRunning', 1)]],
    'once the turn passes a minute the duration appears'
  )
  tap('Escape')
  ctx6.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a turn already in flight when the plugin arrives gets no clock')
}
})

step(async () => {
// and nothing else.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  transcript.scrollTop = 0
  const seventh = await loadBundle('?reload=9')
  const ctx7 = makeCtx({ model: null })
  seventh.apply(ctx7)
  seedVisible()
  assert.equal(tap('q'), true, 'the key is still the plugin\u2019s, and must not fall through to the page')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'nothing may be submitted without a directory to submit to')
  assert.equal(toastText(), expectedLabel('effortUnsupported'), 'the press is answered all the same')
  // The model key sits in the same place and loses the same thing: both read one
  // directory service, and neither may scroll the page instead.
  fakeWindow.__dshVim.update({ favorites: [{ provider: 'deepseek', model: 'deepseek-chat' }] })
  assert.equal(tap('w'), true, 'the model key is claimed the same way')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'and there is still nowhere to submit to')
  assert.equal(toastText(), expectedLabel('modelUnsupported'), 'and the press is answered all the same')
  fakeWindow.__dshVim.reset()
  tap('f')
  assert.equal(fakeWindow.__dshVim.palette().available, true, 'the task window must not be affected')
  tap('Escape')
  tap('d')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'nor may scrolling')
  ctx7.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a host without a model directory loses the two model keys only')
}
})

step(async () => {
// while the page is replaced around it, so the stamp has to outlive the page.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  const first = await loadBundle('?reload=10')
  const ctxFirst = makeCtx()
  first.apply(ctxFirst)
  seed([{ id: 'long', displayTitle: 'a long turn', updatedAt: ago(1) }])
  statusFeed.put('long', { running: false }) // seen idle first
  statusFeed.put('long', { running: true }) // then seen starting: this is the stamp
  const written = JSON.parse(fakeStorage.getItem('dsh-vim/runs/v1') || '{}')
  assert.ok(written.long > 0, 'the start of a turn in flight is left behind for the next page')

  // The old client goes away exactly as a reload takes it away...
  ctxFirst.log.cleanups[0]()
  assert.equal(fakeWindow.__dshVim, undefined, 'the reloaded page must be a different instance')

  // ...and the new one arrives while the host is still running that same turn.
  const second = await loadBundle('?reload=11')
  second.apply(makeCtx())
  // A minute of the turn goes by, so there is a duration to show: under that,
  // the chip deliberately shows the plain state and this could not tell a kept
  // stamp from a lost one.
  clock.advance(60 * 1000)
  fakeWindow.__dshVim.palette(true)
  const row = fakeWindow.__dshVim.palette().rows.find((r) => r.id === 'long')
  assert.ok(row, 'the conversation must still be listed')
  assert.equal(row.since, written.long, 'the rebuilt client keeps the clock it had')
  assert.ok(
    renderedStatuses()[0][0].startsWith(expectedLabel('statusRunning') + ' · '),
    'and the row shows the clock again, not just the bare state'
  )
  fakeWindow.__dshVim.palette(false)
  bumpChecks()
  console.log('  ok  a turn that outlives a client rebuild keeps its clock')
}
})

step(async () => {
// source says nothing is running there, the stamp goes with the turn.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  fakeStorage.setItem('dsh-vim/runs/v1', JSON.stringify({ ended: Date.now() - 60 * 1000 }))
  const third = await loadBundle('?reload=12')
  third.apply(makeCtx())
  statusFeed.put('ended', { running: false })
  assert.deepEqual(
    JSON.parse(fakeStorage.getItem('dsh-vim/runs/v1') || '{}'),
    {},
    'a turn that ended while the page was away keeps no clock'
  )
  bumpChecks()
  console.log('  ok  the stamp of a finished turn is dropped')
}
})

step(async () => {
// clock of hours that never happened.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  fakeStorage.setItem('dsh-vim/runs/v1', JSON.stringify({ stale: Date.now() - 13 * 60 * 60 * 1000 }))
  const fourth = await loadBundle('?reload=13')
  fourth.apply(makeCtx())
  assert.deepEqual(
    JSON.parse(fakeStorage.getItem('dsh-vim/runs/v1') || '{}'),
    {},
    'an expired stamp is pruned on the way in'
  )
  seed([{ id: 'stale', displayTitle: 'a stale one', updatedAt: ago(1) }])
  statusFeed.put('stale', { running: true })
  fakeWindow.__dshVim.palette(true)
  const row = fakeWindow.__dshVim.palette().rows.find((r) => r.id === 'stale')
  assert.equal(row.since, 0, 'so the row shows no clock rather than a day that never happened')
  assert.equal(renderedStatuses()[0][0], expectedLabel('statusRunning'), 'the plain state is all it claims')
  fakeWindow.__dshVim.palette(false)
  bumpChecks()
  console.log('  ok  a stamp too old to be this turn is not adopted')
}
})

step(async () => {
// a conversation it only now meets starting a turn is not that turn.
{
  fakeStorage.clear()
  feed.clear()
  statusFeed.map.clear()
  fakeStorage.setItem('dsh-vim/runs/v1', JSON.stringify({ late: Date.now() - 25 * 60 * 1000 }))
  const late = await loadBundle('?reload=14')
  late.apply(makeCtx())
  seed([{ id: 'late', displayTitle: 'met late', updatedAt: ago(1) }])
  const realNow = Date.now
  try {
    // Two minutes of this page's life go by before the conversation shows up.
    Date.now = () => realNow() + 2 * 60 * 1000
    statusFeed.put('late', { running: true })
    fakeWindow.__dshVim.palette(true)
    const row = fakeWindow.__dshVim.palette().rows.find((r) => r.id === 'late')
    assert.equal(row.since, 0, 'the old stamp must not become this turn’s clock')
    assert.equal(renderedStatuses()[0][0], expectedLabel('statusRunning'), 'so the row claims only the state')
    fakeWindow.__dshVim.palette(false)
  } finally {
    Date.now = realNow
  }
  bumpChecks()
  console.log('  ok  a stamp is not adopted by a page that has moved on')
}
})

step(async () => {
// the plugin painted — but it must leave all the same.
{
  const ctxLast = makeCtx()
  const last = await loadBundle('?reload=last')
  last.apply(ctxLast)
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const dock = (ctxLast.log.slots['conversation.composer.dock'] ?? [])[0]
  assert.ok(dock, 'the dock contribution is registered')
  assert.ok(dock.component({ t: (k) => k }), 'and it renders while the mode asks for it')
  ctxLast.log.cleanups[0]()
  assert.equal(fakeWindow.__dshVim, undefined, 'unloading leaves the page with no plugin on it')
  bumpChecks()
  console.log('  ok  the send hint leaves with the plugin that contributed it')
}
})

step(async () => {
// setting and a wall of copies.
{
  const rebuilt = await loadBundle('?rebuild=once')
  const ctxA = makeCtx()
  rebuilt.apply(ctxA)
  ctxA.log.cleanups[0]()
  // The same bundle instance, mounting again — what a client rebuild does.
  const ctxB = makeCtx()
  rebuilt.apply(ctxB)
  const entries = ctxB.log.slots['conversation.composer.dock'] ?? []
  assert.equal(
    entries.length,
    0,
    'a second mount must not add a second copy of the hint to the dock'
  )
  assert.equal(
    (ctxB.log.slots['conversation.input.left'] ?? []).length,
    0,
    'nor a second title field to the input bar'
  )
  bumpChecks()
  console.log('  ok  the composer dock is contributed once, however often the plugin mounts')
}
})

step(async () => {
// lose it, and a value a newer build no longer knows must not come back as one.
{
  fakeStorage.clear()
  feed.clear()
  fakeStorage.setItem(
    'dsh-vim/phases/v1',
    JSON.stringify({ kept: 'check', stale: 'a-stage-from-another-vocabulary' })
  )
  const stageFirst = await loadBundle('?stage=1')
  const stageCtx = makeCtx()
  stageFirst.apply(stageCtx)
  assert.equal(fakeWindow.__dshVim.phase('kept'), 'check', 'a known stage is carried over')
  assert.equal(
    fakeWindow.__dshVim.phase('stale'),
    '',
    'a stage this build cannot label is dropped at load, not shown as one'
  )
  assert.deepEqual(
    JSON.parse(fakeStorage.getItem('dsh-vim/phases/v1') || '{}'),
    { kept: 'check' },
    'and the store is rewritten without it'
  )
  stageCtx.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  stages are carried across a reload, and unknown ones are dropped')
}
})

step(async () => {
// else's window.
{
  cleanup()
  for (let i = listeners.length - 1; i >= 0; i--) {
    if (listeners[i].type === 'keydown') listeners.splice(i, 1)
  }
  body.children.length = 0
  fakeStorage.clear()
  feed.clear()
  registry.clear()
  const host = await loadBundle('?reload=archive-unavailable')
  const ctxA = makeCtx()
  const inner = ctxA.get
  ctxA.get = (name) => (name === 'uiWorkspace' ? { openSession() {} } : inner(name))
  host.apply(ctxA)
  seed([{ id: 'a', displayTitle: 'a', updatedAt: ago(1) }])
  tap('f')
  assert.deepEqual(renderedRowIds(), ['a'], 'the row must be there before the key is pressed')
  tap('g')
  assert.ok(
    footerText().includes(expectedLabel('archiveUnavailable')),
    'the footer must name the missing capability'
  )
  assert.deepEqual(renderedRowIds(), ['a'], 'and the row must still be there')
  tap('Escape')
  ctxA.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a host without an archive action says so instead of doing nothing')
}
})

step(async () => {
// matches the docs.
{
  fakeStorage.clear()
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'd', paletteEnterKey: 'g', step: 140 })
  )
  const migrated = await loadBundle('?reload=archive-migrate')
  const ctxM = makeCtx()
  migrated.apply(ctxM)
  const after = fakeWindow.__dshVim.settings()
  assert.equal(after.paletteArchiveKey, 'g', 'g must land on the archive seat')
  assert.equal(after.paletteEnterKey, 'o', 'and the untouched switch seat moves to its new default')
  assert.notEqual(after.paletteEnterKey, after.paletteArchiveKey, 'the two must not collide')
  ctxM.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a pre-archive store keeps g for archiving and moves the switch seat')
}
})

step(async () => {
// key must keep it, and the archive seat must find somewhere else to live.
{
  fakeStorage.clear()
  fakeStorage.setItem(
    'dsh-vim/settings/v1',
    JSON.stringify({ downKey: 'd', paletteEnterKey: 'k', step: 140 })
  )
  const kept = await loadBundle('?reload=archive-migrate-2')
  const ctxK = makeCtx()
  kept.apply(ctxK)
  const after = fakeWindow.__dshVim.settings()
  assert.equal(after.paletteEnterKey, 'k', 'a chosen switch key must survive the migration')
  assert.notEqual(after.paletteArchiveKey, 'k', 'and the archive seat must not take it')
  assert.ok(after.paletteArchiveKey, 'the archive seat must still have a key')
  ctxK.log.cleanups[0]()
  bumpChecks()
  console.log('  ok  a chosen switch key survives the migration and the archive seat steps aside')
}
})
