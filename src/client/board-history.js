/**
 * The board's memory of days: the moment it last drew, the pages filed for
 * finished days, the carried conversations, the day's seal, and the history
 * panel that reads them back. Repainting is injected — the canvas owns that.
 */
import { BOARD, boardTitleOf } from './board-state.js'
import { boardCloseMenus, boardSettleEdits } from './board-hooks.js'
import { BOARD_BLOCK_PAD, BOARD_CANVAS_EDGE, BOARD_CARD_W, BOARD_COLUMN_GAP, BOARD_CARRY_DROP_DAYS, HISTORY_EXPORT_KIND, SNAPSHOT_KEEP_DEFAULT, SNAPSHOT_MOMENT_KEY, SNAPSHOT_VERSION } from './constants.js'
import { settings } from './preferences.js'
import { attentionOf } from './runs.js'
import { conversationPool, statusOf } from './sessions.js'
import { BOARD_STORE, CARRY, HISTORY, JOURNAL, NOTE_STORE } from './board-stores.js'
import { BOARD_INK, BOARD_UI, solidPaper } from './board-css.js'
import { dayOf, daysBetween } from './time.js'
import { localeIsZh, paletteText } from './strings.js'
import { applyBoardZoom, boardBlockWidth, boardCardBox, boardExtent, boardPanelHeights, boardPanelWidths, goalHue } from './board-canvas.js'
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
      // The colour it was drawn in, recorded here rather than read back
      // later: a seat is today's arrangement, and a page drawn from it
      // would wear whatever colour the goal has grown since.
      hue: goalHue(block),
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
      // Where it stood and how tall it was. Without these the page could
      // still say what was thought but not where, and a canvas drawn from
      // it would be a list wearing paper.
      x: Math.max(0, Math.round(Number(listed[c].x) || 0)),
      y: Math.max(0, Math.round(Number(listed[c].y) || 0)),
      h: Math.max(0, Math.round(Number(listed[c].h) || 0)),
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
    // A hit is a day, and a day is a canvas: the press opens the page and
    // leaves the search behind, because the question has been answered.
    viewDay(date)
    renderHistory()
  })
  return row
}

/**
 * Open the history: a calendar of the pages the board has been.
 *
 * The panel is only the way in. Choosing a day does not expand anything
 * here - it turns the canvas itself onto that page, read-only, which is the
 * whole point of a history being a place rather than a list.
 * @returns {boolean} whether the panel is up.
 */
