/**
 * Behaviour checks: feel, guards, targeting, and the mode keys.
 */
import assert from 'node:assert/strict'
import { step, bumpChecks, setMenuOnScreen, setMediaReduce, setNow, ROOT, BUNDLE, now, seq, timers, frames, FRAME_MS, clock, matches, matchesSimple, el, arrivedRows, transcript, sidebar, composer, button, body, root, editor, modal, modalEditor, blurCount, editorBlurs, synthKeys, replayKeydown, listeners, captureOf, record, unrecord, fire, shellFocus, domFocus, fireOn, clickThrough, flush, press, stored, fakeStorage, fakeDatabases, fakeRequest, fakeStoreApi, fakeIndexedDB, mediaReduce, fakeWindow, menu, menuOnScreen, fakeDocument, paneAt, cardNode, aimAt, resetHitTest, ReactStub, settingsElements, keyBindings, choiceButtons, PLACE_LABELS, fakeRequire, feed, registry, newSessions, renames, statusFeed, currentBinding, MODEL, REASONING, projections, forks, opened, archives, makeCtx, captured, loadBundle, client, ctx, cleanup, keydown, keyup, wheel, movePointer, blurWindow, refocusWindow, tap, SHIPPED, expectedLabel, checks, peak, reset, finish, check, checkAsync } from './harness.mjs'
import { armDoubleEnter, renderSendHint, sendHintText } from './helpers.mjs'
check('a press does not teleport: it glides to the target', () => {
  tap('d')
  assert.equal(transcript.scrollTop, 0, 'nothing may move synchronously')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'the glide must land exactly on one step')
})

check('the glide is progressive across frames (>=5 distinct samples)', () => {
  tap('d')
  const samples = []
  clock.advance(400, () => samples.push(transcript.scrollTop))
  const distinct = [...new Set(samples)]
  assert.ok(distinct.length >= 5, `expected a progressive glide, got ${distinct.length} distinct samples`)
  assert.ok(distinct[0] > 0 && distinct[0] < 140, 'the first frame must be a partial move')
  assert.equal(distinct[distinct.length - 1], 140)
  const steps = distinct.slice(1).map((v, i) => v - distinct[i])
  assert.ok(steps[0] > steps[steps.length - 1], 'the glide must decelerate (ease-out)')
})

check('e glides back up', () => {
  transcript.scrollTop = 400
  tap('e')
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 260)
})

check('holding accelerates past a single step', () => {
  transcript.scrollHeight = 200000
  keydown('d')
  clock.advance(200)
  assert.ok(transcript.scrollTop > 100 && transcript.scrollTop <= 140, 'before the repeat delay only the first step is queued')
  clock.advance(1800)
  keyup()
  const held = transcript.scrollTop
  assert.ok(held > 700, `holding must outrun a single step, got ${held}`)
  clock.advance(1500)
  const settled = transcript.scrollTop
  clock.advance(1000)
  assert.equal(transcript.scrollTop, settled, 'the view must settle once the key is released')
  transcript.scrollHeight = 5000
})

check('the OS key-repeat burst is ignored, not added on top', () => {
  keydown('d')
  const prevented = keydown('d', { repeat: true })
  keyup()
  clock.advance(1000)
  assert.equal(transcript.scrollTop, 140, 'a repeat event must not add a second step')
  assert.equal(prevented, true, 'the OS repeat is swallowed so it cannot double-step')
})

check('scrolling stops after release and stays stopped', () => {
  keydown('d')
  clock.advance(1000)
  const moving = transcript.scrollTop
  keyup()
  clock.advance(1500)
  const settled = transcript.scrollTop
  clock.advance(1000)
  assert.equal(transcript.scrollTop, settled, 'no residual run-on after the key is released')
  assert.ok(moving > 0)
})

// --- guards ----------------------------------------------------------------

check('typing d in the composer is untouched', () => {
  transcript.scrollTop = 500
  const prevented = keydown('d', { target: composer })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 500, 'the transcript must not move')
  assert.equal(composer.scrollTop, 0, 'the composer must not be scrolled')
  assert.equal(prevented, false, 'the character must reach the textarea')
})

