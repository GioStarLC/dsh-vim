/**
 * The board's three documents and the day's paper: the arrangement, its undo
 * stack, the notes tied to conversations, the pages filed for finished days,
 * the carried conversations, and the journal of what happened. Each store
 * owns its own keys and its own write path; nothing here paints.
 */
import { BOARD_EDITOR_MAX_ROWS, BOARD_GOAL_INTENT_MAX, BOARD_GOAL_NAME_MAX, BOARD_INBOX, BOARD_KEY, BOARD_SLOTS, BOARD_STORE_RETRY_MS, BOARD_STORE_VERSION, BOARD_ZOOM_MAX, HANDOFF_KEY, BOARD_ZOOM_MIN, CARRY_KEY, HISTORY_BACKUP_KEY, HISTORY_DB_NAME, HISTORY_DB_VERSION, HISTORY_STORE_DAYS, HISTORY_STORE_META, JOURNAL_DB_NAME, JOURNAL_DB_VERSION, JOURNAL_STORE_EVENTS, NOTE_KEY, SNAPSHOT_VERSION, VERDICT_KEYS } from './constants.js'
import { paletteText } from './strings.js'
import { showToast } from './toast.js'
import { dayOf, daysBetween } from './time.js'

/**
 * The board's stored arrangement, and the only thing that touches it.
 *
 * A canvas is a place, not a filing cabinet. What is stored is where things
 * sit and what the reader did to them: a workspace panel's position (and
 * whether it is folded away), the loose cards written on the canvas, the
 * conversations marked ★ or deleted from the board, and the fork lines this
 * plugin watched happen. The panels themselves, and the conversations
 * inside them, are read off the feed on every repaint — which workspace a
 * conversation belongs to is a fact about the conversation, not about the
 * board.
 *
 * Version 1 was the column board. Reading one keeps the two marks that still
 * mean something — ★ and a deleted conversation — and drops the columns: a
 * workspace is what a column used to be now, and the reader no longer has to
 * arrange it.
 *
 * Cleaned on the way in: a hand-edited store can only ever produce something
 * this build knows how to draw.
 * @returns {object} the store.
 */
/**
 * Whether the reader has already been told the board could not be stored.
 *
 * A full store fails on every press and every keystroke, so the word is said
 * once per page: a window that says it every time is a window nobody can use.
 */
var STORE_FULL_TOLD = false

/**
 * Say that the board could not be written, once.
 *
 * Doing nothing was the worst possible answer here: the board keeps drawing
 * what was typed, so nothing looks wrong until the page is reloaded and the
 * last few presses are gone.
 * @param {Error} error - what the store threw.
 * @returns {void}
 */
function reportStoreFull(error) {
  console.warn('[dsh-vim] the board could not be stored', error)
  if (STORE_FULL_TOLD) return
  STORE_FULL_TOLD = true
  showToast(paletteText('boardSaveFailed'))
}

