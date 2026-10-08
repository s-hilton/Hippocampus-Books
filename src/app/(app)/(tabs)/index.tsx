import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { addBookToPile, getPileKeys, isInPile, mergeSearchResults, searchCatalog, searchOpenLibrary } from '../../../lib/db'
import { openBook, warmBook } from '../../../lib/navigation'
import type { CatalogBook } from '../../../lib/types'
import { useTheme } from '../../../lib/theme'
import BookCover from '../../../components/BookCover'
import ManualAddForm from '../../../components/ManualAddForm'
import { Button, ErrorText, Input, Screen } from '../../../components/ui'

const resultKey = (b: CatalogBook) => b.id ?? b.open_library_id ?? b.isbn_13 ?? b.title

// Search as you type: wait for a short pause so we don't search on every keystroke.
// Our own catalog is cheap, so it goes first; Open Library waits a little longer (and
// needs 3+ characters) to stay well inside its rate limits. Pressing Search skips the wait.
const CATALOG_DELAY_MS = 250
const OPEN_LIBRARY_DELAY_MS = 700
const MIN_CHARS = 2
const MIN_CHARS_OPEN_LIBRARY_AUTO = 3

export default function SearchScreen() {
  const t = useTheme()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogBook[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pileKeys, setPileKeys] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshPileKeys = useCallback(() => {
    getPileKeys().then(setPileKeys).catch(() => {})
  }, [])
  useFocusEffect(refreshPileKeys)

  const [searchingRemote, setSearchingRemote] = useState(false)
  // The current search. Late responses from older searches are ignored by comparing ids.
  const current = useRef({ id: 0, q: '', local: [] as CatalogBook[], remote: null as CatalogBook[] | null })

  function startSearch(q: string): number {
    current.current = { id: current.current.id + 1, q, local: [], remote: null }
    setError(null)
    setNotice(null)
    return current.current.id
  }

  function searchOurCatalog(id: number) {
    const s = current.current
    if (s.id !== id) return
    setSearching(true)
    searchCatalog(s.q)
      .then((r) => {
        if (current.current.id !== id) return
        s.local = r
        setResults(mergeSearchResults(s.local, s.remote ?? []))
        setSearched(true)
      })
      .catch(() => {}) // Open Library results can still arrive
      .finally(() => current.current.id === id && setSearching(false))
  }

  function searchOpenLibraryFor(id: number) {
    const s = current.current
    if (s.id !== id) return
    setSearchingRemote(true)
    searchOpenLibrary(s.q)
      .then((r) => {
        if (current.current.id !== id) return
        s.remote = r
        setResults(mergeSearchResults(s.local, r))
        setSearched(true)
      })
      .catch((err) => {
        if (current.current.id === id) setError(err instanceof Error ? err.message : 'Search failed.')
      })
      .finally(() => current.current.id === id && setSearchingRemote(false))
  }

  // Typing: search after a short pause. Earlier results stay on screen until new ones arrive.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, []) // stop pending searches when leaving the screen

  function onChangeQuery(text: string) {
    setQuery(text)
    clearTimers()
    const q = text.trim()
    if (q.length < MIN_CHARS) {
      startSearch('') // cancels anything in flight
      setSearching(false)
      setSearchingRemote(false)
      if (q.length === 0) {
        setResults([])
        setSearched(false)
      }
      return
    }
    if (q === current.current.q) return // only whitespace changed
    const id = startSearch(q)
    timers.current.push(setTimeout(() => searchOurCatalog(id), CATALOG_DELAY_MS))
    if (q.length >= MIN_CHARS_OPEN_LIBRARY_AUTO) {
      timers.current.push(setTimeout(() => searchOpenLibraryFor(id), OPEN_LIBRARY_DELAY_MS))
    }
  }

  // Pressing Search (or Enter): search immediately, skipping the pause.
  function runSearch() {
    const q = query.trim()
    if (q.length < MIN_CHARS) return
    clearTimers()
    const id = startSearch(q)
    searchOurCatalog(id)
    searchOpenLibraryFor(id)
  }

  async function add(book: CatalogBook) {
    const key = resultKey(book)
    setAdding(key)
    setError(null)
    try {
      const bookId = await addBookToPile(book)
      setPileKeys((prev) => new Set(prev).add(bookId).add(key))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add book.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <Screen>
      <View style={styles.searchRow}>
        <Input
          style={styles.flex}
          placeholder="Search by title, author, or ISBN"
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Button title={searching || (searchingRemote && results.length === 0) ? '…' : 'Search'} onPress={runSearch} />
      </View>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && <Text style={[styles.notice, { color: t.muted }]}>{notice}</Text>}

      {showManual ? (
        <ManualAddForm
          onCancel={() => setShowManual(false)}
          onAdded={(title) => {
            setShowManual(false)
            setNotice(`Added “${title}” to your pile.`)
            refreshPileKeys()
          }}
        />
      ) : (
        <Button variant="link" title="Can't find it? Add a book manually" onPress={() => setShowManual(true)} />
      )}

      <FlatList
        data={results}
        keyExtractor={resultKey}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          searched && !searching && !searchingRemote ? (
            <Text style={{ color: t.muted, marginTop: 16 }}>No results.</Text>
          ) : null
        }
        ListFooterComponent={
          searchingRemote && results.length > 0 ? (
            <View style={styles.more}>
              <ActivityIndicator color={t.accent} size="small" />
              <Text style={{ color: t.muted }}>Finding more books…</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const key = resultKey(item)
          const added = isInPile(item, pileKeys) || pileKeys.has(key)
          return (
            <View style={[styles.row, { borderBottomColor: t.border }]}>
              <Pressable
                role="link"
                aria-label={`${item.title}, open details`}
                style={styles.open}
                onPressIn={() => warmBook(item)}
                onPress={() => openBook(item)}
              >
                <BookCover uri={item.cover_url} />
                <View style={styles.info}>
                  <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={{ color: t.muted }} numberOfLines={1}>
                    {item.authors.join(', ') || 'Unknown author'}
                    {item.published_date ? ` · ${item.published_date}` : ''}
                  </Text>
                </View>
              </Pressable>
              <Button
                variant={added ? 'link' : 'secondary'}
                title={added ? 'In pile ✓' : adding === key ? 'Adding…' : 'Add'}
                onPress={() => add(item)}
                disabled={added || adding === key}
              />
            </View>
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  flex: { flex: 1 },
  notice: { marginVertical: 6 },
  more: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  open: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
})