function openBoardHistory() {
  if (!BOARD.open || !BOARD.panel) return false
  if (BOARD.historyNode) {
    closeBoardHistory()
    return false
  }
  BOARD.historyMonth = monthOf(BOARD.historyDate) || BOARD.historyMonth
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

/**
 * Take the calendar down.
 *
 * The page the canvas is standing on is not the panel's: it stays up after
 * the calendar is put away, and only "back to today" leaves it. A search,
 * on the other hand, belongs to a panel that was open.
 * @returns {void}
 */
function closeBoardHistory() {
  // A search is about a panel that was open: the next visit starts from the
  // calendar, not from a query nobody can see.
  BOARD.historyQuery = ''
  BOARD.historySearch = null
  if (BOARD.historyNode && BOARD.historyNode.parentNode) {
    BOARD.historyNode.parentNode.removeChild(BOARD.historyNode)
  }
  BOARD.historyNode = null
  BOARD.historyList = null
}

/**
 * Draw the calendar.
 *
 * Only the dates are read to draw it: a page's contents cost one record read
 * each, and a calendar that opened by reading ten years of them would be
 * slow in exactly the case it matters. A day is read when it is opened.
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
    list.appendChild(historyCalendar(days || []))
    if (!(days || []).length) list.appendChild(historyNote(paletteText('boardHistoryEmpty')))
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

/** The month a `YYYY-MM-DD` day belongs to, or '' when it is not a day. */
function monthOf(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : ''
}

/** One month, stepped by whole months, as `YYYY-MM`. */
function addMonths(month, delta) {
  var year = Number(month.slice(0, 4))
  var number = Number(month.slice(5, 7)) - 1 + delta
  year = year + Math.floor(number / 12)
  number = ((number % 12) + 12) % 12
  return year + '-' + (number < 9 ? '0' : '') + (number + 1)
}

/** The months in the words the locale names them by. */
var HISTORY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How a month reads: the reader's own words, not a timestamp. */
function historyMonthLabel(month) {
  var year = Number(month.slice(0, 4))
  var number = Number(month.slice(5, 7))
  if (localeIsZh()) return year + '年' + number + '月'
  return HISTORY_MONTHS[number - 1] + ' ' + year
}

/**
 * The month grid: every day the board has a page for, one cell each.
 *
 * The floor is the oldest page and the ceiling is today, so a step never
 * lands on a month that could not have anything in it. Days without a page
 * are still drawn - a calendar with holes in it is not a calendar - but they
 * are not presses either: a day that was never drawn has nothing to show.
 * @param {Array<string>} days - every day with a page, oldest first.
 * @returns {Element} the calendar.
 */
function historyCalendar(days) {
  var wrap = document.createElement('div')
  Object.assign(wrap.style, BOARD_UI.historyCalendar)
  wrap.setAttribute('data-role', 'historyCalendar')
  var has = Object.create(null)
  for (var i = 0; i < days.length; i++) has[days[i]] = true
  var today = dayOf(Date.now())
  var floor = days.length ? monthOf(days[0]) : monthOf(today)
  var ceiling = monthOf(today)
  var month = BOARD.historyMonth || ceiling
  if (month < floor) month = floor
  if (month > ceiling) month = ceiling
  BOARD.historyMonth = month
  wrap.appendChild(historyCalendarHead(month, floor, ceiling))
  var week = document.createElement('div')
  Object.assign(week.style, BOARD_UI.historyCalWeek)
  var names = paletteText('boardHistoryWeek').split(' ')
  for (var w = 0; w < names.length; w++) {
    var each = document.createElement('span')
    Object.assign(each.style, BOARD_UI.historyCalWeekday)
    each.textContent = names[w]
    week.appendChild(each)
  }
  wrap.appendChild(week)
  var grid = document.createElement('div')
  Object.assign(grid.style, BOARD_UI.historyCalGrid)
  grid.setAttribute('data-role', 'historyGrid')
  var year = Number(month.slice(0, 4))
  var number = Number(month.slice(5, 7))
  // Monday first: the week the reader plans a week on, not the one the
  // Date object counts from.
  var lead = (new Date(year, number - 1, 1).getDay() + 6) % 7
  var total = new Date(year, number, 0).getDate()
  for (var blank = 0; blank < lead; blank++) {
    var pad = document.createElement('div')
    Object.assign(pad.style, BOARD_UI.historyCalBlank)
    grid.appendChild(pad)
  }
  for (var day = 1; day <= total; day++) {
    var date = month + '-' + (day < 10 ? '0' : '') + day
    grid.appendChild(historyCalendarCell(date, !!has[date], today, BOARD.historyDate))
  }
  wrap.appendChild(grid)
  return wrap
}

/** The month between the two steps, which are only presses when they lead somewhere. */
function historyCalendarHead(month, floor, ceiling) {
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.historyCalHead)
  head.setAttribute('data-role', 'historyCalHead')
  /** One step, live only when there is a month on that side of this one. */
  function step(label, role, to, hint, live) {
    var each = document.createElement('span')
    Object.assign(each.style, live ? BOARD_UI.historyCalNav : BOARD_UI.historyCalNavOff)
    each.setAttribute('data-role', role)
    if (!live) {
      each.setAttribute('data-off', 'true')
      return each
    }
    each.setAttribute('role', 'button')
    each.setAttribute('title', hint)
    each.textContent = label
    each.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      BOARD.historyMonth = to
      renderHistory()
    })
    return each
  }
  head.appendChild(step('\u2039', 'historyPrevMonth', addMonths(month, -1),
    paletteText('boardHistoryMonthPrev'), month > floor))
  var label = document.createElement('span')
  Object.assign(label.style, BOARD_UI.historyCalMonth)
  label.setAttribute('data-role', 'historyMonth')
  label.textContent = historyMonthLabel(month)
  head.appendChild(label)
  head.appendChild(step('\u203a', 'historyNextMonth', addMonths(month, 1),
    paletteText('boardHistoryMonthNext'), month < ceiling))
  return head
}

