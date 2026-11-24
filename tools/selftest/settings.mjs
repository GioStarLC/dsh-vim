import assert from 'node:assert/strict'
import { now, clock, transcript, sidebar, composer, modal, stored, fakeStorage, fakeWindow, ctx, tap, SHIPPED, expectedLabel, reset, check, step } from './harness.mjs'

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
    [
      'settings.section',
      'conversation.composer.dock',
      'conversation.input.left',
      'main',
      'sidebar.panellist',
      'main',
      'sidebar.panellist',
    ],
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
