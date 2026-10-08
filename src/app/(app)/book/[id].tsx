import { useCallback, useState, type ReactNode } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import {
  addBookToPile,
  getBookDetails,
  getBookLocal,
  peekBookDetails,
  peekBookLocal,
  removeFromShelf,
  setBookLocal,
  updateShelfEntry,
  workKeyFromRouteId,
} from '../../../lib/db'
import { getPreview } from '../../../lib/memory'
import {
  STATUSES,
  STATUS_LABELS,
  type BookDetails,
  type BookLocalData,
  type CatalogBook,
  type Edition,
  type ReadingStatus,
} from '../../../lib/types'
import { useTheme, type Theme } from '../../../lib/theme'
import BookCover from '../../../components/BookCover'
import Chip from '../../../components/Chip'
import ExpandableText from '../../../components/ExpandableText'
import StarRating from '../../../components/StarRating'
import { Button, ErrorText, Loading } from '../../../components/ui'

const EDITIONS_PREVIEW = 5

export default function BookScreen() {
  const t = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const routeWorkKey = workKeyFromRouteId(id)
  // Draw immediately from whatever we already know (list row, earlier visit), then fill in.
  const preview = getPreview(id)
  const [localData, setLocalData] = useState<BookLocalData | undefined>(() => peekBookLocal(id))
  const [details, setDetails] = useState<BookDetails | null | undefined>(() => {
    const key = routeWorkKey ?? peekBookLocal(id)?.local?.open_library_id
    return key ? peekBookDetails(key) : undefined
  }) // undefined = still loading, null = none available
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAllEditions, setShowAllEditions] = useState(false)

  const loadDetails = useCallback((workKey: string) => {
    getBookDetails(workKey)
      .then((d) => {
        setDetails(d)
        setDetailsError(null)
      })
      .catch(() => {
        setDetails((prev) => prev ?? null)
        setDetailsError('Couldn’t load full details from Open Library.')
      })
  }, [])

  const load = useCallback(() => {
    // Open Library ids can be fetched right away, in parallel with our own database.
    if (routeWorkKey) loadDetails(routeWorkKey)
    getBookLocal(id, { refresh: true })
      .then((d) => {
        setLocalData(d)
        setError(null)
        if (!routeWorkKey) {
          if (d.local?.open_library_id) loadDetails(d.local.open_library_id)
          else setDetails(null)
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this book.'))
  }, [id, routeWorkKey, loadDetails])

  useFocusEffect(load)

  const local = localData?.local ?? null
  const entry = localData?.entry ?? null

  if (!details && !local && !preview) {
    if (error) {
      return (
        <View style={[styles.page, { backgroundColor: t.bg }]}>
          <ErrorText>{error}</ErrorText>
        </View>
      )
    }
    if (localData === undefined || details === undefined) return <Loading />
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <ErrorText>{detailsError ?? 'Book not found.'}</ErrorText>
      </View>
    )
  }

  const title = details?.title ?? local?.title ?? preview?.title ?? ''
  const subtitle = details?.subtitle ?? local?.subtitle ?? null
  const authors = details?.authors.length
    ? details.authors.map((a) => a.name)
    : local?.authors.length
      ? local.authors
      : (preview?.authors ?? [])
  const description = details?.description ?? local?.description ?? null
  const firstPublished = details?.first_published ?? local?.published_date ?? null
  const pageCount = details?.page_count ?? local?.page_count ?? null
  const coverUrl = details?.cover_url ?? local?.cover_url ?? preview?.cover_url ?? null
  const series = details?.series ?? null
  const seriesAuthorKey = details?.authors[0]?.key ?? ''
  const editions = details?.editions ?? []
  const firstIsbnEdition = editions.find((e) => e.isbn_13 || e.isbn_10)
  // An ISBN identifies one edition: prefer the copy in our catalog, else the newest edition that has one.
  const isbnFromLocal = Boolean(local?.isbn_13 || local?.isbn_10)
  const isbnSource = isbnFromLocal ? local : firstIsbnEdition
  const isbnText = [
    isbnSource?.isbn_13 && `ISBN-13 ${isbnSource.isbn_13}`,
    isbnSource?.isbn_10 && `ISBN-10 ${isbnSource.isbn_10}`,
  ]
    .filter(Boolean)
    .join(' · ')

  function updateLocal(next: BookLocalData) {
    setLocalData(next)
    setBookLocal(id, next) // keep the in-memory copy right for the next visit
  }

  async function add() {
    setBusy(true)
    const book: CatalogBook = local ?? {
      open_library_id: details?.open_library_id ?? routeWorkKey ?? preview?.open_library_id ?? null,
      title,
      subtitle,
      authors,
      cover_url: coverUrl,
      published_date: firstPublished,
      page_count: pageCount,
      isbn_13: firstIsbnEdition?.isbn_13 ?? null,
      isbn_10: firstIsbnEdition?.isbn_10 ?? null,
    }
    try {
      await addBookToPile(book)
      updateLocal(await getBookLocal(id, { refresh: true }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add book.')
    } finally {
      setBusy(false)
    }
  }

  async function change(changes: { status?: ReadingStatus; rating?: number | null }) {
    if (!entry || !localData) return
    const applied = { ...changes }
    if (changes.status && changes.status !== 'read') applied.rating = null // mirrors the database trigger
    const previous = localData
    updateLocal({ ...localData, entry: { ...entry, ...applied } })
    try {
      await updateShelfEntry(entry.id, changes)
    } catch (err) {
      updateLocal(previous)
      setError(err instanceof Error ? err.message : 'Could not save change.')
    }
  }

  async function remove() {
    if (!entry || !localData) return
    const previous = localData
    updateLocal({ ...localData, entry: null })
    try {
      await removeFromShelf(entry.id)
    } catch (err) {
      updateLocal(previous)
      setError(err instanceof Error ? err.message : 'Could not remove book.')
    }
  }

  const facts = [
    firstPublished && `First published ${firstPublished}`,
    pageCount && `${pageCount} pages`,
    details && details.edition_count > 0 && `${details.edition_count} edition${details.edition_count === 1 ? '' : 's'}`,
  ].filter(Boolean)

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title }} />

      <View style={styles.header}>
        <BookCover uri={coverUrl} size="large" />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text>}
          <Text style={[styles.authors, { color: t.text }]}>{authors.join(', ') || 'Unknown author'}</Text>
          {series && (
            <Pressable
              role="link"
              aria-label={`See all books in ${series.name}`}
              disabled={!seriesAuthorKey}
              onPress={() =>
                router.push({ pathname: '/series', params: { name: series.name, author: seriesAuthorKey } })
              }
            >
              <Text style={[styles.series, { color: t.accent }]}>
                {series.number ? `Book ${series.number} in ${series.name}` : `Part of ${series.name}`}
                {seriesAuthorKey ? ' ›' : ''}
              </Text>
            </Pressable>
          )}
          {facts.map((f) => (
            <Text key={String(f)} style={{ color: t.muted }}>
              {f}
            </Text>
          ))}
          {!!isbnText && (
            <Text selectable style={{ color: t.muted }}>
              {isbnText}
              {!isbnFromLocal && editions.length > 1 ? ' (newest edition)' : ''}
            </Text>
          )}
        </View>
      </View>

      {error && <ErrorText>{error}</ErrorText>}

      <Section title="Your pile" t={t}>
        {entry ? (
          <>
            <View style={styles.chips}>
              {STATUSES.map((s) => (
                <Chip key={s} label={STATUS_LABELS[s]} active={entry.status === s} onPress={() => change({ status: s })} />
              ))}
            </View>
            {entry.status === 'read' && <StarRating value={entry.rating} onChange={(rating) => change({ rating })} />}
            <View style={styles.left}>
              <Button variant="link" title="Remove from pile" onPress={remove} />
            </View>
          </>
        ) : localData === undefined ? (
          <Text style={{ color: t.muted }}>Loading…</Text>
        ) : (
          <View style={styles.left}>
            <Button title={busy ? 'Adding…' : 'Add to pile'} onPress={add} disabled={busy} />
          </View>
        )}
      </Section>

      <Section title="Description" t={t}>
        {description ? (
          <ExpandableText text={description} />
        ) : (
          <Text style={{ color: t.muted }}>{details === undefined ? 'Loading…' : 'No description available.'}</Text>
        )}
      </Section>

      {details && details.subjects.length > 0 && (
        <Section title="Subjects" t={t}>
          <View style={styles.chips}>
            {details.subjects.map((s) => (
              <View key={s} style={[styles.tag, { borderColor: t.border }]}>
                <Text style={{ color: t.muted, fontSize: 13 }}>{s}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      {details?.authors.some((a) => a.bio || a.birth_date) && (
        <Section title={details.authors.length > 1 ? 'About the authors' : 'About the author'} t={t}>
          {details.authors.map((a) => (
            <View key={a.key} style={styles.author}>
              <Text style={[styles.authorName, { color: t.text }]}>
                {a.name}
                {a.birth_date && (
                  <Text style={{ color: t.muted, fontWeight: '400' }}>
                    {` (${a.birth_date}${a.death_date ? ` – ${a.death_date}` : ''})`}
                  </Text>
                )}
              </Text>
              {a.bio && <ExpandableText text={a.bio} lines={4} />}
            </View>
          ))}
        </Section>
      )}

      {editions.length > 0 && (
        <Section title={`Editions (${details!.edition_count})`} t={t}>
          {(showAllEditions ? editions : editions.slice(0, EDITIONS_PREVIEW)).map((e) => (
            <EditionRow key={e.key} edition={e} t={t} />
          ))}
          {editions.length > EDITIONS_PREVIEW && (
            <View style={styles.left}>
              <Button
                variant="link"
                title={showAllEditions ? 'Show fewer editions' : `Show ${editions.length - EDITIONS_PREVIEW} more`}
                onPress={() => setShowAllEditions(!showAllEditions)}
              />
            </View>
          )}
          {showAllEditions && details!.edition_count > editions.length && (
            <Text style={{ color: t.muted }}>
              Showing the {editions.length} most recent of {details!.edition_count} editions.
            </Text>
          )}
        </Section>
      )}

      {local?.source === 'user' && <Text style={{ color: t.muted, marginTop: 8 }}>Added manually by a reader.</Text>}

      {detailsError && <Text style={{ color: t.muted, marginTop: 8 }}>{detailsError}</Text>}

      {details && (
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(`https://openlibrary.org${details.open_library_id}`)}
          style={styles.source}
        >
          <Text style={{ color: t.muted, fontSize: 13 }}>
            Book information from <Text style={{ color: t.accent }}>Open Library</Text>
          </Text>
        </Pressable>
      )}
    </ScrollView>
  )
}

function Section({ title, t, children }: { title: string; t: Theme; children: ReactNode }) {
  return (
    <View style={[styles.section, { borderTopColor: t.border }]}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
      {children}
    </View>
  )
}

function EditionRow({ edition: e, t }: { edition: Edition; t: Theme }) {
  const line1 = [e.publisher, e.publish_date].filter(Boolean).join(' · ')
  const line2 = [e.format, e.page_count && `${e.page_count} pages`, e.language].filter(Boolean).join(' · ')
  const isbn = e.isbn_13 ?? e.isbn_10
  return (
    <View style={[styles.edition, { borderBottomColor: t.border }]}>
      <BookCover uri={e.cover_url} />
      <View style={styles.editionText}>
        <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={2}>
          {e.title}
        </Text>
        {!!line1 && <Text style={{ color: t.muted }}>{line1}</Text>}
        {!!line2 && <Text style={{ color: t.muted }}>{line2}</Text>}
        {isbn && (
          <Text selectable style={{ color: t.muted, fontSize: 12 }}>
            ISBN {isbn}
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 15 },
  authors: { fontSize: 16, marginTop: 2 },
  series: { fontSize: 15, fontWeight: '600' },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 14, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  left: { alignItems: 'flex-start' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  author: { gap: 4, marginBottom: 8 },
  authorName: { fontSize: 15, fontWeight: '600' },
  edition: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  editionText: { flex: 1, gap: 2 },
  source: { marginTop: 24, alignItems: 'center' },
})
