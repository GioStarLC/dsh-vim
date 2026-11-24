import assert from 'node:assert/strict'
import { now, transcript, composer, body, editor, flush, press, stored, fakeWindow, cardNode, settingsElements, MODEL, REASONING, opened, keydown, tap, expectedLabel, reset, check, checkAsync, step } from './harness.mjs'
import { seed, nameText, toastText, seedVisible, CATALOG, FAVORITES, useFavorites, submittedRoutes, modelPickPanel, modelPickRows, modelPickCell, modelPickNames, modelPickRowIsHere, modelPickLevelChips, modelPickLanded, modelPickLevelNames, modelPickLevelOn, modelPickSelected, modelPickFooter } from './helpers.mjs'

checkAsync('the model key opens a picker instead of walking the list', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'kimi', model: 'kimi-k2' })
  assert.equal(modelPickPanel(), null, 'nothing is up before the key is pressed')
  assert.equal(tap('w'), true, 'w belongs to the plugin on this page')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'opening is a read: it must submit nothing')
  assert.notEqual(modelPickPanel(), null, 'the picker is up')
  assert.equal(modelPickRows().length, 3, 'every configured model is on it')
  assert.equal(
    modelPickSelected(),
    0,
    'a conversation off the list starts on the first entry rather than nowhere'
  )
})

checkAsync('the picker opens on the model in effect and tags it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'bunny', model: 'bunny-free' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 2, 'the selection starts on the model in effect')
  const rows = modelPickRows()
  assert.ok(modelPickRowIsHere(rows[2]), 'and that row carries the tag')
  assert.ok(!modelPickRowIsHere(rows[0]), 'no other row does')
  // The tag rides inside the name cell, in front of the name.
  assert.equal(
    modelPickCell(rows[2], 'nameText').textContent,
    'Space Bunny Free',
    'the tagged row names its model'
  )
  assert.equal(
    rows[2].children[0].children[0].getAttribute('data-role'),
    'here',
    'the tag leads the name inside its cell'
  )
  assert.equal(
    rows[2].children[0].children[1].getAttribute('data-role'),
    'nameText',
    'and the name follows it'
  )
  assert.equal(
    rows[0].children[0].children.length,
    1,
    'an untagged row carries no tag, rather than an empty one holding the column'
  )
  assert.equal(modelPickCell(rows[0], 'nameText').textContent, 'DeepSeek Chat', 'a row names its model')
  assert.equal(modelPickCell(rows[0], 'provider').textContent, 'deepseek', 'and names its provider')
  // The row is three cells: name, levels, provider.
  assert.deepEqual(
    rows[0].children.map((c) => c.getAttribute('data-role')),
    ['name', 'levels', 'provider'],
    'a row is name, levels, provider'
  )
  // A model that publishes no levels says so; the selected row draws its chips.
  assert.deepEqual(
    modelPickLevelNames(rows[2]),
    [],
    'the row with no levels draws no chips'
  )
  assert.equal(
    modelPickCell(rows[2], 'levels').textContent,
    expectedLabel('modelPickNoLevel'),
    'and says so in words instead of showing an empty cell'
  )
})

checkAsync('d and e move the selection and wrap at both ends', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 0, 'the model in effect is where it starts')
  tap('d')
  assert.equal(modelPickSelected(), 1, 'd goes down')
  tap('e')
  assert.equal(modelPickSelected(), 0, 'e comes back up')
  tap('e')
  assert.equal(modelPickSelected(), 2, 'and up from the first wraps to the last')
  tap('d')
  assert.equal(modelPickSelected(), 0, 'as does down from the last')
  assert.deepEqual(MODEL.calls, [], 'moving is not choosing: nothing is submitted')
})

