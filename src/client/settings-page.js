/**
 * Settings → Vim scrolling: the page's own controls (key chips, sliders,
 * choice rows), the model list the settings page reads, and the dock hint
 * that names the send key. React is the host's; the page is drawn with
 * createElement and upserted as one settings section.
 */
import React from 'react'
import { BOOL_SEATS, LIMITS, NS, SEND_MODES } from './constants.js'
import { applyPatch, copy, defaults, isBindableKey, keyLabel, normalizeKey, sanitizeFavorites, subscribe } from './preferences.js'
import { EN, ZH, localeIsZh, paletteText } from './strings.js'
import { catalogGroups, offeredModels } from './models.js'

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
      { style: UI.group },
      React.createElement('div', { style: UI.groupTitle }, tr('board')),
      sliderRow('snapshotKeep', 'snapshotKeepDays', 'dsh-vim-snapshot-keep'),
      React.createElement('div', { style: UI.hint }, tr('hintSnapshotKeep'))
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


export { installSettings, SendHintLine }