/**
 * One day in the calendar.
 *
 * A cell answers exactly one press: a day with a page opens it, and today
 * goes back to today whatever it holds - the cell for today is the way home
 * from inside the calendar, not a page of its own.
 * @param {string} date - the day.
 * @param {boolean} hasPage - whether a page is filed under it.
 * @param {string} today - today, as a day.
 * @param {string} viewing - the day the canvas is standing on, or ''.
 * @returns {Element} the cell.
 */
function historyCalendarCell(date, hasPage, today, viewing) {
  var isToday = date === today
  var opens = hasPage || isToday
  var cell = document.createElement('div')
  Object.assign(cell.style, opens ? BOARD_UI.historyCalCell : BOARD_UI.historyCalCellOff)
  if (viewing === date) Object.assign(cell.style, BOARD_UI.historyCalCellOn)
  else if (isToday) Object.assign(cell.style, BOARD_UI.historyCalCellToday)
  cell.setAttribute('data-role', 'historyDay')
  cell.setAttribute('data-date', date)
  if (hasPage) cell.setAttribute('data-history', 'true')
  if (isToday) cell.setAttribute('data-today', 'true')
  if (viewing === date) cell.setAttribute('data-viewing', 'true')
  var number = document.createElement('span')
  number.textContent = String(Number(date.slice(8, 10)))
  cell.appendChild(number)
  if (hasPage) {
    var dot = document.createElement('span')
    Object.assign(dot.style, BOARD_UI.historyCalDot)
    dot.setAttribute('data-role', 'historyDot')
    cell.appendChild(dot)
  }
  if (!opens) return cell
  cell.setAttribute('role', 'button')
  cell.setAttribute('title', isToday
    ? paletteText('boardHistoryBackTodayHint')
    : date + ' · ' + paletteText('boardHistoryViewing'))
  cell.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (isToday) {
      backToToday()
      return
    }
    viewDay(date)
  })
  return cell
}

/**
 * Stand the canvas on one past day.
 *
 * The paint is chosen by `BOARD.historyDate` alone, so this is the whole of
 * the transition: the readers that would write are not consulted, because
 * the paint that follows does not draw anything they could write to.
 * @param {string} date - the day to show.
 * @returns {boolean} whether the canvas moved onto it.
 */
function viewDay(date) {
  if (!BOARD.open || !monthOf(date)) return false
  // A field the reader is in is finished first: the paint that answers this
  // press must not land under a caret, and what it says belongs to today.
  boardSettleEdits()
  boardCloseMenus()
  BOARD.historyDate = date
  BOARD.historyMonth = monthOf(date)
  BOARD.historyArmed = ''
  paintBoardActions()
  repaint()
  if (BOARD.historyNode) renderHistory()
  return true
}

/**
 * Put the canvas back on today.
 *
 * The way out of a page, and the press the bar and the calendar both offer:
 * a history that could only be left by closing the board would make looking
 * cost the place the reader was standing.
 * @returns {boolean} whether the canvas was on a page.
 */
function backToToday() {
  if (!BOARD.historyDate) return false
  BOARD.historyDate = ''
  BOARD.historyArmed = ''
  removeHistoryBanner()
  paintBoardActions()
  // The page's panels are not today's measurements: clear the stage, so the
  // paint that follows measures nothing that belongs to the day it left.
  if (BOARD.stage) BOARD.stage.textContent = ''
  if (BOARD.open) repaint()
  if (BOARD.historyNode) renderHistory()
  return true
}

/**
 * Show the heading's working chips, or put them away.
 *
 * Every word in that row either writes or rearranges today. A page is read,
 * so the row is taken down while one is up rather than left standing as a
 * row of presses that would edit a day the reader is only looking at.
 * @returns {void}
 */
function paintBoardActions() {
  var chips = BOARD.actionChips || []
  var hide = !!BOARD.historyDate
  for (var i = 0; i < chips.length; i++) {
    if (!chips[i]) continue
    chips[i].style.display = hide ? 'none' : ''
  }
}

/**
 * Draw one past day on the canvas.
 *
 * Everything here comes out of the page: its goals and where they stood, the
 * conversations in the order they were drawn, and the thoughts in the words
 * they were written in. Nothing reads the live board and nothing writes it,
 * which is what makes the page read-only in fact rather than by agreement:
 * the nodes carry no handle, and there is no store behind them to write to.
 * @returns {void}
 */
