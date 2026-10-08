import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { Text } from '../../../components/Text'
import { useFocusEffect } from 'expo-router'
import { getShelf, removeFromShelf, updateShelfEntry } from '../../../lib/db'
import { openBook, warmBook } from '../../../lib/navigation'
import { STATUSES, STATUS_LABELS, type ReadingStatus, type Review, type ShelfEntry } from '../../../lib/types'
import { useTheme } from '../../../lib/theme'
import BookCover from '../../../components/BookCover'
import Chip from '../../../components/Chip'
import ReviewForm from '../../../components/ReviewForm'
import StarRating from '../../../components/StarRating'
import { Button, ErrorText, Loading, Screen } from '../../../components/ui'

type Filter = 'all' | ReadingStatus

export default function PileScreen() {
  const t = useTheme()
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<ShelfEntry | null>(null) // book whose review form is open

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
    } catch (err) {
      setEntries(previous)
      setError(err instanceof Error ? err.message : 'Could not save change.')
    }
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
              <View style={styles.statusRow}>
                {STATUSES.map((s) => (
                  <Chip key={s} label={STATUS_LABELS[s]} active={item.status === s} onPress={() => setStatus(item, s)} />
                ))}
              </View>
              {item.status === 'read' &&
                (item.review ? (
                  <Pressable
                    role="button"
                    aria-label={`Rated ${item.review.rating} out of 5. Edit your review`}
                    onPress={() => setReviewing(item)}
                  >
                    <StarRating value={item.review.rating} />
                  </Pressable>
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
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reviewButton: { alignItems: 'flex-start', marginTop: 8 },
})