function makeBoardStore() {
  /** The last serialized form written, so an unchanged one is not rewritten. */
  var written = ''

  /**
   * The raw string last parsed, and the document it became.
   *
   * Keyed on the bytes rather than on time: the same bytes answer with the
   * same document, and a write from anywhere - another tab, another window of
   * this one, a hand-edited store - makes them differ, which is exactly when
   * the memo has to be thrown away.
   */
  var memo = { raw: null, doc: null }

  /** A document that could not be written, held until a write succeeds. */
  var pending = null

  /** When `flush` last offered `pending` to the store, so retries stay cheap. */
  var triedAt = 0

  /** A board with nothing on it: no places, no cards, no marks. */
  function seed() {
    return {
      v: BOARD_STORE_VERSION,
      seq: 1,
      blocks: {},
      cards: [],
      muted: {},
      starred: {},
      lineage: {},
      blockLabels: {},
      intents: {},
      placed: {},
      /**
       * The conversations the reader put in a goal's finished strip,
       * keyed by session id, with the moment they did it. It is the
       * reader's word and nothing else: a turn that finishes is never
       * moved down here by itself, and a new day starts with an empty
       * strip because only today's marks are read.
       */
      done: {},
      /**
       * The conversations the reader dragged back out of the quiet strip
       * today, with the moment they did it. Quiet is a fact about the
       * clock; this is the reader saying the clock is not the whole
       * story, and it lasts for the day the drag was made.
       */
      woke: {},
      // The order the reader knows each goal by: a conversation keeps the
      // place it was first drawn in until the reader moves it, however much
      // it is used afterwards.
      order: {},
      // The colour each place wears. A hue is the one thing on the board
      // that must not move: it says "this is the same goal as yesterday",
      // and a colour that follows the draw order is a colour that changes
      // the moment a neighbour leaves.
      seats: {},
      // What each conversation is, as far as this board knows: a finished
      // turn it watched end, or a word the reader gave it. Keyed by the
      // turn (`at`), so a conversation that moves again loses the word it
      // was given - a verdict about an older turn is about older work.
      verdict: {},
      /** Titles the reader nailed down: a hand-over must not rename them. */
      locks: {},
      zoom: 1,
    }
  }

  /** A finite number, or null when the stored value is not one. */
  function finite(value) {
    var number = Number(value)
    return isFinite(number) ? number : null
  }

  /** A positive epoch stamp, or 0 when the stored value is not one. */
  function positiveStamp(value) {
    var stamp = finite(value)
    return stamp !== null && stamp > 0 ? Math.round(stamp) : 0
  }

  /** The first line of what a card says, as the journal remembers it. */
  function firstLine(text) {
    var line = String(text === undefined || text === null ? '' : text)
      .split('\n')[0].replace(/\s+/g, ' ').trim()
    return line.slice(0, 60)
  }

  /**
   * Whether one block id is a goal this board made itself.
   *
   * A workspace's id comes from the workspace registry, and a workspace
   * that is out of sight for one paint - no conversations today, or a
   * registry that has not answered yet - must keep its place on the paper.
   * Only the ids this store mints are places the store may forget.
   * @param {string} key - the block id.
   * @returns {boolean} whether the board invented it.
   */
  function madeGoal(key) {
    return typeof key === 'string' && /^g:\d+$/.test(key)
  }

  /** The two marks and the fork lines, shared by both document versions. */
  function cleanMarks(raw, doc) {
    var muted = raw.muted
    if (muted && typeof muted === 'object') {
      for (var id in muted) {
        if (!Object.prototype.hasOwnProperty.call(muted, id)) continue
        var stamp = finite(muted[id])
        if (stamp === null) continue
        doc.muted[id] = stamp
      }
    }
    var starred = raw.starred
    if (starred && typeof starred === 'object') {
      for (var mark in starred) {
        if (!Object.prototype.hasOwnProperty.call(starred, mark)) continue
        if (starred[mark] !== true) continue
        doc.starred[mark] = true
      }
    }
    var lineage = raw.lineage
    if (lineage && typeof lineage === 'object') {
      for (var child in lineage) {
        if (!Object.prototype.hasOwnProperty.call(lineage, child)) continue
        var parent = lineage[child]
        if (typeof parent !== 'string' || !parent || parent === child) continue
        doc.lineage[child] = parent
      }
    }
    return doc
  }

  /** Whatever was stored, reduced to a document this build can draw. */
  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null
    var version = Number(raw.v)
    // Version 1 held columns and no places: there is nothing to carry over
    // but the marks, and a column board's cards were filed by hand — a
    // fact the workspace panels make for themselves now.
    if (version !== 1 && version !== BOARD_STORE_VERSION) return null
    var doc = seed()
    if (version === BOARD_STORE_VERSION) {
      var blocks = raw.blocks
      if (blocks && typeof blocks === 'object') {
        for (var key in blocks) {
          if (!Object.prototype.hasOwnProperty.call(blocks, key)) continue
          var entry = blocks[key]
          if (!entry || typeof entry !== 'object') continue
          var x = finite(entry.x)
          var y = finite(entry.y)
          if (x === null || y === null) continue
          doc.blocks[key] = {
            x: Math.max(0, Math.round(x)),
            y: Math.max(0, Math.round(y)),
            folded: entry.folded === true,
            // The thoughts under this goal's conversations, hidden while
            // the reader is looking at the work rather than the notes.
            ideas: entry.ideas !== false,
          }
        }
      }
      if (Array.isArray(raw.cards)) {
        var seen = Object.create(null)
        for (var i = 0; i < raw.cards.length; i++) {
          var card = raw.cards[i]
          if (!card || typeof card !== 'object') continue
          if (typeof card.id !== 'string' || !card.id || seen[card.id]) continue
          var cardX = finite(card.x)
          var cardY = finite(card.y)
          if (cardX === null || cardY === null) continue
          seen[card.id] = true
          doc.cards.push({
            id: card.id,
            x: Math.max(0, Math.round(cardX)),
            y: Math.max(0, Math.round(cardY)),
            text: typeof card.text === 'string' ? card.text : '',
            // A card can be tied to the conversation it was handed to. The
            // line is not part of the text, so it survives editing it.
            link: typeof card.link === 'string' ? card.link : '',
            done: card.done === true,
            // Where the note lives when it is not lying on the paper: '' is
            // the paper itself, '@inbox' is the tray. Its place is kept, so a
            // note lifted back out returns to where it was.
            filed: typeof card.filed === 'string' ? card.filed : '',
            // A locked thought keeps its place: a tidy leaves it alone.
            locked: card.locked === true,
            // The rows the reader dragged it to, or 0 for one line. Clamped
            // on the way in: a hand-edited document cannot ask for a card
            // taller than the canvas knows how to draw.
            h: Math.max(0, Math.min(BOARD_EDITOR_MAX_ROWS,
              Math.round(finite(card.h) === null ? 0 : finite(card.h)))),
            // When the reader wrote it, and when it was dealt with. A card
            // stored before these existed has neither, and 0 is the honest
            // answer: the day it was written is not known, so no summary
            // counts it anywhere.
            w: positiveStamp(card.w),
            d: positiveStamp(card.d),
          })
        }
      }
      // The names the reader gave these goals. A goal with no name of its
      // own wears its workspace's, so an empty entry is a name taken back.
      var labels = raw.blockLabels
      if (labels && typeof labels === 'object') {
        for (var labelKey in labels) {
          if (!Object.prototype.hasOwnProperty.call(labels, labelKey)) continue
          var labelText = labels[labelKey]
          if (typeof labelText !== 'string') continue
          var trimmed = labelText.replace(/\s+/g, ' ').trim()
          if (!trimmed) continue
          doc.blockLabels[labelKey] = trimmed.slice(0, BOARD_GOAL_NAME_MAX)
        }
      }
      // What each goal is for. This is the one line that keeps a place on
      // the canvas after its last conversation has left, so it is stored
      // beside the name rather than folded into it.
      var intents = raw.intents
      if (intents && typeof intents === 'object') {
        for (var statedKey in intents) {
          if (!Object.prototype.hasOwnProperty.call(intents, statedKey)) continue
          var statedText = intents[statedKey]
          if (typeof statedText !== 'string') continue
          var statedLine = statedText.replace(/\s+/g, ' ').trim()
          if (!statedLine) continue
          doc.intents[statedKey] = statedLine.slice(0, BOARD_GOAL_INTENT_MAX)
        }
      }
      // Where the reader said each conversation belongs, when that is not
      // where its workspace files it. The goal is the whole record: a card
      // with one is drawn in that goal and in no other.
      // The place each conversation was first drawn in. A stored order is the
      // reader's memory of the panel, so it is kept as written and only ever
      // appended to.
      var order = raw.order
      if (order && typeof order === 'object') {
        for (var orderKey in order) {
          if (!Object.prototype.hasOwnProperty.call(order, orderKey)) continue
          var seenHere = Object.create(null)
          var list = []
          var ids = order[orderKey]
          if (!Array.isArray(ids)) continue
          for (var oi = 0; oi < ids.length && list.length < 500; oi++) {
            var eachId = ids[oi]
            if (typeof eachId !== 'string' || !eachId || seenHere[eachId]) continue
            seenHere[eachId] = true
            list.push(eachId)
          }
          if (list.length) doc.order[orderKey] = list
        }
      }
      // The colour seat each place was given. Stored, because a colour is
      // how the reader knows a goal is the same goal; a document written
      // before this existed simply has none, and the next paint writes one.
      var seats = raw.seats
      if (seats && typeof seats === 'object') {
        for (var seatKey in seats) {
          if (!Object.prototype.hasOwnProperty.call(seats, seatKey)) continue
          var seatNumber = finite(seats[seatKey])
          if (seatNumber === null) continue
          var wrapped = ((Math.round(seatNumber) % BOARD_SLOTS) + BOARD_SLOTS) % BOARD_SLOTS
          doc.seats[seatKey] = wrapped
        }
      }
      var verdicts = raw.verdict
      if (verdicts && typeof verdicts === 'object') {
        for (var saidId in verdicts) {
          if (!Object.prototype.hasOwnProperty.call(verdicts, saidId)) continue
          var said = verdicts[saidId]
          if (!said || typeof said !== 'object') continue
          if (typeof said.key !== 'string' || !VERDICT_KEYS[said.key]) continue
          var saidAt = positiveStamp(said.at)
          if (!saidAt) continue
          doc.verdict[saidId] = { key: said.key, at: saidAt }
        }
      }
      var locks = raw.locks
      if (locks && typeof locks === 'object') {
        for (var lockedId in locks) {
          if (!Object.prototype.hasOwnProperty.call(locks, lockedId)) continue
          if (locks[lockedId] !== true) continue
          doc.locks[lockedId] = true
        }
      }
      var placed = raw.placed
      if (placed && typeof placed === 'object') {
        for (var movedId in placed) {
          if (!Object.prototype.hasOwnProperty.call(placed, movedId)) continue
          var goalKey = placed[movedId]
          if (typeof goalKey !== 'string' || !goalKey) continue
          doc.placed[movedId] = goalKey
        }
      }
      // When the reader finished each conversation, for the strip at the
      // foot of its goal. An older day is kept as written and simply not
      // read: the mark is about today, and the next finish prunes the rest.
      var done = raw.done
      if (done && typeof done === 'object') {
        for (var doneId in done) {
          if (!Object.prototype.hasOwnProperty.call(done, doneId)) continue
          var doneAt = positiveStamp(done[doneId])
          if (!doneAt) continue
          doc.done[doneId] = doneAt
        }
      }
      // The quiet lines the reader pulled back into the work today. Like
      // the finished strip, this is a day's word; older entries are kept
      // as written and simply not read.
      var woke = raw.woke
      if (woke && typeof woke === 'object') {
        for (var wokeId in woke) {
          if (!Object.prototype.hasOwnProperty.call(woke, wokeId)) continue
          var wokeAt = positiveStamp(woke[wokeId])
          if (!wokeAt) continue
          doc.woke[wokeId] = wokeAt
        }
      }
      doc.seq = Math.max(1, Math.floor(finite(raw.seq) || 1))
      // Zoom is part of the arrangement: a reader who works at 80% should
      // not have to set it again on every visit. Clamped, because a stored
      // value from a hand-edited document must not leave the canvas lost.
      var zoom = finite(raw.zoom)
      doc.zoom = zoom === null ? 1 : Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, zoom))
    }
    return cleanMarks(raw, doc)
  }

  /**
   * The document: what is stored, else an empty canvas.
   *
   * Read through to storage on every question, but not parsed on every
   * question: the memo below is keyed by the raw string itself, so a second
   * tab (or a second window of this one) that writes still invalidates it
   * the moment its bytes differ, while the hundreds of reads one repaint
   * makes all answer from the document already in hand. The freshness this
   * used to ask for is kept; the parse and the rebuild are paid once per
   * change instead of once per question.
   * @returns {object} the document.
   */
  function read() {
    // A document that could not be written outranks the one on disk: it is
    // the only copy of the reader's last press, and a full store must not
    // take it back out from under them.
    if (pending) return pending
    return stored() || seed()
  }

  /** What is written under the board's key, or null when nothing readable is. */
  function stored() {
    var raw = null
    try {
      raw = window.localStorage.getItem(BOARD_KEY)
    } catch (error) {
      raw = null
    }
    if (raw !== null && raw === memo.raw && memo.doc) return memo.doc
    var parsed = null
    try {
      parsed = clean(JSON.parse(raw || 'null'))
    } catch (error) {
      parsed = null
    }
    if (!parsed) return null
    memo.raw = raw
    memo.doc = parsed
    return parsed
  }

  /**
   * A private copy of the document, for one change to be made in.
   *
   * `clean` is the copy: it rebuilds the document field by field, so what a
   * mutation touches is never the object a read is handing out. One rebuild
   * per press is what buys every read its zero-cost answer.
   * @returns {object} a document the caller may change.
   */
  function edit() {
    return clean(read()) || seed()
  }

  /**
   * Write a document down, unless it is what was written last time.
   *
   * `written` is set only once the bytes are in. It used to be set first, so
   * a store that was full left this document marked as already stored - and
   * the same edit could never be written again, not even after room was made.
   * A failed write now keeps the document in `pending` instead: `read`
   * answers with it and `flush` keeps offering it, so nothing the reader did
   * is lost to a storage fault.
   * @param {object} doc - the document to store.
   * @returns {boolean} whether the store holds it.
   */
  function save(doc) {
    var serialized = JSON.stringify(doc)
    // Already written *and still what the store holds*: the second half is
    // what keeps this honest when another window has written in between, and
    // a document that comes back to what this page wrote before must still go
    // out rather than be skipped as "the same as last time".
    if (!pending && serialized === written && memo.raw === serialized) return true
    try {
      window.localStorage.setItem(BOARD_KEY, serialized)
    } catch (error) {
      pending = doc
      written = ''
      memo.raw = null
      memo.doc = doc
      reportStoreFull(error)
      return false
    }
    pending = null
    written = serialized
    memo.raw = serialized
    memo.doc = doc
    return true
  }

  /** Read, let `mutate` change the document, and store it when it says so. */
  function update(mutate) {
    var doc = edit()
    if (mutate(doc) === false) return false
    save(doc)
    return true
  }

  /**
   * Seat one card at the end of the run its conversation owns.
   *
   * A thought handed to a conversation joins the bottom of that
   * conversation's pile: the pile is read in the order the thoughts were
   * written, and nothing above it moves.
   * @param {object} doc - the document being changed.
   * @param {string} id - the card.
   * @param {string} sessionId - the conversation it now belongs to.
   * @returns {void}
   */
  function seatInFamily(doc, id, sessionId) {
    if (!sessionId) return
    var at = -1
    for (var i = 0; i < doc.cards.length; i++) {
      if (doc.cards[i].id === id) at = i
    }
    if (at < 0) return
    var card = doc.cards.splice(at, 1)[0]
    // A thought handed to a conversation goes to the top of its pile: the
    // newest thing filed is the one the reader is about to act on, and the
    // bottom of a long pile is a place things go to be forgotten.
    var head = -1
    for (var j = 0; j < doc.cards.length; j++) {
      if (doc.cards[j].link === sessionId) { head = j; break }
    }
    if (head < 0) doc.cards.splice(Math.min(at, doc.cards.length), 0, card)
    else doc.cards.splice(head, 0, card)
  }

  return {
    read: read,

    /**
     * Offer the document a full store refused once more.
     *
     * A store is often full for a moment - another tab writing, a download
     * landing - so the copy the reader is looking at is offered again rather
     * than kept in memory until the next press. A window that stays quiet in
     * between keeps a failing store from being asked on every frame.
     * @returns {boolean} whether the store holds it.
     */
    flush() {
      if (!pending) return true
      if (Date.now() - triedAt < BOARD_STORE_RETRY_MS) return false
      triedAt = Date.now()
      return save(pending)
    },

    /**
     * Forget the conversations no panel can draw any more.
     *
     * The order a panel remembers is the one part of the document that grows
     * by itself: one id per conversation ever drawn there, five hundred per
     * panel. A conversation that is gone for good has nothing left to sort,
     * so its id goes. Only the order: a deleted card's stamp and a star are
     * marks the reader made, and both answer again the moment it comes back.
     * @param {Array<string>} live - the conversations this paint can draw.
     * @returns {boolean} whether anything was dropped.
     */
    prune(live) {
      var held = Object.create(null)
      for (var i = 0; i < live.length; i++) held[live[i]] = true
      var dropped = false
      return update(function (doc) {
        // A word about a conversation the board no longer draws is a word
        // about nothing: it goes with the rest of the litter.
        for (var said in doc.verdict) {
          if (!Object.prototype.hasOwnProperty.call(doc.verdict, said)) continue
          if (held[said]) continue
          delete doc.verdict[said]
          dropped = true
        }
        for (var key in doc.order) {
          if (!Object.prototype.hasOwnProperty.call(doc.order, key)) continue
          var ids = doc.order[key]
          if (!Array.isArray(ids)) continue
          var kept = []
          for (var j = 0; j < ids.length; j++) {
            if (held[ids[j]]) kept.push(ids[j])
            else dropped = true
          }
          if (!kept.length) delete doc.order[key]
          else if (kept.length !== ids.length) doc.order[key] = kept
        }
        return dropped
      })
    },

    /**
     * Put one page's arrangement back.
     *
     * Only the five tables a page keeps: the marks (`muted`, `starred`), the
     * order each panel remembers, the fork lines and the zoom are decisions
     * the reader has made since, and restoring a day is not a way to take
     * them back. The page goes through the same cleaning any stored board
     * does, so a hand-edited history cannot draw something this build does
     * not know how to draw.
     * @param {object} page - `{blocks, cards, blockLabels, intents, placed}`.
     * @returns {boolean} whether the board changed.
     */
    adopt(page) {
      if (!page || typeof page !== 'object') return false
      var restored = clean({
        v: BOARD_STORE_VERSION,
        blocks: page.blocks,
        cards: page.cards,
        blockLabels: page.blockLabels,
        intents: page.intents,
        placed: page.placed,
      })
      if (!restored) return false
      return update(function (doc) {
        doc.blocks = restored.blocks
        doc.cards = restored.cards
        doc.blockLabels = restored.blockLabels
        doc.intents = restored.intents
        doc.placed = restored.placed
        return true
      })
    },

    /** Every panel's stored place, keyed by block id. */
    blocks() {
      return read().blocks
    },

    /**
     * Put one panel at a place, or move the place it already has.
     *
     * A panel only leaves the grid when the reader drags it there, so this
     * is called for both: the first paint of a workspace, and the end of a
     * drag that moved one.
     */
    placeBlock(id, x, y) {
      if (typeof id !== 'string' || !id) return false
      return update(function (doc) {
        var before = doc.blocks[id]
        doc.blocks[id] = {
          x: Math.max(0, Math.round(x)),
          y: Math.max(0, Math.round(y)),
          folded: before ? before.folded === true : false,
          ideas: before ? before.ideas !== false : true,
        }
        return true
      })
    },

    /** Whether one panel's conversations are folded away. */
    isFolded(id) {
      var entry = read().blocks[id]
      return Boolean(entry && entry.folded)
    },

    /** Fold one panel's conversations away, or bring them back. */
    toggleBlockFold(id) {
      if (typeof id !== 'string' || !id) return false
      var folded = false
      update(function (doc) {
        var entry = doc.blocks[id]
        if (!entry) entry = doc.blocks[id] = { x: 0, y: 0, folded: false }
        entry.folded = entry.folded !== true
        folded = entry.folded
        return true
      })
      return folded
    },

    /** Whether one panel is showing its conversations without their thoughts. */
    isIdeasHidden(id) {
      var entry = read().blocks[id]
      return Boolean(entry && entry.ideas === false)
    },

    /**
     * Hide or show every thought under one panel's conversations.
     *
     * Not the same switch as folding: folding puts the conversations away
     * too, while this keeps the row of cards and drops only the piles under
     * them - the shape of the work without its annotations.
     * @param {string} id - the block id.
     * @returns {boolean} whether the thoughts are now hidden.
     */
    toggleBlockIdeas(id) {
      if (typeof id !== 'string' || !id) return false
      var hidden = false
      update(function (doc) {
        var entry = doc.blocks[id]
        if (!entry) entry = doc.blocks[id] = { x: 0, y: 0, folded: false }
        entry.ideas = entry.ideas === false
        hidden = entry.ideas === false
        return true
      })
      return hidden
    },

    /** Whether one conversation's name is nailed down. */
    isSessionLocked(id) {
      return read().locks[id] === true
    },

    /**
     * Lock or unlock one conversation's name.
     *
     * A locked title is the reader's own word - a bug fix, a performance
     * pass - and the board must not rename it when a thought is handed
     * over. Manual renaming is refused too: the lock means what it says.
     * @param {string} id - session id.
     * @returns {boolean} whether it is now locked.
     */
    toggleSessionLock(id) {
      if (typeof id !== 'string' || !id) return false
      var locked = false
      update(function (doc) {
        if (doc.locks[id] === true) delete doc.locks[id]
        else doc.locks[id] = true
        locked = doc.locks[id] === true
        return true
      })
      return locked
    },

    /**
     * Lock or unlock one thought's place on the paper.
     *
     * A lock is the reader's promise that this card is where it belongs. A
     * tidy squares the panels up and gives loose cards no orders, but a card
     * the reader pinned here is not a card to move around at all - not by a
     * tidy, and not by any future thing that decides to be helpful.
     * @param {string} id - the card.
     * @returns {boolean} whether it is now locked.
     */
    toggleCardLock(id) {
      if (typeof id !== 'string' || !id) return false
      var locked = false
      update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].locked = doc.cards[i].locked !== true
          locked = doc.cards[i].locked
          return true
        }
        return false
      })
      return locked
    },

    /** The loose cards, in the order they were written. */
    cards() {
      return read().cards
    },

    /** Write a new empty card at a place, and answer its id. */
    addCard(x, y) {
      var id = ''
      update(function (doc) {
        id = 'n' + doc.seq
        doc.seq = doc.seq + 1
        doc.cards.push({
          id: id,
          x: Math.max(0, Math.round(Number(x) || 0)),
          y: Math.max(0, Math.round(Number(y) || 0)),
          text: '',
          link: '',
          done: false,
          filed: '',
          locked: false,
          // The moment it was made. The first words typed into it are what
          // the journal counts, so this is only the card's own birthday.
          w: Date.now(),
          d: 0,
          // The rows the reader grew this card to, or 0 for the default
          // one-line shape. Paper is the reader's to size: a thought that
          // needed three lines to read stays three lines next time.
          h: 0,
        })
        return true
      })
      return id
    },

    /** Move one card, keeping what it says. */
    moveCard(id, x, y) {
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].x = Math.max(0, Math.round(x))
          doc.cards[i].y = Math.max(0, Math.round(y))
          return true
        }
        return false
      })
    },

    /** Keep what one card says. A pressed Enter never leaves a line out. */
    setCardText(id, text) {
      var words = String(text === undefined || text === null ? '' : text)
      var wrote = 0
      var said = ''
      var changed = update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          var card = doc.cards[i]
          var had = card.text ? true : false
          card.text = words
          // The first words are the writing of it: a card made empty and
          // typed into later was written now, not when it was made, and one
          // emptied and written again keeps its first moment.
          if (!had && words.trim()) {
            card.w = Date.now()
            wrote = card.w
            said = firstLine(words)
          }
          return true
        }
        return false
      })
      // Written after the change landed, so the journal never says a thing
      // happened that the board refused to store.
      if (changed && wrote) {
        JOURNAL.add('note/written', { id: id, at: wrote, text: said })
      }
      return changed
    },

    /**
     * Tie one card to a conversation, without claiming it was delivered.
     *
     * The link is what draws the line and what the card's heading names. It
     * is a record of where the thought belongs, so it is kept when the card
     * is moved: a reader may put it somewhere else and still mean it for
     * that conversation.
     * @param {string} id - the card.
     * @param {string} sessionId - the conversation it points at.
     * @returns {boolean} whether a card was changed.
     */
    linkCard(id, sessionId) {
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].link = String(sessionId || '')
          seatInFamily(doc, id, doc.cards[i].link)
          return true
        }
        return false
      })
    },

    /**
     * Mark one card as handed over to a conversation.
     *
     * Done is a different fact from linked: a card can be laid beside a
     * conversation and still be a thought, but once its words are in that
     * conversation's box it has been delivered, and the board says so
     * without taking it away. The card stays where the reader can find it.
     * @param {string} id - the card.
     * @param {string} sessionId - the conversation that took it.
     * @returns {boolean} whether a card was changed.
     */
    finishCard(id, sessionId) {
      var at = 0
      var said = ''
      var changed = update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].link = String(sessionId || '')
          doc.cards[i].done = true
          if (!doc.cards[i].d) doc.cards[i].d = Date.now()
          at = doc.cards[i].d
          said = firstLine(doc.cards[i].text)
          seatInFamily(doc, id, doc.cards[i].link)
          return true
        }
        return false
      })
      if (changed) {
        JOURNAL.add('note/handoff', {
          id: id,
          at: at,
          session: String(sessionId || ''),
          text: said,
        })
      }
      return changed
    },

    /** Cut one card loose from the conversation it was tied to. */
    unlinkCard(id) {
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].link = ''
          doc.cards[i].done = false
          doc.cards[i].d = 0
          return true
        }
        return false
      })
    },

    /**
     * Put one card back, at the place in the stack it was taken from.
     *
     * The record is the whole card - text, tie, done mark, where it was filed,
     * its height - so an undone delete is the same card, not a new one that
     * reads the same. A card already present is left alone rather than
     * duplicated.
     * @param {object} record - the card as it was.
     * @param {number} index - where it sat in the stack.
     * @returns {boolean} whether it was written.
     */
    restoreCard(record, index) {
      if (!record || typeof record.id !== 'string' || !record.id) return false
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id === record.id) return false
        }
        var at = Math.round(Number(index) || 0)
        at = Math.max(0, Math.min(doc.cards.length, at))
        doc.cards.splice(at, 0, {
          id: record.id,
          x: Math.max(0, Math.round(Number(record.x) || 0)),
          y: Math.max(0, Math.round(Number(record.y) || 0)),
          text: typeof record.text === 'string' ? record.text : '',
          link: typeof record.link === 'string' ? record.link : '',
          done: record.done === true,
          filed: typeof record.filed === 'string' ? record.filed : '',
          locked: record.locked === true,
          // An undone delete is the same card, down to its two clocks.
          w: positiveStamp(record.w),
          d: positiveStamp(record.d),
          h: Math.max(0, Math.min(BOARD_EDITOR_MAX_ROWS, Math.round(Number(record.h) || 0))),
        })
        return true
      })
    },

    /** Take one card off the canvas for good. */
    removeCard(id) {
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards.splice(i, 1)
          return true
        }
        return false
      })
    },

    /**
     * The name one goal goes by, or '' when the reader has not named it.
     *
     * A goal is a panel on the canvas, and a panel is a place the reader
     * decides the meaning of: the workspace it happens to be cut from only
     * supplies the name it starts with.
     * @param {string} key - the block's id.
     * @returns {string} the chosen name, or ''.
     */
    blockLabel(key) {
      var chosen = read().blockLabels[key]
      return typeof chosen === 'string' ? chosen : ''
    },

    /**
     * Name one goal. A blank name gives it its workspace's name back.
     * @param {string} key - the block's id.
     * @param {string} label - what to call it.
     * @returns {boolean} whether the document changed.
     */
    setBlockLabel(key, label) {
      if (typeof key !== 'string' || !key) return false
      var text = String(label === undefined || label === null ? '' : label)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, BOARD_GOAL_NAME_MAX)
      return update(function (doc) {
        if (text) doc.blockLabels[key] = text
        else delete doc.blockLabels[key]
        return true
      })
    },

    /** Every goal the reader has named, keyed by block id. */
    blockLabels() {
      return read().blockLabels
    },

    /**
     * What one goal is for, or '' when the reader has not said.
     *
     * A name says what a place is called; this says what is to be done
     * there. The difference is load bearing: the name is a label, while
     * this is the one thing that keeps a goal on the canvas with nothing
     * filed in it.
     * @param {string} key - the block's id.
     * @returns {string} the stated purpose, or ''.
     */
    intentOf(key) {
      var said = read().intents[key]
      return typeof said === 'string' ? said : ''
    },

    /**
     * Say what one goal is for. An empty line takes the statement back,
     * which also lets the goal go once its last conversation has left.
     * @param {string} key - the block's id.
     * @param {string} text - what is to be done there.
     * @returns {boolean} whether the document changed.
     */
    setIntent(key, text) {
      if (typeof key !== 'string' || !key) return false
      var said = String(text === undefined || text === null ? '' : text)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, BOARD_GOAL_INTENT_MAX)
      return update(function (doc) {
        if (said) doc.intents[key] = said
        else delete doc.intents[key]
        return true
      })
    },

    /** Every purpose the reader has written, keyed by block id. */
    intents() {
      return read().intents
    },

    /**
     * The colour seat every place has been given, keyed by block id.
     *
     * Read as written: a seat the reader picked is kept even when another
     * goal already wears it. The board spreads new places apart by itself,
     * but it never overrules a choice - two goals the reader painted the
     * same colour are a statement, not a mistake to correct.
     * @returns {object} block id -> seat on the wheel.
     */
    seats() {
      return read().seats
    },

    /**
     * Give places their colour seats.
     *
     * Called both by the paint (a place drawn for the first time is given
     * the first free seat and written down at once) and by the reader (the
     * colour picker on a heading). One write for both, because both are the
     * same fact: this place is that colour from now on.
     * @param {object} map - block id -> seat.
     * @returns {boolean} whether the document changed.
     */
    setSeats(map) {
      if (!map || typeof map !== 'object') return false
      return update(function (doc) {
        var changed = false
        for (var key in map) {
          if (!Object.prototype.hasOwnProperty.call(map, key)) continue
          if (typeof key !== 'string' || !key) continue
          var seat = finite(map[key])
          if (seat === null) continue
          var wrapped = ((Math.round(seat) % BOARD_SLOTS) + BOARD_SLOTS) % BOARD_SLOTS
          if (doc.seats[key] === wrapped) continue
          doc.seats[key] = wrapped
          changed = true
        }
        return changed
      })
    },

    /** What has been said about each conversation, keyed by session id. */
    verdicts() {
      return read().verdict
    },

    /**
     * Say what one conversation is, against the turn it was said about.
     *
     * `finished` is written by the board itself when it watches a turn end
     * and the reader opens it; `paused` and `settled` are written by the
     * reader. Both die the same way: the stamp is the turn, so the next
     * turn makes the word stale without anyone having to clean up.
     * @param {string} id - the conversation.
     * @param {string} key - one of `VERDICT_KEYS`.
     * @param {number} at - the conversation's stamp for that turn.
     * @returns {boolean} whether the document changed.
     */
    setVerdict(id, key, at) {
      if (typeof id !== 'string' || !id) return false
      if (!VERDICT_KEYS[key]) return false
      var stamp = positiveStamp(at)
      if (!stamp) return false
      return update(function (doc) {
        var held = doc.verdict[id]
        if (held && held.key === key && held.at === stamp) return false
        doc.verdict[id] = { key: key, at: stamp }
        return true
      })
    },

    /**
     * Take a word back, leaving the conversation to the shell again.
     * @param {string} id - the conversation.
     * @returns {boolean} whether the document changed.
     */
    dropVerdict(id) {
      if (typeof id !== 'string' || !id) return false
      return update(function (doc) {
        if (!doc.verdict[id]) return false
        delete doc.verdict[id]
        return true
      })
    },

    /**
     * The order one goal's conversations are drawn in.
     *
     * A board is a map of where things are, so a card that moved because a
     * turn started would be a card the reader has to find again. The order is
     * therefore written down the first time a conversation is drawn in a goal
     * and never re-sorted: what arrives later goes to the end, and nothing
     * else moves.
     * @param {string} key - the block id.
     * @param {Array<string>} ids - the conversations this paint put here.
     * @returns {Array<string>} the order, with any new arrivals appended.
     */
    rememberOrder(key, ids) {
      if (typeof key !== 'string' || !key) return []
      var doc = edit()
      var held = Array.isArray(doc.order[key]) ? doc.order[key] : []
      var known = Object.create(null)
      for (var i = 0; i < held.length; i++) known[held[i]] = true
      var added = false
      var next = held.slice()
      // A branch is seated right after the conversation it was cut from: the
      // order is the reader's memory of the panel, and a fork that arrived
      // at the far end would be a fork nobody can follow. Two branches of one
      // parent keep the order they turned up in.
      var seated = Object.create(null)
      for (var j = 0; j < ids.length; j++) {
        var id = ids[j]
        if (typeof id !== 'string' || !id || known[id]) continue
        known[id] = true
        var after = -1
        var parent = doc.lineage[id]
        if (parent && parent !== id) {
          for (var p = 0; p < next.length; p++) {
            if (next[p] !== parent) continue
            after = p
          }
          if (after >= 0 && typeof seated[parent] === 'number' && seated[parent] > after) {
            after = seated[parent]
          }
        }
        if (after < 0) next.push(id)
        else {
          next.splice(after + 1, 0, id)
          seated[parent] = after + 1
        }
        added = true
      }
      if (added) {
        doc.order[key] = next
        save(doc)
      }
      return next
    },

    /**
     * Write one panel's order down as given.
     *
     * Only a history restore calls this: the page has a list the reader is
     * looking at, and the panel should read the way that page looked.
     * @param {string} key - the block id.
     * @param {Array<string>} ids - the conversations, in the order to keep.
     * @returns {boolean} whether it was written.
     */
    setOrder(key, ids) {
      if (typeof key !== 'string' || !key) return false
      var kept = []
      var seen = Object.create(null)
      for (var i = 0; i < (ids || []).length; i++) {
        var id = ids[i]
        if (typeof id !== 'string' || !id || seen[id]) continue
        seen[id] = true
        kept.push(id)
      }
      return update(function (doc) {
        doc.order[key] = kept
        return true
      })
    },

    /**
     * Move one card to a place among the thoughts of its own conversation.
     *
     * The document order is the stack order, so a drag inside a column is a
     * splice here rather than a number stored beside the card: one fact,
     * written once, and the paint reads it without a second table to keep
     * in step.
     * @param {string} id - the card being moved.
     * @param {string} beforeId - the card it should sit above, or '' for the
     *   end of the run.
     * @returns {boolean} whether it was written.
     */
    moveCardBefore(id, beforeId) {
      return update(function (doc) {
        var at = -1
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id === id) at = i
        }
        if (at < 0) return false
        var card = doc.cards.splice(at, 1)[0]
        var to = doc.cards.length
        if (beforeId && beforeId !== id) {
          for (var j = 0; j < doc.cards.length; j++) {
            if (doc.cards[j].id !== beforeId) continue
            to = j
            break
          }
        }
        doc.cards.splice(to, 0, card)
        return true
      })
    },

    /**
     * When the reader finished each conversation, keyed by session id.
     * @returns {object} session id -> epoch milliseconds.
     */
    doneStamps() {
      return read().done
    },

    /**
     * Put one conversation in its goal's finished strip, or move its mark
     * to now.
     *
     * A finished strip is a day's word, so writing one day's mark drops
     * the other days from the document: the strip reads only today, and a
     * table that grew a row per finish forever would be a ledger nobody
     * opens. No turn is ever moved here by itself - this is the verb the
     * hand performs, and the only one.
     * @param {string} id - session id.
     * @param {number} [at] - when, in epoch milliseconds; now when omitted.
     * @returns {boolean} whether it was written.
     */
    markSessionDone(id, at) {
      if (typeof id !== 'string' || !id) return false
      var when = positiveStamp(at) || Date.now()
      var today = dayOf(when)
      return update(function (doc) {
        for (var held in doc.done) {
          if (!Object.prototype.hasOwnProperty.call(doc.done, held)) continue
          if (dayOf(doc.done[held]) !== today) delete doc.done[held]
        }
        doc.done[id] = when
        return true
      })
    },

    /**
     * Take one conversation out of its finished strip, back to the work.
     * @param {string} id - session id.
     * @returns {boolean} whether a mark was there to drop.
     */
    clearSessionDone(id) {
      if (typeof id !== 'string' || !id) return false
      return update(function (doc) {
        if (doc.done[id] === undefined) return false
        delete doc.done[id]
        return true
      })
    },

    /**
     * Take a batch of conversations out of their finished strips, in one
     * write: several can go back at once when a page opens and finds them
     * running again.
     * @param {Array<string>} ids - session ids.
     * @returns {boolean} whether anything was dropped.
     */
    clearSessionsDone(ids) {
      if (!ids || !ids.length) return false
      return update(function (doc) {
        var dropped = false
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i]
          if (doc.done[id] !== undefined) {
            delete doc.done[id]
            dropped = true
          }
          // The word and the strip are one decision: a card that leaves
          // the strip by itself does not keep saying it is finished.
          if (doc.verdict[id] && doc.verdict[id].key === 'settled') {
            delete doc.verdict[id]
            dropped = true
          }
        }
        return dropped
      })
    },

    /**
     * Drop the settled word from a batch of conversations, in one write.
     *
     * A word about a day that is over is a word about nothing: the strip
     * reads only today, and the chip must not outlive it.
     * @param {Array<string>} ids - session ids.
     * @returns {boolean} whether anything was dropped.
     */
    dropSettled(ids) {
      if (!ids || !ids.length) return false
      return update(function (doc) {
        var dropped = false
        for (var i = 0; i < ids.length; i++) {
          var held = doc.verdict[ids[i]]
          if (!held || held.key !== 'settled') continue
          delete doc.verdict[ids[i]]
          dropped = true
        }
        return dropped
      })
    },

    /**
     * The conversations the reader brought back out of the quiet strip
     * today, keyed by session id.
     * @returns {object} session id -> epoch milliseconds.
     */
    wokeStamps() {
      return read().woke
    },

    /**
     * Say that the reader pulled one conversation back into the work.
     *
     * A quiet line is quiet because nothing has touched it today; dragging
     * it up is touching it, and the drag is the reader's word rather than
     * the feed's. The mark lasts for the local day, and writing one day's
     * mark drops the other days: only today is read.
     * @param {string} id - session id.
     * @param {number} [at] - when, in epoch milliseconds; now when omitted.
     * @returns {boolean} whether it was written.
     */
    markSessionWoke(id, at) {
      if (typeof id !== 'string' || !id) return false
      var when = positiveStamp(at) || Date.now()
      var today = dayOf(when)
      return update(function (doc) {
        for (var held in doc.woke) {
          if (!Object.prototype.hasOwnProperty.call(doc.woke, held)) continue
          if (dayOf(doc.woke[held]) !== today) delete doc.woke[held]
        }
        doc.woke[id] = when
        return true
      })
    },

    /**
     * Where the reader said each conversation belongs, keyed by session id.
     * @returns {object} session id -> block id.
     */
    placements() {
      return read().placed
    },

    /**
     * The goal a conversation was moved into, or '' when it sits where its
     * workspace puts it.
     * @param {string} id - session id.
     * @returns {string} the block id, or ''.
     */
    placementOf(id) {
      var goal = read().placed[id]
      return typeof goal === 'string' ? goal : ''
    },

    /**
     * File one conversation under a goal of the reader's choosing.
     *
     * A conversation is always drawn inside a goal: its workspace supplies
     * the one it starts in, and this is the one the reader moved it to. The
     * goal is the whole record - the card goes back to following its
     * workspace the moment the record is dropped.
     * @param {string} id - session id.
     * @param {string} goalKey - the block it now belongs to.
     * @returns {boolean} whether it was written down.
     */
    placeSession(id, goalKey) {
      if (typeof id !== 'string' || !id) return false
      if (typeof goalKey !== 'string' || !goalKey) return false
      return update(function (doc) {
        doc.placed[id] = goalKey
        // A card that was just put here stands at the end of this goal: it is
        // the newest arrival, and the panel's other cards did not move.
        var held = Array.isArray(doc.order[goalKey]) ? doc.order[goalKey] : []
        var rest = []
        for (var i = 0; i < held.length; i++) {
          if (held[i] !== id) rest.push(held[i])
        }
        rest.push(id)
        doc.order[goalKey] = rest
        return true
      })
    },

    /** Let one conversation follow its workspace again. */
    clearPlacement(id) {
      return update(function (doc) {
        if (doc.placed[id] === undefined) return false
        delete doc.placed[id]
        return true
      })
    },

    /**
     * Take one goal off the canvas and give its conversations back.
     *
     * Closing a place is not deleting what was in it: every conversation
     * filed here goes back to the goal its workspace gives it, which is
     * the rule a card already follows when it is carried somewhere else.
     * The record is answered so the same goal can be offered back for a
     * few seconds.
     * @param {string} key - the block's id.
     * @returns {object|null} what was removed, or null when there was nothing.
     */
    removeGoal(key) {
      if (typeof key !== 'string' || !key || key === BOARD_INBOX) return null
      if (!madeGoal(key)) return null
      var record = null
      update(function (doc) {
        var place = doc.blocks[key]
        var label = doc.blockLabels[key]
        var intent = doc.intents[key]
        var placed = {}
        var moved = 0
        for (var id in doc.placed) {
          if (!Object.prototype.hasOwnProperty.call(doc.placed, id)) continue
          if (doc.placed[id] !== key) continue
          placed[id] = key
          delete doc.placed[id]
          moved = moved + 1
        }
        record = {
          key: key,
          x: place ? place.x : 0,
          y: place ? place.y : 0,
          folded: place ? place.folded === true : false,
          label: typeof label === 'string' ? label : '',
          intent: typeof intent === 'string' ? intent : '',
          placed: placed,
          moved: moved,
        }
        delete doc.blocks[key]
        delete doc.blockLabels[key]
        delete doc.intents[key]
        return true
      })
      return record
    },

    /**
     * Put a closed goal back exactly as it was, conversations included.
     * @param {object} record - what `removeGoal` answered.
     * @returns {boolean} whether anything was written.
     */
    restoreGoal(record) {
      if (!record || !madeGoal(record.key)) return false
      return update(function (doc) {
        doc.blocks[record.key] = {
          x: Math.max(0, Math.round(Number(record.x) || 0)),
          y: Math.max(0, Math.round(Number(record.y) || 0)),
          folded: record.folded === true,
        }
        if (record.label) doc.blockLabels[record.key] = String(record.label)
        if (record.intent) doc.intents[record.key] = String(record.intent)
        var placed = record.placed || {}
        for (var id in placed) {
          if (!Object.prototype.hasOwnProperty.call(placed, id)) continue
          doc.placed[id] = record.key
        }
        return true
      })
    },

    /**
     * Forget the goals nothing is standing on any more.
     *
     * A goal lives by its conversations or by what the reader said it is
     * for. One with neither is a place nobody is working in - and keeping
     * its name would keep the empty panel with it, which is how a canvas
     * fills up with places nothing is happening in. Only goals this store
     * made are ever forgotten: a workspace's place belongs to the registry
     * and survives a paint in which no conversation from it is in sight.
     * @param {Array<string>} keys - the goals this paint is drawing.
     * @returns {number} how many goals were forgotten.
     */
    pruneGoals(keys) {
      var alive = Object.create(null)
      for (var i = 0; i < (keys || []).length; i++) alive[keys[i]] = true
      alive[BOARD_INBOX] = true
      var forgotten = 0
      update(function (doc) {
        var changed = false
        var key
        for (key in doc.blocks) {
          if (!Object.prototype.hasOwnProperty.call(doc.blocks, key)) continue
          if (alive[key] || !madeGoal(key)) continue
          delete doc.blocks[key]
          forgotten = forgotten + 1
          changed = true
        }
        for (key in doc.blockLabels) {
          if (!Object.prototype.hasOwnProperty.call(doc.blockLabels, key)) continue
          if (alive[key] || !madeGoal(key)) continue
          delete doc.blockLabels[key]
          changed = true
        }
        for (key in doc.intents) {
          if (!Object.prototype.hasOwnProperty.call(doc.intents, key)) continue
          if (alive[key] || !madeGoal(key)) continue
          delete doc.intents[key]
          changed = true
        }
        return changed
      })
      return forgotten
    },

    /**
     * Make a goal and stand it on the canvas at a place.
     *
     * A goal is a place the reader is working toward; it does not have to be
     * a workspace. Its id is the board's own, so a goal made this way can
     * never be mistaken for one cut from a workspace, and the name is the
     * whole of what it is.
     * @param {string} name - what to call it.
     * @param {number} x - canvas coordinate.
     * @param {number} y - canvas coordinate.
     * @returns {string} the new goal's id, or '' when it could not be made.
     */
    addGoal(name, x, y) {
      var id = ''
      update(function (doc) {
        doc.seq = Number(doc.seq) + 1
        id = 'g:' + doc.seq
        doc.blocks[id] = {
          x: Math.max(0, Math.round(Number(x) || 0)),
          y: Math.max(0, Math.round(Number(y) || 0)),
          folded: false,
        }
        var label = String(name === undefined || name === null ? '' : name)
          .replace(/\s+/g, ' ')
          .trim()
        if (label) doc.blockLabels[id] = label.slice(0, BOARD_GOAL_NAME_MAX)
        return true
      })
      return id
    },

    /**
     * Mark one card done, or take the mark back.
     *
     * Done is the reader's own word about a thought: it is not a deletion
     * and it is not a delivery. The card stays where it is, quieter.
     * @param {string} id - the card.
     * @param {boolean} done - whether it is finished.
     * @returns {boolean} whether a card was changed.
     */
    /**
     * Put one note into a place instead of on the paper.
     *
     * A note has a home the way a conversation does: '' is the paper, and a
     * goal id is filed in it. Only the inbox is a tray - it is the one place
     * that holds both kinds - and the place the note keeps is where it comes
     * back to when it is lifted out.
     * @param {string} id - the card.
     * @param {string} goalKey - where to file it.
     * @returns {boolean} whether it was written down.
     */
    fileCard(id, goalKey) {
      if (typeof id !== 'string' || !id) return false
      if (typeof goalKey !== 'string' || !goalKey) return false
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].filed = goalKey
          return true
        }
        return false
      })
    },

    /** Take one note back out of its place, onto the paper. */
    unfileCard(id) {
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          if (!doc.cards[i].filed) return false
          doc.cards[i].filed = ''
          return true
        }
        return false
      })
    },

    /** Every note filed in one place, oldest first. */
    filedCards(goalKey) {
      var all = read().cards
      var out = []
      for (var i = 0; i < all.length; i++) {
        if (all[i].filed === goalKey) out.push(all[i])
      }
      return out
    },

    /**
     * Set how many lines of paper one card spends.
     *
     * 0 is the default: one line, faded where it runs on. Anything else is
     * the height the reader dragged it to, kept for the next visit - a card
     * they had to open up once is a card they will want open next time.
     * @param {string} id - the card.
     * @param {number} rows - how many lines, or 0 for the default.
     * @returns {boolean} whether the document changed.
     */
    setCardRows(id, rows) {
      var want = Math.max(0, Math.round(Number(rows) || 0))
      return update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          if (Number(doc.cards[i].h) === want) return false
          doc.cards[i].h = want
          return true
        }
        return false
      })
    },

    setCardDone(id, done) {
      var marked = done === true
      var at = 0
      var said = ''
      var changed = update(function (doc) {
        for (var i = 0; i < doc.cards.length; i++) {
          if (doc.cards[i].id !== id) continue
          doc.cards[i].done = marked
          // The moment it was dealt with, or nothing when the reader took
          // the mark back: a card that is not done has no done moment.
          doc.cards[i].d = marked ? (doc.cards[i].d || Date.now()) : 0
          at = doc.cards[i].d
          said = firstLine(doc.cards[i].text)
          return true
        }
        return false
      })
      if (changed) {
        JOURNAL.add(marked ? 'note/done' : 'note/undone', { id: id, at: at, text: said })
      }
      return changed
    },

    /**
     * Take back a conversation's deletion, so a deliberate pin can bring it
     * back the same day it was taken off.
     * @param {string} id - session id.
     * @returns {boolean} whether a deletion was lifted.
     */
    unmute(id) {
      return update(function (doc) {
        if (doc.muted[id] === undefined) return false
        delete doc.muted[id]
        return true
      })
    },

    /** The parent of one conversation, or '' when this build never saw it fork. */
    lineageOf(id) {
      var parent = read().lineage[id]
      return typeof parent === 'string' ? parent : ''
    },

    /** Every fork line this build recorded, as child → parent. */
    lineage() {
      return read().lineage
    },

    /** The canvas magnification the reader last chose. */
    zoom() {
      return read().zoom
    },

    /** Remember a canvas magnification, already clamped by the caller. */
    setZoom(value) {
      var next = Number(value)
      if (!isFinite(next)) return false
      next = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, next))
      return update(function (doc) {
        doc.zoom = next
        return true
      })
    },

    /**
     * Record that one conversation was forked from another.
     *
     * The host writes no durable parent for an ordinary fork — the seed is
     * a prefix of events and the child's header does not name its source —
     * so the only honest line this board can draw is one it watched happen.
     * A chain that would close a loop is refused rather than drawn as a
     * circle.
     * @param {string} child - the forked conversation.
     * @param {string} parent - the conversation it was cut from.
     * @returns {boolean} whether a new line was recorded.
     */
    rememberFork(child, parent) {
      if (typeof child !== 'string' || typeof parent !== 'string') return false
      if (!child || !parent || child === parent) return false
      var doc = edit()
      if (doc.lineage[child] === parent) return false
      var walk = parent
      var steps = 0
      while (walk && steps < 64) {
        if (walk === child) return false
        walk = doc.lineage[walk] || ''
        steps = steps + 1
      }
      doc.lineage[child] = parent
      save(doc)
      JOURNAL.add('thread/born', { session: child, parent: parent })
      return true
    },

    /**
     * Take a conversation off the board for good, until it moves again.
     *
     * The stamp it is remembered by is the moment it was last touched: a
     * conversation that is deleted and later gets a new message is a
     * conversation that is in play again, and it comes back where it
     * belongs — that is the one exception to being removed.
     * @param {string} id - session id.
     * @param {number} touched - the conversation's updatedAt when deleted.
     * @returns {void}
     */
    mute(id, touched) {
      update(function (doc) {
        doc.muted[id] = Number(touched) || 0
        return true
      })
    },

    /** Whether a conversation is deleted, as of how recently it moved. */
    isMuted(id, touched) {
      var stamp = read().muted[id]
      if (stamp === undefined) return false
      return (Number(touched) || 0) <= stamp
    },

    /**
     * Whether a conversation is marked.
     *
     * A mark, not a place: it does not move a card, and it is not a panel.
     * What it buys is the one thing the day's boundary otherwise cannot do —
     * keep a conversation that has stopped moving on the board.
     * @param {string} id - session id.
     * @returns {boolean} whether it is marked.
     */
    isStarred(id) {
      return read().starred[id] === true
    },

    toggleStar(id) {
      var doc = edit()
      if (doc.starred[id]) delete doc.starred[id]
      else doc.starred[id] = true
      save(doc)
      return doc.starred[id] === true
    },
  }
}

