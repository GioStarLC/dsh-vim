/**
 * The board's memory of days: the moment it last drew, the pages filed for
 * finished days, the carried conversations, the day's seal, and the history
 * panel that reads them back. Repainting is injected — the canvas owns that.
 */
import { BOARD, boardTitleOf } from './board-state.js'
import { BOARD_CARRY_DROP_DAYS, HISTORY_EXPORT_KIND, SNAPSHOT_KEEP_DEFAULT, SNAPSHOT_MOMENT_KEY, SNAPSHOT_VERSION } from './constants.js'
import { settings } from './preferences.js'
import { attentionOf } from './runs.js'
import { conversationPool, statusOf } from './sessions.js'
import { BOARD_STORE, CARRY, HISTORY, JOURNAL, NOTE_STORE } from './board-stores.js'
import { BOARD_UI } from './board-css.js'
import { dayOf, daysBetween } from './time.js'
import { paletteText } from './strings.js'
import { showToast } from './toast.js'

/**
 * Repaint the canvas, supplied by the board view. A page filed or a day
 * settled changes what the canvas shows, but the canvas is not this module's.
 * @type {Function}
 */
let repaint = function () {}

/**
 * Register the canvas repaint.
 * @param {Function} fn - the board's render.
 * @returns {void}
 */
export function setHistoryRepaint(fn) {
  repaint = fn || function () {}
}

/** The page last handed to the store, so an unchanged one is not rewritten. */
var MOMENT_BODY = ''

/** The bytes that write left in the store, or empty when it did not land. */
var MOMENT_RAW = ''

/** The page the board last drew, as it was left, or null. */
function readMoment() {
  var parsed = null
  try {
    parsed = JSON.parse(window.localStorage.getItem(SNAPSHOT_MOMENT_KEY) || 'null')
  } catch (error) {
    parsed = null
  }
  if (!parsed || typeof parsed !== 'object') return null
  if (typeof parsed.date !== 'string' || !parsed.date) return null
  if (!parsed.view || typeof parsed.view !== 'object') return null
  return parsed
}

/** Forget the page that was left, once it has been filed. */
function forgetMoment() {
  MOMENT_BODY = ''
  MOMENT_RAW = ''
  try {
    window.localStorage.removeItem(SNAPSHOT_MOMENT_KEY)
  } catch (error) {
    console.warn('[dsh-vim] the last page could not be cleared', error)
  }
}

/**
 * Remember the page this repaint draws.
 *
 * Written on every repaint that changes the page, so a day can still be filed
 * after the app has been closed: the next open reads this, files it under its
 * own date, and starts the new day from it. Without it, yesterday would have
 * to be reconstructed from a feed that no longer remembers it.
 *
 * `capturedAt` is left out of the comparison and stamped at write time: two
 * identical pages a second apart are one page, and a timestamp that moves on
 * its own would turn every repaint into a write.
 * @param {object} page - `{date, doc, notes, view}`.
 * @returns {void}
 */
function noteMoment(page) {
  var body = JSON.stringify(page)
  // The same page is not written twice, but 'the same' has to mean the store
  // still holds what this page last wrote: a write that failed, and a store
  // that was emptied under it, are both reasons to try again rather than
  // reasons to skip.
  if (body === MOMENT_BODY && momentHeld(MOMENT_RAW)) return
  MOMENT_BODY = body
  page.capturedAt = Date.now()
  var serialized = ''
  try {
    serialized = JSON.stringify(page)
    window.localStorage.setItem(SNAPSHOT_MOMENT_KEY, serialized)
  } catch (error) {
    MOMENT_RAW = ''
    // What is on disk is a page older than this one: the day still files,
    // under what the store managed to keep, and the board draws on.
    console.warn('[dsh-vim] the last page could not be stored', error)
    return
  }
  MOMENT_RAW = serialized
}

/** Whether the store still holds exactly the bytes this page last wrote. */
function momentHeld(raw) {
  if (!raw) return false
  try {
    return window.localStorage.getItem(SNAPSHOT_MOMENT_KEY) === raw
  } catch (error) {
    return false
  }
}

/**
 * The arrangement a day's page keeps.
 *
 * Five of the document's ten tables, and the choice is deliberate: the other
 * five (`order`, `muted`, `starred`, `lineage`, `zoom`) are decisions the
 * reader made rather than a picture of the day - and they are also the only
 * part of the document that grows on its own, so copying them is what would
 * make a page too heavy to keep for ten years.
 * @returns {object} the part a page keeps.
 */
function pageDoc() {
  var doc = BOARD_STORE.read()
  return {
    blocks: doc.blocks,
    cards: doc.cards,
    blockLabels: doc.blockLabels,
    intents: doc.intents,
    placed: doc.placed,
  }
}