checkAsync('every level is laid out flat on one line', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  const row = modelPickRows()[1]
  const cell = modelPickCell(row, 'levels')
  assert.ok(cell, 'the level cell must be on the row')
  assert.equal(cell.style.display, 'flex', 'the levels are a flex row')
  assert.equal(cell.style.flexWrap, 'nowrap', 'and they must not wrap onto a second line')
  assert.equal(cell.style.justifyContent, 'flex-start', 'they pack from the start of the leftover width')
  assert.equal(cell.style.minWidth, '0', 'the cell may shrink rather than push the provider off the row')
  // The cell clips what does not fit: a level that cannot fit is a cheaper thing
  // to lose than the provider column, which is also a fact about the row.
  assert.equal(cell.style.overflow, 'hidden', 'the level cell clips its own overflow')
  for (const chip of modelPickLevelChips(row)) {
    assert.equal(chip.style.flex, '0 0 auto', 'a chip must not be squeezed by the cell shrinking')
  }
  // The levels track must be able to shrink. A bare `1fr` carries an automatic
  // minimum of its content's min-content width, and a non-wrapping level row's
  // min-content is every chip added together — the track would refuse to shrink,
  // the row would overrun the card, and the card's overflow would eat the
  // provider column.
  assert.equal(
    row.style.gridTemplateColumns,
    'minmax(0, auto) minmax(0, 1fr) auto',
    'the levels track is a shrinkable 1fr, so the row cannot overrun the card'
  )
  // The row is three cells in the order the eye reads them.
  assert.deepEqual(
    row.children.map((c) => c.getAttribute('data-role')),
    ['name', 'levels', 'provider'],
    'the row reads name, levels, provider'
  )
  // Only the selected row draws its whole scale; the rest say where they land.
  assert.deepEqual(modelPickLevelNames(row), ['低', '中', '高'], 'the selected row lists every level')
  assert.equal(
    modelPickLanded(modelPickRows()[0]),
    expectedLabel('modelPickNoLevel'),
    'a row with no levels says so on any row'
  )
  // Move down to Space Bunny Free: the row just left stops listing its scale,
  // and the newly selected row says where it would land instead.
  tap('d')
  assert.equal(modelPickSelected(), 2, 'on the row that publishes no levels')
  assert.equal(
    modelPickLanded(modelPickRows()[1]),
    '中',
    'the row left behind names the level it would land on instead of listing them'
  )
  assert.deepEqual(modelPickLevelNames(modelPickRows()[1]), [], 'and draws no chips')
  assert.equal(
    modelPickLanded(modelPickRows()[2]),
    expectedLabel('modelPickNoLevel'),
    'the newly selected row says it has no levels'
  )
  tap('Escape')
})

checkAsync('an unselected row says only which level it would land on', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites([{ provider: 'deepseek', model: 'deepseek-reasoner' }, { provider: 'deepseek', model: 'deepseek-chat' }])
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  // On the reasoner, with `high` in effect: it lists its whole scale.
  assert.deepEqual(modelPickLevelNames(modelPickRows()[0]), ['低', '中', '高'], 'the selected row lists its levels')
  assert.equal(modelPickLevelOn(modelPickRows()[0]), '中', 'with the one in effect lit')
  // Move to the chat model, which publishes none, and back: the reasoner now
  // says where it would land instead of listing everything.
  tap('d')
  assert.deepEqual(modelPickLevelNames(modelPickRows()[0]), [], 'the row left behind draws no chips')
  assert.equal(
    modelPickLanded(modelPickRows()[0]),
    '中',
    'it names the level it would land on instead'
  )
  tap('e')
  assert.deepEqual(modelPickLevelNames(modelPickRows()[0]), ['低', '中', '高'], 'and the row chosen again lists them all')
  assert.equal(modelPickLanded(modelPickRows()[0]), null, 'with no landing word beside them')
  tap('Escape')
})

