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

import { apply } from './activation.js'

const name = 'dsh-vim'
const inject = ['slots', 'locale']

export { name, inject, apply }