/**
 * The board's history: what was done, and how to put it back.
 *
 * A module of its own on purpose. It knows nothing about cards, goals or
 * conversations - a step arrives as a pair of closures (`undo`, `redo`), so
 * the only thing shared between the board and its history is the shape of a
 * step. That is what lets a new reversible action be added by recording one
 * more command, rather than by teaching this file about a new kind of thing.
 *
 * Order is the whole of the state: `past` is the way back, `future` the way
 * forward again, and recording anything makes the future meaningless (the
 * reader has chosen a different present).
 * @param {number} limit - how many steps are kept.
 * @returns {object} the history.
 */
function makeHistory(limit) {
  var past = []
  var future = []
  var watchers = []

  /** Tell whoever is drawing the buttons that the stacks moved. */
  function announce() {
    for (var i = 0; i < watchers.length; i++) {
      try {
        watchers[i]()
      } catch (error) {
        console.warn('[dsh-vim] a history watcher failed', error)
      }
    }
  }

  /**
   * Register one step that has already been taken.
   *
   * `record` runs after the change, not instead of it: the caller has already
   * asked the store to do the work and is handing over the way back.
   * @param {{label: string, undo: Function, redo: Function}} command - the step.
   * @returns {object|null} the command, for a notice to hold on to.
   */
  function record(command) {
    if (!command || typeof command.undo !== 'function') return null
    past.push(command)
    while (past.length > limit) past.shift()
    future.length = 0
    announce()
    return command
  }

  /** Step back one command, and hold it ready to be stepped forward again. */
  function undo() {
    if (!past.length) return null
    var command = past.pop()
    try {
      command.undo()
    } catch (error) {
      console.warn('[dsh-vim] a board undo failed', error)
    }
    future.push(command)
    announce()
    return command
  }

  /** Step forward again, onto a command that was stepped back. */
  function redo() {
    if (!future.length) return null
    var command = future.pop()
    try {
      command.redo()
    } catch (error) {
      console.warn('[dsh-vim] a board redo failed', error)
    }
    past.push(command)
    announce()
    return command
  }

  return {
    record: record,
    undo: undo,
    redo: redo,
    canUndo() {
      return past.length > 0
    },
    canRedo() {
      return future.length > 0
    },
    /**
     * Step back only if this command is still the last one.
     *
     * A notice lives for a few seconds, and another delete can happen inside
     * them: the notice then holds a step that is no longer the top, and undoing
     * it would undo somebody else's work.
     * @param {object} command - the step the notice was made for.
     * @returns {object|null} the command, or null when it is not the top.
     */
    undoTo(command) {
      if (!command || past[past.length - 1] !== command) return null
      return undo()
    },
    depth() {
      return { past: past.length, future: future.length, limit: limit }
    },
    clear() {
      past.length = 0
      future.length = 0
      announce()
    },
    subscribe(watcher) {
      watchers.push(watcher)
      return function () {
        var at = watchers.indexOf(watcher)
        if (at >= 0) watchers.splice(at, 1)
      }
    },
  }
}

