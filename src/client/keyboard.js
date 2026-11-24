/**
 * The capture-phase listeners: the key arbitration (windows first, then the
 * composer, then the scroll keys), the pointer and scroll input the windows
 * read, and the press that puts away whatever window it landed beside.
 * Everything it decides is delegated to the module that owns the surface.
 */
import { BOARD } from './board-state.js'
import { REWRITTEN_FLAG } from './constants.js'
import { showBoard, toggleBoard } from './app-actions.js'
import { cancelBoardDrag } from './board-gestures.js'
import { closeSeal } from './board-history.js'
import { closeBoard } from './board-mount.js'
import { openNote, pinToBoard } from './board-notes.js'
import { closeNewSessionSheet } from './board-sheet.js'
import { closeGoalMenu, closeIdeaFocus, closeIdeaMenu, closeSeatMenu, closeSessionMenu, closeVerdictMenu } from './board-view.js'
import { isEditable } from './dom.js'
import { cancelEntry } from './entry.js'
import { clearFocusRequest, composerIsEmpty, composerRoot, doubleEnter, doubleEnterSends, focusComposer, handBackAfterSend, inComposer, isActivating, leaveEmptyComposer, menuOpen, noteFocusReturn, noteFocusRequest, sendFromComposer, breakLine } from './focus.js'
import { MODELPICK, closeModelPick, confirmModelPick, modelPickKeyDown, openModelPick } from './model-picker.js'
import { cycleEffort } from './models.js'
import { repairKeys, settings } from './preferences.js'
import { anim, directionOf, hold, pickScroller, pointer, resolveTarget, startHold, state, stopAnim, stopHold } from './scroll.js'
import { currentSessionRunning } from './sessions.js'
import { PALETTE, closePalette, openPalette, paletteKeyDown } from './task-window.js'

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


export { onKeyDown, onKeyUp, onEscapeBlur, onPointerMove, forgetPointer, onUserScroll, onFocusLoss, onPointerDown, onContextMenu, dismissOutsidePress, pointInSelection }
