/**
 * Local days as the board and the task window count them: the day a moment
 * belongs to, how many days lie between two, and where today begins. Shared
 * because a page, a card and a count must agree on what 'today' is.
 */
import { DAY_MS } from './constants.js'

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


export { dayOf, daysBetween, startOfToday }
