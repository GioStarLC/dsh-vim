/**
 * dsh-vim — Vim-style keyboard scrolling for the DeepSeek Harness web client.
 *
 *   d  ->  scroll down     (rebindable)
 *   e  ->  scroll up       (rebindable)
 *   f  ->  task window     (rebindable): the most recent conversations, with
 *                             the down/up keys to move and Enter to switch
 *   space -> put the keyboard in the message box (rebindable); the box never
 *            takes focus on its own, so arriving anywhere — first load, a
 *            switch, the end of a run — leaves the keys live until you ask,
 *            and a message you send hands the keyboard straight back
 *
 * Target: the pane under the pointer. Hover the conversation and the keys work
 * the transcript, hover the sidebar and they work the sidebar; a session with
 * no pointer to follow falls back to the focused pane, then to the middle of
 * the window, then to the largest scroll container.
 *
 * Feel: each press glides the container toward a target with frame-rate
 * independent exponential easing, and holding the key accelerates instead of
 * waiting on the operating system's ~500 ms key-repeat delay. Keys are handled
 * only when focus is NOT inside a text field, so typing is never affected.
 *
 * Preferences (keys, step, easing, repeat delay) live in localStorage and are
 * edited from a page this plugin registers under Settings → Vim scrolling.
 *
 * Built to the DSH client-module contract: the artifact `lib/client.js` is a
 * single file that registers a factory with `window.__ModuleLoader__`. The
 * source is split by responsibility in `src/client/`; `npm run build`
 * assembles it. The host must mount the `dsh-vim` row for it to reach the page.
 */