/**
 * The page as it reads, frozen.
 *
 * This is not a pointer into the board: it is what the eye saw, in the words
 * it saw it in. The ids are kept as well, so a page can still offer the way
 * into a conversation that happens to be here - but nothing on the page
 * depends on that conversation still existing, which is the whole reason it
 * is copied rather than referenced.
 * @param {Array<object>} blocks - the goals as drawn.
 * @param {object} places - block id -> {x, y}.
 * @param {object} titles - session id -> the name it was drawn with.
 * @param {Array<object>} cards - the idea cards.
 * @param {string} today - the local day being drawn.
 * @returns {object} `{goals, sessions, cards}`.
 */
function pageView(blocks, places, titles, cards, today) {
  var goals = []
  var sessions = []
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b]
    var place = places[block.key] || { x: 0, y: 0 }
    goals.push({
      key: block.key,
      label: block.label,
      intent: block.intent || '',
      kind: block.kind,
      x: Math.max(0, Math.round(Number(place.x) || 0)),
      y: Math.max(0, Math.round(Number(place.y) || 0)),
      folded: BOARD_STORE.isFolded(block.key),
    })
    for (var r = 0; r < block.rows.length; r++) {
      var row = block.rows[r]
      var state = statusOf(row)
      sessions.push({
        id: row.id,
        title: titles[row.id] || boardTitleOf(row),
        goal: block.key,
        statusKey: state ? state.key : '',
        status: state ? state.text : '',
        carriedDays: CARRY.days(row.id, today),
      })
    }
  }
  var listed = cards || []
  var notes = []
  for (var c = 0; c < listed.length; c++) {
    notes.push({
      id: listed[c].id,
      text: listed[c].text,
      done: listed[c].done === true,
      link: listed[c].link || '',
      filed: listed[c].filed || '',
    })
  }
  return { goals: goals, sessions: sessions, cards: notes }
}

/**
 * File the page that was left, and start today.
 *
 * Called from every repaint and from opening the board. The date filed is the
 * one the page was drawn on, not "today minus a day": a day the app was never
 * opened has no page, and inventing one would be inventing its members.
 * @returns {boolean} whether a day was filed.
 */
function settleDay() {
  var moment = readMoment()
  if (!moment) return false
  var today = dayOf(Date.now())
  if (moment.date === today) return false
  var record = {
    v: SNAPSHOT_VERSION,
    date: moment.date,
    capturedAt: Number(moment.capturedAt) || Date.now(),
    doc: moment.doc || null,
    notes: moment.notes || {},
    view: moment.view || null,
  }
  filePage(record)
  settleCarry(record.view, moment.date, today)
  forgetMoment()
  JOURNAL.add('day/sealed', { date: record.date })
  // The page just filed is the day that ended: its summary is shown the
  // next time the board is up, which is the moment the reader is standing
  // in front of an empty desk and wondering where they left off.
  BOARD.sealPending = record.date
  return true
}

/**
 * Write one page, and keep the history's size honest.
 *
 * A database that will not take the page is almost always one that is full.
 * The oldest page is then the one to lose - it is the one nobody has opened
 * in the longest - and the page just filed is offered again. Losing that
 * instead would mean the newest day is the one that vanishes, which is the
 * opposite of what a history is for.
 * @param {object} record - the page.
 * @returns {void}
 */
function filePage(record) {
  HISTORY.put(record).then(function (stored) {
    if (stored) {
      pruneHistory()
      return
    }
    HISTORY.days().then(function (days) {
      if (!days.length) {
        showToast(paletteText('boardSnapshotFailed'))
        return
      }
      HISTORY.drop(days[0]).then(function () {
        HISTORY.put(record).then(function (again) {
          if (again) pruneHistory()
          else showToast(paletteText('boardSnapshotFailed'))
        })
      })
    })
  })
}

/**
 * Carry the members of the page just filed into today.
 *
 * Three kinds stay behind: a finished conversation (the reader dealt with
 * it), one taken off the board (a decision, not an omission), and one that
 * has been archived - which needs no test here, because an archived
 * conversation is not in the pool the board draws from at all.
 * @param {object} view - the page's view.
 * @param {string} from - the day it was drawn on.
 * @param {string} today - the day being started.
 * @returns {void}
 */
function settleCarry(view, from, today) {
  var sessions = Object.create(null)
  var listed = (view && view.sessions) || []
  for (var i = 0; i < listed.length; i++) {
    var each = listed[i]
    if (!each || typeof each.id !== 'string' || !each.id) continue
    if (each.statusKey === 'done') continue
    sessions[each.id] = {
      from: from,
      title: typeof each.title === 'string' ? each.title : '',
      goal: typeof each.goal === 'string' ? each.goal : '',
    }
  }
  CARRY.settle(today, sessions)
}

/** Keep the newest `snapshotKeepDays` pages, and no more. */
function pruneHistory() {
  var keep = Math.max(7, Math.floor(Number(settings.snapshotKeepDays) || SNAPSHOT_KEEP_DEFAULT))
  HISTORY.days().then(function (days) {
    if (days.length <= keep) return
    var doomed = days.slice(0, days.length - keep)
    for (var i = 0; i < doomed.length; i++) HISTORY.drop(doomed[i])
  })
}