function paintHistoryPage() {
  var date = BOARD.historyDate
  if (!date || !BOARD.stage) return
  BOARD.stage.textContent = ''
  // The live canvas's bookkeeping is not this paint's: nothing to move,
  // nothing to keep, nothing to tick, and no links to redraw.
  BOARD.nodes = []
  BOARD.looseNodes = Object.create(null)
  BOARD.stacks = []
  BOARD.dropZones = []
  BOARD.lines = []
  BOARD.noteEditor = null
  BOARD.cardEditor = null
  BOARD.clocks = []
  BOARD.rows = []
  BOARD.blocks = []
  BOARD.inbox = []
  BOARD.folders = Object.create(null)
  BOARD.linkLayer = null
  // The finished-cards list belongs to today's heading: a list of what is
  // waiting to be dealt with cannot stand over a day that is over.
  if (BOARD.doneBinPanel && BOARD.doneBinPanel.parentNode) {
    BOARD.doneBinPanel.parentNode.removeChild(BOARD.doneBinPanel)
  }
  BOARD.doneBinPanel = null
  BOARD.doneBinOpen = false
  // The bar comes first, and stands on the page's paper rather than on the
  // stage: the way back is not something that has to wait for a record.
  paintHistoryBanner(date)
  HISTORY.day(date).then(function (record) {
    // The canvas may have moved to another day, or back to today, while the
    // database was answering.
    if (!BOARD.open || BOARD.historyDate !== date || !BOARD.stage) return
    paintHistoryBanner(date)
    BOARD.stage.textContent = ''
    if (!record || !record.view) {
      var broken = historyNote(paletteText('boardHistoryDayBroken'))
      broken.style.position = 'absolute'
      broken.style.left = BOARD_CANVAS_EDGE + 'px'
      broken.style.top = BOARD_CANVAS_EDGE + 'px'
      BOARD.stage.appendChild(broken)
      BOARD.extent = { width: 720, height: 520 }
      applyBoardZoom()
      return
    }
    var view = record.view
    var blocks = historyBlocks(view)
    var places = historyPlaces(blocks)
    var i
    for (i = 0; i < blocks.length; i++) {
      BOARD.stage.appendChild(buildHistoryBlock(blocks[i], places[blocks[i].key]))
    }
    var drawn = historyCardPlaces(Array.isArray(view.cards) ? view.cards : [], blocks)
    var loose = []
    for (i = 0; i < drawn.length; i++) {
      loose.push(drawn[i].card)
      BOARD.stage.appendChild(buildHistoryCard(drawn[i].card, drawn[i]))
    }
    if (!blocks.length && !drawn.length) {
      var empty = document.createElement('div')
      Object.assign(empty.style, BOARD_UI.emptyBoard)
      empty.setAttribute('data-role', 'emptyBoard')
      empty.textContent = paletteText('boardHistoryEmpty')
      BOARD.stage.appendChild(empty)
    }
    var extent = boardExtent(places, boardPanelHeights(), boardPanelWidths(), loose)
    BOARD.extent = extent
    applyBoardZoom()
    if (BOARD.count) BOARD.count.textContent = date + ' · ' + historyMeta(record)
  })
}

/**
 * A page's goals, with their conversations put back under them.
 *
 * The page keeps its sessions in draw order, so the order they are walked in
 * here is the order they stood in: a panel reads across its conversations,
 * and a branch stands beside the one it came from.
 * @param {object} view - the page's frozen view.
 * @returns {Array<object>} the blocks, in the order the page drew them.
 */
function historyBlocks(view) {
  var goals = Array.isArray(view.goals) ? view.goals : []
  var sessions = Array.isArray(view.sessions) ? view.sessions : []
  var byKey = Object.create(null)
  var blocks = []
  for (var g = 0; g < goals.length; g++) {
    var goal = goals[g] || {}
    if (typeof goal.key !== 'string' || !goal.key) continue
    var block = {
      key: goal.key,
      label: goal.label || goal.key,
      intent: goal.intent || '',
      kind: goal.kind || '',
      hue: typeof goal.hue === 'number' ? goal.hue : null,
      x: Math.max(0, Math.round(Number(goal.x) || 0)),
      y: Math.max(0, Math.round(Number(goal.y) || 0)),
      rows: [],
    }
    byKey[goal.key] = block
    blocks.push(block)
  }
  for (var s = 0; s < sessions.length; s++) {
    var row = sessions[s] || {}
    var home = byKey[row.goal]
    if (!home) continue
    home.rows.push(row)
  }
  return blocks
}

