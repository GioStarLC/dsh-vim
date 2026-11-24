/**
 * The board and the overview as sidebar pages: the two React wrappers the
 * host mounts, the glyphs beside them, the installers that contribute them,
 * and the reading of today behind the overview. Also the one stylesheet
 * every window this plugin mounts shares.
 */
import React from 'react'
import { BOARD_MIN_FONT, BOARD_PANEL_ID, NS, OVERVIEW_PANEL_ID } from './constants.js'
import { boardShowBoard } from './board-hooks.js'
import { BOARD_STORE } from './board-stores.js'
import { BOARD_PAGE_UI, BOARD_UI, OVERVIEW_UI, applyBoardPageInk } from './board-css.js'
import { mountBoardInto, unmountBoard } from './board-mount.js'
import { goalOfRow } from './board-canvas.js'
import { BOARD, boardTitleOf } from './board-state.js'
import { dayOf, startOfToday } from './time.js'
import { conversationPool, folderIndex } from './sessions.js'
import { settings } from './preferences.js'
import { paletteText } from './strings.js'

/** Whether this process has contributed the board page and its sidebar entry. */
var boardPageInstalled = false

/**
 * The board as the main panel's page.
 *
 * The host owns the panel and renders this component into it; the board
 * itself is still the imperative builder, mounted into the element the
 * component owns. That element is this plugin's own, so nothing is written
 * outside it, and the mount is undone with the component.
 * @returns {object} the page's root element.
 */
function BoardPage() {
  var hostRef = typeof React.useRef === 'function' ? React.useRef(null) : { current: null }
  React.useEffect(function () {
    var node = hostRef.current
    if (!node) return undefined
    node.setAttribute('data-role', 'boardPage')
    node.className = 'dshv-window'
    mountBoardInto(node, 'page')
    return function () {
      // The page went away with the panel: drop the feeds and the state.
      // The element belongs to the host's tree and is left alone.
      if (BOARD.mode === 'page') unmountBoard()
    }
  }, [])
  return React.createElement('div', {
    ref: hostRef,
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minWidth: '0',
      minHeight: '0',
    },
  })
}

/**
 * The sidebar entry's glyph: three columns, which is what the board is.
 *
 * Drawn here rather than taken from the host's icon set: a plugin does not
 * load the host's Client packages as modules, and a small stroke drawing
 * follows the row's text colour by itself.
 * @param {object} props - the sidebar's icon share.
 * @returns {object} the icon element.
 */
function BoardPanelIcon(props) {
  var size = (props && props.size) || 16
  var bars = [
    { x: 2, y: 2.5, width: 3.2, height: 11 },
    { x: 6.6, y: 2.5, width: 3.2, height: 7 },
    { x: 11.2, y: 2.5, width: 3.2, height: 9 },
  ]
  var children = []
  for (var i = 0; i < bars.length; i++) {
    children.push(
      React.createElement('rect', {
        key: 'bar' + i,
        x: bars[i].x,
        y: bars[i].y,
        width: bars[i].width,
        height: bars[i].height,
        rx: 1,
      })
    )
  }
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    children
  )
}

/**
 * Contribute the board as a sidebar entry and a main panel.
 *
 * The entry and the panel share one id: the sidebar selects the panel by
 * it, and the layout service refuses an id no panel is registered under.
 * A host without either seat keeps the floating board instead.
 * @param {object} ctx - client root context.
 * @returns {void}
 */
function installBoardPage(ctx) {
  // Once per process, not once per `apply`: the sidebar renders every entry
  // in its list, so a second contribution would put two "board" rows in it.
  if (boardPageInstalled) return
  var slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null)
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
  boardPageInstalled = true

  try {
    slots.inject('main', function () {
      return slots.register(
        {
          name: 'main',
          key: BOARD_PANEL_ID,
          locale: NS,
        },
        BoardPage
      )
    })
  } catch (error) {
    console.warn('[dsh-vim] board page registration failed', error)
  }

  try {
    slots.inject('sidebar.panellist', function () {
      return slots.register(
        {
          name: 'sidebar.panellist',
          id: BOARD_PANEL_ID,
          order: 20,
          locale: NS,
          label: function () {
            return paletteText('board')
          },
        },
        BoardPanelIcon
      )
    })
  } catch (error) {
    console.warn('[dsh-vim] board sidebar entry failed', error)
  }
}