/**
 * Let go of the conversations carried longest with no movement.
 *
 * The reader's press, never a timer: a card that leaves the board overnight
 * is the one thing this board must not do. Only the carried set changes - the
 * conversation is untouched, and it comes back the moment it moves.
 * @param {number} minDays - how long a conversation must have been carried.
 * @returns {number} how many were let go.
 */
function dropCarried(minDays) {
  var today = dayOf(Date.now())
  var all = CARRY.all()
  var keep = Object.create(null)
  var dropped = 0
  for (var id in all) {
    if (!Object.prototype.hasOwnProperty.call(all, id)) continue
    if (daysBetween(all[id].from, today) >= minDays) {
      dropped = dropped + 1
      continue
    }
    keep[id] = all[id]
  }
  if (!dropped) return 0
  CARRY.settle(today, keep)
  return dropped
}

/**
 * Show the day that just ended, once, the first time the board is up after it.
 *
 * Read off the journal rather than off the page, which is the whole point:
 * a page says what was on the desk when the reader last looked, and the
 * journal says what moved while nobody was looking. The summary is shown
 * after the rollover the board already performs, so it costs the reader no
 * extra visit and never interrupts a day in progress.
 * @returns {void}
 */
function maybeShowSeal() {
  var date = BOARD.sealPending
  if (!date || BOARD.sealNode || !BOARD.open || !BOARD.panel) return
  // Asked once: a paint that arrives while the database is answering must
  // not open a second summary over the first.
  BOARD.sealPending = ''
  if (!JOURNAL.available()) return
  JOURNAL.day(date).then(function (lines) {
    if (!BOARD.open || !BOARD.panel || BOARD.sealNode) return
    if (!lines || !lines.length) return
    paintSeal(date, lines)
  })
}

/**
 * The counts one day's summary reads off.
 *
 * One pass over the lines, and only what the reader did: a line about a
 * page being filed is a fact about the record, not about the day.
 * @param {Array<object>} lines - the day's journal lines, oldest first.
 * @returns {{written: Array<string>, handed: Array<string>, done: number, finished: number, born: number}}
 */
function sealCounts(lines) {
  var counts = { written: [], handed: [], done: 0, finished: 0, born: 0 }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (!line || typeof line.kind !== 'string') continue
    if (line.kind === 'note/written') counts.written.push(String(line.text || ''))
    else if (line.kind === 'note/handoff') counts.handed.push(String(line.text || ''))
    else if (line.kind === 'note/done') counts.done = counts.done + 1
    else if (line.kind === 'thread/finished') counts.finished = counts.finished + 1
    else if (line.kind === 'thread/born') counts.born = counts.born + 1
  }
  return counts
}

/**
 * What the desk still owes the reader, as of this press.
 *
 * Asked of the live feed rather than of yesterday's page: the question is
 * about the morning the summary is read in, and the page cannot know it.
 * @returns {{waiting: number, live: number, carried: number}}
 */
function sealLeft() {
  var pool = conversationPool()
  var waiting = 0
  var live = 0
  for (var i = 0; i < pool.length; i++) {
    var attention = attentionOf(pool[i])
    if (attention === 'mine') waiting = waiting + 1
    else if (attention === 'live') live = live + 1
  }
  var carried = 0
  var all = CARRY.all()
  for (var id in all) {
    if (!Object.prototype.hasOwnProperty.call(all, id)) continue
    carried = carried + 1
  }
  return { waiting: waiting, live: live, carried: carried }
}

/**
 * Draw one day's summary.
 *
 * Three lines at most, and the words themselves under the two that have
 * words: a count is a fact, the sentence the reader wrote is what they
 * came back for. A day with nothing on it says so rather than showing a
 * column of zeroes, because zero is not news.
 * @param {string} date - the day that ended.
 * @param {Array<object>} lines - its journal lines.
 * @returns {void}
 */