/** Where each of a page's panels stood, keyed by block. */
function historyPlaces(blocks) {
  var places = Object.create(null)
  for (var i = 0; i < blocks.length; i++) {
    places[blocks[i].key] = { x: blocks[i].x, y: blocks[i].y }
  }
  return places
}

/**
 * Where each of a page's thoughts stood, or where an older page's thoughts
 * have to be laid out.
 *
 * A page filed before this build kept the words of its cards and not their
 * places; those are set down beside the panels rather than dropped, because
 * a thought is the last thing a history may lose.
 * @param {Array<object>} cards - the page's cards.
 * @param {Array<object>} blocks - the page's panels.
 * @returns {Array<object>} `{card, x, y, height}` per card.
 */
function historyCardPlaces(cards, blocks) {
  var out = []
  var right = 0
  for (var b = 0; b < blocks.length; b++) {
    right = Math.max(right, blocks[b].x + boardBlockWidth(blocks[b]))
  }
  right = right ? right + BOARD_COLUMN_GAP : BOARD_CANVAS_EDGE
  var fall = BOARD_CANVAS_EDGE
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i] || {}
    if (!card.text) continue
    var box = boardCardBox(card.text, card.h)
    var x = Number(card.x)
    var y = Number(card.y)
    var placed = isFinite(x) && isFinite(y) && (x > 0 || y > 0)
    out.push({
      card: card,
      x: placed ? Math.max(0, Math.round(x)) : right,
      y: placed ? Math.max(0, Math.round(y)) : fall,
      height: box.height,
    })
    if (!placed) fall = fall + box.height + BOARD_COLUMN_GAP
  }
  return out
}

/**
 * One panel of a page: the same box as today's, with nothing in it that can
 * be pressed.
 * @param {object} block - the goal as the page read it.
 * @param {object} place - `{x, y}` on the paper.
 * @returns {Element} the panel.
 */
function buildHistoryBlock(block, place) {
  var node = document.createElement('div')
  Object.assign(node.style, BOARD_UI.block)
  node.style.left = place.x + 'px'
  node.style.top = place.y + 'px'
  node.style.width = boardBlockWidth(block) + 'px'
  node.setAttribute('data-role', 'workspaceBlock')
  node.setAttribute('data-block', block.key)
  node.setAttribute('data-history', 'true')
  if (block.hue !== null) {
    node.style.background = solidPaper('hsl(' + block.hue + ' 55% 50% / 0.05)', BOARD_INK.column)
    node.style.borderColor = 'hsl(' + block.hue + ' 42% 45% / 0.22)'
  }
  var head = document.createElement('div')
  Object.assign(head.style, BOARD_UI.blockHead)
  head.style.cursor = 'default'
  head.setAttribute('data-role', 'blockHead')
  var caret = document.createElement('span')
  Object.assign(caret.style, BOARD_UI.blockCaret)
  caret.textContent = '\u25be'
  head.appendChild(caret)
  var dot = document.createElement('span')
  Object.assign(dot.style, BOARD_UI.blockDot)
  dot.setAttribute('data-role', 'blockDot')
  dot.style.background = block.hue === null ? BOARD_INK.dim : 'hsl(' + block.hue + ' 46% 56%)'
  head.appendChild(dot)
  var name = document.createElement('span')
  Object.assign(name.style, BOARD_UI.blockName)
  name.setAttribute('data-role', 'blockName')
  name.textContent = block.label
  head.appendChild(name)
  var count = document.createElement('span')
  Object.assign(count.style, BOARD_UI.blockCount)
  count.setAttribute('data-role', 'blockCount')
  count.textContent = String(block.rows.length)
  head.appendChild(count)
  node.appendChild(head)
  if (block.intent) {
    var intent = document.createElement('div')
    Object.assign(intent.style, BOARD_UI.historyGoalIntent)
    intent.style.padding = '6px 14px 0'
    intent.textContent = block.intent
    node.appendChild(intent)
  }
  var body = document.createElement('div')
  Object.assign(body.style, BOARD_UI.historyBlockBody)
  body.setAttribute('data-role', 'historyBlockBody')
  body.style.width = (boardBlockWidth(block) - BOARD_BLOCK_PAD * 2) + 'px'
  for (var r = 0; r < block.rows.length; r++) {
    body.appendChild(buildHistoryRow(block.rows[r], block.hue))
  }
  node.appendChild(body)
  return node
}

