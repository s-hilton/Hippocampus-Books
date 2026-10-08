import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Tag } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Text } from './Text'
import { Input } from './ui'
import { searchTags } from '../lib/tags'

/**
 * Pick any number of tags from a long list: type to search, tap a result to add it,
 * tap a chosen chip to remove it.
 */
export default function TagPicker({
  label,
  noun,
  tags,
  selected,
  onChange,
}: {
  label: string
  noun: string // e.g. "tropes"
  tags: Tag[] | null // null while loading
  selected: string[] // slugs
  onChange: (slugs: string[]) => void
}) {
  const t = useTheme()
  const [query, setQuery] = useState('')
  const bySlug = useMemo(() => new Map((tags ?? []).map((tag) => [tag.slug, tag])), [tags])
  const results = useMemo(
    () => searchTags(tags ?? [], query, new Set(selected)),
    [tags, query, selected],
  )

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>

      {selected.length > 0 && (
        <View style={styles.chips} aria-label={`Chosen ${noun}`}>
          {selected.map((slug) => (
            <Pressable
              key={slug}
              role="button"
              aria-label={`Remove ${bySlug.get(slug)?.name ?? slug}`}
              onPress={() => onChange(selected.filter((s) => s !== slug))}
              style={[styles.chip, { backgroundColor: t.accent, borderColor: t.accent }]}
            >
              <Text style={{ color: t.accentText, fontSize: 13 }}>{bySlug.get(slug)?.name ?? slug} ✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={tags ? `Search ${tags.length.toLocaleString()} ${noun}` : `Loading ${noun}…`}
        editable={tags !== null}
        autoCorrect={false}
        aria-label={`Search ${noun}`}
      />

      {query.trim() !== '' && (
        <View style={[styles.results, { borderColor: t.border }]}>
          {results.length === 0 ? (
            <Text style={[styles.empty, { color: t.muted }]}>No matching {noun}.</Text>
          ) : (
            results.map((tag) => (
              <Pressable
                key={tag.slug}
                role="button"
                aria-label={`Add ${tag.name}`}
                onPress={() => {
                  onChange([...selected, tag.slug])
                  setQuery('')
                }}
                style={({ pressed }) => [styles.result, { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={{ color: t.text }}>{tag.name}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{tag.category}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 14 },
  label: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  results: { borderWidth: 1, borderRadius: 8, maxHeight: 240, overflow: 'hidden' },
  result: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: 12 },
})