function paintSeal(date, lines) {
  var counts = sealCounts(lines)
  var left = sealLeft()
  var host = document.createElement('div')
  Object.assign(host.style, BOARD_UI.sealHost)
  host.setAttribute('data-role', 'boardSeal')
  var card = document.createElement('div')
  Object.assign(card.style, BOARD_UI.sealCard)
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', paletteText('boardSealTitle'))
  host.appendChild(card)

  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.sealTitle)
  head.setAttribute('data-role', 'sealDate')
  head.textContent = date + paletteText('boardSealOfDay')
  card.appendChild(head)

  /** One counted line, and the words under it when it has any. */
  function counted(label, count, words) {
    if (!count) return
    var line = document.createElement('div')
    Object.assign(line.style, BOARD_UI.sealRow)
    line.setAttribute('data-role', 'sealLine')
    line.textContent = label + ' ' + count
    card.appendChild(line)
    if (!words || !words.length) return
    var said = words.slice(0, 3).filter(function (each) { return !!each })
    if (!said.length) return
    var under = document.createElement('div')
    Object.assign(under.style, BOARD_UI.sealWords)
    under.setAttribute('data-role', 'sealWords')
    under.textContent = said.join(' · ')
    card.appendChild(under)
  }

  counted(paletteText('boardSealWritten'), counts.written.length, counts.written)
  counted(paletteText('boardSealHanded'), counts.handed.length, counts.handed)
  counted(paletteText('boardSealDone'), counts.done, null)
  counted(paletteText('boardSealFinished'), counts.finished, null)
  counted(paletteText('boardSealBorn'), counts.born, null)
  if (!counts.written.length && !counts.handed.length && !counts.done
    && !counts.finished && !counts.born) {
    var quiet = document.createElement('div')
    Object.assign(quiet.style, BOARD_UI.sealRow)
    quiet.setAttribute('data-role', 'sealLine')
    quiet.textContent = paletteText('boardSealNone')
    card.appendChild(quiet)
  }

  var today = document.createElement('div')
  Object.assign(today.style, BOARD_UI.sealRow)
  today.setAttribute('data-role', 'sealLeft')
  today.textContent = paletteText('boardSealLeft') + ': '
    + paletteText('boardSealWaiting') + ' ' + left.waiting + ' · '
    + paletteText('boardSealLive') + ' ' + left.live + ' · '
    + paletteText('boardSealCarried') + ' ' + left.carried
  card.appendChild(today)

  var close = document.createElement('span')
  Object.assign(close.style, BOARD_UI.sealClose)
  close.setAttribute('role', 'button')
  close.setAttribute('data-role', 'sealClose')
  close.textContent = paletteText('boardSealClose')
  card.appendChild(close)

  // A page is closed by a press: on the paper, on the button, or with the
  // three keys that mean 'yes, seen' everywhere else in this plugin.
  host.addEventListener('click', function () {
    closeSeal()
  })
  BOARD.sealNode = host
  BOARD.panel.appendChild(host)
}

/** Take the day's summary down. */
function closeSeal() {
  if (BOARD.sealNode && BOARD.sealNode.parentNode) {
    BOARD.sealNode.parentNode.removeChild(BOARD.sealNode)
  }
  BOARD.sealNode = null
}

/** How many pages one search of the history reads before it stops. */
var HISTORY_SEARCH_PAGES = 200

/** The one-line search above the days. */
function historySearchRow() {
  var row = document.createElement('div')
  Object.assign(row.style, BOARD_UI.historyTools)
  var field = document.createElement('input')
  field.setAttribute('type', 'text')
  field.setAttribute('data-role', 'historySearch')
  // A field is the field's: the canvas press router leaves it alone, and
  // the key router already yields to anything a printable key belongs to.
  field.setAttribute('data-no-drag', 'true')
  field.setAttribute('placeholder', paletteText('boardHistorySearch'))
  field.value = BOARD.historyQuery || ''
  Object.assign(field.style, BOARD_UI.historySearch)
  field.addEventListener('input', function () {
    BOARD.historyQuery = String(field.value || '')
    renderHistory()
  })
  BOARD.historySearch = field
  row.appendChild(field)
  return row
}

/**
 * Find a sentence across the pages, newest first.
 *
 * A history is asked one question more often than any other: where did I
 * write that. The pages are read newest first and the search stops at a
 * bounded number of them, because a search that opened ten years of pages
 * would be the one thing this panel must never do - it says how many it
 * looked at rather than pretending it read them all.
 * @param {string} query - what to look for, already trimmed.
 * @param {object} list - the list element the panel is showing.
 * @returns {void}
 */
function searchHistory(query, list) {
  var needle = query.toLowerCase()
  var searched = 0
  HISTORY.days().then(function (days) {
    if (!list || BOARD.historyList !== list) return
    var newest = (days || []).slice().reverse().slice(0, HISTORY_SEARCH_PAGES)
    var found = []
    var chain = Promise.resolve()
    newest.forEach(function (date) {
      chain = chain.then(function () {
        if (found.length >= 20) return null
        return HISTORY.day(date).then(function (record) {
          searched = searched + 1
          var hits = historyMatches(record, needle)
          if (hits.length) found.push({ date: date, hits: hits })
        })
      })
    })
    return chain.then(function () {
      if (!list || BOARD.historyList !== list) return
      list.textContent = ''
      if (!found.length) {
        list.appendChild(historyNote(paletteText('boardHistorySearchNone')))
        list.appendChild(historyNote(paletteText('boardHistorySearchScope')
          + searched + paletteText('boardHistorySearchUnit')))
        return
      }
      for (var i = 0; i < found.length; i++) {
        list.appendChild(historyHitRow(found[i].date, found[i].hits))
      }
      list.appendChild(historyNote(paletteText('boardHistorySearchScope')
        + searched + paletteText('boardHistorySearchUnit')))
    })
  })
}

/**
 * The lines of one page that carry the needle: its cards, its notes, its names.
 * @param {object} record - one day's page.
 * @param {string} needle - the query, lowercased.
 * @returns {Array<string>} up to three matching lines.
 */
