/**
 * Whether one catalog row is the model currently in effect.
 * @param {object} entry - catalog row.
 * @param {object|null} here - `{provider, model}` of the selection in effect.
 * @returns {boolean} whether they name the same model.
 */
function isCurrentEntry(entry, here) {
  return !!here && !!entry && here.provider === entry.provider && here.model === entry.model
}

/**
 * The model catalog and the reasoning level of the conversation on screen:
 * what models the host offers, which levels each publishes, and the two
 * level actions (cycle and step) that write through the session directory.
 */
import { failureText, refusal } from './errors.js'
import { sanitizeFavorites, settings } from './preferences.js'
import { currentSession, serviceOf, taskCtx, taskServices } from './sessions.js'
import { paletteText } from './strings.js'
import { showToast } from './toast.js'

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

/** Whether one entry is the model the conversation is already on. */
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


export { catalogGroups, isCurrentEntry, modelDirectories, effortLevels, levelIndex, currentLevelId, cycleEffort, rowMarkedLevel, rowSubmitLevel, offeredModels, modelEntries, modelIndex, modelDirectoryOfCurrent, readModelList, readNewSessionModelList, levelName, switchModel }