/** Set once this process has contributed the overview page and its entry. */
var overviewPageInstalled = false

/**
 * What today did, as the overview reads it.
 *
 * Two sources, each answering the one question it can answer honestly: the
 * session feed says which conversations were touched today, and the board's
 * own document says what each thought is, when it was written and when it
 * was dealt with. The day's pages are deliberately not a source - a page is
 * a photograph of an afternoon, and counting its cards would report the
 * same thought once per snapshot.
 *
 * "Touched today" is read the way the board reads it, not the way its
 * carried strip does: a conversation brought in from yesterday and left
 * alone was not part of today, and a page that counted it would flatter the
 * day.
 * @param {number} [nowMs] - the moment to read as; a check passes one so it
 *   need not wait for midnight.
 * @returns {object} the day's counts, and one row per conversation.
 */
function overviewToday(nowMs) {
  var now = Number(nowMs) || Date.now()
  var today = dayOf(now)
  var since = startOfToday()
  var folders = folderIndex()
  var pool = conversationPool()
  var cards = BOARD_STORE.cards()
  // What each conversation's thoughts amount to: how many it holds, how
  // many still want doing, and what happened to them today.
  var per = Object.create(null)
  var written = 0
  var done = 0
  var looseWritten = 0
  var looseDone = 0
  for (var c = 0; c < cards.length; c++) {
    var card = cards[c]
    var wroteToday = Number(card.w) > 0 && dayOf(card.w) === today
    var doneToday = Number(card.d) > 0 && dayOf(card.d) === today
    if (wroteToday) written = written + 1
    if (doneToday) done = done + 1
    // A card still lying on the paper belongs to no conversation, so it is
    // counted apart rather than left out of a total that says it is the
    // day's.
    if (!card.link) {
      if (wroteToday) looseWritten = looseWritten + 1
      if (doneToday) looseDone = looseDone + 1
      continue
    }
    var bucket = per[card.link] || (per[card.link] = { held: 0, open: 0, done: 0, written: 0 })
    bucket.held = bucket.held + 1
    if (card.done !== true) bucket.open = bucket.open + 1
    if (doneToday) bucket.done = bucket.done + 1
    if (wroteToday) bucket.written = bucket.written + 1
  }
  var rows = []
  var goals = Object.create(null)
  var listed = Object.create(null)
  for (var i = 0; i < pool.length; i++) {
    var row = pool[i]
    var mine = per[row.id]
    // A conversation counts for today when it moved today, or when a
    // thought on it did: a thought can be written under a conversation that
    // has not been opened since yesterday, and the day touched both.
    if (!mine && (Number(row.updatedAt) || 0) < since) continue
    listed[row.id] = true
    var goal = goalOfRow(row, folders)
    goals[goal.key] = true
    rows.push({
      id: row.id,
      title: boardTitleOf(row),
      goal: BOARD_STORE.blockLabel(goal.key) || goal.label,
      done: mine ? mine.done : 0,
      written: mine ? mine.written : 0,
      held: mine ? mine.held : 0,
      open: mine ? mine.open : 0,
    })
  }
  // A thought can outlive the conversation it was tied to: an archived one
  // leaves the feed and the card stays. It keeps a row of its own rather
  // than quietly leaving the day's total short of what was written.
  for (var link in per) {
    if (!Object.prototype.hasOwnProperty.call(per, link) || listed[link]) continue
    rows.push({
      id: link,
      title: '',
      goal: '',
      done: per[link].done,
      written: per[link].written,
      held: per[link].held,
      open: per[link].open,
    })
  }
  // Read by goal first, because the question is what each goal got done;
  // then the busiest conversation of that goal.
  rows.sort(function (left, right) {
    if (left.goal !== right.goal) return left.goal < right.goal ? -1 : 1
    if (left.done !== right.done) return right.done - left.done
    if (left.held !== right.held) return right.held - left.held
    return left.title < right.title ? -1 : left.title > right.title ? 1 : 0
  })
  return {
    date: today,
    goals: Object.keys(goals).length,
    sessions: rows.length,
    written: written,
    done: done,
    looseWritten: looseWritten,
    looseDone: looseDone,
    rows: rows,
  }
}