checkAsync('Shift with a movement key reorders the row, and the order is remembered', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.deepEqual(modelPickNames(), ['DeepSeek Chat', 'DeepSeek Reasoner', 'Space Bunny Free'], 'the list starts in its configured order')
  // Shift + down moves the row itself, and the selection stays on the model.
  tap('d', { shiftKey: true })
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Reasoner', 'DeepSeek Chat', 'Space Bunny Free'],
    'the row moved down one place'
  )
  assert.equal(modelPickSelected(), 1, 'and the selection stayed on the model that moved')
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites.slice(0, 3),
    [
      { provider: 'deepseek', model: 'deepseek-reasoner' },
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'bunny', model: 'bunny-free' },
    ],
    'and the order was written into the configured list the settings page shows'
  )
  // Shift + up puts it back. The ends refuse rather than wrapping: a row being
  // pushed off the end of the list should stay where it is.
  tap('d', { shiftKey: true })
  assert.deepEqual(modelPickNames(), ['DeepSeek Reasoner', 'Space Bunny Free', 'DeepSeek Chat'], 'moved down again')
  assert.equal(modelPickSelected(), 2, 'the bottom row is now selected')
  tap('d', { shiftKey: true })
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Reasoner', 'Space Bunny Free', 'DeepSeek Chat'],
    'and a move past the end changes nothing'
  )
  tap('e', { shiftKey: true })
  assert.deepEqual(modelPickNames(), ['DeepSeek Reasoner', 'DeepSeek Chat', 'Space Bunny Free'], 'Shift + up moves the row back up')
  // A reorder submits nothing: it is a list edit, not a switch.
  assert.deepEqual(MODEL.calls, [], 'reordering must not switch the model')
  tap('Escape')
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites.slice(0, 3),
    [
      { provider: 'deepseek', model: 'deepseek-reasoner' },
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'bunny', model: 'bunny-free' },
    ],
    'and the order survives the window closing'
  )
  // Reopening shows the same order.
  tap('w')
  await flush()
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Reasoner', 'DeepSeek Chat', 'Space Bunny Free'],
    'so the next time the window opens, the list is as it was left'
  )
  tap('Escape')
  reset()
})

checkAsync('a model the catalog dropped out keeps its place when the list is reordered', async () => {
  seedVisible()
  // The list holds a model the catalog does not offer, the way a signed-out
  // provider leaves one behind.
  MODEL.offer([
    { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
  ])
  useFavorites([
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'gone', model: 'vanished' },
  ])
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.deepEqual(modelPickNames(), ['DeepSeek Chat'], 'only what the catalog offers is on screen')
  tap('d', { shiftKey: true })
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites,
    [
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'gone', model: 'vanished' },
    ],
    'the unavailable model keeps its place: a reorder is not an edit of a row nobody was looking at'
  )
  tap('Escape')
})

checkAsync('the window keeps one width, whatever the selection is on', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  const panel = modelPickPanel()
  assert.equal(panel.style.width, 'min(680px, 92vw)', 'the card is one width rather than one per list')
  assert.equal(panel.style.minWidth, undefined, 'with no lower bound that a long name could grow past')
  assert.equal(panel.style.maxWidth, undefined, 'and no content-driven upper bound either')
  // The width must not be a number that changes when the levels change: moving
  // onto a model with a different scale has to leave the card exactly as wide.
  const before = panel.style.width
  tap('d')
  assert.equal(modelPickPanel().style.width, before, 'moving onto a model with levels leaves it as wide')
  tap('d')
  assert.equal(modelPickPanel().style.width, before, 'and moving onto one without them too')
  tap('Escape')
})

checkAsync('the same key confirms the selection and closes the window', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'the selected model was submitted')
  assert.equal(modelPickPanel(), null, 'and the window is gone')
  assert.equal(toastText(), `${expectedLabel('model')} DeepSeek Reasoner`, 'the notice names it')
})

checkAsync('Escape cancels without submitting anything', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('Escape')
  assert.equal(modelPickPanel(), null, 'Escape takes the window down')
  assert.deepEqual(MODEL.calls, [], 'and a cancelled choice costs the host nothing')
})

checkAsync('a picker that was already open is not opened twice', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(keydown('w', { repeat: true }), true, 'a held key is still ours, not the page scroll')
  await flush()
  assert.equal(modelPickSelected(), 0, 'but it is not a second press')
  assert.equal(MODEL.calls.length, 0, 'nor a confirmation')
  tap('Escape')
})

checkAsync('the picker keeps the keyboard: a stray key does not reach the page', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  // `f` is the task window's key and is not the picker's. The picker answers by
  // swallowing it, so the measure is not that it prevents the default — it is
  // that nothing behind the window acted on it.
  keydown('f', {})
  await flush()
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'no task window appeared behind it')
  assert.notEqual(modelPickPanel(), null, 'the picker is still the one that is up')
  assert.equal(modelPickSelected(), 0, 'and the stray key did not move its selection')
  tap('Escape')
})

