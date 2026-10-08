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

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-08" in the reader's time zone, for date fields. */
export function toDateInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "21:05" in the reader's time zone, for time fields. */
export function toTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Parse a date field ("2026-10-08") and optional time field ("9:05", "21:05"; blank =
 * noon) in the reader's time zone. Returns an ISO timestamp, or null if either is invalid.
 */
export function parseDateTime(date: string, time: string): string | null {
  const dm = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(date)
  if (!dm) return null
  const tm = time.trim() ? /^\s*(\d{1,2}):(\d{2})\s*$/.exec(time) : ['', '12', '00']
  if (!tm) return null
  const [y, mo, d, h, mi] = [dm[1], dm[2], dm[3], tm[1], tm[2]].map(Number)
  if (h > 23 || mi > 59) return null
  const result = new Date(y, mo - 1, d, h, mi)
  // Reject dates that roll over, like Feb 30.
  if (result.getFullYear() !== y || result.getMonth() !== mo - 1 || result.getDate() !== d) return null
  return result.toISOString()
}