/** One figure: the number, and what it counts, read as one block. */
function overviewFigure(value, label) {
  var figure = document.createElement('div')
  Object.assign(figure.style, OVERVIEW_UI.figure)
  figure.setAttribute('data-role', 'overviewFigure')
  var number = document.createElement('div')
  Object.assign(number.style, OVERVIEW_UI.figureValue)
  number.setAttribute('data-role', 'overviewFigureValue')
  number.textContent = String(value)
  var word = document.createElement('div')
  Object.assign(word.style, OVERVIEW_UI.figureLabel)
  word.setAttribute('data-role', 'overviewFigureLabel')
  word.textContent = label
  figure.appendChild(number)
  figure.appendChild(word)
  return figure
}

/** One number in the table: how it reads depends on what it counts. */
function overviewNumber(value, style) {
  var cell = document.createElement('div')
  Object.assign(cell.style, style)
  cell.setAttribute('data-role', 'overviewNum')
  cell.textContent = String(value)
  return cell
}

/** One heading of the table, in the same columns as its rows. */
function overviewHeading(text, style) {
  var cell = document.createElement('div')
  Object.assign(cell.style, style)
  cell.setAttribute('data-role', 'overviewHeadCell')
  cell.textContent = text
  return cell
}

/**
 * Build the overview into an element the host owns.
 *
 * Read afresh on every mount rather than kept in place: the page is a
 * reading of today, and a reading that stood still while the day moved
 * would be a page that lies. The host mounts it when its panel is selected,
 * so every visit is a new reading.
 * @param {Element} root - the element the host gave this page.
 * @returns {boolean} whether the page was built.
 */