checkAsync('a held model key does not open a second window behind the first', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  const before = modelPickPanel()
  assert.equal(keydown('w', { repeat: true }), true, 'the repeat is the plugin key')
  await flush()
  assert.equal(modelPickPanel(), before, 'and the window it finds open is the same one')
  assert.deepEqual(MODEL.calls, [], 'a held key must not confirm either')
  tap('Escape')
})

checkAsync('the picker closes on success and stays up on a refusal', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  MODEL.results.push({ ok: false, error: { code: 'busy', message: 'another writer holds this session' } })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.equal(MODEL.calls.length, 1, 'the attempt was made')
  assert.notEqual(modelPickPanel(), null, 'a refused switch leaves the window up to try again')
  assert.equal(
    modelPickFooter(),
    expectedLabel('modelFailed') + ': another writer holds this session',
    'with the host reason readable in its footer, not swallowed'
  )
})

checkAsync('the picker carries the level over exactly as the walk did', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    'a level the target publishes is carried over'
  )
  // Now the other way. The window reopens on `deepseek-reasoner` — the model
  // just switched to — so one step down reaches `bunny-free`, which publishes
  // no `high` and must therefore be submitted without a level.
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 1, 'it reopens on the model now in effect')
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[1],
    { provider: 'bunny', model: 'bunny-free' },
    'a level the target never published is left off the selection'
  )
  assert.equal('reasoningEffort' in MODEL.calls[1], false, 'not even as an undefined field')
})

checkAsync('a model the catalog does not offer is not on the picker', async () => {
  seedVisible()
  // `kimi` signed itself out: its group is gone from the catalog entirely.
  MODEL.offer(CATALOG.filter((group) => group.id !== 'kimi'))
  useFavorites([
    ...FAVORITES,
    { provider: 'kimi', model: 'kimi-k2' },
    { provider: 'gone', model: 'never-published' },
  ])
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(modelPickRows().length, 3, 'the unreachable ones are left off the list')
  assert.deepEqual(
    modelPickNames(),
    ['DeepSeek Chat', 'DeepSeek Reasoner', 'Space Bunny Free'],
    'and the rows read down the list in the configured order, skipping the unreachable ones'
  )
  assert.equal(modelPickRowIsHere(modelPickRows()[0]), true, 'the one in effect is tagged')
  tap('Escape')
})

checkAsync('every configured model being unavailable says so instead of opening', async () => {
  seedVisible()
  MODEL.offer([])
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'nothing may be submitted')
  assert.equal(modelPickPanel(), null, 'and no empty window is worth opening')
  assert.equal(toastText(), expectedLabel('modelNone'))
})

checkAsync('an unconfigured list says so instead of opening', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  tap('w')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'a key with nothing configured must not fall through to a default')
  assert.equal(modelPickPanel(), null, 'nor open a window with nothing in it')
  assert.equal(toastText(), expectedLabel('modelEmpty'))
})

checkAsync('a conversation on its model default submits no level at all', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites([{ provider: 'deepseek', model: 'deepseek-chat' }, { provider: 'deepseek', model: 'deepseek-reasoner' }])
  // Nothing explicit is in effect, so the model's own default is what applies —
  // and there is no level to carry, so the selection must not grow one.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    'a switch must never invent a level the conversation was not on'
  )
  assert.equal('reasoningEffort' in MODEL.calls[0], false, 'not even as an undefined field')
})

checkAsync('a confirmation while a switch is in flight is not a second one', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  MODEL.hold = true
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'the switch is out')
  // The window freezes while that selection is in flight, so a second confirm
  // cannot race it into two submissions.
  assert.equal(keydown('w', {}), true, 'the key is still the window\'s')
  await flush()
  assert.equal(MODEL.calls.length, 1, 'but it does not submit again')
  MODEL.settle()
  await flush()
})

checkAsync('the model key is a plain letter inside a field', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  assert.equal(keydown('w', { target: editor }), false, 'the composer keeps its own letters')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'so nothing may be submitted from in there')
  assert.equal(modelPickPanel(), null, 'and no window opens over the draft')
  // The task window is the other place: the model key is a page key, so an open
  // window neither claims it nor hides it.
  tap('f')
  assert.equal(keydown('w', {}), true, 'the task window does not swallow the key')
  await flush()
  assert.notEqual(modelPickPanel(), null, 'the picker opens over it')
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'and the task window stays where it was')
  tap('Escape')
  tap('Escape')
})