/**
 * The board's one history.
 *
 * Fifty steps: enough to walk back through a session of tidying, few enough
 * that nothing is held for long. It lives in memory and dies with the page -
 * a delete that survived a reload is a delete the reader meant.
 */
var BOARD_HISTORY = makeHistory(50)

var BOARD_STORE = makeBoardStore()

/**
 * The lines pinned to conversations, and the only thing that touches them.
 *
 * One line per conversation, keyed by the session id the shell already
 * uses: a note is attached to the work it came out of, so the id is the
 * whole of the index and there is nothing to keep in step. The document is
 * versioned and cleaned on the way in for the same reason the board's is —
 * a hand-edited store can only produce something this build can draw — and
 * a blank line is read as "no note" rather than as a note of nothing.
 * @returns {object} the store.
 */
function makeNoteStore() {
  /** The last serialized form written, so an unchanged one is not rewritten. */
  var written = ''

  /** Whatever was stored, reduced to `id -> line` for the notes still set. */
  function readAll() {
    var parsed = null
    try {
      parsed = JSON.parse(window.localStorage.getItem(NOTE_KEY) || 'null')
    } catch (error) {
      parsed = null
    }
    if (!parsed || parsed.v !== 1 || !parsed.notes || typeof parsed.notes !== 'object') return {}
    var notes = {}
    for (var id in parsed.notes) {
      if (!Object.prototype.hasOwnProperty.call(parsed.notes, id)) continue
      if (typeof parsed.notes[id] !== 'string') continue
      var line = parsed.notes[id].trim()
      if (!line) continue
      notes[id] = line
    }
    return notes
  }

  /** Write the map back unless it is what was written last time. */
  function save(notes) {
    var serialized = JSON.stringify({ v: 1, notes: notes })
    if (serialized === written) return
    written = serialized
    try {
      window.localStorage.setItem(NOTE_KEY, serialized)
    } catch (error) {
      console.warn('[dsh-vim] the note could not be stored', error)
    }
  }

  return {
    /**
     * The line pinned to one conversation, or '' while it has none.
     * @param {string} id - session id.
     * @returns {string} the line.
     */
    get(id) {
      return readAll()[id] || ''
    },

    /**
     * Pin a line to one conversation, replacing whatever it carried.
     *
     * An empty line is how a note is taken away: there is no second
     * gesture to remember, and nothing left behind pointing at nothing.
     * @param {string} id - session id.
     * @param {string} text - the line, trimmed.
     * @returns {string} what was kept — '' when the note was removed.
     */
    /**
     * Every line that is set, as `id -> line`.
     *
     * A page copies the lines as they read at the moment it is filed: the
     * history must not follow an edit made after it, or yesterday's page
     * would change whenever today's note did.
     * @returns {object} the map.
     */
    all() {
      return readAll()
    },

    /**
     * Replace every line with one file's.
     *
     * The map goes through the same reading a stored one does, so an import
     * cannot leave a note this build would not have written.
     * @param {object} map - `id -> line`.
     * @returns {boolean} whether anything was taken.
     */
    adopt(map) {
      if (!map || typeof map !== 'object') return false
      var notes = {}
      for (var id in map) {
        if (!Object.prototype.hasOwnProperty.call(map, id)) continue
        if (typeof map[id] !== 'string') continue
        var line = map[id].trim()
        if (!line) continue
        notes[id] = line
      }
      save(notes)
      return true
    },

    set(id, text) {
      var notes = readAll()
      var line = String(text || '').trim()
      if (!line) delete notes[id]
      else notes[id] = line
      save(notes)
      return line
    },
  }
}

