import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { Text } from '../../../components/Text'
import { useFocusEffect } from 'expo-router'
import { getShelf, removeFromShelf, startReread, updateShelfEntry } from '../../../lib/db'
import { openBook, warmBook } from '../../../lib/navigation'
import { STATUSES, STATUS_LABELS, type Read, type ReadingStatus, type Review, type ShelfEntry } from '../../../lib/types'
import { useTheme } from '../../../lib/theme'
import BookCover from '../../../components/BookCover'
import Chip from '../../../components/Chip'
import ProgressBar from '../../../components/ProgressBar'
import ProgressForm from '../../../components/ProgressForm'
import ReviewForm from '../../../components/ReviewForm'
import ReviewStars from '../../../components/ReviewStars'
import StatusPicker from '../../../components/StatusPicker'
import { Button, ErrorText, Loading, Screen } from '../../../components/ui'

type Filter = 'all' | ReadingStatus

export default function PileScreen() {
  const t = useTheme()
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<ShelfEntry | null>(null) // book whose review form is open
  const [updating, setUpdating] = useState<ShelfEntry | null>(null) // book whose progress form is open

  const load = useCallback(async () => {
    try {
      setEntries(await getShelf())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your pile.')
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // Optimistically apply a status change, rolling back if the database rejects it.
  async function setStatus(entry: ShelfEntry, status: ReadingStatus) {
    const previous = entries
    setEntries((prev) => prev?.map((e) => (e.id === entry.id ? { ...e, status } : e)) ?? null)
    try {
      await updateShelfEntry(entry.id, { status })
      await load() // the database started or closed a read
    } catch (err) {
      setEntries(previous)
      setError(err instanceof Error ? err.message : 'Could not save change.')
    }
  }

  async function reread(entry: ShelfEntry) {
    try {
      await startReread(entry.book.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a reread.')
    }
  }

  function setProgress(read: Read) {
    setEntries((prev) => prev?.map((e) => (e.currentRead?.id === read.id ? { ...e, currentRead: read } : e)) ?? null)
    setUpdating(null)
  }

  function finished() {
    const entry = updating
    setUpdating(null)
    if (entry) setStatus(entry, 'read')
  }

  function setReview(bookId: string, review: Review | null) {
    setEntries((prev) => prev?.map((e) => (e.book.id === bookId ? { ...e, review } : e)) ?? null)
    setReviewing(null)
  }

  async function remove(entry: ShelfEntry) {
    const previous = entries
    setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null)
    try {
      await removeFromShelf(entry.id)
    } catch (err) {
      setEntries(previous)
      setError(err instanceof Error ? err.message : 'Could not remove book.')
    }
  }

  if (!entries && !error) return <Loading />

  const visible = (entries ?? []).filter((e) => filter === 'all' || e.status === filter)

  return (
    <Screen>
      <View style={styles.filters}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        {STATUSES.map((s) => (
          <Chip key={s} label={STATUS_LABELS[s]} active={filter === s} onPress={() => setFilter(s)} />
        ))}
      </View>

      {error && <ErrorText>{error}</ErrorText>}

      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await load()
              setRefreshing(false)
            }}
          />
        }
        ListEmptyComponent={
          <Text style={{ color: t.muted, marginTop: 16 }}>
            {entries?.length ? 'Nothing here yet.' : 'Your pile is empty. Search for a book to add one.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: t.border }]}>
            <Pressable aria-hidden onPressIn={() => warmBook(item.book)} onPress={() => openBook(item.book)}>
              <BookCover uri={item.book.cover_url} />
            </Pressable>
            <View style={styles.info}>
              <Pressable role="link" onPressIn={() => warmBook(item.book)} onPress={() => openBook(item.book)}>
                <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
                  {item.book.title}
                </Text>
                <Text style={{ color: t.muted }} numberOfLines={1}>
                  {item.book.authors.join(', ') || 'Unknown author'}
                </Text>
              </Pressable>
              {item.timesRead > 1 && (
                <Text style={{ color: t.muted, fontSize: 13 }}>{`Read ${item.timesRead} times`}</Text>
              )}
              <View style={styles.statusRow}>
                <StatusPicker
                  status={item.status}
                  onChange={(s) => setStatus(item, s)}
                  onReread={() => reread(item)}
                />
              </View>
              {item.status === 'reading' && item.currentRead && (
                <View style={styles.progress}>
                  <ProgressBar read={item.currentRead} />
                  <View style={styles.left}>
                    <Button variant="secondary" title="Update progress" onPress={() => setUpdating(item)} />
                  </View>
                </View>
              )}
              {item.status === 'read' &&
                (item.review ? (
                  <ReviewStars rating={item.review.rating} onEdit={() => setReviewing(item)} />
                ) : (
                  <View style={styles.reviewButton}>
                    <Button variant="secondary" title="Leave a review" onPress={() => setReviewing(item)} />
                  </View>
                ))}
            </View>
            <Button variant="link" title="Remove" onPress={() => remove(item)} />
          </View>
        )}
      />

      <ReviewForm
        visible={reviewing !== null}
        bookId={reviewing?.book.id ?? ''}
        bookTitle={reviewing?.book.title ?? ''}
        existing={reviewing?.review ?? null}
        onClose={() => setReviewing(null)}
        onSaved={(review) => reviewing && setReview(reviewing.book.id, review)}
        onDeleted={() => reviewing && setReview(reviewing.book.id, null)}
      />

      <ProgressForm
        visible={updating !== null}
        read={updating?.currentRead ?? null}
        bookTitle={updating?.book.title ?? ''}
        onClose={() => setUpdating(null)}
        onSaved={setProgress}
        onFinished={finished}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  statusRow: { marginTop: 6 },
  progress: { gap: 6, marginTop: 8 },
  left: { alignItems: 'flex-start' },
  reviewButton: { alignItems: 'flex-start', marginTop: 8 },
})
