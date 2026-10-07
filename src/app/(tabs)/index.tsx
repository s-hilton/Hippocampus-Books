import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { addBookToPile, getPileKeys, isInPile, searchBooks } from '../../lib/db'
import type { CatalogBook } from '../../lib/types'
import { useTheme } from '../../lib/theme'
import BookCover from '../../components/BookCover'
import ManualAddForm from '../../components/ManualAddForm'
import { Button, ErrorText, Input, Screen } from '../../components/ui'

const resultKey = (b: CatalogBook) => b.id ?? b.open_library_id ?? b.isbn_13 ?? b.title

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

  async function runSearch() {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    setError(null)
    setNotice(null)
    try {
      setResults(await searchBooks(q))
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setSearching(false)
    }
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
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Button title={searching ? '…' : 'Search'} onPress={runSearch} disabled={searching} />
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
          searched && !searching ? <Text style={{ color: t.muted, marginTop: 16 }}>No results.</Text> : null
        }
        renderItem={({ item }) => {
          const key = resultKey(item)
          const added = isInPile(item, pileKeys) || pileKeys.has(key)
          return (
            <View style={[styles.row, { borderBottomColor: t.border }]}>
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
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
})
