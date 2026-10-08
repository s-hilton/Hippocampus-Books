import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { bookRouteId, getSeries, type SeriesPageData } from '../../lib/db'
import { STATUS_LABELS } from '../../lib/types'
import { useTheme } from '../../lib/theme'
import BookCover from '../../components/BookCover'
import { ErrorText, Loading } from '../../components/ui'

export default function SeriesScreen() {
  const t = useTheme()
  const { name, author } = useLocalSearchParams<{ name: string; author: string }>()
  const [data, setData] = useState<SeriesPageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reload on focus so pile statuses stay current after visiting a book.
  useFocusEffect(
    useCallback(() => {
      getSeries(name, author)
        .then((d) => {
          setData(d)
          setError(null)
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this series.'))
    }, [name, author]),
  )

  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: name }} />
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.books ?? []}
          keyExtractor={(b) => b.open_library_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            data?.books.length ? (
              <Text style={[styles.count, { color: t.muted }]}>
                {data.books.length} book{data.books.length === 1 ? '' : 's'}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            data ? <Text style={{ color: t.muted }}>No other books in this series were found.</Text> : null
          }
          ListFooterComponent={
            data?.books.length ? (
              <Text style={[styles.note, { color: t.muted }]}>
                Series lists come from Open Library and may be incomplete.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const status = data?.statuses.get(item.open_library_id)
            return (
              <Pressable
                role="link"
                aria-label={`${item.title}${item.number ? `, book ${item.number}` : ''}`}
                onPress={() => router.push(`/book/${bookRouteId({ open_library_id: item.open_library_id })}`)}
                style={[styles.row, { borderBottomColor: t.border }]}
              >
                <Text style={[styles.number, { color: t.accent }]}>{item.number ? `#${item.number}` : '–'}</Text>
                <BookCover uri={item.cover_url} />
                <View style={styles.info}>
                  <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.first_published && <Text style={{ color: t.muted }}>{item.first_published}</Text>}
                  {status && (
                    <Text style={[styles.status, { color: t.accent }]}>{`On your pile · ${STATUS_LABELS[status]}`}</Text>
                  )}
                </View>
              </Pressable>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' },
  count: { marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  number: { width: 36, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  status: { fontSize: 13, fontWeight: '600' },
  note: { marginTop: 16, fontSize: 13, textAlign: 'center' },
})