checkAsync('a held model key is not a stream of windows', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  assert.equal(keydown('w', { repeat: true }), true, 'the held key is still ours, not the page scroll')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'but it is not a press')
  assert.equal(modelPickPanel(), null, 'and not a window either')
})

checkAsync('without a conversation on screen there is nothing to pick', async () => {
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  seed([])
  tap('w')
  await flush()
  assert.deepEqual(MODEL.calls, [])
  assert.equal(modelPickPanel(), null, 'no picker without a conversation to apply it to')
  assert.equal(toastText(), expectedLabel('noSession'), 'the same line the reasoning key uses')
})

checkAsync('Enter confirms the selection, as the standing alias', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('Enter')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'Enter confirms the selected model')
  assert.equal(modelPickPanel(), null, 'and takes the window down with it')
})

checkAsync('clicking a row chooses and confirms it in one', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  const rows = modelPickRows()
  // A pointer has no second press of the key, so the click has to be the whole
  // gesture rather than a selection the user then has to confirm.
  const handlers = rows[2].__listeners.click ?? []
  assert.equal(handlers.length, 1, 'the row must carry the click handler')
  handlers[0]({})
  await flush()
  assert.deepEqual(submittedRoutes(), ['bunny/bunny-free'], 'the clicked row is submitted')
  assert.equal(modelPickPanel(), null, 'and the window closes behind it')
})

checkAsync('Escape during a slow submit leaves the window gone and the result reported', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  // The refusal is queued before the confirm, so the submit that is held is the
  // one that will fail once it lands — which is the case this check is about:
  // the window is gone by then.
  MODEL.results.push({ ok: false, error: { code: 'busy', message: 'the session moved on' } })
  MODEL.hold = true
  tap('w')
  await flush()
  tap('d')
  tap('w')
  await flush()
  assert.deepEqual(submittedRoutes(), ['deepseek/deepseek-reasoner'], 'the selection is already out')
  tap('Escape')
  assert.equal(modelPickPanel(), null, 'Escape takes the window down even mid-submit')
  // A refused switch that lands after the window is gone has nowhere in the
  // window to be read, so it must surface on the notice line instead of being
  // swallowed with the window.
  MODEL.settle()
  await flush()
  assert.equal(toastText(), expectedLabel('modelFailed') + ': the session moved on', 'the reason is still said')
  MODEL.hold = false
})

checkAsync('the picker names the live keys rather than letters it assumes', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  fakeWindow.__dshVim.update({ modelKey: 'm', paletteUpKey: 'k', paletteDownKey: 'j' })
  tap('m')
  await flush()
  const footer = modelPickFooter()
  assert.ok(footer.includes('m'), 'the confirm key is the bound one')
  assert.ok(footer.includes('k') && footer.includes('j'), 'and so are the movement keys')
  assert.equal(footer.includes('w'), false, 'the old binding is not advertised')
  // And the rebound keys are the ones that actually move it.
  tap('j')
  assert.equal(modelPickSelected(), 1, 'the rebound down key moves the selection')
  tap('k')
  assert.equal(modelPickSelected(), 0, 'and so does the rebound up key')
  tap('Escape')
  reset()
})

checkAsync('the selected row lists its levels with the one in effect lit', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  const rows = modelPickRows()
  // The window opens on the model in effect, so it is the selected row and the
  // one carrying the whole scale.
  assert.deepEqual(modelPickLevelNames(rows[1]), ['低', '中', '高'], 'all three levels of the model in effect are drawn')
  assert.equal(modelPickLevelOn(rows[1]), '中', 'and the one in effect is the lit one')
  // A row with no levels says so wherever it sits.
  assert.equal(
    modelPickCell(rows[0], 'levels').textContent,
    expectedLabel('modelPickNoLevel'),
    'a model with no levels says so in words'
  )
  assert.equal(modelPickLanded(rows[0]), expectedLabel('modelPickNoLevel'), 'and names no landing level')
  tap('Escape')
})