function mountOverviewInto(root) {
  if (!root || typeof root.appendChild !== 'function' || typeof root.style !== 'object') return false
  var data = overviewToday()
  applyBoardPageInk(root)
  Object.assign(root.style, BOARD_PAGE_UI.surface)
  root.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
  root.setAttribute('data-role', 'overviewPage')

  var header = document.createElement('div')
  Object.assign(header.style, BOARD_PAGE_UI.header)
  header.setAttribute('data-role', 'overviewHeader')
  var title = document.createElement('span')
  Object.assign(title.style, BOARD_UI.titleText)
  title.setAttribute('data-role', 'overviewTitle')
  title.textContent = paletteText('overview')
  var when = document.createElement('span')
  Object.assign(when.style, BOARD_UI.subtitle)
  when.setAttribute('data-role', 'overviewDate')
  when.textContent = data.date + ' · ' + paletteText('overviewToday')
  var back = document.createElement('span')
  Object.assign(back.style, BOARD_UI.action)
  back.style.marginLeft = 'auto'
  back.setAttribute('role', 'button')
  back.setAttribute('data-role', 'overviewBack')
  back.setAttribute('title', paletteText('hintBoard'))
  back.textContent = paletteText('overviewBack')
  back.addEventListener('click', function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
    boardShowBoard()
  })
  header.appendChild(title)
  header.appendChild(when)
  header.appendChild(back)

  var body = document.createElement('div')
  Object.assign(body.style, OVERVIEW_UI.body)
  body.setAttribute('data-role', 'overviewBody')

  var figures = document.createElement('div')
  Object.assign(figures.style, OVERVIEW_UI.figures)
  figures.setAttribute('data-role', 'overviewFigures')
  figures.appendChild(overviewFigure(data.goals, paletteText('overviewGoalsUnit')))
  figures.appendChild(overviewFigure(data.sessions, paletteText('overviewSessionsUnit')))
  figures.appendChild(overviewFigure(data.done, paletteText('overviewDoneUnit')))
  figures.appendChild(overviewFigure(data.written, paletteText('overviewWrittenUnit')))
  body.appendChild(figures)

  if (data.looseWritten || data.looseDone) {
    var loose = document.createElement('div')
    Object.assign(loose.style, OVERVIEW_UI.loose)
    loose.setAttribute('data-role', 'overviewLoose')
    loose.textContent = paletteText('overviewLoose') + ' · '
      + paletteText('overviewWrittenUnit') + ' ' + data.looseWritten + ' · '
      + paletteText('overviewDoneUnit') + ' ' + data.looseDone
    body.appendChild(loose)
  }

  var rule = document.createElement('div')
  Object.assign(rule.style, OVERVIEW_UI.rule)
  body.appendChild(rule)

  if (!data.rows.length) {
    var empty = document.createElement('div')
    Object.assign(empty.style, OVERVIEW_UI.empty)
    empty.setAttribute('data-role', 'overviewEmpty')
    empty.textContent = paletteText('overviewEmpty')
    body.appendChild(empty)
  } else {
    var table = document.createElement('div')
    Object.assign(table.style, OVERVIEW_UI.table)
    table.setAttribute('data-role', 'overviewTable')
    var head = document.createElement('div')
    Object.assign(head.style, OVERVIEW_UI.headRow)
    head.setAttribute('data-role', 'overviewHead')
    head.appendChild(overviewHeading(paletteText('overviewSession'), OVERVIEW_UI.headCell))
    head.appendChild(overviewHeading(paletteText('overviewGoal'), OVERVIEW_UI.headCell))
    head.appendChild(overviewHeading(paletteText('overviewDoneUnit'), OVERVIEW_UI.headCellNum))
    head.appendChild(overviewHeading(paletteText('overviewUnder'), OVERVIEW_UI.headCellNum))
    head.appendChild(overviewHeading(paletteText('overviewOpen'), OVERVIEW_UI.headCellNum))
    table.appendChild(head)
    for (var r = 0; r < data.rows.length; r++) {
      var item = data.rows[r]
      var line = document.createElement('div')
      Object.assign(line.style, OVERVIEW_UI.row)
      line.setAttribute('data-role', 'overviewRow')
      line.setAttribute('data-session-id', item.id)
      var name = document.createElement('div')
      Object.assign(name.style, OVERVIEW_UI.name)
      name.setAttribute('data-role', 'overviewName')
      name.setAttribute('title', item.title || item.id)
      if (item.title) {
        name.textContent = item.title
      } else {
        // The card's conversation is gone: the row still says what it meant,
        // in the quiet type a missing name deserves.
        Object.assign(name.style, OVERVIEW_UI.goal)
        name.setAttribute('data-role', 'overviewGone')
        name.textContent = paletteText('overviewGone')
      }
      var goal = document.createElement('div')
      Object.assign(goal.style, OVERVIEW_UI.goal)
      goal.setAttribute('data-role', 'overviewGoal')
      goal.textContent = item.goal
      line.appendChild(name)
      line.appendChild(goal)
      line.appendChild(overviewNumber(item.done, OVERVIEW_UI.num))
      line.appendChild(overviewNumber(item.held, OVERVIEW_UI.numQuiet))
      line.appendChild(overviewNumber(item.open, OVERVIEW_UI.numQuiet))
      table.appendChild(line)
    }
    body.appendChild(table)
  }

  var footer = document.createElement('div')
  Object.assign(footer.style, BOARD_PAGE_UI.footer)
  footer.setAttribute('data-role', 'overviewHint')
  footer.textContent = paletteText('overviewHint')

  root.appendChild(header)
  root.appendChild(body)
  root.appendChild(footer)
  return true
}

/**
 * The overview as the main panel's page.
 *
 * The host owns the panel and renders this component into it; the page
 * itself is the same imperative builder the board uses, mounted into the
 * element the component owns. Nothing is written outside that element.
 * @returns {object} the page's root element.
 */
function OverviewPage() {
  var hostRef = typeof React.useRef === 'function' ? React.useRef(null) : { current: null }
  React.useEffect(function () {
    var node = hostRef.current
    if (!node) return undefined
    node.className = 'dshv-window'
    mountOverviewInto(node)
    return function () {
      // The reading leaves with the visit, so the next one is a new reading.
      // The element belongs to the host's tree and is left alone.
      if (node && typeof node.removeChild === 'function') {
        while (node.firstChild) node.removeChild(node.firstChild)
      }
    }
  }, [])
  return React.createElement('div', {
    ref: hostRef,
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minWidth: '0',
      minHeight: '0',
    },
  })
}

/**
 * The sidebar entry's glyph: three bars of a day, rising to the right.
 *
 * Drawn rather than taken from the host's icon set, for the same reason the
 * board's glyph is: a plugin does not load the host's Client packages, and a
 * small stroke drawing follows the row's text colour by itself.
 * @param {object} props - the sidebar's icon share.
 * @returns {object} the icon element.
 */