var NOTE_STORE = makeNoteStore()

/**
 * The words handed to a conversation the board was not standing in.
 *
 * A hand-over used to open the conversation to reach its box, which cost
 * the reader the board and made one drop the end of the gesture. The words
 * wait here instead: one queue per conversation, in the order the cards
 * were let go, and the box takes the whole of it the next time it mounts -
 * at the end, on its own line, exactly as the drop used to paste it. Capped,
 * because a queue is a hand's worth of cards, not a transcript.
 * @returns {object} the store.
 */
function makeHandoffStore() {
  /** The last serialized form written, so an unchanged one is not rewritten. */
  var written = ''

  /** How many cards one conversation will wait for. */
  var CAP = 40

  /** Whatever was stored, reduced to session id -> words for live queues. */
  function readAll() {
    var parsed = null
    try {
      parsed = JSON.parse(window.localStorage.getItem(HANDOFF_KEY) || 'null')
    } catch (error) {
      parsed = null
    }
    if (!parsed || parsed.v !== 1 || !parsed.sessions || typeof parsed.sessions !== 'object') return {}
    var queues = {}
    for (var id in parsed.sessions) {
      if (!Object.prototype.hasOwnProperty.call(parsed.sessions, id)) continue
      var list = parsed.sessions[id]
      if (!Array.isArray(list)) continue
      var words = []
      for (var i = 0; i < list.length && words.length < CAP; i++) {
        if (typeof list[i] !== 'string') continue
        var text = list[i].trim()
        if (!text) continue
        words.push(text)
      }
      if (words.length) queues[id] = words
    }
    return queues
  }

  /** Write the queues back unless they are what was written last time. */
  function save(queues) {
    var serialized = JSON.stringify({ v: 1, sessions: queues })
    if (serialized === written) return
    written = serialized
    try {
      window.localStorage.setItem(HANDOFF_KEY, serialized)
    } catch (error) {
      console.warn('[dsh-vim] the waiting hand-over could not be stored', error)
    }
  }

  return {
    /**
     * What one conversation is waiting for, oldest first.
     * @param {string} id - session id.
     * @returns {Array<string>} the words, one entry per card.
     */
    pending(id) {
      return (readAll()[id] || []).slice()
    },

    /**
     * Add one card's words to the back of a conversation's queue.
     *
     * Appending is the whole order: two cards let go a moment apart arrive
     * in the box in the order they were dropped, the same way two presses
     * would have.
     * @param {string} id - session id.
     * @param {string} text - what the card says, trimmed.
     * @returns {number} how many cards are now waiting.
     */
    push(id, text) {
      var word = String(text || '').trim()
      var queues = readAll()
      var queue = queues[id] || []
      if (word && queue.length < CAP) queue.push(word)
      if (queue.length) queues[id] = queue
      save(queues)
      return queue.length
    },

    /**
     * Take the oldest cards off one conversation's queue, once they landed.
     *
     * Taking exactly what was written, rather than the whole queue, is what
     * keeps a card let go while the paste was in flight: it stays waiting,
     * and the flush that follows it puts it in its own block instead of the
     * queue being emptied underneath it.
     * @param {string} id - session id.
     * @param {number} count - how many of the oldest words have landed.
     * @returns {number} how many cards are still waiting.
     */
    take(id, count) {
      var queues = readAll()
      var queue = queues[id] || []
      if (!queue.length) return 0
      var left = queue.slice(Math.max(0, Number(count) || 0))
      if (left.length) queues[id] = left
      else delete queues[id]
      save(queues)
      return left.length
    },
  }
}