check('Ctrl+D is left to the application', () => {
  keydown('d', { ctrlKey: true })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

check('IME composition never triggers a scroll', () => {
  keydown('d', { isComposing: true })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

check('an already prevented event is not re-handled', () => {
  keydown('d', { defaultPrevented: true })
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

check('unbound keys are ignored', () => {
  keydown('j')
  clock.advance(500)
  assert.equal(transcript.scrollTop, 0)
})

// --- what Enter does in the message box ------------------------------------

check('by default Enter in the message box is left to the host', () => {
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'host', 'the shipped default must not change sending')
  assert.equal(keydown('Enter', { target: editor }), false, 'the host keeps the key')
  assert.deepEqual(synthKeys, [], 'and nothing is handed to the box instead')
})

check('Enter breaks the line when the mode asks it to', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the original key is swallowed, so it cannot send')
  assert.equal(synthKeys.length, 1, 'one rewrite, not a burst')
  assert.equal(synthKeys[0].key, 'Enter', 'it is still Enter')
  assert.equal(synthKeys[0].shiftKey, true, 'flagged shift, which is what the host reads as a line break')
  assert.equal(synthKeys[0].ctrlKey, false, 'and nothing that would read as the send accelerator')
  assert.equal(synthKeys[0].metaKey, false)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter goes silent when the mode asks it to', () => {
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the key is swallowed')
  assert.deepEqual(synthKeys, [], 'and no line break is handed over either')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Ctrl and Cmd Enter keep sending whatever the mode is', () => {
  // Ctrl/Cmd+Enter is the host's own send accelerator. It is the only way left
  // to send in the modes that take Enter away, so swallowing it would leave the
  // user with no way to send at all.
  for (const mode of ['host', 'newline', 'silent', 'double']) {
    fakeWindow.__dshVim.update({ sendMode: mode })
    synthKeys.length = 0
    assert.equal(keydown('Enter', { target: editor, ctrlKey: true }), false, `Ctrl+Enter must pass in ${mode}`)
    assert.equal(keydown('Enter', { target: editor, metaKey: true }), false, `Cmd+Enter must pass in ${mode}`)
    assert.deepEqual(synthKeys, [], `nothing rewritten in ${mode}`)
  }
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Shift+Enter is still the host line break, untouched', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  // Shift+Enter already breaks the line on its own; rewriting it would only
  // risk a second one behind the first.
  assert.equal(keydown('Enter', { target: editor, shiftKey: true }), false)
  assert.deepEqual(synthKeys, [])
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

// --- the double-Enter send mode --------------------------------------------


check('the first Enter of a pair breaks the line and sends nothing', () => {
  armDoubleEnter()
  // The gesture must not cost the user a delayed keystroke: the first press is
  // the ordinary line break, and only the second one is a decision.
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the key is swallowed, so it cannot reach the host as a send')
  assert.equal(synthKeys.length, 1, 'and one line break is handed over')
  assert.equal(synthKeys[0].shiftKey, true, 'as the host\'s own line break')
  assert.equal(synthKeys[0].ctrlKey, false, 'not as a send')
  clock.advance(1000)
  assert.equal(editorBlurs, 0, 'nothing was sent, so nothing gives the keyboard back')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a second Enter inside the window sends, through the host\'s own key', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  clock.advance(100)
  const prevented = keydown('Enter', { target: editor })
  assert.equal(prevented, true, 'the second press is the plugin\'s to act on')
  assert.equal(synthKeys.length, 2, 'one line break, then one send')
  const sent = synthKeys[1]
  assert.equal(sent.key, 'Enter', 'the send is the host\'s own Enter')
  assert.equal(sent.ctrlKey, true, 'carrying the host\'s send accelerator')
  assert.equal(sent.shiftKey, false, 'and not the line-break flag')
  assert.equal(sent.bubbles, true, 'dispatched so the host\'s composer keymap hears it')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a slow second Enter breaks the line again instead of sending', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  // Past the window the pair is over: two paragraphs, not a confirmation.
  clock.advance(400)
  keydown('Enter', { target: editor })
  assert.equal(synthKeys.length, 2, 'both presses are line breaks')
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'and neither of them is a send'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('holding Enter never sends, however long it is held', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  for (let i = 0; i < 10; i++) keydown('Enter', { target: editor, repeat: true })
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'auto-repeat is one press held down, not a second press'
  )
  clock.advance(1000)
  assert.equal(editorBlurs, 0, 'so the keyboard stays in the box')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('any other key between the two Enters ends the pair', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  // A letter in the middle means the user was writing, not confirming: the
  // rhythm is broken, so the next Enter starts a new pair.
  keydown('x', { target: editor })
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'nothing was sent after the interruption'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a chorded or misplaced Enter between the two ends the pair too', () => {
  // Shift+Enter and Ctrl+Enter are not the bare Enter a pair is made of, and an
  // Enter aimed outside the box is not either: none of them may stand in for
  // the second half and turn the next bare Enter into a send.
  for (const interruption of [
    { target: editor, shiftKey: true },
    { target: editor, ctrlKey: true },
    { target: modalEditor },
  ]) {
    armDoubleEnter()
    keydown('Enter', { target: editor })
    keydown('Enter', interruption)
    synthKeys.length = 0
    keydown('Enter', { target: editor })
    assert.ok(
      synthKeys.every((k) => k.ctrlKey === false),
      `an Enter like ${JSON.stringify(interruption)} must not complete a pair`
    )
  }
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter on an empty box arms no pair', () => {
  armDoubleEnter('')
  keydown('Enter', { target: editor })
  // The box was empty, so that press could not have been the first half of a
  // pair. A draft pasted in afterwards must not be sent by one more Enter.
  editor.textContent = 'a message'
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false),
    'a send needs two presses on a box that had something to send'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a double-Enter send still hands the keyboard back', () => {
  armDoubleEnter()
  keydown('Enter', { target: editor })
  clock.advance(50)
  keydown('Enter', { target: editor })
  clock.advance(500)
  assert.equal(editorBlurs, 1, 'the box gives the keyboard back, as every other send does')
  assert.equal(fakeDocument.activeElement, body, 'so d / e / f work on the next press')
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a suggestion menu still owns Enter in the double mode', () => {
  armDoubleEnter('/plan')
  setMenuOnScreen(true)
  // The menu accepts its candidate on Enter after this plugin has seen it, so
  // intercepting here would turn "pick /plan" into a line break.
  assert.equal(keydown('Enter', { target: editor }), false, 'the menu keeps its key')
  assert.deepEqual(synthKeys, [], 'and nothing is slipped in behind it')
  setMenuOnScreen(false)
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('choosing the mode on the settings page arms the gesture at once', () => {
  // The user's question this answers: does a mode chosen in the settings page
  // apply on the page already open, or does it need a reload? It applies at
  // once — the page writes the preference and the plugin reads it live — and
  // the gesture must work on the very next Enter, with no restart in between.
  const modeRow = settingsElements().find(
    (e) => e.props && e.props.value === 'host' && e.props.options?.length === 4
  )
  assert.ok(modeRow, 'the four-way row must be on the page')
  modeRow.props.onSet('double')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'double', 'the live value moved')
  tap(' ')
  editor.textContent = 'a message'
  synthKeys.length = 0
  keydown('Enter', { target: editor })
  clock.advance(50)
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.some((k) => k.ctrlKey === true),
    'the second Enter must send on this same page, without a reload'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a blank line still has two routes, and neither sends', () => {
  // This is the honest cost of the mode: pressing Enter twice quickly is now
  // the send gesture, so it can no longer mean "skip a line". Both routes that
  // remain are asserted here, because the docs claim them.
  armDoubleEnter()

  // Route 1: two Shift+Enters. Shift+Enter is never a send in any mode, so it
  // is the fast way to a blank line and needs no timing at all.
  keydown('Enter', { target: editor, shiftKey: true })
  keydown('Enter', { target: editor, shiftKey: true })
  assert.deepEqual(synthKeys, [], 'Shift+Enter is the host\'s own key, untouched')

  // Route 2: two bare Enters, spaced past the window.
  synthKeys.length = 0
  keydown('Enter', { target: editor })
  clock.advance(400)
  keydown('Enter', { target: editor })
  assert.equal(synthKeys.length, 2, 'both presses break the line')
  assert.ok(
    synthKeys.every((k) => k.ctrlKey === false && k.shiftKey === true),
    'and both are the line-break gesture, not a send'
  )

  // And the pair route is still a send, so the two are genuinely different.
  synthKeys.length = 0
  keydown('Enter', { target: editor })
  clock.advance(50)
  keydown('Enter', { target: editor })
  assert.ok(
    synthKeys.some((k) => k.ctrlKey === true),
    'while two quick bare Enters do send — that is the mode'
  )
  editor.textContent = ''
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter is left alone while a suggestion menu is open', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  setMenuOnScreen(true)
  // The menu accepts its highlighted candidate on Enter, and it does so after
  // this plugin has seen the key: taking it here would turn "pick /plan" into
  // a line break the user never asked for.
  assert.equal(keydown('Enter', { target: editor }), false, 'the menu keeps its key')
  assert.deepEqual(synthKeys, [], 'and no line break is slipped in behind it')
  setMenuOnScreen(false)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('Enter outside the message box is never touched', () => {
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  // The terminal, the task window's name box, a plan editor, a settings field:
  // the mode is about the composer, and only the composer.
  const elsewhere = [
    composer,
    modalEditor,
    el({ tag: 'INPUT' }),
    el({ tag: 'TEXTAREA' }),
    el({ tag: 'DIV' }),
  ]
  for (const node of elsewhere) {
    assert.equal(keydown('Enter', { target: node }), false, `Enter must pass in ${node.tagName}`)
  }
  assert.deepEqual(synthKeys, [])
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('a mode that is not one of the four is refused', () => {
  const rejected = fakeWindow.__dshVim.update({ sendMode: 'never' })
  assert.equal(rejected.error, 'conflict', 'an unknown mode must be rejected')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'host', 'and the live value must not move')
})

check('the mode is offered on the settings page and follows the stored value', () => {
  const modeRow = settingsElements().find((e) => e.props && e.props.value === 'host' && e.props.options?.length === 4)
  assert.ok(modeRow, 'the four-way row must be on the page')
  const values = modeRow.props.options.map((o) => o.value)
  assert.deepEqual(
    values,
    ['host', 'newline', 'silent', 'double'],
    'in reading order: host first, the default'
  )
  for (const option of modeRow.props.options) {
    assert.ok(option.label, `option "${option.value}" must carry a label`)
  }
  // Pressing an option applies it, and the row follows.
  modeRow.props.onSet('double')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'double')
  modeRow.props.onSet('newline')
  assert.equal(fakeWindow.__dshVim.settings().sendMode, 'newline')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})



check('no send hint while Enter still sends', () => {
  // The hint names a key the user does not have to think about, so a mode that
  // leaves Enter alone must not put one on screen. It renders nothing at all,
  // which is what leaves the shell's dock row exactly as the host built it.
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  assert.equal(renderSendHint(), null, 'nothing is said about a key that is not in play')
})

check('choosing the line-break mode puts the send key in the dock row', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const line = sendHintText()
  assert.ok(line, 'the line must be up')
  assert.ok(/Ctrl\+Enter|Cmd\+Enter/.test(line), 'and it must name the key that sends')
  assert.ok(line.includes('Enter'), 'naming Enter first, so the reader knows what changed')
  const el = renderSendHint()
  assert.equal(el.props.role, 'status', 'announced, not acted on')
  // The row is the host's, and it is laid out and centred by the host: the hint
  // must bring no placement of its own to fight that with.
  assert.equal(el.props.style.position, undefined, 'no placement of its own')
  assert.equal(el.props.style.bottom, undefined)
  assert.equal(el.props.style.left, undefined)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the hint paints no surface over the conversation', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const style = renderSendHint().props.style
  assert.equal(style.background, undefined, 'a hint is a line of text, not a card')
  assert.equal(style.boxShadow, undefined, 'nor casts a shadow onto the row')
  assert.equal(style.border, undefined, 'nor draws an edge')
  assert.ok(/label-secondary/.test(String(style.color)), 'it borrows the shell muted text colour instead')
  // Two things that keep it harmless: it takes no pointer, and it cannot be
  // selected out of the page.
  assert.equal(style.pointerEvents, 'none', 'never a click target')
  assert.equal(style.userSelect, 'none', 'and never a copy target')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the silent mode says so, in different words from the line-break one', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  const breaking = sendHintText()
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  const silent = sendHintText()
  assert.ok(silent, 'the silent mode needs the line even more')
  assert.notEqual(silent, breaking, '"Enter breaks the line" and "Enter does nothing" are different facts')
  assert.ok(/\+Enter/.test(silent), 'both name the key that sends')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the send key is named for this machine', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  // The harness reports no platform, which is not a Mac, so the line must read
  // Ctrl — and on a Mac the same path has to be able to say Cmd, or the hint
  // names a key the user is not holding.
  assert.ok(/Ctrl\+Enter/.test(sendHintText()), 'a machine with no platform reads as Ctrl')
  const apple = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'MacIntel', language: 'zh-CN' },
    configurable: true,
    writable: true,
  })
  try {
    assert.ok(/Cmd\+Enter/.test(sendHintText()), 'a Mac is told Cmd, not Ctrl')
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: apple,
      configurable: true,
      writable: true,
    })
  }
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the double-Enter mode puts its own line in the dock row', () => {
  fakeWindow.__dshVim.update({ sendMode: 'double' })
  const line = sendHintText()
  assert.ok(line, 'the line must be up: this mode hides the host\'s accelerator too')
  assert.ok(/Enter/.test(line), 'it names Enter, the key whose meaning changed')
  assert.ok(/Ctrl\+Enter|Cmd\+Enter/.test(line), 'and it keeps naming the accelerator that still works')
  // Three modes, three different facts, and none of them may read as another.
  const breaking = (fakeWindow.__dshVim.update({ sendMode: 'newline' }), sendHintText())
  const silent = (fakeWindow.__dshVim.update({ sendMode: 'silent' }), sendHintText())
  assert.notEqual(line, breaking, '"breaks the line" and "sends on a double" are different facts')
  assert.notEqual(line, silent)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('the hint line is carried in both dictionaries', () => {
  const dictionaries = ctx.log.locales[0].dictionaries
  for (const table of [dictionaries.zh, dictionaries.en]) {
    for (const key of ['hintSendNewline', 'hintSendSilent', 'hintSendDouble', 'hintSendSends']) {
      assert.ok(table[key], `a ${key} label must exist and be non-empty`)
    }
  }
})

check('the hint goes away when the mode stops asking for it', () => {
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  assert.ok(sendHintText(), 'the line is up while the mode asks for it')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  assert.equal(renderSendHint(), null, 'and it is gone the moment it does not')
})

check('the hint is a live component, not a snapshot taken once', () => {
  // The shell renders this component, so nothing re-runs it on the user's
  // behalf: it has to be subscribed to the preference stream itself. A
  // component that rendered the mode it saw on its first render — the easy way
  // to write this — would keep saying "Enter sends" after the user turned that
  // off, which is the one lie this line must never tell.
  const dock = (ctx.log.slots['conversation.composer.dock'] ?? [])[0]
  ReactStub.reset()
  assert.equal(dock.component({ t: (k) => k }), null, 'it starts silent, because the mode is host')
  // Now the settings page turns the mode on. The shell would re-render; the
  // check does the same, and the subscription is what has to make it truthful.
  fakeWindow.__dshVim.update({ sendMode: 'newline' })
  ReactStub.reset()
  assert.ok(sendHintText(), 'after the change, the line names the new send key')
  // And back again, which is the direction that would otherwise be missed: a
  // line that only ever appears is wrong in the other direction too.
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  ReactStub.reset()
  assert.ok(/\+Enter/.test(sendHintText()), 'and it re-reads the mode each time it renders')
  assert.ok(sendHintText().length > 0)
  fakeWindow.__dshVim.update({ sendMode: 'host' })
  ReactStub.reset()
  assert.equal(renderSendHint(), null, 'so a mode that wants no line renders nothing')
})

check('the hint subscribes to the preference stream rather than reading once', () => {
  // Re-rendering is not enough on its own: the shell renders this component when
  // it has a reason to, and a mode changed in the settings page is not one of
  // them. Without a live subscription the line would keep saying "Enter sends"
  // until something else happened to repaint the dock — which is exactly the
  // state in which the user most needs to be told the truth.
  const dock = (ctx.log.slots['conversation.composer.dock'] ?? [])[0]
  ReactStub.reset()
  dock.component({ t: (k) => k })
  assert.ok(ReactStub.effects.length > 0, 'the component must install an effect, or it never listens')
  assert.ok(
    ReactStub.effects.every((dispose) => typeof dispose === 'function'),
    'and that effect must hand back a disposer, so unmounting can let go of it'
  )
  // Now prove the subscription is on the stream the settings page writes to:
  // the component's own render is not what moves it, the change is.
  fakeWindow.__dshVim.update({ sendMode: 'silent' })
  const line = sendHintText()
  assert.ok(line, 'after the change the line is up')
  fakeWindow.__dshVim.update({ sendMode: 'host' })
})

check('pressing d at the bottom does nothing and is not swallowed', () => {
  transcript.scrollTop = 4200
  const prevented = keydown('d')
  clock.advance(300)
  assert.equal(transcript.scrollTop, 4200)
  assert.equal(prevented, false)
})