function historyMatches(record, needle) {
  var hits = []
  if (!record) return hits
  var view = record.view || {}
  var cards = Array.isArray(view.cards) ? view.cards : []
  var c
  for (c = 0; c < cards.length && hits.length < 3; c++) {
    var text = cards[c] && typeof cards[c].text === 'string' ? cards[c].text : ''
    if (text && text.toLowerCase().indexOf(needle) !== -1) hits.push(text)
  }
  var notes = record.notes && typeof record.notes === 'object' ? record.notes : {}
  for (var id in notes) {
    if (!Object.prototype.hasOwnProperty.call(notes, id)) continue
    if (hits.length >= 3) break
    var pinned = notes[id]
    if (typeof pinned !== 'string') continue
    if (pinned.toLowerCase().indexOf(needle) === -1) continue
    hits.push(pinned)
  }
  var sessions = Array.isArray(view.sessions) ? view.sessions : []
  for (var s = 0; s < sessions.length && hits.length < 3; s++) {
    var title = sessions[s] && sessions[s].title ? String(sessions[s].title) : ''
    if (title && title.toLowerCase().indexOf(needle) !== -1) hits.push(title)
  }
  return hits
}

/** One page a search found, with the lines it was found by. */
function historyHitRow(date, hits) {
  var row = document.createElement('div')
  Object.assign(row.style, BOARD_UI.historyDay)
  row.setAttribute('data-role', 'historyHit')
  row.setAttribute('data-date', date)
  var box = document.createElement('div')
  Object.assign(box.style, BOARD_UI.historyDayMain)
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.historyDayDate)
  head.textContent = date
  box.appendChild(head)
  for (var i = 0; i < hits.length; i++) {
    var line = document.createElement('div')
    Object.assign(line.style, BOARD_UI.historyLine)
    line.textContent = hits[i].slice(0, 120)
    box.appendChild(line)
  }
  row.appendChild(box)
  row.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    BOARD.historyQuery = ''
    if (BOARD.historySearch) BOARD.historySearch.value = ''
    BOARD.historyDate = date
    BOARD.historyArmed = ''
    renderHistory()
  })
  return row
}

/**
 * Open the history: the pages the board has been.
 *
 * Read-only by construction. Nothing here writes a page: the only presses that
 * change anything are the two at the bottom of a day's detail (restore, which
 * copies that page into today and keeps a copy of what it replaced) and the
 * drop, which only ever shortens the carried set.
 * @returns {boolean} whether the panel is up.
 */
function openBoardHistory() {
  if (!BOARD.open || !BOARD.panel) return false
  if (BOARD.historyNode) {
    closeBoardHistory()
    return false
  }
  BOARD.historyDate = ''
  BOARD.historyArmed = ''
  var node = document.createElement('div')
  Object.assign(node.style, BOARD_UI.historyPanel)
  node.setAttribute('data-role', 'boardHistoryPanel')
  // The panel is not part of the canvas: a press in it must not start a pan,
  // and must not be read as a press on the paper behind it.
  node.addEventListener('pointerdown', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  })

  var tools = document.createElement('div')
  Object.assign(tools.style, BOARD_UI.historyTools)
  var caption = document.createElement('span')
  caption.style.flex = '1 1 auto'
  caption.textContent = paletteText('boardHistory')
  tools.appendChild(caption)

  /** One word in the tools row. */
  function tool(label, role, run, hint) {
    var each = document.createElement('span')
    Object.assign(each.style, BOARD_UI.historyTool)
    each.setAttribute('role', 'button')
    each.setAttribute('data-role', role)
    if (hint) each.setAttribute('title', hint)
    each.textContent = label
    each.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      run()
    })
    return each
  }

  tools.appendChild(tool(paletteText('boardHistoryExport'), 'historyExport', function () {
    exportHistory()
  }))
  tools.appendChild(tool(paletteText('boardHistoryImport'), 'historyImport', function () {
    pickHistoryFile()
  }))
  tools.appendChild(tool(paletteText('boardHistoryDrop'), 'historyDrop', function () {
    var gone = dropCarried(BOARD_CARRY_DROP_DAYS)
    showToast(gone
      ? paletteText('boardHistoryDropped') + gone + paletteText('boardHistorySessionsUnit')
      : paletteText('boardHistoryDropNone'))
    if (BOARD.open) repaint()
  }, paletteText('boardHistoryDropHint')))
  tools.appendChild(tool(paletteText('boardHistoryClose'), 'historyClose', function () {
    closeBoardHistory()
  }))
  node.appendChild(tools)
  // Above the days, because the question a history is asked is almost
  // never what day it was: it is where did I write that.
  node.appendChild(historySearchRow())

  var list = document.createElement('div')
  Object.assign(list.style, BOARD_UI.historyList)
  list.setAttribute('data-role', 'historyList')
  node.appendChild(list)

  BOARD.historyNode = node
  BOARD.historyList = list
  BOARD.panel.appendChild(node)
  renderHistory()
  return true
}

/** Take the history panel down, whichever page it was showing. */
function closeBoardHistory() {
  BOARD.historyDate = ''
  BOARD.historyArmed = ''
  // A search is about a panel that was open: the next visit starts from the
  // days, not from a query nobody can see.
  BOARD.historyQuery = ''
  BOARD.historySearch = null
  if (BOARD.historyNode && BOARD.historyNode.parentNode) {
    BOARD.historyNode.parentNode.removeChild(BOARD.historyNode)
  }
  BOARD.historyNode = null
  BOARD.historyList = null
}