var HANDOFF_STORE = makeHandoffStore()

// --- the board's history -------------------------------------------------
//
// A day's page is what the board read at that moment, frozen: the feed it was
// derived from has moved on by morning, so the members of yesterday are gone
// from it. Everything here is written once a day and read when the panel
// opens, which is why it lives in a database of its own and why nothing in it
// can be needed by a repaint.

/** The pages, and the one slot that holds what the last restore replaced. */
var HISTORY = makeHistoryStore()

/** The conversations a day inherited from the day before it. */
var CARRY = makeCarryStore()

/** What moved, as opposed to what was on the desk: see makeJournal. */
var JOURNAL = makeJournal()

/**
 * The history's own store: one record per local day, in IndexedDB.
 *
 * The board's arrangement is state - every repaint reads it, so it has to
 * answer synchronously, and localStorage is the only store that does. A day's
 * page is not state: it is written once when the day turns over and read when
 * somebody opens the panel. Putting it here is what lets it be large: the
 * database's quota is a share of the disk rather than a fixed five megabytes,
 * and filing a page no longer happens on the thread that draws the board.
 *
 * Nothing here may be required for the board to work. No database at all - a
 * host that forbids one, a private window - makes every call answer null and
 * `available()` false, and the board carries on with no history rather than
 * with a failure.
 * @returns {object} the store.
 */