/**
 * One conversation of a page: the name and the word it wore.
 *
 * It is not a way in. The page is a copy, and the conversation it names may
 * have been deleted, archived or renamed since - a press that led there
 * would be offering a door the page cannot promise.
 * @param {object} session - the conversation as the page read it.
 * @param {number|null} hue - the goal's colour that day.
 * @returns {Element} the card.
 */
function buildHistoryRow(session, hue) {
  var card = document.createElement('div')
  Object.assign(card.style, BOARD_UI.card)
  card.style.cursor = 'default'
  if (hue !== null) {
    card.style.background = solidPaper('hsl(' + hue + ' 48% 50% / 0.10)', BOARD_INK.card)
    card.style.borderColor = 'hsl(' + hue + ' 40% 45% / 0.22)'
    card.style.borderLeft = '3px solid hsl(' + hue + ' 55% 46% / 0.72)'
  }
  card.setAttribute('data-role', 'historySession')
  if (session.id) card.setAttribute('data-session-id', session.id)
  var title = document.createElement('div')
  Object.assign(title.style, BOARD_UI.cardTitle)
  title.setAttribute('data-role', 'cardTitle')
  title.textContent = session.title || session.id || ''
  card.appendChild(title)
  if (!session.status && !(session.carriedDays > 0)) return card
  var meta = document.createElement('div')
  Object.assign(meta.style, BOARD_UI.cardMeta)
  meta.setAttribute('data-role', 'historyMeta')
  if (session.status) {
    var chip = document.createElement('span')
    Object.assign(chip.style, BOARD_UI.cardChip)
    Object.assign(chip.style, historyChipStyle(session.statusKey))
    chip.textContent = session.status
    meta.appendChild(chip)
  }
  if (session.carriedDays > 0) {
    var carried = document.createElement('span')
    Object.assign(carried.style, BOARD_UI.cardCarried)
    carried.textContent = paletteText('boardHistoryCarried')
      + session.carriedDays + paletteText('boardHistoryCarriedUnit')
    meta.appendChild(carried)
  }
  card.appendChild(meta)
  return card
}

/** The chip a status word wore: the same three colours the live canvas uses. */
function historyChipStyle(key) {
  if (key === 'pending') return BOARD_UI.cardChipPending
  if (key === 'running') return BOARD_UI.cardChipRunning
  if (key === 'done') return BOARD_UI.cardChipDone
  if (key === 'paused') return BOARD_UI.cardChipPaused
  if (key === 'settled') return BOARD_UI.cardChipSettled
  return BOARD_UI.cardChipFinished
}

/**
 * One thought of a page: the words, on the paper they were written on.
 * @param {object} card - the card as the page kept it.
 * @param {object} place - `{x, y, height}` on the paper.
 * @returns {Element} the note.
 */
function buildHistoryCard(card, place) {
  var node = document.createElement('div')
  Object.assign(node.style, BOARD_UI.loose)
  node.style.left = place.x + 'px'
  node.style.top = place.y + 'px'
  node.style.width = BOARD_CARD_W + 'px'
  node.style.height = place.height + 'px'
  if (card.done) Object.assign(node.style, BOARD_UI.looseDone)
  node.setAttribute('data-role', 'historyCard')
  if (card.id) node.setAttribute('data-card-id', card.id)
  if (card.done) node.setAttribute('data-done', 'true')
  var text = document.createElement('div')
  Object.assign(text.style, BOARD_UI.looseText)
  text.textContent = (card.done ? '\u2713 ' : '') + String(card.text || '')
  node.appendChild(text)
  return node
}

