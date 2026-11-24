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
import { cancelBoardDrag, closeBoard, closeGoalMenu, closeIdeaFocus, closeIdeaMenu, closeSeatMenu, closeSessionMenu, closeVerdictMenu, commitBoardNote, drawCardLinks, mountBoardInto, noteCardFinished, openBoard, openNote, pasteIntoComposer, pinToBoard, renderBoard, unmountBoard, watchForks } from './board-ui.js'
import { closeNewSessionSheet, paintNewSessionModel, openNewSessionSheet, startNewSessionForGoal } from './board-sheet.js'
import { workspaceForGoal, boardBlockByKey, boardBlocks, boardPlaces, boardPanelHeights, boardPanelWidths, boardExtent, applyBoardZoom, setBoardZoom, fitBoardToWindow, onBoardResize, onBoardWheel, nextCardPlace, boardFreePlace, nextGoalName, goalOfRow, boardHomeOf, boardRowOf, blockInk, goalHue, noteInkOf, notePaper, noteParts, boardEditorRows, boardNoteMetrics, boardCardBox, boardCardOpenBox, canvasPointOf, goalNodeAt, goalUnder, doneBarUnder, goalHeadKeyUnder, boardJoinText, tidyBoard, boardSlots, blockSeat, boardBlockWidth, boardCardStacked, slotHue } from './board-canvas.js'
import { setHistoryRepaint, closeBoardHistory, openBoardHistory, closeSeal, dropCarried, maybeShowSeal, noteMoment, pageDoc, pageView, restoreDay, settleDay } from './board-history.js'
import { wireBoardHooks } from './board-hooks.js'
import { BOARD, boardTitleOf } from './board-state.js'
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




    /**
     * True when this keystroke is a send, and the keyboard should not stay in
     * the message box afterwards.
     *
     * A send is a thing the user types, so it is seen here rather than guessed
     * at from the shell: `Ctrl/Cmd+Enter` is the host's own send accelerator and
     * works in every mode, while a bare Enter only sends while the host is left
     * to send it — in the other three modes this plugin swallows the key itself
     * (see the send-mode branch in `onKeyDown`).
     *
     * Three keys that look like a send are not one, and each is left alone: a
     * candidate list open, where Enter takes the highlighted entry; a box with
     * nothing in it, where Enter sends nothing; and a key being composed by an
     * IME, which never reaches this function at all. Reading the draft is what
     * makes the second one safe — and a wrong guess here is cheap, since the
     * probes only ever move focus and never touch a character.
     * @param {KeyboardEvent} ev - the keydown, before the editable yield.
     * @param {string} key - its lower-cased `key`.
     * @returns {boolean} whether the keyboard should be handed back afterwards.
     */
    function onSendKey(ev, key) {
      if (!settings.sendBlurs) return false
      if (PALETTE.open) return false
      if (key !== 'enter') return false
      if (ev.shiftKey) return false
      if (!inComposer(ev.target)) return false
      if (menuOpen()) return false
      var chord = ev.ctrlKey || ev.metaKey
      var bare = !chord && !ev.altKey
      if (!chord && !(bare && settings.sendMode === 'host')) return false
      return !composerIsEmpty(composerRoot())
    }

    function onKeyDown(ev) {
      if (ev.defaultPrevented) return
      // The composition guard comes first because a send must never be read out
      // of a key an IME is still assembling — Enter confirms a candidate there,
      // and taking the caret away mid-word would cost the user their input.
      if (ev.isComposing || ev.keyCode === 229) return
      // A key this plugin rewrote and handed to the box is not a key the user
      // pressed. It bubbles back up to this same capture listener, so ignoring
      // it here is what keeps a rewritten gesture from being read as a second,
      // separate keystroke — which would clear the double-Enter pair, or arm a
      // focus request nobody made.
      if (ev[REWRITTEN_FLAG]) return
      var key = ev.key ? ev.key.toLowerCase() : ''

      // The day's summary is a page waiting to be read, and while it is up the
      // press it is waiting for is the only thing a key means. Escape, Enter and
      // Space all close it: a summary is a page, not a question, and one key is
      // enough for a page.
      if (BOARD.sealNode) {
        if (key === 'escape' || key === 'enter' || key === ' ') {
          ev.preventDefault()
          ev.stopPropagation()
          closeSeal()
        }
        return
      }

      // Anything but a bare Enter in the message box ends the pair: the
      // double-Enter gesture is a rhythm, and a letter, a Shift+Enter or an
      // Enter aimed somewhere else in the middle of it means the user was not
      // confirming. Only the bare Enter the pair is made of leaves the stamp
      // alone, because that is the second half of it.
      if (key !== 'enter') doubleEnter.at = 0
      else if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey || !inComposer(ev.target)) doubleEnter.at = 0

      // A send ends the message, and with it the claim on the keyboard. This is
      // asked before the chord bail-out below, which would otherwise hide
      // Ctrl/Cmd+Enter — the host's own send key.
      if (onSendKey(ev, key)) {
        doubleEnter.at = 0
        clearFocusRequest()
        handBackAfterSend()
        // The key is still the host's to send with; nothing below has anything
        // to say about it. Falling through to the editable yield instead would
        // re-arm the very request this send has just spent, and that request is
        // the licence the caret needs to stay in the box.
        return
      }

      if (ev.ctrlKey || ev.altKey || ev.metaKey) {
        // The idea sheet's fields are written in, but the sheet itself is a
        // window: Cmd/Ctrl+Enter closes it even while the caret is in a field,
        // where the generic chord bail-out below would otherwise leave the key
        // to the host.
        if (BOARD.ideaFocusHost && !MODELPICK.open && (ev.ctrlKey || ev.metaKey) && key === 'enter') {
          ev.preventDefault()
          ev.stopPropagation()
          closeIdeaFocus({ paint: true })
        }
        return
      }

      // The model window is the innermost of this plugin's windows: it can be
      // opened from the conversation, from the task window, or from the board's
      // new-conversation sheet, and each of those would otherwise answer first
      // and take the keys the window is drawing with. So it is answered here,
      // before every other surface: Escape is its own, the model key confirms
      // (the same meaning it has wherever the window is up), and the movement,
      // level and reorder keys are the task window's own.
      if (MODELPICK.open) {
        if (key !== '' && key === settings.modelKey) {
          ev.preventDefault()
          if (!ev.repeat) confirmModelPick()
          return
        }
        if (modelPickKeyDown(ev, key)) {
          ev.preventDefault()
          return
        }
        // Anything it does not claim is swallowed rather than passed on: like
        // the task window, the point of being modal is that a press cannot do
        // two things at once.
        return
      }

      // The idea sheet is the innermost window after the model picker: it owns
      // Escape and the board's own key, and its fields keep every other key for
      // the words being written. It is answered before the page and overlay
      // branches, which would otherwise read a letter typed into the title as a
      // key of the board behind it.
      if (BOARD.ideaFocusHost) {
        if (key === 'escape') {
          ev.preventDefault()
          ev.stopPropagation()
          closeIdeaFocus({ paint: true })
          return
        }
        if (isEditable(ev.target)) return
        // Tab still moves between the sheet's fields and marks; every other key
        // belongs to the window, not to the page it is standing on.
        if (key === 'tab') return
        ev.preventDefault()
        ev.stopPropagation()
        return
      }

      // The sheet owns Escape and the board's own key while it is up. Its
      // fields answer Escape themselves and stop it there; this is for a press
      // that landed on the sheet's buttons instead, and for the page mount,
      // which has no overlay branch to fall through.
      if (BOARD.newSessionHost && !isEditable(ev.target)) {
        if (key === 'escape') {
          ev.preventDefault()
          ev.stopPropagation()
          closeNewSessionSheet()
          return
        }
        if (key === settings.boardKey) {
          ev.preventDefault()
          ev.stopPropagation()
          return
        }
        // The page's two model seats act on the conversation behind the board,
        // and this sheet is a form in front of it: a stray `w` must not change
        // what that conversation runs on, and the sheet has a row of its own for
        // the question it would ask.
        if (key === settings.modelKey || key === settings.effortKey) {
          ev.preventDefault()
          ev.stopPropagation()
          return
        }
      }

      // The board as a page is not a window: it owns no keys of its own beyond
      // the one that goes back to the conversation, and everything the page
      // answers to keeps working. A gesture in progress is the exception — a
      // drag is the gesture's while it is up.
      if (BOARD.open && BOARD.mode === 'page') {
        if (BOARD.drag) {
          if (key === 'escape') {
            ev.preventDefault()
            ev.stopPropagation()
            cancelBoardDrag()
          } else {
            ev.stopPropagation()
          }
          return
        }
        if (key === 'escape' && (BOARD.ideaMenu || BOARD.sessionMenu || BOARD.seatMenu
          || BOARD.goalMenu || BOARD.verdictMenu)) {
          ev.preventDefault()
          ev.stopPropagation()
          closeIdeaMenu()
          closeSessionMenu()
          closeSeatMenu()
          closeGoalMenu()
          closeVerdictMenu()
          return
        }
        if (key === settings.boardKey) {
          ev.preventDefault()
          toggleBoard()
          return
        }
      }

      // The floating board answers before the page does. It is a pointer window,
      // so everything the page owns — the reasoning key, the model window, the
      // task window, the focus key — must not act on what the board is standing
      // in front of. Two keys are its own: its own key puts it away, and Escape
      // is the way out every window in this plugin has. A scroll key is let
      // through, because the canvas is an ordinary scroller and reading it is
      // the only thing the keyboard can usefully do here.
      if (BOARD.open && BOARD.mode === 'overlay') {
        // The name box is the plugin's own field, so the keyboard is its while it
        // is being typed into: Enter keeps the name, Escape throws it away, and
        // neither may be read as a key of the window.
        if (isEditable(ev.target)) return
        // Escape is the one way out of a gesture, and it is the gesture's while
        // one is in progress: dropping a card is an easier mistake to make than
        // closing a window by accident.
        if (BOARD.drag) {
          if (key === 'escape') {
            ev.preventDefault()
            ev.stopPropagation()
            cancelBoardDrag()
          } else {
            ev.stopPropagation()
          }
          return
        }
        if (key === 'escape' && (BOARD.ideaMenu || BOARD.sessionMenu || BOARD.seatMenu
          || BOARD.goalMenu || BOARD.verdictMenu)) {
          ev.preventDefault()
          ev.stopPropagation()
          closeIdeaMenu()
          closeSessionMenu()
          closeSeatMenu()
          closeGoalMenu()
          closeVerdictMenu()
          return
        }
        if (key === settings.boardKey) {
          ev.preventDefault()
          closeBoard()
          return
        }
        if (key === 'escape') {
          ev.preventDefault()
          ev.stopPropagation()
          closeBoard()
          return
        }
        var columnAhead = directionOf(key)
        if (columnAhead === undefined || key === settings.paletteKey) {
          // A stray letter must not reach the page behind the board, and the
          // task window's own key must not open a second overlay over it.
          ev.stopPropagation()
          return
        }
        if (ev.repeat) {
          if (hold.key === key) ev.preventDefault()
          return
        }
        if (!startHold(key, columnAhead)) return
        ev.preventDefault()
        return
      }

      // The reasoning key and the model key belong to the page, not to a window:
      // they act on the conversation on screen, so they keep working with the
      // task window open. They are answered before every other branch, and only
      // when the caret is not in a field — there they are plain letters.
      // Auto-repeat is swallowed for both: a handful of levels and a short model
      // list are not something a held key should stream through.
      //
      // The one window the reasoning key hands over to is the model picker. That
      // window draws the levels and marks the one in effect, so a press that
      // changed the level behind it would leave the mark lying. Rather than
      // swallowing it — a key that does nothing quietly is the worst kind — it
      // is routed into the window below, where it means the same thing it means
      // everywhere else: one level further.
      if (key !== '' && key === settings.effortKey && !isEditable(ev.target) && !MODELPICK.open) {
        ev.preventDefault()
        if (!ev.repeat) cycleEffort()
        return
      }

      // The model key sits beside the reasoning key because it is the same kind
      // of seat with one thing to move: a key of the page rather than of a
      // window, a plain letter inside a field, and no auto-repeat — a held key
      // must not open a second window behind the first.
      //
      // Where the reasoning key walks, this one opens a picker: the list is
      // chosen from, not stepped through, and a window is the only seat that can
      // say which model is in effect before you move. While that window is up
      // the key confirms instead, and the window's own branch above answers it
      // before this one is reached.
      if (key !== '' && key === settings.modelKey && !isEditable(ev.target)) {
        ev.preventDefault()
        if (!ev.repeat) openModelPick()
        return
      }

      if (PALETTE.open) {
        // The window owns the keyboard while it is open, the scroll keys
        // included — wherever the pointer happens to be parked, `f`, `d`, `d`,
        // `f` picks a conversation, so the result of a press never depends on
        // where the mouse was left.
        //
        // The one key it lets through is a scroll key it does not claim itself:
        // move its own up/down keys onto something else (j/k, say) and `d`/`e`
        // go back to reading the conversation behind the window. Everything
        // else stays the window's — a stray letter must not reach the page.
        if (paletteKeyDown(ev, key)) {
          ev.preventDefault()
          return
        }
        if (directionOf(key) === undefined) return
      }

      var focusKey = key !== '' && key === settings.focusKey

      // Enter in the message box, before the editable yield below. Everything
      // reaching here is a bare Enter: a Ctrl/Alt/Meta chord returns at the top
      // (Ctrl/Cmd+Enter is the host's own send accelerator and must stay one),
      // Shift+Enter is already the host's line break, and a composing key
      // returns earlier still.
      if (key === 'enter' && !ev.shiftKey && settings.sendMode !== 'host' && inComposer(ev.target)) {
        // A suggestion menu arbitrates Enter after us: while one is open, the
        // key is how a candidate gets accepted, and taking it here would turn
        // "pick /plan" into a line break. Yield, and the menu keeps its key.
        if (!menuOpen()) {
          // The double-Enter mode: the first press breaks the line like any
          // other, and only a second press inside the window sends. The
          // confirmation is a gesture, not a key to remember.
          if (settings.sendMode === 'double') {
            ev.stopPropagation()
            if (doubleEnterSends(ev)) {
              // The line break the first press inserted stays in the draft. The
              // host trims it on send; if a build ever does not, the cost is one
              // trailing blank line, never a lost character.
              ev.preventDefault()
              sendFromComposer()
              // The rewritten key may re-enter this same handler as a chord and
              // hand the keyboard back there; doing it here as well means the
              // gesture does not depend on that, and a second hand-back is a
              // no-op because each probe retires the one before it.
              if (settings.sendBlurs) {
                clearFocusRequest()
                handBackAfterSend()
              }
            } else breakLine(ev)
            return
          }
          ev.stopPropagation()
          if (settings.sendMode === 'newline') breakLine(ev)
          else ev.preventDefault()
        }
        return
      }

      // The focus key pressed again inside the box it filled: an empty box is a
      // place to pass through, so the key hands the keyboard back instead of
      // typing a Space into a message nobody started. Asked before the editable
      // yield below, which is otherwise where a key aimed at the box dies. A
      // repeat is not a second press, and holding the key must not toggle the
      // box in and out.
      if (focusKey && !ev.repeat && leaveEmptyComposer()) {
        // A traced line, because this is the one key path that makes a Space
        // disappear and moves the caret out of the box: if something odd follows
        // a Space, the console should say whether it was this.
        if (state.debug) console.log('[dsh-vim] focus key: handed the empty box back')
        ev.preventDefault()
        return
      }

      if (isEditable(ev.target)) {
        // Typing is the user's own focus request: the host may hand the caret
        // back while they work, and that must not read as stealing it.
        noteFocusRequest()
        return
      }

      // Tabbing is how the keyboard reaches a field; the focus it lands on is
      // the user's doing, however long it takes to arrive.
      if (key === 'tab') noteFocusRequest()

      // The board is a page key: it opens the second window and nothing else.
      // Asked after the task window's key so that a store which somehow holds
      // the same letter on both seats keeps opening the window it always did —
      // `repairKeys` is what stops such a store from existing.
      if (key && key === settings.boardKey) {
        if (toggleBoard()) ev.preventDefault()
        return
      }

      if (key && key === settings.paletteKey) {
        if (openPalette()) ev.preventDefault()
        return
      }

      // The note key opens the board on the conversation on screen with its
      // note field already waiting. It is asked after both windows so that
      // whichever is up keeps the keyboard, and never on auto-repeat — a held
      // key is not a second thought.
      if (key && key === settings.noteKey) {
        if (!ev.repeat && openNote()) ev.preventDefault()
        return
      }

      // The pin key is the way onto the board from the conversation itself. It
      // is asked after both windows, so whichever is up keeps the keyboard —
      // inside the task window it acts on the selected row instead.
      if (key && key === settings.pinKey) {
        if (!ev.repeat && pinToBoard()) ev.preventDefault()
        return
      }

      if (focusKey) {
        // A bare Space belongs to a focused control first: that is how a button
        // is pressed from the keyboard, and the plugin must not take it away.
        if (isActivating(ev.target)) return
        // A held key is not a second press: re-filling the box on every repeat
        // would fight the press that just left it, and the page must not start
        // scrolling under the key either. Repeats aimed at a box that kept its
        // focus are answered above, as characters, so nothing types differently.
        if (ev.repeat) {
          ev.preventDefault()
          return
        }
        if (focusComposer()) {
          if (state.debug) console.log('[dsh-vim] focus key: caret put in the box')
          ev.preventDefault()
        }
        return
      }

      var dir = directionOf(key)
      if (dir === undefined) return
      if (ev.repeat) {
        if (hold.key === key) ev.preventDefault()
        return
      }
      if (!startHold(key, dir)) return
      ev.preventDefault()
      if (state.debug) console.log('[dsh-vim]', key, dir * settings.step, anim.el)
    }

    /** Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. */
    function onKeyUp() {
      stopHold()
    }

    /**
     * Escape leaves a focused composer, so the scroll keys come back.
     *
     * The scroll keys are withheld from every editable element, which is right
     * while typing but leaves the whole plugin dead whenever the composer holds
     * focus. The shell's own Escape handling closes popups and arbitrates a run
     * stop, but never gives focus back, so the key is otherwise unclaimed.
     *
     * A turn in flight is the exception, and the important one. The shell stops
     * a running turn on Escape, and it does so without marking the event
     * handled, so the yield above cannot see it. Blurring here would mean one
     * keystroke destroys work the user never asked to stop. So while the
     * conversation on screen is running, Escape belongs to the shell and this
     * handler does nothing at all. That costs the user nothing in practice:
     * arriving via the task window already leaves focus out of the composer, so
     * Escape is not how they get unstuck.
     *
     * Listens in the bubble phase, after the composer has had its turn, and
     * yields whenever the shell marked the event handled. It blurs without
     * preventing anything, so a host gesture on the same Escape still runs.
     * @param {Event} ev - the keydown, after the shell's own handlers.
     */
    function onEscapeBlur(ev) {
      if (!settings.escapeBlurs) return
      if (ev.key !== 'Escape' || ev.defaultPrevented) return
      if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return
      // Either window already answered this Escape in the capture phase, and
      // blurring behind an open window would move the caret for no reason.
      if (PALETTE.open || MODELPICK.open || BOARD.open) return
      var active = document.activeElement
      if (!isEditable(active)) return
      if (currentSessionRunning()) return
      if (typeof active.blur === 'function') active.blur()
    }

    /**
     * Remember where the pointer is.
     *
     * Recording a position is all this does: nothing scrolls until a scroll key
     * is pressed, so the listener costs a pointer session nothing it was not
     * already paying. A hold is the one thing that reacts here — moving onto
     * another pane mid-repeat hands the rest of the burst over, so a burst never
     * keeps scrolling a pane the pointer has left. A failed re-pick (the pointer
     * came to rest where nothing can move) leaves the current target alone; the
     * burst is not cut short by a stray crossing.
     * @param {PointerEvent} ev - pointermove event.
     */
    function onPointerMove(ev) {
      var x = Number(ev.clientX)
      var y = Number(ev.clientY)
      if (!isFinite(x) || !isFinite(y)) return
      pointer.x = x
      pointer.y = y
      pointer.seen = true
      if (hold.dir) {
        var el = resolveTarget(pickScroller(), hold.dir)
        if (el) hold.el = el
      }
    }

    /**
     * Forget the remembered pointer, so the focus and centre rules decide again.
     *
     * Called when the window loses focus: the browser delivers no moves while
     * another window is in front, so a point kept across a blur can be stale,
     * and acting on it would scroll a pane the user is no longer pointing at.
     * The next move restores the pointer rule on its own.
     */
    function forgetPointer() {
      pointer.seen = false
    }

    /** The user took over with the wheel or a touch: abandon our animation. */
    function onUserScroll() {
      // A reading gesture before the page settled outranks an entry anchor the
      // reader never asked for.
      cancelEntry()
      if (!anim.el) return
      stopAnim()
    }

    /**
     * Losing the window or the tab must not leave a hold or a stale pointer
     * behind. The task window is deliberately not part of this: it stays up
     * until Escape or a switch takes it away, so reading the page behind it,
     * alt-tabbing away and coming back all leave it where it was.
     *
     * The user's own request for the keyboard is dropped as well: it was made
     * for the page the user was on before they left, and a request kept across
     * a trip to another window would licence a focus nobody asked for now. What
     * the return itself gets is `noteFocusReturn` at the level of the page.
     */
    function onFocusLoss() {
      stopHold()
      forgetPointer()
      clearFocusRequest()
    }

    // ---------------------------------------------------------------------
    // task window
    // ---------------------------------------------------------------------


    /**
     * A press says where the keyboard should be: inside a text field it asks
     * for that field, anywhere else it cancels a request the user made a moment
     * ago — and, when a window is up, it also says the window is no longer what
     * they are looking at.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function onPointerDown(ev) {
      if (isEditable(ev && ev.target)) noteFocusRequest()
      else clearFocusRequest()
      dismissOutsidePress(ev)
    }

    /**
     * Put an open window away when the press landed beside it.
     *
     * This is the way out that needs no key: a window you opened to look at
     * something else in, and then clicked something else, has told you what it
     * was for. The press itself is not touched — it still reaches the page, which
     * is what a press on the backdrop has always done — so one click both looks
     * at whatever was underneath and clears the window off the screen.
     *
     * Only the main button counts. A right-click is asking for a menu, and a
     * window that vanished under it would lose the selection the menu was about
     * to act on.
     *
     * Both windows can be on the page at once, so the press has to miss all of
     * them before any of them goes: a press on the card of one is not a press
     * outside the other.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function dismissOutsidePress(ev) {
      if (!ev || (ev.button !== undefined && ev.button !== 0)) return
      var target = ev.target
      if (!target) return
      if (PALETTE.open && !pressMissesWindow(PALETTE.host, target)) return
      if (MODELPICK.open && !pressMissesWindow(MODELPICK.host, target)) return
      if (BOARD.open && !pressMissesWindow(BOARD.host, target)) return
      if (PALETTE.open) closePalette()
      if (MODELPICK.open) closeModelPick()
      if (BOARD.open && BOARD.mode !== 'page') closeBoard()
    }

    /**
     * Whether a press landed outside an open window's card.
     *
     * The card is the whole of the window. The backdrop is `pointer-events: none`
     * so the page behind keeps answering presses, which means a press beside the
     * card arrives here with the page's own element as its target — and with the
     * backdrop itself only in a synthetic event. Both are outside.
     *
     * A host we cannot ask stays open: a wrong guess here throws away a window
     * the user is still reading, which is worse than making them press Escape.
     * @param {Element|null} host - the backdrop element, or null when closed.
     * @param {EventTarget|null} target - what the press landed on.
     * @returns {boolean} true when the window is up and the press missed its card.
     */
    function pressMissesWindow(host, target) {
      if (!host || !target) return false
      if (target === host) return true
      if (typeof host.contains !== 'function') return false
      return !host.contains(target)
    }

    /**
     * Switch the main view to one conversation.
     * @param {string} id - session id.
     * @param {object} [opts] - `{ anchor: true }` when the board is the way in.
     *   Only that arrival starts at the last prompt the reader wrote; every
     *   other way in (the task window, the sidebar, a rebuild of this client)
     *   keeps the reading position the shell chose.
     * @returns {boolean} whether the navigator took it.
     */
    function activateSession(id, opts) {
      var services = taskServices()
      closePalette()
      closeModelPick()
      // The floating board must get out of the way; the page does not — the
      // shell switches back to the conversation, which unmounts it.
      if (BOARD.mode !== 'page') closeBoard()
      if (!services || !id) return false
      if (opts && opts.anchor) armEntry(id)
      try {
        services.nav.openSession(id)
      } catch (error) {
        clearEntryArm()
        console.error('[dsh-vim] could not open session', id, error)
        return false
      }
      if (state.debug) console.log('[dsh-vim] opened session', id)
      return true
    }

    /** Whether this process has contributed the board page and its sidebar entry. */
    var boardPageInstalled = false

    /**
     * The board the plugin opens when a page is not available.
     *
     * A host with the layout panel gets the sidebar page; one without it keeps
     * the floating board rather than losing the feature. The page is the one
     * the reader asked for, so it is tried first.
     * @returns {boolean} whether something was opened.
     */
    function toggleBoard() {
      var layout = serviceOf(taskCtx, 'layout')
      if (layout && typeof layout.selectPanel === 'function' && layout.panelInfo
        && typeof layout.panelInfo.getSnapshot === 'function') {
        var info = layout.panelInfo.getSnapshot()
        if (info && info.activePanelId === BOARD_PANEL_ID) {
          layout.selectPanel(null)
          return true
        }
      }
      return showBoard()
    }

    function showBoard() {
      var layout = serviceOf(taskCtx, 'layout')
      if (layout && typeof layout.selectPanel === 'function') {
        closePalette()
        closeModelPick()
        try {
          layout.selectPanel(BOARD_PANEL_ID)
        } catch (error) {
          console.warn('[dsh-vim] could not open the board panel', error)
          return false
        }
        return true
      }
      return openBoard()
    }

    /**
     * Open the overview page: the board's own button, and the sidebar's row.
     *
     * The page is only a page when the host has the layout panel; a host
     * without one never draws the button, so a door that opens onto nothing is
     * never offered.
     * @returns {boolean} whether the page was asked for.
     */
    function showOverview() {
      var layout = serviceOf(taskCtx, 'layout')
      if (!layout || typeof layout.selectPanel !== 'function') return false
      closePalette()
      closeModelPick()
      try {
        layout.selectPanel(OVERVIEW_PANEL_ID)
      } catch (error) {
        console.warn('[dsh-vim] could not open the overview panel', error)
        return false
      }
      return true
    }

    /**
     * Whether one right press landed inside the words the reader selected.
     *
     * A selection is a claim on the next press: the browser answers it with
     * Copy, and the shell's own text gestures live on it. The rects of the
     * selection are the browser's own rule for where it ends.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {boolean} whether the point sits inside the selection.
     */
    function pointInSelection(x, y) {
      if (typeof document.getSelection !== 'function') return false
      var selection
      try {
        selection = document.getSelection()
      } catch (error) {
        return false
      }
      if (!selection || !selection.rangeCount || selection.isCollapsed) return false
      for (var i = 0; i < selection.rangeCount; i++) {
        var range = selection.getRangeAt(i)
        if (!range || typeof range.getClientRects !== 'function') continue
        var rects
        try {
          rects = range.getClientRects()
        } catch (error) {
          continue
        }
        for (var r = 0; r < rects.length; r++) {
          if (x >= rects[r].left && x <= rects[r].right
            && y >= rects[r].top && y <= rects[r].bottom) return true
        }
      }
      return false
    }

    /**
     * The way back from a conversation: a right press on its page.
     *
     * The conversation's own right button is unemployed — the shell keeps its
     * context menus in the sidebar, and the transcript answers a right press
     * with nothing at all — so the one button with no meaning becomes the
     * shortest way back to the board the conversation was entered from. The
     * press is read from the conversation's own body (the shell marks it, and
     * the sidebar, other pages and every floating window do not carry the
     * mark), and three presses keep the meaning they already have: one some
     * other handler answered first, one in the box being typed into, and one
     * inside a text selection, which is a copy.
     * @param {object} ev - the contextmenu event.
     * @returns {void}
     */
    function onContextMenu(ev) {
      var target = ev && ev.target
      if (!target || target.nodeType !== 1) return
      if (ev.defaultPrevented) return
      if (typeof target.closest !== 'function') return
      if (!target.closest('[data-conversation-content]')) return
      if (isEditable(target)) return
      if (pointInSelection(Number(ev.clientX) || 0, Number(ev.clientY) || 0)) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      showBoard()
    }

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
        showBoard()
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
