import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import type { Read } from '../lib/types'
import { useTheme } from '../lib/theme'

type ReadProgress = Pick<Read, 'current_page' | 'page_count' | 'progress_unit'>

/** "Page 120 of 384 · 31%", "45%" (percent reads) or "Not started". */
export function progressLabel(read: ReadProgress): string {
  const page = read.current_page
  if (read.progress_unit === 'percent') return page ? `${page}%` : 'Not started'
  if (!page) return read.page_count ? `Not started · ${read.page_count} pages` : 'Not started'
  if (!read.page_count) return `Page ${page}`
  return `Page ${page} of ${read.page_count} · ${progressPercent(read)}%`
}

/** How far through the book, 0-100, or null when it can't be known (pages without a page count). */
export function progressPercent(read: ReadProgress): number | null {
  if (read.progress_unit === 'percent') return Math.min(100, read.current_page ?? 0)
  if (!read.page_count) return null
  return Math.min(100, Math.round(((read.current_page ?? 0) / read.page_count) * 100))
}

/** One logged point as text: "Page 120 · 31%" or "45%". */
export function pointLabel(read: ReadProgress, page: number): string {
  if (read.progress_unit === 'percent') return `${page}%`
  const percent = read.page_count ? ` · ${Math.min(100, Math.round((page / read.page_count) * 100))}%` : ''
  return `Page ${page.toLocaleString()}${percent}`
}

/** A thin bar showing how far through the book a read is. Hidden when that can't be known. */
export default function ProgressBar({ read }: { read: ReadProgress }) {
  const t = useTheme()
  const percent = progressPercent(read)
  return (
    <View style={styles.wrap}>
      {percent !== null && (
        <View
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          style={[styles.track, { backgroundColor: t.border }]}
        >
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: t.accent }]} />
        </View>
      )}
      <Text style={{ color: t.muted, fontSize: 13 }}>{progressLabel(read)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
})
