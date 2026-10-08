import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'
import { Text } from './Text'
import { formatDateTime, formatShortDate } from '../lib/dates'
import type { ProgressPoint, Read } from '../lib/types'
import { fontFamily, useTheme } from '../lib/theme'

const HEIGHT = 180
const PAD = { top: 10, right: 14, bottom: 24, left: 40 }
const HOUR_MS = 60 * 60 * 1000

interface Point {
  time: number
  page: number
  label: string // e.g. "Started", or the logged time
}

/**
 * How far through the book a read got over time: percent of the book when the page
 * count is known, otherwise pages. Tap (or hover) a point to read its value; the
 * read page lists every point as text too.
 */
export default function ProgressChart({ read, progress }: { read: Read; progress: ProgressPoint[] }) {
  const t = useTheme()
  const [width, setWidth] = useState(0)
  const [now] = useState(() => Date.now()) // a read in progress runs to when the chart was opened

  const points: Point[] = []
  if (read.started_at) points.push({ time: Date.parse(read.started_at), page: 0, label: 'Started' })
  for (const p of progress) points.push({ time: Date.parse(p.logged_at), page: p.page, label: formatDateTime(p.logged_at) })
  points.sort((a, b) => a.time - b.time)

  const [selected, setSelected] = useState<number>(points.length - 1)

  if (progress.length === 0) {
    return <Text style={{ color: t.muted }}>No progress was logged for this read.</Text>
  }

  // Scales. Percent when we know the length, otherwise pages up to a round number.
  const total = read.page_count
  const value = (page: number) => (total ? Math.min(100, (page / total) * 100) : page)
  const maxPage = Math.max(...points.map((p) => p.page), 1)
  const yMax = total ? 100 : niceCeil(maxPage)
  const yTicks = [0, yMax / 2, yMax]
  const yLabel = (v: number) => (total ? `${Math.round(v)}%` : Math.round(v).toLocaleString())

  const end = read.finished_at ? Date.parse(read.finished_at) : now
  let x0 = Math.min(points[0].time, end)
  let x1 = Math.max(points[points.length - 1].time, end)
  if (x1 - x0 < HOUR_MS) {
    x0 -= HOUR_MS / 2
    x1 += HOUR_MS / 2
  }

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (time: number) => PAD.left + ((time - x0) / (x1 - x0)) * plotW
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH

  const xy = points.map((p) => [x(p.time), y(value(p.page))] as const)
  const line = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${y(0)} L${xy[0][0].toFixed(1)},${y(0)} Z`

  const current = points[Math.min(selected, points.length - 1)]
  const readout = `${current.label} · page ${current.page.toLocaleString()}${total ? ` (${Math.round(value(current.page))}%)` : ''}`

  const last = points[points.length - 1]
  const summary = `Reading progress chart: ${points.length} points from ${formatShortDate(points[0].time)} to ${formatShortDate(
    last.time,
  )}, reaching page ${last.page}${total ? ` of ${total}` : ''}.`

  const axisText = { fill: t.muted, fontSize: 11, fontFamily: Platform.OS === 'web' ? fontFamily : undefined }

  return (
    <View style={styles.wrap}>
      <Text style={{ color: t.text, fontSize: 13 }} aria-live="polite">
        {readout}
      </Text>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} role="img" aria-label={summary} style={{ height: HEIGHT }}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {yTicks.map((v) => (
              <Line key={v} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={t.border} strokeWidth={1} />
            ))}
            {yTicks.map((v) => (
              <SvgText key={`l${v}`} x={PAD.left - 6} y={y(v) + 4} textAnchor="end" {...axisText}>
                {yLabel(v)}
              </SvgText>
            ))}
            <SvgText x={PAD.left} y={HEIGHT - 6} textAnchor="start" {...axisText}>
              {formatShortDate(x0)}
            </SvgText>
            <SvgText x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" {...axisText}>
              {read.finished_at ? formatShortDate(x1) : 'Now'}
            </SvgText>

            <Path d={area} fill={t.accent} fillOpacity={0.1} />
            <Path d={line} stroke={t.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />

            {xy.map(([px, py], i) => (
              <Circle
                key={i}
                cx={px}
                cy={py}
                r={i === selected ? 6 : 4}
                fill={t.accent}
                stroke={t.bg}
                strokeWidth={2}
              />
            ))}
            {/* Larger invisible hit targets, drawn last so they're on top. */}
            {xy.map(([px, py], i) => (
              <Circle
                key={`hit${i}`}
                cx={px}
                cy={py}
                r={14}
                fill="transparent"
                onPress={() => setSelected(i)}
                onPressIn={() => setSelected(i)}
              />
            ))}
          </Svg>
        )}
      </View>
    </View>
  )
}

/** Round up to 1, 2 or 5 × a power of ten, for a clean axis maximum. */
function niceCeil(n: number): number {
  const power = 10 ** Math.floor(Math.log10(n))
  const step = [1, 2, 5, 10].find((s) => s * power >= n) ?? 10
  return step * power
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
})