import React from 'react'
import { dismissOutsidePress, forgetPointer, onContextMenu, onEscapeBlur, onFocusLoss, onKeyDown, onKeyUp, onPointerDown, onPointerMove, onUserScroll } from './keyboard.js'
import { activateSession, showBoard, showOverview, toggleBoard } from './app-actions.js'
import { installSettings } from './settings-page.js'
import { installBoardPage, installOverviewPage, installWindowCSS, mountOverviewInto, overviewToday } from './board-pages.js'
import { closeVerdictMenu, closeIdeaMenu, renderBoard, closeIdeaFocus, closeGoalMenu, closeSeatMenu, closeSessionMenu, pasteIntoComposer } from './board-view.js'
import { closeBoard, mountBoardInto, openBoard, unmountBoard } from './board-mount.js'
import { commitBoardNote, noteCardFinished, openNote, pinToBoard, watchForks } from './board-notes.js'
import { boardPointerDown, cancelBoardDrag, drawCardLinks } from './board-gestures.js'
import { closeNewSessionSheet, paintNewSessionModel, openNewSessionSheet, startNewSessionForGoal } from './board-sheet.js'
import { workspaceForGoal, boardBlockByKey, boardBlocks, boardPlaces, boardPanelHeights, boardPanelWidths, boardExtent, applyBoardZoom, setBoardZoom, fitBoardToWindow, onBoardResize, onBoardWheel, nextCardPlace, boardFreePlace, nextGoalName, goalOfRow, boardHomeOf, boardRowOf, blockInk, goalHue, noteInkOf, notePaper, noteParts, boardEditorRows, boardNoteMetrics, boardCardBox, boardCardOpenBox, canvasPointOf, goalNodeAt, goalUnder, doneBarUnder, goalHeadKeyUnder, boardJoinText, tidyBoard, boardSlots, blockSeat, boardBlockWidth, boardCardStacked, slotHue } from './board-canvas.js'
import { setHistoryRepaint, closeBoardHistory, openBoardHistory, closeSeal, dropCarried, maybeShowSeal, noteMoment, pageDoc, pageView, restoreDay, settleDay } from './board-history.js'
import { wireBoardHooks } from './board-hooks.js'
import { BOARD, boardFieldOpen, boardTitleOf } from './board-state.js'
import { BOARD_HISTORY, BOARD_STORE, NOTE_STORE, HISTORY, CARRY, JOURNAL } from './board-stores.js'
import { dayOf, daysBetween, startOfToday } from './time.js'
import { BOARD_INK, NOTE_PAPER, BOARD_UI, BOARD_PAGE_UI, OVERVIEW_UI, boardIcon, installBoardCSS, applyBoardPageInk } from './board-css.js'
import { MODELPICK, closeModelPick, setSheetPick, setSheetReady, confirmLevel, confirmModelPick, markedLevel, modelPickKeyDown, openModelPick, openNewSessionModelPick, renderModelPick } from './model-picker.js'
import { catalogGroups, isCurrentEntry, modelDirectories, levelIndex, cycleEffort, rowMarkedLevel, rowSubmitLevel, offeredModels, modelEntries, modelIndex, modelDirectoryOfCurrent, readModelList, readNewSessionModelList, levelName, switchModel } from './models.js'
import { PALETTE, PALETTE_UI, clockDelay, setBoardOpenProbe, setSessionOpener, setPinAction, closePalette, cyclePhase, openPalette, paletteHeadline, paletteKeyDown, refreshPalette, renderPalette, stopClock, tickClocks } from './task-window.js'
import { renameSession, archiveSession } from './session-actions.js'
import { failureText, refusal, archiveFailureText } from './errors.js'
import { PHASES_MODEL } from './phases.js'
import { watchEntries, stopEntries, cancelEntry, armEntry, clearEntryArm } from './entry.js'
import { requestTurns as requestTurnCounts, drainPeeks as drainTurnPeeks, cancelPeeks as cancelTurnCounts, turnsOf } from './turns.js'
import { setDeliveryHook, RUNS, watchRuns, loadRunStamps, forgetRuns, runSince, elapsedText, attentionOf } from './runs.js'
import { taskCtx, serviceOf, setTaskContext, taskServices, currentSession, currentSessionRunning, entryRunning, conversationPool, hereIndex, folderIndex, folderById, statusOf, statusIsLive } from './sessions.js'
import { TOAST, showToast, hideToast } from './toast.js'
import { doubleEnter, composerRoot, isComposerEditor, noteFocusRequest, clearFocusRequest, isActivating, focusComposer, composerIsEmpty, leaveEmptyComposer, inComposer, menuOpen, doubleEnterSends, sendFromComposer, handBackAfterSend, breakLine, onFocusIn, noteFocusReturn, rememberComposer } from './focus.js'
import { state, anim, hold, pointer, pickScroller, resolveTarget, reducedMotion, stopAnim, push, stopHold, tickHold, startHold, directionOf } from './scroll.js'
import { isEditable, isScrollable, parentOf, scrollerFrom, largestScroller, elementAt } from './dom.js'
import { setRepaint, settings, defaults, copy, isBindableKey, normalizeKey, keyLabel, clampNumber, sanitizeFavorites, applyPatch, repairKeys, load, subscribe } from './preferences.js'
import { EN, ZH, localeIsZh, paletteText } from './strings.js'
import {
  NS, STORAGE_KEY, RAW_INPUT_SELECTOR, COMPOSER_SELECTOR, MODAL_SELECTOR, ACTIVATING_SELECTOR,
  TRIGGER_MENU_SELECTOR, FOCUS_REQUEST_MS, SEND_HAND_BACK_MS, DOUBLE_ENTER_MS, REWRITTEN_FLAG, SEND_MODES,
  DEFAULTS, KEY_GROUPS, MODEL_SEATS, NUMERIC_SEATS, BOOL_SEATS, PLACES,
  PENDING_LABELS, PALETTE_LIMIT, PALETTE_STEP, PALETTE_WINDOW_MS, DONE_PULSE_MS, BOARD_KEY,
  BOARD_STORE_VERSION, NOTE_KEY, HISTORY_DB_NAME, HISTORY_DB_VERSION, HISTORY_STORE_DAYS, HISTORY_STORE_META,
  HISTORY_BACKUP_KEY, JOURNAL_DB_NAME, JOURNAL_DB_VERSION, JOURNAL_STORE_EVENTS, SNAPSHOT_MOMENT_KEY, CARRY_KEY,
  SNAPSHOT_VERSION, SNAPSHOT_KEEP_DEFAULT, DAY_MS, BOARD_STORE_RETRY_MS, BOARD_PRUNE_MS, HISTORY_EXPORT_KIND,
  BOARD_CARRY_DROP_DAYS, BOARD_PANEL_ID, OVERVIEW_PANEL_ID, BOARD_INBOX, BOARD_DONE, VERDICT_KEYS,
  BOARD_BLOCK_W, BOARD_BLOCK_H, BOARD_BLOCK_GAP_X, BOARD_BLOCK_GAP_Y, BOARD_BLOCK_PITCH_X, BOARD_BLOCK_PITCH_Y,
  BOARD_BLOCK_COLUMNS, BOARD_ROW_COLUMNS, BOARD_CARD_W, BOARD_BLOCK_PAD, BOARD_COLUMN_GAP, BOARD_CARD_CHROME_H,
  BOARD_CARD_LINE_H, BOARD_FLOAT_W, BOARD_GOAL_NAME_MAX, BOARD_GOAL_INTENT_MAX, BOARD_EDITOR_MIN_ROWS, BOARD_NOTE_BODY_ROWS,
  BOARD_DONE_PREVIEW, BOARD_EDITOR_MAX_ROWS, BOARD_CANVAS_EDGE, BOARD_TIDY_GAP, BOARD_TIDY_STEP, BOARD_BLOCK_HEAD_H,
  BOARD_TIDY_GLIDE, BOARD_MIN_FONT, BOARD_ZOOM_MIN, BOARD_ZOOM_MAX, BOARD_ZOOM_FIT_MIN, BOARD_ZOOM_STEP,
  BOARD_FIT_PAD, BOARD_TIDY_COLUMNS, BOARD_SLOTS, BOARD_SLOP, BOARD_SORT_EDGE, BOARD_GOAL_MENU_W,
  ROW_CELLS, PHASES, PHASES_KEY, PEEK_SOURCE, PEEK_CONCURRENCY, PEEK_TIMEOUT_MS,
  LIMITS, REPEAT_INTERVAL, MIN_REPEAT_INTERVAL, REPEAT_RAMP,
} from './constants.js'

    'use strict'




    /** Debug and tuning surface, also used by tools/selftest.mjs. */
    function makeApi() {
      return {
        probe: function () {
          var el = pickScroller()
          return {
            element: el,
            tag: el ? el.tagName : null,
            className: el ? String(el.className) : null,
            scrollTop: el ? el.scrollTop : null,
            scrollHeight: el ? el.scrollHeight : null,
            clientHeight: el ? el.clientHeight : null,
            pointer: { x: pointer.x, y: pointer.y, seen: pointer.seen },
            composer: {
              known: composerRoot() !== null,
              focused: isComposerEditor(document.activeElement),
              empty: composerRoot() === null ? null : composerIsEmpty(composerRoot()),
            },
          }
        },
        debug: function (on) {
          state.debug = on === undefined ? true : Boolean(on)
          return state.debug
        },
        settings: function () {
          return copy()
        },
        update: function (patch) {
          var failure = applyPatch(patch)
          return failure === null ? copy() : { error: failure }
        },
        tuning: function (patch) {
          if (patch) applyPatch(patch)
          return copy()
        },
        /**
         * What the model key would see right now: the configured list, the
         * catalog the host offers, and the two reduced to the entries one press
         * could actually land on. A list that reads empty here is why the key
         * says so instead of switching something.
         */
        models: function () {
          return catalogGroups().then(function (result) {
            var offered = offeredModels(result.groups)
            return {
              service: modelDirectories() !== null,
              ok: result.ok,
              favorites: settings.favorites.slice(),
              offered: Object.keys(offered),
              entries: modelEntries(result.groups, settings.favorites).map(function (entry) {
                return entry.provider + '/' + entry.model
              }),
            }
          })
        },
        step: function (px) {
          if (px !== undefined) applyPatch({ step: px })
          return settings.step
        },
        reset: function () {
          applyPatch(defaults())
          return copy()
        },
        /**
         * What the board would show right now, and whether it is up.
         *
         * The task window's `palette()` answers the same questions about the
         * other overlay; this one answers them about this one, so a check can
         * read what is on screen rather than guess from the DOM.
         */
        board: function (on) {
          if (on === true && !BOARD.open) openBoard()
          else if (on === false && BOARD.open) closeBoard()
          return {
            available: taskServices() !== null,
            open: BOARD.open,
            mode: BOARD.mode,
            // The canvas as it is drawn: one entry per workspace in play, then
            // the inbox. A card is listed by its conversation's id, and its
            // fork source is named only when this build watched the branch.
            blocks: BOARD.blocks.map(function (block) {
              return {
                key: block.key,
                label: block.label,
                kind: block.kind,
                path: block.path,
                folded: BOARD_STORE.isFolded(block.key),
                ids: block.rows.map(function (row) {
                  return row.id
                }),
              }
            }),
            inbox: BOARD.inbox.map(function (summary) {
              var status = statusOf(summary)
              return {
                id: summary.id,
                title: summary.displayTitle || summary.id,
                status: status ? status.key : null,
              }
            }),
            cards: BOARD.nodes.map(function (node) {
              return node.getAttribute('data-session-id')
            }),
            /** What can be stepped back and forward, for a check to read. */
            history: {
              canUndo: BOARD_HISTORY.canUndo(),
              canRedo: BOARD_HISTORY.canRedo(),
              depth: BOARD_HISTORY.depth(),
            },
            /** The names the reader gave these goals, by block id. */
            goals: BOARD_STORE.blockLabels(),
            /** What each goal is for, by block id. */
            intents: BOARD_STORE.intents(),
            /** Where the reader filed each card, when not where its workspace does. */
            placed: BOARD_STORE.placements(),
            /** The card the last press raised, and which goal is being named. */
            front: BOARD.front,
            renamingGoal: BOARD.renamingBlock,
            /** The loose cards: what they say, and where they sit. */
            loose: BOARD_STORE.cards(),
            editingCard: BOARD.cardEditing,
            /** The fork lines this build watched, child → parent. */
            lineage: BOARD_STORE.lineage(),
            /** Where each panel and card sits on the canvas. */
            places: BOARD_STORE.blocks(),
            starred: BOARD.rows.filter(function (row) {
              return BOARD_STORE.isStarred(row.id)
            }).map(function (row) {
              return row.id
            }),
          }
        },
        /**
         * The line pinned to one conversation, and which card is editing one.
         *
         * The editor is a field inside the card, so a check can read it from
         * the DOM; what this adds is the bookkeeping the DOM does not carry —
         * which conversation will be written to when the field is confirmed.
         */
        note: function (id) {
          return {
            editing: BOARD.noteEditing,
            line: id ? NOTE_STORE.get(id) : '',
          }
        },
        /**
         * Mount the board as the sidebar page, into a caller's element.
         *
         * The React page does this in a browser; a headless check has no
         * renderer, so the same mount is reachable here and exercises the page
         * path without a window.
         */
        /**
         * Empty the board's history.
         *
         * It lives in memory for the life of the page, which is right for a
         * reader and wrong for a check: a check must start from no steps at all.
         * @returns {object} the stacks, both empty.
         */
        clearHistory: function () {
          BOARD_HISTORY.clear()
          if (BOARD.open) renderBoard()
          return BOARD_HISTORY.depth()
        },

        boardPage: function (root, on) {
          if (on === false) {
            if (BOARD.open && BOARD.mode === 'page') unmountBoard()
            return false
          }
          if (!root) return false
          return mountBoardInto(root, 'page')
        },
        /**
         * The overview's reading of today, and its page, without a window.
         *
         * The page is a plain builder in a browser too; a headless check has no
         * renderer, so the mount and the reading behind it are reachable here.
         * @param {Element} [root] - an element to build the page into.
         * @param {number} [nowMs] - the moment to read as.
         * @returns {boolean|object} whether it was built, or the reading.
         */
        overview: function (root, nowMs) {
          if (!root) return overviewToday(nowMs)
          return mountOverviewInto(root)
        },
        palette: function (on) {
          if (on === true && !PALETTE.open) openPalette()
          else if (on === false && PALETTE.open) closePalette()
          return {
            available: taskServices() !== null,
            open: PALETTE.open,
            index: PALETTE.index,
            // Whether the cursor is standing on the "More" seat rather than on a
            // conversation. Exposed because it is the one position that is not a
            // row, so a check reading `rows[index]` would otherwise be reading
            // the row the seat is standing in front of.
            onMore: PALETTE.onMore,
            headline: paletteHeadline(),
            total: PALETTE.pool.length,
            // Whether the browsing block is the fallback batch rather than the
            // last three hours. The rows are the same either way; only the
            // heading differs, and a check has to be able to tell which one it
            // is looking at without reading the label.
            stale: PALETTE.stale,
            // The blocks the list is cut into, so the cut can be read without
            // counting elements — a heading is not a row, and `index` counts
            // conversations only.
            sections: PALETTE.sections.map(function (section) {
              return {
                kind: section.kind,
                label: section.kind === 'more' ? paletteText('groupMore') : section.label,
                // How much is still behind the "More" seat, or how many rows the
                // block holds. The two answer different questions on purpose.
                count: section.kind === 'more' ? section.count : section.rows.length,
                ids: section.rows.map(function (row) {
                  return row.id
                }),
              }
            }),
            rows: PALETTE.rows.map(function (row) {
              return {
                id: row.id,
                title: row.displayTitle,
                updatedAt: row.updatedAt,
                status: statusOf(row),
                phase: PHASES_MODEL.get(row.id),
                turns: turnsOf(row),
                // 0 unless a turn is in flight and this plugin watched it start.
                since: statusIsLive(statusOf(row)) ? runSince(row.id) : 0,
              }
            }),
          }
        },
        stop: function () {
          stopHold()
          stopAnim()
          closePalette()
          closeModelPick()
          closeBoard()
          commitBoardNote()
          hideToast()
          doubleEnter.at = 0
        },
        /**
         * What the picker would show right now, and whether it is up.
         *
         * `models()` answers the same question from the catalog side; this one
         * answers it from the window's own side, so a check can prove what is
         * on screen rather than what could be.
         */
        modelPick: function (on) {
          if (on === true && !MODELPICK.open) openModelPick()
          else if (on === false && MODELPICK.open) closeModelPick()
          return {
            open: MODELPICK.open,
            index: MODELPICK.index,
            total: MODELPICK.entries.length,
            submitting: MODELPICK.submitting,
            notice: MODELPICK.notice,
            // The level the selected row would submit, and whether the user put
            // it there. `undefined` is "no level" — the provider default, which
            // is a real answer here and not a missing one.
            level: MODELPICK.open ? confirmLevel() : undefined,
            marked: MODELPICK.open ? markedLevel(MODELPICK.index) : undefined,
            levelSet: MODELPICK.levelSet,
            here: MODELPICK.here ? MODELPICK.here.level : undefined,
            rows: MODELPICK.entries.map(function (entry, at) {
              return {
                provider: entry.provider,
                model: entry.model,
                name: entry.name,
                levels: (entry.levels || []).map(function (level) {
                  return { id: level.id, name: level.name }
                }),
                marked: markedLevel(at),
              }
            }),
          }
        },
        /**
         * The history, for a check to read.
         *
         * `history()` answers with every day that has a page, oldest first;
         * `history(date)` with one page as filed. Both read the database the
         * panel reads, so what a check sees is what a reader sees.
         * @param {string} [date] - the day to read.
         * @returns {Promise<Array<string>|object|null>} the days, or one page.
         */
        history: function (date) {
          if (date === undefined) return HISTORY.days()
          return HISTORY.day(date)
        },

        /** Copy one page into today, exactly as the panel's own press does. */
        restoreDay: function (date) {
          return restoreDay(date)
        },

        /** Let go of the conversations carried longest; answers how many went. */
        dropCarried: function (days) {
          return dropCarried(days === undefined ? BOARD_CARRY_DROP_DAYS : days)
        },

        /** Put the history panel up (true), take it down (false), or ask. */
        historyPanel: function (on) {
          if (on === true) return openBoardHistory()
          if (on === false) {
            closeBoardHistory()
            return false
          }
          return !!BOARD.historyNode
        },

        /**
         * Read, mark, cycle and forget stages.
         *
         * `phase()` returns the whole map; `phase(id)` reads one conversation;
         * `phase(id, 'code')` marks it and `phase(id, 'code', true)` cycles it;
         * `clearPhases()` forgets every stage. Marking answers with a repaint
         * when the window is up, exactly as a press of the stage key does, so a
         * stage written here is not one a screen is still showing as absent.
         */
        phase: function (id, value, step) {
          if (id === undefined) return PHASES_MODEL.all()
          if (value === undefined) return PHASES_MODEL.get(id)
          var next
          if (step) next = cyclePhase(id)
          else {
            next = PHASES_MODEL.set(id, value)
            if (PALETTE.open) renderPalette()
          }
          return next
        },
        /** Forget every stage. Kept apart from `phase` so a bare call cannot be a write. */
        clearPhases: function () {
          PHASES_MODEL.reset()
          if (PALETTE.open) renderPalette()
          return PHASES_MODEL.all()
        },
      }
    }

    /**
     * Client activation.
     * @param {object} ctx - client root context.
     */
    function apply(ctx) {
      // The store persists and announces; only the open windows know how to
      // redraw themselves after a change.
      setRepaint(function () {
        if (PALETTE.open) refreshPalette()
        if (MODELPICK.open) renderModelPick()
      })
      if (typeof window === 'undefined' || typeof document === 'undefined') return

      setTaskContext(ctx)
      // The task window refuses to open over the board, switches the main view
      // through the dispatcher, and hands a row to the board. The three are the
      // only verbs it does not own, so they are wired here.
      setBoardOpenProbe(function () {
        return BOARD.open
      })
      setSessionOpener(activateSession)
      setPinAction(pinToBoard)
      // The history reads and writes days; the canvas is what redraws after.
      setHistoryRepaint(function () {
        renderBoard()
      })
      // The board's own modules read each other's verbs through one registry;
      // these are the real implementations, which live later in this file.
      wireBoardHooks({
        repaint: renderBoard,
        closeIdeaSheet: function () {
          closeIdeaFocus({ paint: false })
        },
        noteFinished: noteCardFinished,
        drawLinks: drawCardLinks,
        press: boardPointerDown,
        openSession: activateSession,
        pasteDraft: pasteIntoComposer,
        showBoard: showBoard,
        showOverview: showOverview,
      })
      // The picker opened for the new-conversation sheet has no conversation to
      // submit to; the choice goes back to the sheet it was opened from.
      setSheetReady(function () {
        return !!BOARD.newSessionHost
      })
      setSheetPick(function (pick) {
        BOARD.newSessionModel = pick
        paintNewSessionModel()
      })
      setDeliveryHook(function (id) {
        JOURNAL.add('thread/finished', { session: id })
      })
      taskServices.cache = undefined
      closePalette()
      closeModelPick()
      closeBoard()
      // A board being typed into belongs to the page that was rebuilt around
      // it: what was typed is kept, the field itself is not.
      commitBoardNote()
      forgetPointer()
      forgetRuns()
      // An arrival belongs to the page that was opened to show it; a rebuild
      // is a new page and notes the conversation it was built around again.
      stopEntries()
      // There may be a turn in flight whose start the previous page took down,
      // and this page is the same client rebuilt around it.
      loadRunStamps()
      // Stages the previous page marked are this page's too.
      PHASES_MODEL.load()

      load()

      ctx.effect(function () {
        // The run watch is the one thing this plugin does while nothing is
        // being asked of it: without it, no row could ever show how long its
        // turn has been going (the shell publishes no start time).
        watchRuns()
        // Forks are observed from the moment the page wakes, not from the
        // moment the board opens: a branch made in the sidebar while the board
        // was shut still has a line waiting for it.
        watchForks()
        // An arrival is told from a status tick by where the conversation on
        // screen sits, so the current binding is watched from the page waking,
        // not from the first keypress.
        watchEntries()
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('keyup', onKeyUp, true)
        window.addEventListener('keydown', onEscapeBlur)
        window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
        document.addEventListener('focusin', onFocusIn, true)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('contextmenu', onContextMenu)
        window.addEventListener('wheel', onUserScroll, { capture: true, passive: true })
        window.addEventListener('touchstart', onUserScroll, { capture: true, passive: true })
        window.addEventListener('blur', onFocusLoss)
        window.addEventListener('focus', noteFocusReturn)
        document.addEventListener('visibilitychange', onFocusLoss)

        var api = makeApi()
        window.__dshVim = api

        return function () {
          stopHold()
          stopAnim()
          closePalette()
          closeModelPick()
          closeBoard()
          commitBoardNote()
          hideToast()
          stopClock()
          forgetRuns()
          stopEntries()
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('keyup', onKeyUp, true)
          window.removeEventListener('keydown', onEscapeBlur)
          window.removeEventListener('pointermove', onPointerMove, true)
          document.removeEventListener('focusin', onFocusIn, true)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('contextmenu', onContextMenu)
          window.removeEventListener('wheel', onUserScroll, true)
          window.removeEventListener('touchstart', onUserScroll, true)
          window.removeEventListener('blur', onFocusLoss)
          window.removeEventListener('focus', noteFocusReturn)
          document.removeEventListener('visibilitychange', onFocusLoss)
          if (window.__dshVim === api) delete window.__dshVim
        }
      })

      installSettings(ctx)
      installWindowCSS()
      installBoardCSS()
      // After the settings contribution, because the sidebar label and the page
      // share the vocabulary it registers.
      installBoardPage(ctx)
      // The overview reads the same vocabulary and the same board document, so
      // it is contributed beside the board rather than before it.
      installOverviewPage(ctx)
    }


    const name = 'dsh-vim'
    const inject = ['slots', 'locale']

    export { name, inject, apply }