/**
 * The bar a page wears: the day, what it is, and the presses that belong to it.
 *
 * It stands on the board's paper rather than on the scaled stage, so a zoom
 * does not take the way back with it. Restoring is the one write here, and it
 * is armed first - the same two-press grammar the list used, kept because the
 * press that copies a day into today is not one to make by accident.
 * @param {string} date - the day on the canvas.
 * @returns {void}
 */
function paintHistoryBanner(date) {
  removeHistoryBanner()
  if (!BOARD.panel) return
  var bar = document.createElement('div')
  Object.assign(bar.style, BOARD_UI.historyBanner)
  bar.setAttribute('data-role', 'historyBanner')
  // The bar is not the canvas: a press on it must not start a pan.
  bar.addEventListener('pointerdown', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  })
  var when = document.createElement('span')
  when.setAttribute('data-role', 'historyBannerDate')
  when.textContent = date
  bar.appendChild(when)
  var mark = document.createElement('span')
  Object.assign(mark.style, BOARD_UI.historyBannerMark)
  mark.setAttribute('data-role', 'historyReadOnly')
  mark.textContent = paletteText('boardHistoryViewing')
  bar.appendChild(mark)

  var back = document.createElement('span')
  Object.assign(back.style, BOARD_UI.historyTool)
  back.setAttribute('role', 'button')
  back.setAttribute('data-role', 'historyBackToday')
  back.setAttribute('title', paletteText('boardHistoryBackTodayHint'))
  back.textContent = paletteText('boardHistoryBackToday')
  back.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    backToToday()
  })
  bar.appendChild(back)

  var armed = BOARD.historyArmed === date
  var restore = document.createElement('span')
  Object.assign(restore.style, armed ? BOARD_UI.historyRestoreArmed : BOARD_UI.historyTool)
  restore.setAttribute('role', 'button')
  restore.setAttribute('data-role', 'historyRestore')
  if (armed) restore.setAttribute('data-armed', 'true')
  restore.setAttribute('title', paletteText(armed ? 'boardHistoryRestoreArmed' : 'boardHistoryRestore'))
  restore.textContent = paletteText(armed ? 'boardHistoryRestoreArmed' : 'boardHistoryRestore')
  restore.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    if (BOARD.historyArmed !== date) {
      BOARD.historyArmed = date
      paintHistoryBanner(date)
      return
    }
    BOARD.historyArmed = ''
    // The way out is taken first: what follows writes today, and today's
    // paint is the one that should stand behind the word it says.
    backToToday()
    restoreDay(date).then(function (done) {
      if (!done) {
        showToast(paletteText('boardHistoryDayBroken'))
        return
      }
      showToast(paletteText('boardHistoryRestored') + date + paletteText('boardHistoryRestoredTail'))
      if (BOARD.historyNode) renderHistory()
    })
  })
  bar.appendChild(restore)

  HISTORY.backup().then(function (boxed) {
    if (!boxed || !boxed.snapshot || !bar.parentNode) return
    var before = document.createElement('span')
    Object.assign(before.style, BOARD_UI.historyTool)
    before.setAttribute('role', 'button')
    before.setAttribute('data-role', 'historyBefore')
    before.setAttribute('title', paletteText('boardHistoryBeforeHint'))
    before.textContent = paletteText('boardHistoryBefore')
    before.addEventListener('click', function (ev) {
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
      takeBeforeBackup().then(function (done) {
        if (!done) return
        showToast(paletteText('boardHistoryBeforeDone'))
        backToToday()
      })
    })
    bar.appendChild(before)
  })

  BOARD.historyBanner = bar
  BOARD.panel.appendChild(bar)
}

/** Take a page's bar down. */
function removeHistoryBanner() {
  if (BOARD.historyBanner && BOARD.historyBanner.parentNode) {
    BOARD.historyBanner.parentNode.removeChild(BOARD.historyBanner)
  }
  BOARD.historyBanner = null
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



export { closeBoardHistory, closeSeal, dropCarried, maybeShowSeal, noteMoment, openBoardHistory, pageDoc, pageView, restoreDay, settleDay, exportHistory, importHistory, keepBackup, takeBeforeBackup, pruneHistory, settleCarry, filePage, paintHistoryPage, backToToday, viewDay }