checkAsync('the level key steps the selected row and wraps, Shift steps back', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 1, 'the model in effect is selected')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'Tab steps to the next level')
  assert.equal(modelPickSelected(), 1, 'without moving the model selection')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '低', 'and wraps at the end')
  tap('Tab', { shiftKey: true })
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'Shift steps the other way')
  // ←/→ are the same move, as fixed aliases.
  tap('ArrowLeft')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'left steps back')
  tap('ArrowRight')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and right steps forward')
  assert.deepEqual(MODEL.calls, [], 'stepping is not choosing: nothing is submitted')
  tap('Escape')
})

checkAsync('confirming a model at a stepped level submits that level', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  assert.equal(modelPickSelected(), 1, 'on the model with levels')
  // The row starts on the carry-over rule's answer, which for a model whose
  // default is `medium` is `中`; one step from there is `高`.
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'the mark starts where the rule puts it')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'the level was moved')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    'the row and the level it was marked with are submitted together'
  )
  assert.equal(
    toastText(),
    `${expectedLabel('model')} DeepSeek Reasoner · 高`,
    'and the notice names the level as well as the model'
  )
})

checkAsync('a level carried to a model that publishes it is submitted with it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' })
  tap('w')
  await flush()
  // `deepseek-chat` publishes no levels at all, so a carry-over is impossible
  // and the submission must not grow a level the target never published.
  tap('e')
  assert.equal(modelPickSelected(), 0, 'up to the model with no levels')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-chat' },
    'a target that publishes no level is submitted without one'
  )
  assert.equal('reasoningEffort' in MODEL.calls[0], false, 'not even as an undefined field')
})

checkAsync('moving between rows drops a level the user had stepped to', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  tap('Tab')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'the level was stepped away from the carry-over')
  tap('d')
  assert.equal(modelPickSelected(), 2, 'moved to the next row')
  tap('e')
  assert.equal(modelPickSelected(), 1, 'and back to the one that was stepped on')
  assert.equal(
    modelPickLevelOn(modelPickRows()[1]),
    '中',
    'the row answers the carry-over rule again, not the level it was left on'
  )
  tap('Escape')
})

checkAsync('a model that publishes no levels answers the level key in words', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  assert.equal(modelPickSelected(), 0, 'on the model with no levels')
  tap('Tab')
  assert.equal(modelPickFooter(), expectedLabel('modelPickNoLevel'), 'the footer says why nothing moved')
  assert.notEqual(modelPickPanel(), null, 'and the window is still up to try something else')
  assert.deepEqual(MODEL.calls, [], 'a press that could not move must not switch anything either')
  tap('Escape')
})

checkAsync('clicking a level chip switches to that model at that level in one step', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  // Only the selected row draws chips, so move onto the model that has them
  // before reaching for one — a pointer and a key reach the same row.
  tap('d')
  assert.equal(modelPickSelected(), 1, 'on the model with levels')
  const chips = modelPickLevelChips(modelPickRows()[1])
  assert.equal(chips.length, 3, 'the selected row must offer three chips')
  const handlers = chips[2].__listeners.click ?? []
  assert.equal(handlers.length, 1, 'each chip must carry its own click handler')
  let stopped = false
  handlers[0]({ preventDefault() {}, stopPropagation() { stopped = true } })
  await flush()
  assert.deepEqual(
    submittedRoutes(),
    ['deepseek/deepseek-reasoner'],
    'the chip submits its own model'
  )
  assert.equal(MODEL.calls[0].reasoningEffort, 'high', 'at its own level')
  assert.ok(stopped, 'and the click must not reach the row it sits on')
  assert.equal(modelPickPanel(), null, 'the window closes behind it')
})

checkAsync('a model default that nobody chose is shown but never submitted', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  // Nothing explicit is in effect on `deepseek-reasoner`, so its own declared
  // default (`medium`) is what applies — and it is what the row shows as the
  // landing place. It is still not a choice, so it must not be sent back.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-chat' })
  tap('w')
  await flush()
  tap('d')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'the row shows the level the host would apply')
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[0],
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    'but a default nobody chose is left off the selection'
  )
  assert.equal('reasoningEffort' in MODEL.calls[0], false, 'not even as an undefined field')
})