/**
 * Draw the list of days.
 *
 * Only the dates are read to draw it: a page's contents cost one record read
 * each, and a list that opened by reading ten years of them would make the
 * panel slow in exactly the case it matters. A day is read when it is opened.
 * @returns {void}
 */
function renderHistory() {
  var list = BOARD.historyList
  if (!list) return
  list.textContent = ''
  if (!HISTORY.available()) {
    list.appendChild(historyNote(paletteText('boardHistoryUnavailable')))
    return
  }
  var query = String(BOARD.historyQuery || '').trim()
  if (query) {
    searchHistory(query, list)
    return
  }
  HISTORY.days().then(function (days) {
    // The panel may have been closed, or reopened onto another list, while
    // the database was answering.
    if (!list || BOARD.historyList !== list) return
    list.textContent = ''
    if (!days.length) {
      list.appendChild(historyNote(paletteText('boardHistoryEmpty')))
      return
    }
    for (var i = days.length - 1; i >= 0; i--) list.appendChild(historyDayRow(days[i]))
  })
}

/** One quiet sentence where a page would be. */
function historyNote(text) {
  var note = document.createElement('div')
  Object.assign(note.style, BOARD_UI.historyEmpty)
  note.textContent = text
  return note
}

/** How a page reads at a glance: what it was made of. */
function historyMeta(record) {
  var view = record.view || {}
  var goals = Array.isArray(view.goals) ? view.goals.length : 0
  var sessions = Array.isArray(view.sessions) ? view.sessions.length : 0
  var cards = Array.isArray(view.cards) ? view.cards.length : 0
  return goals + paletteText('boardHistoryGoalsUnit') + ' · '
    + sessions + paletteText('boardHistorySessionsUnit') + ' · '
    + cards + paletteText('boardHistoryCardsUnit')
}

/** One day in the list, and its page once it is opened. */
function historyDayRow(date) {
  var opened = BOARD.historyDate === date
  var row = document.createElement('div')
  Object.assign(row.style, opened ? BOARD_UI.historyDayOpen : BOARD_UI.historyDay)
  row.setAttribute('data-role', 'historyDay')
  row.setAttribute('data-date', date)
  var main = document.createElement('div')
  Object.assign(main.style, BOARD_UI.historyDayMain)
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.historyDayDate)
  head.textContent = date
  main.appendChild(head)
  row.appendChild(main)
  row.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    BOARD.historyDate = opened ? '' : date
    // Arming belongs to one day at a time: opening another page disarms the
    // one that was waiting for a second press.
    BOARD.historyArmed = ''
    renderHistory()
  })
  var wrap = document.createElement('div')
  wrap.appendChild(row)
  if (opened) wrap.appendChild(historyDetail(date))
  return wrap
}

