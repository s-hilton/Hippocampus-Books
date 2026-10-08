import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../../../components/Text'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { deleteRead, getRead, markBookRead } from '../../../lib/db'
import { openBook, warmBook } from '../../../lib/navigation'
import { daysSpanned, formatDateTime, plural } from '../../../lib/dates'
import { READ_STATUS_LABELS, type Read, type ReadDetail } from '../../../lib/types'
import { useTheme, type Theme } from '../../../lib/theme'
import BookCover from '../../../components/BookCover'
import DatesForm from '../../../components/DatesForm'
import ProgressBar, { pointLabel } from '../../../components/ProgressBar'
import ProgressChart from '../../../components/ProgressChart'
import ProgressForm from '../../../components/ProgressForm'
import { Button, ErrorText, Loading } from '../../../components/ui'

/** One read of a book: when it started and stopped, and a chart of progress through it. */
export default function ReadScreen() {
  const t = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [read, setRead] = useState<ReadDetail | null | undefined>(undefined) // undefined = loading, null = not found
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editingDates, setEditingDates] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getRead(id)
      .then((r) => {
        setRead(r)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this read.'))
  }, [id])

  useFocusEffect(load)

  if (read === undefined) {
    return error ? (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <ErrorText>{error}</ErrorText>
        <View style={styles.left}>
          <Button variant="secondary" title="Try again" onPress={load} />
        </View>
      </View>
    ) : (
      <Loading />
    )
  }
  if (read === null) {
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <ErrorText>This read was not found. It may have been deleted.</ErrorText>
      </View>
    )
  }

  const title = read.total > 1 ? `Read ${read.number} of ${read.total}` : 'Your read'
  const stoppedLabel = read.status === 'dnf' ? 'Stopped' : 'Finished'
  const days = read.started_at ? daysSpanned(read.started_at, read.finished_at ?? new Date().toISOString()) : null
  const inPages = read.progress_unit === 'pages'
  const pagesRead = inPages ? (read.current_page ?? 0) : 0
  const perDay = days && pagesRead > 0 ? Math.round(pagesRead / days) : null

  async function finish() {
    if (!read) return
    setUpdating(false)
    setBusy(true)
    try {
      await markBookRead(read.book.id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark the book read.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!read) return
    setBusy(true)
    try {
      await deleteRead(read.id)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this read.')
      setBusy(false)
    }
  }

  function saved(next: Read) {
    setUpdating(false)
    if (read) setRead({ ...read, ...next })
    load() // pick up the new point for the chart
  }

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title }} />

      <Pressable
        role="link"
        aria-label={`Open ${read.book.title}`}
        onPressIn={() => warmBook(read.book)}
        onPress={() => openBook(read.book)}
        style={styles.header}
      >
        <BookCover uri={read.book.cover_url} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
            {read.book.title}
          </Text>
          <Text style={{ color: t.muted }} numberOfLines={1}>
            {read.book.authors.join(', ') || 'Unknown author'}
          </Text>
          <Text style={[styles.status, { color: t.accent }]}>{READ_STATUS_LABELS[read.status]}</Text>
        </View>
      </Pressable>

      {error && <ErrorText>{error}</ErrorText>}

      <Section title="Dates" t={t}>
        <Fact label="Started" value={read.started_at ? formatDateTime(read.started_at) : 'Not recorded'} t={t} />
        <Fact
          label={stoppedLabel}
          value={read.finished_at ? formatDateTime(read.finished_at) : 'Still reading'}
          t={t}
        />
        {days !== null && (
          <Fact label={read.finished_at ? 'Took' : 'So far'} value={plural(days, 'day')} t={t} />
        )}
        {inPages && !!read.page_count && read.status !== 'reading' && (
          <Fact
            label="Pages"
            value={
              read.status === 'dnf' && read.current_page
                ? `${read.current_page.toLocaleString()} of ${read.page_count.toLocaleString()}`
                : read.page_count.toLocaleString()
            }
            t={t}
          />
        )}
        {!inPages && read.status === 'dnf' && read.current_page !== null && (
          <Fact label="Got to" value={`${read.current_page}%`} t={t} />
        )}
        {perDay !== null && <Fact label="Average" value={`${plural(perDay, 'page')} a day`} t={t} />}
        <View style={styles.left}>
          <Button variant="link" title="Edit dates" onPress={() => setEditingDates(true)} />
        </View>
      </Section>

      {read.status === 'reading' && (
        <Section title="Where you are" t={t}>
          <ProgressBar read={read} />
          <View style={styles.left}>
            <Button variant="secondary" title="Update progress" onPress={() => setUpdating(true)} disabled={busy} />
          </View>
        </Section>
      )}

      <Section title="Progress" t={t}>
        <ProgressChart key={read.progress.length} read={read} progress={read.progress} />
      </Section>

      {read.progress.length > 0 && (
        <Section title="Progress log" t={t}>
          {[...read.progress].reverse().map((p) => (
            <View key={p.id} style={[styles.logRow, { borderBottomColor: t.border }]}>
              <Text style={{ color: t.muted, flex: 1 }}>{formatDateTime(p.logged_at)}</Text>
              <Text style={{ color: t.text }}>{pointLabel(read, p.page)}</Text>
            </View>
          ))}
        </Section>
      )}

      {read.status !== 'reading' && (
        <View style={[styles.left, styles.delete]}>
          {confirmDelete ? (
            <View style={styles.confirm}>
              <Text style={{ color: t.text }}>Delete this read and its progress log?</Text>
              <View style={styles.row}>
                <Button title={busy ? 'Deleting…' : 'Delete'} onPress={remove} disabled={busy} />
                <Button variant="link" title="Cancel" onPress={() => setConfirmDelete(false)} />
              </View>
            </View>
          ) : (
            <Button variant="link" title="Delete this read" onPress={() => setConfirmDelete(true)} />
          )}
        </View>
      )}

      <DatesForm
        visible={editingDates}
        read={read}
        onClose={() => setEditingDates(false)}
        onSaved={(dates) => {
          setEditingDates(false)
          setRead({ ...read, ...dates })
        }}
      />
      <ProgressForm
        visible={updating}
        read={read}
        bookTitle={read.book.title}
        onClose={() => setUpdating(false)}
        onSaved={saved}
        onFinished={finish}
      />
    </ScrollView>
  )
}

function Section({ title, t, children }: { title: string; t: Theme; children: ReactNode }) {
  return (
    <View style={[styles.section, { borderTopColor: t.border }]}>
      <Text style={[styles.sectionTitle, { color: t.copper }]}>{title}</Text>
      {children}
    </View>
  )
}

function Fact({ label, value, t }: { label: string; value: string; t: Theme }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: t.muted }]}>{label}</Text>
      <Text style={{ color: t.text, flex: 1 }}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  status: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 14, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 72 },
  left: { alignItems: 'flex-start' },
  logRow: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  delete: { marginTop: 24 },
  confirm: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