function makeHistoryStore() {
  /** The open database, once there is one. */
  var db = null
  /** Whether this host has refused a database, or failed to give one. */
  var failed = false
  /** The open in flight, so two early asks do not open two databases. */
  var opening = null

  /** Open the database once, and answer with null when there is none to open. */
  function open() {
    if (db) return Promise.resolve(db)
    if (failed) return Promise.resolve(null)
    if (opening) return opening
    opening = new Promise(function (resolve) {
      var request = null
      try {
        request = window.indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION)
      } catch (error) {
        failed = true
        resolve(null)
        return
      }
      request.onupgradeneeded = function () {
        var upgrade = request.result
        if (!upgrade.objectStoreNames.contains(HISTORY_STORE_DAYS)) {
          upgrade.createObjectStore(HISTORY_STORE_DAYS, { keyPath: 'date' })
        }
        if (!upgrade.objectStoreNames.contains(HISTORY_STORE_META)) {
          upgrade.createObjectStore(HISTORY_STORE_META, { keyPath: 'k' })
        }
      }
      request.onsuccess = function () {
        db = request.result
        // A newer page that wants this database is the one that owns it: let
        // go rather than hold the version it is asking for.
        db.onversionchange = function () {
          try {
            db.close()
          } catch (error) {
            // Already closed: nothing to let go of.
          }
          db = null
          opening = null
        }
        resolve(db)
      }
      request.onerror = function () {
        failed = true
        resolve(null)
      }
      // Another tab holding an older version open would otherwise leave this
      // promise pending for the life of the page. A history that cannot be
      // read is a sentence in the panel; a promise that never settles is a
      // panel that never opens.
      request.onblocked = function () {
        failed = true
        resolve(null)
      }
    })
    return opening
  }

  /**
   * Run one request and answer with its result, or null.
   *
   * Every failure - no database, a refused transaction, an aborted one -
   * answers null here, so no caller has to guard: an unreadable page is
   * drawn as an unreadable page, never thrown through the board.
   */
  function ask(store, mode, build) {
    return open().then(function (each) {
      if (!each) return null
      return new Promise(function (resolve) {
        var transaction = null
        try {
          transaction = each.transaction(store, mode)
        } catch (error) {
          resolve(null)
          return
        }
        var request = null
        try {
          request = build(transaction.objectStore(store))
        } catch (error) {
          resolve(null)
          return
        }
        request.onsuccess = function () {
          resolve(request.result === undefined ? null : request.result)
        }
        request.onerror = function () {
          resolve(null)
        }
        transaction.onabort = function () {
          resolve(null)
        }
      })
    })
  }

  return {
    /** Whether this host can hold a history at all. */
    available() {
      return !failed
    },

    /** Every day that has a page, oldest first. */
    days() {
      return ask(HISTORY_STORE_DAYS, 'readonly', function (box) {
        return box.getAllKeys()
      }).then(function (keys) {
        return (keys || []).filter(function (key) {
          return typeof key === 'string'
        }).sort()
      })
    },

    /** One day's page, or null when that day has none. */
    day(date) {
      return ask(HISTORY_STORE_DAYS, 'readonly', function (box) {
        return box.get(date)
      })
    },

    /** Keep one day's page, replacing whatever was filed under that date. */
    put(record) {
      return ask(HISTORY_STORE_DAYS, 'readwrite', function (box) {
        return box.put(record)
      }).then(function (key) {
        return typeof key === 'string'
      })
    },

    /** Drop one day's page. */
    drop(date) {
      return ask(HISTORY_STORE_DAYS, 'readwrite', function (box) {
        return box.delete(date)
      }).then(function () {
        return true
      })
    },

    /** What the board looked like just before the last restore or import. */
    backup() {
      return ask(HISTORY_STORE_META, 'readonly', function (box) {
        return box.get(HISTORY_BACKUP_KEY)
      })
    },

    /** Keep one such state, replacing the one before it. */
    setBackup(snapshot) {
      return ask(HISTORY_STORE_META, 'readwrite', function (box) {
        return box.put({ k: HISTORY_BACKUP_KEY, at: Date.now(), snapshot: snapshot })
      }).then(function (key) {
        return key !== null
      })
    },
  }
}

