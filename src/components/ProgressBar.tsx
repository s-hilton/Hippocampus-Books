import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import type { Read } from '../lib/types'
import { useTheme } from '../lib/theme'

/** "Page 120 of 384 · 31%" (or "Not started"), for a read in progress. */
export function progressLabel(read: Pick<Read, 'current_page' | 'page_count'>): string {
  const page = read.current_page
  if (!page) return read.page_count ? `Not started · ${read.page_count} pages` : 'Not started'
  if (!read.page_count) return `Page ${page}`
  return `Page ${page} of ${read.page_count} · ${progressPercent(read)}%`
}

export function progressPercent(read: Pick<Read, 'current_page' | 'page_count'>): number | null {
  if (!read.page_count) return null
  return Math.min(100, Math.round(((read.current_page ?? 0) / read.page_count) * 100))
}

/** A thin bar showing how far through the book a read is. Hidden when the page count is unknown. */
export default function ProgressBar({ read }: { read: Pick<Read, 'current_page' | 'page_count'> }) {
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
