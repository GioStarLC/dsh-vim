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
     * The board: the canvas, and the only surface here driven by the pointer.
     *
     * Kept apart from `PALETTE` on purpose. The two windows answer different
     * questions — the task window is a triage list read top to bottom, the board
     * is a map of where the work lives — and they never share the page, so
     * nothing here is a field the task window also has: no selection index, no
     * cursor, no rows-in-order. `nodes` is the conversation cards of the last
     * repaint, which is what a test reads to know what is on screen.
     */
    var BOARD = {
      open: false,
      /**
       * How the board is mounted: 'overlay' for the floating window a host
       * without the layout panel falls back to, 'page' for the sidebar page.
       * The builders are the same; what changes is who owns the keyboard and
       * which keyboard gestures make sense.
       */
      mode: 'overlay',
      /** The card whose note is being typed into, or ''. */
      noteEditing: '',
      /** That card's field, rebuilt with every repaint of it. */
      noteEditor: null,
      /** The loose card being typed into, or '', and its field. */
      cardEditing: '',
      /** Which field of that card is up: 'title' or 'body'. */
      cardField: '',
      cardEditor: null,
      /**
       * The idea focus sheet: the card it is showing, or '' while it is a new
       * thought that has not landed yet.
       *
       * One sheet serves both reading an existing card and writing a new one.
       * The difference is only where the words go when it closes: an existing
       * card is written through on every keystroke, while a new one is held as
       * a draft and becomes a card at `ideaFocusAt` only when the sheet closes
       * with something in it.
       */
      ideaFocus: '',
      ideaFocusHost: null,
      ideaFocusSheet: null,
      ideaFocusTitle: null,
      ideaFocusBody: null,
      ideaFocusDone: null,
      /** Where a brand-new thought lands, in canvas coordinates. */
      ideaFocusAt: null,
      /** The frame that flies a new sheet out from the double-click. */
      ideaFocusRaf: 0,
      /**
       * A press settled the open field's words without painting them. The
       * paint is owed by whoever ends that press: it is what lets a press
       * keep the elements it aims at alive for the click that follows it.
       */
      paintOwed: false,
      /** The conversation whose name is being edited from its card, and its field. */
      renamingCard: '',
      renameCardInput: null,
      host: null,
      panel: null,
      /** The scrolling canvas, the sized paper, and the stage drawn on it. */
      body: null,
      sizer: null,
      stage: null,
      /** The magnification this board is drawn at. */
      zoom: 1,
      /** The last measured canvas extent, in unzoomed pixels. */
      extent: { width: 720, height: 520 },
      /** The zoom readout in the header. */
      zoomLabel: null,
      /**
       * Whether the canvas is scaled to the window rather than by hand.
       *
       * A fit is a standing request, not a one-off: while it holds, a window
       * that changes size re-fits instead of leaving the board at a scale its
       * old window chose. Any hand on the zoom takes the request back.
       */
      fits: false,
      /** The SVG layer the link curves live on, when the host can draw it. */
      linkLayer: null,
      /** The card currently gliding to a snapped place, or ''. */
      glide: '',
      /** Whether a tidy is flying its cards home, so a repaint has to wait. */
      tidy: false,
      /** The headline's count readout, and its "only what is marked" toggle. */
      count: null,
      starFilter: null,
      /** The two history buttons, so a step can say whether it is reachable. */
      undoButton: null,
      redoButton: null,
      /** The blocks of this repaint, in draw order, and what the inbox holds. */
      blocks: [],
      /** The colour seat each panel took on this paint: block id -> seat. */
      slots: Object.create(null),
      /** The seats written down, read once per paint: a hue is asked for often. */
      seats: null,
      /** What has been said about each conversation, read once per paint. */
      verdicts: null,
      inbox: [],
      /** Every conversation drawn on this repaint, block by block. */
      rows: [],
      /** The conversation card elements of this repaint, in draw order. */
      nodes: [],
      /** The loose card elements of this repaint, by card id, for measuring lines. */
      looseNodes: Object.create(null),
      /** The goal the pointer is standing in while a card is carried, or null. */
      dropGoal: null,
      /** The finished strip the pointer is over while a session is carried. */
      doneDrop: null,
      /** The drop bands drawn this paint, so a carry can put them on screen. */
      dropZones: [],
      /** The put-away row whose full body is showing, or ''. */
      rowOpen: '',
      /**
       * The card the reader last touched, and the stacking height it was given.
       *
       * Cards overlap as soon as one is dragged out of its goal, and a pile is
       * only readable if the one being worked on is the one on top: the press
       * raises the card, and the repaint remembers which card that was.
       */
      front: '',
      zTop: 3,
      /** The goal whose name is being edited from its heading, and its field. */
      renamingBlock: '',
      renameBlockInput: null,
      /** The goal whose purpose is being written, and the field it is written in. */
      intentBlock: '',
      intentInput: null,
      /**
       * The goal whose new-conversation sheet is open, and the sheet itself.
       *
       * The sheet is the button's other half: a press asks for a title and a
       * body before anything is written to the host, while a card dropped on
       * the same button carries its own words and needs no question.
       */
      newSessionGoal: '',
      newSessionHost: null,
      newSessionTitle: null,
      newSessionBody: null,
      /** The model the sheet's row was set to, and the line that shows it. */
      newSessionModel: null,
      newSessionModelText: null,
      newSessionConfirm: null,
      newSessionError: null,
      /** One host round trip at a time: two presses must not make two conversations. */
      newSessionBusy: false,
      /** The thought whose ⋯ menu is open, or ''. */
      ideaMenu: '',
      /** The goal whose colour wheel is open, or ''. */
      seatMenu: '',
      /** The card whose state menu is open, or ''. */
      verdictMenu: '',
      /** The goal whose ⋯ menu is open, or ''. */
      goalMenu: '',
      /** The conversation whose ⋯ menu is open, or ''. */
      sessionMenu: '',
      /** The ⋯ that opened it, so closing can take the mark's own state down. */
      sessionMenuMark: null,
      /** The conversations whose finished thoughts are unfolded, one by one. */
      doneExpanded: Object.create(null),
      /**
       * The panels whose quiet strip is unfolded, and the conversations inside
       * one whose thoughts are showing.
       *
       * The strip is a way of reading a panel rather than a fact about the work,
       * so it is remembered for this visit only: a board that reopened with every
       * strip unfolded would be the panel the strip exists to shrink.
       */
      quietOpen: Object.create(null),
      quietCards: Object.create(null),
      /** The panels whose finished strip is open, for this visit only. */
      doneOpen: Object.create(null),
      /** The session column being sorted, while a horizontal drag is sorting one. */
      reorder: null,
      /**
       * The goals this visit started from the toolbar.
       *
       * A goal with no conversations and no purpose is a place nobody is
       * working in, and it goes on the next paint. That rule must not eat the
       * goal the reader is in the middle of naming, so one the toolbar made is
       * held here until the board does.
       */
      drafts: Object.create(null),
      /**
       * The names the reader typed that the shell has not answered yet.
       *
       * A card whose name was just changed would otherwise go back to the old
       * one for as long as the list takes to arrive - which reads as a rename
       * that did not work. This is the reader's word standing in for the feed's.
       * session id -> `{title, at}`.
       */
      titles: Object.create(null),
      /** The field a failed rename is put back into, so the words are not lost. */
      renameCardDraft: null,
      /** The one timer that lets the stand-in words go. */
      titleTimer: 0,
      /**
       * The conversations whose completion beat has already been played.
       *
       * A repaint rebuilds every card, so an animation hung on the element would
       * play again on every drag and every star. The beat is once per completion,
       * and this is what makes it once.
       */
      freshed: Object.create(null),
      /**
       * The cards sharing a name with another card on this paint, and where each
       * one stands in that group: id -> {at, of}.
       *
       * Recomputed by every repaint from what is about to be drawn, because the
       * question is about the board in front of the reader rather than about the
       * catalogue: a namesake that is not on the board cannot be mistaken for
       * the card being read.
       */
      dupes: Object.create(null),
      /**
       * The conversations whose branch mark is waiting on the host, by id.
       *
       * A fork is a host round trip, and the mark answered every press in
       * between: two presses for one intention made two children, which the
       * board then drew as two cards with one name. This is the seat that says
       * "already being made".
       */
      forking: Object.create(null),
      /** The line that says the paper will not take the card, while that is true. */
      noDropTip: null,

      /** The link lines drawn for this paint, so a redraw can take them back. */
      lines: [],
      /** Where each conversation lives, read once per repaint. */
      folders: Object.create(null),
      /** The gesture in progress, or null: what is being moved and where to. */
      drag: null,
      /** Set when a drag just ended, so the click it would have been is dropped. */
      dragged: false,
      /** Whether the canvas is showing only what is marked. */
      onlyStarred: false,
      /**
       * Whether the finished-cards list is open under its chip, and the chip's
       * own count readout.
       *
       * The chip is drawn once, with the heading, and the board is repainted far
       * more often than it is rebuilt - so the count lives here and every paint
       * writes it, rather than a new chip being built per paint.
       */
      doneBinOpen: false,
      doneBinCount: null,
      /**
       * The conversation the open list is showing only, or '' for all of them.
       *
       * The bin is one place read two ways: from the heading, as everything that
       * has been put away, and from a conversation's own mark, as what was handed
       * to that conversation. Same rows, one filter.
       */
      doneBinFilter: '',
      /**
       * The live clocks of this repaint: { chip, label, since } per running
       * card. Kept the way the task window keeps `PALETTE.clocks`, so the
       * board's minute hand moves in place rather than by a repaint.
       */
      clocks: [],
      /** The timer behind those clocks, or 0 while nothing on screen runs. */
      clockTimer: 0,
      /** The day whose summary is waiting to be read, or '' when none is. */
      sealPending: '',
      /** The summary itself, while it is on screen. */
      sealNode: null,
      /** What the history panel is searching for, or '' for the plain list. */
      historyQuery: '',
      /** The search field above the days, so a result can empty it. */
      historySearch: null,
      /**
       * The status fingerprint of this repaint: one word per card, in draw
       * order. The status feed can tick without anything on screen changing
       * shape; this is what tells a tick worth a repaint from one that is not.
       */
      statuses: '',
      unsubscribes: [],
    }

    /**
     * The canvas's own chrome.
     *
     * A sheet you pan, not a list you read: everything is sized so a title is
     * the thing the eye lands on, and the metadata under it stays legible
     * without leaning in. One base size on the mount, everything inside in em.
     */
    /**
     * The paper a note is made of, wherever a note is drawn.
     *
     * The sheet on the canvas and the line in the tray differ in shape and in
     * nothing else, so the material lives here once: both read these four
     * properties, and neither can drift from the other while the shapes stay
     * their own. Layout is the caller's and is deliberately not in here.
     */
    /** A newline, spelled once so no editor or tool can double its escape. */
    var CHAR_NEWLINE = String.fromCharCode(10)

    /**
     * The workspace a new conversation started from one goal would join.
     *
     * A workspace panel is its own answer. A goal the reader made is a label
     * over work that already lives somewhere, so the first conversation filed
     * here names the workspace it came from; a goal with nothing in it falls
     * back to the conversation on screen, then to the first workspace the host
     * still lists. The answer is only a starting point — the card is placed
     * under the goal the reader pressed, whichever workspace made it.
     * @param {object} block - the goal whose plus was pressed.
     * @returns {string} a workspace id, or '' when this host has none.
     */
    function workspaceForGoal(block) {
      if (!block) return ''
      if (block.kind === 'workspace') return String(block.key || '')
      var folders = folderIndex()
      for (var i = 0; i < block.rows.length; i++) {
        var home = folders[block.rows[i].id]
        if (home && home.id) return home.id
      }
      var current = currentSession()
      if (current && folders[current.id] && folders[current.id].id) return folders[current.id].id
      var services = taskServices()
      var snapshot = null
      try {
        snapshot = services && services.workspaces ? services.workspaces.getSnapshot() : null
      } catch (error) {
        snapshot = null
      }
      var items = (snapshot && snapshot.items) || []
      for (var w = 0; w < items.length; w++) {
        if (items[w] && items[w].workspaceId) return String(items[w].workspaceId)
      }
      return ''
    }

    /**
     * One goal of the last paint, by the key a card is filed under.
     * @param {string} key - block id.
     * @returns {object|null} the block, or null.
     */
    function boardBlockByKey(key) {
      for (var i = 0; i < BOARD.blocks.length; i++) {
        if (BOARD.blocks[i].key === key) return BOARD.blocks[i]
      }
      return null
    }

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

    /** The page last handed to the store, so an unchanged one is not rewritten. */
    var MOMENT_BODY = ''

    /** The bytes that write left in the store, or empty when it did not land. */
    var MOMENT_RAW = ''

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

    /** The local day a moment belongs to, as `YYYY-MM-DD`. */
    function dayOf(ms) {
      var when = new Date(Number(ms) || Date.now())
      var month = when.getMonth() + 1
      var date = when.getDate()
      return when.getFullYear() + '-' + (month < 10 ? '0' : '') + month
        + '-' + (date < 10 ? '0' : '') + date
    }

    /** How many local days lie between two `YYYY-MM-DD` days. */
    function daysBetween(from, to) {
      var start = Date.parse(from + 'T00:00:00')
      var end = Date.parse(to + 'T00:00:00')
      if (!isFinite(start) || !isFinite(end)) return 0
      // Rounded rather than divided: a day either side of a clock change is not
      // exactly 86,400,000 milliseconds long.
      return Math.max(0, Math.round((end - start) / DAY_MS))
    }

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
        if (BOARD.open) renderBoard()
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
          if (BOARD.open) renderBoard()
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
        if (BOARD.open) renderBoard()
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
          if (BOARD.open) renderBoard()
          showToast(paletteText('boardHistoryImported'))
          return true
        })
      })
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
     * Start typing the line on one card.
     *
     * The field is drawn by the next repaint, which is why the focus is asked
     * for there rather than here: the node does not exist yet.
     * @param {string} id - session id.
     * @returns {void}
     */
    function beginBoardNote(id) {
      BOARD.noteEditing = id
      renderBoard()
    }

    /**
     * Keep what the open field says, and close it.
     *
     * An empty line is how a note is taken away; there is no second gesture to
     * remember. Called by a blur as well as by Enter, so a press elsewhere keeps
     * the sentence instead of throwing it away.
     * @returns {boolean} whether a field was open.
     */
    function commitBoardNote() {
      if (!BOARD.noteEditing) return false
      var editor = BOARD.noteEditor
      var id = BOARD.noteEditing
      BOARD.noteEditing = ''
      BOARD.noteEditor = null
      NOTE_STORE.set(id, editor ? editor.value : '')
      renderBoard()
      return true
    }

    /**
     * Throw the open field away, leaving the card as it was.
     * @returns {boolean} whether a field was open.
     */
    function cancelBoardNote() {
      if (!BOARD.noteEditing) return false
      BOARD.noteEditing = ''
      BOARD.noteEditor = null
      renderBoard()
      return true
    }

    /**
     * The note key: open the board on the conversation on screen, with its
     * field waiting.
     *
     * The key names a conversation rather than a place, so it works from the
     * conversation, from the task window and from the board itself.
     * @returns {boolean} whether a board with a field is up.
     */
    function openNote() {
      var current = currentSession()
      if (!current || !current.id) {
        showToast(paletteText('noteNoSession'))
        return false
      }
      BOARD.noteEditing = current.id
      if (!showBoard()) {
        BOARD.noteEditing = ''
        return false
      }
      // A board that is already up is one repaint behind; a page that mounted
      // just now already drew the field. Either way, draw it here and let the
      // repaint put the caret in the field it builds.
      if (BOARD.open) renderBoard()
      return true
    }

    // ---------------------------------------------------------------------
    // board
    // ---------------------------------------------------------------------

    /**
     * Put one conversation on the board by hand.
     *
     * The board is a day's view: a conversation it has not seen move since
     * midnight is gone from it, and until now the only way to keep one was the
     * ★ on the card itself - which meant the card had to still be there. This
     * is the way in from the conversation: one press, and the mark that
     * outlives the day's boundary is set.
     *
     * A conversation taken off the board is taken off until it moves again.
     * Asking for it by hand is a later decision than that one, so the deletion
     * is lifted as well.
     * @param {string} [id] - the conversation; the one on screen when omitted.
     * @returns {boolean} whether a conversation was found to put there.
     */
    function pinToBoard(id) {
      var target = id
      if (!target) {
        var current = currentSession()
        target = current && current.id ? current.id : ''
      }
      if (!target) {
        showToast(paletteText('pinNoSession'))
        return false
      }
      var already = BOARD_STORE.isStarred(target)
      BOARD_STORE.unmute(target)
      if (!already) BOARD_STORE.toggleStar(target)
      if (BOARD.open && !BOARD.noteEditing) renderBoard()
      showToast(paletteText(already ? 'pinAlready' : 'pinDone'))
      return true
    }

    /**
     * Midnight today, in the reader's own zone.
     *
     * The inbox answers "what has been moving today", and that boundary is the
     * reader's clock rather than UTC: a conversation touched at 23:40 belongs to
     * the evening it was touched in.
     * @returns {number} epoch milliseconds of the local day's first instant.
     */
    function startOfToday() {
      var midnight = new Date(Date.now())
      midnight.setHours(0, 0, 0, 0)
      return midnight.getTime()
    }

    /** The one sessions-service `fork` this process wrapped, so a rebuild does not wrap twice. */
    var FORK_WATCH = null

    /**
     * The canvas as it is drawn: one block per workspace in play, the
     * conversations under it, and an inbox for what no workspace accounts for.
     *
     * A workspace is in play when one of its conversations moved today or is
     * marked ★ — the mark is the one thing that keeps a conversation past the
     * day it last moved. The pool is asked rather than the workspace registry
     * for that: the registry carries no activity clock, so "today" is a fact
     * about the conversations, not about the workspace.
     *
     * The pool is the task window's own, so the two windows agree about what a
     * conversation is: no subagent children, no blank placeholders, no archived
     * ones.
     * @param {Array<object>} pool - the catalogue, newest first.
     * @returns {Array<object>} blocks in draw order: workspaces newest first, the inbox last.
     */
    /**
     * One goal, by the id a card is filed under.
     *
     * The two kinds a placement can name are the kinds the canvas already has:
     * a workspace, and the inbox. Anything else is a record this build cannot
     * honour, and the card falls back to the goal its workspace implies.
     * @param {string} key - block id.
     * @returns {{key: string, label: string, path: string, kind: string}|null}
     */
    function goalByKey(key) {
      if (!key) return null
      if (key === BOARD_INBOX) {
        return { key: key, label: paletteText('boardInbox'), path: '', kind: 'inbox' }
      }
      var known = folderById(key)
      if (known) return { key: key, label: known.label, path: known.path, kind: 'workspace' }
      // A goal the board made itself, for a card the reader pulled out onto the
      // paper: it has no workspace behind it, and its name is the whole of it.
      var named = BOARD_STORE.blockLabel(key)
      if (named || BOARD_STORE.blocks()[key]) {
        return { key: key, label: named || paletteText('boardNewGoal'), path: '', kind: 'user' }
      }
      return null
    }

    /**
     * The name a goal cut from a card starts with: the one it came from, plus
     * the first number that is not taken.
     *
     * Pulling a card out of a goal is asking for it to stand on its own, so the
     * goal it gets is named after the one it left - `dsh-vim 2`, `dsh-vim 3` -
     * which says where it came from without the reader having to name it.
     * @param {string} label - the goal the card came from.
     * @returns {string} a name that no goal on this board is using.
     */
    function nextGoalName(label) {
      var base = String(label || '').trim() || paletteText('boardNewGoal')
      var names = BOARD_STORE.blockLabels()
      var used = 1
      for (var key in names) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) continue
        var text = String(names[key] || '')
        if (text === base || text.indexOf(base + ' ') === 0) used = used + 1
      }
      return base + ' ' + (used + 1)
    }

    /**
     * What the reader has said about a conversation, if it still applies.
     *
     * The word is tied to the turn it was said about: the stamp it was written
     * against must still be the conversation's own, or the card has moved on and
     * the word is about older work.
     * @param {object} summary - the conversation.
     * @returns {object|null} `{key, at}`, or null when nothing applies.
     */
    function cardVerdictOf(summary) {
      if (!summary) return null
      var held = (BOARD.verdicts || BOARD_STORE.verdicts())[summary.id]
      var at = Number(summary.updatedAt) || 0
      if (!held || !at || held.at !== at) return null
      return held
    }

    /**
     * Write down that a turn ended, before the shell forgets it did.
     *
     * A completion is the shell's to announce and the shell's to drop the moment
     * the reader opens the conversation. The board keeps the fact itself so the
     * card can still say something afterwards - and hangs it on the turn's own
     * stamp, so a conversation that moves again starts from no word at all.
     * @param {object} row - the conversation.
     * @returns {void}
     */
    function noteCardFinished(row) {
      var at = Number(row && row.updatedAt) || 0
      if (!at) return
      var held = (BOARD.verdicts || BOARD_STORE.verdicts())[row.id]
      if (held && held.at === at) return
      BOARD_STORE.setVerdict(row.id, 'finished', at)
      BOARD.verdicts = BOARD_STORE.verdicts()
    }

    /**
     * Which goal one conversation is drawn in.
     *
     * The one the reader moved it to when there is one, else the one its
     * workspace implies, else the inbox. The board paints by this, and the
     * overview names goals by it, so the two never disagree about where a
     * conversation lives.
     * @param {object} row - the conversation.
     * @param {object} folders - conversation id -> workspace, from folderIndex.
     * @returns {{key: string, label: string, path: string, kind: string}} its goal.
     */
    function goalOfRow(row, folders) {
      var movedTo = BOARD_STORE.placementOf(row.id)
      var goal = movedTo ? goalByKey(movedTo) : null
      if (goal) return goal
      var folder = folders ? folders[row.id] : null
      if (folder && folder.id) {
        return { key: folder.id, label: folder.label, path: folder.path, kind: 'workspace' }
      }
      return { key: BOARD_INBOX, label: paletteText('boardInbox'), path: '', kind: 'inbox' }
    }

    function boardBlocks(pool) {
      var since = startOfToday()
      // Read before anything is written: `noteCardFinished` below must compare
      // against what the document already holds, not against last paint's copy.
      BOARD.verdicts = BOARD_STORE.verdicts()
      var folders = folderIndex()
      var groups = Object.create(null)
      var blocks = []
      var inbox = null
      for (var i = 0; i < pool.length; i++) {
        var row = pool[i]
        // Deleted is deleted until it moves again: the mark is held against the
        // moment it was last touched, so a conversation that gets a new message
        // afterwards is back in play and belongs here again.
        if (BOARD_STORE.isMuted(row.id, row.updatedAt)) continue
        var marked = BOARD_STORE.isStarred(row.id)
        if (BOARD.onlyStarred && !marked) continue
        // A conversation the reader has not touched today is off the board -
        // unless it was carried in from the last page, which is the one thing
        // that outlives the day's boundary without being marked.
        if (!marked && !CARRY.from(row.id) && (Number(row.updatedAt) || 0) < since) continue
        var goal = goalOfRow(row, folders)
        var block = groups[goal.key]
        if (!block) {
          // The name the reader gave this goal, else the one it was cut from: a
          // panel starts out meaning "this workspace" and usually becomes
          // something the reader is working toward.
          block = groups[goal.key] = {
            key: goal.key,
            label: BOARD_STORE.blockLabel(goal.key) || goal.label,
            intent: BOARD_STORE.intentOf(goal.key) || '',
            path: goal.path,
            kind: goal.kind,
            rows: [],
          }
          // The inbox is drawn last, so it is not pushed here: the canvas reads
          // workspaces first and the place for everything else after them.
          if (goal.kind === 'inbox') inbox = block
          else blocks.push(block)
        }
        block.rows.push(row)
      }
      // Every goal is drawn in the order the reader knows it by. The new arrivals
      // are appended now, once, so the panel never re-sorts itself later: a
      // conversation that starts running keeps the place it already had.
      for (var b = 0; b < blocks.length; b++) {
        var rowsHere = blocks[b].rows
        if (!rowsHere.length) continue
        var idsHere = []
        for (var r = 0; r < rowsHere.length; r++) idsHere.push(rowsHere[r].id)
        var orderHere = BOARD_STORE.rememberOrder(blocks[b].key, idsHere)
        var rank = Object.create(null)
        for (var o = 0; o < orderHere.length; o++) rank[orderHere[o]] = o
        blocks[b].rows = rowsHere.slice().sort(function (left, right) {
          var a = rank[left.id] === undefined ? Number.MAX_SAFE_INTEGER : rank[left.id]
          var c = rank[right.id] === undefined ? Number.MAX_SAFE_INTEGER : rank[right.id]
          return a - c
        })
      }
      var places = BOARD_STORE.placements()
      var names = BOARD_STORE.blockLabels()
      var intents = BOARD_STORE.intents()
      var keep = []
      var movedId
      for (movedId in places) {
        if (!Object.prototype.hasOwnProperty.call(places, movedId)) continue
        keep.push(places[movedId])
      }
      // A goal stays for one of two reasons: a conversation was filed here, or
      // the reader said what it is for. A name is a label, not a reason - an
      // empty panel that was only renamed is a place with nothing happening in
      // it, and it does not get to hold a spot on the canvas.
      var stated
      for (stated in intents) {
        if (!Object.prototype.hasOwnProperty.call(intents, stated)) continue
        keep.push(stated)
      }
      // A goal the toolbar just stood is drawn too, though nothing holds it yet:
      // it is holding a decision, and a decision has until the board closes.
      var draft
      for (draft in BOARD.drafts) {
        if (!Object.prototype.hasOwnProperty.call(BOARD.drafts, draft)) continue
        keep.push(draft)
      }
      for (var k = 0; k < keep.length; k++) {
        var held = keep[k]
        if (!held || held === BOARD_INBOX || groups[held]) continue
        var known = goalByKey(held)
        if (!known) continue
        groups[held] = {
          key: held,
          label: names[held] || known.label,
          intent: intents[held] || '',
          path: known.path,
          kind: known.kind,
          rows: [],
        }
        blocks.push(groups[held])
      }
      if (!inbox) {        inbox = {
          key: BOARD_INBOX,
          label: BOARD_STORE.blockLabel(BOARD_INBOX) || paletteText('boardInbox'),
          intent: '',
          path: '',
          kind: 'inbox',
          rows: [],
        }
      }
      // The inbox is a place on the canvas even when it holds nothing, so the
      // reader always has somewhere to look for what a workspace did not claim.
      blocks.push(inbox)
      // Whatever the old arrangement still holds for a goal this paint no longer
      // draws is litter: the place it recorded, the name it used, the sentence
      // it said. A goal that is gone takes all three with it.
      var drawn = []
      for (var b = 0; b < blocks.length; b++) drawn.push(blocks[b].key)
      BOARD_STORE.pruneGoals(drawn)
      // The panel reads in two parts, and neither is a decision the reader makes:
      // `hot` is the conversations a panel is working in - one that moved today,
      // one that is mid-turn, one the reader marked - and `quiet` is what the day
      // merely carried in. The second part is drawn as a line each rather than a
      // column each, which is what keeps a goal holding a dozen conversations a
      // panel instead of a two-screen strip. Nothing is taken off the board: both
      // are slices of `rows`, and a quiet one is back in its column the moment it
      // moves, is marked, or starts a turn.
      var nowMs = Date.now()
      var today = dayOf(nowMs)
      var finished = BOARD_STORE.doneStamps()
      var woke = BOARD_STORE.wokeStamps()
      var verdicts = BOARD_STORE.verdicts()
      var backToWork = []
      var staleSettled = []
      for (var p = 0; p < blocks.length; p++) {
        var parts = blocks[p]
        parts.hot = []
        parts.quiet = []
        parts.done = []
        for (var s = 0; s < parts.rows.length; s++) {
          var qrow = parts.rows[s]
          // A conversation the reader put in the finished strip is drawn
          // there and nowhere else. The mark is theirs alone: a turn the
          // shell calls finished still stays in the columns until the hand
          // moves it, because where a card stands is not a clock's decision.
          var doneAt = Number(finished[qrow.id]) || 0
          // A finished word whose day is over is a word about nothing: the
          // strip reads only today, and the chip goes with it.
          var heldVerdict = verdicts[qrow.id]
          if (heldVerdict && heldVerdict.key === 'settled'
            && (!doneAt || dayOf(doneAt) !== today)) {
            staleSettled.push(qrow.id)
          }
          if (doneAt && dayOf(doneAt) === today) {
            var doneStatus = statusOf(qrow)
            // A conversation that came alive again - a new turn, or words
            // after the mark was written - has left the finish behind it:
            // it comes back up by itself. Only that direction is automatic;
            // nothing ever goes down without the hand.
            var movedAt = Number(qrow.updatedAt) || 0
            if (!statusIsLive(doneStatus) && movedAt <= doneAt) {
              parts.done.push(qrow)
              if (doneStatus && doneStatus.key === 'done') noteCardFinished(qrow)
              continue
            }
            backToWork.push(qrow.id)
          }
          var wokeAt = Number(woke[qrow.id]) || 0
          var wasQuiet = !BOARD_STORE.isStarred(qrow.id)
            && !(wokeAt && dayOf(wokeAt) === today)
            && (Number(qrow.updatedAt) || 0) < since
            && !statusIsLive(statusOf(qrow))
          if (wasQuiet) parts.quiet.push(qrow)
          else parts.hot.push(qrow)
        }
        // A turn the shell calls finished and nobody has opened is written
        // down here, while the shell still says so: the card must be able to
        // answer "this ran" after the reader looks and the flag is gone.
        for (var w = 0; w < parts.hot.length; w++) {
          var hotStatus = statusOf(parts.hot[w])
          if (hotStatus && hotStatus.key === 'done') noteCardFinished(parts.hot[w])
        }
      }
      if (backToWork.length) {
        BOARD_STORE.clearSessionsDone(backToWork)
        BOARD.verdicts = BOARD_STORE.verdicts()
      }
      if (staleSettled.length) {
        BOARD_STORE.dropSettled(staleSettled)
        BOARD.verdicts = BOARD_STORE.verdicts()
      }
      return blocks
    }

    /**
     * Record a fork this plugin watched, and repaint a board that is up.
     *
     * @param {string} parentId - the conversation the branch was cut from.
     * @param {string} childId - the conversation the branch became.
     * @returns {boolean} whether a new line was recorded.
     */
    function rememberFork(parentId, childId) {
      if (!parentId || !childId) return false
      var parent = String(parentId)
      var child = String(childId)
      var added = BOARD_STORE.rememberFork(child, parent)
      var homed = inheritForkHome(parent, child)
      if ((added || homed) && BOARD.open && !BOARD.noteEditing) renderBoard()
      return added || homed
    }

    /**
     * File a branch in the goal its parent is in.
     *
     * A conversation belongs to a goal, and a branch cut from it belongs beside
     * it: the line the board draws has two ends, and a child drawn in another
     * panel has no line at all. A filing the reader made is copied as it stands.
     * A card sitting in a workspace panel is copied only while the board is up to
     * say which panel that was - the shell's own fork does not name where it came
     * from, so with the board closed there is nothing to copy and nothing to
     * guess.
     * @param {string} parentId - the conversation the branch was cut from.
     * @param {string} childId - the branch.
     * @returns {boolean} whether the child was filed somewhere new.
     */
    function inheritForkHome(parentId, childId) {
      var goal = BOARD_STORE.placementOf(parentId)
      if (!goal && BOARD.open) {
        var home = boardHomeOf(parentId)
        goal = home ? home.key : ''
      }
      if (!goal) return false
      if (BOARD_STORE.placementOf(childId) === goal) return false
      return BOARD_STORE.placeSession(childId, goal)
    }

    /**
     * Bring one card into view, without moving the paper any further than it
     * has to.
     *
     * A branch lands under the card it was cut from, which may stand below
     * the fold of a long panel: a panel is laid out whole now, so the one
     * scroller left is the paper itself, and `nearest` moves it just far
     * enough. The reader who asked for the branch would otherwise be
     * looking at a board that did not change.
     * @param {string} id - session id.
     * @returns {void}
     */
    function revealBoardCard(id) {
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var drawn = BOARD.stage.querySelectorAll('[data-session-id]')
      for (var i = 0; i < drawn.length; i++) {
        if (drawn[i].getAttribute('data-session-id') !== id) continue
        if (typeof drawn[i].scrollIntoView === 'function') drawn[i].scrollIntoView({ block: 'nearest' })
        return
      }
    }

    /**
     * Watch the sessions service for forks, so a branch made anywhere in the
     * shell gets its line here.
     *
     * The host writes no durable parent onto an ordinary fork — the child is a
     * prefix of the source's events, and its header does not name where it came
     * from — so the only honest way to draw a line is to be standing there when
     * the branch is made. Wrapping `fork` observes every caller (the sidebar,
     * the shortcut, and this board's own mark) without changing what any of
     * them get back; a refusal propagates untouched. A host whose service
     * refuses the wrap simply gets the lines this board makes itself.
     * @returns {boolean} whether this process is watching.
     */
    function watchForks() {
      var services = taskServices()
      var controller = services && services.controller
      if (!controller || typeof controller.fork !== 'function') return false
      if (FORK_WATCH && FORK_WATCH.controller === controller && controller.fork === FORK_WATCH.wrapped) {
        return true
      }
      var original = controller.fork
      /** The same fork, with the one fact it does not return remembered beside it. */
      var wrapped = function (options) {
        var result = original.apply(this, arguments)
        if (!result || typeof result.then !== 'function') return result
        var parentId = options && options.sessionId
        return result.then(function (childId) {
          rememberFork(parentId, childId)
          return childId
        })
      }
      try {
        controller.fork = wrapped
      } catch (error) {
        console.warn('[dsh-vim] could not watch session forks', error)
        return false
      }
      if (controller.fork !== wrapped) return false
      FORK_WATCH = { controller: controller, wrapped: wrapped }
      return true
    }

    /**
     * The places the blocks will be drawn at.
     *
     * A stored place wins; a block this build has never seen is packed into the
     * first free grid slot and written down, so a workspace that arrives while
     * the reader is working lands somewhere quiet and stays there next time.
     * @param {Array<object>} blocks - the blocks about to be drawn.
     * @param {object} [heights] - block key -> the height it last measured;
     *   the packing steps over what a standing panel really occupies.
     * @returns {object} block key -> `{x, y}`.
     */
    function boardPlaces(blocks, heights, widths) {
      var stored = BOARD_STORE.blocks()
      var places = Object.create(null)
      var i
      for (i = 0; i < blocks.length; i++) {
        var known = stored[blocks[i].key]
        if (known) places[blocks[i].key] = { x: known.x, y: known.y }
      }
      for (i = 0; i < blocks.length; i++) {
        if (places[blocks[i].key]) continue
        var place = firstFreeSlot(places, heights, widths)
        BOARD_STORE.placeBlock(blocks[i].key, place.x, place.y)
        places[blocks[i].key] = place
      }
      return places
    }

    /**
     * The first place on the paper no block already stands on.
     *
     * Panels are no longer one width: a goal with four conversations is wide,
     * and a goal with one is not. The slot still steps by the grid's pitch, but
     * the step is tested against the width each standing panel really measured,
     * so a wide panel blocks the paper it covers and a quiet one does not take
     * room it never uses.
     * @param {object} places - block key -> `{x, y}`.
     * @param {object} [heights] - block key -> measured height.
     * @param {object} [widths] - block key -> measured width.
     * @returns {{x: number, y: number}} the place.
     */
    function firstFreeSlot(places, heights, widths) {
      // The grid keeps its own rhythm - three columns, then the next row - so a
      // board does not grow one endless line as goals arrive. What changed is
      // the occupancy test: a wide goal now blocks the paper it really covers,
      // and the next slot steps over that instead of over a fixed 380.
      for (var cursor = 0; cursor < 400; cursor++) {
        var column = cursor % BOARD_BLOCK_COLUMNS
        var row = Math.floor(cursor / BOARD_BLOCK_COLUMNS)
        var x = BOARD_CANVAS_EDGE + column * BOARD_BLOCK_PITCH_X
        var y = BOARD_CANVAS_EDGE + row * BOARD_BLOCK_PITCH_Y
        if (!slotTaken(places, heights, widths, x, y)) return { x: x, y: y }
      }
      return { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
    }

    /**
     * Whether a block already stands on a place.
     *
     * A panel owns the paper down to its own measured bottom, not just to the
     * grid's height — a goal with a long list of conversations hangs past
     * the row it was given, and a block set down on the row below it would
     * land on its cards. The room a panel keeps is never smaller than the
     * grid's own height, so a panel that stands shorter than its row (a quiet
     * goal, or a folded one) still holds the whole of it, and the block that
     * fills in beneath cannot be covered by the panel growing back.
     * @param {object} places - block key -> `{x, y}`.
     * @param {object} [heights] - block key -> measured height; a height
     *   nobody knows is the grid's own.
     * @param {number} x - the place in question.
     * @param {number} y - the place in question.
     * @returns {boolean} whether some panel stands there.
     */
    function slotTaken(places, heights, widths, x, y) {
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        var place = places[key]
        var wide = widths && widths[key] ? Math.max(widths[key], BOARD_BLOCK_W) : BOARD_BLOCK_W
        if (x >= place.x + wide || place.x >= x + BOARD_BLOCK_W) continue
        var tall = heights && heights[key] ? Math.max(heights[key], BOARD_BLOCK_H) : BOARD_BLOCK_H
        if (y >= place.y + tall || place.y >= y + BOARD_BLOCK_H) continue
        return true
      }
      return false
    }

    /**
     * How tall each painted panel stands, keyed by the block it is.
     *
     * Read off the page, for the two moments that need it: a paint about to
     * be taken down tells the next paint how much paper its panels occupy,
     * and the decisions made while the board is up (a new goal, a fresh
     * card) step over what is really standing. A panel is as tall as its
     * conversations now, so the height it measured is the only honest word
     * on where its bottom is. A host that reports no boxes — and the first
     * paint of all, before anything is drawn — answers nothing, and the
     * height every panel is planned at stands in.
     * @returns {object} block key -> height in unzoomed pixels.
     */
    function boardPanelHeights() {
      var out = Object.create(null)
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return out
      var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
      for (var i = 0; i < painted.length; i++) {
        var key = painted[i].getAttribute('data-block')
        var tall = Number(painted[i].offsetHeight) || 0
        if (key && tall > 0) out[key] = tall
      }
      return out
    }

    /**
     * How wide each painted panel stands, keyed by the block it is.
     *
     * The width a panel takes is now its own: one column per conversation. A
     * paint about to be taken down hands the next one what the panels really
     * measured, so the paper and the packing step over the rooms that exist
     * rather than the one every panel used to be planned at.
     * @returns {object} block key -> width in unzoomed pixels.
     */
    function boardPanelWidths() {
      var out = Object.create(null)
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return out
      var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
      for (var i = 0; i < painted.length; i++) {
        var key = painted[i].getAttribute('data-block')
        var wide = Number(painted[i].offsetWidth) || 0
        if (key && wide > 0) out[key] = wide
      }
      return out
    }

    /**
     * How big the stage has to be to hold everything on it.
     *
     * Read off the stored places and the heights the panels measured, rather
     * than off the boxes as they are dragged: a drag moves a panel without a
     * repaint, and this size is only ever written by one. The heights are
     * what the panels themselves decided — a goal stands as tall as its
     * conversations — so the paper covers the bottom of the tallest of them,
     * and the reader's scrollbars describe the work that is actually there.
     * @param {object} places - block key -> `{x, y}`.
     * @param {object} [heights] - block key -> measured height; unknown
     *   heights fall back to the height every panel is planned at.
     * @returns {{width: number, height: number}} the stage, in pixels.
     */
    function boardExtent(places, heights, widths) {
      var width = 720
      var height = 520
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        var place = places[key]
        var wide = widths && widths[key] ? widths[key] : BOARD_BLOCK_W
        width = Math.max(width, place.x + wide + BOARD_CANVAS_EDGE)
        var tall = heights && heights[key] ? heights[key] : BOARD_BLOCK_H
        height = Math.max(height, place.y + tall + BOARD_CANVAS_EDGE)
      }
      var cards = BOARD_STORE.cards()
      for (var i = 0; i < cards.length; i++) {
        width = Math.max(width, cards[i].x + BOARD_CARD_W + BOARD_CANVAS_EDGE)
        height = Math.max(height, cards[i].y + boardCardBox(cards[i].text, cards[i].h).height + BOARD_CANVAS_EDGE)
      }
      return { width: width, height: height }
    }

    /**
     * Put the canvas's magnification on the paper.
     *
     * The stage is drawn at its true size and scaled; the paper around it is
     * sized to the magnified extent so the scrollbars describe what the eye
     * sees. Called on every repaint and on every zoom, and it touches nothing
     * but those three boxes and the readout.
     * @returns {void}
     */
    function applyBoardZoom() {
      if (!BOARD.stage || !BOARD.sizer) return
      var extent = BOARD.extent
      var zoom = BOARD.zoom || 1
      BOARD.stage.style.width = extent.width + 'px'
      BOARD.stage.style.height = extent.height + 'px'
      BOARD.stage.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')'
      BOARD.sizer.style.width = Math.ceil(extent.width * zoom) + 'px'
      BOARD.sizer.style.height = Math.ceil(extent.height * zoom) + 'px'
      if (BOARD.zoomLabel) BOARD.zoomLabel.textContent = Math.round(zoom * 100) + '%'
    }

    /**
     * Zoom the canvas, keeping one point of it where it is on screen.
     *
     * The anchor is what makes a wheel zoom feel like the paper is being
     * pushed rather than the view being reset: the content point under the
     * pointer stays under the pointer.
     * @param {number} value - the wanted magnification.
     * @param {number} [anchorX] - screen x within the viewport; centre by default.
     * @param {number} [anchorY] - screen y within the viewport; centre by default.
     * @returns {boolean} whether the zoom changed.
     */
    function setBoardZoom(value, anchorX, anchorY) {
      if (!BOARD.open || !BOARD.body) return false
      // A hand on the zoom is the reader taking the scale back from the window.
      BOARD.fits = false
      var next = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, Number(value) || 1))
      if (Math.abs(next - BOARD.zoom) < 0.001) return false
      var body = BOARD.body
      var ax = typeof anchorX === 'number' ? anchorX : (body.clientWidth || 0) / 2
      var ay = typeof anchorY === 'number' ? anchorY : (body.clientHeight || 0) / 2
      var contentX = (body.scrollLeft + ax) / BOARD.zoom
      var contentY = (body.scrollTop + ay) / BOARD.zoom
      BOARD.zoom = next
      BOARD_STORE.setZoom(next)
      applyBoardZoom()
      body.scrollLeft = Math.max(0, contentX * next - ax)
      body.scrollTop = Math.max(0, contentY * next - ay)
      return true
    }

    /**
     * Scale the canvas so the whole of it stands inside the window.
     *
     * The one press that answers "I cannot see all of this". The scale is the
     * smaller of the two ratios the window allows, so the wider side is the
     * one that decides - the same rule a map's "show everything" uses. A board
     * that already stands inside the window stays at 100%: growing the paper to
     * fill a huge window would change the type size for no gain, and a fit
     * that magnifies is not a fit. The paper is scrolled back to its corner
     * because everything is now on screen, and the request is remembered so a
     * resized window fits again (see `BOARD.fits`).
     * @returns {boolean} whether the board could be measured and fitted.
     */
    function fitBoardToWindow() {
      if (!BOARD.open || !BOARD.body || !BOARD.extent) return false
      var body = BOARD.body
      var wide = Number(body.clientWidth) || 0
      var tall = Number(body.clientHeight) || 0
      var extent = BOARD.extent
      if (!wide || !tall || !extent.width || !extent.height) return false
      var roomWide = Math.max(1, wide - BOARD_FIT_PAD * 2)
      var roomTall = Math.max(1, tall - BOARD_FIT_PAD * 2)
      var fit = Math.min(roomWide / extent.width, roomTall / extent.height)
      var next = Math.max(BOARD_ZOOM_FIT_MIN, Math.min(1, fit))
      BOARD.fits = true
      if (Math.abs(next - BOARD.zoom) > 0.001) {
        BOARD.zoom = next
        BOARD_STORE.setZoom(next)
        applyBoardZoom()
      }
      body.scrollLeft = 0
      body.scrollTop = 0
      return true
    }

    /**
     * A window that changed size re-fits a canvas that was fitted to it.
     *
     * Only a board the reader asked to fit follows the window; one zoomed by
     * hand keeps the scale it was given, because that scale is the reader's
     * decision and not a fact about the window.
     * @returns {void}
     */
    function onBoardResize() {
      if (!BOARD.open || !BOARD.fits) return
      fitBoardToWindow()
    }

    /**
     * Ctrl/Cmd + wheel zooms the canvas, the way every canvas does.
     * @param {WheelEvent} ev - the wheel.
     * @returns {void}
     */
    function onBoardWheel(ev) {
      if (!ev || (!ev.ctrlKey && !ev.metaKey)) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      var rect = BOARD.body && typeof BOARD.body.getBoundingClientRect === 'function'
        ? BOARD.body.getBoundingClientRect()
        : { left: 0, top: 0 }
      var factor = Number(ev.deltaY) < 0 ? 1.1 : 1 / 1.1
      setBoardZoom(BOARD.zoom * factor, (Number(ev.clientX) || 0) - rect.left, (Number(ev.clientY) || 0) - rect.top)
    }

    /**
     * Where a new loose card goes when the reader did not point at a place.
     *
     * Below everything already on the canvas, at the left edge: a card written
     * from the heading is a thought the reader has not placed yet, so it must
     * not land on top of the work they are looking at. "Below everything" is
     * measured — a goal with a long list hangs past its grid row, and the
     * card belongs under its real bottom, not under the row the grid gave it.
     * @returns {{x: number, y: number}} the place.
     */
    function nextCardPlace() {
      var bottom = 0
      var places = BOARD_STORE.blocks()
      var talls = boardPanelHeights()
      for (var key in places) {
        if (!Object.prototype.hasOwnProperty.call(places, key)) continue
        bottom = Math.max(bottom, places[key].y + (talls[key] ? Math.max(talls[key], BOARD_BLOCK_H) : BOARD_BLOCK_H))
      }
      var cards = BOARD_STORE.cards()
      for (var i = 0; i < cards.length; i++) {
        bottom = Math.max(bottom, cards[i].y + boardCardBox(cards[i].text, cards[i].h).height)
      }
      return {
        x: BOARD_CANVAS_EDGE,
        y: bottom ? bottom + BOARD_BLOCK_GAP_Y : BOARD_CANVAS_EDGE,
      }
    }

    /**
     * A place on the paper for a goal that was just asked for, near the eye.
     *
     * The middle of what is on screen is where the reader is looking, so that is
     * where a new goal wants to be. A place another panel already stands on is
     * stepped over rather than covered: a goal drawn on top of one is a goal
     * nobody can read, and the reader would have to move it before it was of any
     * use at all. Stepping goes by what the standing panels measure — a tall
     * one owns the paper down to its own bottom — and never by less than a
     * grid row, so the goal that lands beneath a short one still has the room
     * it was promised.
     * @returns {{x: number, y: number}} canvas coordinates.
     */
    function boardFreePlace() {
      var body = BOARD.body
      var zoom = BOARD.zoom || 1
      var left = body ? Number(body.scrollLeft) || 0 : 0
      var top = body ? Number(body.scrollTop) || 0 : 0
      var wide = body && body.clientWidth ? body.clientWidth : BOARD_BLOCK_W
      var tall = body && body.clientHeight ? body.clientHeight : BOARD_BLOCK_H
      var x = Math.max(BOARD_CANVAS_EDGE, Math.round((left + wide / 2) / zoom - BOARD_BLOCK_W / 2))
      var y = Math.max(BOARD_CANVAS_EDGE, Math.round((top + tall / 2) / zoom - BOARD_BLOCK_H / 2))
      var taken = BOARD_STORE.blocks()
      var talls = boardPanelHeights()
      var wides = boardPanelWidths()
      for (var step = 0; step < 24; step++) {
        var clash = false
        for (var key in taken) {
          if (!Object.prototype.hasOwnProperty.call(taken, key)) continue
          var at = taken[key]
          if (!at) continue
          var spreads = wides[key] ? Math.max(wides[key], BOARD_BLOCK_W) : BOARD_BLOCK_W
          if (x >= at.x + spreads + BOARD_BLOCK_GAP_X - 8) continue
          if (at.x >= x + BOARD_BLOCK_W + BOARD_BLOCK_GAP_X - 8) continue
          var stands = talls[key] ? Math.max(talls[key], BOARD_BLOCK_H) : BOARD_BLOCK_H
          if (y >= at.y + stands + BOARD_BLOCK_GAP_Y - 8) continue
          if (at.y >= y + BOARD_BLOCK_H + BOARD_BLOCK_GAP_Y - 8) continue
          clash = true
          break
        }
        if (!clash) return { x: x, y: y }
        y = y + BOARD_BLOCK_PITCH_Y
      }
      return { x: x, y: y }
    }

    /**
     * Stand a new goal on the canvas, ready to be given a purpose.
     *
     * A goal used to be something only a conversation could make, which is the
     * wrong way round for work that has not started: the place to write down
     * what is to be done should exist before the first conversation about it.
     * The line opens with the panel, so the next thing typed is what keeps it
     * there.
     * @returns {void}
     */
    function addBoardGoal() {
      var place = boardFreePlace()
      var key = BOARD_STORE.addGoal('', place.x, place.y)
      if (!key) return
      // Held while the board is up: a goal with nothing in it and nothing said
      // about it is a place nobody is working in, and the rule that clears those
      // must not take the one being named out from under the caret.
      BOARD.drafts[key] = true
      BOARD.intentBlock = key
      BOARD.intentInput = null
      renderBoard()
      showToast(paletteText('boardGoalAdded'))
    }

    /**
     * Take the new-conversation sheet down, and forget what it was writing.
     *
     * The fields belong to the sheet: a press elsewhere, Escape, or the board
     * going away all end the same way. Nothing here touches the host — a sheet
     * that closes has written nothing, which is what Cancel means.
     * @returns {boolean} whether a sheet was up.
     */
    function closeNewSessionSheet() {
      var host = BOARD.newSessionHost
      if (!host) return false
      if (host.parentNode) host.parentNode.removeChild(host)
      BOARD.newSessionGoal = ''
      BOARD.newSessionHost = null
      BOARD.newSessionTitle = null
      BOARD.newSessionBody = null
      BOARD.newSessionModel = null
      BOARD.newSessionModelText = null
      // A model window opened for this sheet goes with it: the choice belonged
      // to a conversation nobody is making any more.
      if (MODELPICK.forNewSession) closeModelPick()
      BOARD.newSessionConfirm = null
      BOARD.newSessionError = null
      return true
    }

    /**
     * Put the sheet's confirm button in step with the one host round trip.
     *
     * A second press while the first is still being made would make a second
     * conversation, so the button stops answering until the answer lands.
     * @returns {void}
     */
    function paintNewSessionBusy() {
      var confirm = BOARD.newSessionConfirm
      if (!confirm) return
      confirm.textContent = BOARD.newSessionBusy ? '\u2026' : paletteText('boardNewSessionConfirm')
      confirm.setAttribute('aria-busy', BOARD.newSessionBusy ? 'true' : 'false')
      confirm.style.opacity = BOARD.newSessionBusy ? '0.6' : ''
      confirm.style.pointerEvents = BOARD.newSessionBusy ? 'none' : ''
    }

    /**
     * Say which model the sheet would start the conversation on.
     *
     * The line is the whole state of the row: no model chosen reads as the
     * host's own default, because that is what the conversation will get.
     * @returns {void}
     */
    function paintNewSessionModel() {
      var node = BOARD.newSessionModelText
      if (!node) return
      var pick = BOARD.newSessionModel
      if (!pick) {
        node.textContent = paletteText('boardNewSessionModelDefault')
        node.style.opacity = '0.66'
        return
      }
      node.style.opacity = ''
      node.textContent = pick.levelName ? pick.name + ' · ' + pick.levelName : pick.name
    }

    /**
     * Paint one of the sheet's fields as focused or not.
     *
     * Inline styles cannot write `:focus`, and the browser's own ring is a black
     * halo on a solid dark sheet. The two properties below are the board's
     * ordinary pair for "this is the thing you are on": the accent edge and its
     * soft ring outside it.
     * @param {Element} input - the field to paint.
     * @param {boolean} on - whether the caret is in it.
     * @returns {void}
     */
    function paintNewSessionField(input, on) {
      if (!input || !input.style) return
      input.style.borderColor = on ? BOARD_INK.accent : BOARD_INK.dialogFieldEdge
      input.style.boxShadow = on ? '0 0 0 3px ' + BOARD_INK.accentSoft : 'none'
    }

    /**
     * Let a field say where the caret is, for as long as it lives.
     * @param {Element} input - the field to watch.
     * @returns {void}
     */
    function watchNewSessionField(input) {
      if (!input || typeof input.addEventListener !== 'function') return
      input.addEventListener('focus', function () { paintNewSessionField(input, true) })
      input.addEventListener('blur', function () { paintNewSessionField(input, false) })
    }

    /**
     * Show the sheet that asks for a conversation's name and the words it opens with.
     *
     * This is the plus's first gesture. The second is the sheet not existing at
     * all: a card dropped on the same plus already carries its own words, and a
     * question there would only be asking the reader to repeat themselves.
     * @param {object} block - the goal whose plus was pressed.
     * @returns {boolean} whether the sheet opened.
     */
    function openNewSessionSheet(block) {
      if (!block || block.kind === 'inbox') return false
      if (BOARD.newSessionHost || BOARD.newSessionBusy) return false
      if (!BOARD.panel) return false
      if (!workspaceForGoal(block)) {
        showToast(paletteText('boardNewSessionNoWorkspace'))
        return false
      }

      var host = document.createElement('div')
      Object.assign(host.style, BOARD_UI.newSessionBackdrop)
      host.setAttribute('data-role', 'newSessionSheet')
      var sheet = document.createElement('div')
      Object.assign(sheet.style, BOARD_UI.newSessionSheet)
      sheet.className = 'dshv-new-sheet'
      sheet.setAttribute('role', 'dialog')
      sheet.setAttribute('aria-modal', 'true')
      sheet.setAttribute('aria-label', paletteText('boardNewSessionTitle'))
      sheet.setAttribute('data-handle', 'newSession')

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.newSessionHead)
      head.textContent = paletteText('boardNewSessionTitle')
      sheet.appendChild(head)

      // The premise of the form, not its footnote: a reader should know what
      // the two fields turn into before typing into them, not after.
      var helper = document.createElement('div')
      Object.assign(helper.style, BOARD_UI.newSessionHelper)
      helper.textContent = paletteText('boardNewSessionHelper')
      sheet.appendChild(helper)

      var titleField = document.createElement('label')
      Object.assign(titleField.style, BOARD_UI.newSessionField)
      var titleLabel = document.createElement('span')
      Object.assign(titleLabel.style, BOARD_UI.newSessionLabel)
      titleLabel.textContent = paletteText('boardNewSessionTitleLabel')
      var titleInput = document.createElement('input')
      Object.assign(titleInput.style, BOARD_UI.newSessionInput)
      titleInput.setAttribute('type', 'text')
      titleInput.setAttribute('data-role', 'newSessionTitle')
      titleInput.setAttribute('placeholder', paletteText('boardNewSessionTitlePlaceholder'))
      watchNewSessionField(titleInput)
      titleField.appendChild(titleLabel)
      titleField.appendChild(titleInput)
      sheet.appendChild(titleField)

      var bodyField = document.createElement('label')
      Object.assign(bodyField.style, BOARD_UI.newSessionField)
      var bodyLabel = document.createElement('span')
      Object.assign(bodyLabel.style, BOARD_UI.newSessionLabel)
      bodyLabel.textContent = paletteText('boardNewSessionBodyLabel')
      var bodyInput = document.createElement('textarea')
      Object.assign(bodyInput.style, BOARD_UI.newSessionBody)
      bodyInput.setAttribute('data-role', 'newSessionBody')
      bodyInput.setAttribute('placeholder', paletteText('boardNewSessionBodyPlaceholder'))
      watchNewSessionField(bodyInput)
      bodyField.appendChild(bodyLabel)
      bodyField.appendChild(bodyInput)
      sheet.appendChild(bodyField)

      var modelField = document.createElement('div')
      Object.assign(modelField.style, BOARD_UI.newSessionField)
      var modelLabel = document.createElement('span')
      Object.assign(modelLabel.style, BOARD_UI.newSessionLabel)
      modelLabel.textContent = paletteText('boardNewSessionModelLabel')
      var modelPick = document.createElement('span')
      Object.assign(modelPick.style, BOARD_UI.newSessionPick)
      modelPick.className = 'dshv-sheet-pick'
      modelPick.setAttribute('role', 'button')
      modelPick.setAttribute('tabindex', '0')
      modelPick.setAttribute('data-role', 'newSessionModel')
      modelPick.setAttribute('title', paletteText('boardNewSessionModelHint'))
      var modelName = document.createElement('span')
      Object.assign(modelName.style, BOARD_UI.newSessionPickName)
      modelName.setAttribute('data-role', 'newSessionModelName')
      var modelMark = document.createElement('span')
      Object.assign(modelMark.style, BOARD_UI.newSessionPickMark)
      modelMark.textContent = '\u203a'
      modelPick.appendChild(modelName)
      modelPick.appendChild(modelMark)
      modelPick.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        openNewSessionModelPick()
      })
      // A row that is a button answers the keyboard like one: it is reached by
      // Tab, not only by the hand.
      modelPick.addEventListener('keydown', function (ev) {
        var key = ev && ev.key ? String(ev.key) : ''
        if (key !== 'Enter' && key !== ' ') return
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        openNewSessionModelPick()
      })
      modelField.appendChild(modelLabel)
      modelField.appendChild(modelPick)
      sheet.appendChild(modelField)

      var error = document.createElement('div')
      Object.assign(error.style, BOARD_UI.newSessionError)
      error.setAttribute('data-role', 'newSessionError')
      error.style.display = 'none'
      sheet.appendChild(error)

      var actions = document.createElement('div')
      Object.assign(actions.style, BOARD_UI.newSessionActions)
      var keys = document.createElement('span')
      Object.assign(keys.style, BOARD_UI.newSessionKeys)
      keys.textContent = paletteText('boardNewSessionKeys')
      actions.appendChild(keys)
      var cancel = document.createElement('span')
      Object.assign(cancel.style, BOARD_UI.newSessionCancel)
      cancel.className = 'dshv-sheet-btn dshv-sheet-btn-ghost'
      cancel.setAttribute('role', 'button')
      cancel.setAttribute('data-role', 'newSessionCancel')
      cancel.textContent = paletteText('boardNewSessionCancel')
      cancel.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        closeNewSessionSheet()
      })
      var confirm = document.createElement('span')
      Object.assign(confirm.style, BOARD_UI.newSessionConfirm)
      confirm.className = 'dshv-sheet-btn dshv-sheet-btn-primary'
      confirm.setAttribute('role', 'button')
      confirm.setAttribute('data-role', 'newSessionConfirm')
      confirm.textContent = paletteText('boardNewSessionConfirm')
      confirm.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        commitNewSessionSheet()
      })
      actions.appendChild(cancel)
      actions.appendChild(confirm)
      sheet.appendChild(actions)

      // A press on the paper around the sheet is a cancel, the way every window
      // in this plugin treats the space beside its card.
      host.addEventListener('pointerdown', function (ev) {
        if (ev && ev.target !== host) return
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        closeNewSessionSheet()
      })
      host.addEventListener('keydown', function (ev) {
        var key = ev && ev.key ? String(ev.key).toLowerCase() : ''
        if (key === 'escape') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeNewSessionSheet()
          return
        }
        if ((ev.ctrlKey || ev.metaKey) && key === 'enter') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          commitNewSessionSheet()
        }
      })
      titleInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeNewSessionSheet()
          return
        }
        if (ev.key !== 'Enter') return
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
        bodyInput.focus()
      })
      bodyInput.addEventListener('keydown', function (ev) {
        var key = ev.key ? String(ev.key).toLowerCase() : ''
        if (key === 'escape') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeNewSessionSheet()
          return
        }
        // The one chord that sends from the body: a bare Enter is a line break,
        // because the body is where a longer thought is written.
        if ((ev.ctrlKey || ev.metaKey) && key === 'enter') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          commitNewSessionSheet()
        }
      })

      host.appendChild(sheet)
      BOARD.newSessionHost = host
      BOARD.newSessionGoal = String(block.key || '')
      BOARD.newSessionTitle = titleInput
      BOARD.newSessionBody = bodyInput
      BOARD.newSessionModel = null
      BOARD.newSessionModelText = modelName
      BOARD.newSessionConfirm = confirm
      BOARD.newSessionError = error
      BOARD.panel.appendChild(host)
      paintNewSessionBusy()
      paintNewSessionModel()
      if (typeof titleInput.focus === 'function') titleInput.focus()
      return true
    }

    /**
     * Read the sheet and start the conversation it describes.
     *
     * The title becomes the name; the body becomes the draft in its message box. A title
     * on its own is a request too: a conversation stood up with nothing said
     * yet. A sheet with neither is not a request, so it stays open with the
     * field focused rather than making an empty conversation.
     * @returns {boolean} whether a conversation was asked for.
     */
    function commitNewSessionSheet() {
      if (BOARD.newSessionBusy) return false
      var block = boardBlockByKey(BOARD.newSessionGoal)
      if (!block) {
        closeNewSessionSheet()
        return false
      }
      var title = BOARD.newSessionTitle ? String(BOARD.newSessionTitle.value || '').trim() : ''
      var body = BOARD.newSessionBody ? String(BOARD.newSessionBody.value || '').trim() : ''
      if (!title && !body) {
        if (BOARD.newSessionError) {
          BOARD.newSessionError.textContent = paletteText('boardNewSessionEmpty')
          BOARD.newSessionError.style.display = ''
        }
        if (BOARD.newSessionTitle && typeof BOARD.newSessionTitle.focus === 'function') BOARD.newSessionTitle.focus()
        return false
      }
      if (!title) title = noteParts(body).title.trim()
      if (BOARD.newSessionError) BOARD.newSessionError.style.display = 'none'
      return startNewSessionForGoal(block.key, title, body, '')
    }

    /**
     * Put the model the sheet was set to onto the conversation just made.
     *
     * A selection is a fact about one conversation, so there is nothing to
     * submit until the conversation exists — and it has to exist before the
     * first message, which is the only ordering where the words go out on the
     * model that was chosen. A refusal is reported and the conversation still
     * starts: the sheet asked for a conversation first.
     * @param {string} sessionId - the conversation just created.
     * @param {object|null} pick - the model chosen on the sheet.
     * @returns {Promise<boolean>} whether the model landed.
     */
    function applyNewSessionModel(sessionId, pick) {
      if (!pick) return Promise.resolve(false)
      var directories = modelDirectories()
      if (!directories || typeof directories.directoryFor !== 'function') {
        showToast(paletteText('modelUnsupported'))
        return Promise.resolve(false)
      }
      var directory = null
      try {
        directory = directories.directoryFor(sessionId)
      } catch (error) {
        directory = null
      }
      if (!directory) {
        showToast(paletteText('modelUnsupported'))
        return Promise.resolve(false)
      }
      return switchModel(directory, pick, pick.level).then(
        function () {
          return true
        },
        function (error) {
          showToast(paletteText('modelFailed') + ': ' + failureText(error))
          return false
        }
      )
    }

    /**
     * Start one conversation under one goal, with the reader's words.
     *
     * The workspace creates the Session; the goal is where the card is filed
     * afterwards, because a goal of the reader's own has no workspace of its
     * own. Two sources feed this: the sheet's title and body, and a card
     * dropped on the plus — the latter leaves the card behind as the receipt,
     * exactly as handing it to an existing conversation does.
     * @param {string} goalKey - the goal the conversation is filed under.
     * @param {string} title - the name the conversation should wear.
     * @param {string} text - the words to hand over as a draft; empty hands over none.
     * @param {string} [cardId] - the card that was dropped, when there is one.
     * @returns {boolean} whether the attempt was started.
     */
    function startNewSessionForGoal(goalKey, title, text, cardId) {
      if (BOARD.newSessionBusy) return false
      var block = boardBlockByKey(goalKey)
      if (!block) {
        showToast(paletteText('boardNewSessionNoWorkspace'))
        return false
      }
      var workspaceId = workspaceForGoal(block)
      if (!workspaceId) {
        showToast(paletteText('boardNewSessionNoWorkspace'))
        return false
      }
      var services = taskServices()
      var sessions = services && services.controller
      if (!sessions || typeof sessions.create !== 'function') {
        showToast(paletteText('boardNewSessionUnavailable'))
        return false
      }
      var name = String(title || '').trim()
      var body = String(text || '').trim()
      // The sheet's model row, read here: the sheet is gone by the time the
      // conversation comes back from the host, and the choice with it.
      var picked = BOARD.newSessionModel || null
      // A conversation needs a name or some words. Either one alone is a
      // request: the sheet's title names it, and its body is what gets said.
      if (!name && !body) return false
      BOARD.newSessionBusy = true
      paintNewSessionBusy()
      var sessionId = ''
      function fail(error) {
        BOARD.newSessionBusy = false
        var reason = error && error.rpcError && error.rpcError.message
          ? String(error.rpcError.message)
          : failureText(error)
        if (BOARD.newSessionError) {
          BOARD.newSessionError.textContent = paletteText('boardNewSessionFailed') + reason
          BOARD.newSessionError.style.display = ''
        }
        paintNewSessionBusy()
        showToast(paletteText('boardNewSessionFailed') + reason)
        if (BOARD.open) renderBoard()
      }
      Promise.resolve(sessions.create({ workspaceId: workspaceId })).then(function (created) {
        sessionId = String(created || '')
        if (!sessionId) throw new Error(paletteText('boardNewSessionUnavailable'))
        // The card is where the reader pointed, not where the workspace would
        // have put it: file it before opening so the next board agrees.
        BOARD_STORE.placeSession(sessionId, goalKey)
        activateSession(sessionId)
        JOURNAL.add('thread/born', { session: sessionId, goal: goalKey })
        // The Session exists and is open: a second request from here is a
        // second conversation on purpose, not a double press on one button.
        // The paste below can wait on the message box, and that wait must not
        // keep the board's plus answering "busy" for the rest of the visit.
        BOARD.newSessionBusy = false
        paintNewSessionBusy()
        // The model goes on before the words do: once the draft is sent it is
        // the model on the conversation that answers it.
        return applyNewSessionModel(sessionId, picked).then(function () {
          // The words are handed over as a draft, never as a turn: this plugin
          // opens the conversation and puts the reader's words in its box, and
          // pressing send stays the reader's own decision. A card carries words
          // too, and it goes in the same way.
          if (!body) return true
          return pasteIntoComposer(body, sessionId)
        })
      }).then(function (pasted) {
        if (cardId) BOARD_STORE.finishCard(cardId, sessionId)
        if (name) {
          renameSession(sessionId, name, function (reason) {
            if (reason) console.warn('[dsh-vim] new session rename refused', reason)
          })
        }
        BOARD.newSessionBusy = false
        paintNewSessionBusy()
        if (body && pasted === false) {
          // The conversation is open and named; only the words did not land,
          // and saying so is what keeps them from being lost silently.
          showToast(paletteText('boardNewSessionPasteFailed'))
        } else if (cardId) {
          showToast(paletteText('boardNewSessionDropped'))
        } else {
          showToast(paletteText('boardNewSessionCreated') + (name || noteParts(body).title))
        }
        if (BOARD.open) renderBoard()
      }).catch(fail)
      return true
    }

    // ---------------------------------------------------------------------
    // tidying the canvas
    // ---------------------------------------------------------------------

    /**
     * The panels as a tidy sees them: a rectangle of paper, the conversations
     * it holds, and where each of those conversations was last drawn.
     *
     * Read once, before any card moves. A column laid out against a
     * conversation the repaint has not drawn yet would have to be laid out
     * twice, and the second layout is the one the reader would see jump.
     * @returns {Array<object>} one record per panel, in draw order.
     */
    function tidyPanels() {
      var stored = BOARD_STORE.blocks()
      var stage = BOARD.stage
      var stageRect = stage && typeof stage.getBoundingClientRect === 'function'
        ? stage.getBoundingClientRect()
        : null
      var zoom = BOARD.zoom || 1
      var measured = Object.create(null)
      if (stageRect && typeof stage.querySelectorAll === 'function') {
        var panels = stage.querySelectorAll('[data-role="workspaceBlock"]')
        for (var p = 0; p < panels.length; p++) {
          var panelKey = panels[p].getAttribute('data-block')
          var panelRect = panels[p].getBoundingClientRect()
          if (!panelKey || !panelRect || !panelRect.height) continue
          measured[panelKey] = {
            height: panelRect.height / zoom,
            width: panelRect.width / zoom,
          }
        }
      }
      // Where each conversation stands, in paper coordinates. A host that
      // reports no boxes leaves this empty, and the column then starts at its
      // panel's heading instead - the same place, one measurement worse.
      var anchors = Object.create(null)
      if (stageRect) {
        for (var n = 0; n < BOARD.nodes.length; n++) {
          var node = BOARD.nodes[n]
          var sessionId = node.getAttribute('data-session-id')
          if (!sessionId) continue
          var rect = node.getBoundingClientRect()
          if (!rect || (!rect.width && !rect.height)) continue
          anchors[sessionId] = (rect.top - stageRect.top) / zoom
        }
      }
      var records = []
      for (var i = 0; i < BOARD.blocks.length; i++) {
        var block = BOARD.blocks[i]
        var place = stored[block.key] || { x: BOARD_CANVAS_EDGE, y: BOARD_CANVAS_EDGE }
        var folded = BOARD_STORE.isFolded(block.key)
        var box = measured[block.key]
        var sessions = []
        for (var r = 0; r < block.rows.length; r++) sessions.push(block.rows[r].id)
        records.push({
          key: block.key,
          kind: block.kind,
          x: place.x,
          y: place.y,
          // A panel is as wide as its own columns, so a tidy keeps clear of the
          // width this goal really took rather than the width every goal used
          // to be planned at.
          width: box && box.width ? box.width : boardBlockWidth(block),
          height: box ? box.height : folded ? BOARD_BLOCK_HEAD_H : BOARD_BLOCK_H,
          folded: folded,
          sessions: sessions,
          anchors: anchors,
        })
      }
      return records
    }

    /**
     * Which panel a card belongs beside, if any.
     *
     * A card belongs to the conversation it was tied to, and to nothing else. A
     * tie whose conversation is not on this canvas today - folded away, taken
     * off, or filtered out - has nowhere to be pinned, and that card goes to
     * the inbox with the thoughts that were never tied at all.
     * @param {object} card - the loose card.
     * @param {Array<object>} panels - the panels, in draw order.
     * @returns {{panel: number, order: number, sessionId: string}|null} its home.
     */
    function tidyHomeOf(card, panels) {
      if (!card || !card.link) return null
      for (var p = 0; p < panels.length; p++) {
        var sessions = panels[p].sessions
        for (var s = 0; s < sessions.length; s++) {
          if (sessions[s] !== card.link) continue
          return { panel: p, order: s, sessionId: card.link }
        }
      }
      return null
    }

    /**
     * The first x at or right of `x` that no panel already stands in.
     *
     * A column of cards may stand in front of the paper, never on top of a
     * panel: two panels one pitch apart leave 32px between them, which is not a
     * card wide. One pass per blocker, and the guard is what a hand-edited
     * document with every panel piled on one spot cannot turn into a loop.
     * @param {Array<object>} panels - the panels, in draw order.
     * @param {number} yTop - the column's first row.
     * @param {number} yBottom - the column's last row.
     * @param {number} x - where the column would rather stand.
     * @returns {number} where it can stand.
     */
    function tidyColumnX(panels, yTop, yBottom, x) {
      var left = x
      for (var guard = 0; guard < 8; guard++) {
        var blocker = null
        for (var p = 0; p < panels.length; p++) {
          var panel = panels[p]
          if (left + BOARD_CARD_W <= panel.x + 1) continue
          if (left >= panel.x + panel.width - 1) continue
          if (yBottom <= panel.y + 1 || yTop >= panel.y + panel.height - 1) continue
          blocker = panel
        }
        if (!blocker) return left
        left = blocker.x + blocker.width + BOARD_TIDY_GAP
      }
      return left
    }

    /** The order cards stand in beside their panel: the panel's own order. */
    function tidyBySession(left, right) {
      if (left.order !== right.order) return left.order - right.order
      return left.written - right.written
    }

    /** The order the inbox tray keeps: what is finished sinks to the bottom. */
    function tidyByTray(left, right) {
      var leftDone = left.card.done ? 1 : 0
      var rightDone = right.card.done ? 1 : 0
      if (leftDone !== rightDone) return leftDone - rightDone
      return left.written - right.written
    }

    /**
     * Lay one group of cards out as a column beside its panel.
     *
     * The column starts level with the panel's heading and runs down it; a card
     * tied to a conversation starts level with that conversation instead, so a
     * thought stands beside the work it is about. When the column runs out of
     * panel it starts another one to the right, rather than growing past the
     * paper the panel sits on.
     * @param {object} bucket - one panel's cards, or the inbox tray.
     * @param {Array<object>} panels - every panel, for keeping clear of them.
     * @param {Array<object>} moves - the places found so far.
     * @returns {void}
     */
    function tidyGroup(bucket, panels, moves) {
      var items = bucket.items
      if (!items.length) return
      items.sort(bucket.tray ? tidyByTray : tidyBySession)
      var panel = bucket.panel
      var top = panel ? panel.y + BOARD_BLOCK_HEAD_H : BOARD_CANVAS_EDGE
      var floor = panel && !bucket.tray ? panel.y + panel.height : Infinity
      var base = panel ? panel.x + panel.width + BOARD_TIDY_GAP : BOARD_CANVAS_EDGE
      var x = base
      if (bucket.tray) {
        // The tray is a queue, not a panel's column: it runs as long as it has
        // to, so only its whole run has to keep clear of what is beside it.
        var span = 0
        for (var t = 0; t < items.length; t++) {
          span += boardCardBox(items[t].card.text, items[t].card.h).height + BOARD_TIDY_STEP
        }
        x = tidyColumnX(panels, top, top + span, base)
      } else {
        x = tidyColumnX(panels, top, floor, base)
      }
      var column = 0
      var cursor = top
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        var height = boardCardBox(item.card.text, item.card.h).height
        var want = cursor
        var anchor = panel && item.sessionId && panel.anchors
          ? panel.anchors[item.sessionId]
          : null
        if (typeof anchor === 'number' && anchor > want) want = anchor
        if (floor !== Infinity && want + height > floor - BOARD_TIDY_STEP) {
          // This column is full unless the card is the first one in it: then it
          // is taller than the panel and the only honest place is its bottom.
          if (cursor > top) {
            column = column + 1
            x = tidyColumnX(panels, top, floor, base + column * (BOARD_CARD_W + BOARD_TIDY_STEP))
            cursor = top
            want = top
          }
          if (want + height > floor - BOARD_TIDY_STEP) want = Math.max(top, floor - height)
        }
        moves.push({ id: item.card.id, x: Math.round(x), y: Math.round(want) })
        cursor = want + height + BOARD_TIDY_STEP
      }
    }

    /**
     * Where the thoughts still on the paper stand, as a list of places.
     *
     * The whole of placing a loose card is here, and nothing here touches the
     * page: give it the cards and the panels, and it answers with where each
     * one goes. Panels are not moves - this is about the thoughts pinned around
     * the work, not about the work itself.
     *
     * A card tied to a conversation that this paint does not draw has nowhere
     * to be pinned, so it joins the tray's column; a card with no tie at all
     * never reaches here, because a tidy puts it away first (see `tidyBoard`).
     * @param {Array<object>} cards - the loose cards, in the order they were written.
     * @param {Array<object>} panels - the panels, in draw order.
     * @returns {Array<object>} one `{id, x, y}` per card.
     */
    function tidyPlan(cards, panels) {
      var moves = []
      if (!cards || !cards.length || !panels || !panels.length) return moves
      var buckets = []
      var inbox = { panel: null, items: [], tray: true }
      var p
      for (p = 0; p < panels.length; p++) {
        buckets.push({ panel: panels[p], items: [], tray: false })
        if (panels[p].kind === 'inbox') inbox.panel = panels[p]
      }
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i]
        // A card already put away is not on the paper, so it is not something a
        // tidy has an opinion about.
        if (card.filed) continue
        var home = tidyHomeOf(card, panels)
        var bucket = home && buckets[home.panel] ? buckets[home.panel] : inbox
        bucket.items.push({
          card: card,
          sessionId: home ? home.sessionId : '',
          order: home ? home.order : i,
          written: i,
        })
      }
      for (var b = 0; b < buckets.length; b++) tidyGroup(buckets[b], panels, moves)
      tidyGroup(inbox, panels, moves)
      return moves
    }

    /**
     * The order a tidy packs panels in: left to right, top to bottom, tray last.
     *
     * A tidy that reshuffled the reader's goals would make the canvas a new
     * place to learn, so the order it packs by is the order the eye already
     * reads: the panel standing highest first, then the one to its right. The
     * inbox is the exception and always goes last: it is the tray everything
     * falls into, and it belongs at the end of the flow rather than in the
     * middle of the work.
     * @param {Array<object>} panels - the panel records.
     * @returns {Array<object>} the same panels, in packing order.
     */
    function tidyPanelOrder(panels) {
      return (panels || []).slice().sort(function (left, right) {
        if (left.kind !== right.kind) {
          if (left.kind === 'inbox') return 1
          if (right.kind === 'inbox') return -1
        }
        if (left.y !== right.y) return left.y - right.y
        if (left.x !== right.x) return left.x - right.x
        return String(left.key) < String(right.key) ? -1 : 1
      })
    }

    /**
     * How wide one row of a tidy may be, in unzoomed pixels.
     *
     * The reader's own window decides, so the packed board reads as one screen
     * rather than as a fixed three-column grid that leaves half a wide monitor
     * empty and crowds a narrow one. A window that cannot be measured - a host
     * that reports no boxes, the first paint - falls back to the grid the board
     * was planned at, and no row is ever wider than four panel columns.
     * @returns {number} the room one row has.
     */
    function tidyRowWidth() {
      var body = BOARD.body
      var zoom = BOARD.zoom || 1
      var wide = body ? (Number(body.clientWidth) || 0) / zoom : 0
      if (!(wide > 0)) {
        wide = BOARD_BLOCK_COLUMNS * BOARD_BLOCK_PITCH_X - BOARD_BLOCK_GAP_X + BOARD_CANVAS_EDGE * 2
      }
      var cap = BOARD_TIDY_COLUMNS * BOARD_BLOCK_PITCH_X - BOARD_BLOCK_GAP_X
      return Math.max(BOARD_BLOCK_W, Math.min(wide - BOARD_CANVAS_EDGE * 2, cap))
    }

    /**
     * Where every panel stands after a tidy.
     *
     * A shelf pack, not a fixed grid: each panel keeps the width it really
     * takes - a goal with three conversations is wide, a quiet one is not - and
     * a row wraps the moment the next one would not fit. Every row is level at
     * the top it is given and clears the tallest panel in the row above it by
     * one gap, so the canvas reads as a set of rows with air between them
     * rather than as one tall pile. The width of a row comes from the window
     * (see `tidyRowWidth`), which is what lets a wide screen hold four goals
     * beside each other and a narrow one hold just one.
     * @param {Array<object>} panels - the panel records.
     * @returns {object} block key -> `{x, y}`.
     */
    function tidyPlaces(panels) {
      var order = tidyPanelOrder(panels)
      var edge = BOARD_CANVAS_EDGE
      var rowWidth = tidyRowWidth()
      var places = Object.create(null)
      var x = edge
      var y = edge
      var rowTall = 0
      for (var i = 0; i < order.length; i++) {
        var panel = order[i]
        var wide = Math.max(1, Number(panel.width) || BOARD_BLOCK_W)
        var tall = Math.max(1, Number(panel.height) || BOARD_BLOCK_H)
        // A panel wider than the row still gets a row of its own: wrapping it
        // onto the next line is what keeps it from pushing a neighbour off.
        if (x > edge && x + wide > edge + rowWidth) {
          x = edge
          y = y + rowTall + BOARD_BLOCK_GAP_Y
          rowTall = 0
        }
        places[panel.key] = { x: Math.round(x), y: Math.round(y) }
        x = x + wide + BOARD_BLOCK_GAP_X
        if (tall > rowTall) rowTall = tall
      }
      return places
    }

    /**
     * Tidy the canvas: put the thoughts where they belong, then lay the panels
     * out as an even grid that fits the window.
     *
     * A thought with nothing to belong to is what the inbox is for, so this is
     * the press that gathers them: every card with no tie is put away in the
     * tray, where the reader can still see it and take it back out. That is
     * done before anything is measured, and painted at once, because the tray
     * grows by one line per card and its new height is part of the layout.
     *
     * The panels come next, packed as rows with the same air between them (see
     * `tidyPlaces`). A panel that moves glides there, and the loose cards are
     * placed once the panels have settled, so a thought tied to a conversation
     * that is not on the canvas still stands clear of the new rows.
     * @returns {boolean} whether anything was moved.
     */
    function tidyBoard() {
      if (!BOARD.open || !BOARD.stage) return false
      if (BOARD.drag || BOARD.tidy || BOARD.glide) return false
      // A sheet open on the paper is a thought being written: it lands here
      // first, so a tidy gathers it with everything else instead of leaving it
      // floating over a canvas that has just moved.
      if (BOARD.ideaFocusHost) closeIdeaFocus({ paint: false })
      // A card being typed into is about to move: what it says is folded in
      // first, so the place it lands is the place its words ask for.
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
        BOARD.cardEditing = ''
        BOARD.cardEditor = null
      }
      var cards = BOARD_STORE.cards()
      var filed = 0
      for (var c = 0; c < cards.length; c++) {
        var card = cards[c]
        // A tie is what keeps a thought on the paper; a card put away already
        // has a place, and one with no tie has none.
        if (card.filed || card.link) continue
        if (BOARD_STORE.fileCard(card.id, BOARD_INBOX)) filed = filed + 1
      }
      if (filed) {
        // The tray's new lines are laid out by this paint, and its height is
        // what the packing below measures: one paint before, one after.
        // A tray folded away must not swallow what a tidy just gathered: the
        // reader has to see where the thoughts went.
        if (BOARD_STORE.isFolded(BOARD_INBOX)) BOARD_STORE.toggleBlockFold(BOARD_INBOX)
        renderBoard()
        if (!BOARD.open) return true
        showToast(paletteText('boardFiled'))
      }
      var panels = tidyPanels()
      var places = tidyPlaces(panels)
      var batch = []
      if (typeof BOARD.stage.querySelectorAll === 'function') {
        var painted = BOARD.stage.querySelectorAll('[data-role="workspaceBlock"]')
        var nodes = Object.create(null)
        for (var p = 0; p < painted.length; p++) {
          var key = painted[p].getAttribute('data-block')
          if (key) nodes[key] = painted[p]
        }
        for (var i = 0; i < panels.length; i++) {
          var panel = panels[i]
          var place = places[panel.key]
          if (!place) continue
          var node = nodes[panel.key]
          if (!node) continue
          var fromX = Number(parseFloat(node.style.left)) || 0
          var fromY = Number(parseFloat(node.style.top)) || 0
          if (Math.abs(fromX - place.x) < 1 && Math.abs(fromY - place.y) < 1) continue
          batch.push({
            key: panel.key,
            node: node,
            fromX: fromX,
            fromY: fromY,
            toX: place.x,
            toY: place.y,
          })
        }
      }
      if (batch.length) {
        glideTidyPanels(batch)
        return true
      }
      tidyLooseCards()
      if (BOARD.fits) fitBoardToWindow()
      return filed > 0
    }

    /**
     * Put the thoughts that are still on the paper clear of the panels.
     *
     * After a tidy files the untied ones away, the only cards left on the paper
     * are thoughts tied to a conversation this paint cannot draw - folded away,
     * taken off, or left on an older page. They belong beside the tray, as one
     * column each, which is the same place the reader would drop them.
     * @returns {boolean} whether anything was moved.
     */
    function tidyLooseCards() {
      var cards = BOARD_STORE.cards()
      var loose = []
      for (var i = 0; i < cards.length; i++) {
        // A card drawn under its conversation is not on the paper, so a tidy
        // has no place to give it.
        if (cards[i].filed || boardCardStacked(cards[i])) continue
        loose.push(cards[i])
      }
      if (!loose.length) return false
      var moves = tidyPlan(loose, tidyPanels())
      var batch = []
      for (var m = 0; m < moves.length; m++) {
        var node = BOARD.looseNodes[moves[m].id]
        if (!node) continue
        var fromX = Number(parseFloat(node.style.left)) || 0
        var fromY = Number(parseFloat(node.style.top)) || 0
        if (Math.abs(fromX - moves[m].x) < 1 && Math.abs(fromY - moves[m].y) < 1) continue
        batch.push({
          id: moves[m].id,
          node: node,
          fromX: fromX,
          fromY: fromY,
          toX: moves[m].x,
          toY: moves[m].y,
        })
      }
      if (!batch.length) return false
      if (typeof window.requestAnimationFrame !== 'function' || reducedMotion()) {
        for (var j = 0; j < batch.length; j++) {
          BOARD_STORE.moveCard(batch[j].id, batch[j].toX, batch[j].toY)
        }
        renderBoard()
        return true
      }
      glideTidyBatch(batch)
      return true
    }

    /**
     * Slide one tidy's panels to their new places, then put the cards around
     * them.
     *
     * The place is written only once the panel has arrived: a tidy the reader
     * cancels by leaving the board costs nothing. The panels move together
     * rather than a beat apart - they are one layout, and watching them arrive
     * one by one would read as a list being sorted rather than a canvas being
     * squared up. The loose cards wait for the settle, because where they may
     * stand is a fact about where the panels ended.
     * @param {Array<object>} batch - the panels that move, with both places.
     * @returns {void}
     */
    function glideTidyPanels(batch) {
      BOARD.tidy = true
      var started = 0
      function settle() {
        BOARD.tidy = false
        for (var s = 0; s < batch.length; s++) {
          BOARD_STORE.placeBlock(batch[s].key, batch[s].toX, batch[s].toY)
        }
        renderBoard()
        // A canvas the reader fitted to the window keeps that promise after a
        // tidy moved everything: the new rows are measured, then fitted.
        if (BOARD.fits) fitBoardToWindow()
        if (BOARD.open) tidyLooseCards()
      }
      if (typeof window.requestAnimationFrame !== 'function' || reducedMotion()) {
        settle()
        return
      }
      function step(now) {
        if (!BOARD.open || !BOARD.stage) {
          BOARD.tidy = false
          return
        }
        if (!started) started = now
        var at = (now - started) / BOARD_TIDY_GLIDE
        if (at > 1) at = 1
        var eased = 1 - Math.pow(1 - at, 3)
        for (var k = 0; k < batch.length; k++) {
          var item = batch[k]
          if (!item.node.style) continue
          item.node.style.left = (item.fromX + (item.toX - item.fromX) * eased) + 'px'
          item.node.style.top = (item.fromY + (item.toY - item.fromY) * eased) + 'px'
        }
        drawCardLinks()
        if (at < 1) {
          window.requestAnimationFrame(step)
          return
        }
        settle()
      }
      window.requestAnimationFrame(step)
    }

    /**
     * Fly one tidy's cards to their places, a beat apart.
     *
     * A jump would read as the cards being taken away and different cards
     * appearing; a short ease reads as the canvas putting them away. The cards
     * leave in the order they were written, which is the order the eye followed
     * them in, and the lines are redrawn every frame so a tie stays attached on
     * the way.
     * @param {Array<object>} batch - the cards that move, with both places.
     * @returns {void}
     */
    function glideTidyBatch(batch) {
      BOARD.tidy = true
      var stagger = Math.min(24, Math.round(240 / batch.length))
      var total = BOARD_TIDY_GLIDE + stagger * (batch.length - 1)
      var started = 0
      for (var i = 0; i < batch.length; i++) {
        batch[i].delay = i * stagger
        var style = batch[i].node.style
        if (!style) continue
        // Airborne: above the paper it crosses, and not something the pointer
        // can pick up on the way.
        style.zIndex = String(BOARD.zTop + 20)
        style.pointerEvents = 'none'
        style.transform = 'scale(1.015)'
      }
      function settle() {
        BOARD.tidy = false
        for (var s = 0; s < batch.length; s++) {
          BOARD_STORE.moveCard(batch[s].id, batch[s].toX, batch[s].toY)
        }
        renderBoard()
      }
      function step(now) {
        if (!BOARD.open || !BOARD.stage) {
          BOARD.tidy = false
          return
        }
        if (!started) started = now
        var elapsed = now - started
        for (var k = 0; k < batch.length; k++) {
          var item = batch[k]
          if (!item.node.style) continue
          var at = (elapsed - item.delay) / BOARD_TIDY_GLIDE
          if (at <= 0) continue
          if (at > 1) at = 1
          var eased = 1 - Math.pow(1 - at, 3)
          item.node.style.left = (item.fromX + (item.toX - item.fromX) * eased) + 'px'
          item.node.style.top = (item.fromY + (item.toY - item.fromY) * eased) + 'px'
        }
        drawCardLinks()
        if (elapsed < total) {
          window.requestAnimationFrame(step)
          return
        }
        settle()
      }
      window.requestAnimationFrame(step)
    }

    /**
     * Mount the board.
     *
     * A board and a task window never share the page: both take the whole
     * keyboard and both answer Escape, so one of them being up is what keeps the
     * other from opening. That is checked here as well as in the key handler,
     * because the console can open either one directly.
     * @returns {boolean} whether the board is up.
     */
    function openBoard() {
      if (BOARD.open) return true
      if (PALETTE.open || MODELPICK.open) return false
      if (!taskServices()) return false
      if (!document.body) return false
      // A host that had not published the status source when this plugin woke
      // up gets a watch now: without one, no card could show how long its turn
      // has been going. The task window retries the same way.
      watchRuns()
      stopHold()
      stopAnim()
      // A window that takes the keyboard ends any claim the message box had on
      // it, the same way the task window does.
      clearFocusRequest()

      var host = document.createElement('div')
      Object.assign(host.style, BOARD_UI.backdrop)
      var panel = document.createElement('div')
      Object.assign(panel.style, BOARD_UI.panel)
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', paletteText('board'))
      panel.className = 'dshv-window'
      // A canvas is read at a glance from a distance, so it starts at the
      // reader's own preference or larger — never below what a title needs to be
      // read without leaning in. Everything inside is sized in em against this.
      panel.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
      host.appendChild(panel)
      document.body.appendChild(host)
      BOARD.host = host
      if (!mountBoardInto(panel, 'overlay')) {
        document.body.removeChild(host)
        BOARD.host = null
        return false
      }
      if (state.debug) console.log('[dsh-vim] board', BOARD.rows.length, 'conversations')
      return true
    }

    /**
     * Build the board's parts into a root element, whichever mount owns it.
     *
     * The overlay wraps this in a backdrop and a sheet; the sidebar page hands
     * it the page's own column. The header, the column strip and the footer are
     * the board in both, so a change here reaches both without a second
     * implementation to keep in step.
     * @param {Element} root - the element the board is built into.
     * @param {string} mode - 'overlay' or 'page'.
     * @returns {boolean} whether the board was mounted.
     */
    function mountBoardInto(root, mode) {
      if (BOARD.open) return false
      if (!taskServices()) return false
      watchRuns()
      // A page can open long after the branch was made, so the watch is also
      // started here rather than only when the plugin wakes.
      watchForks()
      stopHold()
      stopAnim()
      // A board that takes the keyboard ends any claim the message box had on
      // it; a page does not take the keyboard, so it leaves the claim alone.
      if (mode === 'overlay') clearFocusRequest()
      if (mode === 'page') {
        applyBoardPageInk(root)
        Object.assign(root.style, BOARD_PAGE_UI.surface)
        // A canvas is read at a glance from a distance, so it starts at the
        // reader's own preference or larger — never below what a title needs to
        // be read without leaning in.
        root.style.fontSize = Math.max(settings.paletteFont, BOARD_MIN_FONT) + 'px'
      }

      var header = document.createElement('div')
      Object.assign(header.style, mode === 'page' ? BOARD_PAGE_UI.header : BOARD_UI.header)
      var title = document.createElement('span')
      Object.assign(title.style, BOARD_UI.titleText)
      title.textContent = paletteText('board')
      var count = document.createElement('span')
      Object.assign(count.style, BOARD_UI.subtitle)
      var only = document.createElement('span')
      Object.assign(only.style, BOARD_UI.starFilter)
      only.setAttribute('role', 'button')
      only.setAttribute('data-role', 'starFilter')
      if (BOARD.onlyStarred) Object.assign(only.style, BOARD_UI.starFilterOn)
      only.textContent = paletteText('boardOnlyStarred')
      only.addEventListener('click', function () {
        BOARD.onlyStarred = !BOARD.onlyStarred
        renderBoard()
      })
      BOARD.starFilter = only
      var zoom = document.createElement('div')
      Object.assign(zoom.style, BOARD_UI.zoomBox)
      var zoomOut = document.createElement('span')
      Object.assign(zoomOut.style, BOARD_UI.zoomButton)
      zoomOut.setAttribute('role', 'button')
      zoomOut.setAttribute('data-role', 'zoomOut')
      zoomOut.setAttribute('title', paletteText('boardZoomOut'))
      zoomOut.textContent = '−'
      zoomOut.addEventListener('click', function () {
        setBoardZoom(BOARD.zoom / BOARD_ZOOM_STEP)
      })
      var zoomLabel = document.createElement('span')
      Object.assign(zoomLabel.style, BOARD_UI.zoomLabel)
      zoomLabel.setAttribute('role', 'button')
      zoomLabel.setAttribute('data-role', 'zoomReset')
      zoomLabel.setAttribute('title', paletteText('boardZoomReset'))
      var zoomIn = document.createElement('span')
      Object.assign(zoomIn.style, BOARD_UI.zoomButton)
      zoomIn.setAttribute('role', 'button')
      zoomIn.setAttribute('data-role', 'zoomIn')
      zoomIn.setAttribute('title', paletteText('boardZoomIn'))
      zoomIn.textContent = '+'
      zoomIn.addEventListener('click', function () {
        setBoardZoom(BOARD.zoom * BOARD_ZOOM_STEP)
      })
      zoomLabel.addEventListener('click', function () {
        setBoardZoom(1)
      })
      // The one press that answers "I cannot see all of this": scale the paper
      // to the window until it fits, then follow the window while it holds.
      var zoomFit = document.createElement('span')
      Object.assign(zoomFit.style, BOARD_UI.zoomFit)
      zoomFit.setAttribute('role', 'button')
      zoomFit.setAttribute('data-role', 'zoomFit')
      zoomFit.setAttribute('title', paletteText('boardZoomFit'))
      zoomFit.setAttribute('aria-label', paletteText('boardZoomFit'))
      zoomFit.appendChild(boardIcon('fit', 12))
      zoomFit.addEventListener('click', function () {
        fitBoardToWindow()
      })
      zoom.appendChild(zoomOut)
      zoom.appendChild(zoomLabel)
      zoom.appendChild(zoomIn)
      zoom.appendChild(zoomFit)

      var arrange = document.createElement('span')
      Object.assign(arrange.style, BOARD_UI.action)
      arrange.setAttribute('role', 'button')
      arrange.setAttribute('data-role', 'tidyBoard')
      arrange.setAttribute('title', paletteText('boardArrangeHint'))
      arrange.textContent = paletteText('boardArrange')
      arrange.addEventListener('click', function () {
        tidyBoard()
      })
      var write = document.createElement('span')
      Object.assign(write.style, BOARD_UI.action)
      write.setAttribute('role', 'button')
      write.setAttribute('data-role', 'addCard')
      write.setAttribute('title', paletteText('boardAddCardHint'))
      write.textContent = paletteText('boardAddCard')
      write.addEventListener('click', function () {
        addBoardCard(write)
      })
      // A place for work that has not started yet. Until this button existed, a
      // goal could only be born from a conversation, which made the board a
      // record of the past rather than a plan for the day.
      var makeGoal = document.createElement('span')
      Object.assign(makeGoal.style, BOARD_UI.action)
      makeGoal.setAttribute('role', 'button')
      makeGoal.setAttribute('data-role', 'addGoal')
      makeGoal.setAttribute('title', paletteText('boardAddGoalHint'))
      makeGoal.textContent = paletteText('boardAddGoal')
      makeGoal.addEventListener('click', function () {
        addBoardGoal()
      })

      header.appendChild(title)
      header.appendChild(count)
      header.appendChild(only)
      // The way back is a button, not a key: the board's keys are letters, and a
      // modifier chord would be the one binding nobody could see. Both buttons say
      // when there is nothing to step to.
      var undo = document.createElement('span')
      Object.assign(undo.style, BOARD_UI.action)
      undo.setAttribute('role', 'button')
      undo.setAttribute('data-role', 'boardUndo')
      undo.setAttribute('title', paletteText('boardUndoHint'))
      undo.textContent = paletteText('boardUndo')
      undo.addEventListener('click', function () {
        if (!BOARD_HISTORY.canUndo()) return
        BOARD_HISTORY.undo()
        if (BOARD.open) renderBoard()
      })
      var redo = document.createElement('span')
      Object.assign(redo.style, BOARD_UI.action)
      redo.setAttribute('role', 'button')
      redo.setAttribute('data-role', 'boardRedo')
      redo.setAttribute('title', paletteText('boardRedoHint'))
      redo.textContent = paletteText('boardRedo')
      redo.addEventListener('click', function () {
        if (!BOARD_HISTORY.canRedo()) return
        BOARD_HISTORY.redo()
        if (BOARD.open) renderBoard()
      })
      // The way back past today: one page for every day the board was drawn on,
      // opened read-only beside the canvas.
      var historyChip = document.createElement('span')
      Object.assign(historyChip.style, BOARD_UI.action)
      historyChip.setAttribute('role', 'button')
      historyChip.setAttribute('data-role', 'boardHistory')
      historyChip.setAttribute('title', paletteText('boardHistoryHint'))
      historyChip.setAttribute('aria-label', paletteText('boardHistoryHint'))
      historyChip.textContent = paletteText('boardHistory')
      historyChip.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        openBoardHistory()
      })
      BOARD.undoButton = undo
      BOARD.redoButton = redo
      BOARD.historyButton = historyChip
      header.appendChild(zoom)
      header.appendChild(undo)
      header.appendChild(redo)
      header.appendChild(arrange)
      header.appendChild(write)
      header.appendChild(makeGoal)
      header.appendChild(historyChip)
      // The last chip on the right is the way out of the canvas into the day's
      // numbers. Only a host with the layout panel has pages to step onto, so a
      // host that keeps the floating board is not offered a door to nowhere.
      var overviewLayout = serviceOf(taskCtx, 'layout')
      if (overviewLayout && typeof overviewLayout.selectPanel === 'function') {
        var overviewChip = document.createElement('span')
        Object.assign(overviewChip.style, BOARD_UI.action)
        overviewChip.setAttribute('role', 'button')
        overviewChip.setAttribute('data-role', 'boardOverview')
        overviewChip.setAttribute('title', paletteText('hintOverview'))
        overviewChip.textContent = paletteText('overview')
        overviewChip.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          showOverview()
        })
        header.appendChild(overviewChip)
      }

      var body = document.createElement('div')
      Object.assign(body.style, mode === 'page' ? BOARD_PAGE_UI.body : BOARD_UI.body)
      body.setAttribute('data-role', 'boardCanvas')
      body.addEventListener('pointerdown', boardPointerDown)
      body.addEventListener('dblclick', onBoardDoubleClick)
      // A transformed stage cannot size its own scroller: the paper around it
      // takes the magnified measurements, and the stage draws at full size
      // inside it. Without this, zooming out would leave a canvas that scrolls
      // as if nothing had changed.
      var sizer = document.createElement('div')
      Object.assign(sizer.style, BOARD_UI.sizer)
      sizer.setAttribute('data-role', 'boardPaper')
      var stage = document.createElement('div')
      Object.assign(stage.style, BOARD_UI.stage)
      stage.setAttribute('data-role', 'boardStage')
      sizer.appendChild(stage)
      body.appendChild(sizer)
      body.addEventListener('wheel', onBoardWheel, { passive: false })
      // The shell's session rows are natively draggable — the gesture the
      // reader already uses to reorder the sidebar — and what a row carries is
      // its conversation's id as plain text. That makes the same gesture a way
      // in: a row let go on the canvas becomes a card here, so the board is
      // reachable from the very list it is read beside.
      body.addEventListener('dragover', onBoardDragOver)
      body.addEventListener('dragleave', onBoardDragLeave)
      body.addEventListener('drop', onBoardDrop)

      var footer = document.createElement('div')
      Object.assign(footer.style, mode === 'page' ? BOARD_PAGE_UI.footer : BOARD_UI.footer)
      footer.textContent = paletteText(mode === 'page' ? 'boardPageHint' : 'boardHint')

      root.appendChild(header)
      root.appendChild(body)
      root.appendChild(footer)

      // A new gesture starts with no drag behind it. Capture runs before the
      // card's own press, so the click that follows a drag still sees the flag
      // it set — and the next press, however soon, does not.
      root.addEventListener('pointerdown', function () {
        if (!BOARD.drag) BOARD.dragged = false
      }, true)
      BOARD.open = true
      BOARD.mode = mode
      BOARD.panel = root
      BOARD.body = body
      BOARD.sizer = sizer
      BOARD.stage = stage
      BOARD.zoom = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, BOARD_STORE.zoom()))
      BOARD.zoomLabel = zoomLabel
      // A board opens at the scale the page remembers, not in fit mode: the
      // fit follows a window the reader resizes, and a fresh window has not
      // been resized yet.
      BOARD.fits = false
      BOARD.linkLayer = null
      BOARD.glide = ''
      BOARD.count = count
      BOARD.unsubscribes = []
      BOARD.blocks = []
      BOARD.inbox = []
      BOARD.nodes = []
      BOARD.cardEditing = ''
      BOARD.cardEditor = null
      BOARD.ideaFocus = ''
      BOARD.ideaFocusHost = null
      BOARD.ideaFocusSheet = null
      BOARD.ideaFocusTitle = null
      BOARD.ideaFocusBody = null
      BOARD.ideaFocusDone = null
      BOARD.ideaFocusAt = null
      BOARD.ideaFocusRaf = 0
      BOARD.paintOwed = false
      renderBoard()
      startDayTimer()

      // Both feeds can change under an open board: a conversation can be
      // touched, archived or created while the board is up. The status feed
      // goes through the throttled repaint, because it can tick often while a
      // turn streams and a tick that changed no card's word is not a repaint.
      var services = taskServices()
      // A tick that arrives by itself is a paint like any other, and the rule
      // about open fields is inside `renderBoard`: this is where the board says
      // what it listens to, not where it decides whether a paint may land.
      if (typeof services.list.subscribe === 'function') {
        BOARD.unsubscribes.push(services.list.subscribe(function () {
          renderBoard()
        }))
      }
      if (services.workspaces && typeof services.workspaces.subscribe === 'function') {
        BOARD.unsubscribes.push(services.workspaces.subscribe(function () {
          renderBoard()
        }))
      }
      if (services.status && typeof services.status.subscribe === 'function') {
        BOARD.unsubscribes.push(services.status.subscribe(function () {
          renderBoardOnStatus()
        }))
      }
      // A native drag that ends anywhere — dropped here, let go back over the
      // sidebar, or cancelled with Escape — owes the canvas its highlight.
      // `dragend` follows the row that started the drag, so the listener lives
      // where every end can reach it, and leaves with the mount.
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('dragend', onNativeDragEnd)
        BOARD.unsubscribes.push(function () {
          document.removeEventListener('dragend', onNativeDragEnd)
        })
      }
      // A canvas fitted to the window has to stay fitted when the window moves
      // under it. The listener is here rather than at open time so the page
      // mount gets it too, and it leaves with the board.
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', onBoardResize)
        BOARD.unsubscribes.push(function () {
          window.removeEventListener('resize', onBoardResize)
        })
      }
      return true
    }

    /**
     * Unmount the board, whichever mount holds it.
     *
     * The page's container belongs to the React component that rendered it, so
     * this drops the state and the subscriptions and leaves the empty element
     * alone; removing the element is the overlay's own job, below.
     * @returns {boolean} whether a board was up.
     */
    function unmountBoard() {
      if (!BOARD.open) return false
      BOARD.open = false
      stopDayTimer()
      closeBoardHistory()
      for (var i = 0; i < BOARD.unsubscribes.length; i++) {
        try {
          BOARD.unsubscribes[i]()
        } catch (error) {
          console.warn('[dsh-vim] board feed unsubscribe failed', error)
        }
      }
      BOARD.unsubscribes = []
      // A window that goes away takes its gesture with it, ghost included.
      endBoardDrag()
      // And its clocks: the tick belongs to the cards on screen, and there
      // are none left to keep honest.
      stopBoardClock()
      BOARD.clocks = []
      BOARD.statuses = ''
      BOARD.noteEditing = ''
      BOARD.noteEditor = null
      // The new-conversation sheet belongs to the window that opened it: its
      // fields and its half-written title leave with the board.
      closeNewSessionSheet()
      // The idea sheet is the board's too. An existing card keeps the words it
      // wrote, and a draft still lands: closing the canvas is not a reason to
      // lose the sentence that was being written into it.
      closeIdeaFocus({ paint: false })
      BOARD.cardEditing = ''
      BOARD.cardEditor = null
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
      // The day's summary is a page on this window: a reference left behind
      // would be a key handler answering a node that is no longer on screen.
      closeSeal()
      BOARD.panel = null
      BOARD.body = null
      BOARD.sizer = null
      BOARD.stage = null
      BOARD.zoomLabel = null
      BOARD.fits = false
      BOARD.linkLayer = null
      BOARD.undoButton = null
      BOARD.redoButton = null
      BOARD.glide = ''
      // A tidy in flight writes nothing when its board is gone, so the flag it
      // holds must not outlive the window: the next board would draw nothing.
      BOARD.tidy = false
      BOARD.count = null
      BOARD.inbox = []
      BOARD.front = ''
      BOARD.dropGoal = null
      // The line being typed is kept, and a goal the toolbar started that never
      // got one is let go: a draft is a place for a decision, and the board
      // going away is the decision.
      if (BOARD.intentBlock && BOARD.intentInput) commitGoalIntent(false)
      BOARD.intentBlock = ''
      BOARD.intentInput = null
      if (BOARD.blocks.length) {
        var standing = []
        for (var s = 0; s < BOARD.blocks.length; s++) {
          var held = BOARD.blocks[s]
          if (BOARD.drafts[held.key] && !held.rows.length && !BOARD_STORE.intentOf(held.key)) continue
          standing.push(held.key)
        }
        BOARD_STORE.pruneGoals(standing)
      }
      BOARD.drafts = Object.create(null)
      BOARD.renamingBlock = ''
      BOARD.renameBlockInput = null
      BOARD.renameCardDraft = null
      // The goal's menu is a press-time visitor, not a record: a window that
      // closes with it open must not open the next one with it still standing.
      BOARD.goalMenu = ''
      // The names that stood in for the feed, and the completions that have had
      // their beat, both belong to the visit: the next board reads the list
      // again, and a completion still unread gets its beat back.
      if (BOARD.titleTimer) {
        window.clearTimeout(BOARD.titleTimer)
        BOARD.titleTimer = 0
      }
      BOARD.titles = Object.create(null)
      BOARD.freshed = Object.create(null)
      // A branch still being made belongs to a board that is no longer up: its
      // card is gone with the canvas, and the next visit must draw the mark as
      // ready rather than as a press that will never be answered.
      BOARD.forking = Object.create(null)
      BOARD.blocks = []
      BOARD.nodes = []
      BOARD.folders = Object.create(null)
      // The "only marked" view is a way of reading the board for a moment, not
      // a setting: the next opening starts from everything.
      BOARD.onlyStarred = false
      // The bin's chip and list live on this board's heading: the next visit
      // builds its own, and a reference left behind would write into a heading
      // that is no longer on the page.
      BOARD.doneBinOpen = false
      BOARD.doneBinFilter = ''
      BOARD.doneBin = null
      BOARD.doneBinPanel = null
      BOARD.dragged = false
      return true
    }

    /** Take the floating board down, element and all. */
    function closeBoard() {
      if (!BOARD.open && !BOARD.host) return false
      unmountBoard()
      if (BOARD.host && BOARD.host.parentNode) {
        BOARD.host.parentNode.removeChild(BOARD.host)
      }
      BOARD.host = null
      return true
    }

    /**
     * Repaint the whole canvas from the feeds.
     *
     * Cheap enough to do wholesale: a handful of panels, their cards, and the
     * loose cards. A repaint that had to hold a half-finished gesture in place
     * would have to be incremental instead, which is why one returns while a
     * drag is in progress.
     * @returns {void}
     */
    /**
     * Whether the reader is typing into one of the board's own fields.
     *
     * The fields are this plugin's elements, rebuilt with everything else, so a
     * paint that lands while one is open takes the caret and the sentence with
     * it - which reads as a field you cannot type in.
     * @returns {boolean} true while a field is open.
     */
    function boardFieldOpen() {
      // Only a field that is still on the page can be destroyed by a paint. A field
      // being opened has no element yet, which is what lets the paint that opens
      // it through while every stray paint after it waits. "On the page" is asked
      // of the stage rather than of `isConnected`: the stage is what a paint
      // replaces, so it answers for the paint without depending on a mount having
      // detached what it dropped.
      var fields = [
        BOARD.noteEditor,
        BOARD.cardEditor,
        BOARD.renameCardInput,
        BOARD.renameBlockInput,
        BOARD.intentInput,
      ]
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i]
        if (!field) continue
        if (BOARD.stage && typeof BOARD.stage.contains === 'function') {
          if (BOARD.stage.contains(field)) return true
          continue
        }
        if (field.isConnected) return true
      }
      return false
    }

    function renderBoard() {
      if (!BOARD.open || !BOARD.body || !BOARD.stage) return
      // A repaint mid-gesture would take the panel out from under the pointer,
      // and one mid-tidy would take a card out of the air.
      if (BOARD.drag || BOARD.glide || BOARD.tidy) return
      // A paint must never land on an open field. The rule lives here, once,
      // rather than in each caller: a feed tick, a landed turn count and the
      // plugin's own housekeeping all end up in this function, and every one of
      // them used to be able to rebuild the stage under the caret. What such a
      // paint would have shown is drawn by the paint that closes the field.
      if (boardFieldOpen()) return
      // A new day is filed before anything is drawn: the page left behind belongs
      // to yesterday, and today's starts from the members it carried.
      settleDay()
      // A document a full store refused is offered again here: the store may have
      // room now, and the reader's last press is still the one in hand.
      BOARD_STORE.flush()
      // The paint a press's settle owed is paid the moment a paint lands: from
      // here on the page says what the store says.
      BOARD.paintOwed = false
      // A card being typed into is rebuilt with the rest, so what it says is
      // folded into the store first. Typing also writes on every input, so this
      // is only the last keystroke that had not landed yet.
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD_STORE.setCardText(BOARD.cardEditing, BOARD.cardEditor.value)
      }
      // How tall each panel stood on the paint being taken down. A fresh
      // block is packed against the panels already standing, and the only
      // honest word on how much paper a panel occupies is the height it
      // measured: a goal with a long list of conversations hangs past the
      // grid row it was given, and a neighbour set down on the row below it
      // would land on its cards. A host that reports no boxes — and the
      // first paint of all — answers nothing, and the pitch every panel is
      // planned at stands in (see `boardPanelHeights`).
      var carried = boardPanelHeights()
      var carriedWide = boardPanelWidths()
      BOARD.stage.textContent = ''
      BOARD.nodes = []
      BOARD.looseNodes = Object.create(null)
      BOARD.stacks = []
      BOARD.dropZones = []
      BOARD.lines = []
      BOARD.noteEditor = null
      BOARD.cardEditor = null
      BOARD.clocks = []
      BOARD.folders = folderIndex()
      var pool = conversationPool()
      // A name the reader sent and the shell has not echoed yet is dropped here,
      // where the list this paint draws is already in hand.
      settleTitles(pool)
      // The order a panel remembers is the one table in the document that grows
      // by itself: one id per conversation ever drawn there. Anything this paint
      // cannot draw has nothing left to sort, and a carried row is still drawn -
      // so the list to keep is the pool plus what came in from the last page.
      if (Date.now() - (BOARD.prunedAt || 0) > BOARD_PRUNE_MS) {
        BOARD.prunedAt = Date.now()
        var kept = []
        for (var keptAt = 0; keptAt < pool.length; keptAt++) kept.push(pool[keptAt].id)
        var brought = CARRY.all()
        for (var broughtId in brought) {
          if (Object.prototype.hasOwnProperty.call(brought, broughtId)) kept.push(broughtId)
        }
        BOARD_STORE.prune(kept)
      }
      var blocks = boardBlocks(pool)
      var places = boardPlaces(blocks, carried, carriedWide)
      BOARD.blocks = blocks
      BOARD.slots = boardSlots(blocks)
      // After the paint's own assignment, so a place drawn for the first time is
      // already wearing the seat it was just given.
      BOARD.seats = BOARD_STORE.seats()
      BOARD.verdicts = BOARD_STORE.verdicts()
      BOARD.rows = []
      var workspaces = 0
      var i
      for (i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === 'workspace') workspaces = workspaces + 1
        BOARD.rows = BOARD.rows.concat(blocks[i].rows)
      }
      BOARD.inbox = blocks.length ? blocks[blocks.length - 1].rows.slice() : []
      var titles = Object.create(null)
      for (i = 0; i < pool.length; i++) titles[pool[i].id] = boardTitleOf(pool[i])
      BOARD.dupes = boardNameCollisions(titles)
      for (i = 0; i < blocks.length; i++) {
        BOARD.stage.appendChild(buildBoardBlock(blocks[i], places[blocks[i].key], titles))
      }
      // The paper is sized last, because a panel is as tall as the
      // conversations in it and only the painted panels know that height:
      // the boxes are on the page by now, so the tallest of them can be
      // read rather than guessed, and the scrollbars the reader is about to
      // lean on describe the work that is actually there. A host that
      // reports no boxes falls back to the height every panel is planned at.
      var extent = boardExtent(places, boardPanelHeights(), boardPanelWidths())
      BOARD.extent = extent
      applyBoardZoom()
      // The links live under everything else, on one SVG sheet the size of
      // the paper — under by z-index, so it may be appended after the
      // panels it is sized from. A note can be dragged across the canvas
      // without a repaint; only the paths are rewritten.
      BOARD.linkLayer = null
      if (typeof document.createElementNS === 'function') {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('data-role', 'boardLinks')
        svg.setAttribute('width', String(extent.width))
        svg.setAttribute('height', String(extent.height))
        Object.assign(svg.style, BOARD_UI.linkLayer)
        svg.style.width = extent.width + 'px'
        svg.style.height = extent.height + 'px'
        BOARD.stage.appendChild(svg)
        BOARD.linkLayer = svg
      }
      var cards = BOARD_STORE.cards()
      var drawn = 0
      for (i = 0; i < cards.length; i++) {
        // A filed note is drawn where it was filed, not on the paper as well.
        if (cards[i].filed) continue
        // A thought filed under a conversation is drawn in that conversation's
        // column already; drawing it loose as well would be the same card twice.
        if (boardCardStacked(cards[i])) continue
        var note = buildBoardLooseCard(cards[i], titles)
        // Every card has a number, so overlap has an answer: the one being
        // worked on is the one on top (`BOARD.front`), and the rest stack in the
        // order they are drawn rather than by whichever happened to be last.
        if (BOARD.front !== cards[i].id) note.style.zIndex = String(2 + drawn)
        drawn = drawn + 1
        BOARD.stage.appendChild(note)
      }
      if (!BOARD.rows.length && !cards.length) {
        var empty = document.createElement('div')
        Object.assign(empty.style, BOARD_UI.emptyBoard)
        empty.setAttribute('data-role', 'emptyBoard')
        empty.textContent = paletteText('boardEmptyBoard')
        BOARD.stage.appendChild(empty)
      }
      if (BOARD.count) {
        BOARD.count.textContent =
          paletteText('boardTodayCount') + workspaces + paletteText('boardWorkspacesUnit')
          + BOARD.rows.length + paletteText('boardSessionsUnit')
      }
      paintBoardStarFilter()
      paintHistory()
      paintDoneBin()
      maybeShowSeal()
      // The page this paint draws is the one tomorrow reads. Filed under its own
      // date the moment the day turns over, so a day can be spent with the app
      // shut and still be there the next time it opens.
      var drewOn = dayOf(Date.now())
      noteMoment({
        v: SNAPSHOT_VERSION,
        date: drewOn,
        doc: pageDoc(),
        notes: NOTE_STORE.all(),
        view: pageView(blocks, places, titles, cards, drewOn),
      })
      // The fingerprint this repaint leaves behind is what the throttled status
      // repaint reads itself against.
      BOARD.statuses = boardStatusFingerprint()
      if (BOARD.clocks.length) startBoardClock()
      else stopBoardClock()
      // A field this repaint built is the one the reader asked for: the caret
      // goes in it, at the end of what it already carries.
      if (BOARD.noteEditing && BOARD.noteEditor) {
        BOARD.noteEditor.focus()
        if (typeof BOARD.noteEditor.select === 'function') BOARD.noteEditor.select()
      }
      if (BOARD.cardEditing && BOARD.cardEditor) {
        BOARD.cardEditor.focus()
        if (typeof BOARD.cardEditor.setSelectionRange === 'function') {
          // An empty field starts at its first line - that line is the title, and
          // the reader is about to write it.
          var end = String(BOARD.cardEditor.value || '').length
          BOARD.cardEditor.setSelectionRange(0, end)
          if (!end) BOARD.cardEditor.setSelectionRange(0, 0)
        }
      }
      if (BOARD.renamingBlock && BOARD.renameBlockInput) {
        BOARD.renameBlockInput.focus()
        if (typeof BOARD.renameBlockInput.select === 'function') BOARD.renameBlockInput.select()
      }
      if (BOARD.renamingCard && BOARD.renameCardInput) {
        BOARD.renameCardInput.focus()
        if (typeof BOARD.renameCardInput.select === 'function') BOARD.renameCardInput.select()
      }
      if (BOARD.intentBlock && BOARD.intentInput) {
        BOARD.intentInput.focus()
        if (typeof BOARD.intentInput.select === 'function') BOARD.intentInput.select()
      }
      // The beat is owed once per completion, so the ledger keeps only what is
      // still finished and still on the canvas: a conversation that runs again
      // and finishes again gets its beat again.
      var owed = Object.create(null)
      for (var f = 0; f < BOARD.rows.length; f++) {
        if (!BOARD.freshed[BOARD.rows[f].id]) continue
        var rowState = statusOf(BOARD.rows[f])
        if (rowState && rowState.key === 'done') owed[BOARD.rows[f].id] = true
      }
      BOARD.freshed = owed
      // Last, because it measures what was just put on the page.
      drawCardLinks()
      // The bin's list is the one thing on the board that floats above the
      // canvas rather than lying on it, so it is mounted last and taken down by
      // the next paint that does not want it.
      // A focus sheet is mounted on the panel rather than on this stage, so a
      // paint leaves it standing. If the card it was showing is gone, the sheet
      // goes with it; otherwise its done mark is read from the fresh store.
      if (BOARD.ideaFocusHost) {
        if (BOARD.ideaFocus && !ideaFocusCard(BOARD.ideaFocus)) {
          closeIdeaFocus({ discard: true, paint: false })
        } else {
          paintIdeaFocusDone()
        }
      }
      mountDoneBin(titles)
    }

    /**
     * The board's reading of every card's status, as one string.
     *
     * Only the status word goes in, not the clock: the minute hand moves by
     * the board's own tick, so folding it in here would make every minute of a
     * long turn read as a change worth a repaint.
     * @returns {string} id:status pairs in draw order, or '' when nothing is drawn.
     */
    function boardStatusFingerprint() {
      var out = ''
      for (var i = 0; i < BOARD.rows.length; i++) {
        var status = statusOf(BOARD.rows[i])
        out += BOARD.rows[i].id + ':' + (status ? status.key : '-') + ';'
      }
      return out
    }

    /**
     * Repaint the board for a status tick, but only if something on screen
     * actually changed shape.
     *
     * The status feed can tick often while a turn streams, and a repaint is
     * wholesale: the whole board is rebuilt, which costs a hover its state and
     * a column its scroll. A tick where every card keeps the word it had is
     * not a change the reader can see, so it is not a repaint either. The
     * clocks are untouched by this guard — they tick in place whatever the
     * feed is doing.
     * @returns {void}
     */
    function renderBoardOnStatus() {
      if (!BOARD.open) return
      if (boardStatusFingerprint() === BOARD.statuses) return
      renderBoard()
    }

    /**
     * Move the running cards' minute hands, in place.
     *
     * The board's twin of `tickClocks`: only the chip's own text is touched,
     * because a clock must never rebuild the board under a hover or a
     * half-finished drag. The card carries no fitted column tracks, so there
     * is nothing to re-fit here — unlike the task window's rows.
     * @returns {void}
     */
    function tickBoardClocks() {
      var now = Date.now()
      for (var i = 0; i < BOARD.clocks.length; i++) {
        var clock = BOARD.clocks[i]
        var elapsed = elapsedText(now - clock.since)
        // The same shape the card was built with, so a turn still inside its
        // first minute keeps the plain state instead of a dangling separator.
        var text = elapsed ? clock.label + ' · ' + elapsed : clock.label
        if (clock.chip.textContent === text) continue
        clock.chip.textContent = text
        clock.chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : clock.label)
      }
    }

    /**
     * Arm the one timer that watches for midnight.
     *
     * A board left open overnight has to file its page when the day turns over,
     * not on the next repaint - which may be hours later, after the reader has
     * already moved something in the new day. One timeout, set to the next local
     * midnight and re-armed from its own callback.
     * @returns {void}
     */
    function startDayTimer() {
      if (BOARD.dayTimer) return
      var next = new Date(Date.now())
      next.setHours(24, 0, 1, 0)
      BOARD.dayTimer = window.setTimeout(function () {
        BOARD.dayTimer = 0
        if (!BOARD.open) return
        // Filing the page is what a new day's board starts from, and that runs
        // at the top of a repaint.
        renderBoard()
        startDayTimer()
      }, Math.max(1000, next.getTime() - Date.now()))
    }

    /** Stop the midnight timer: the board closed, or the page went away. */
    function stopDayTimer() {
      if (!BOARD.dayTimer) return
      window.clearTimeout(BOARD.dayTimer)
      BOARD.dayTimer = 0
    }

    /** Start the tick that keeps the board's clocks honest. */
    function startBoardClock() {
      if (BOARD.clockTimer || !BOARD.clocks.length) return
      BOARD.clockTimer = window.setTimeout(function () {
        BOARD.clockTimer = 0
        if (!BOARD.open) return
        tickBoardClocks()
        startBoardClock()
      }, clockDelay(BOARD.clocks))
    }

    /** Stop the tick: the board closed, or nothing on it is running. */
    function stopBoardClock() {
      if (!BOARD.clockTimer) return
      window.clearTimeout(BOARD.clockTimer)
      BOARD.clockTimer = 0
    }

    /**
     * Paint the "only what is marked" toggle to match the state it stands for.
     *
     * The heading is drawn once, when the window opens; the canvas is what gets
     * repainted. The toggle lives in the heading, so it is repainted here rather
     * than being rebuilt on every pass.
     * @returns {void}
     */
    /**
     * Paint the two history buttons to match what the stacks hold.
     *
     * A button that cannot do anything says so by looking as though it cannot:
     * it keeps its place in the row (so the row does not jump when the first
     * delete arrives), loses its weight, and stops answering the pointer.
     * @returns {void}
     */
    function paintHistory() {
      var seats = [
        [BOARD.undoButton, BOARD_HISTORY.canUndo()],
        [BOARD.redoButton, BOARD_HISTORY.canRedo()],
      ]
      for (var i = 0; i < seats.length; i++) {
        var button = seats[i][0]
        if (!button) continue
        var live = seats[i][1] === true
        button.setAttribute('aria-disabled', live ? 'false' : 'true')
        button.style.opacity = live ? '1' : '0.38'
        button.style.pointerEvents = live ? 'auto' : 'none'
      }
    }

    function paintBoardStarFilter() {
      if (!BOARD.starFilter) return
      Object.assign(BOARD.starFilter.style, BOARD.onlyStarred ? BOARD_UI.starFilterOn : BOARD_UI.starFilter)
    }

    /**
     * One workspace on the canvas: a heading that can be dragged, and the
     * conversations underneath it.
     *
     * The heading is the handle rather than the whole block, because the cards
     * inside are read and clicked: a panel that moved whenever a card was
     * slightly pressed would be a panel you cannot use.
     * @param {object} block - one of `boardBlocks`.
     * @param {{x: number, y: number}} place - where it sits on the stage.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the block.
     */
    function slotHue(slot) {
      return (Math.abs(Math.round(Number(slot) || 0)) % BOARD_SLOTS) * (360 / BOARD_SLOTS) + 6
    }

    /**
     * Which seat a block starts on: its own id, never its name.
     *
     * A colour that follows the name is a colour that changes the moment the
     * panel is renamed, which reads as a different place. The id is the one thing
     * about a goal that never moves.
     * @param {string} key - the block id.
     * @returns {number} a seat on the wheel.
     */
    function slotSeed(key) {
      var text = String(key || '')
      var hash = 0
      for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360
      return hash % BOARD_SLOTS
    }

    /**
     * Give every panel on this paint its own slice of the wheel.
     *
     * Two goals that start on the same seat are told apart by moving the later
     * one to the first free seat after it: the wheel has twelve, a canvas rarely
     * holds a dozen goals, and "the two blue-ish dots" is exactly the confusion
     * this is for. The inbox is not a goal and takes no seat.
     * @param {Array<object>} blocks - the panels, in draw order.
     * @returns {object} block id -> seat.
     */
    function boardSlots(blocks) {
      var stored = BOARD_STORE.seats()
      var taken = Object.create(null)
      var out = Object.create(null)
      var fresh = null
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === 'inbox') continue
        var key = blocks[i].key
        var kept = stored[key]
        if (kept !== undefined && kept !== null) {
          // The seat is already the place's, whether or not a neighbour wears
          // it too: this is the colour the reader knows the goal by.
          out[key] = kept
          if (!taken[kept]) taken[kept] = true
          continue
        }
        var seat = slotSeed(key)
        for (var guard = 0; guard < BOARD_SLOTS; guard++) {
          if (!taken[seat]) break
          seat = (seat + 1) % BOARD_SLOTS
        }
        taken[seat] = true
        out[key] = seat
        // A place drawn for the first time is given its colour now and keeps it
        // for good: the alternative is a goal that changes colour whenever a
        // neighbour arrives or leaves, which is what a seven-pixel dot could get
        // away with and a painted panel cannot.
        if (fresh === null) fresh = Object.create(null)
        fresh[key] = seat
      }
      if (fresh !== null) BOARD_STORE.setSeats(fresh)
      return out
    }

    /** The seat one block wears: the one written down, else the one this paint gave it. */
    function blockSeat(block) {
      if (!block) return 0
      // Read once per paint rather than once per question: every card, note and
      // mark on the canvas asks for a hue, and each answer must agree with the
      // others even if another window writes in the middle of a paint.
      var stored = (BOARD.seats || BOARD_STORE.seats())[block.key]
      if (stored !== undefined) return stored
      var seat = BOARD.slots[block.key]
      return seat === undefined ? slotSeed(block.key) : seat
    }

    /**
     * The hue one place is washed with, or null for the tray.
     *
     * The tray is where work has no home, so it has no colour of its own: a
     * conversation standing in it wears the board's own material. A card that
     * was given a hue would be claiming a place to stand in.
     * @param {object|null} block - the panel.
     * @returns {number|null} the hue in degrees, or null.
     */
    function goalHue(block) {
      if (!block || block.kind === 'inbox') return null
      return slotHue(blockSeat(block))
    }

    /** The colour one panel's own mark wears. */
    function blockInk(block) {
      if (!block || block.kind === 'inbox') return BOARD_INK.dim
      return 'hsl(' + slotHue(blockSeat(block)) + ' 46% 56%)'
    }

    /**
     * The paper one note is written on.
     *
     * Opaque, on purpose: cards overlap the moment one is pulled out of its goal,
     * and a see-through card makes a pile unreadable - the one underneath reads
     * through the one on top, so neither is a card any more. The hue is the panel
     * the note belongs to; a note tied to nothing, or to the inbox, keeps the
     * amber it always had, because it belongs to the reader and not to a place.
     * @param {object|null} block - the panel the note's conversation stands in.
     * @returns {object} the paper's own three declarations.
     */
    /** The hue a note is written on: its goal's, or the amber of belonging to nobody. */
    function noteHue(block) {
      return block && block.kind !== 'inbox' ? slotHue(blockSeat(block)) : 45
    }

    function notePaper(block) {
      if (!block || block.kind === 'inbox') return NOTE_PAPER
      var hue = noteHue(block)
      // Two steps lighter than the paper the board used to cut for a note, and
      // a spine a third of the weight: a thought is written on this canvas, not
      // shouted from it. The hue still says whose paper it is, because that is
      // the one thing a slip lying beside a panel has to answer.
      return {
        background: 'hsl(' + hue + ' 30% 94%)',
        border: '1px solid hsl(' + hue + ' 22% 84%)',
        borderLeft: '2px solid hsl(' + hue + ' 40% 62% / 0.55)',
        boxShadow: '0 16px 30px -22px rgba(8, 12, 20, 0.6), 0 1px 2px rgba(8, 12, 20, 0.2)',
        color: 'hsl(' + hue + ' 28% 20%)',
      }
    }

    /**
     * The ink one note is drawn in.
     *
     * Light paper takes dark ink, and it takes it in the same hue: the words, the
     * marks beside them and the spine are one colour family, so a card reads as
     * one object rather than as a pastel box with a few default marks on it, and
     * a finished card drops the hue for the neutral it has stopped earning.
     * @param {object|null} block - the panel the note's conversation stands in.
     * @param {boolean} done - whether the note is finished.
     * @returns {{text: string, dim: string, edge: string}} the three inks.
     */
    function noteInkOf(block, done) {
      if (done) {
        return {
          text: BOARD_INK.noteDoneInk,
          dim: 'hsl(45 10% 46%)',
          edge: 'hsl(45 10% 72%)',
        }
      }
      var hue = noteHue(block)
      return {
        text: 'hsl(' + hue + ' 28% 20%)',
        dim: 'hsl(' + hue + ' 20% 42%)',
        edge: 'hsl(' + hue + ' 26% 66%)',
      }
    }

    /**
     * How many rows an idea card's field needs for what it holds.
     *
     * Not a measurement: the field is sized in the same repaint that puts it
     * on the page, and a mount without `field-sizing` would otherwise open a
     * five-line hole for three words. A CJK character counts double, which is
     * close enough at this width to keep the estimate off a whole line.
     * @param {string} text - what the card says.
     * @returns {number} a row count inside the allowed range.
     */
    /**
     * How many half-widths one line of a note holds.
     *
     * Measured from the card's own edges and its own type rather than kept as a
     * guess: a line is the paper's inner width over half a character's advance,
     * because a CJK character is two half-widths and an average latin one is
     * about one. Under-counting is what leaves a strip of empty paper at the
     * foot of every note - the card is the right size for a line it never had.
     * @returns {number} half-widths to a line.
     */
    function boardNoteCols() {
      var metrics = boardNoteMetrics()
      var inner = BOARD_CARD_W - 26
      return Math.max(12, Math.floor(inner / (metrics.font * 0.5)))
    }

    function boardTextRows(text, least, most) {
      var value = String(text === undefined || text === null ? '' : text)
      var lines = value.split('\n')
      var rows = 0
      for (var i = 0; i < lines.length; i++) {
        var wide = 0
        for (var c = 0; c < lines[i].length; c++) {
          wide += lines[i].charCodeAt(c) > 0x2e80 ? 2 : 1
        }
        rows += Math.max(1, Math.ceil(wide / boardNoteCols()))
      }
      var low = typeof least === 'number' ? least : BOARD_EDITOR_MIN_ROWS
      var high = typeof most === 'number' ? most : BOARD_EDITOR_MAX_ROWS
      return Math.min(high, Math.max(low, rows))
    }

    /**
     * The lines a card's field opens on.
     *
     * A field is never one line tall, even when the card says one thing: a
     * thought is usually a sentence more before it is done, and a field that
     * starts as a slot is a field the reader has to grow before using.
     * @param {string} text - what the card says.
     * @returns {number} the rows the field needs.
     */
    function boardEditorRows(text) {
      return boardTextRows(text, BOARD_EDITOR_MIN_ROWS, BOARD_EDITOR_MAX_ROWS)
    }

    /**
     * How much paper one idea card takes.
     *
     * One function for the whole of it: what a card is drawn as, where a tidy
     * puts it, and how big the canvas has to be all read this, so a card is
     * never planned one size and painted another. The width is the card's and
     * never moves; the height is the lines it holds, between a strip of one
     * and the most it shows - four folded, ten opened.
     * @param {string} text - what the card says.
     * @param {number} [least] - the fewest lines to plan for.
     * @param {number} [most] - the most lines to plan for.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    /**
     * The ruler a note card is drawn with: one line box, and the paper around it.
     *
     * A card's box is planned before it is painted - the canvas extent, the tidy
     * and the next free place all read it - so the plan and the paint have to
     * share one ruler. They share this one: both numbers in pixels, scaled from
     * the board's own base font, and handed to the field and to the words as
     * well, so nothing inside a card can be measured in a different unit than
     * the card itself.
     * @returns {{line: number, chrome: number, font: number}} pixels.
     */
    function boardNoteMetrics() {
      var base = Math.max(settings.paletteFont, BOARD_MIN_FONT)
      var scale = base / BOARD_MIN_FONT
      var line = Math.round(BOARD_CARD_LINE_H * scale)
      return {
        line: line,
        chrome: Math.round(BOARD_CARD_CHROME_H * scale),
        // A line box is 1.65 times its type, the ratio the words and the field
        // are both set in.
        font: Math.round((line / 1.65) * 100) / 100,
      }
    }

    /**
     * How much paper one idea card takes: its heading, and the lines it holds.
     *
     * One shape for every state. A card is the same paper with its field up as
     * it is at rest - a press must never change the size of the thing pressed -
     * and past the last line a card holds it clips rather than scrolls, because
     * a window inside a piece of paper is not paper.
     * The shape is the reader's, not the text's: a card opens at one line and
     * keeps whatever height it was dragged to, so the fade is the only thing
     * that changes when the words run on. What the text needs is still measured,
     * which is what tells the card it has more to say than it is showing.
     * @param {string} text - what the card says.
     * @param {number} [rows] - the height it was dragged to, or 0 for the default.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    /**
     * A note, cut where its title ends: the first line is the heading and the
     * rest is what the card shows of itself.
     * @param {string} text - what the card says.
     * @returns {{title: string, body: string, rows: number}} the parts.
     */
    function noteParts(text) {
      var value = String(text === undefined || text === null ? '' : text)
      // Spelled as a code point rather than an escape: the split is the whole
      // meaning of this function, and it must not depend on how a tool wrote it.
      var cut = value.indexOf(CHAR_NEWLINE)
      var title = cut < 0 ? value : value.slice(0, cut)
      var body = cut < 0 ? '' : value.slice(cut + 1)
      return { title: title, body: body, rows: boardTextRows(body, 0, 999) }
    }

    /**
     * How much paper one idea card takes at rest.
     *
     * The title lives in the heading, so the paper is spent on the body: two
     * lines of it, and none when the card is only a title. `rows` is a height a
     * former build let the reader drag; it still wins when a stored card has one.
     * @param {string} text - what the card says.
     * @param {number} [rows] - a chosen number of body lines.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    function boardCardBox(text, rows) {
      var parts = noteParts(text)
      var chosen = Math.round(Number(rows) || 0)
      // A note that is only a title is only a heading: an empty line kept for a
      // body it does not have is the wasted row this card was complaining about.
      var body = parts.body ? parts.rows : 0
      var lines = chosen > 0
        ? Math.min(chosen, BOARD_EDITOR_MAX_ROWS)
        : Math.min(body, BOARD_NOTE_BODY_ROWS)
      var metrics = boardNoteMetrics()
      return {
        width: BOARD_CARD_W,
        height: metrics.chrome + lines * metrics.line,
        lines: lines,
      }
    }

    /**
     * The paper a note takes while its field is up: all of its body, up to the cap.
     *
     * Opening a card is asking to read it, so the paper grows to hold the whole
     * of what was written - that is what a press now means, in place of the corner
     * that used to have to be dragged.
     * @param {string} text - what the card says.
     * @returns {{width: number, height: number, lines: number}} the paper.
     */
    function boardCardOpenBox(text) {
      // The field holds the body only - the title has its own row in the heading -
      // so the paper plans for the body, and the field is exactly as tall as it.
      var parts = noteParts(text)
      var lines = Math.max(1, parts.rows)
      var metrics = boardNoteMetrics()
      return {
        width: BOARD_CARD_W,
        height: metrics.chrome + lines * metrics.line,
        lines: lines,
      }
    }

    /**
     * Where a point on the screen falls on the paper.
     *
     * The canvas is a scroller and the stage inside it is scaled, so a pointer
     * has to lose both before it can name a place a card can be stored at.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {{x: number, y: number}} unzoomed canvas coordinates.
     */
    function canvasPointOf(x, y) {
      var body = BOARD.body
      var rect = body && typeof body.getBoundingClientRect === 'function' ? body.getBoundingClientRect() : null
      var zoom = BOARD.zoom || 1
      if (!rect || (!rect.width && !rect.height)) return { x: Math.max(0, x), y: Math.max(0, y) }
      return {
        x: Math.max(0, (x - rect.left + (Number(body.scrollLeft) || 0)) / zoom),
        y: Math.max(0, (y - rect.top + (Number(body.scrollTop) || 0)) / zoom),
      }
    }

    /**
     * Bring one card to the front of the paper.
     *
     * Cards overlap as soon as one is pulled out of its goal, and a pile is
     * only readable if the card being worked on is the one on top. The press
     * raises it, and the repaint remembers which card that was, so a repaint
     * does not put it back under the others.
     * @param {string} id - session id or card id.
     * @param {Element} node - its element, when there is one already.
     * @returns {void}
     */
    function raiseBoardCard(id, node) {
      if (!id) return
      BOARD.zTop = BOARD.zTop + 1
      BOARD.front = id
      if (!node) return
      node.setAttribute('data-front', 'true')
      node.style.zIndex = String(BOARD.zTop)
    }

    /**
     * Lift one put-away note out of the tray, under the hand.
     *
     * A note in the tray is a line, and a line cannot be dragged around a canvas:
     * so the first movement turns it back into paper where the hand is, and the
     * gesture goes on as the ordinary note drag from there.
     * @param {object} drag - the armed press.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function beginNoteLift(drag, x, y) {
      var id = drag.key
      if (!id) return
      var point = canvasPointOf(x, y)
      var at = {
        x: Math.max(0, point.x - BOARD_CARD_W / 2),
        y: Math.max(0, point.y - 24),
      }
      BOARD_STORE.unfileCard(id)
      // A card lifted out of the tray or the finished list is a free thought
      // again: it leaves the conversation's column with the same gesture that
      // takes it off the list, or the paint would file it straight back in.
      BOARD_STORE.unlinkCard(id)
      BOARD_STORE.moveCard(id, at.x, at.y)
      // The paint has to happen with no gesture in its way, and the row this
      // press started on is replaced by it: so the drag stands aside for that
      // one call and comes back retired to an ordinary note drag.
      BOARD.drag = null
      renderBoard()
      BOARD.drag = drag
      var node = BOARD.looseNodes[id]
      if (!node) {
        BOARD.drag = null
        return
      }
      drag.kind = 'note'
      drag.node = node
      drag.baseX = at.x
      drag.baseY = at.y
      drag.fromX = x
      drag.fromY = y
      drag.x = at.x
      drag.y = at.y
      BOARD.front = id
      node.setAttribute('data-front', 'true')
      // A lifted line is being carried like any note, so the bands belong up.
      showDropZones(true, boardNoteDone(id))
    }

    /**
     * Say which goal would take the card if the hand let go of it here.
     *
     * The carrier is out of the hit test, so the point under it is the goal
     * itself: the panel that answers is the panel the card would be filed in,
     * and saying so before the drop is what makes the gesture readable while
     * it is still going on.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function markDropGoal(x, y, target) {
      var found = goalNodeAt(x, y, target)
      if (BOARD.dropGoal && BOARD.dropGoal !== found) {
        BOARD.dropGoal.setAttribute('data-drop', 'false')
      }
      BOARD.dropGoal = found
      if (found) found.setAttribute('data-drop', 'true')
      markNoDrop(!found, x, y)
    }

    /**
     * Light the finished strip a carried conversation would land in.
     *
     * One highlight at a time: the strip under the hand keeps the light, and a
     * strip the hand has left takes it away. The light is the same fact the
     * drop writes, said before the fingers let go.
     * @param {Element|null} bar - the strip, or null when none is under the hand.
     * @returns {void}
     */
    function markDoneDrop(bar) {
      if (BOARD.doneDrop && BOARD.doneDrop !== bar) {
        BOARD.doneDrop.setAttribute('data-drop', 'false')
      }
      BOARD.doneDrop = bar
      if (bar) bar.setAttribute('data-drop', 'true')
    }

    /**
     * The goal one conversation is drawn in on this paint, or null.
     * @param {string} id - session id.
     * @returns {object|null} the block holding it.
     */
    function boardHomeOf(id) {
      for (var i = 0; i < BOARD.blocks.length; i++) {
        var rows = BOARD.blocks[i].rows
        for (var r = 0; r < rows.length; r++) {
          if (rows[r].id === id) return BOARD.blocks[i]
        }
      }
      return null
    }

    /**
     * One conversation of this paint, by id.
     * @param {string} id - session id.
     * @returns {object|null} the summary, or null when it is not drawn.
     */
    function boardRowOf(id) {
      for (var i = 0; i < BOARD.rows.length; i++) {
        if (BOARD.rows[i].id === id) return BOARD.rows[i]
      }
      return null
    }

    /**
     * Put one conversation in the finished strip, word and all.
     *
     * The strip and the chip are one decision now: a card sent to today's
     * finished work also says it is finished, and the word is hung on the turn
     * it was said about, so the next turn makes it stale by itself.
     * @param {string} id - session id.
     * @returns {void}
     */
    function sendToDone(id) {
      var row = boardRowOf(id)
      BOARD_STORE.markSessionDone(id)
      if (row && Number(row.updatedAt)) {
        BOARD_STORE.setVerdict(id, 'settled', Number(row.updatedAt))
      }
      BOARD.verdicts = BOARD_STORE.verdicts()
    }

    /**
     * Take one conversation back out of the finished strip, word and all.
     *
     * The other half of the same decision: a card that comes back to the work
     * is no longer finished today, and it must not keep wearing the word.
     * @param {string} id - session id.
     * @returns {void}
     */
    function bringBackFromDone(id) {
      BOARD_STORE.clearSessionDone(id)
      var held = BOARD_STORE.verdicts()[id]
      if (held && held.key === 'settled') BOARD_STORE.dropVerdict(id)
      BOARD.verdicts = BOARD_STORE.verdicts()
    }

    /**
     * Say, under the hand, that the paper will not take this card.
     *
     * The drop is refused for a reason the reader can watch coming (see the last
     * conversation rule in `onBoardUp`), so the reason is said while the card is
     * still being carried rather than after it has already been put back. A
     * gesture explained only after it fails teaches nothing.
     * @param {boolean} paper - whether the hand is over the paper.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function markNoDrop(paper, x, y) {
      var drag = BOARD.drag
      var alone = false
      if (paper && drag && drag.kind === 'session') {
        var home = boardHomeOf(drag.key)
        alone = !!home && home.rows.length <= 1
      }
      if (!alone) {
        dropNoDropTip()
        return
      }
      if (!BOARD.noDropTip && BOARD.stage) {
        var tip = document.createElement('div')
        Object.assign(tip.style, BOARD_UI.noDropTip)
        tip.setAttribute('data-role', 'noDropTip')
        BOARD.noDropTip = tip
      }
      if (!BOARD.noDropTip || !BOARD.stage) return
      BOARD.noDropTip.textContent = paletteText('boardGoalLastCard')
      var at = canvasPointOf(x, y)
      BOARD.noDropTip.style.left = Math.round(at.x) + 'px'
      BOARD.noDropTip.style.top = Math.round(at.y + 20) + 'px'
      if (BOARD.noDropTip.parentNode !== BOARD.stage) BOARD.stage.appendChild(BOARD.noDropTip)
    }

    /** Take the "the paper will not take it" line off the page. */
    function dropNoDropTip() {
      if (BOARD.noDropTip && BOARD.noDropTip.parentNode) {
        BOARD.noDropTip.parentNode.removeChild(BOARD.noDropTip)
      }
      BOARD.noDropTip = null
    }

    /**
     * The goal panel under a native drag, asked in the order a browser answers.
     *
     * The event's own target comes first: that is the element the browser itself
     * found under the pointer, at the moment the gesture happened, and it is the
     * answer a real drag can always give. A drop surface that reports itself
     * instead of its children is the case the hit test is for.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @param {object} [target] - the event's target, when it has one.
     * @returns {object|null} the panel that would take the card, or null.
     */
    function goalNodeAt(x, y, target) {
      var fromEvent = nearestGoal(target)
      if (fromEvent) return fromEvent
      if (typeof document.elementFromPoint !== 'function') return null
      try {
        return nearestGoal(document.elementFromPoint(x, y))
      } catch (error) {
        return null
      }
    }

    /** The goal panel an element stands in, or null when it stands in none. */
    function nearestGoal(node) {
      if (!node || typeof node.closest !== 'function') return null
      try {
        return node.closest('[data-role="workspaceBlock"]')
      } catch (error) {
        return null
      }
    }

    /**
     * The goal the pointer is standing in, as the id a card is filed under.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @param {object} [target] - the event's target, when it has one.
     * @returns {string} the block id, or '' for the paper itself.
     */
    function goalUnder(x, y, target) {
      var goal = goalNodeAt(x, y, target)
      return goal ? goal.getAttribute('data-block') || '' : ''
    }

    /**
     * The finished strip under the hand, or null.
     *
     * It is asked before the goal, because it stands inside one: a card let go
     * on the strip is finishing a conversation, and a card let go on the panel
     * around it is not. The answer is the whole element rather than its block:
     * the drop paints the strip it will land in, and only the element under the
     * point knows which of a goal's two surfaces the hand chose.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @param {Element} [target] - the event's target, when it has one.
     * @returns {Element|null} the strip, or null when the hand is not on one.
     */
    function doneBarUnder(x, y, target) {
      var node = target
      if (!node || typeof node.closest !== 'function') {
        if (typeof document.elementFromPoint !== 'function') return null
        try {
          node = document.elementFromPoint(x, y)
        } catch (error) {
          return null
        }
      }
      if (!node || typeof node.closest !== 'function') return null
      try {
        return node.closest('[data-role="doneBar"]')
      } catch (error) {
        return null
      }
    }

    /**
     * The goal whose heading an element stands in, as the key a card starts a
     * conversation under.
     *
     * A heading is a goal's door: the plus is one seat of it, and the name and
     * the count beside the plus mean the same thing. The tray has no door of its
     * own - it is where work has no home, so starting there would be starting
     * nowhere - and its heading answers nothing.
     * @param {Element} node - the element under the pointer.
     * @returns {string} the goal key, or ''.
     */
    function goalHeadKeyUnder(node) {
      if (!node || typeof node.closest !== 'function') return ''
      var head = null
      var panel = null
      try {
        head = node.closest('[data-role="blockHead"]')
        panel = head && head.closest ? head.closest('[data-role="workspaceBlock"]') : null
      } catch (error) {
        return ''
      }
      var key = panel ? panel.getAttribute('data-block') || '' : ''
      if (!key || key === BOARD_INBOX) return ''
      return key
    }

    /**
     * Whether a native drag carries words, the one thing the shell's rows set.
     *
     * The words themselves are guarded until the drop, so this is all the
     * `dragover` can ask. The canvas takes a text-bearing drag and says at the
     * drop whether it was a conversation; a drag carrying files, or nothing at
     * all, is not the board's to answer.
     * @param {object} ev - the drag event.
     * @returns {boolean} whether `text/plain` is aboard.
     */
    function boardDragHasText(ev) {
      var transfer = ev && ev.dataTransfer
      if (!transfer || !transfer.types) return false
      try {
        if (typeof transfer.types.indexOf === 'function') {
          return transfer.types.indexOf('text/plain') >= 0
        }
        if (typeof transfer.types.contains === 'function') {
          return transfer.types.contains('text/plain')
        }
      } catch (error) {
        return false
      }
      return false
    }

    /**
     * The words a native drag is carrying, read where the browser allows it.
     * @param {object} ev - the drop event.
     * @returns {string} the plain text aboard, trimmed.
     */
    /**
     * The conversation a dropped payload names.
     *
     * The shell's rows carry their conversation's id as plain text, and the board
     * reads the payload as words rather than as one string: a row that carries
     * its own label as well, or a drag that came from a message or a link, still
     * usually carries the id somewhere in what it says. An id is never a
     * substring of another, so the first word that names a conversation answers.
     *
     * When no word is an id, a payload that is exactly one conversation's name
     * names that conversation: a row dragged out of the sidebar is a deliberate
     * gesture, and its name is the other thing it can honestly be carrying. Two
     * conversations sharing that name name neither - a wrong filing is worse than
     * a refusal, and the refusal is said out loud.
     * @param {string} payload - what the drag carried.
     * @returns {object|null} the conversation, or null.
     */
    function sessionInPayload(payload) {
      var pool = conversationPool()
      if (!pool.length) return null
      var words = String(payload).split(/\s+/)
      var i
      var p
      for (i = 0; i < words.length; i++) {
        var word = words[i]
          .replace(/^[([\u300c\u300a"']+/, '')
          .replace(/[)\]\u300d\u300b"',.;:]+$/, '')
        if (!word) continue
        for (p = 0; p < pool.length; p++) {
          if (pool[p].id === word) return pool[p]
        }
      }
      var text = String(payload).replace(/\s+/g, ' ').trim()
      if (!text) return null
      var named = null
      var matched = 0
      for (p = 0; p < pool.length; p++) {
        if (boardTitleOf(pool[p]) !== text) continue
        named = pool[p]
        matched = matched + 1
      }
      return matched === 1 ? named : null
    }

    function boardDragText(ev) {
      var transfer = ev && ev.dataTransfer
      if (!transfer || typeof transfer.getData !== 'function') return ''
      try {
        return String(transfer.getData('text/plain') || '').trim()
      } catch (error) {
        return ''
      }
    }

    /**
     * Take the goal highlight a native drag drew off the paper.
     *
     * The drop reads it first, so this is called after the decision rather
     * than before it: the line belongs to the gesture, and the paint that
     * follows owes it nothing.
     * @returns {void}
     */
    function clearBoardDragGoal() {
      if (BOARD.dropGoal) {
        BOARD.dropGoal.setAttribute('data-drop', 'false')
        BOARD.dropGoal = null
      }
      dropNoDropTip()
    }

    /**
     * A native drag is over, however it ended.
     *
     * `dragend` travels with the row that started the drag, in the sidebar —
     * the canvas never sees it — so the listener that takes the highlight
     * back down lives where every end is the same end. A drop already took it
     * down; this is for the ends that never land here.
     * @returns {void}
     */
    function onNativeDragEnd() {
      if (!BOARD.open) return
      clearBoardDragGoal()
    }

    /**
     * Say, while a native drag is over the canvas, which goal would take it.
     *
     * The same line the board draws under its own carried cards, so two
     * gestures that mean the same thing read the same way while they are still
     * going on.
     * @param {object} ev - the dragover.
     * @returns {void}
     */
    function onBoardDragOver(ev) {
      if (!BOARD.open || !boardDragHasText(ev)) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
      markDropGoal(Number(ev.clientX) || 0, Number(ev.clientY) || 0, ev.target)
    }

    /**
     * The native drag left the canvas: take the goal highlight with it.
     *
     * `dragleave` also fires on the way into a panel's children, so only the
     * leave that crosses out of the canvas counts — the hand is still in, and
     * the goal it stands on is still the one that would take the card.
     * @param {object} ev - the dragleave.
     * @returns {void}
     */
    function onBoardDragLeave(ev) {
      if (!BOARD.open) return
      var to = ev && ev.relatedTarget
      if (to && BOARD.body && typeof BOARD.body.contains === 'function'
        && BOARD.body.contains(to)) return
      clearBoardDragGoal()
    }

    /**
     * A conversation let go on the canvas, carried in from the host's sidebar.
     *
     * The shell's session rows carry their conversation's id as plain text, so
     * the board does not need rows of its own to reach itself: letting go here
     * puts the conversation on it — under the goal the hand was aiming at when
     * there was one, following its workspace when there was not. Whatever the
     * row was, the canvas has said yes to the drag, so the drop is answered
     * here rather than left to whatever the browser makes of a text drop.
     * @param {object} ev - the drop.
     * @returns {void}
     */
    function onBoardDrop(ev) {
      if (!BOARD.open) return
      if (typeof ev.preventDefault === 'function') ev.preventDefault()
      clearBoardDragGoal()
      var payload = boardDragText(ev)
      if (!payload) return
      var known = sessionInPayload(payload)
      if (!known) {
        showToast(paletteText('boardDragUnknown'))
        return
      }
      dropSessionOntoBoard(known.id, goalUnder(Number(ev.clientX) || 0, Number(ev.clientY) || 0, ev.target))
    }

    /**
     * Take one conversation the reader dragged in, and keep it.
     *
     * The same records the pin key writes — the ★ that outlives the day, the
     * deletion lifted — plus the goal the hand let go on, when it aimed at
     * one. One line says what happened, and the filing is the more specific
     * claim, so it is the one spoken when both are true; letting go on the
     * goal the card already stands in files nothing, exactly as the board's
     * own carried cards behave.
     * @param {string} id - the conversation the row carried.
     * @param {string} overGoal - the block the hand let go on, or '' for the paper.
     * @returns {void}
     */
    function dropSessionOntoBoard(id, overGoal) {
      var already = BOARD_STORE.isStarred(id)
      BOARD_STORE.unmute(id)
      if (!already) BOARD_STORE.toggleStar(id)
      var home = boardHomeOf(id)
      if (overGoal && (!home || home.key !== overGoal)) {
        BOARD_STORE.placeSession(id, overGoal)
        showToast(paletteText('boardMoved'))
      } else {
        showToast(paletteText(already ? 'pinAlready' : 'pinDone'))
      }
      if (BOARD.open && !BOARD.noteEditing) renderBoard()
    }



    /**
     * The twelve colours a goal can wear.
     *
     * The wheel is the whole of the choice: no picker, no hex, twelve seats a
     * dozen goals can share without two of them reading as one place. The seat
     * in use is ringed rather than enlarged, so the wheel never reflows.
     * @param {object} block - the goal the wheel belongs to.
     * @returns {Element} the wheel.
     */
    function buildSeatMenu(block) {
      var menu = document.createElement('div')
      Object.assign(menu.style, BOARD_UI.seatMenu)
      menu.className = 'dshv-seat-menu'
      menu.setAttribute('data-role', 'seatMenu')
      // A press inside the wheel is a choice, never a carry of the panel.
      menu.setAttribute('data-no-drag', 'true')
      var here = blockSeat(block)
      for (var seat = 0; seat < BOARD_SLOTS; seat++) {
        var swatch = document.createElement('span')
        Object.assign(swatch.style, BOARD_UI.seatSwatch)
        swatch.style.background = 'hsl(' + slotHue(seat) + ' 62% 55%)'
        if (seat === here) Object.assign(swatch.style, BOARD_UI.seatSwatchOn)
        swatch.setAttribute('role', 'button')
        swatch.setAttribute('data-role', 'seatSwatch')
        swatch.setAttribute('data-seat', String(seat))
        swatch.setAttribute('aria-label', paletteText('boardGoalSeat'))
        swatch.addEventListener('click', pickSeat(block.key, seat))
        menu.appendChild(swatch)
      }
      return menu
    }

    /**
     * One colour, as a press.
     *
     * The choice is written down before the repaint, because the colour is the
     * document's: a plan to repaint first would leave the next paint reading the
     * old seat and drawing the old colour back.
     * @param {string} key - the goal's block id.
     * @param {number} seat - the colour chosen.
     * @returns {Function} the click handler.
     */
    function pickSeat(key, seat) {
      return function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        var chosen = Object.create(null)
        chosen[key] = seat
        BOARD_STORE.setSeats(chosen)
        BOARD.seatMenu = ''
        renderBoard()
      }
    }

    /**
     * The verbs on a goal that are not worth a seat of their own.
     *
     * Renaming is the one. It used to be a double press on the heading, which
     * made the heading's ordinary press something else - a fold that had to be
     * taken back when the pair turned out to be a rename. The rare verb belongs
     * behind the ⋯, one press away, with the rest of the board's quiet actions.
     * @param {object} block - the goal.
     * @returns {Element} the menu.
     */
    function buildGoalMenu(block) {
      var menu = document.createElement('div')
      // The stock, padding and rows are the conversation card's menu: one menu
      // grammar on the board, whichever thing it belongs to. Only the seat is
      // different - the panel's right edge, not the card's.
      Object.assign(menu.style, BOARD_UI.cardMenu, { top: 'auto', right: 'auto', zIndex: '40' })
      menu.className = 'dshv-goal-menu'
      menu.setAttribute('data-role', 'goalMenu')
      // A press inside the menu is a choice, never a carry of the panel.
      menu.setAttribute('data-no-drag', 'true')
      menu.appendChild(goalMenuItem(paletteText('boardCardRenameHint'), 'goalRenameOpen', function () {
        beginBlockRename(block.key)
      }))
      return menu
    }

    /**
     * One line of that menu.
     * @param {string} label - what it says.
     * @param {string} role - its name for the tests and the pointer.
     * @param {Function} onPick - what it does.
     * @returns {Element} the row.
     */
    function goalMenuItem(label, role, onPick) {
      var row = document.createElement('span')
      Object.assign(row.style, BOARD_UI.cardMenuItem)
      row.className = 'dshv-goal-menu-item'
      row.setAttribute('role', 'button')
      row.setAttribute('data-role', role)
      row.textContent = label
      row.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD.goalMenu = ''
        // The menu goes where it stands, whatever the verb does next: a refused
        // verb that repaints nothing must not leave its own menu on the panel.
        if (row.parentNode && typeof row.parentNode.removeChild === 'function') {
          row.parentNode.removeChild(row)
        }
        onPick()
      })
      return row
    }

    /**
     * Stand a goal's menu under its ⋯, inside the panel's right edge.
     * @param {Element} menu - the menu, already built.
     * @param {object} block - the goal it belongs to.
     * @param {{x: number, y: number}} place - where the panel stands.
     * @returns {void}
     */
    function placeGoalMenu(menu, block, place) {
      menu.style.left = (place.x + Math.max(0, boardBlockWidth(block) - BOARD_GOAL_MENU_W - 10)) + 'px'
      menu.style.top = (place.y + BOARD_BLOCK_HEAD_H - 4) + 'px'
    }

    function buildBoardBlock(block, place, titles) {
      var node = document.createElement('div')
      Object.assign(node.style, BOARD_UI.block)
      // A panel is a panel, whichever it is: the tray's paper belongs to the
      // notes inside it, not to the box that holds them.
      node.className = 'dshv-block'
      // A place has a colour, and the colour is a wash: the panel is the field
      // the work stands in, so it is tinted rather than painted. The hue is read
      // off the seat the goal was given and written down with it, so this is the
      // same colour tomorrow whatever else is on the canvas.
      var hue = goalHue(block)
      if (hue !== null) {
        node.style.background = 'hsl(' + hue + ' 55% 50% / 0.05)'
        node.style.borderColor = 'hsl(' + hue + ' 42% 45% / 0.22)'
      }
      node.style.left = place.x + 'px'
      node.style.top = place.y + 'px'
      // A panel is as wide as the columns it holds: two conversations need two
      // columns, and the paper under them follows.
      node.style.width = boardBlockWidth(block) + 'px'
      node.setAttribute('data-role', 'workspaceBlock')
      node.setAttribute('data-block', block.key)
      // The whole panel is the handle: a goal is a place, and a place is grabbed
      // where the eye sees it. Cards inside declare a handle of their own, so the
      // nearest one wins and a press on a card is never a press on the goal.
      node.setAttribute('data-handle', 'goal')
      var folded = BOARD_STORE.isFolded(block.key)

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.blockHead)
      if (hue !== null) head.style.borderBottomColor = 'hsl(' + hue + ' 40% 45% / 0.20)'
      head.className = 'dshv-panel-head'
      head.setAttribute('data-role', 'blockHead')
      head.setAttribute('title', (block.path ? block.path + ' · ' : '') + paletteText('boardGoalDragHint'))
      var caret = document.createElement('span')
      Object.assign(caret.style, BOARD_UI.blockCaret)
      caret.textContent = folded ? '▸' : '▾'
      // The caret is the fold's explicit switch. A press on the name is the
      // same switch (see below): the caret is small, and a reader who wants a
      // place out of the way aims at its title, not at a mark beside it. The
      // rest of the heading is still the drag handle.
      caret.setAttribute('data-role', 'blockFold')
      caret.setAttribute('role', 'button')
      caret.setAttribute('title', paletteText(folded ? 'boardGoalUnfold' : 'boardGoalFold'))
      caret.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.toggleBlockFold(block.key)
        renderBoard()
      })
      var dot = document.createElement('span')
      Object.assign(dot.style, BOARD_UI.blockDot)
      dot.setAttribute('data-role', 'blockDot')
      dot.style.background = blockInk(block)
      // The dot is the colour, so it is also where the colour is chosen. The
      // tray has no wheel: it is not a goal and wears no hue of its own.
      if (block.kind !== 'inbox') {
        dot.setAttribute('role', 'button')
        dot.setAttribute('data-no-drag', 'true')
        dot.setAttribute('title', paletteText('boardGoalSeatHint'))
        dot.setAttribute('aria-label', paletteText('boardGoalSeat'))
        dot.setAttribute('aria-expanded', BOARD.seatMenu === block.key ? 'true' : 'false')
        dot.style.cursor = 'pointer'
        dot.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          closeGoalMenu()
          BOARD.seatMenu = BOARD.seatMenu === block.key ? '' : block.key
          renderBoard()
        })
      }
      // The goal's name, typed in place from the ⋯ menu. A panel starts as a
      // workspace and usually becomes the thing the reader is working toward,
      // so the name is theirs: clearing it gives the workspace's own name back.
      var name
      if (block.kind !== 'inbox' && BOARD.renamingBlock === block.key) {
        name = document.createElement('input')
        Object.assign(name.style, BOARD_UI.blockRenameBox)
        name.setAttribute('type', 'text')
        name.setAttribute('data-role', 'blockRename')
        name.setAttribute('aria-label', paletteText('boardGoalName'))
        name.setAttribute('placeholder', paletteText('boardGoalPlaceholder'))
        name.value = block.label
        name.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBlockRename()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBlockRename()
          }
        })
        name.addEventListener('blur', function () {
          if (BOARD.renamingBlock === block.key && BOARD.renameBlockInput === name) commitBlockRename()
        })
        // A field is the field's: the router reads this and leaves the press
        // alone, so the text in it can be selected with the pointer.
        name.setAttribute('data-no-drag', 'true')
        BOARD.renameBlockInput = name
      } else {
        name = document.createElement('span')
        Object.assign(name.style, BOARD_UI.blockName)
        name.setAttribute('data-role', 'blockName')
        name.setAttribute('title', block.kind === 'inbox'
          ? paletteText('boardInboxHint')
          : paletteText('boardGoalRenameHint'))
        name.textContent = block.label
        // The name is part of the handle: a press on it drags the goal like the
        // rest of the heading, and a press that does not travel folds the panel -
        // the name takes the heading's slack, so the title and the blank after it
        // are the widest target in the row, and a goal being done for now is the
        // common reason to reach for it. Renaming lives behind the ⋯ now, not on
        // a double press: a name field one stray click pair away is not worth the
        // heading's own press having to be taken back. The buttons to the right
        // are targets of their own and never come through here.
        name.addEventListener('dblclick', function (ev) {
          // Two folds are not a new card: the canvas would otherwise drop a
          // thought under the heading on the same double press.
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        })
        name.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          // The tray is a list, not a place the reader put there: its name is
          // the board's own word and has no fold of its own.
          if (block.kind === 'inbox') return
          BOARD_STORE.toggleBlockFold(block.key)
          renderBoard()
        })
      }
      // Only the name: the path is on the heading's tooltip, where a reader who
      // wants it can find it, rather than taking half the line on every panel.
      var count = document.createElement('span')
      Object.assign(count.style, BOARD_UI.blockCount)
      count.setAttribute('data-role', 'blockCount')
      // The tray counts what it holds, both kinds: a folded tray still has to say
      // how much is waiting in it, and a goal counts the conversations it carries.
      // A goal counts what it is showing: the quiet ones are their own line at the
      // foot of the panel, and counting them here would make a heading claim work
      // the columns below it are not carrying.
      var held = block.hot ? block.hot.length : block.rows.length
      if (block.kind === 'inbox') held += BOARD_STORE.filedCards(BOARD_INBOX).length
      count.textContent = String(held)
      head.appendChild(caret)
      head.appendChild(dot)
      head.appendChild(name)
      head.appendChild(count)
      // The second fold: the conversations stay, their thoughts go away. The
      // tray has no such switch - it is a list of what has no place, and a
      // thought put away in it is the whole of what that list says.
      if (block.kind !== 'inbox' && block.rows.length) {
        var ideasHidden = BOARD_STORE.isIdeasHidden(block.key)
        var threads = document.createElement('span')
        Object.assign(threads.style, ideasHidden ? BOARD_UI.blockIdeasOn : BOARD_UI.blockIdeas)
        threads.className = 'dshv-ideas-toggle'
        threads.setAttribute('role', 'button')
        threads.setAttribute('data-role', 'blockIdeas')
        threads.setAttribute('data-hidden', ideasHidden ? 'true' : 'false')
        threads.setAttribute('aria-pressed', ideasHidden ? 'true' : 'false')
        threads.setAttribute('aria-label', paletteText(ideasHidden ? 'boardIdeasShow' : 'boardIdeasHide'))
        threads.setAttribute('title', paletteText(ideasHidden ? 'boardIdeasShow' : 'boardIdeasHide'))
        threads.appendChild(boardIcon(ideasHidden ? 'expand' : 'collapse', 12))
        threads.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          BOARD_STORE.toggleBlockIdeas(block.key)
          renderBoard()
        })
        head.appendChild(threads)
      }
      // A goal is a place work starts, not only a shelf work is put on. The
      // plus is that start; a card dropped on it is the same start with the
      // words already written. The tray has no plus: it is where work has no
      // home, so starting there would be starting nowhere.
      if (block.kind !== 'inbox') {
        var newSession = document.createElement('span')
        Object.assign(newSession.style, BOARD_UI.blockNewSession)
        newSession.className = 'dshv-goal-new'
        newSession.setAttribute('role', 'button')
        newSession.setAttribute('data-role', 'goalNewSession')
        newSession.setAttribute('data-goal-key', block.key)
        newSession.setAttribute('data-no-drag', 'true')
        newSession.setAttribute('aria-label', paletteText('boardNewSession'))
        newSession.setAttribute('title', paletteText('boardNewSessionHint'))
        newSession.textContent = '+'
        newSession.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          openNewSessionSheet(block)
        })
        head.appendChild(newSession)
      }
      // The quiet verbs. Renaming a goal is the one that used to be a double
      // press on its name, and a name line is too direct a place for a field:
      // the ⋯ keeps it one deliberate press away and leaves the name's own
      // press meaning the fold. The menu is drawn on the paper, not in the
      // panel, because a panel clips what leaves it.
      if (block.kind !== 'inbox') {
        var goalMenuMark = document.createElement('span')
        Object.assign(goalMenuMark.style, BOARD_UI.cardMore)
        // The sheet decides when the mark shows and lights: an inline opacity
        // would outrank both rules.
        goalMenuMark.style.opacity = ''
        goalMenuMark.className = 'dshv-goal-more'
        goalMenuMark.setAttribute('role', 'button')
        goalMenuMark.setAttribute('data-role', 'goalMenuOpen')
        goalMenuMark.setAttribute('title', paletteText('boardGoalMenu'))
        goalMenuMark.setAttribute('aria-label', paletteText('boardGoalMenu'))
        goalMenuMark.setAttribute('aria-expanded', BOARD.goalMenu === block.key ? 'true' : 'false')
        goalMenuMark.textContent = '\u22ef'
        goalMenuMark.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          // Opening and closing a menu is not a repaint: the board may be
          // mid-field, and a paint would take the panel out from under the
          // press that asked. The next paint rebuilds it from this state.
          if (BOARD.goalMenu === block.key) {
            closeGoalMenu()
            return
          }
          closeGoalMenu()
          closeIdeaMenu()
          closeSessionMenu()
          closeSeatMenu()
          BOARD.goalMenu = block.key
          goalMenuMark.setAttribute('aria-expanded', 'true')
          var goalMenu = buildGoalMenu(block)
          placeGoalMenu(goalMenu, block, place)
          BOARD.stage.appendChild(goalMenu)
        })
        head.appendChild(goalMenuMark)
      }
      // Closing a place is for the places the reader made. A workspace panel is
      // not theirs to close: it is where its conversations live, and one that is
      // closed comes back the moment a conversation from it moves again.
      if (block.kind === 'user') {
        var kill = document.createElement('span')
        Object.assign(kill.style, BOARD_UI.blockKill)
        kill.className = 'dshv-goal-x'
        kill.setAttribute('role', 'button')
        kill.setAttribute('data-role', 'goalRemove')
        kill.setAttribute('title', paletteText('boardGoalRemove'))
        kill.textContent = '×'
        kill.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          removeBoardGoal(block)
        })
        head.appendChild(kill)
      }
      node.appendChild(head)
      // The wheel stands on the paper rather than inside the panel: a panel
      // clips what leaves it, and a folded one is only a heading tall. It is
      // still the panel's - the press that opened it is on that heading - so it
      // is drawn at the panel's own corner and put away with it.
      if (hue !== null && BOARD.seatMenu === block.key) {
        var wheel = buildSeatMenu(block)
        wheel.style.left = (place.x + 10) + 'px'
        wheel.style.top = (place.y + BOARD_BLOCK_HEAD_H - 4) + 'px'
        BOARD.stage.appendChild(wheel)
      }
      // A paint can land while the ⋯ menu is open - a feed tick, a landed
      // turn count - and the menu belongs to the page, not to the press that
      // happened to open it.
      if (BOARD.goalMenu === block.key) {
        var standingMenu = buildGoalMenu(block)
        placeGoalMenu(standingMenu, block, place)
        BOARD.stage.appendChild(standingMenu)
      }

      // What the goal is for, in the reader's own words.
      //
      // Under the heading, not in it: the heading is the handle the panel is
      // dragged by, and a sentence meant to be clicked cannot also be the thing
      // that picks the panel up. A goal with a line here keeps standing when its
      // last conversation leaves - that is the whole reason the line exists -
      // so the empty state says as much where it is read.
      var purpose = document.createElement('div')
      Object.assign(purpose.style, BOARD_UI.blockIntent)
      purpose.setAttribute('data-role', 'blockIntent')
      purpose.setAttribute('data-no-drag', 'true')
      var mark = document.createElement('span')
      Object.assign(mark.style, BOARD_UI.blockIntentMark)
      mark.textContent = '🎯'
      purpose.appendChild(mark)
      if (BOARD.intentBlock === block.key) {
        var field = document.createElement('input')
        Object.assign(field.style, BOARD_UI.blockIntentBox)
        field.setAttribute('type', 'text')
        field.setAttribute('data-role', 'blockIntentField')
        field.setAttribute('data-no-drag', 'true')
        field.setAttribute('aria-label', paletteText('boardGoalIntent'))
        field.setAttribute('placeholder', paletteText('boardGoalIntentPlaceholder'))
        field.value = block.intent || ''
        field.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitGoalIntent()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelGoalIntent()
          }
        })
        field.addEventListener('blur', function () {
          if (BOARD.intentBlock === block.key && BOARD.intentInput === field) commitGoalIntent()
        })
        BOARD.intentInput = field
        purpose.appendChild(field)
      } else {
        var said = document.createElement('span')
        Object.assign(said.style, block.intent ? BOARD_UI.blockIntentText : BOARD_UI.blockIntentEmpty)
        said.className = 'dshv-intent-text'
        said.setAttribute('data-role', 'blockIntentText')
        said.textContent = block.intent || paletteText('boardGoalIntentPlaceholder')
        said.setAttribute('title', paletteText('boardGoalIntentHint'))
        said.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginGoalIntent(block.key)
        })
        purpose.appendChild(said)
      }
      // Where the panel came from, when its name no longer says so. A workspace
      // panel still wearing its workspace's name has nothing to add; one renamed
      // to what the reader is doing there owes the reader the source.
      if (block.kind === 'workspace' && block.path && goalBaseName(block.path) !== block.label) {
        var source = document.createElement('span')
        Object.assign(source.style, BOARD_UI.blockIntentFrom)
        source.setAttribute('data-role', 'blockGoalFrom')
        source.textContent = goalBaseName(block.path)
        source.setAttribute('title', block.path)
        purpose.appendChild(source)
      }
      // The inbox is the place for what no workspace claimed, not a plan of
      // its own: a line saying what it is for would be a line about nothing.
      if (block.kind !== 'inbox') node.appendChild(purpose)

      if (!folded) {
        var body = document.createElement('div')
        Object.assign(body.style, block.kind === 'inbox' ? BOARD_UI.blockBody : BOARD_UI.blockRow)
        body.setAttribute('data-role', 'blockBody')
        if (block.kind === 'inbox') {
          // The tray is not a goal: it holds the conversations that have no home
          // yet *and* the notes that were put away in it, so it has a body of its
          // own rather than the column a goal draws. It is drawn whether or not
          // it holds a conversation - a note put away in an otherwise empty tray
          // is still there, and this body is the only place it is drawn.
          body.appendChild(buildInboxBody(block, titles))
        } else if (!block.rows.length) {
          var empty = document.createElement('div')
          Object.assign(empty.style, BOARD_UI.empty)
          empty.textContent = paletteText('boardEmptyInbox')
          body.appendChild(empty)
        } else {
          body.appendChild(buildBoardColumns(block, titles))
        }
        node.appendChild(body)
        // What the reader finished today, at the very foot of the place it was
        // finished in. The tray has one too: a finished conversation is
        // finished wherever it was waiting, and a strip that existed on every
        // panel but one would be a rule the reader has to remember an exception
        // to.
        node.appendChild(buildDoneBar(block, titles))
      }
      return node
    }

    /**
     * The conversations of one block, cut into threads.
     *
     * A thread is a conversation and everything forked from it, so the panel
     * reads top to bottom like the work happened: a branch sits under the
     * conversation it came from, joined by a line, and only a root sits at the
     * panel's own margin. Nothing here sorts — the pool already arrived newest
     * first, and a shelf that rearranges itself is a shelf you cannot learn.
     * @param {Array<object>} rows - the block's conversations, newest first.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the list.
     */
    /**
     * One named section of the tray: what it holds, and how much of it.
     * @param {string} name - the section's word.
     * @param {number} count - how many it holds.
     * @returns {Element} the caption.
     */
    function trayCaption(name, count) {
      var line = document.createElement('div')
      Object.assign(line.style, BOARD_UI.trayCaption)
      line.setAttribute('data-role', 'trayCaption')
      var word = document.createElement('span')
      word.textContent = name
      var many = document.createElement('span')
      Object.assign(many.style, BOARD_UI.trayCount)
      many.textContent = String(count)
      line.appendChild(word)
      line.appendChild(many)
      return line
    }

    /** A quiet line where a section has nothing in it yet. */
    function trayQuiet(text) {
      var line = document.createElement('div')
      Object.assign(line.style, BOARD_UI.trayQuiet)
      line.textContent = text
      return line
    }

    /**
     * One note, as a line of the tray.
     *
     * The tray is a list, not a surface: what is put away is read in a glance and
     * lifted back out when it is wanted. So a note here is one line - a box, its
     * words, and the two things that are about the line itself (its tie and its
     * delete) - and it becomes paper again the moment it is dragged out.
     * @param {object} card - one of the filed notes.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the row.
     */
    function buildTrayNote(card, titles, opts) {
      var row = document.createElement('div')
      // The same paper as a note on the canvas, and the shape of a line. The
      // material comes from NOTE_PAPER - not from `loose`, which also carries the
      // sheet's absolute placement and would stack every row on one spot.
      // A filed note is the same paper as a note on the canvas, and is read in
      // the same ink: one material, one pair of colours.
      var rowInk = noteInkOf(null, card.done)
      Object.assign(row.style, NOTE_PAPER, BOARD_UI.trayRow)
      if (card.done) Object.assign(row.style, BOARD_UI.looseDone)
      row.style.color = rowInk.text
      row.className = 'dshv-tray-row'
      row.setAttribute('data-role', 'inboxNote')
      row.setAttribute('data-card-id', card.id)
      row.setAttribute('data-handle', 'inboxNote')
      if (card.done) row.setAttribute('data-done', 'true')
      if (BOARD.cardEditing === card.id) row.setAttribute('data-editing', 'true')

      var doneToggle = document.createElement('span')
      Object.assign(doneToggle.style, BOARD_UI.cardDoneToggle)
      doneToggle.className = 'dshv-done-toggle'
      doneToggle.setAttribute('role', 'button')
      doneToggle.setAttribute('data-role', 'cardDoneToggle')
      doneToggle.setAttribute('aria-pressed', card.done ? 'true' : 'false')
      doneToggle.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
      doneToggle.setAttribute('data-done', card.done ? 'true' : 'false')
      doneToggle.textContent = card.done ? '\u2713' : ''
      if (card.done) Object.assign(doneToggle.style, BOARD_UI.cardDoneToggleOn)
      doneToggle.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.setCardDone(card.id, !card.done)
        // A card that stops being finished stops belonging in the bin, and the
        // card goes back to the paper rather than staying in a list that would
        // then be lying about its own name.
        if (card.done && ejectFromDoneBin(card)) return
        renderBoard()
      })
      row.appendChild(doneToggle)

      if (BOARD.cardEditing === card.id) {
        var editor = document.createElement('input')
        Object.assign(editor.style, BOARD_UI.trayEditor)
        editor.setAttribute('type', 'text')
        editor.setAttribute('data-role', 'cardText')
        editor.setAttribute('data-no-drag', 'true')
        editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
        editor.value = card.text
        editor.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBoardCard()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardCard()
          }
        })
        editor.addEventListener('blur', function () {
          if (BOARD.cardEditing === card.id && BOARD.cardEditor === editor) commitBoardCard()
        })
        row.appendChild(editor)
        BOARD.cardEditor = editor
      } else {
        // A row in the finished list is read, not written: one line of title until
        // it is pressed, and the whole note when it is. The tray's own rows keep
        // their single line and open their field instead - that is a place you
        // write in, this is a place you look things up in.
        var canOpen = !!(opts && opts.expand)
        var showing = canOpen && BOARD.rowOpen === card.id
        var head = noteParts(card.text)
        var text = document.createElement('span')
        Object.assign(text.style, BOARD_UI.trayText)
        text.style.color = rowInk.text
        if (showing) Object.assign(text.style, BOARD_UI.trayTextOpen)
        text.setAttribute('data-role', 'inboxNoteText')
        text.setAttribute('title', canOpen ? paletteText('boardCardOpenHint') : card.text)
        text.textContent = showing ? card.text : head.title || paletteText('boardCardPlaceholder')
        if (!head.title) text.style.opacity = '0.45'
        text.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          if (!canOpen) {
            openIdeaFocus(card.id, 'title', { origin: ideaFocusOrigin(ev, row) })
            return
          }
          BOARD.rowOpen = showing ? '' : card.id
          renderBoard()
        })
        row.appendChild(text)
      }

      // Its tie, if it still has one: a word, not a curve. A curve belongs to
      // paper, and this is a line of a list.
      if (card.link) {
        var chip = document.createElement('span')
        Object.assign(chip.style, BOARD_UI.trayChip)
        chip.style.color = rowInk.dim
        chip.style.background = 'rgba(0, 0, 0, 0.06)'
        chip.setAttribute('data-role', 'cardLinkLabel')
        chip.textContent = '\u2192 ' + (titles[card.link] || paletteText('boardCardLinkedUnknown'))
        chip.setAttribute('title', chip.textContent)
        row.appendChild(chip)
      }

      var actions = document.createElement('span')
      actions.className = 'dshv-note-actions'
      actions.setAttribute('data-role', 'cardActions')
      if (card.link) {
        var unlink = document.createElement('span')
        Object.assign(unlink.style, BOARD_UI.looseUnlink)
        unlink.setAttribute('data-role', 'cardUnlink')
        unlink.setAttribute('title', paletteText('boardCardUnlink'))
        unlink.textContent = paletteText('boardCardUnlink')
        unlink.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          BOARD_STORE.unlinkCard(card.id)
          // No tie means it is no longer a finished thought about a conversation.
          if (ejectFromDoneBin(card)) return
          renderBoard()
        })
        actions.appendChild(unlink)
      }
      var remove = document.createElement('span')
      Object.assign(remove.style, BOARD_UI.looseRemove)
      remove.setAttribute('data-role', 'cardRemove')
      remove.setAttribute('title', paletteText('boardCardRemove'))
      remove.textContent = '×'
      remove.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        removeLooseCard(card.id)
      })
      actions.appendChild(remove)
      row.appendChild(actions)
      return row
    }

    /**
     * Ink every conversation inside one node with the tray's paper.
     * @param {Element} node - the list to walk.
     * @returns {void}
     */
    function trayInk(node) {
      var kids = node.children || []
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i]
        if (child.getAttribute && child.getAttribute('data-session-id')) {
          Object.assign(child.style, BOARD_UI.trayCard)
        }
        trayInk(child)
      }
    }

    /** Every note put away in the finished-cards bin, newest first. */
    function doneBinCards() {
      return BOARD_STORE.filedCards(BOARD_DONE).slice().reverse()
    }

    /** The put-away notes one conversation was handed, newest first. */
    function doneBinCardsOf(sessionId) {
      if (!sessionId) return []
      var all = doneBinCards()
      var mine = []
      for (var i = 0; i < all.length; i++) {
        if (all[i].link === sessionId) mine.push(all[i])
      }
      return mine
    }

    /**
     * Open the bin on one conversation's own put-aways.
     *
     * The mark on a card is the same list filtered to that card: a reader who
     * asks "what did I hand to this one" should not have to find it in a list of
     * everything. Pressing the heading's chip is how the filter is dropped.
     * @param {string} sessionId - the conversation whose mark was pressed.
     * @returns {void}
     */
    function openDoneBinFor(sessionId) {
      var same = BOARD.doneBinOpen && BOARD.doneBinFilter === sessionId
      BOARD.doneBinOpen = !same
      BOARD.doneBinFilter = same ? '' : String(sessionId || '')
      renderBoard()
    }

    /**
     * Say how many cards the bin holds, and what it is doing.
     *
     * Written on every paint rather than by rebuilding the chip: the chip is made
     * once with the heading, and a heading that came back wearing a different
     * word on each status tick would be worse than a count a beat old.
     * @returns {void}
     */
    function paintDoneBin() {
      var chip = BOARD.doneBin
      if (!chip) return
      var count = doneBinCards().length
      // A place with nothing in it is not a place yet: the chip is there from
      // the first card onward, and out of the way until then.
      chip.style.display = count ? '' : 'none'
      var label = paletteText('boardDoneBin')
      var text = count ? label + ' \u00b7 ' + count : label
      if (chip.textContent !== text) chip.textContent = text
      Object.assign(chip.style, BOARD.doneBinOpen ? BOARD_UI.doneBinOn : BOARD_UI.doneBin)
      chip.setAttribute('aria-expanded', BOARD.doneBinOpen ? 'true' : 'false')
    }

    /** Open or close the finished-cards list. */
    function toggleDoneBin() {
      // The heading is the list of everything: pressing it is also how a filter
      // put there by a card's own mark is dropped.
      BOARD.doneBinOpen = !BOARD.doneBinOpen
      BOARD.doneBinFilter = ''
      renderBoard()
    }

    /**
     * One finished note, as a line of the card's list.
     *
     * Two lines folded - the title, and the first line of the body under it - so
     * the reader can tell which thought this is without opening it; the whole note
     * when the line is pressed. The marks are the only two things a finished note
     * still needs: put it back on the paper, or drop it.
     * @param {object} card - one of the filed notes.
     * @returns {Element} the row.
     */
    function buildDoneRow(card) {
      var parts = noteParts(card.text)
      var open = BOARD.rowOpen === card.id
      var row = document.createElement('div')
      // A card, not a row: the same paper as the note it was, read one line at a
      // time and opened by pressing it - the tray's own language.
      Object.assign(row.style, NOTE_PAPER, BOARD_UI.doneRow)
      if (open) Object.assign(row.style, BOARD_UI.doneRowOpen)
      row.className = 'dshv-done-row'
      row.setAttribute('data-role', 'doneRow')
      row.setAttribute('data-card-id', card.id)
      // The row is still a note: the same gesture lifts it back onto the paper.
      row.setAttribute('data-handle', 'inboxNote')
      if (open) row.setAttribute('data-open', 'true')

      var main = document.createElement('div')
      Object.assign(main.style, BOARD_UI.doneRowMain)
      if (open) {
        var full = document.createElement('div')
        Object.assign(full.style, BOARD_UI.doneRowFull)
        full.setAttribute('data-role', 'doneFull')
        full.textContent = card.text
        main.appendChild(full)
      } else {
        // One line: what this list is for is telling the finished thoughts apart,
        // and the title does that. The rest is one press away.
        var title = document.createElement('div')
        Object.assign(title.style, BOARD_UI.doneRowTitle)
        title.setAttribute('data-role', 'doneTitle')
        title.setAttribute('title', card.text)
        title.textContent = parts.title || paletteText('boardCardPlaceholder')
        main.appendChild(title)
      }
      row.appendChild(main)

      var putBack = document.createElement('span')
      Object.assign(putBack.style, BOARD_UI.doneRowAction)
      putBack.setAttribute('role', 'button')
      putBack.setAttribute('data-role', 'donePutBack')
      putBack.setAttribute('aria-label', paletteText('boardDoneBack'))
      putBack.setAttribute('title', paletteText('boardDoneBack'))
      putBack.textContent = '\u2193'
      putBack.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        ejectFromDoneBin(card)
      })
      row.appendChild(putBack)

      var remove = document.createElement('span')
      Object.assign(remove.style, BOARD_UI.doneRowAction)
      remove.setAttribute('role', 'button')
      remove.setAttribute('data-role', 'doneRemove')
      remove.setAttribute('aria-label', paletteText('boardCardRemove'))
      remove.setAttribute('title', paletteText('boardCardRemove'))
      remove.textContent = '×'
      remove.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        removeLooseCard(card.id)
      })
      row.appendChild(remove)

      // The whole line opens the note, not just its words: a list is read by
      // pointing at a line.
      row.addEventListener('click', function (ev) {
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        var hit = ev && ev.target
        if (hit && typeof hit.closest === 'function'
          && hit.closest('[data-role="donePutBack"],[data-role="doneRemove"]')) return
        BOARD.rowOpen = open ? '' : card.id
        renderBoard()
      })
      return row
    }

    /**
     * Put the finished-cards list on the board, or take it away.
     *
     * The rows are the inbox tray's own rows, so a card is dragged back onto the
     * canvas by the gesture the reader already knows - and the board's single
     * press handler sees the press, because this list is mounted inside the board
     * it belongs to rather than floating outside it.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {void}
     */
    function mountDoneBin(titles) {
      if (BOARD.doneBinPanel && BOARD.doneBinPanel.parentNode) {
        BOARD.doneBinPanel.parentNode.removeChild(BOARD.doneBinPanel)
      }
      BOARD.doneBinPanel = null
      if (!BOARD.doneBinOpen || !BOARD.panel) return
      var cards = BOARD.doneBinFilter ? doneBinCardsOf(BOARD.doneBinFilter) : doneBinCards()
      // A list with nothing in it is not a list: the card stopped offering the
      // mark, and a panel left standing would be a door onto an empty room.
      if (!cards.length) {
        BOARD.doneBinOpen = false
        BOARD.rowOpen = ''
        return
      }
      var panel = document.createElement('div')
      Object.assign(panel.style, BOARD_UI.doneBinPanel)
      panel.className = 'dshv-done-bin'
      panel.setAttribute('data-role', 'doneBinPanel')
      panel.addEventListener('pointerdown', boardPointerDown)
      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.doneBinHead)
      head.setAttribute('data-role', 'doneBinHead')
      // The card is standing right beside this panel, so the heading says what the
      // list is and how long it is - not whose it is, twice.
      var name = document.createElement('span')
      name.textContent = paletteText('boardDoneBin')
      head.appendChild(name)
      var many = document.createElement('span')
      Object.assign(many.style, BOARD_UI.trayCount)
      many.textContent = String(cards.length)
      head.appendChild(many)
      var close = document.createElement('span')
      Object.assign(close.style, BOARD_UI.doneRowAction)
      close.style.marginLeft = 'auto'
      close.setAttribute('role', 'button')
      close.setAttribute('data-role', 'doneClose')
      close.setAttribute('aria-label', paletteText('close'))
      close.setAttribute('title', paletteText('close'))
      close.textContent = '×'
      close.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        BOARD.doneBinOpen = false
        BOARD.rowOpen = ''
        renderBoard()
      })
      head.appendChild(close)
      panel.appendChild(head)
      var list = document.createElement('div')
      Object.assign(list.style, BOARD_UI.doneBinList)
      list.setAttribute('data-role', 'doneBinList')
      for (var i = 0; i < cards.length; i++) list.appendChild(buildDoneRow(cards[i]))
      panel.appendChild(list)
      // Beside the card whose mark opened it: the list belongs to that card, and a
      // reader who pressed a mark on it expects the answer there - not in the
      // corner of the window, where it would have to be found twice.
      if (BOARD.doneBinFilter && BOARD.panel) {
        var anchor = null
        for (var n = 0; n < BOARD.nodes.length; n++) {
          if (BOARD.nodes[n].getAttribute('data-session-id') === BOARD.doneBinFilter) anchor = BOARD.nodes[n]
        }
        var rootRect = typeof BOARD.panel.getBoundingClientRect === 'function'
          ? BOARD.panel.getBoundingClientRect()
          : null
        var cardRect = anchor && typeof anchor.getBoundingClientRect === 'function'
          ? anchor.getBoundingClientRect()
          : null
        if (rootRect && cardRect && (cardRect.width || cardRect.height)) {
          var zoomNow = BOARD.zoom || 1
          panel.style.right = 'auto'
          panel.style.left = Math.round((cardRect.right - rootRect.left) / zoomNow + 10) + 'px'
          panel.style.top = Math.max(8, Math.round((cardRect.top - rootRect.top) / zoomNow)) + 'px'
        }
      }
      BOARD.panel.appendChild(panel)
      BOARD.doneBinPanel = panel
    }

    /**
     * Put one card back on the paper, out of the finished-cards bin.
     *
     * A bin that kept a card which no longer belongs there would be lying about
     * its own name: the moment a card in it stops being finished - or stops being
     * tied to anything - it goes back where it came from. It keeps its own place,
     * so the card reappears exactly where it left; what should happen to it next
     * is a question for the next tidy, not for this press.
     * @param {object} card - the card being taken out.
     * @returns {boolean} whether it was in the bin at all.
     */
    function ejectFromDoneBin(card) {
      if (!card || card.filed !== BOARD_DONE) return false
      BOARD_STORE.unfileCard(card.id)
      if (BOARD.open) renderBoard()
      showToast(paletteText('boardDoneBack'))
      return true
    }

    /**
     * The tray's body: the conversations nothing accounts for, and the notes put away here.
     *
     * A goal answers "what am I working on", and its rows are all conversations.
     * The inbox answers "what has not found a place", so it holds both kinds and
     * names the two sections rather than running them together: the reader has to
     * be able to see what is work and what is a thought at a glance.
     * @param {object} block - the inbox block.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the body's contents.
     */
    function buildInboxBody(block, titles) {
      var wrap = document.createElement('div')
      Object.assign(wrap.style, BOARD_UI.tray)
      // The tray is one material. Its conversations wear the ideas' paper, so a
      // panel of two kinds reads as one place rather than two lists stacked; the
      // class is what the stylesheet hangs that on, and the ideas keep their one
      // line because a line is what a list is read in.
      wrap.className = 'dshv-tray'
      wrap.setAttribute('data-role', 'inboxBody')
      // Everything filed that is not in the bin is read here - the inbox, and
      // whatever a newer build might have filed somewhere this one cannot draw:
      // a card nobody draws is a card the reader has lost, and the tray is the
      // one place that can always show it.
      var notes = BOARD_STORE.filedCards(BOARD_INBOX)
      var every = BOARD_STORE.cards()
      for (var f = 0; f < every.length; f++) {
        var held = every[f]
        if (!held.filed || held.filed === BOARD_INBOX || held.filed === BOARD_DONE) continue
        notes.push(held)
      }
      // The tray counts the same thing a goal's heading does: what it is showing as
      // columns. The quiet ones are their own line, told apart underneath.
      wrap.appendChild(trayCaption(paletteText('boardInboxSessions'),
        block.hot ? block.hot.length : block.rows.length))
      if (!block.rows.length) {
        wrap.appendChild(trayQuiet(paletteText('boardEmptyInbox')))
      } else {
        var columns = buildBoardColumns(block, titles)
        // Every conversation in the tray wears the ideas' paper. The walk is here
        // rather than in the builder because it is the tray's fact, not a card's:
        // the same card dropped into a goal goes back to the goal's own ink.
        trayInk(columns)
        wrap.appendChild(columns)
      }
      wrap.appendChild(trayCaption(paletteText('boardInboxNotes'), notes.length))
      if (!notes.length) wrap.appendChild(trayQuiet(paletteText('boardEmptyTrayIdeas')))
      for (var i = 0; i < notes.length; i++) wrap.appendChild(buildTrayNote(notes[i], titles))
      return wrap
    }

    /**
     * How many columns a panel reads across.
     * @param {object} block - the panel's block.
     * @returns {number} one column per conversation being worked in.
     */
    function boardBlockColumns(block) {
      if (!block) return 0
      if (block.hot) return block.hot.length
      return block.rows ? block.rows.length : 0
    }

    /**
     * Whether one card is drawn inside a conversation's column.
     *
     * A card is stacked when it is tied to a conversation this paint can draw:
     * a tie to a conversation that is not on the board today has no column to
     * live in, so that card stays a free card on the paper. A card nobody draws
     * is a thought the reader has lost.
     * @param {object} card - one of `BOARD_STORE.cards`.
     * @returns {boolean} whether it is drawn in a stack.
     */
    function boardCardStacked(card) {
      if (!card || !card.link || card.filed) return false
      var blocks = BOARD.blocks || []
      for (var b = 0; b < blocks.length; b++) {
        var rows = blocks[b].rows || []
        for (var r = 0; r < rows.length; r++) {
          if (rows[r].id === card.link) return true
        }
      }
      return false
    }

    /**
     * How wide a panel stands.
     *
     * A goal is one column per conversation being worked in, so its width is
     * those columns plus the padding they stand in. The columns stop at the row's
     * own cap: past it a conversation starts another row under the first, which
     * makes the panel taller rather than wider - the direction a canvas is meant
     * to grow in, and the one that stops a busy goal from running off the paper.
     * @param {object} block - the panel's block.
     * @returns {number} the width in unzoomed pixels.
     */
    function boardBlockWidth(block) {
      var columns = boardBlockColumns(block)
      if (!columns) return BOARD_BLOCK_W
      var across = Math.min(columns, BOARD_ROW_COLUMNS)
      return BOARD_BLOCK_PAD * 2 + across * BOARD_CARD_W + (across - 1) * BOARD_COLUMN_GAP
    }

    /**
     * A goal's conversations, laid out across the panel.
     *
     * A conversation being worked in is a column: its card, and under it the
     * thoughts that were filed under it, top to bottom in the order they were
     * written. A branch sits beside the conversation it was cut from - the order
     * already seats it there - and the elbow above the row is what says so.
     *
     * The row is capped, and what does not fit starts another row under it: a
     * panel used to answer a busy goal by growing sideways, one 280px column per
     * conversation, which is how a dozen of them turned one goal into two screens
     * of paper. The quiet ones - carried in by the day, untouched since - are not
     * columns at all: they are the strip at the foot of the panel, one line each.
     * @param {object} block - the goal whose body this is.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the columns, and the quiet conversations under them.
     */
    function buildBoardColumns(block, titles) {
      var wrap = document.createElement('div')
      Object.assign(wrap.style, BOARD_UI.blockColumnsWrap)
      wrap.setAttribute('data-role', 'blockColumnsWrap')
      var rows = block.hot || block.rows || []
      if (rows.length) {
        var across = Math.min(rows.length, BOARD_ROW_COLUMNS)
        var grid = document.createElement('div')
        Object.assign(grid.style, BOARD_UI.columns)
        // The width is the whole of the cap: a flex row in a panel would keep
        // growing sideways, which is the one thing this row exists to stop.
        grid.style.flexWrap = 'wrap'
        grid.style.width = (across * BOARD_CARD_W + (across - 1) * BOARD_COLUMN_GAP) + 'px'
        grid.setAttribute('data-role', 'blockColumns')
        var hidden = BOARD_STORE.isIdeasHidden(block.key)
        var byId = Object.create(null)
        var i
        for (i = 0; i < rows.length; i++) byId[rows[i].id] = rows[i]
        for (i = 0; i < rows.length; i++) {
          grid.appendChild(buildBoardColumn(block, rows[i], titles, hidden, byId))
        }
        wrap.appendChild(grid)
      }
      var quiet = block.quiet || []
      if (quiet.length) wrap.appendChild(buildQuietStrip(block, quiet, titles))
      return wrap
    }

    /**
     * One conversation of a panel, as the column it stands in.
     *
     * One shape for the work above and the finished strip below: both draw the
     * card, and the strip's columns carry no thoughts because what is finished
     * is a conversation, not the notes that led to it.
     * @param {object} block - the panel's block.
     * @param {object} row - the conversation.
     * @param {object} titles - session id -> the name to call it by.
     * @param {boolean} hidden - whether this panel's thoughts are put away.
     * @param {object} byId - every conversation this panel draws, by id.
     * @param {object} [opts] - `done` when the column stands in the finished strip.
     * @returns {Element} the column.
     */
    function buildBoardColumn(block, row, titles, hidden, byId, opts) {
      var parent = BOARD_STORE.lineageOf(row.id)
      var orphan = parent && parent !== row.id && !byId[parent] ? parent : ''
      var done = !!(opts && opts.done)
      var column = document.createElement('div')
      Object.assign(column.style, BOARD_UI.column)
      column.className = 'dshv-col'
      column.setAttribute('data-role', 'sessionColumn')
      column.setAttribute('data-column', row.id)
      if (done) column.setAttribute('data-done', 'true')
      column.appendChild(buildBoardCard(row, orphan, titles, goalHue(block), opts))
      if (!hidden && !done) column.appendChild(buildBoardStack(row.id, titles))
      return column
    }

    /**
     * The long strip at the foot of a goal: what the reader finished today.
     *
     * It stands whether or not it holds anything, because a strip that appears
     * only after the first drop is a target the hand cannot aim at before it
     * has used it once. Closed, it is one line and a count; open, it lays the
     * finished conversations across the panel the way the work above is laid.
     * Nothing arrives here by itself: a turn that finishes stays in the columns
     * until the reader carries it down, and only the reader's mark moves it.
     * @param {object} block - the goal whose foot this is.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the strip.
     */
    function buildDoneBar(block, titles) {
      var rows = block.done || []
      var open = BOARD.doneOpen[block.key] === true
      var bar = document.createElement('div')
      Object.assign(bar.style, BOARD_UI.doneBar)
      bar.className = 'dshv-done-bar'
      bar.setAttribute('data-role', 'doneBar')
      bar.setAttribute('data-block', block.key)
      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.doneHead)
      if (open) Object.assign(head.style, BOARD_UI.doneHeadOpen)
      head.className = 'dshv-done-head'
      head.setAttribute('data-role', 'doneHead')
      head.setAttribute('data-no-drag', 'true')
      head.setAttribute('role', 'button')
      head.setAttribute('aria-expanded', open ? 'true' : 'false')
      head.setAttribute('title', paletteText(open ? 'boardDoneCollapseHint' : 'boardDoneTodayHint'))
      var caret = document.createElement('span')
      caret.setAttribute('aria-hidden', 'true')
      caret.textContent = open ? '\u25be' : '\u25b8'
      head.appendChild(caret)
      var label = document.createElement('span')
      label.setAttribute('data-role', 'doneLabel')
      label.textContent = paletteText('boardDoneToday')
      head.appendChild(label)
      var count = document.createElement('span')
      Object.assign(count.style, BOARD_UI.doneCount)
      count.setAttribute('data-role', 'doneCount')
      count.textContent = String(rows.length)
      head.appendChild(count)
      head.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD.doneOpen[block.key] = !open
        renderBoard()
      })
      bar.appendChild(head)
      if (!open) return bar
      if (!rows.length) {
        var empty = document.createElement('div')
        Object.assign(empty.style, BOARD_UI.doneEmpty)
        empty.setAttribute('data-role', 'doneEmpty')
        empty.textContent = paletteText('boardDoneEmpty')
        bar.appendChild(empty)
        return bar
      }
      var grid = document.createElement('div')
      Object.assign(grid.style, BOARD_UI.doneGrid)
      grid.setAttribute('data-role', 'doneGrid')
      // The lineage is read against every conversation the goal draws, not
      // just the finished ones: a finished branch whose parent is still at
      // work is not an orphan, and it should not say it is.
      var byId = Object.create(null)
      for (var r = 0; r < block.rows.length; r++) byId[block.rows[r].id] = block.rows[r]
      for (var i = 0; i < rows.length; i++) {
        grid.appendChild(buildBoardColumn(block, rows[i], titles, true, byId, { done: true }))
      }
      bar.appendChild(grid)
      return bar
    }

    /**
     * The conversations a panel carried in and nobody has touched, one line each.
     *
     * They are on the board - the day brought them along - but nothing is being
     * worked in them, so a column apiece is the wrong shape: a goal holding a
     * dozen of those is the panel this strip is here to prevent. It says how many
     * there are and how long the oldest has waited, and unfolds on a press. No
     * press is needed to make it happen and none is needed to undo it: a quiet
     * conversation is back in its column the moment it moves, is marked, or
     * starts a turn.
     * @param {object} block - the panel's block.
     * @param {Array<object>} rows - the conversations drawn as lines.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the strip.
     */
    function buildQuietStrip(block, rows, titles) {
      var strip = document.createElement('div')
      Object.assign(strip.style, BOARD_UI.quietStrip)
      strip.setAttribute('data-role', 'quietStrip')
      strip.setAttribute('data-block', block.key)
      var open = BOARD.quietOpen[block.key] === true
      var today = dayOf(Date.now())
      var oldest = 0
      var d
      for (d = 0; d < rows.length; d++) {
        var days = CARRY.days(rows[d].id, today)
        if (days > oldest) oldest = days
      }
      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.quietHead)
      head.className = 'dshv-quiet-head'
      head.setAttribute('data-role', 'quietHead')
      head.setAttribute('role', 'button')
      head.setAttribute('aria-expanded', open ? 'true' : 'false')
      head.setAttribute('title', paletteText(open ? 'boardQuietCloseHint' : 'boardQuietHint'))
      head.textContent = (open ? '▾ ' : '▸ ') + paletteText('boardQuiet') + ' ' + rows.length
      if (oldest) {
        head.textContent += ' · ' + paletteText('boardQuietLongest') + ' ' + oldest + ' ' + paletteText('boardQuietDays')
      }
      head.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD.quietOpen[block.key] = !open
        renderBoard()
      })
      strip.appendChild(head)
      if (!open) return strip
      for (var r = 0; r < rows.length; r++) {
        strip.appendChild(buildQuietRow(block, rows[r], titles))
        if (BOARD.quietCards[rows[r].id] === true) strip.appendChild(buildQuietStack(rows[r].id, titles))
      }
      return strip
    }

    /**
     * One quiet conversation, as the line it is drawn as.
     *
     * The line is the way in, exactly as a card is: a press that does not travel
     * opens the conversation, and a press that travels carries it out of the
     * panel like any other card - so it wears the card's own handle and the one
     * press handler needs nothing new. Its thoughts are not drawn for a quiet
     * conversation, because a line has no column to hold them: the line says how
     * many there are, and that count is the chip that puts them on the paper.
     * @param {object} block - the panel's block.
     * @param {object} summary - the conversation.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the line.
     */
    function buildQuietRow(block, summary, titles) {
      var row = document.createElement('div')
      Object.assign(row.style, BOARD_UI.quietRow)
      row.className = 'dshv-quiet-row'
      row.setAttribute('data-role', 'quietRow')
      row.setAttribute('data-session-id', summary.id)
      row.setAttribute('data-handle', 'card')
      row.setAttribute('title', paletteText('boardQuietRowHint'))
      row.addEventListener('click', function () {
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        activateSession(summary.id, { anchor: true })
      })
      var dot = document.createElement('span')
      Object.assign(dot.style, BOARD_UI.quietDot)
      dot.className = 'dshv-quiet-dot'
      dot.setAttribute('data-role', 'quietDot')
      dot.style.background = blockInk(block)
      row.appendChild(dot)
      var name = document.createElement('span')
      Object.assign(name.style, BOARD_UI.quietName)
      name.setAttribute('data-role', 'quietName')
      name.textContent = titles[summary.id] || boardTitleOf(summary)
      row.appendChild(name)
      var mine = 0
      var cards = BOARD_STORE.cards()
      for (var c = 0; c < cards.length; c++) {
        if (cards[c].link === summary.id && !cards[c].filed) mine = mine + 1
      }
      if (mine) {
        var chip = document.createElement('span')
        Object.assign(chip.style, BOARD_UI.quietCards)
        chip.className = 'dshv-quiet-cards'
        chip.setAttribute('role', 'button')
        chip.setAttribute('data-role', 'quietCards')
        chip.setAttribute('aria-pressed', BOARD.quietCards[summary.id] === true ? 'true' : 'false')
        chip.setAttribute('title', paletteText('boardQuietCardsHint'))
        chip.textContent = mine + ' ' + paletteText('boardQuietCardsUnit')
        chip.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          BOARD.quietCards[summary.id] = BOARD.quietCards[summary.id] !== true
          renderBoard()
        })
        row.appendChild(chip)
      }
      var days = CARRY.days(summary.id, dayOf(Date.now()))
      if (days) {
        var waited = document.createElement('span')
        Object.assign(waited.style, BOARD_UI.quietDays)
        waited.setAttribute('data-role', 'quietDays')
        waited.textContent = days + ' ' + paletteText('boardQuietDays')
        row.appendChild(waited)
      }
      return row
    }

    /**
     * The thoughts under one quiet conversation, once its count was pressed.
     *
     * The same pile a column draws, and the same element: a thought is read where
     * it was written, whether its conversation is three columns wide today or one
     * line. It is inset so the pile reads as belonging to the line above it.
     * @param {string} sessionId - the conversation.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the inset holding the pile.
     */
    function buildQuietStack(sessionId, titles) {
      var box = document.createElement('div')
      Object.assign(box.style, BOARD_UI.quietStack)
      box.setAttribute('data-role', 'quietStack')
      box.appendChild(buildBoardStack(sessionId, titles))
      return box
    }

    /**
     * The thoughts filed under one conversation.
     *
     * The pile is read in the order the thoughts were written, and nothing here
     * sorts them: a stack that rearranged itself would be a stack the reader has
     * to read again every time they look. The frame is always drawn, even empty:
     * it is what a carried card is let go into.
     * @param {string} sessionId - the conversation the pile belongs to.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {Element} the pile.
     */
    function buildBoardStack(sessionId, titles) {
      var stack = document.createElement('div')
      Object.assign(stack.style, BOARD_UI.stack)
      stack.className = 'dshv-stack'
      stack.setAttribute('data-role', 'cardStack')
      stack.setAttribute('data-session', sessionId)
      var cards = BOARD_STORE.cards()
      var open = []
      var done = []
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i]
        if (card.filed || card.link !== sessionId) continue
        if (card.done) done.push(card)
        else open.push(card)
      }
      // What is still open is the work: every one of them is shown. What is
      // finished has stopped asking for room - three are enough to remember
      // what this conversation was about, and the rest are one press away.
      for (var o = 0; o < open.length; o++) {
        stack.appendChild(buildBoardLooseCard(open[o], titles, { stacked: sessionId, compact: true }))
      }
      var unfolded = BOARD.doneExpanded[sessionId] === true
      var shown = unfolded ? done : done.slice(0, BOARD_DONE_PREVIEW)
      for (var f = 0; f < shown.length; f++) {
        stack.appendChild(buildBoardLooseCard(shown[f], titles, { stacked: sessionId, compact: true }))
      }
      if (done.length > BOARD_DONE_PREVIEW) {
        var more = document.createElement('span')
        Object.assign(more.style, BOARD_UI.doneMore)
        more.className = 'dshv-done-more'
        more.setAttribute('role', 'button')
        more.setAttribute('data-role', 'cardDoneMore')
        more.setAttribute('data-session', sessionId)
        more.setAttribute('aria-expanded', unfolded ? 'true' : 'false')
        more.textContent = unfolded
          ? paletteText('boardDoneCollapse')
          : paletteText('boardDoneMore') + ' ' + (done.length - BOARD_DONE_PREVIEW) + ' '
            + paletteText('boardDoneMoreUnit')
        more.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          BOARD.doneExpanded[sessionId] = !unfolded
          renderBoard()
        })
        stack.appendChild(more)
      }
      if (!open.length && !done.length) stack.setAttribute('data-empty', 'true')
      BOARD.stacks.push({ sessionId: sessionId, el: stack })
      return stack
    }

    /**
     * Wear the one beat a completion is worth - once.
     *
     * The beat is the task window's own: a fast front edge and a slow settle,
     * over in under a second, leaving a quiet ring behind while the completion is
     * still unread. The board used to hang it on the element and let CSS play it,
     * which meant it played again on every repaint - a drag, a star, a status
     * tick, all of them. The ledger is what makes it once.
     * @param {Element} card - the card being drawn.
     * @param {string} id - session id.
     * @returns {void}
     */
    function markCardFresh(card, id) {
      card.setAttribute('data-unread', 'true')
      if (BOARD.freshed[id]) return
      BOARD.freshed[id] = true
      card.setAttribute('data-fresh', 'true')
    }

    /**
     * One conversation on the board: its name, what it is doing, and the
     * buttons that act on it.
     *
     * The card itself is the way in. It used to be the one thing on the board a
     * press did nothing to - opening was a small arrow on a rail, and the name
     * was a rename field waiting for a mis-click - which made the largest target
     * on the canvas carry the least likely action and the most likely action
     * carry a destructive one. A press that never travels now opens the
     * conversation; the marks and fields inside stop their own presses, so
     * nothing else on the card can be confused with it.
     *
     * Renaming is deliberate instead: it lives behind the card's ⋯, one press
     * further away than the card itself (see `buildSessionMenu`).
     * There is no 进入 button: it was a fifth of the card spent on the one action
     * the card already answered to. What is left as a target is the drop - an
     * idea card carried onto this one - and that overlay is drawn only while a
     * card is being carried (see `data-note-drag`).
     * @param {object} summary - session summary.
     * @param {string} orphan - a fork source this block does not carry, or ''.
     * @param {object} titles - session id -> the name to call it by.
     * @param {number|undefined} hue - the goal's own colour, or nothing for a
     *   card drawn outside a goal (the copy under the hand during a carry).
     * @returns {Element} the card.
     */

    /**
     * The word one conversation wears, in the reader's language.
     * @param {string} key - one of `VERDICT_KEYS`.
     * @returns {string} the word.
     */
    function verdictText(key) {
      if (key === 'paused') return paletteText('statusPaused')
      if (key === 'settled') return paletteText('statusSettled')
      return paletteText('statusFinished')
    }

    /**
     * What the reader said about a card, as the chip that says it.
     *
     * The chip is also the door: pressing it offers the two words again, so a
     * state that was set by hand can be changed by hand. The one the reader
     * cannot change is the one the shell owns - a turn in flight or a completion
     * nobody has opened - and that chip is drawn elsewhere, read-only.
     * @param {object} summary - the conversation.
     * @param {object} verdict - `{key, at}`.
     * @returns {Element} the chip.
     */
    function buildVerdictChip(summary, verdict) {
      var chip = document.createElement('span')
      Object.assign(
        chip.style,
        BOARD_UI.cardChip,
        BOARD_UI['cardChip' + verdict.key.charAt(0).toUpperCase() + verdict.key.slice(1)]
      )
      chip.className = 'dshv-chip'
      chip.setAttribute('role', 'button')
      chip.setAttribute('data-role', 'cardState')
      chip.setAttribute('data-state', verdict.key)
      chip.setAttribute('data-no-drag', 'true')
      chip.setAttribute('title', paletteText('cardStateHint'))
      chip.setAttribute('aria-expanded', BOARD.verdictMenu === summary.id ? 'true' : 'false')
      chip.textContent = verdictText(verdict.key)
      chip.addEventListener('click', stateToggle(summary.id))
      return chip
    }

    /**
     * The empty seat, for a card the shell has nothing to say about.
     *
     * A faint plus, not nothing: the reader has to be able to find the place
     * before they know they want it.
     * @param {object} summary - the conversation.
     * @returns {Element} the plus.
     */
    function buildStateAdd(summary) {
      var add = document.createElement('span')
      Object.assign(add.style, BOARD_UI.cardStateAdd)
      add.className = 'dshv-state-add'
      add.setAttribute('role', 'button')
      add.setAttribute('data-role', 'cardStateAdd')
      add.setAttribute('data-no-drag', 'true')
      add.setAttribute('title', paletteText('cardStateHint'))
      add.setAttribute('aria-label', paletteText('cardStateHint'))
      add.setAttribute('aria-expanded', BOARD.verdictMenu === summary.id ? 'true' : 'false')
      add.textContent = '+'
      add.addEventListener('click', stateToggle(summary.id))
      return add
    }

    /**
     * Open or close one card's state menu.
     * @param {string} id - the conversation.
     * @returns {Function} the click handler.
     */
    function stateToggle(id) {
      return function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD.verdictMenu = BOARD.verdictMenu === id ? '' : id
        renderBoard()
      }
    }

    /**
     * The two words, and the way back to having said nothing.
     *
     * The way back is not a courtesy: one of these words hides a fact the board
     * wrote itself, so a word that could only be replaced would be a word the
     * reader learns not to say.
     * @param {object} summary - the conversation.
     * @returns {Element} the menu.
     */
    function buildVerdictMenu(summary) {
      var menu = document.createElement('div')
      Object.assign(menu.style, BOARD_UI.verdictMenu)
      menu.className = 'dshv-verdict-menu'
      menu.setAttribute('data-role', 'verdictMenu')
      menu.setAttribute('data-no-drag', 'true')
      var held = cardVerdictOf(summary)
      menu.appendChild(verdictItem(summary, 'paused', !!held && held.key === 'paused'))
      menu.appendChild(verdictItem(summary, 'settled', !!held && held.key === 'settled'))
      menu.appendChild(clearVerdictItem(summary))
      return menu
    }

    /**
     * One word in that menu.
     * @param {object} summary - the conversation.
     * @param {string} key - the word.
     * @param {boolean} on - whether this is the word the card already wears.
     * @returns {Element} the row.
     */
    function verdictItem(summary, key, on) {
      var row = document.createElement('span')
      Object.assign(row.style, BOARD_UI.verdictItem)
      row.setAttribute('role', 'button')
      row.setAttribute('data-role', 'verdictPick')
      row.setAttribute('data-verdict', key)
      row.textContent = (on ? '\u2713 ' : '') + verdictText(key)
      row.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        // The word and the strip are one decision: saying a conversation is
        // finished puts it in today's finished strip, and saying anything else
        // takes it back out.
        if (key === 'settled') {
          sendToDone(summary.id)
        } else {
          BOARD_STORE.setVerdict(summary.id, key, Number(summary.updatedAt) || 0)
          bringBackFromDone(summary.id)
        }
        BOARD.verdictMenu = ''
        renderBoard()
      })
      return row
    }

    /**
     * The row that takes the word back.
     * @param {object} summary - the conversation.
     * @returns {Element} the row.
     */
    function clearVerdictItem(summary) {
      var row = document.createElement('span')
      Object.assign(row.style, BOARD_UI.verdictItem)
      row.setAttribute('role', 'button')
      row.setAttribute('data-role', 'verdictClear')
      row.textContent = paletteText('cardStateClear')
      row.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.dropVerdict(summary.id)
        bringBackFromDone(summary.id)
        BOARD.verdictMenu = ''
        renderBoard()
      })
      return row
    }

    function buildBoardCard(summary, orphan, titles, hue, opts) {
      var card = document.createElement('div')
      Object.assign(card.style, BOARD_UI.card)
      // The card is the work, and it belongs to the place it stands in: a step
      // deeper than the panel's wash, and a spine down its left edge in the same
      // hue. Not a fill - twelve goals of solid colour is a canvas nobody can
      // read - and not a second hue, because a card that is its own colour is a
      // card that belongs nowhere.
      if (hue !== null && hue !== undefined) {
        card.style.background = 'hsl(' + hue + ' 48% 50% / 0.10)'
        card.style.borderColor = 'hsl(' + hue + ' 40% 45% / 0.22)'
        card.style.borderLeft = '3px solid hsl(' + hue + ' 55% 46% / 0.72)'
      }
      card.className = 'dshv-card'
      card.setAttribute('data-session-id', summary.id)
      card.setAttribute('data-handle', 'card')
      var name = boardTitleOf(summary)
      card.setAttribute('title', paletteText('boardCardMoveHint'))
      // The card itself is the way in. The gesture layer has already settled
      // whether a press was a carry or a click (a press that travels past
      // `BOARD_SLOP` is a carry and repaints), and every control drawn inside
      // this card stops its own press before it reaches here - so what arrives
      // at this handler is, by construction, a press on the conversation.
      card.addEventListener('click', function () {
        // A click that follows a carry is the gesture's leftover, not a request:
        // the same one-shot guard the marks use, in one place instead of five.
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        activateSession(summary.id, { anchor: true })
      })
      var status = statusOf(summary)
      // The shell has nothing to say about this one, so the card says what it
      // knows: the turn the reader gave a word to, or nothing at all.
      var verdict = status ? null : cardVerdictOf(summary)
      // What the card is doing, said in material as well as in a word: a turn in
      // flight wears a ring that breathes, one parked on the reader wears a still
      // ring, and a completion nobody has looked at yet gets one beat.
      if (statusIsLive(status)) {
        card.setAttribute('data-live', 'true')
        // Waiting is not working. The same turn parked on a question or an
        // approval must not look like something moving without the reader.
        if (status.key === 'pending') card.setAttribute('data-waiting', 'true')
      }
      if (status && status.key === 'done') markCardFresh(card, summary.id)
      else if (BOARD.freshed[summary.id]) delete BOARD.freshed[summary.id]
      if (BOARD.front === summary.id) {
        card.setAttribute('data-front', 'true')
        card.style.zIndex = String(BOARD.zTop)
      }

      // Four fifths what the card says, one fifth what can be done with it. The
      // way in used to sit in a row of words under the name, the same size and
      // the same material as the marks beside it, at the bottom of the card.
      var row = document.createElement('div')
      Object.assign(row.style, BOARD_UI.cardRow)
      var main = document.createElement('div')
      Object.assign(main.style, BOARD_UI.cardMain)

      if (BOARD.renamingCard === summary.id) {
        var field = document.createElement('input')
        Object.assign(field.style, BOARD_UI.cardRenameBox)
        field.setAttribute('type', 'text')
        field.setAttribute('data-role', 'cardRename')
        field.setAttribute('aria-label', paletteText('rename'))
        field.setAttribute('data-no-drag', 'true')
        field.value = BOARD.renameCardDraft === null ? name : BOARD.renameCardDraft
        field.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBoardRename()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardRename()
          }
        })
        field.addEventListener('blur', function () {
          if (BOARD.renamingCard === summary.id && BOARD.renameCardInput === field) commitBoardRename()
        })
        field.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        })
        main.appendChild(field)
        BOARD.renameCardInput = field
      } else {
        // The name is a label. A press on it is a press on the conversation and
        // opens it, like the rest of the card; renaming has a target of its own
        // at the end of this line, so a press meant for the conversation can
        // never land in a field.
        var title = document.createElement('div')
        Object.assign(title.style, BOARD_UI.cardTitle)
        title.setAttribute('data-role', 'cardTitle')
        title.textContent = name
        // The name and the lock share one line: a fixed title is a fact about
        // the work, and it belongs beside the words it holds down.
        var titleRow = document.createElement('div')
        Object.assign(titleRow.style, BOARD_UI.cardTitleRow)
        title.style.flex = '1 1 auto'
        title.style.minWidth = '0'
        titleRow.appendChild(title)
        var locked = BOARD_STORE.isSessionLocked(summary.id)
        var lockMark = document.createElement('span')
        Object.assign(lockMark.style, locked ? BOARD_UI.cardLockOn : BOARD_UI.cardLock)
        lockMark.className = 'dshv-lock'
        lockMark.setAttribute('role', 'button')
        lockMark.setAttribute('data-role', 'cardLock')
        lockMark.setAttribute('aria-pressed', locked ? 'true' : 'false')
        lockMark.setAttribute('title', paletteText(locked ? 'boardCardUnlockHint' : 'boardCardLockHint'))
        lockMark.setAttribute('aria-label', paletteText(locked ? 'boardCardUnlockHint' : 'boardCardLockHint'))
        lockMark.appendChild(boardIcon(locked ? 'lock' : 'unlock', 12))
        lockMark.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          BOARD_STORE.toggleSessionLock(summary.id)
          renderBoard()
        })
        titleRow.appendChild(lockMark)
        // Renaming is a host write on the conversation, and the board names one
        // from the thought that started it: the rare verb belongs behind the ⋯
        // at the end of this line, not on it. The lock keeps its own seat beside
        // the name it holds down, and no word stands over the two of them.
        var moreMark = document.createElement('span')
        Object.assign(moreMark.style, BOARD_UI.cardMore)
        moreMark.className = 'dshv-card-more'
        moreMark.setAttribute('role', 'button')
        moreMark.setAttribute('data-role', 'cardMenuOpen')
        moreMark.setAttribute('title', paletteText('boardCardMenu'))
        moreMark.setAttribute('aria-label', paletteText('boardCardMenu'))
        moreMark.setAttribute('aria-expanded', BOARD.sessionMenu === summary.id ? 'true' : 'false')
        moreMark.textContent = '\u22ef'
        moreMark.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          // Opening a menu is not a repaint: the board may be mid-field, and a
          // paint would take the card out from under the press that asked.
          if (BOARD.sessionMenu === summary.id) {
            closeSessionMenu()
            return
          }
          closeIdeaMenu()
          closeSessionMenu()
          closeGoalMenu()
          BOARD.sessionMenu = summary.id
          BOARD.sessionMenuMark = moreMark
          moreMark.setAttribute('aria-expanded', 'true')
          var opened = buildSessionMenu(summary, !!(opts && opts.done))
          card.appendChild(opened)
          placeCardMenu(opened, moreMark)
        })
        titleRow.appendChild(moreMark)
        main.appendChild(titleRow)
        if (BOARD.sessionMenu === summary.id) {
          var standing = buildSessionMenu(summary, !!(opts && opts.done))
          card.appendChild(standing)
          placeCardMenu(standing, moreMark)
        }
      }

      // Where a line would run off the panel, the card says in words where the
      // branch came from: the parent is real and named, it is simply not here
      // today. Pressing it opens that conversation.
      if (orphan) {
        var source = document.createElement('div')
        Object.assign(source.style, BOARD_UI.forkSource)
        source.setAttribute('data-role', 'forkSource')
        var parentTitle = titles[orphan]
        if (parentTitle) {
          source.textContent = paletteText('boardForkSource') + parentTitle
          source.setAttribute('title', paletteText('boardForkSource') + parentTitle)
          source.style.cursor = 'pointer'
          source.addEventListener('click', function (ev) {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
            activateSession(orphan, { anchor: true })
          })
        } else {
          source.textContent = paletteText('boardForkSourceUnknown')
        }
        main.appendChild(source)
      }

      // What this conversation has been told, read once for both the line it
      // is drawn as and the mark that offers to start one.
      var pinned = NOTE_STORE.get(summary.id)
      if (BOARD.noteEditing === summary.id) {
        var editor = document.createElement('input')
        Object.assign(editor.style, BOARD_UI.cardNoteBox)
        editor.setAttribute('type', 'text')
        editor.setAttribute('data-role', 'cardNoteBox')
        editor.setAttribute('aria-label', paletteText('notePlaceholder'))
        editor.setAttribute('data-no-drag', 'true')
        editor.setAttribute('placeholder', paletteText('notePlaceholder'))
        editor.value = pinned
        editor.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            commitBoardNote()
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardNote()
          }
        })
        // A press elsewhere keeps what was typed: a note is a thought already
        // had, and losing it because the reader looked away is the one failure
        // this cannot afford.
        editor.addEventListener('blur', function () {
          if (BOARD.noteEditing === summary.id && BOARD.noteEditor === editor) commitBoardNote()
        })
        editor.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        })
        main.appendChild(editor)
        BOARD.noteEditor = editor
      } else if (pinned) {
        var noteLine = document.createElement('div')
        Object.assign(noteLine.style, BOARD_UI.cardNote)
        noteLine.setAttribute('data-role', 'note')
        noteLine.setAttribute('title', paletteText('noteEdit'))
        noteLine.textContent = pinned
        noteLine.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginBoardNote(summary.id)
        })
        main.appendChild(noteLine)
      }

      var stateAnchored = null
      var meta = document.createElement('div')
      Object.assign(meta.style, BOARD_UI.cardMeta)
      meta.setAttribute('data-role', 'cardMeta')
      // The foot of the card belongs to its tools, not to the way in. Every
      // mark on this line answers for itself, and a press that lands between
      // two of them - on the gaps or on the read-only status chip - is a press
      // meant for this line, not a request to leave the board. The upper part
      // of the card stays the way in; this line never is.
      meta.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) BOARD.dragged = false
      })
      // The state chip leads the meta line, the seat it holds on the task
      // window's rows: the eye reads what the conversation is doing before it
      // reads which conversation it is. The clock rides in the chip exactly as
      // it does there, updated in place by the board's own tick.
      if (status) {
        var chip = document.createElement('span')
        Object.assign(
          chip.style,
          BOARD_UI.cardChip,
          BOARD_UI['cardChip' + status.key[0].toUpperCase() + status.key.slice(1)]
        )
        chip.setAttribute('data-role', 'status')
        chip.className = 'dshv-chip'
        if (statusIsLive(status)) chip.setAttribute('data-live', 'true')
        if (status.key === 'pending') chip.setAttribute('data-waiting', 'true')
        var since = statusIsLive(status) ? runSince(summary.id) : 0
        var elapsed = since ? elapsedText(Date.now() - since) : ''
        chip.textContent = elapsed ? status.text + ' · ' + elapsed : status.text
        chip.setAttribute('title', elapsed ? paletteText('elapsedFor') + ' ' + elapsed : status.text)
        meta.appendChild(chip)
        if (since) BOARD.clocks.push({ chip: chip, label: status.text, since: since })
      } else if (verdict) {
        var stateChip = buildVerdictChip(summary, verdict)
        meta.appendChild(stateChip)
        stateAnchored = stateChip
      } else {
        var stateAdd = buildStateAdd(summary)
        meta.appendChild(stateAdd)
        stateAnchored = stateAdd
      }
      // A conversation that came in from the last page says so, and for how
      // long. The reader asked for it not to vanish overnight; a card that
      // outlived the day in silence would be the same surprise read backwards.
      var carriedFor = CARRY.days(summary.id, dayOf(Date.now()))
      if (carriedFor > 0) {
        var carriedMark = document.createElement('span')
        Object.assign(carriedMark.style, BOARD_UI.cardCarried)
        carriedMark.setAttribute('data-role', 'carried')
        carriedMark.setAttribute('title', paletteText('boardHistoryCarriedHint'))
        carriedMark.textContent = paletteText('boardHistoryCarried') + carriedFor
          + paletteText('boardHistoryCarriedUnit')
        meta.appendChild(carriedMark)
      }

      // What was handed to this conversation, put away: the mark only exists
      // when it holds something, because a card's own line has no room to spare
      // for a door that opens on nothing.
      var archived = doneBinCardsOf(summary.id).length
      if (archived) {
        var archive = document.createElement('span')
        Object.assign(archive.style, BOARD_UI.cardArchive)
        archive.className = 'dshv-archive'
        archive.setAttribute('role', 'button')
        archive.setAttribute('data-role', 'cardArchive')
        archive.setAttribute('title', paletteText('boardDoneBinHint'))
        archive.setAttribute('aria-label', paletteText('boardDoneBinHint'))
        archive.appendChild(boardIcon('archive', 13))
        var archiveCount = document.createElement('span')
        archiveCount.setAttribute('data-role', 'cardArchiveCount')
        archiveCount.textContent = String(archived)
        archive.appendChild(archiveCount)
        archive.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          openDoneBinFor(summary.id)
        })
        meta.appendChild(archive)
      }

      // Two conversations can honestly wear one name - a workspace's own title
      // is what an untitled conversation shows, and a branch inherits its
      // parent's. When that happens on the board, both cards say which of them
      // they are, in a form that never moves: the count of namesakes, and this
      // card's place among them.
      var dup = BOARD.dupes[summary.id]
      if (dup) {
        var dupTag = document.createElement('span')
        Object.assign(dupTag.style, BOARD_UI.cardDupTag)
        dupTag.setAttribute('data-role', 'cardDupTag')
        dupTag.setAttribute('title', paletteText('boardCardDupHint'))
        dupTag.textContent = '#' + dup.at + '/' + dup.of
        meta.appendChild(dupTag)
      }

      // The tail is one flex group for the marks that are still worth a seat.
      var tail = document.createElement('div')
      Object.assign(tail.style, BOARD_UI.cardTail)
      // The way in for a card that carries no line yet: a quiet mark before the
      // other marks.
      if (!pinned && BOARD.noteEditing !== summary.id) {
        var pin = document.createElement('span')
        Object.assign(pin.style, BOARD_UI.cardNotePin)
        pin.setAttribute('data-role', 'cardNotePin')
        pin.setAttribute('title', paletteText('boardAddNote'))
        pin.textContent = '✎'
        pin.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          beginBoardNote(summary.id)
        })
        tail.appendChild(pin)
      }
      var star = document.createElement('span')
      Object.assign(star.style, BOARD_UI.cardStar)
      star.setAttribute('data-role', 'cardStar')
      var marked = BOARD_STORE.isStarred(summary.id)
      star.setAttribute('aria-pressed', marked ? 'true' : 'false')
      star.setAttribute('title', paletteText(marked ? 'boardUnstar' : 'boardStar'))
      star.textContent = marked ? '★' : '☆'
      if (marked) star.style.color = BOARD_INK.accent
      star.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.toggleStar(summary.id)
        renderBoard()
      })
      tail.appendChild(star)
      // Deleting is taking it off the board, not archiving the conversation:
      // the shell keeps it, the sidebar keeps it, and it comes back the next
      // time it is used.
      var drop = document.createElement('span')
      Object.assign(drop.style, BOARD_UI.cardRemove)
      drop.setAttribute('data-role', 'cardRemove')
      drop.setAttribute('title', paletteText('boardChatRemove'))
      drop.textContent = '×'
      drop.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        removeBoardCard(summary)
      })
      tail.appendChild(drop)
      meta.appendChild(tail)
      main.appendChild(meta)

      // The way to branch, beside the other marks: the card has one row of verbs
      // at its foot, and a rail of its own is gone with the button that needed it.
      var fork = document.createElement('span')
      Object.assign(fork.style, BOARD_UI.cardForkButton)
      fork.className = 'dshv-fork'
      fork.setAttribute('role', 'button')
      fork.setAttribute('data-role', 'cardFork')
      fork.setAttribute('aria-label', paletteText('boardForkHint'))
      fork.setAttribute('title', paletteText('boardForkHint'))
      fork.appendChild(boardIcon('fork', 14))
      // A branch in flight is a branch already being made. The mark stays where
      // it is and stops answering until the host has said what the child is
      // called, so a hand that presses twice out of impatience gets one branch
      // rather than two identical ones.
      if (BOARD.forking[summary.id]) {
        fork.setAttribute('data-busy', 'true')
        fork.setAttribute('aria-busy', 'true')
        fork.setAttribute('title', paletteText('boardForkBusy'))
        fork.setAttribute('aria-label', paletteText('boardForkBusy'))
      }
      fork.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        if (BOARD.forking[summary.id]) return
        forkBoardCard(summary)
      })
      tail.appendChild(fork)
      meta.appendChild(tail)
      main.appendChild(meta)
      row.appendChild(main)

      // The way in is a double press on the card, so the only thing that has to
      // still be a target is a card being carried onto this one: the overlay is
      // drawn for that one moment (`data-note-drag`) and is out of the way, and
      // out of the hit test, the rest of the time.
      var enter = document.createElement('span')
      Object.assign(enter.style, BOARD_UI.cardEnter)
      enter.className = 'dshv-enter'
      enter.setAttribute('data-role', 'cardEnter')
      enter.setAttribute('aria-hidden', 'true')
      var enterWord = document.createElement('span')
      enterWord.setAttribute('data-role', 'cardEnterWord')
      enterWord.textContent = paletteText('boardCardEnterHint')
      enter.appendChild(boardIcon('enter', 16))
      // The band keeps its own word: a carry decides what letting go means, and a
      // band that had to be rebuilt for that would be a repaint under the hand.
      enter.enterWord = enterWord
      enter.appendChild(enterWord)
      card.appendChild(enter)
      BOARD.dropZones.push(enter)
      card.appendChild(row)
      // The two words stand on the card they belong to, so a press on one is a
      // press inside that card and never a carry of it.
      if (BOARD.verdictMenu === summary.id && stateAnchored) {
        var stateMenu = buildVerdictMenu(summary)
        card.appendChild(stateMenu)
        placeCardMenu(stateMenu, stateAnchored)
      }

      BOARD.nodes.push(card)
      return card
    }

    /**
     * Start typing a goal's name into its heading.
     * @param {string} key - the block's id.
     * @returns {void}
     */
    function beginBlockRename(key) {
      BOARD.renamingBlock = key
      renderBoard()
    }

    /** Keep the name the heading says, and close the field. */
    function commitBlockRename() {
      if (!BOARD.renamingBlock) return false
      var field = BOARD.renameBlockInput
      var key = BOARD.renamingBlock
      BOARD.renamingBlock = ''
      BOARD.renameBlockInput = null
      BOARD_STORE.setBlockLabel(key, field ? field.value : '')
      renderBoard()
      return true
    }

    /** Throw the typed name away, leaving the goal as it was called. */
    function cancelBlockRename() {
      if (!BOARD.renamingBlock) return false
      BOARD.renamingBlock = ''
      BOARD.renameBlockInput = null
      renderBoard()
      return true
    }

    /**
     * The last piece of a workspace path: what the workspace is called.
     *
     * A goal renamed to what the reader is doing there still came from
     * somewhere, and the name of that somewhere is the whole of what the panel
     * owes about it.
     * @param {string} path - the workspace's path.
     * @returns {string} its last segment, or ''.
     */
    function goalBaseName(path) {
      var parts = String(path || '').split(/[\\/]+/)
      for (var i = parts.length - 1; i >= 0; i--) {
        if (parts[i]) return parts[i]
      }
      return ''
    }

    /**
     * Start writing what a goal is for.
     * @param {string} key - the block's id.
     * @returns {void}
     */
    function beginGoalIntent(key) {
      BOARD.intentBlock = key
      renderBoard()
    }

    /**
     * Keep what the open line says, and close it.
     *
     * An empty line is a statement withdrawn: the goal stops being held by it,
     * and one with no conversations goes on the next paint. `paint` is false
     * only when the board is closing, where a repaint would draw a page that is
     * already on its way out.
     * @param {boolean} [paint] - false to write without repainting.
     * @returns {boolean} whether a line was open.
     */
    function commitGoalIntent(paint) {
      if (!BOARD.intentBlock) return false
      var key = BOARD.intentBlock
      var field = BOARD.intentInput
      BOARD.intentBlock = ''
      BOARD.intentInput = null
      BOARD_STORE.setIntent(key, field ? field.value : '')
      if (paint !== false) renderBoard()
      return true
    }

    /** Throw the typed line away, leaving the goal as it was. */
    function cancelGoalIntent() {
      if (!BOARD.intentBlock) return false
      BOARD.intentBlock = ''
      BOARD.intentInput = null
      renderBoard()
      return true
    }

    /**
     * Take one goal off the canvas, with a few seconds to bring it back.
     *
     * Nothing is deleted but the place: every conversation filed here goes back
     * to the goal its workspace gives it, which is the rule a card already
     * follows when it is carried into another goal. The notice offers the way
     * back, because a place that disappears under a mis-click must not be a
     * place the reader has to rebuild by hand.
     * @param {object} block - the goal being closed.
     * @returns {void}
     */
    function removeBoardGoal(block) {
      if (!block || block.kind !== 'user') return
      var record = BOARD_STORE.removeGoal(block.key)
      if (!record) return
      if (BOARD.intentBlock === block.key) {
        BOARD.intentBlock = ''
        BOARD.intentInput = null
      }
      delete BOARD.drafts[block.key]
      var line = paletteText('boardGoalRemoved') + (record.label || paletteText('boardNewGoal'))
      if (record.moved) line = line + ' (' + record.moved + paletteText('boardGoalReleased') + ')'
      // The notice is a shortcut into the history, not a second way of undoing:
      // it holds the step it was made for, so a delete that happened after it
      // cannot be undone by pressing this notice.
      var command = BOARD_HISTORY.record({
        label: paletteText('boardUndoGoal'),
        undo: function () {
          BOARD_STORE.restoreGoal(record)
          if (BOARD.open) renderBoard()
        },
        redo: function () {
          BOARD_STORE.removeGoal(block.key)
          if (BOARD.open) renderBoard()
        },
      })
      renderBoard()
      TOAST.sayAction(line, paletteText('boardGoalUndo'), BOARD_UNDO_MS, function () {
        BOARD_HISTORY.undoTo(command)
      })
    }

    /**
     * Which drawn cards share a name, and where each one stands in its group.
     *
     * A name is a handle. Two conversations can honestly wear one - an untitled
     * conversation shows its workspace's name, and a branch inherits its
     * parent's - and the board cannot make them unique, because those names
     * belong to the conversations and renaming them is a write nobody asked for.
     * What it can do is say where this card stands among its namesakes, so a
     * reader looking at two identical lines can name the one they mean.
     *
     * Ordered by id rather than by time: an ordinal that renumbers itself the
     * moment a sibling is touched is worse than no ordinal at all. Nothing is
     * said when there is no collision, which is almost always.
     * @param {object} titles - session id -> the name to call it by.
     * @returns {object} session id -> {at, of}, for the cards that collide.
     */
    function boardNameCollisions(titles) {
      var groups = Object.create(null)
      var i
      for (i = 0; i < BOARD.rows.length; i++) {
        var id = BOARD.rows[i].id
        var name = titles[id] === undefined ? id : titles[id]
        if (!groups[name]) groups[name] = []
        groups[name].push(id)
      }
      var out = Object.create(null)
      for (var key in groups) {
        if (!Object.prototype.hasOwnProperty.call(groups, key)) continue
        var ids = groups[key]
        if (ids.length < 2) continue
        ids.sort()
        for (i = 0; i < ids.length; i++) out[ids[i]] = { at: i + 1, of: ids.length }
      }
      return out
    }

    /**
     * The name one card wears: the reader's word while the shell catches up,
     * else what the shell calls the conversation.
     * @param {object} summary - session summary.
     * @returns {string} the name to draw.
     */
    function boardTitleOf(summary) {
      var said = BOARD.titles[summary.id]
      if (said && said.title) return said.title
      return summary.displayTitle || summary.id
    }

    /**
     * Put the reader's word on a card before the shell has answered.
     *
     * The list is the truth, but it arrives a moment later. The word stands in
     * for it until the feed agrees, or until the shell has had time to answer at
     * all - a name the host silently dropped must not outlive the attempt.
     * @param {string} id - session id.
     * @param {string} title - the name that was sent.
     * @returns {void}
     */
    function noteCardTitle(id, title) {
      BOARD.titles[id] = { title: title, at: Date.now() }
      if (BOARD.titleTimer) window.clearTimeout(BOARD.titleTimer)
      BOARD.titleTimer = window.setTimeout(function () {
        BOARD.titleTimer = 0
        BOARD.titles = Object.create(null)
        if (BOARD.open) renderBoard()
      }, BOARD_TITLE_SETTLE_MS)
    }

    /**
     * Let go of the stand-in names the feed has caught up with, or outlived.
     * @param {Array<object>} pool - the conversations this paint will draw.
     * @returns {void}
     */
    function settleTitles(pool) {
      var live = Object.create(null)
      var i
      for (i = 0; i < pool.length; i++) live[pool[i].id] = pool[i]
      for (var id in BOARD.titles) {
        if (!Object.prototype.hasOwnProperty.call(BOARD.titles, id)) continue
        var said = BOARD.titles[id]
        var now = live[id]
        if (!now) continue
        if (String(now.displayTitle || '') === said.title) delete BOARD.titles[id]
        else if (Date.now() - said.at > BOARD_TITLE_SETTLE_MS) delete BOARD.titles[id]
      }
    }

    /**
     * Start renaming one conversation from its card.
     * @param {string} id - session id.
     * @returns {void}
     */
    function beginBoardRename(id) {
      if (BOARD_STORE.isSessionLocked(id)) {
        showToast(paletteText('boardCardLocked'))
        return
      }
      BOARD.renamingCard = id
      BOARD.renameCardDraft = null
      renderBoard()
    }

    /**
     * Keep what the open name field says, and rename the conversation.
     *
     * The rename goes through the same private-source hop the task window uses,
     * so renaming from the board never marks the conversation read. An empty
     * name is refused in place rather than sent to the host.
     * @returns {boolean} whether a field was open.
     */
    function commitBoardRename() {
      if (!BOARD.renamingCard) return false
      var field = BOARD.renameCardInput
      var id = BOARD.renamingCard
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
      BOARD.renameCardDraft = null
      if (!field) {
        renderBoard()
        return true
      }
      var title = String(field.value || '').trim()
      if (!title) {
        renderBoard()
        showToast(paletteText('renameNoName'))
        return true
      }
      // The card says the new name before the host is asked, so the rename reads
      // as done the moment Enter is pressed. The list settles it a moment later.
      noteCardTitle(id, title)
      renderBoard()
      renameSession(id, title, function (reason) {
        if (!reason) {
          if (BOARD.open) renderBoard()
          return
        }
        // A refusal takes the stand-in name away and puts the field back, with
        // what was typed still in it: the words are the reader's, and a failed
        // rename must not eat them.
        delete BOARD.titles[id]
        BOARD.renameCardDraft = title
        BOARD.renamingCard = id
        showToast(reason)
        if (BOARD.open) renderBoard()
      })
      return true
    }

    /** Throw the open name field away, leaving the conversation as it was. */
    function cancelBoardRename() {
      if (!BOARD.renamingCard) return false
      BOARD.renamingCard = ''
      BOARD.renameCardInput = null
      BOARD.renameCardDraft = null
      renderBoard()
      return true
    }

    /**
     * Start a branch from one conversation, and draw the line when it lands.
     *
     * The host offers no parent on the child, so the pair is remembered here as
     * well as by the watcher: whichever path the fork took, the board can draw
     * the line it just watched. A source that needs migration is left to the
     * host to answer, and a refusal is said out loud rather than swallowed.
     * @param {object} summary - the conversation to fork.
     * @returns {void}
     */
    function forkBoardCard(summary) {
      var services = taskServices()
      var controller = services && services.controller
      if (!controller || typeof controller.fork !== 'function') {
        showToast(paletteText('boardForkUnavailable'))
        return
      }
      // One branch per press. The mark stops answering for as long as the host
      // is making this one; a hand that presses twice out of impatience used to
      // get two children, and two children of one conversation are drawn as two
      // cards with one name.
      BOARD.forking[summary.id] = true
      if (BOARD.open) renderBoard()
      var result
      try {
        result = controller.fork({ sessionId: summary.id, increaseTitle: true })
      } catch (error) {
        console.warn('[dsh-vim] fork failed', error)
        returnForkMark(summary.id)
        showToast(paletteText('boardForkFailed'))
        return
      }
      Promise.resolve(result).then(function (childId) {
        // `rememberFork` repaints: the line, the child, and the goal it was filed
        // in all come from that one paint. What it cannot do is show a card in a
        // panel scrolled out of sight, so the new branch is brought into view
        // here, after the paint that drew it.
        rememberFork(summary.id, childId)
        if (BOARD.open) revealBoardCard(childId)
        // The host names a branch by incrementing its parent's own title, which
        // leaves two branches of one conversation with one name between them -
        // and leaves an untitled parent's child called nothing new at all. The
        // board is the only party holding the whole list, so it settles the
        // name here and says which one the branch got.
        return settleBranchName(childId)
      }).then(function (named) {
        returnForkMark(summary.id)
        if (named) showToast(paletteText('boardForkDone') + named)
      }, function (error) {
        console.warn('[dsh-vim] fork failed', error)
        returnForkMark(summary.id)
        showToast(paletteText('boardForkFailed'))
      })
    }

    /** Let a conversation's branch mark answer again, and say so on the card. */
    function returnForkMark(id) {
      delete BOARD.forking[id]
      if (BOARD.open) renderBoard()
    }

    /**
     * The catalogue row for one conversation, asked for until it arrives.
     *
     * The host resolves a fork before it publishes the child's row, so the list
     * read the instant the promise settles is a list without the branch in it.
     * The wait is bounded and silent: a host that never publishes the row costs
     * one card the host's own name and nothing else.
     * @param {string} id - session id.
     * @param {number} tries - how many more times to ask.
     * @returns {Promise<object|undefined>} the row, or undefined when it never came.
     */
    function waitForBranchRow(id, tries) {
      var pool = conversationPool()
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].id === id) return Promise.resolve(pool[i])
      }
      if (tries <= 0) return Promise.resolve(undefined)
      return new Promise(function (resolve) {
        window.setTimeout(function () {
          resolve(waitForBranchRow(id, tries - 1))
        }, 60)
      })
    }

    /**
     * Give a fresh branch a name nobody else is using, and answer with it.
     *
     * A branch inherits its parent's title, and the host increments a trailing
     * number before it resolves - but it increments the *parent's* title, so the
     * second branch cut from one conversation carries exactly the words the
     * first one got, and a parent with no title of its own passes on nothing at
     * all. Neither is a name a reader can use: two cards answering to the same
     * words leave them with nothing to say when they want one of them. The board
     * reads the child back, and when the name is already spoken for it takes the
     * next free number in the same shape the host uses - the same edit, carried
     * one step further.
     *
     * Answers '' when the child could not be read in time or its name is already
     * its own; the card then says which of several same-named cards it is (see
     * `boardNameCollisions`), which is the fallback rather than the goal.
     * @param {string} childId - the branch's session id.
     * @returns {Promise<string>} the name the branch wears, or '' for unknown.
     */
    function settleBranchName(childId) {
      return waitForBranchRow(childId, 24).then(function (child) {
        if (!child) return ''
        var title = String(child.displayTitle || '')
        var taken = Object.create(null)
        var pool = conversationPool()
        var i
        for (i = 0; i < pool.length; i++) {
          if (pool[i].id === childId) continue
          taken[String(pool[i].displayTitle || pool[i].id)] = true
        }
        if (!title || !taken[title]) return title
        // The base is the title without the number the host just added, so the
        // child reads as the next of its parent's branches rather than as a
        // fresh series of its own.
        var base = title.replace(/\s*[(\uFF08]\d+[)\uFF09]\s*$/, '') || title
        var n = 1
        while (taken[base + ' (' + n + ')']) n = n + 1
        var next = base + ' (' + n + ')'
        noteCardTitle(childId, next)
        if (BOARD.open) renderBoard()
        renameSession(childId, next, function (reason) {
          if (reason) console.warn('[dsh-vim] branch rename refused', reason)
        })
        return next
      }).then(null, function (error) {
        console.warn('[dsh-vim] branch name could not be settled', error)
        return ''
      })
    }

    /**
     * Put words in the message box of the conversation on screen.
     *
     * The box belongs to a conversation, so the switch has to land before
     * anything is put in it: right after one the previous box can still be
     * mounted, and a draft typed there would go to the wrong conversation. The
     * words arrive as a paste, not as a replaced draft: whatever the reader had
     * already typed stays where it was.
     * @param {string} text - what to put in the box, trimmed.
     * @param {string} [sessionId] - the conversation the box must belong to.
     * @returns {Promise<boolean>} whether the words landed.
     */
    function pasteIntoComposer(text, sessionId) {
      return new Promise(function (resolve) {
        var tries = 0
        putInBox()

        function putInBox() {
          var root = composerRoot()
          var here = sessionId ? currentSession() : null
          var arrived = !sessionId || !here || here.id === sessionId
          if (!root || !arrived) {
            if (tries < 24) {
              tries = tries + 1
              window.setTimeout(putInBox, 60)
              return
            }
            resolve(false)
            return
          }
          focusComposer()
          seatCaretAtEnd(root)
          var words = boxHasText(root) ? BLANK_LINE + text : text
          if (putThroughEditor(words)) {
            resolve(true)
            return
          }
          resolve(pasteThroughEvent(root, words))
        }
      })
    }

    /**
     * Whether the message box already holds something.
     * @returns {boolean} whether there are words in the box.
     */
    function composerHasText() {
      return boxHasText(composerRoot())
    }

    /** Two line breaks: the blank line Markdown puts between two blocks. */
    var BLANK_LINE = String.fromCharCode(10, 10)

    /**
     * Whether one box already holds words.
     *
     * Read on the box that is actually about to be written into, not on
     * whichever box was remembered when the gesture started: a hand-over opens
     * the conversation first, and the box it lands in is that one.
     * @param {Element} root - the editor root.
     * @returns {boolean} whether there are words in it.
     */
    function boxHasText(root) {
      if (!root) return false
      var words = typeof root.value === 'string' ? root.value : String(root.textContent || '')
      return words.replace(/\s+/g, '') !== ''
    }

    /**
     * Put the caret at the end of the box's content.
     *
     * A hand-over appends: the reader's own draft keeps its place at the top,
     * and the thought arrives after it rather than in the middle of a sentence.
     * A host without a selection API simply keeps whatever caret it has.
     * @param {Element} root - the editor root.
     * @returns {void}
     */
    function seatCaretAtEnd(root) {
      if (!root) return
      // A plain textarea answers its own way: a range over its contents is not
      // what moves its caret.
      if (typeof root.setSelectionRange === 'function' && typeof root.value === 'string') {
        try {
          root.setSelectionRange(root.value.length, root.value.length)
          return
        } catch (error) {
          // Fall through to the range, which is what a rich editor wants.
        }
      }
      try {
        if (!window.getSelection || typeof document.createRange !== 'function') return
        var range = document.createRange()
        range.selectNodeContents(root)
        range.collapse(false)
        var selection = window.getSelection()
        if (!selection) return
        selection.removeAllRanges()
        selection.addRange(range)
      } catch (error) {
        // A host that refuses the range keeps its own caret; the words still land.
      }
    }

    /**
     * Hand one loose card's words to a conversation's message box.
     *
     * Dropping the card opens the conversation first, and its box mounts a
     * moment later, so the paste waits a few frames for it instead of assuming
     * it is there. Both endings are reported, because a card that found no box
     * must not vanish with the thought on it.
     * @param {string} text - what the card says, trimmed.
     * @param {string} sessionId - the conversation to open.
     * @param {Function} ok - called once the words have been handed over.
     * @param {Function} fail - called when there is no box to put them in.
     * @returns {void}
     */
    function dropCardIntoComposer(text, sessionId, ok, fail) {
      activateSession(sessionId)
      // The box is usually already there, and this hand-over has always finished
      // in the same press it started with: a microtask between the drop and the
      // card that turns into a trace would be a change nobody asked for.
      if (pasteIntoBoxNow(text)) {
        ok()
        return
      }
      pasteIntoComposer(text).then(function (done) {
        if (done) ok()
        else fail()
      }, fail)
    }

    /**
     * Put the words in the box that is on screen right now, if there is one.
     * @param {string} text - what to put in the box.
     * @returns {boolean} whether the words landed.
     */
    function pasteIntoBoxNow(text) {
      var root = composerRoot()
      if (!root) return false
      focusComposer()
      seatCaretAtEnd(root)
      // The thought lands at the end of the box, after a blank line when the
      // reader has already written something: two breaks, the way Markdown
      // separates two blocks. One break would read as finishing their sentence.
      var words = boxHasText(root) ? BLANK_LINE + text : text
      if (putThroughEditor(words)) return true
      return pasteThroughEvent(root, words)
    }

    /**
     * Put text into the editor through the editing command.
     *
     * A rich-text editor inserts a line this way, and it arrives as typing,
     * which is what keeps the draft's own history and the shell's placeholder
     * in step.
     * @param {string} text - what to insert.
     * @returns {boolean} whether the editor took it.
     */
    function putThroughEditor(text) {
      if (typeof document.execCommand !== 'function') return false
      try {
        return !!document.execCommand('insertText', false, text)
      } catch (error) {
        return false
      }
    }

    /**
     * Put text into the editor as a real paste event.
     *
     * The honest fallback when the editing command is unavailable: it is the
     * same event a copy-and-paste fires, so the host's own handler decides what
     * to do with it.
     * @param {Element} root - the editor root.
     * @param {string} text - what to paste.
     * @returns {boolean} whether the event was dispatched.
     */
    function pasteThroughEvent(root, text) {
      try {
        if (typeof ClipboardEvent !== 'function' || typeof DataTransfer !== 'function') return false
        var data = new DataTransfer()
        data.setData('text/plain', text)
        root.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }))
        return true
      } catch (error) {
        console.warn('[dsh-vim] could not put the words in the message box', error)
        return false
      }
    }

    /**
     * One card from the board's own document, by id.
     *
     * The focus sheet reads the store rather than a node: a paint can land
     * under it while it is open, and the words it is showing are the store's,
     * not a card element's.
     * @param {string} id - the card.
     * @returns {object|null} the card, or null when it is gone.
     */
    function ideaFocusCard(id) {
      if (!id) return null
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i]
      }
      return null
    }

    /**
     * Where a press happened, as a point the sheet can grow out of.
     *
     * The double click already carries the point the reader aimed at. A press on
     * a card carries one too; a menu pick has no pointer of its own, so the
     * mark it came from stands in. A host without layout answers nothing, and
     * the sheet simply appears in its place.
     * @param {object} [ev] - the press, when there was one.
     * @param {Element} [node] - the element to take the centre of otherwise.
     * @returns {{clientX: number, clientY: number}|null} the point.
     */
    function ideaFocusOrigin(ev, node) {
      var x = ev ? Number(ev.clientX) : NaN
      var y = ev ? Number(ev.clientY) : NaN
      if (isFinite(x) && isFinite(y)) return { clientX: x, clientY: y }
      if (!node || typeof node.getBoundingClientRect !== 'function') return null
      var rect = node.getBoundingClientRect()
      if (!rect || (!rect.width && !rect.height)) return null
      return {
        clientX: Number(rect.left) + Number(rect.width) / 2,
        clientY: Number(rect.top) + Number(rect.height) / 2,
      }
    }

    /**
     * Let the sheet grow out of the place the reader pointed at.
     *
     * A window that appears already finished makes the eye hunt for where the
     * press went; the card-sized thumbnail travelling from the double click to
     * the centre is the gesture's own answer. One frame loop, the same kind the
     * tidy glide uses, and no motion at all when the system asks for less.
     * @param {Element} host - the scrim.
     * @param {Element} sheet - the sheet inside it.
     * @param {object|null} origin - the client point it comes from.
     * @returns {void}
     */
    function animateIdeaFocusIn(host, sheet, origin) {
      if (!origin || reducedMotion()) return false
      if (typeof window.requestAnimationFrame !== 'function') return false
      var panel = BOARD.panel
      var rect = panel && typeof panel.getBoundingClientRect === 'function'
        ? panel.getBoundingClientRect()
        : null
      if (!rect || !rect.width || !rect.height) return false
      var dx = Number(origin.clientX) - Number(rect.left) - rect.width / 2
      var dy = Number(origin.clientY) - Number(rect.top) - rect.height / 2
      host.style.opacity = '0.35'
      sheet.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.14)'
      sheet.style.opacity = '0.2'
      sheet.setAttribute('data-opening', 'true')
      var started = 0
      function step(now) {
        if (BOARD.ideaFocusHost !== host) return
        if (!started) started = now
        var at = Math.min(1, (now - started) / 320)
        var eased = 1 - Math.pow(1 - at, 3)
        host.style.opacity = String(0.35 + 0.65 * eased)
        sheet.style.transform = 'translate(' + (dx * (1 - eased)) + 'px, '
          + (dy * (1 - eased)) + 'px) scale(' + (0.14 + 0.86 * eased) + ')'
        sheet.style.opacity = String(0.2 + 0.8 * eased)
        if (at < 1) {
          BOARD.ideaFocusRaf = window.requestAnimationFrame(step)
          return
        }
        host.style.opacity = ''
        sheet.style.transform = ''
        sheet.style.opacity = ''
        if (typeof sheet.removeAttribute === 'function') sheet.removeAttribute('data-opening')
        BOARD.ideaFocusRaf = 0
      }
      BOARD.ideaFocusRaf = window.requestAnimationFrame(step)
      return true
    }

    /**
     * The name of the conversation a thought is tied to, for the sheet's foot.
     * @param {string} id - the conversation.
     * @returns {string} its name, or '' when it is not on this board.
     */
    function ideaFocusSessionTitle(id) {
      if (!id) return ''
      // A thought can be tied to a conversation standing in the work, in the
      // finished strip, or on a quiet line: all three are on this board, and the
      // sheet should call each by its name.
      for (var b = 0; b < BOARD.blocks.length; b++) {
        var block = BOARD.blocks[b]
        var groups = [block.rows || [], block.done || [], block.quiet || []]
        for (var g = 0; g < groups.length; g++) {
          for (var i = 0; i < groups[g].length; i++) {
            if (groups[g][i].id === id) return boardTitleOf(groups[g][i])
          }
        }
      }
      return ''
    }

    /**
     * Keep the sheet's done box in step with the card it belongs to.
     * @returns {void}
     */
    function paintIdeaFocusDone() {
      var node = BOARD.ideaFocusDone
      if (!node) return
      var card = ideaFocusCard(BOARD.ideaFocus)
      if (!card) return
      Object.assign(node.style, BOARD_UI.ideaFocusDone)
      if (card.done) Object.assign(node.style, BOARD_UI.ideaFocusDoneOn)
      node.setAttribute('aria-pressed', card.done ? 'true' : 'false')
      node.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
      node.textContent = card.done ? '\u2713' : ''
    }

    /**
     * Keep the title on one line while letting it wrap on the paper.
     *
     * The title is a field because it has to be typed into, but it is read as
     * the first line of the note: Enter belongs to the body, and a pasted line
     * break is a space rather than a second title.
     * @param {Element} title - the title field.
     * @returns {void}
     */
    function cleanIdeaTitle(title) {
      if (!title) return
      var clean = String(title.value || '').replace(/\s*\n+\s*/g, ' ')
      if (clean === title.value) return
      title.value = clean
    }

    /** Let the title field take as many lines as the words it is showing. */
    function growIdeaTitle() {
      var title = BOARD.ideaFocusTitle
      if (!title) return
      var words = String(title.value || '')
      var rows = Math.max(1, Math.min(5, Math.ceil(words.length / 34)))
      if (title.getAttribute('rows') !== String(rows)) title.setAttribute('rows', String(rows))
      if (typeof title.scrollHeight === 'number' && title.scrollHeight > 0) {
        title.style.height = Math.min(title.scrollHeight, 160) + 'px'
      }
    }

    /**
     * Write what the sheet says into the card it belongs to.
     *
     * An existing card is written through as the reader types: the sheet is a
     * bigger seat for the same words, not a form with a save step. A new
     * thought has no card yet, so its words stay in the fields until it lands.
     * @returns {boolean} whether an existing card took the words.
     */
    function writeIdeaFocus() {
      if (!BOARD.ideaFocus) return false
      var card = ideaFocusCard(BOARD.ideaFocus)
      if (!card) return false
      var title = BOARD.ideaFocusTitle ? BOARD.ideaFocusTitle.value : ''
      var body = BOARD.ideaFocusBody ? BOARD.ideaFocusBody.value : ''
      BOARD_STORE.setCardText(card.id, boardJoinText(title, body))
      return true
    }

    /**
     * Open one idea card, or a blank new one, in the centre of the board.
     *
     * This is the one gesture every editable idea card shares: a press on the
     * paper, a press on the card's name, the ⋯ menu, a line in the tray, and
     * the two ways of starting a new thought all land here. A new sheet is a
     * draft - no card exists until it closes with something in it - and the
     * place it lands is the place the double click named.
     * @param {string} id - the card, or '' for a new thought.
     * @param {string} [field] - 'title' or 'body' to put the caret in.
     * @param {object} [opts] - `x`, `y` for a new card's place, and `origin`
     *   for the point the sheet should grow from.
     * @returns {boolean} whether the sheet opened.
     */
    function openIdeaFocus(id, field, opts) {
      if (!BOARD.open || !BOARD.panel) return false
      var card = id ? ideaFocusCard(id) : null
      if (id && !card) return false
      var at = {
        x: Math.max(0, Math.round(Number(opts && opts.x) || 0)),
        y: Math.max(0, Math.round(Number(opts && opts.y) || 0)),
      }
      if (BOARD.ideaFocusHost) {
        if (id && BOARD.ideaFocus === id) {
          var held = field === 'title' ? BOARD.ideaFocusTitle : BOARD.ideaFocusBody
          if (held && typeof held.focus === 'function') held.focus()
          return true
        }
        // One sheet at a time: the previous one is settled by its own rules
        // before the next press is answered.
        closeIdeaFocus({ paint: false })
      }
      closeIdeaMenu()
      closeSessionMenu()
      closeSeatMenu()
      closeGoalMenu()
      closeVerdictMenu()

      var parts = noteParts(card ? card.text : '')
      var origin = opts && opts.origin ? opts.origin : null
      var host = document.createElement('div')
      Object.assign(host.style, BOARD_UI.ideaFocusBackdrop)
      host.setAttribute('data-role', 'ideaFocus')
      var sheet = document.createElement('div')
      Object.assign(sheet.style, BOARD_UI.ideaFocusSheet)
      sheet.className = 'dshv-idea-focus'
      sheet.setAttribute('data-role', 'ideaFocusSheet')
      sheet.setAttribute('role', 'dialog')
      sheet.setAttribute('aria-modal', 'true')
      sheet.setAttribute('aria-label', paletteText(card ? 'boardIdeaFocusLabel' : 'boardIdeaNewLabel'))

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.ideaFocusHead)
      var dot = document.createElement('span')
      Object.assign(dot.style, BOARD_UI.ideaFocusDot)
      dot.setAttribute('aria-hidden', 'true')
      head.appendChild(dot)
      var label = document.createElement('span')
      Object.assign(label.style, BOARD_UI.ideaFocusLabel)
      label.textContent = paletteText(card ? 'boardIdeaFocusLabel' : 'boardIdeaNewLabel')
      head.appendChild(label)
      var spacer = document.createElement('span')
      Object.assign(spacer.style, BOARD_UI.ideaFocusSpacer)
      head.appendChild(spacer)

      var done = null
      if (card) {
        done = document.createElement('span')
        Object.assign(done.style, BOARD_UI.ideaFocusDone)
        done.className = 'dshv-done-toggle'
        done.setAttribute('role', 'button')
        done.setAttribute('data-role', 'cardDoneToggle')
        done.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          var now = ideaFocusCard(card.id)
          if (!now) return
          BOARD_STORE.setCardDone(card.id, !now.done)
          paintIdeaFocusDone()
          if (BOARD.open) renderBoard()
        })
        head.appendChild(done)
      }
      var close = document.createElement('span')
      Object.assign(close.style, BOARD_UI.ideaFocusClose)
      close.setAttribute('role', 'button')
      close.setAttribute('data-role', 'ideaFocusClose')
      close.setAttribute('title', paletteText('boardIdeaClose'))
      close.setAttribute('aria-label', paletteText('boardIdeaClose'))
      close.textContent = '\u00d7'
      close.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        closeIdeaFocus({ paint: true })
      })
      head.appendChild(close)
      sheet.appendChild(head)

      var title = document.createElement('textarea')
      Object.assign(title.style, BOARD_UI.ideaFocusTitle)
      title.setAttribute('rows', '1')
      title.setAttribute('data-role', 'cardTitleInput')
      title.setAttribute('data-no-drag', 'true')
      title.setAttribute('aria-label', paletteText('boardNoteTitleHint'))
      title.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
      title.value = parts.title
      title.addEventListener('input', function () {
        cleanIdeaTitle(title)
        growIdeaTitle()
        writeIdeaFocus()
      })
      title.addEventListener('keydown', function (ev) {
        var key = ev && ev.key ? String(ev.key) : ''
        if (key === 'Enter') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (body && typeof body.focus === 'function') body.focus()
          return
        }
        if (key === 'Escape') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeIdeaFocus({ paint: true })
        }
      })
      sheet.appendChild(title)

      var body = document.createElement('textarea')
      Object.assign(body.style, BOARD_UI.ideaFocusBody)
      body.setAttribute('data-role', 'cardText')
      body.setAttribute('data-no-drag', 'true')
      body.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
      body.setAttribute('placeholder', paletteText('boardCardPlaceholder'))
      body.value = parts.body
      body.addEventListener('input', function () {
        writeIdeaFocus()
      })
      body.addEventListener('keydown', function (ev) {
        var key = ev && ev.key ? String(ev.key) : ''
        if (key === 'Escape') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeIdeaFocus({ paint: true })
          return
        }
        if ((ev.ctrlKey || ev.metaKey) && key === 'Enter') {
          if (typeof ev.preventDefault === 'function') ev.preventDefault()
          if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeIdeaFocus({ paint: true })
        }
      })
      sheet.appendChild(body)

      var meta = document.createElement('div')
      Object.assign(meta.style, BOARD_UI.ideaFocusMeta)
      meta.setAttribute('data-role', 'ideaFocusMeta')
      if (!card) {
        meta.textContent = paletteText('boardIdeaNewHint')
      } else if (card.link) {
        var linked = ideaFocusSessionTitle(card.link)
        meta.textContent = linked
          ? paletteText('boardCardLinked') + linked
          : paletteText('boardCardLinkedUnknown')
      }
      sheet.appendChild(meta)

      var actions = document.createElement('div')
      Object.assign(actions.style, BOARD_UI.ideaFocusActions)
      var keys = document.createElement('span')
      Object.assign(keys.style, BOARD_UI.ideaFocusKeys)
      keys.textContent = paletteText(card ? 'boardIdeaKeys' : 'boardIdeaKeysNew')
      actions.appendChild(keys)
      if (card && card.link) {
        var deliver = document.createElement('span')
        Object.assign(deliver.style, BOARD_UI.ideaFocusGhost)
        deliver.setAttribute('role', 'button')
        deliver.setAttribute('data-role', 'ideaFocusDeliver')
        deliver.setAttribute('title', paletteText('boardCardDeliverHint'))
        deliver.textContent = paletteText('boardCardEnterHint')
        deliver.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          deliverIdeaFocus()
        })
        actions.appendChild(deliver)
      }
      if (!card) {
        var cancel = document.createElement('span')
        Object.assign(cancel.style, BOARD_UI.ideaFocusGhost)
        cancel.setAttribute('role', 'button')
        cancel.setAttribute('data-role', 'ideaFocusCancel')
        cancel.textContent = paletteText('boardIdeaCancel')
        cancel.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          closeIdeaFocus({ discard: true, paint: true })
        })
        actions.appendChild(cancel)
      }
      var confirm = document.createElement('span')
      Object.assign(confirm.style, BOARD_UI.ideaFocusPrimary)
      confirm.setAttribute('role', 'button')
      confirm.setAttribute('data-role', 'ideaFocusConfirm')
      confirm.textContent = paletteText(card ? 'boardIdeaClose' : 'boardIdeaCreate')
      confirm.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        closeIdeaFocus({ paint: true })
      })
      actions.appendChild(confirm)
      sheet.appendChild(actions)

      // The paper around the sheet is the way out every window here gives: a
      // press on it is a close, and the words stay where they were written.
      host.addEventListener('pointerdown', function (ev) {
        if (ev && ev.target !== host) return
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        closeIdeaFocus({ paint: true })
      })
      host.appendChild(sheet)
      BOARD.panel.appendChild(host)

      BOARD.ideaFocus = card ? card.id : ''
      BOARD.ideaFocusHost = host
      BOARD.ideaFocusSheet = sheet
      BOARD.ideaFocusTitle = title
      BOARD.ideaFocusBody = body
      BOARD.ideaFocusDone = done
      BOARD.ideaFocusAt = at
      BOARD.ideaFocusRaf = 0
      growIdeaTitle()
      paintIdeaFocusDone()
      animateIdeaFocusIn(host, sheet, origin)

      var wantBody = card && (field === 'body' || (!field && parts.body))
      var focusField = wantBody ? body : title
      if (focusField && typeof focusField.focus === 'function') focusField.focus()
      if (wantBody) {
        // A long thought is read from its first line: the sheet opens at the
        // top even though the caret is in the body.
        if (typeof body.setSelectionRange === 'function') body.setSelectionRange(0, 0)
        body.scrollTop = 0
      } else {
        // The same for a long title: the sheet opens on the start of the
        // thought, not on the tail of it.
        if (typeof title.setSelectionRange === 'function') title.setSelectionRange(0, 0)
        title.scrollTop = 0
      }
      return true
    }

    /**
     * Close the sheet, keeping what it says.
     *
     * An existing card is written through already, so closing is only a last
     * read of the fields and a paint. A new thought becomes a card here, at the
     * place the double click named; one that says nothing leaves no paper
     * behind. `discard` is the cancel button's word: only a draft can be thrown
     * away, because an existing card's text has been in the store all along.
     * @param {object} [opts] - `discard` for a cancelled draft, `paint` false
     *   when the caller is already taking the board down.
     * @returns {boolean} whether a sheet was open.
     */
    function closeIdeaFocus(opts) {
      var host = BOARD.ideaFocusHost
      if (!host) return false
      var discard = !!(opts && opts.discard)
      var paint = !(opts && opts.paint === false)
      if (BOARD.ideaFocusRaf) {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(BOARD.ideaFocusRaf)
        }
        BOARD.ideaFocusRaf = 0
      }
      var id = BOARD.ideaFocus
      var at = BOARD.ideaFocusAt || { x: 0, y: 0 }
      var title = BOARD.ideaFocusTitle ? String(BOARD.ideaFocusTitle.value || '') : ''
      var body = BOARD.ideaFocusBody ? String(BOARD.ideaFocusBody.value || '') : ''
      // The sheet stops being the open one before anything is written: a paint
      // from the write below must not find fields that are already gone.
      BOARD.ideaFocus = ''
      BOARD.ideaFocusHost = null
      BOARD.ideaFocusSheet = null
      BOARD.ideaFocusTitle = null
      BOARD.ideaFocusBody = null
      BOARD.ideaFocusDone = null
      BOARD.ideaFocusAt = null
      if (host.parentNode && typeof host.parentNode.removeChild === 'function') {
        host.parentNode.removeChild(host)
      }
      if (id) {
        if (ideaFocusCard(id)) {
          var text = boardJoinText(title, body)
          if (!text.trim()) BOARD_STORE.removeCard(id)
          else BOARD_STORE.setCardText(id, text)
        }
      } else if (!discard) {
        var words = boardJoinText(title, body)
        if (words.trim()) {
          var made = BOARD_STORE.addCard(at.x, at.y)
          if (made) {
            BOARD_STORE.setCardText(made, words)
            BOARD.front = made
          }
        }
      }
      if (paint && BOARD.open) renderBoard()
      return true
    }

    /**
     * Hand the sheet's thought to the conversation it is tied to.
     * @returns {void}
     */
    function deliverIdeaFocus() {
      var id = BOARD.ideaFocus
      var card = ideaFocusCard(id)
      if (!card || !card.link) return
      var words = boardJoinText(
        BOARD.ideaFocusTitle ? BOARD.ideaFocusTitle.value : '',
        BOARD.ideaFocusBody ? BOARD.ideaFocusBody.value : ''
      ).trim()
      if (!words) return
      closeIdeaFocus({ paint: true })
      handCardToSession(id, card.link, words)
    }

    /**
     * The menu behind a thought card's ⋯.
     *
     * Two verbs were worth a seat of their own on the heading (hand it over,
     * open the rest); everything rarer lives here, one press further away than
     * it used to be and out of the way of a card nobody is touching.
     * @param {object} card - the thought.
     * @param {string} stacked - the conversation it is filed under, or ''.
     * @param {object} parts - the card's title and body.
     * @returns {Element} the menu.
     */
    function buildIdeaMenu(card, stacked, parts) {
      var menu = document.createElement('div')
      Object.assign(menu.style, BOARD_UI.ideaMenu)
      menu.className = 'dshv-idea-menu'
      menu.setAttribute('data-role', 'ideaMenu')
      // The menu is not the card: a press inside it is a choice, never a carry.
      menu.setAttribute('data-no-drag', 'true')
      menu.appendChild(ideaMenuItem(paletteText('boardCardFocus'), 'ideaMenuOpen', function () {
        // The menu's own node is under the sheet once it opens; take it off the
        // card now rather than leaving it for the paint that closes the sheet.
        if (menu.parentNode && typeof menu.parentNode.removeChild === 'function') {
          menu.parentNode.removeChild(menu)
        }
        openIdeaFocus(card.id, parts.body ? 'body' : 'title', {
          origin: ideaFocusOrigin(null, BOARD.looseNodes[card.id]),
        })
      }))
      if (Number(card.h) > 0) {
        menu.appendChild(ideaMenuItem(paletteText('boardCardCollapseHint'), 'ideaMenuFold', function () {
          BOARD_STORE.setCardRows(card.id, 0)
          renderBoard()
        }))
      }
      if (card.link) {
        menu.appendChild(ideaMenuItem(paletteText('boardCardUnlink'), 'cardUnlink', function () {
          if (stacked) parkCardOutside(stacked, card.id)
          BOARD_STORE.unlinkCard(card.id)
          renderBoard()
        }))
      }
      menu.appendChild(ideaMenuItem(paletteText('boardCardRemove'), 'cardRemove', function () {
        removeLooseCard(card.id)
      }))
      return menu
    }

    /**
     * One line of that menu.
     * @param {string} label - what it says.
     * @param {string} role - its name for the tests and the pointer.
     * @param {Function} onPick - what it does.
     * @returns {Element} the row.
     */
    function ideaMenuItem(label, role, onPick) {
      var row = document.createElement('span')
      Object.assign(row.style, BOARD_UI.ideaMenuItem)
      row.className = 'dshv-idea-menu-item'
      row.setAttribute('role', 'button')
      row.setAttribute('data-role', role)
      row.textContent = label
      row.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD.ideaMenu = ''
        onPick()
      })
      return row
    }

    /**
     * The verbs on a conversation card that are not worth a seat of their own.
     *
     * Renaming is the first of them. The board names a conversation from the
     * thought that started it, so a name typed by hand is the rare case; a word
     * for it drawn on every card's first line was the common case, and it stood
     * on the same corner as the lock. The menu is where the next such verb goes.
     * @param {object} summary - the conversation.
     * @returns {Element} the menu.
     */
    function buildSessionMenu(summary, done) {
      var menu = document.createElement('div')
      Object.assign(menu.style, BOARD_UI.cardMenu)
      menu.className = 'dshv-card-menu'
      menu.setAttribute('data-role', 'cardMenu')
      // The menu is not the card: a press inside it is a choice, never a carry.
      menu.setAttribute('data-no-drag', 'true')
      menu.appendChild(cardMenuItem(paletteText('boardCardRenameHint'), 'cardRenameOpen', function () {
        beginBoardRename(summary.id)
      }))
      // A card in the finished strip keeps the way back where its other rare
      // verbs live: the mark is the reader's word, and a word can be taken
      // back without waiting for midnight.
      if (done) {
        menu.appendChild(cardMenuItem(paletteText('boardDoneRestore'), 'cardRestoreFocus', function () {
          bringBackFromDone(summary.id)
          showToast(paletteText('boardDoneRestored'))
          renderBoard()
        }))
      }
      return menu
    }

    /**
     * One line of that menu.
     * @param {string} label - what it says.
     * @param {string} role - its name for the tests and the pointer.
     * @param {Function} onPick - what it does.
     * @returns {Element} the row.
     */
    /**
     * Stand a card's menu under its ⋯, or above it where the panel would clip it.
     *
     * A panel is a box with edges of its own, and the last card in one sits
     * against the bottom: a menu that always opened downwards would be cut off
     * there. The measurement is the panel's, because the panel is what clips;
     * the menu is inside the card, so flipping it is a card's own height away.
     * @param {Element} menu - the menu, already in the card.
     * @param {Element} mark - the ⋯ that opened it.
     * @returns {void}
     */
    function placeCardMenu(menu, mark) {
      if (!menu || !mark || typeof mark.getBoundingClientRect !== 'function') return
      try {
        var panel = mark.closest ? mark.closest('[data-role="workspaceBlock"]') : null
        if (!panel || typeof panel.getBoundingClientRect !== 'function') return
        var room = panel.getBoundingClientRect()
        var box = mark.getBoundingClientRect()
        // A host without layout reports nothing, and the styles are the answer.
        if (!room || !room.height || !box) return
        if (box.bottom + BOARD_CARD_MENU_H <= room.bottom) return
        menu.style.top = 'auto'
        menu.style.bottom = 'calc(100% - 22px)'
      } catch (error) {
        // Measuring is a courtesy: the menu stays where the styles put it.
      }
    }

    function cardMenuItem(label, role, onPick) {
      var row = document.createElement('span')
      Object.assign(row.style, BOARD_UI.cardMenuItem)
      row.className = 'dshv-card-menu-item'
      row.setAttribute('role', 'button')
      row.setAttribute('data-role', role)
      row.textContent = label
      row.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD.sessionMenu = ''
        if (BOARD.sessionMenuMark) {
          BOARD.sessionMenuMark.setAttribute('aria-expanded', 'false')
          BOARD.sessionMenuMark = null
        }
        // The menu goes where it stands, whatever the verb does next: a refused
        // verb that repaints nothing must not leave its own menu on the card.
        if (row.parentNode && typeof row.parentNode.removeChild === 'function') {
          row.parentNode.removeChild(row)
        }
        onPick()
      })
      return row
    }

    /**
     * One loose card: a thought the reader put on the canvas rather than in a
     * conversation.
     *
     * It belongs to no workspace and to no conversation, so nothing on the feed
     * can move it. Its heading is the handle, its body is the text, and the ×
     * takes it away. The text is written as it is typed rather than on blur, so
     * a repaint cannot cost a sentence.
     * @param {object} card - one of `BOARD_STORE.cards`.
     * @returns {Element} the card.
     */
    function buildBoardLooseCard(card, titles, opts) {
      var stacked = opts && opts.stacked ? String(opts.stacked) : ''
      var node = document.createElement('div')
      Object.assign(node.style, BOARD_UI.loose)
      node.className = 'dshv-note'
      // A delivered card keeps its place on the board, but quietly: the work it
      // fed is where the attention belongs now, and the card is the receipt.
      if (card.done) Object.assign(node.style, BOARD_UI.looseDone)
      if (BOARD.cardEditing === card.id) Object.assign(node.style, BOARD_UI.looseEditing)
      // What this card is written in: its goal's hue, or the amber of a note that
      // belongs to nobody yet. Read once here, because the paper, the words and
      // every mark on it are the same ink in different weights.
      var ink = null
      if (stacked) {
        // A thought filed under a conversation is read in that conversation's
        // column: its place is the column's, its order is the document's, and
        // nothing about it is a free position on the paper any more.
        node.style.position = 'relative'
        node.style.left = 'auto'
        node.style.top = 'auto'
        node.style.width = '100%'
        node.setAttribute('data-stack', stacked)
      } else {
        node.style.left = card.x + 'px'
        node.style.top = card.y + 'px'
        node.style.width = BOARD_CARD_W + 'px'
      }
      // One shape in every state. The paper is planned from the words, and the
      // words and the field are set in the same ruler (`boardNoteMetrics`), so
      // the card that is planned is the card that is painted - and a press,
      // which swaps the words for the field, cannot change its size.
      // Which panel this card's conversation stands in, read before the paper is
      // inked: the paper and the dot are the same fact said twice.
      var linkedBlock = null
      if (card.link) {
        for (var lb = 0; lb < BOARD.blocks.length; lb++) {
          var rowsHere = BOARD.blocks[lb].rows
          for (var lr = 0; lr < rowsHere.length; lr++) {
            if (rowsHere[lr].id === card.link) linkedBlock = BOARD.blocks[lb]
          }
        }
      }
      if (!card.done) Object.assign(node.style, notePaper(linkedBlock))
      ink = noteInkOf(linkedBlock, card.done)
      node.style.color = ink.text
      var parts = noteParts(card.text)
      var opened = BOARD.cardEditing === card.id
      // A thought filed under a conversation is read by its name: one line is
      // the whole of its paper until it is opened. A free card keeps the two
      // lines it was always planned with.
      var compact = !!stacked && !opened
      var box = opened ? boardCardOpenBox(card.text) : boardCardBox(card.text, compact ? 1 : card.h)
      var metrics = boardNoteMetrics()
      node.style.height = box.height + 'px'
      node.setAttribute('data-rows', String(box.lines))
      // A compact thought is exactly its heading: the paper is measured by what
      // is on it, not by a body row it no longer draws.
      if (compact) node.style.height = 'auto'
      // While its field is up the card is a floor rather than a height: the field
      // opens at the paper it replaced, and the card follows it only if the
      // writing needs more room than that paper had.
      if (BOARD.cardEditing === card.id) {
        node.style.height = 'auto'
        node.style.minHeight = box.height + 'px'
      }
      // A card that holds more than it can show says so by fading its last line
      // rather than by hiding the rest behind a scrollbar inside the paper.
      if (!compact && parts.rows > box.lines) node.setAttribute('data-clipped', 'true')
      if (BOARD.front === card.id) {
        node.setAttribute('data-front', 'true')
        node.style.zIndex = String(BOARD.zTop)
      }
      // There is no corner to drag: a card is opened by pressing it, which shows
      // the whole of it, and closed by leaving it (see `boardCardOpenBox`).
      node.setAttribute('data-role', 'looseCard')
      node.setAttribute('data-card-id', card.id)
      node.setAttribute('data-handle', 'note')
      node.setAttribute('data-editing', BOARD.cardEditing === card.id ? 'true' : 'false')
      if (compact) node.setAttribute('data-compact', 'true')
      if (card.done) node.setAttribute('data-done', 'true')

      var head = document.createElement('div')
      Object.assign(head.style, BOARD_UI.looseHead)
      head.className = 'dshv-note-head'
      head.setAttribute('data-role', 'looseHead')
      // The whole card is the handle now, so a grip would be a second invitation
      // to the same gesture. What the heading says is only what is true of this
      // card: what state it is in, and what it belongs to.
      // Which conversation the card belongs to is said by the paper it is written
      // on, and in the card's own tooltip - the dot that used to repeat it was a
      // third mark on a heading that already has three.
      var parentTitle = card.link ? titles[card.link] || '' : ''
      if (card.link) {
        node.setAttribute('title', parentTitle
          ? paletteText('boardCardLinked') + parentTitle
          : paletteText('boardCardLinkedUnknown'))
      }
      // Unlinking is one of the card's rarer verbs now: it lives in the card's
      // own menu, with the rest (see `buildIdeaMenu`).

      // The done mark, pressed rather than delivered: a thought the reader has
      // finished with says so, and says it quietly — the card stays where it is.
      var doneToggle = document.createElement('span')
      Object.assign(doneToggle.style, BOARD_UI.cardDoneToggle)
      doneToggle.className = 'dshv-done-toggle'
      doneToggle.setAttribute('role', 'button')
      doneToggle.setAttribute('data-role', 'cardDoneToggle')
      doneToggle.setAttribute('aria-pressed', card.done ? 'true' : 'false')
      doneToggle.setAttribute('title', paletteText(card.done ? 'boardCardMarkOpen' : 'boardCardMarkDone'))
      doneToggle.textContent = card.done ? '\u2713' : ''
      // The box is drawn on paper rather than on the board, so its outline comes
      // from the paper's ink: the board's grey outline vanishes here.
      doneToggle.style.borderColor = ink.edge
      if (card.done) {
        doneToggle.style.background = 'hsl(45 74% 62%)'
        doneToggle.style.borderColor = 'hsl(45 60% 46%)'
        doneToggle.style.color = 'hsl(45 40% 16%)'
      }
      doneToggle.setAttribute('data-done', card.done ? 'true' : 'false')
      doneToggle.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        BOARD_STORE.setCardDone(card.id, !card.done)
        renderBoard()
      })
      // Two zones: the state the card is in, then what it belongs to. Deleting
      // and unlinking are secondary, and arrive under the pointer rather than
      // standing in the heading of every card that is not being touched.
      // The first line is the card's title, and it lives here: the row that used
      // to hold nothing but a box now says what the note is about.
      var title = null
      if (opened && BOARD.cardField === 'title') {
        // The name is a field of its own, in the row it belongs to. Typing here is
        // typing the title - the body below is untouched.
        title = document.createElement('input')
        Object.assign(title.style, BOARD_UI.looseTitle, BOARD_UI.looseTitleBox)
        title.setAttribute('type', 'text')
        title.setAttribute('data-role', 'cardTitleInput')
        title.setAttribute('data-no-drag', 'true')
        title.setAttribute('aria-label', paletteText('boardNoteTitleHint'))
        title.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
        title.style.color = ink.text
        title.value = parts.title
        title.addEventListener('input', function () {
          BOARD_STORE.setCardText(card.id, boardJoinText(title.value, parts.body))
        })
        title.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            // The name is done; the thought is next.
            commitBoardCard()
            var all = BOARD_STORE.cards()
            for (var k = 0; k < all.length; k++) {
              if (all[k].id !== card.id) continue
              beginBoardCard(card.id, 'body')
            }
          } else if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardCard()
          }
        })
        title.addEventListener('blur', function () {
          if (BOARD.cardEditing === card.id && BOARD.cardField === 'title'
            && BOARD.cardEditor === title) commitBoardCard()
        })
        BOARD.cardEditor = title
      } else {
        title = document.createElement('span')
        Object.assign(title.style, BOARD_UI.looseTitle)
        title.setAttribute('data-role', 'looseTitle')
        title.style.color = ink.text
        title.textContent = parts.title || paletteText('boardNoteUntitled')
        title.style.opacity = parts.title ? '1' : '0.45'
        if (card.link && parentTitle) {
          title.setAttribute('title', paletteText('boardCardLinked') + parentTitle)
        }
        title.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          openIdeaFocus(card.id, 'title', { origin: ideaFocusOrigin(ev, node) })
        })
      }
      head.appendChild(doneToggle)
      // The title is always in this row, whether it is text or a field: the name
      // of the note is the first thing in it, at every moment.
      head.appendChild(title)

      // The two verbs worth a seat of their own: hand the words to the
      // conversation this thought belongs to, and open the menu for the rest.
      if (stacked) {
        var deliver = document.createElement('span')
        Object.assign(deliver.style, BOARD_UI.looseDeliver)
        deliver.className = 'dshv-deliver'
        deliver.setAttribute('role', 'button')
        deliver.setAttribute('data-role', 'cardDeliver')
        deliver.setAttribute('title', paletteText('boardCardDeliverHint'))
        deliver.setAttribute('aria-label', paletteText('boardCardEnterHint'))
        deliver.appendChild(boardIcon('enter', 13))
        deliver.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          if (BOARD.dragged) {
            BOARD.dragged = false
            return
          }
          var words = String(card.text || '').trim()
          if (!words) return
          handCardToSession(card.id, stacked, words)
        })
        head.appendChild(deliver)
      }
      var more = document.createElement('span')
      Object.assign(more.style, BOARD_UI.looseMore)
      more.className = 'dshv-more'
      more.setAttribute('role', 'button')
      more.setAttribute('data-role', 'cardMenuOpen')
      more.setAttribute('title', paletteText('boardCardMenu'))
      more.setAttribute('aria-label', paletteText('boardCardMenu'))
      more.setAttribute('aria-expanded', BOARD.ideaMenu === card.id ? 'true' : 'false')
      more.textContent = '\u22ef'
      more.addEventListener('click', function (ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        // Opening a menu is not a repaint: the board may be mid-field, and a
        // paint would take the card out from under the press that asked.
        if (BOARD.ideaMenu === card.id) {
          closeIdeaMenu()
          more.setAttribute('aria-expanded', 'false')
          return
        }
        closeIdeaMenu()
        closeGoalMenu()
        BOARD.ideaMenu = card.id
        more.setAttribute('aria-expanded', 'true')
        node.appendChild(buildIdeaMenu(card, stacked, parts))
      })
      head.appendChild(more)
      node.appendChild(head)
      if (BOARD.ideaMenu === card.id) node.appendChild(buildIdeaMenu(card, stacked, parts))
      BOARD.looseNodes[card.id] = node

      if (opened && BOARD.cardField === 'body') {
        var editor = document.createElement('textarea')
        Object.assign(editor.style, BOARD_UI.looseEditor)
        editor.setAttribute('data-role', 'cardText')
        editor.setAttribute('aria-label', paletteText('boardCardPlaceholder'))
        editor.setAttribute('placeholder', paletteText('boardNoteTitleHint'))
        // The field is the card's own ruler: same type, same line box, and the
        // very number of rows the paper was planned for. That is the whole of
        // why a press does not resize the card it pressed.
        editor.style.fontSize = metrics.font + 'px'
        editor.style.lineHeight = metrics.line + 'px'
        editor.setAttribute('rows', String(box.lines))
        editor.style.height = (box.lines * metrics.line) + 'px'
        // The field grows with the writing and the paper grows with the field:
        // a thought is read whole, so there is no letterbox and no scrollbar
        // inside the paper any more.
        editor.setAttribute('placeholder', paletteText('boardCardPlaceholder'))
        editor.value = parts.body
        editor.addEventListener('input', function () {
          BOARD_STORE.setCardText(card.id, boardJoinText(parts.title, editor.value))
          var grown = boardEditorRows(editor.value)
          if (editor.getAttribute('rows') === String(grown)) return
          editor.setAttribute('rows', String(grown))
          editor.style.height = (grown * metrics.line) + 'px'
          // The paper grows with the writing while the field is up, and the
          // paint after it closes lands on the same size it was left at.
          node.style.height = 'auto'
        })
        editor.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') {
            ev.preventDefault()
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation()
            cancelBoardCard()
          } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
            ev.preventDefault()
            commitBoardCard()
          }
        })
        editor.addEventListener('blur', function () {
          if (BOARD.cardEditing === card.id && BOARD.cardEditor === editor) commitBoardCard()
        })
        // A field is the field's: the router leaves the press alone, so text in
        // it can be selected with the pointer.
        editor.setAttribute('data-no-drag', 'true')
        node.appendChild(editor)
        BOARD.cardEditor = editor
      } else if (box.lines > 0 && !compact) {
        var text = document.createElement('div')
        Object.assign(text.style, BOARD_UI.looseText)
        // The words sit on the card's ruler: the same type and line box the
        // paper was planned with, and exactly the room it was planned to hold.
        text.style.fontSize = metrics.font + 'px'
        text.style.lineHeight = metrics.line + 'px'
        text.style.height = (box.lines * metrics.line) + 'px'
        text.style.color = ink.text
        // The card shows the lines it was given, and fades the rest: resizing is
        // what buys more paper, so the clamp follows the paper rather than the
        // words.
        text.style.WebkitLineClamp = String(Math.max(1, box.lines))
        text.setAttribute('data-role', 'looseText')
        // The body only: the title is the heading's, and repeating it here would
        // spend the card's two lines saying what its first line already said.
        text.textContent = parts.body || paletteText('boardCardPlaceholder')
        if (!parts.body) text.style.opacity = '0.4'
        text.addEventListener('click', function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
          openIdeaFocus(card.id, 'body', { origin: ideaFocusOrigin(ev, node) })
        })
        node.appendChild(text)
      }
      // The card's own press is the card's, body or no body: a note is opened by
      // pressing it, which is the same gesture that shows all of it. A card
      // already being typed into keeps the press for its field, and so does
      // every mark on the heading.
      node.addEventListener('click', function (ev) {
        if (BOARD.dragged) {
          BOARD.dragged = false
          return
        }
        if (BOARD.cardEditing === card.id) return
        var hit = ev && ev.target
        if (hit && typeof hit.closest === 'function'
          && hit.closest('[data-no-drag],[data-role="cardRemove"],[data-role="cardDoneToggle"],'
            + '[data-role="cardUnlink"],[data-role="cardDeliver"],[data-role="cardMenuOpen"]')) return
        // The paper opens the thought; a card that has none opens its name.
        openIdeaFocus(card.id, parts.body ? 'body' : 'title', { origin: ideaFocusOrigin(ev, node) })
      })
      return node
    }

    /**
     * Join a card's two parts back into the one string the store keeps.
     *
     * A note is written as a title and a body but stored as text, so the first
     * line is the title and everything after it is the body. Joining them here, in
     * one function, is what keeps the two fields from disagreeing about the blank
     * line between them.
     * @param {string} title - the first line.
     * @param {string} body - everything after it.
     * @returns {string} the text.
     */
    function boardJoinText(title, body) {
      var head = String(title === undefined || title === null ? '' : title)
        .replace(/\s+/g, ' ')
        .trim()
      var rest = String(body === undefined || body === null ? '' : body).replace(/^\n+/, '')
      if (!head) return rest
      return rest ? head + '\n' + rest : head
    }

    /**
     * Start typing into one loose card - at its title, or at its body.
     *
     * The title is the heading row, next to the box; the body is the paper under
     * it. They are two fields because they are two things: one line that names
     * the note, and however much the note needs.
     * @param {string} id - the card.
     * @param {string} [field] - 'title' (the default) or 'body'.
     * @returns {void}
     */
    function beginBoardCard(id, field) {
      if (!id) return
      // The press that asked for this may have settled an empty card out from
      // under the seat it aimed at; a field with no paper behind it is not a
      // place to type.
      var all = BOARD_STORE.cards()
      var here = false
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { here = true; break }
      }
      if (!here) return
      var want = field === 'body' ? 'body' : 'title'
      if (BOARD.cardEditing === id && BOARD.cardField === want) return
      // The card being opened is the card being worked on: it comes to the front,
      // and stays there when the paint after this one is drawn.
      raiseBoardCard(id, BOARD.looseNodes[id] || null)
      BOARD.cardEditing = id
      BOARD.cardField = want
      BOARD.cardEditor = null
      renderBoard()
    }

    /**
     * Keep what the open field says, and close it.
     *
     * A note that says nothing is not a note: leaving a blank piece of paper on
     * the canvas is the tidiest way to make a board look unloved, so a card that
     * closes empty is taken away rather than kept.
     * @returns {boolean} whether a field was open.
     */
    /**
     * Settle one open field: keep what it says, and take the paper away if it
     * says nothing.
     *
     * One function because both ways out of a field - confirming it, and asking
     * for another card - have to agree about what an empty note is.
     * @param {string} id - the card.
     * @param {Element} editor - its field.
     * @returns {string} the text that was kept.
     */
    function boardTakeCardText(id, editor) {
      var field = BOARD.cardField === 'body' ? 'body' : 'title'
      var value = editor ? String(editor.value || '') : ''
      var held = null
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) held = all[i]
      }
      var parts = noteParts(held ? held.text : '')
      var text = field === 'title'
        ? boardJoinText(value, parts.body)
        : boardJoinText(parts.title, value)
      BOARD_STORE.setCardText(id, text)
      if (!text.trim()) BOARD_STORE.removeCard(id)
      return text
    }

    function commitBoardCard() {
      if (!BOARD.cardEditing) return false
      var editor = BOARD.cardEditor
      var id = BOARD.cardEditing
      var kept = boardTakeCardText(id, editor)
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      renderBoard()
      return kept !== ''
    }

    /** Throw the open field away, leaving the card as it was last written. */
    function cancelBoardCard() {
      if (!BOARD.cardEditing) return false
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      renderBoard()
      return true
    }

    /**
     * Settle the open card field for a press, without the paint a settle
     * usually carries.
     *
     * A press ends a field the way a click does - the words are kept, and a
     * note that says nothing is taken away - but the press is not the click
     * yet. The click behind it is still on its way, and the paint a settle
     * carries would replace the element that click aims at. So the field is
     * taken off the page (a later paint is allowed again), and the paint is
     * owed to whoever ends the gesture that started here.
     * @returns {void}
     */
    function settleBoardCardForPress() {
      boardTakeCardText(BOARD.cardEditing, BOARD.cardEditor)
      if (BOARD.cardEditor && BOARD.cardEditor.parentNode) {
        BOARD.cardEditor.parentNode.removeChild(BOARD.cardEditor)
      }
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      BOARD.paintOwed = true
    }

    /**
     * Open a new thought at a place, and let the sheet write it.
     *
     * No card is made here: a blank piece of paper has nothing to say yet, and
     * one that closes empty would leave the canvas looking unloved. The card is
     * written when the sheet closes with words in it, at the place this press
     * named.
     * @param {number} x - canvas coordinate.
     * @param {number} y - canvas coordinate.
     * @param {object} [origin] - client point the sheet grows from.
     * @returns {boolean} whether the sheet opened.
     */
    function addBoardCardAt(x, y, origin) {
      // A card being typed into is finished first. The new thought is a thought
      // of its own, and a field that outlived the card it was drawn for would be
      // read as this card's words the moment the board redraws.
      if (BOARD.cardEditing) boardTakeCardText(BOARD.cardEditing, BOARD.cardEditor)
      BOARD.cardEditing = ''
      BOARD.cardField = ''
      BOARD.cardEditor = null
      return openIdeaFocus('', 'title', { x: x, y: y, origin: origin })
    }

    /**
     * Open a new thought where the reader is looking, or below everything when
     * the page is too small (or too fake) to have a middle.
     * @param {Element} [anchor] - the button the press landed on.
     * @returns {boolean} whether the sheet opened.
     */
    function addBoardCard(anchor) {
      var place = nextCardPlace()
      var viewport = BOARD.body
      if (viewport) {
        var width = Number(viewport.clientWidth) || 0
        var height = Number(viewport.clientHeight) || 0
        if (width > BOARD_CARD_W * 2 && height > 240) {
          place = {
            x: (Number(viewport.scrollLeft) || 0) + Math.max(24, (width - BOARD_CARD_W) / 2),
            y: (Number(viewport.scrollTop) || 0) + Math.max(24, (height - boardCardBox('').height) / 2),
          }
        }
      }
      return addBoardCardAt(place.x, place.y, ideaFocusOrigin(null, anchor))
    }

    /** Take one loose card off the canvas. */
    function removeLooseCard(id) {
      if (BOARD.cardEditing === id) {
        BOARD.cardEditing = ''
        BOARD.cardEditor = null
      }
      // Read it before it goes: an undone delete has to be the same card - its
      // words, its tie, its done mark, where it was filed - not a new one that
      // happens to read the same.
      var held = null
      var at = 0
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id !== id) continue
        held = all[i]
        at = i
      }
      BOARD_STORE.removeCard(id)
      // Record before the paint: the buttons are drawn by the paint, and a step
      // taken after it would leave them one press behind.
      if (!held) {
        renderBoard()
        return
      }
      BOARD_HISTORY.record({
        label: paletteText('boardUndoIdea'),
        undo: function () {
          BOARD_STORE.restoreCard(held, at)
          if (BOARD.open) renderBoard()
        },
        redo: function () {
          BOARD_STORE.removeCard(id)
          if (BOARD.open) renderBoard()
        },
      })
      renderBoard()
    }

    /**
     * Take one conversation off the board.
     *
     * Deleted until it moves again: the mark is held against the moment it last
     * moved, so a conversation used afterwards belongs back on the board.
     * @param {object} summary - session summary.
     * @returns {void}
     */
    function removeBoardCard(summary) {
      var touched = summary.updatedAt
      BOARD_STORE.mute(summary.id, touched)
      // A deleted conversation is a mark held against the moment it last moved,
      // so the way back is simply to lift that mark - and the way forward again
      // is to put it back exactly as it was stamped.
      BOARD_HISTORY.record({
        label: paletteText('boardUndoSession'),
        undo: function () {
          BOARD_STORE.unmute(summary.id)
          if (BOARD.open) renderBoard()
        },
        redo: function () {
          BOARD_STORE.mute(summary.id, touched)
          if (BOARD.open) renderBoard()
        },
      })
      renderBoard()
    }

    /**
     * A press on a block's heading: the handle the panel is dragged by.
     *
     * Nothing moves until the pointer has travelled `BOARD_SLOP`, so a press on
     * the way to the fold toggle still opens and closes the panel.
     * @param {string} key - the block's key.
     * @param {Element} node - the block element.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    /**
     * What the pointer is standing on, as far as the canvas is concerned.
     *
     * There is one press handler on the board, and this is the whole of how it
     * decides what a press means: the nearest element that declares
     * `data-handle` wins, in the order a reader would say it - a card is a card
     * before it is part of a goal - and a field declares `data-no-drag` because
     * a press inside one is the field's (it is how text is selected).
     * @param {Element} target - the element pressed.
     * @returns {{kind: string, el: Element, key: string}|null} what it is, or
     *   null for the paper itself.
     */
    function handleOf(target) {
      if (!target || typeof target.closest !== 'function') return null
      if (target.closest('[data-no-drag]')) return { kind: 'field', el: null, key: '' }
      var card = target.closest('[data-handle="card"]')
      if (card) return { kind: 'card', el: card, key: card.getAttribute('data-session-id') || '' }

      var note = target.closest('[data-handle="note"]')
      if (note) return { kind: 'note', el: note, key: note.getAttribute('data-card-id') || '' }
      // A put-away note is a line of the tray: it is lifted back out onto the
      // paper, so the press belongs to it and not to the panel it stands in.
      var row = target.closest('[data-handle="inboxNote"]')
      if (row) return { kind: 'inboxNote', el: row, key: row.getAttribute('data-card-id') || '' }
      var goal = target.closest('[data-handle="goal"]')
      if (goal) return { kind: 'goal', el: goal, key: goal.getAttribute('data-block') || '' }
      return null
    }

    /**
     * Lift one card out of a conversation's column, where the hand is.
     *
     * A card in a pile has no free position to move, so the gesture carries a
     * copy: the card it came from stays in place and dims, and the copy is what
     * the hand drags. Letting go on a column files it there; letting go anywhere
     * else gives it a place of its own again.
     * @param {object} drag - the armed gesture.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function beginStackedCarrier(drag, x, y) {
      if (!drag || !drag.node || !BOARD.stage) return
      var point = canvasPointOf(x, y)
      var ghost = document.createElement('div')
      Object.assign(ghost.style, BOARD_UI.ghost)
      ghost.className = 'dshv-ghost'
      ghost.setAttribute('data-role', 'dragGhost')
      ghost.style.left = Math.max(0, point.x - BOARD_CARD_W / 2) + 'px'
      ghost.style.top = Math.max(0, point.y - 18) + 'px'
      ghost.style.width = BOARD_CARD_W + 'px'
      // The copy is what the hand holds. A host without cloneNode still gets
      // the carrier - the card's own box, empty - because the gesture is what
      // matters, not the decoration on it.
      var copy = typeof drag.node.cloneNode === 'function' ? drag.node.cloneNode(true) : null
      if (copy) {
        if (copy.removeAttribute) copy.removeAttribute('data-stack')
        copy.style.position = 'relative'
        copy.style.left = ''
        copy.style.top = ''
        copy.style.width = '100%'
        ghost.appendChild(copy)
      }
      drag.origin = drag.node
      drag.origin.style.opacity = '0.35'
      drag.fromStack = drag.stacked
      BOARD.stage.appendChild(ghost)
      drag.node = ghost
      drag.baseX = Math.max(0, point.x - BOARD_CARD_W / 2)
      drag.baseY = Math.max(0, point.y - 18)
      drag.fromX = x
      drag.fromY = y
    }

    /**
     * The card a drop should sit above, from where the pointer let go.
     * @param {Element} stack - the conversation's pile.
     * @param {number} y - the pointer's client y.
     * @returns {string} the card id, or '' for the bottom of the pile.
     */
    function stackCardBefore(stack, y) {
      if (!stack || !stack.children) return ''
      var at = Number(y) || 0
      for (var i = 0; i < stack.children.length; i++) {
        var child = stack.children[i]
        if (!child.getAttribute) continue
        if (child.getAttribute('data-role') !== 'looseCard') continue
        var rect = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect() : null
        if (!rect || (!rect.height && !rect.width)) continue
        if (at < rect.top + rect.height / 2) return child.getAttribute('data-card-id') || ''
      }
      return ''
    }

    /**
     * Mark the column the hand is over, or clear every mark.
     * @param {Element} target - the pile to mark, or null.
     * @returns {void}
     */
    /**
     * Put the thought card's menu away, without a repaint.
     *
     * The next press is allowed to do whatever it was going to do - opening
     * another menu, starting a carry, or nothing at all - so the menu is taken
     * off the page where it stands rather than by redrawing the board under the
     * pointer.
     * @returns {void}
     */
    function closeIdeaMenu() {
      if (!BOARD.ideaMenu) return
      BOARD.ideaMenu = ''
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var open = BOARD.stage.querySelectorAll('[data-role="ideaMenu"]')
      for (var i = 0; i < open.length; i++) {
        if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
      }
    }

    /**
     * Put the colour wheel away, without a repaint.
     *
     * The same bargain the two card menus make: the next press does whatever it
     * was going to do, and the wheel is taken off the panel where it stands.
     * @returns {void}
     */
    function closeSeatMenu() {
      if (!BOARD.seatMenu) return
      BOARD.seatMenu = ''
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var open = BOARD.stage.querySelectorAll('[data-role="seatMenu"]')
      for (var i = 0; i < open.length; i++) {
        if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
      }
      var dots = BOARD.stage.querySelectorAll('[data-role="blockDot"]')
      for (var d = 0; d < dots.length; d++) dots[d].setAttribute('aria-expanded', 'false')
    }

    /**
     * Put a goal's ⋯ menu away, without a repaint.
     *
     * The same bargain as the other menus: the press that dismisses it still
     * does what it meant to do, and the menu is taken off the page where it
     * stands rather than by redrawing the panel under the pointer.
     * @returns {void}
     */
    function closeGoalMenu() {
      if (!BOARD.goalMenu) return
      BOARD.goalMenu = ''
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var open = BOARD.stage.querySelectorAll('[data-role="goalMenu"]')
      for (var i = 0; i < open.length; i++) {
        if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
      }
      var marks = BOARD.stage.querySelectorAll('[data-role="goalMenuOpen"]')
      for (var m = 0; m < marks.length; m++) marks[m].setAttribute('aria-expanded', 'false')
    }

    /**
     * Put a card's state menu away, without a repaint.
     *
     * The same bargain as every other menu on this canvas: the next press does
     * whatever it was going to do, and the menu is taken off the card where it
     * stands.
     * @returns {void}
     */
    function closeVerdictMenu() {
      if (!BOARD.verdictMenu) return
      BOARD.verdictMenu = ''
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var open = BOARD.stage.querySelectorAll('[data-role="verdictMenu"]')
      for (var i = 0; i < open.length; i++) {
        if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
      }
      var marks = BOARD.stage.querySelectorAll('[data-role="cardState"],[data-role="cardStateAdd"]')
      for (var m = 0; m < marks.length; m++) marks[m].setAttribute('aria-expanded', 'false')
    }

    /**
     * Put a conversation card's menu away, without a repaint.
     *
     * The same bargain as the thought card's: the next press does whatever it
     * was going to do, and the menu is taken off the page rather than redrawn.
     * @returns {void}
     */
    function closeSessionMenu() {
      if (!BOARD.sessionMenu) return
      BOARD.sessionMenu = ''
      // The mark is the menu's own state: it goes down with the menu, not on
      // the next paint, so a card closed by Escape does not still claim to be open.
      if (BOARD.sessionMenuMark) {
        BOARD.sessionMenuMark.setAttribute('aria-expanded', 'false')
        BOARD.sessionMenuMark = null
      }
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var open = BOARD.stage.querySelectorAll('[data-role="cardMenu"]')
      for (var i = 0; i < open.length; i++) {
        if (open[i].parentNode) open[i].parentNode.removeChild(open[i])
      }
    }

    function paintStackDrop(target) {
      var stacks = BOARD.stacks || []
      for (var i = 0; i < stacks.length; i++) {
        var el = stacks[i].el
        if (!el || !el.getAttribute) continue
        el.setAttribute('data-drop', el === target ? 'true' : 'false')
      }
    }

    /**
     * Light the heading of the goal a carried card would start a conversation in.
     *
     * The plus and the name are one target, so the whole row is what says it
     * would take the card. Every heading is told either way, so a row left lit
     * cannot outlive the hand that lit it.
     * @param {Element|null} target - the heading under the hand.
     * @returns {void}
     */
    function paintHeadDrop(target) {
      if (!BOARD.stage || typeof BOARD.stage.querySelectorAll !== 'function') return
      var heads = BOARD.stage.querySelectorAll('[data-role="blockHead"]')
      for (var i = 0; i < heads.length; i++) {
        var on = heads[i] === target && !!goalHeadKeyUnder(heads[i])
        heads[i].setAttribute('data-drop', on ? 'true' : 'false')
      }
    }

    /**
     * Give a card lifted out of a column a place on the paper.
     *
     * It stands beside the panel it left - clear of it, level with the first
     * conversation - because the place it was drawn in was the column's, not
     * its own.
     * @param {string} sessionId - the conversation it came out of.
     * @param {string} cardId - the card.
     * @returns {void}
     */
    function parkCardOutside(sessionId, cardId) {
      var blocks = BOARD.blocks || []
      for (var b = 0; b < blocks.length; b++) {
        var rows = blocks[b].rows || []
        for (var r = 0; r < rows.length; r++) {
          if (rows[r].id !== sessionId) continue
          var place = BOARD_STORE.blocks()[blocks[b].key]
          if (!place) return
          var wide = boardPanelWidths()[blocks[b].key] || boardBlockWidth(blocks[b])
          BOARD_STORE.moveCard(cardId, place.x + wide + BOARD_TIDY_GAP, place.y + BOARD_BLOCK_HEAD_H)
          return
        }
      }
    }

    /**
     * The one press handler on the canvas.
     *
     * Every gesture starts here and nowhere else. What the press *means* is read
     * from the element under it (`handleOf`); what the press *is* is settled by
     * `onBoardMove` on the first movement past `BOARD_SLOP`. The pieces inside -
     * names, notes, buttons, fields - never take a press, so they cannot take one
     * from each other: they answer clicks, and a click that arrived after a real
     * drag is dropped by their own `BOARD.dragged` check.
     * @param {PointerEvent} ev - the pointerdown.
     * @returns {void}
     */
    function boardPointerDown(ev) {
      if (!BOARD.open || !ev || (ev.button !== undefined && ev.button !== 0)) return
      if (BOARD.drag) return
      // Every press starts from "this was not a drag": a flag left over from the
      // gesture before it would swallow the click that follows this one.
      BOARD.dragged = false
      // A press anywhere but the menu itself dismisses it, and still does what
      // the press meant to do.
      var menuHit = ev.target && typeof ev.target.closest === 'function'
        ? ev.target.closest('[data-role="ideaMenu"],[data-role="cardMenu"],[data-role="cardMenuOpen"],[data-role="seatMenu"],[data-role="blockDot"],[data-role="goalMenu"],[data-role="goalMenuOpen"],[data-role="verdictMenu"],[data-role="cardState"],[data-role="cardStateAdd"]')
        : null
      if (!menuHit) {
        closeIdeaMenu()
        closeSessionMenu()
        closeSeatMenu()
        closeGoalMenu()
        closeVerdictMenu()
      }
      var hit = handleOf(ev.target)
      if (hit && hit.kind === 'field') return
      // A press anywhere but the field being typed into settles that field, the
      // way a press anywhere but a dialog dismisses the dialog. It is also what
      // makes an empty card go away the moment the reader clicks the paper: the
      // card closes empty, and an empty card is not a note.
      //
      // The words are settled here, but the paint is not. The click behind
      // this press is still on its way, and a paint now would replace the
      // element that click aims at: the press that hands the reader from the
      // name to the thought would swallow its own click, and the thought would
      // never open. The field is taken off the page - so a later paint is
      // allowed again - and the paint is owed to whoever ends this gesture.
      // Only a field that is really on the page counts: a stale edit pointer
      // would settle a card the reader is not looking at.
      if (BOARD.cardEditing && boardFieldOpen()) {
        var inField = ev.target && typeof ev.target.closest === 'function'
          ? ev.target.closest('[data-role="cardText"], [data-role="cardTitleInput"]')
          : null
        if (!inField) settleBoardCardForPress()
      }
      var fromX = Number(ev.clientX) || 0
      var fromY = Number(ev.clientY) || 0
      if (!hit) {
        // The paper itself: move the canvas under the eye.
        BOARD.drag = {
          kind: 'pan',
          fromX: fromX,
          fromY: fromY,
          scrollLeft: Number(BOARD.body.scrollLeft) || 0,
          scrollTop: Number(BOARD.body.scrollTop) || 0,
          moved: false,
        }
        boardListen()
        return
      }
      if (!hit.key) return
      if (hit.kind === 'goal') {
        var places = BOARD_STORE.blocks()
        var place = places[hit.key]
        if (!place) return
        BOARD.drag = {
          kind: 'goal',
          key: hit.key,
          node: hit.el,
          fromX: fromX,
          fromY: fromY,
          baseX: place.x,
          baseY: place.y,
          x: place.x,
          y: place.y,
          moved: false,
        }
        boardListen()
        return
      }

      if (hit.kind === 'note') {
        var cards = BOARD_STORE.cards()
        var found = null
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].id === hit.key) found = cards[i]
        }
        if (!found) return
        raiseBoardCard(hit.key, hit.el)
        BOARD.drag = {
          kind: 'note',
          key: hit.key,
          node: hit.el,
          // A card drawn inside a conversation's column has no place of its
          // own to move: dragging it asks which column, and where in the pile.
          stacked: hit.el.getAttribute('data-stack') || '',
          fromX: fromX,
          fromY: fromY,
          baseX: found.x,
          baseY: found.y,
          x: found.x,
          y: found.y,
          moved: false,
        }
        boardListen()
        return
      }
      if (hit.kind === 'inboxNote') {
        // A line of the tray: a press that moves lifts it back onto the paper.
        BOARD.drag = {
          kind: 'inboxNote',
          key: hit.key,
          node: hit.el,
          fromX: fromX,
          fromY: fromY,
          moved: false,
        }
        boardListen()
        return
      }
      // A conversation card: carried as a copy, and filed into the goal it is
      // let go on.
      raiseBoardCard(hit.key, hit.el)
      BOARD.drag = {
        kind: 'session',
        key: hit.key,
        node: null,
        origin: hit.el,
        // A line of the quiet strip is a conversation like any other, and
        // dragging it is the reader pulling it back into the day.
        quiet: hit.el.getAttribute('data-role') === 'quietRow',
        carry: [],
        // The column is what a horizontal drag sorts, and the panel is the
        // boundary: inside it the drag is a sort, outside it is a move.
        column: typeof hit.el.closest === 'function' ? hit.el.closest('[data-role="sessionColumn"]') : null,
        panel: typeof hit.el.closest === 'function' ? hit.el.closest('[data-role="workspaceBlock"]') : null,
        mode: '',
        fromX: fromX,
        fromY: fromY,
        baseX: 0,
        baseY: 0,
        x: 0,
        y: 0,
        moved: false,
      }
      boardListen()
    }

    /**
     * Put the drop bands on screen, or take them away.
     *
     * The band's own surface is an inline style, so a stylesheet rule cannot show
     * it: this is the only thing that can, and it is called from the one place
     * that knows a note is in the air.
     * @param {boolean} on - whether a note is being carried.
     * @returns {void}
     */
    /** Whether the note a gesture is carrying has already been finished. */
    function boardNoteDone(id) {
      var all = BOARD_STORE.cards()
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i].done === true
      }
      return false
    }

    function showDropZones(on, filed) {
      var zones = BOARD.dropZones || []
      var word = paletteText(filed ? 'boardCardFileHint' : 'boardCardEnterHint')
      for (var i = 0; i < zones.length; i++) {
        zones[i].style.display = on ? 'flex' : 'none'
        zones[i].style.pointerEvents = on ? 'auto' : 'none'
        if (zones[i].enterWord && zones[i].enterWord.textContent !== word) {
          zones[i].enterWord.textContent = word
        }
      }
      if (BOARD.body) BOARD.body.setAttribute('data-note-drag', on ? 'true' : 'false')
      BOARD.dropOn = on === true
    }

    /** Start listening for the rest of a gesture, once it has been armed. */
    function boardListen() {
      window.addEventListener('pointermove', onBoardMove, true)
      window.addEventListener('pointerup', onBoardUp, true)
      // A gesture belongs to the window it started in: losing the window -
      // the reader switched apps mid-press - loses the pointer with it, and
      // an up that never comes must not leave the board deaf to the next
      // press.
      window.addEventListener('blur', onBoardBlurDrag)
    }

    /**
     * Start a session drag: a sort inside its own panel, a carry outside it.
     * @param {object} drag - the armed gesture.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function beginSessionGrab(drag, x, y) {
      if (beginSessionReorder(drag, x, y)) return
      drag.mode = 'carry'
      beginSessionCarrier(drag, x, y)
    }

    /**
     * Whether a hand is still close enough to its panel to be sorting inside it.
     *
     * The panel is the boundary, with a margin: the body is narrower than the
     * card the hand picked up, so a sort that gave up over the heading would be a
     * gesture changing its mind on the way out. Only a real departure turns the
     * drag into a move.
     * @param {object} seat - the panel's client rect.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {boolean} whether the point is inside, by the margin.
     */
    function panelHolds(seat, x, y) {
      if (!seat) return false
      return x >= seat.left - BOARD_SORT_EDGE && x <= seat.right + BOARD_SORT_EDGE
        && y >= seat.top - BOARD_SORT_EDGE && y <= seat.bottom + BOARD_SORT_EDGE
    }

    /**
     * Sort one conversation among its neighbours, where the hand is.
     *
     * The columns are measured once, at the start: a gesture that read the page
     * on every frame would be the one thing standing between the pointer and
     * the paper. After that the dragged column follows the hand in both axes and
     * its neighbours step aside in transforms only - no repaint, no reflow.
     * @param {object} drag - the armed gesture.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {boolean} whether a sort began.
     */
    function beginSessionReorder(drag, x, y) {
      if (!drag || !drag.column || !drag.panel || !drag.column.parentNode) return false
      var seat = typeof drag.panel.getBoundingClientRect === 'function'
        ? drag.panel.getBoundingClientRect()
        : null
      if (!seat || !seat.width) return false
      if (!panelHolds(seat, x, y)) return false
      var kids = drag.column.parentNode.children || []
      var list = []
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i]
        if (!el.getAttribute || el.getAttribute('data-role') !== 'sessionColumn') continue
        list.push({ el: el, rect: el.getBoundingClientRect() })
      }
      if (list.length < 2) return false
      var index = -1
      for (var k = 0; k < list.length; k++) {
        if (list[k].el === drag.column) index = k
      }
      if (index < 0) return false
      drag.mode = 'reorder'
      BOARD.reorder = {
        key: drag.panel.getAttribute('data-block') || '',
        sessionId: drag.key,
        column: drag.column,
        panel: drag.panel,
        list: list,
        index: index,
        at: index,
        fromX: x,
        fromY: y,
      }
      drag.column.setAttribute('data-sorting', 'true')
      drag.column.style.position = 'relative'
      drag.column.style.zIndex = '40'
      drag.column.style.transition = 'none'
      drag.column.style.pointerEvents = 'none'
      drag.panel.style.overflow = 'visible'
      for (var t = 0; t < list.length; t++) {
        if (t === index) continue
        list[t].el.style.transition = 'transform .16s ease'
      }
      return true
    }

    /**
     * Follow the hand, and let the other columns make room as it passes them.
     *
     * A panel reads across more than one row once it holds more than three
     * conversations, so a card's place is a point in a grid rather than a rank
     * in a line. The hand's height says which row it is asking for and its width
     * says where in that row; a column moves by the difference between where it
     * stands and the slot its new rank occupies. Measuring every delta against
     * the slots themselves keeps the row wrap, and the rule between rows, in the
     * same picture.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function paintSessionReorder(x, y) {
      var state = BOARD.reorder
      if (!state) return
      // The stage is scaled: a pixel of the hand is one over `zoom` of paper.
      var zoom = BOARD.zoom || 1
      state.column.style.transform = 'translate(' + ((x - state.fromX) / zoom) + 'px, '
        + ((y - state.fromY) / zoom) + 'px)'
      var at = sessionSlotAt(state, x, y)
      if (at === state.at) return
      state.at = at
      for (var j = 0; j < state.list.length; j++) {
        if (j === state.index) continue
        var to = j
        if (state.index < at && j > state.index && j <= at) to = j - 1
        else if (at < state.index && j >= at && j < state.index) to = j + 1
        var slot = state.list[to].rect
        var here = state.list[j].rect
        var dx = (slot.left - here.left) / zoom
        var dy = (slot.top - here.top) / zoom
        state.list[j].el.style.transform = dx || dy
          ? 'translate(' + dx + 'px, ' + dy + 'px)'
          : ''
      }
    }

    /**
     * The place the hand is asking for, read off the grid.
     *
     * The columns are grouped into rows by their tops; the hand's height picks a
     * row, and its width says how many of that row stand to its left. Everything
     * in a row above comes first in reading order, everything below comes later.
     * A hand past the last row is asking for the end, and one above the first
     * for the front.
     * @param {object} state - the captured sort.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {number} the place among the other columns, after the moving one.
     */
    function sessionSlotAt(state, x, y) {
      var list = state.list
      var rows = []
      var rowOf = []
      var i
      for (i = 0; i < list.length; i++) {
        var rect = list[i].rect
        var found = -1
        for (var r = 0; r < rows.length; r++) {
          if (Math.abs(rows[r].top - rect.top) <= 1) {
            found = r
            break
          }
        }
        if (found < 0) {
          rows.push({ top: rect.top, bottom: rect.bottom })
          found = rows.length - 1
        }
        if (rect.bottom > rows[found].bottom) rows[found].bottom = rect.bottom
        rowOf.push(found)
      }
      if (!rows.length) return state.index
      if (y < rows[0].top) return 0
      if (y > rows[rows.length - 1].bottom) return list.length - 1
      // The rows were met in document order, which is row-major, so their tops
      // are already the order the eye reads them in.
      var pointerRow = 0
      for (i = 0; i < rows.length; i++) {
        if (y >= rows[i].top) pointerRow = i
      }
      var at = 0
      for (i = 0; i < list.length; i++) {
        if (i === state.index) continue
        if (rowOf[i] < pointerRow) at = at + 1
        else if (rowOf[i] === pointerRow
          && list[i].rect.left + list[i].rect.width / 2 < x) at = at + 1
      }
      return at
    }

    /**
     * Hand the drag back to the carrier, because the pointer left the panel.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function leaveSessionReorder(x, y) {
      if (!BOARD.reorder) return
      resetSessionReorder()
      var drag = BOARD.drag
      if (!drag) return
      drag.mode = 'carry'
      beginSessionCarrier(drag, x, y)
    }

    /**
     * Put every column back where the paint left it.
     * @returns {void}
     */
    function resetSessionReorder() {
      var state = BOARD.reorder
      if (!state) return
      for (var i = 0; i < state.list.length; i++) {
        var el = state.list[i].el
        el.style.transform = ''
        el.style.transition = ''
        el.style.position = ''
        el.style.zIndex = ''
        el.style.pointerEvents = ''
        el.setAttribute('data-sorting', 'false')
      }
      if (state.panel) state.panel.style.overflow = ''
      BOARD.reorder = null
    }

    /**
     * Write the order the hand chose, once, and draw it.
     *
     * Only the conversations the panel draws as columns are written: a quiet one
     * is a line in the strip with no column to be sorted among, so it keeps the
     * tail it was read into instead of being handed a place in the middle of the
     * grid that no paint would ever draw it in.
     * @param {object} state - the captured sort.
     * @returns {void}
     */
    function commitSessionReorder(state) {
      if (!state || !state.key || !state.sessionId) return
      var blocks = BOARD.blocks || []
      var rows = []
      for (var b = 0; b < blocks.length; b++) {
        if (blocks[b].key === state.key) rows = blocks[b].rows
      }
      var drawn = []
      for (var i = 0; i < state.list.length; i++) {
        var el = state.list[i].el
        var id = el && el.getAttribute ? el.getAttribute('data-column') : ''
        if (id) drawn.push(id)
      }
      var from = drawn.indexOf(state.sessionId)
      if (from < 0) return
      drawn.splice(from, 1)
      var at = Math.max(0, Math.min(drawn.length, state.at))
      if (at === from) return
      drawn.splice(at, 0, state.sessionId)
      var ids = drawn.slice()
      for (var r = 0; r < rows.length; r++) {
        if (ids.indexOf(rows[r].id) < 0) ids.push(rows[r].id)
      }
      BOARD_STORE.setOrder(state.key, ids)
      renderBoard()
    }

    /**
     * Give a carried card its body, where the hand is.
     *
     * The copy follows the hand and the card it came from is left dimmed in its
     * place: what the gesture is choosing is which goal to file the conversation
     * under, and both ends of that choice have to stay visible until it is made.
     * @param {object} drag - the armed gesture.
     * @param {number} x - client x.
     * @param {number} y - client y.
     * @returns {void}
     */
    function beginSessionCarrier(drag, x, y) {
      var summary = null
      for (var i = 0; i < BOARD.rows.length; i++) {
        if (BOARD.rows[i].id === drag.key) summary = BOARD.rows[i]
      }
      if (!summary || !BOARD.stage) {
        // Nothing to carry means this paint and the gesture disagree; dropping
        // the gesture is cheaper than moving a card that is not on the page.
        BOARD.drag = null
        return
      }
      var point = canvasPointOf(x, y)
      var at = {
        x: Math.max(0, point.x - BOARD_FLOAT_W / 2),
        y: Math.max(0, point.y - 24),
      }
      var carrier = document.createElement('div')
      Object.assign(carrier.style, BOARD_UI.ghost)
      carrier.className = 'dshv-ghost'
      carrier.setAttribute('data-role', 'dragGhost')
      carrier.setAttribute('data-session-id', drag.key)
      carrier.style.left = at.x + 'px'
      carrier.style.top = at.y + 'px'
      carrier.style.width = BOARD_FLOAT_W + 'px'
      carrier.appendChild(buildBoardCard(summary, '', Object.create(null)))
      BOARD.stage.appendChild(carrier)
      // The copy is not a card of this paint: it must not answer the ties, or a
      // note would be drawn to the hand instead of to the conversation.
      if (BOARD.nodes.length && BOARD.nodes[BOARD.nodes.length - 1].parentNode === carrier) BOARD.nodes.pop()
      if (drag.origin) drag.origin.setAttribute('data-dragging', 'true')
      // The copy becomes the thing the hand holds, and the delta is measured
      // from here: the card must not jump by the distance it has already come.
      drag.node = carrier
      drag.baseX = at.x
      drag.baseY = at.y
      drag.fromX = x
      drag.fromY = y
    }



    /** Follow the pointer: pan the paper, or carry what the hand picked up. */
    function onBoardMove(ev) {
      var drag = BOARD.drag
      if (!drag) return
      var x = Number(ev.clientX) || 0
      var y = Number(ev.clientY) || 0
      if (!drag.moved) {
        if (Math.abs(x - drag.fromX) < BOARD_SLOP && Math.abs(y - drag.fromY) < BOARD_SLOP) return
        drag.moved = true
        // From here the page must not start selecting text under the pointer, and
        // the click that would have followed this press is not a click any more.
        if (typeof ev.preventDefault === 'function') ev.preventDefault()
        BOARD.dragged = true
        if (drag.kind === 'session') beginSessionGrab(drag, x, y)
        else if (drag.kind === 'inboxNote') beginNoteLift(drag, x, y)
        else if (drag.kind === 'note' && drag.stacked) beginStackedCarrier(drag, x, y)
        else if (drag.node) drag.node.style.cursor = 'grabbing'
        if (drag.kind === 'note') {
          paintStackDrop(null)
          paintHeadDrop(null)
        }
        // A note being carried is the one moment a card offers a place to hand it
        // over: the bands go up here and come down in `endBoardDrag`.
        if (drag.kind === 'note' || drag.kind === 'inboxNote') {
          showDropZones(true, boardNoteDone(drag.key))
        }
        if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = 'grabbing'
      }
      drag.lastX = x
      drag.lastY = y
      if (drag.kind === 'session' && drag.mode === 'reorder') {
        // A sort is the panel's own business: while the hand is close to it, the
        // columns make room and nothing else on the canvas moves.
        var reorderState = BOARD.reorder
        var seat = reorderState && reorderState.panel && typeof reorderState.panel.getBoundingClientRect === 'function'
          ? reorderState.panel.getBoundingClientRect()
          : null
        if (seat && !panelHolds(seat, x, y)) {
          leaveSessionReorder(x, y)
        } else {
          paintSessionReorder(x, y)
          // A sort can be carried onto the finished strip, and the strip says
          // so under the hand even though the columns keep following it.
          markDoneDrop(doneBarUnder(x, y))
          return
        }
      }

      if (drag.kind === 'pan') {
        if (!BOARD.body) return
        BOARD.body.scrollLeft = Math.max(0, drag.scrollLeft - (x - drag.fromX))
        BOARD.body.scrollTop = Math.max(0, drag.scrollTop - (y - drag.fromY))
        return
      }
      // A pointer travels screen pixels; the stage is scaled. One pixel of the
      // hand is one over `zoom` pixels of paper.
      var zoom = BOARD.zoom || 1
      var dx = (x - drag.fromX) / zoom
      var dy = (y - drag.fromY) / zoom
      drag.x = Math.max(0, drag.baseX + dx)
      drag.y = Math.max(0, drag.baseY + dy)
      if (!drag.node) return
      // The carried element must not answer the hit test under its own pointer:
      // what the reader is aiming at is what is beneath it.
      drag.node.style.pointerEvents = 'none'
      drag.node.style.left = drag.x + 'px'
      drag.node.style.top = drag.y + 'px'
      drag.node.style.zIndex = '30'
      drag.node.style.transform = 'scale(1.012)'
      // The notes tied to this goal's conversations travel with it: a goal is a
      // place, and the annotations around it belong to that place.
      var carry = drag.carry || []
      for (var c = 0; c < carry.length; c++) {
        var held = carry[c]
        held.nx = Math.max(0, held.x + dx)
        held.ny = Math.max(0, held.y + dy)
        if (held.node) {
          held.node.style.left = held.nx + 'px'
          held.node.style.top = held.ny + 'px'
        }
      }
      if (drag.kind === 'note' && typeof document.elementFromPoint === 'function') {
        // While the hand is over a column, the column says it will take the
        // card: one ring around the pile, and nothing else moves.
        var hovered = null
        var headLit = null
        try {
          var beneath = document.elementFromPoint(x, y)
          if (beneath && typeof beneath.closest === 'function') {
            var pile = beneath.closest('[data-role="cardStack"]')
            var columnHit = pile || beneath.closest('[data-column]')
            if (columnHit) {
              hovered = pile
              if (!hovered) {
                var inner = columnHit.querySelector && columnHit.querySelector('[data-role="cardStack"]')
                hovered = inner || columnHit
              }
            }
            // The goal's heading takes the card too, and says so before the drop
            // decides it: it is where a conversation gets started.
            headLit = beneath.closest('[data-role="blockHead"]')
          }
        } catch (error) {
          hovered = null
          headLit = null
        }
        paintStackDrop(hovered)
        paintHeadDrop(headLit)
      }
      if (drag.kind === 'session') {
        // The finished strip is the one place inside a goal that means
        // something other than the goal: it takes the card as finished work,
        // and says so under the hand before the fingers let go.
        markDoneDrop(doneBarUnder(x, y))
        markDropGoal(x, y)
      }
      // Live, not after the drop: a tie that only catches up when the hand lets
      // go reads as a rubber band drawn by someone else.
      drawCardLinks()
    }

    /** Let go: write down what the gesture decided, unless it never moved. */
    function onBoardUp() {
      var drag = BOARD.drag
      if (!drag) return
      var moved = drag.moved
      var kind = drag.kind
      var key = drag.key
      var x = drag.x
      var y = drag.y
      var fromStack = drag.fromStack || ''
      var reorderState = BOARD.reorder
      var stackedTarget = ''
      // Where it landed, read before the gesture is torn down: the carried
      // element is out of the hit test, so this is what is underneath it. A note
      // can land on two different things, and they mean different things: the way
      // in hands its words to that conversation, while the card around it only
      // ties the note to the work.
      var landedOn = ''
      var byEnter = false
      var newSessionGoal = ''
      if (moved && kind === 'note' && drag.lastX !== undefined
        && typeof document.elementFromPoint === 'function') {
        try {
          var under = document.elementFromPoint(drag.lastX, drag.lastY)
          if (under && typeof under.closest === 'function') {
            // The plus is a goal's door, and so is the row it stands in: a card
            // let go anywhere on the heading - the name included - starts the
            // same conversation the plus starts, with the card's own words.
            var newSession = under.closest('[data-role="goalNewSession"]')
            if (newSession) newSessionGoal = newSession.getAttribute('data-goal-key') || ''
            else newSessionGoal = goalHeadKeyUnder(under)
            byEnter = under.closest('[data-role="cardEnter"]') !== null
            var holder = under.closest('[data-session-id]')
            if (holder) landedOn = holder.getAttribute('data-session-id') || ''
            // A conversation's column is one target: the pile under the card,
            // or the card itself, both mean "file this thought under that
            // conversation". Where in the pile it lands is read from the height
            // the pointer let go at.
            var stackEl = under.closest('[data-role="cardStack"]')
            var columnEl = stackEl ? stackEl : under.closest('[data-column]')
            if (columnEl) {
              stackedTarget = stackEl
                ? stackEl.getAttribute('data-session') || ''
                : columnEl.getAttribute('data-column') || ''
            }
          }
        } catch (error) {
          landedOn = ''
          byEnter = false
          newSessionGoal = ''
        }
      }
      var overGoal = moved && drag.lastX !== undefined ? goalUnder(drag.lastX, drag.lastY) : ''
      endBoardDrag()
      // A settle made at a press owes the page a paint, and the end of the
      // gesture is where some of that debt may be paid: a pan's click answers
      // nothing (the paper is the one thing a paint never replaces), and a
      // press on a card the settle took away has no card left for its click
      // to open. Every other press leaves the debt to its own click, which
      // repaints when it opens what it aimed at.
      if (BOARD.paintOwed) {
        if (kind === 'pan') {
          renderBoard()
        } else if (!moved && kind === 'note') {
          var settleCards = BOARD_STORE.cards()
          var stillWritten = false
          for (var sc = 0; sc < settleCards.length; sc++) {
            if (settleCards[sc].id === key) { stillWritten = true; break }
          }
          if (!stillWritten) renderBoard()
        }
      }
      // A press that never moved is a click, and the click is still on its way:
      // the browser dispatches it to the element that was pressed, so repainting
      // here would replace that element and the click would land on nothing.
      if (!moved) return
      BOARD.dragged = true

      if (kind === 'pan') return
      if (kind === 'goal') {
        BOARD_STORE.placeBlock(key, x, y)
        renderBoard()
        return
      }
      if (kind === 'session') {
        var home = boardHomeOf(key)
        var wasDone = !!(home && home.done && home.done.some(function (row) {
          return row.id === key
        }))
        // The finished strip is a drop target of its own, and it outranks the
        // sort: a card let go on it is finished for the day, wherever it stood
        // a moment before. A card carried to another goal's strip is filed
        // there as well, so the strip never holds a conversation the goal no
        // longer carries.
        var doneTarget = drag.lastX === undefined ? null : doneBarUnder(drag.lastX, drag.lastY)
        if (doneTarget) {
          var barGoal = doneTarget.getAttribute('data-block') || ''
          if (barGoal) {
            if (!home || home.key !== barGoal) BOARD_STORE.placeSession(key, barGoal)
            sendToDone(key)
            showToast(paletteText('boardDoneMoved'))
            renderBoard()
            return
          }
        }
        // A card carried out of the strip is finished no longer, whether it was
        // let go on the work above, on another goal, or on the paper. This is
        // the other half of the mark: the reader can take the word back.
        if (wasDone) {
          bringBackFromDone(key)
          if (overGoal && home && overGoal !== home.key) {
            BOARD_STORE.placeSession(key, overGoal)
            showToast(paletteText('boardMoved'))
          } else {
            showToast(paletteText('boardDoneRestored'))
          }
          renderBoard()
          return
        }
        // A quiet line carried anywhere is a quiet line the reader has touched:
        // the strip's own rule asks for that touch, and the drag is it. The
        // wake is written before the move, so the card is a column in whichever
        // goal it lands in.
        if (drag.quiet) {
          BOARD_STORE.markSessionWoke(key)
          if (overGoal && home && overGoal !== home.key) {
            BOARD_STORE.placeSession(key, overGoal)
            showToast(paletteText('boardMoved'))
          }
          renderBoard()
          return
        }
        // A drag that never left its panel was a sort, not a move. A hand that
        // did leave is a move, and the order was never written while it was
        // inside: the columns have already gone back with the gesture.
        if (reorderState && reorderState.key) {
          var sortSeat = reorderState.panel && typeof reorderState.panel.getBoundingClientRect === 'function'
            ? reorderState.panel.getBoundingClientRect()
            : null
          if (!sortSeat || panelHolds(sortSeat,
            drag.lastX === undefined ? 0 : drag.lastX,
            drag.lastY === undefined ? 0 : drag.lastY)) {
            commitSessionReorder(reorderState)
            return
          }
        }
        // A conversation always belongs to a goal. Letting go over one files it
        // there; letting go on the paper gives it a goal of its own, cut from the
        // one it came from - a card standing alone is a goal with one card in it,
        // because a card with no goal is a place the canvas would have to invent.
        var target = overGoal
        if (!target) {
          // Except the last one. A goal that gives up its only conversation to
          // the paper has not moved anything: it has built a second goal of one
          // and emptied the first, which is the same arrangement with one more
          // panel on it. A conversation that wants a place of its own has to be
          // carried into another goal, where the move actually means something.
          if (home && home.rows.length <= 1) {
            showToast(paletteText('boardGoalLastCard'))
            renderBoard()
            return
          }
          var point = canvasPointOf(drag.lastX === undefined ? 0 : drag.lastX,
            drag.lastY === undefined ? 0 : drag.lastY)
          target = BOARD_STORE.addGoal(
            nextGoalName(home ? home.label : ''),
            Math.max(0, point.x - BOARD_FLOAT_W / 2),
            Math.max(0, point.y - 32)
          )
        }
        if (target && (!home || target !== home.key)) {
          BOARD_STORE.placeSession(key, target)
          showToast(paletteText('boardMoved'))
        }
        renderBoard()
        return
      }
      if (kind !== 'note') return
      // The plus's second gesture: a card let go on it starts the conversation
      // the card describes, with no sheet in between. The card is read before
      // the gesture is gone, because the board may be unmounted by the open.
      if (newSessionGoal) {
        var picked = null
        var written = BOARD_STORE.cards()
        for (var np = 0; np < written.length; np++) {
          if (written[np].id === key) picked = written[np]
        }
        var words = picked ? String(picked.text || '').trim() : ''
        if (!words) {
          renderBoard()
          return
        }
        var cardName = noteParts(words).title.trim()
        if (!cardName) cardName = words.slice(0, BOARD_GOAL_NAME_MAX)
        if (!startNewSessionForGoal(newSessionGoal, cardName, words, key) && BOARD.open) renderBoard()
        return
      }
      // Let go over the tray itself (not over a card in it): the note is put
      // away there, and drawn as a line of the tray from the next paint on.
      if (!landedOn && overGoal === BOARD_INBOX) {
        BOARD_STORE.fileCard(key, BOARD_INBOX)
        // A tray that is folded would swallow the card without a trace: the one
        // thing the reader must see is where it went.
        if (BOARD_STORE.isFolded(BOARD_INBOX)) BOARD_STORE.toggleBlockFold(BOARD_INBOX)
        renderBoard()
        showToast(paletteText('boardFiled'))
        return
      }
      // A thought let go into a conversation's column is filed there, at the
      // point in the pile the pointer chose. This is the whole of the tie now:
      // no line is drawn, because the card is drawn under the conversation.
      if (stackedTarget && !byEnter) {
        // The whole column is the target now: landing anywhere in it - the card,
        // the gap above the pile, the gap below it - files the thought under that
        // conversation, and the newest filing goes to the top of the pile.
        var sameFamily = stackedTarget === fromStack
        BOARD_STORE.linkCard(key, stackedTarget)
        renderBoard()
        if (!sameFamily) showToast(paletteText('boardCardFiledUnder'))
        return
      }
      if (landedOn) {
        var cards = BOARD_STORE.cards()
        var held = null
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].id === key) held = cards[i]
        }
        var text = held ? String(held.text || '').trim() : ''
        // A note that is already finished is not handed over again: the band it
        // was let go on says "file this card", and filing it is what happens - it
        // joins that conversation's own list of finished thoughts.
        if (byEnter && held && held.done) {
          BOARD_STORE.linkCard(key, landedOn)
          BOARD_STORE.fileCard(key, BOARD_DONE)
          BOARD.rowOpen = ''
          renderBoard()
          showToast(paletteText('boardDoneFiledOne'))
          return
        }
        if (byEnter) {
          // The button is the deliberate target: it means "take this into that
          // conversation", and it is specific enough not to need a question.
          // The place is measured before the conversation opens, because that
          // unmounts the board and there is nothing left to measure afterwards.
          if (text) {
            BOARD_STORE.linkCard(key, landedOn)
            handCardToSession(key, landedOn, text)
          } else {
            activateSession(landedOn)
          }
          return
        }
        // Anywhere else on the card is the gentler claim: the thought belongs
        // under this conversation, so it joins the bottom of its pile - nothing
        // opens, and nothing is sent.
        BOARD_STORE.linkCard(key, landedOn)
        renderBoard()
        return
      }
      // Let go on the paper: a card out of a pile goes back to being a free card
      // where the hand let go; a free card simply moves.
      if (fromStack) BOARD_STORE.unlinkCard(key)
      BOARD_STORE.moveCard(key, Math.max(0, x), Math.max(0, y))
      renderBoard()
    }

    /**
     * Hand one loose card's words to a conversation, and leave a trace behind.
     *
     * The paste opens the conversation and fills its box; the card is not
     * removed but marked done and tied to it, so coming back to the board shows
     * what was said and where it went. A card that found no box stays a plain
     * card and says so. Once the words have landed, the conversation takes the
     * card's title as its own name - see `nameSessionForCard`.
     * @param {string} cardId - the card.
     * @param {string} sessionId - the conversation it was dropped on.
     * @param {string} text - what the card says.
     * @returns {void}
     */
    function handCardToSession(cardId, sessionId, text) {
      dropCardIntoComposer(text, sessionId, function () {
        BOARD_STORE.finishCard(cardId, sessionId)
        nameSessionForCard(sessionId, text)
        if (BOARD.open) renderBoard()
      }, function () {
        if (BOARD.open) renderBoard()
        showToast(paletteText('boardDropFailed'))
      })
    }

    /**
     * Let the conversation a card was handed to wear the card's own name.
     *
     * The title is the first line of what the card says - the line its heading
     * shows, and the line the reader wrote for exactly this moment. The rename
     * takes the private-source hop every other rename here takes, so a name
     * handed over does not mark the conversation read. The words are already in
     * the composer by the time this runs: a hand-over that found no box names
     * nothing, because nothing was handed over. A refusal is said out loud
     * rather than swallowed, and the success says the name too, because the
     * board the gesture left behind is not on the screen to say it.
     * @param {string} sessionId - the conversation the card was handed to.
     * @param {string} text - what the card says, trimmed.
     * @returns {void}
     */
    function nameSessionForCard(sessionId, text) {
      // A locked title is the reader's own word: handing a thought over must not
      // rewrite a name chosen for reasons the board cannot see.
      if (BOARD_STORE.isSessionLocked(sessionId)) return
      var title = String(noteParts(text).title || '').trim()
      if (!title) return
      renameSession(sessionId, title, function (reason) {
        if (reason) {
          showToast(reason)
          return
        }
        showToast(paletteText('boardNamedFromCard') + title)
      })
    }

    /**
     * Draw the elbow from every branch back to the conversation it was cut from.
     *
     * Ties between a thought and its conversation are no longer drawn: the
     * thought is drawn under the conversation, which is the sentence a curve
     * used to spell. What is left is lineage, and lineage has one shape on this
     * canvas - up from the parent's top edge to a rail above the row, along the
     * rail, and down onto the child's top edge. The order already seats a branch
     * beside its parent; the elbow is what makes that seating read as a fact
     * rather than a coincidence.
     *
     * Measured after the paint, because a card's place is the panel's own
     * layout, which this plugin does not own.
     * @returns {void}
     */
    function drawCardLinks() {
      if (!BOARD.stage || typeof BOARD.stage.getBoundingClientRect !== 'function') return
      var svg = BOARD.linkLayer
      if (!svg || typeof document.createElementNS !== 'function') return
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      var zoom = BOARD.zoom || 1
      var stageRect = BOARD.stage.getBoundingClientRect()
      var byId = Object.create(null)
      for (var n = 0; n < BOARD.nodes.length; n++) {
        byId[BOARD.nodes[n].getAttribute('data-session-id') || ''] = BOARD.nodes[n]
      }
      var blocks = BOARD.blocks || []
      for (var b = 0; b < blocks.length; b++) {
        var rows = blocks[b].rows || []
        for (var r = 0; r < rows.length; r++) {
          var child = byId[rows[r].id]
          var parentId = BOARD_STORE.lineageOf(rows[r].id)
          var parent = parentId ? byId[parentId] : null
          if (!child || !parent || child === parent) continue
          var a = parent.getBoundingClientRect()
          var c = child.getBoundingClientRect()
          if (!a || !c || (!a.width && !a.height) || (!c.width && !c.height)) continue
          var x1 = (a.left + a.width / 2 - stageRect.left) / zoom
          var y1 = (a.top - stageRect.top) / zoom
          var x2 = (c.left + c.width / 2 - stageRect.left) / zoom
          var y2 = (c.top - stageRect.top) / zoom
          if (Math.abs(x1 - x2) < 1) continue
          // One rail per pair, above both tops: two branches of one parent read
          // as two brackets rather than as a stair.
          var rail = Math.min(y1, y2) - 14
          var path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', 'M' + x1 + ' ' + y1 + 'V' + rail + 'H' + x2 + 'V' + y2)
          path.setAttribute('fill', 'none')
          path.style.stroke = 'var(--dshv-board-fork, rgba(79, 124, 255, 0.45))'
          path.setAttribute('stroke-width', '1.6')
          path.setAttribute('stroke-linecap', 'round')
          path.setAttribute('stroke-linejoin', 'round')
          path.setAttribute('opacity', '0.55')
          path.setAttribute('data-role', 'forkLink')
          path.setAttribute('data-session-id', rows[r].id)
          svg.appendChild(path)
          for (var d = 0; d < 2; d++) {
            var bead = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            bead.setAttribute('cx', String(d ? x2 : x1))
            bead.setAttribute('cy', String(d ? y2 : y1))
            bead.setAttribute('r', '2.2')
            bead.style.fill = 'var(--dshv-board-fork, rgba(79, 124, 255, 0.45))'
            bead.setAttribute('opacity', '0.7')
            bead.setAttribute('data-role', 'forkLinkDot')
            svg.appendChild(bead)
          }
        }
      }
    }

    /** Drop the gesture and put back what it was carrying. */
    function cancelBoardDrag() {
      if (!BOARD.drag) return false
      var moved = BOARD.drag.moved
      endBoardDrag()
      BOARD.dragged = false
      if (moved) renderBoard()
      return true
    }

    /** Take the gesture's furniture off the page and forget it. */
    function endBoardDrag() {
      var drag = BOARD.drag
      if (!drag) return
      // A sort in flight leaves the columns where they were: the paint that
      // follows a committed order draws the new one from scratch.
      resetSessionReorder()
      window.removeEventListener('pointermove', onBoardMove, true)
      window.removeEventListener('pointerup', onBoardUp, true)
      window.removeEventListener('blur', onBoardBlurDrag)
      if (drag.node) {
        // The stacking number is not the gesture's: a card that was pressed is
        // the front card, and that is what the next paint reads. Only the lift is
        // undone here.
        drag.node.style.cursor = ''
        drag.node.style.pointerEvents = ''
        drag.node.style.transform = ''
      }
      if (drag.kind === 'pan' && BOARD.body) BOARD.body.style.cursor = ''
      if (BOARD.dropOn) showDropZones(false)
      paintHeadDrop(null)
      // The carrier was a copy of the card, made for the gesture: it leaves with
      // the gesture. The card it copied is redrawn by the repaint that follows.
      if (drag.kind === 'session' && drag.node && drag.node.parentNode) {
        drag.node.parentNode.removeChild(drag.node)
      }
      if (BOARD.dropGoal) {
        BOARD.dropGoal.setAttribute('data-drop', 'false')
        BOARD.dropGoal = null
      }
      if (BOARD.doneDrop) {
        BOARD.doneDrop.setAttribute('data-drop', 'false')
        BOARD.doneDrop = null
      }
      dropNoDropTip()
      BOARD.drag = null
    }

    /**
     * The window losing focus mid-gesture: the pointer left with it.
     *
     * The up that would have ended the gesture is never coming, so the
     * gesture ends here instead - the board answers the next press, and the
     * paint a press-time settle owed is paid now that no click can be on its
     * way.
     * @returns {void}
     */
    function onBoardBlurDrag() {
      if (!BOARD.drag) return
      endBoardDrag()
      if (BOARD.paintOwed && BOARD.open) renderBoard()
    }

    /**
     * A double click on the paper: write a card right there.
     *
     * This is the canvas gesture a canvas is for — pointing at an empty place is
     * how one says "put it here". A double click that arrived after a pan is
     * not one: the press moved the paper, it did not aim at a place.
     * @param {MouseEvent} ev - the double click.
     * @returns {void}
     */
    function onBoardDoubleClick(ev) {
      if (!BOARD.open || !BOARD.stage) return
      if (BOARD.dragged) {
        BOARD.dragged = false
        return
      }
      var target = ev && ev.target
      if (target && target !== BOARD.stage && target !== BOARD.body) return
      var rect = typeof BOARD.stage.getBoundingClientRect === 'function'
        ? BOARD.stage.getBoundingClientRect()
        : null
      var zoom = BOARD.zoom || 1
      var x = rect ? ((Number(ev.clientX) || 0) - rect.left) / zoom : BOARD_CANVAS_EDGE
      var y = rect ? ((Number(ev.clientY) || 0) - rect.top) / zoom : BOARD_CANVAS_EDGE
      addBoardCardAt(Math.max(0, x), Math.max(0, y), {
        clientX: Number(ev.clientX) || 0,
        clientY: Number(ev.clientY) || 0,
      })
    }

    /**
     * How long a closed goal can be brought back.
     *
     * Long enough to notice the panel is gone and reach for it, short enough
     * that the offer is not still standing over the next thing the reader does.
     */
    var BOARD_UNDO_MS = 5000

    /**
     * How long the board repeats a name the shell has not caught up with.
     *
     * A rename is a write to the host and a read of the list, and the two do not
     * land in the same frame. Long enough to cover a slow feed, short enough that
     * a name the shell never accepted falls back to the one it did.
     */
    var BOARD_TITLE_SETTLE_MS = 4000

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