/** One day's page, as it read: its goals, their conversations, its cards. */
function historyDetail(date) {
  var box = document.createElement('div')
  Object.assign(box.style, BOARD_UI.historyDetail)
  box.setAttribute('data-role', 'historyDetail')
  HISTORY.day(date).then(function (record) {
    if (!box.parentNode) return
    box.textContent = ''
    if (!record || !record.view) {
      box.appendChild(historyNote(paletteText('boardHistoryDayBroken')))
      return
    }
    var view = record.view
    var meta = document.createElement('div')
    Object.assign(meta.style, BOARD_UI.historyDayMeta)
    meta.setAttribute('data-role', 'historyMeta')
    meta.textContent = historyMeta(record)
    box.appendChild(meta)
    var goals = Array.isArray(view.goals) ? view.goals : []
    var sessions = Array.isArray(view.sessions) ? view.sessions : []
    for (var g = 0; g < goals.length; g++) {
      var goal = goals[g] || {}
      var one = document.createElement('div')
      Object.assign(one.style, BOARD_UI.historyGoal)
      var name = document.createElement('div')
      Object.assign(name.style, BOARD_UI.historyGoalHead)
      name.setAttribute('data-role', 'historyGoal')
      name.textContent = goal.label || goal.key || paletteText('boardNewGoal')
      one.appendChild(name)
      if (goal.intent) {
        var intent = document.createElement('div')
        Object.assign(intent.style, BOARD_UI.historyGoalIntent)
        intent.textContent = goal.intent
        one.appendChild(intent)
      }
      for (var s = 0; s < sessions.length; s++) {
        if (sessions[s].goal !== goal.key) continue
        var line = document.createElement('div')
        Object.assign(line.style, BOARD_UI.historyLine)
        line.setAttribute('data-role', 'historySession')
        line.textContent = sessions[s].title || sessions[s].id
        if (sessions[s].status) {
          var state = document.createElement('span')
          Object.assign(state.style, BOARD_UI.historyStatus)
          state.textContent = ' · ' + sessions[s].status
          line.appendChild(state)
        }
        if (sessions[s].carriedDays > 0) {
          var carried = document.createElement('span')
          Object.assign(carried.style, BOARD_UI.historyStatus)
          carried.textContent = ' · ' + paletteText('boardHistoryCarried')
            + sessions[s].carriedDays + paletteText('boardHistoryCarriedUnit')
          line.appendChild(carried)
        }
        one.appendChild(line)
      }
      box.appendChild(one)
    }
    var cards = Array.isArray(view.cards) ? view.cards : []
    for (var c = 0; c < cards.length; c++) {
      if (!cards[c] || !cards[c].text) continue
      var note = document.createElement('div')
      Object.assign(note.style, BOARD_UI.historyLine)
      note.setAttribute('data-role', 'historyCard')
      note.textContent = (cards[c].done ? '✓ ' : '') + cards[c].text
      box.appendChild(note)
    }
    // The two presses a page offers. Restore is the copy; the backup is the
    // way back from it, and is offered only once one exists.
    var restore = document.createElement('span')
    var armed = BOARD.historyArmed === date
    Object.assign(restore.style, armed ? BOARD_UI.historyRestoreArmed : BOARD_UI.historyRestore)
    restore.setAttribute('role', 'button')
    restore.setAttribute('data-role', 'historyRestore')
    if (armed) restore.setAttribute('data-armed', 'true')
    restore.setAttribute('title', paletteText(armed ? 'boardHistoryRestoreArmed' : 'boardHistoryRestore'))
    restore.textContent = paletteText(armed ? 'boardHistoryRestoreArmed' : 'boardHistoryRestore')
    restore.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      if (BOARD.historyArmed !== date) {
        BOARD.historyArmed = date
        renderHistory()
        return
      }
      BOARD.historyArmed = ''
      restoreDay(date).then(function (done) {
        if (!done) {
          showToast(paletteText('boardHistoryDayBroken'))
          renderHistory()
          return
        }
        showToast(paletteText('boardHistoryRestored') + date + paletteText('boardHistoryRestoredTail'))
        closeBoardHistory()
      })
    })
    box.appendChild(restore)
    HISTORY.backup().then(function (boxed) {
      if (!boxed || !boxed.snapshot || !box.parentNode) return
      var back = document.createElement('span')
      Object.assign(back.style, BOARD_UI.historyRestore)
      back.setAttribute('role', 'button')
      back.setAttribute('data-role', 'historyBefore')
      back.setAttribute('title', paletteText('boardHistoryBeforeHint'))
      back.textContent = paletteText('boardHistoryBefore')
      back.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        takeBeforeBackup().then(function (done) {
          if (!done) return
          showToast(paletteText('boardHistoryBeforeDone'))
          closeBoardHistory()
        })
      })
      box.appendChild(back)
    })
  })
  return box
}

/**
 * Copy one page into today.
 *
 * What it replaces is kept first, in the one backup slot, so the press that
 * was too quick has a way back that survives a reload. The page itself is not
 * touched: a history that a restore could rewrite would not be a history.
 * @param {string} date - the day to copy.
 * @returns {Promise<boolean>} whether the board now stands on that page.
 */
function restoreDay(date) {
  return HISTORY.day(date).then(function (record) {
    if (!record || !record.doc) return false
    return keepBackup().then(function () {
      var done = BOARD_STORE.adopt(record.doc)
      applyPageOrder(record.view)
      settleRestoredCarry(record)
      if (BOARD.open) repaint()
      return done
    })
  })
}

/**
 * Put the page's own arrangement back onto the panels.
 *
 * A page keeps five tables, and the order each panel remembers is not one
 * of them: it is a table that grows by itself. But the order is no longer
 * decoration - a panel reads across its conversations, and a branch stands
 * beside the one it came from - so a restored day whose order was left as
 * it is would be drawn as a different day. The page's view carries the order
 * it was drawn in; that is what is written back here.
 * @param {object} view - the page's frozen view.
 * @returns {void}
 */
function applyPageOrder(view) {
  if (!view || !Array.isArray(view.sessions)) return
  var byGoal = Object.create(null)
  for (var i = 0; i < view.sessions.length; i++) {
    var each = view.sessions[i]
    if (!each || typeof each.id !== 'string' || !each.id) continue
    var goal = typeof each.goal === 'string' ? each.goal : ''
    if (!goal) continue
    if (!byGoal[goal]) byGoal[goal] = []
    byGoal[goal].push(each.id)
  }
  for (var key in byGoal) {
    if (!Object.prototype.hasOwnProperty.call(byGoal, key)) continue
    BOARD_STORE.setOrder(key, byGoal[key])
  }
}

/** Seat a restored page's members as today's carried set. */
function settleRestoredCarry(record) {
  var today = dayOf(Date.now())
  settleCarry(record.view || null, record.date || today, today)
}

/**
 * Keep what a restore or an import is about to replace.
 *
 * The board, the notes and the carried set: the three things those two
 * actions write. One slot, so the way back is always the last thing that
 * changed anything - and it lives in the database rather than in memory, so
 * it survives the reload an in-page undo does not.
 * @returns {Promise<boolean>} whether it was kept.
 */