/**
 * The sessions a day inherited, kept where a repaint can reach them.
 *
 * This is today's state rather than history: the paint has to know which
 * conversations are still on the board while it is drawing them, so it is
 * localStorage and it is read through a memo on the raw string, exactly like
 * the board itself.
 * @returns {object} the store.
 */
/**
 * The journal's own store: one line per event, appended and never rewritten.
 *
 * Nothing here may be needed for the board to work. A host with no database
 * answers "no journal", every caller carries on without one, and the only
 * thing lost is the summary of a day - exactly as the pages degrade.
 *
 * Lines are added from presses rather than from paints, so a write is
 * chained behind the one before it: two presses half a millisecond apart are
 * two lines, and neither can overwrite the other.
 * @returns {object} the journal.
 */
function makeJournal() {
  /** The open database, once there is one. */
  var db = null
  /** Whether this host has refused a database, or failed to give one. */
  var failed = false
  /** The open in flight, so two early asks do not open two databases. */
  var opening = null
  /** The last write, so the next one queues behind it. */
  var tail = Promise.resolve(true)

  /** Open the database once, and answer with null when there is none. */
  function open() {
    if (db) return Promise.resolve(db)
    if (failed) return Promise.resolve(null)
    if (opening) return opening
    opening = new Promise(function (resolve) {
      var request = null
      try {
        request = window.indexedDB.open(JOURNAL_DB_NAME, JOURNAL_DB_VERSION)
      } catch (error) {
        failed = true
        resolve(null)
        return
      }
      request.onupgradeneeded = function () {
        var upgrade = request.result
        if (!upgrade.objectStoreNames.contains(JOURNAL_STORE_EVENTS)) {
          upgrade.createObjectStore(JOURNAL_STORE_EVENTS, { keyPath: 'k' })
        }
      }
      request.onsuccess = function () {
        db = request.result
        db.onversionchange = function () {
          try {
            db.close()
          } catch (error) {
            // Already closed: nothing to let go of.
          }
          db = null
          opening = null
        }
        resolve(db)
      }
      request.onerror = function () {
        failed = true
        resolve(null)
      }
      // Another tab holding an older version would otherwise leave this
      // promise pending for the life of the page.
      request.onblocked = function () {
        failed = true
        resolve(null)
      }
    })
    return opening
  }

  /**
   * Run one request and answer with its result, or null.
   *
   * Every failure answers null, so no caller has to guard, and a journal
   * that cannot be written is a quiet absence rather than an exception in
   * the middle of a press.
   */
  function ask(mode, build) {
    return open().then(function (each) {
      if (!each) return null
      return new Promise(function (resolve) {
        var transaction = null
        try {
          transaction = each.transaction(JOURNAL_STORE_EVENTS, mode)
        } catch (error) {
          resolve(null)
          return
        }
        var request = null
        try {
          request = build(transaction.objectStore(JOURNAL_STORE_EVENTS))
        } catch (error) {
          resolve(null)
          return
        }
        request.onsuccess = function () {
          resolve(request.result === undefined ? null : request.result)
        }
        request.onerror = function () {
          resolve(null)
        }
        transaction.onabort = function () {
          resolve(null)
        }
      })
    })
  }

  /** A key that sorts by the moment it was written, and never collides. */
  function keyFor(at) {
    return dayOf(at) + '#'
      + ('0000000000000' + String(at)).slice(-13) + '-'
      + Math.random().toString(36).slice(2, 8)
  }

  return {
    /** Whether this host can keep a journal at all. */
    available() {
      return !failed
    },

    /**
     * Write one line. Never throws, and never holds up the press that made
     * it: the answer says whether it landed, and only a summary reads it.
     * @param {string} kind - what happened.
     * @param {object} [data] - what it happened to.
     * @returns {Promise<boolean>} whether the line landed.
     */
    add(kind, data) {
      if (failed || typeof kind !== 'string' || !kind) return Promise.resolve(false)
      var at = Date.now()
      var line = { k: keyFor(at), at: at, kind: kind }
      if (data && typeof data === 'object') {
        for (var field in data) {
          if (!Object.prototype.hasOwnProperty.call(data, field)) continue
          if (field === 'k' || field === 'at' || field === 'kind') continue
          line[field] = data[field]
        }
      }
      tail = tail.then(function () {
        return ask('readwrite', function (box) {
          return box.put(line)
        })
      }).then(function () {
        return true
      }, function () {
        return false
      })
      return tail
    },

    /**
     * Every line of one local day, oldest first.
     * @param {string} date - a local day, YYYY-MM-DD.
     * @returns {Promise<Array<object>>} the lines, or none.
     */
    day(date) {
      if (failed || typeof date !== 'string' || !date) return Promise.resolve([])
      return ask('readonly', function (box) {
        return box.getAllKeys()
      }).then(function (keys) {
        var wanted = []
        for (var i = 0; i < (keys || []).length; i++) {
          var each = keys[i]
          if (typeof each !== 'string' || each.length < 12) continue
          if (each.slice(0, 10) !== date || each.charAt(10) !== '#') continue
          wanted.push(each)
        }
        wanted.sort()
        var out = []
        var chain = Promise.resolve()
        wanted.forEach(function (key) {
          chain = chain.then(function () {
            return ask('readonly', function (box) {
              return box.get(key)
            }).then(function (line) {
              if (line && typeof line.kind === 'string') out.push(line)
            })
          })
        })
        return chain.then(function () {
          return out
        })
      })
    },
  }
}

function makeCarryStore() {
  var memo = { raw: null, sessions: {} }
  var written = ''

  /** What is stored, reduced to `id -> {from, title, goal}`. */
  function read() {
    var raw = null
    try {
      raw = window.localStorage.getItem(CARRY_KEY)
    } catch (error) {
      raw = null
    }
    if (raw !== null && raw === memo.raw) return memo.sessions
    var parsed = null
    try {
      parsed = JSON.parse(raw || 'null')
    } catch (error) {
      parsed = null
    }
    var sessions = Object.create(null)
    if (parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object') {
      for (var id in parsed.sessions) {
        if (!Object.prototype.hasOwnProperty.call(parsed.sessions, id)) continue
        var entry = parsed.sessions[id]
        if (!entry || typeof entry !== 'object' || typeof entry.from !== 'string') continue
        sessions[id] = {
          from: entry.from,
          title: typeof entry.title === 'string' ? entry.title : '',
          goal: typeof entry.goal === 'string' ? entry.goal : '',
        }
      }
    }
    memo.raw = raw
    memo.sessions = sessions
    return sessions
  }

  return {
    /** The day one conversation was carried from, or '' when it was not. */
    from(id) {
      var entry = read()[id]
      return entry ? entry.from : ''
    },

    /** How many days a conversation has been carried into today. */
    days(id, today) {
      var entry = read()[id]
      return entry ? daysBetween(entry.from, today) : 0
    },

    /** Every conversation carried into today, as the map itself. */
    all() {
      return read()
    },

    /**
     * Replace the whole set.
     *
     * Settling a day is the only writer: the members of the page just filed
     * come along and yesterday's set goes. One small write a day, rather than
     * a rewrite of the arrangement.
     * @param {string} day - the local day being started.
     * @param {object} sessions - `id -> {from, title, goal}`.
     * @returns {boolean} whether it was stored.
     */
    settle(day, sessions) {
      var serialized = JSON.stringify({ v: SNAPSHOT_VERSION, day: day, sessions: sessions })
      if (serialized === written) return true
      try {
        window.localStorage.setItem(CARRY_KEY, serialized)
      } catch (error) {
        console.warn('[dsh-vim] the carried sessions could not be stored', error)
        return false
      }
      written = serialized
      memo.raw = serialized
      memo.sessions = sessions
      return true
    },

    /** Forget every carried session; a restore seats its own set. */
    clear() {
      try {
        window.localStorage.removeItem(CARRY_KEY)
      } catch (error) {
        console.warn('[dsh-vim] the carried sessions could not be cleared', error)
      }
      written = ''
      memo.raw = null
      memo.sessions = Object.create(null)
    },
  }
}


export { BOARD_HISTORY, BOARD_STORE, NOTE_STORE, HISTORY, CARRY, JOURNAL, HANDOFF_STORE }