function OverviewPanelIcon(props) {
  var size = (props && props.size) || 16
  var bars = [
    { x: 2.6, y: 9.6, width: 2.6, height: 4 },
    { x: 6.7, y: 6.4, width: 2.6, height: 7.2 },
    { x: 10.8, y: 3.2, width: 2.6, height: 10.4 },
  ]
  var children = []
  for (var i = 0; i < bars.length; i++) {
    children.push(
      React.createElement('rect', {
        key: 'bar' + i,
        x: bars[i].x,
        y: bars[i].y,
        width: bars[i].width,
        height: bars[i].height,
        rx: 1,
      })
    )
  }
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    children
  )
}

/**
 * Contribute the overview as a page of its own, beside the board.
 *
 * The board's own entry stays the way to the canvas; this one is the way to
 * the day's numbers, and the board's heading carries a button that takes the
 * same step. Both registrations share one id, as the board's do, because the
 * layout service resolves the entry and the page from the same string.
 * @param {object} ctx - client root context.
 * @returns {void}
 */
function installOverviewPage(ctx) {
  if (overviewPageInstalled) return
  var slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null)
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
  overviewPageInstalled = true

  try {
    slots.inject('main', function () {
      return slots.register(
        {
          name: 'main',
          key: OVERVIEW_PANEL_ID,
          locale: NS,
        },
        OverviewPage
      )
    })
  } catch (error) {
    console.warn('[dsh-vim] overview page registration failed', error)
  }

  try {
    slots.inject('sidebar.panellist', function () {
      return slots.register(
        {
          name: 'sidebar.panellist',
          id: OVERVIEW_PANEL_ID,
          order: 21,
          locale: NS,
          label: function () {
            return paletteText('overview')
          },
        },
        OverviewPanelIcon
      )
    })
  } catch (error) {
    console.warn('[dsh-vim] overview sidebar entry failed', error)
  }
}

/** Set once the windows' shared rules have been put on the page. */
var windowCssInstalled = false

/**
 * The rules every window this plugin mounts shares, once.
 *
 * Inline styles cannot reach two things a window's feel depends on: the
 * bars the platform draws on its scrollers, and the shade it gives the
 * words. The bars are the loud one - the Mac draws its scroller in the
 * platform's own grey, wide and bright, so every dark window here had a
 * foreign trough carved down its side. Thin bars in a neutral grey that
 * reads on both the dark sheets and the amber paper, and words smoothed
 * the way the platform below the window smooths its own. Every window
 * carries the `dshv-window` class, which is the handle for all of it.
 * @returns {void}
 */
function installWindowCSS() {
  if (windowCssInstalled) return
  var head = document.head
  if (!head || typeof head.appendChild !== 'function' || typeof document.createElement !== 'function') return
  if (typeof document.getElementById === 'function' && document.getElementById('dsh-vim-window-css')) {
    windowCssInstalled = true
    return
  }
  var style = document.createElement('style')
  style.setAttribute('id', 'dsh-vim-window-css')
  style.textContent = [
    // The platform shades its own words; a window mounted over it asks
    // for the same shade, and everything inside inherits it.
    '.dshv-window{-webkit-font-smoothing:antialiased;}',
    // The scrollers' bars, in the window's own material: no trough, a
    // thin rounded thumb that sits quietly on the dark sheets and stays
    // legible on the amber paper, and no corner where two bars would
    // meet on the panned canvas.
    '.dshv-window ::-webkit-scrollbar{width:8px;height:8px;}',
    '.dshv-window ::-webkit-scrollbar-track{background:transparent;}',
    '.dshv-window ::-webkit-scrollbar-thumb{background:rgba(140,140,150,0.42);border:2px solid transparent;border-radius:999px;background-clip:padding-box;}',
    '.dshv-window ::-webkit-scrollbar-thumb:hover{background:rgba(140,140,150,0.65);background-clip:padding-box;}',
    '.dshv-window ::-webkit-scrollbar-corner{background:transparent;}',
  ].join('\n')
  try {
    head.appendChild(style)
    windowCssInstalled = true
  } catch (error) {
    console.warn('[dsh-vim] window styles failed', error)
  }
}


export { installBoardPage, installOverviewPage, installWindowCSS, mountOverviewInto, overviewToday }