function keepBackup() {
  var snapshot = {
    board: pageDoc(),
    notes: NOTE_STORE.all(),
    carried: CARRY.all(),
  }
  return HISTORY.setBackup(snapshot).then(function (stored) {
    BOARD.historyBefore = stored ? snapshot : null
    return stored
  })
}

/** Take back what the last restore or import replaced. */
function takeBeforeBackup() {
  return HISTORY.backup().then(function (boxed) {
    if (!boxed || !boxed.snapshot) return false
    var snapshot = boxed.snapshot
    if (snapshot.board) BOARD_STORE.adopt(snapshot.board)
    if (snapshot.notes) NOTE_STORE.adopt(snapshot.notes)
    if (snapshot.carried) CARRY.settle(dayOf(Date.now()), snapshot.carried)
    if (BOARD.open) repaint()
    return true
  })
}

/**
 * Hand a file to the browser.
 * @param {string} name - the file name it should get.
 * @param {object} payload - what to write.
 * @returns {boolean} whether the browser took it.
 */
function downloadJson(name, payload) {
  try {
    if (typeof Blob !== 'function') return false
    if (!window.URL || typeof window.URL.createObjectURL !== 'function') return false
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    var url = window.URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', name)
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(function () {
      try {
        window.URL.revokeObjectURL(url)
      } catch (error) {
        // Already revoked by the browser.
      }
    }, 0)
    return true
  } catch (error) {
    console.warn('[dsh-vim] the history could not be exported', error)
    return false
  }
}

/**
 * Write the board, its notes and every page into one file.
 *
 * One file rather than one per day: this is the copy a reader carries to
 * another machine, so it has to be one thing they can find, send and open.
 * @returns {Promise<boolean>} whether it was written.
 */
function exportHistory() {
  return HISTORY.days().then(function (days) {
    var records = []
    var chain = Promise.resolve()
    for (var i = 0; i < days.length; i++) {
      (function (date) {
        chain = chain.then(function () {
          return HISTORY.day(date).then(function (record) {
            if (record) records.push(record)
          })
        })
      })(days[i])
    }
    return chain.then(function () {
      var payload = {
        v: SNAPSHOT_VERSION,
        kind: HISTORY_EXPORT_KIND,
        exportedAt: Date.now(),
        board: pageDoc(),
        notes: NOTE_STORE.all(),
        carried: CARRY.all(),
        days: records,
      }
      if (!downloadJson('dsh-vim-history-' + dayOf(Date.now()) + '.json', payload)) return false
      showToast(paletteText('boardHistoryExported'))
      return true
    })
  })
}

/** Ask for one file, and take it in when it arrives. */
function pickHistoryFile() {
  var input = document.createElement('input')
  input.setAttribute('type', 'file')
  input.setAttribute('accept', 'application/json,.json')
  input.style.display = 'none'
  input.addEventListener('change', function () {
    var file = input.files && input.files[0]
    if (!file) return
    var reader = new window.FileReader()
    reader.onload = function () {
      importHistory(String(reader.result || ''))
    }
    reader.onerror = function () {
      showToast(paletteText('boardHistoryImportFailed') + paletteText('boardHistory'))
    }
    reader.readAsText(file)
  })
  document.body.appendChild(input)
  input.click()
  window.setTimeout(function () {
    if (input.parentNode) input.parentNode.removeChild(input)
  }, 0)
}

/**
 * Take in one exported file.
 *
 * An import is a whole state arriving, so it is the one action that replaces
 * rather than merges - and the state it replaces is kept first, which is what
 * the toast promises. Pages are merged by date: importing a file can bring
 * back days this board does not have, and can correct a day it does, but it
 * can never take a day away.
 * @param {string} text - the file's contents.
 * @returns {Promise<boolean>} whether anything was taken.
 */
function importHistory(text) {
  var payload = null
  try {
    payload = JSON.parse(String(text || ''))
  } catch (error) {
    payload = null
  }
  if (!payload || payload.kind !== HISTORY_EXPORT_KIND) {
    showToast(paletteText('boardHistoryImportFailed') + paletteText('boardHistory'))
    return Promise.resolve(false)
  }
  return keepBackup().then(function () {
    if (payload.board) BOARD_STORE.adopt(payload.board)
    if (payload.notes) NOTE_STORE.adopt(payload.notes)
    if (payload.carried) CARRY.settle(dayOf(Date.now()), payload.carried)
    var days = Array.isArray(payload.days) ? payload.days : []
    var chain = Promise.resolve()
    for (var i = 0; i < days.length; i++) {
      (function (record) {
        chain = chain.then(function () {
          if (!record || typeof record.date !== 'string') return null
          return HISTORY.put(record)
        })
      })(days[i])
    }
    return chain.then(function () {
      if (BOARD.open) repaint()
      showToast(paletteText('boardHistoryImported'))
      return true
    })
  })
}



export { closeBoardHistory, closeSeal, dropCarried, maybeShowSeal, noteMoment, openBoardHistory, pageDoc, pageView, restoreDay, settleDay, exportHistory, importHistory, keepBackup, takeBeforeBackup, pruneHistory, settleCarry, filePage }