checkAsync('the level key is the model window\'s, and is a plain letter outside it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  // With the window closed, Tab must reach the page as it always did.
  assert.equal(keydown('Tab', {}), false, 'Tab is not the plugin\'s key outside the window')
  await flush()
  assert.deepEqual(MODEL.calls, [], 'and it must not switch anything')
  tap('w')
  await flush()
  const before = MODEL.calls.length
  tap('Tab')
  assert.equal(MODEL.calls.length, before, 'inside the window it steps the level, not the model')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and the level is what moved')
  tap('Escape')
})

checkAsync('a rebound level key is the one that steps, and Tab goes back to moving rows', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' })
  fakeWindow.__dshVim.update({ modelLevelKey: 'n' })
  tap('w')
  await flush()
  assert.ok(modelPickFooter().includes('N'), 'the footer names the bound level key')
  assert.equal(modelPickFooter().includes('Tab'), false, 'and not the one it no longer is')
  tap('Tab')
  assert.equal(modelPickSelected(), 2, 'Tab moves the row again, as it did before the level seat existed')
  assert.deepEqual(MODEL.calls, [], 'and steps nothing')
  tap('e')
  assert.equal(modelPickSelected(), 1, 'back on the model with levels')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '中', 'whose level is where it was')
  tap('n')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and the rebound key is the one that steps')
  tap('Escape')
  reset()
})

checkAsync('the level key cannot collide with the keys the window shares', async () => {
  assert.equal(fakeWindow.__dshVim.settings().modelLevelKey, 'Tab', 'Tab is the shipped default')
  // The model window answers to the page's two model seats and the task
  // window's movement pair, so its own group has to be checked across both.
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'w' }).error,
    'conflict',
    'the confirm key is already taken'
  )
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'q' }).error,
    'conflict',
    'and so is the reasoning key'
  )
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'd' }).error,
    'conflict',
    'and the window\'s own movement keys'
  )
  // Enter is the standing confirm alias and is not a seat, so the level seat may
  // not take it: doing so would leave the window with no confirm key at all.
  assert.equal(
    fakeWindow.__dshVim.update({ modelLevelKey: 'Enter' }).error,
    'conflict',
    'the standing Enter alias cannot be given up'
  )
  // The other direction too: a page seat may not take the level key.
  assert.equal(
    fakeWindow.__dshVim.update({ modelKey: 'Tab' }).error,
    'conflict',
    'the confirm seat may not take Tab'
  )
  assert.equal(
    fakeWindow.__dshVim.update({ paletteDownKey: 'Tab' }).error,
    'conflict',
    'nor may a movement seat, which lives in the task window\'s own group'
  )
  assert.equal(fakeWindow.__dshVim.settings().paletteDownKey, 'd', 'and that refusal changed nothing either')
  assert.equal(fakeWindow.__dshVim.settings().modelLevelKey, 'Tab', 'and a refusal changes nothing')
  const accepted = fakeWindow.__dshVim.update({ modelLevelKey: 'n' })
  assert.equal(accepted.modelLevelKey, 'n', 'a free key is accepted')
  reset()
})

checkAsync('the reasoning key steps the level inside the window, not behind it', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  // The adapter metadata travels with the publish, which is what the reasoning
  // key reads to know which notch it is stepping from.
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }, REASONING)
  tap('w')
  await flush()
  const before = MODEL.calls.length
  tap('q')
  assert.deepEqual(
    MODEL.calls.length,
    before,
    'q must not submit while the window is still choosing: it moves the mark'
  )
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '高', 'and the mark moves one notch on, as q always means')
  tap('q')
  assert.equal(modelPickLevelOn(modelPickRows()[1]), '低', 'every press is still one step')
  assert.deepEqual(MODEL.calls.length, before, 'and nothing is submitted until the window confirms')
  // Confirming takes the mark with it: the level the window was showing is the
  // level the session lands on.
  tap('w')
  await flush()
  assert.deepEqual(
    MODEL.calls[before],
    { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'low' },
    'the level the mark reached is submitted with the model'
  )
  tap('q')
  await flush()
  assert.equal(MODEL.calls.length, before + 2, 'and with the window down q steps the session again')
})

