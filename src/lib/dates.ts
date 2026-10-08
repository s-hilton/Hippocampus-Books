// Formatting for reading dates. Everything is shown in the reader's own time zone.

const DAY_MS = 24 * 60 * 60 * 1000

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Short date for chart axes: "Oct 3". */
export function formatShortDate(iso: string | number): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Calendar days a read spanned, counting both the first and last day ("1 day" for same-day reads). */
export function daysSpanned(startIso: string, endIso: string): number {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(1, Math.round((endDay - startDay) / DAY_MS) + 1)
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}