checkAsync('a press outside the model window cancels it, as Escape does', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }, REASONING)
  tap('w')
  await flush()
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'the picker must be up')
  const before = MODEL.calls.length
  press(cardNode())
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'a press on its own card is inside the window')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'a press beside it cancels the way out')
  assert.equal(body.children.length, 0, 'and the picker unmounts')
  assert.equal(MODEL.calls.length, before, 'cancelling submits nothing, exactly as Escape does')
})

checkAsync('a window on the card of another keeps both of them up', async () => {
  seedVisible()
  MODEL.offer(CATALOG)
  useFavorites(FAVORITES)
  MODEL.publish({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'medium' }, REASONING)
  tap('f')
  tap('w')
  await flush()
  // Both can be on the page at once, and the picker's card is the one the press
  // lands on: a press inside one window is not a press outside the other.
  assert.equal(fakeWindow.__dshVim.palette().open, true)
  assert.equal(fakeWindow.__dshVim.modelPick().open, true)
  press(cardNode())
  assert.equal(fakeWindow.__dshVim.palette().open, true, 'the task window stays')
  assert.equal(fakeWindow.__dshVim.modelPick().open, true, 'and so does the picker')
  press(transcript)
  assert.equal(fakeWindow.__dshVim.palette().open, false, 'a press that misses both takes both down')
  assert.equal(fakeWindow.__dshVim.modelPick().open, false, 'the task window and the picker alike')
  assert.equal(body.children.length, 0, 'and neither outlives it')
})

checkAsync('the model key can be rebound, and cannot collide with the page keys', () => {
  assert.equal(fakeWindow.__dshVim.settings().modelKey, 'w', 'w is the shipped default')
  const rejected = fakeWindow.__dshVim.update({ modelKey: 'q' })
  assert.equal(rejected.error, 'conflict', 'the reasoning key is already taken')
  const accepted = fakeWindow.__dshVim.update({ modelKey: 'm' })
  assert.equal(accepted.modelKey, 'm', 'a free key is accepted')
  assert.equal(fakeWindow.__dshVim.settings().effortKey, 'q', 'and the other seats are untouched')
  reset()
})

check('a configured list is cleaned, and never writes back into the shipped default', () => {
  const stored = [
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    { provider: 'deepseek', model: 'deepseek-reasoner' },
    { provider: '  ', model: 'blank-provider' },
    { provider: 'no-model' },
    'not a pair',
    null,
    { provider: 'bunny', model: ' bunny-free ' },
  ]
  const applied = fakeWindow.__dshVim.update({ favorites: stored })
  assert.deepEqual(
    applied.favorites,
    [
      { provider: 'deepseek', model: 'deepseek-reasoner' },
      { provider: 'bunny', model: 'bunny-free' },
    ],
    'a duplicate keeps its first place, and a half-written entry is dropped'
  )
  // The array is rebuilt rather than aliased, so nothing the settings page is
  // handed can reach the shipped default through it — corrupting the live list
  // here must still leave a reset empty.
  applied.favorites.push({ provider: 'late', model: 'arrival' })
  assert.deepEqual(
    fakeWindow.__dshVim.reset().favorites,
    [],
    'and the shipped default is unreachable from what the API handed out'
  )
})

checkAsync('the settings page reads the catalog instead of asking for an id', async () => {
  MODEL.offer(CATALOG)
  useFavorites([{ provider: 'bunny', model: 'bunny-free' }])
  const before = MODEL.catalogReads
  const elements = settingsElements()
  // The read is a host hop, so the first render is the one that has to admit it.
  assert.ok(
    elements.some((e) => e.children?.includes(expectedLabel('modelCatalogLoading'))),
    'and say it is reading it, rather than showing an empty box'
  )
  assert.deepEqual(
    fakeWindow.__dshVim.settings().favorites,
    [{ provider: 'bunny', model: 'bunny-free' }],
    'the chosen list is read back through the same cleaning it is written through'
  )
  await flush()
  assert.equal(MODEL.catalogReads, before + 1, 'the group must read the catalog off the host, once')
})
