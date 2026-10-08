import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Tag, TagKind } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Text } from './Text'
import { Input } from './ui'
import { cleanTagName, findTag, isValidTagName, searchTags, slugifyTag } from '../lib/tags'

export const READER_CATEGORY = 'Added by readers'

/**
 * Pick any number of tags from a long list: type to search, tap a result to add it, tap a
 * chosen chip to remove it. What you type can also be added as its own tag; if it matches
 * an existing tag (e.g. "enemies-to-lovers"), that existing tag is used instead.
 */
export default function TagPicker({
  label,
  kind,
  noun,
  tags,
  selected,
  onChange,
}: {
  label: string
  kind: TagKind
  noun: string // e.g. "tropes"
  tags: Tag[] | null // null while loading
  selected: Tag[]
  onChange: (tags: Tag[]) => void
}) {
  const t = useTheme()
  const [query, setQuery] = useState('')
  const selectedSlugs = useMemo(() => new Set(selected.map((tag) => tag.slug)), [selected])
  const results = useMemo(() => searchTags(tags ?? [], query, selectedSlugs), [tags, query, selectedSlugs])

  const typed = cleanTagName(query)
  const existing = tags ? findTag(tags, typed) : undefined
  const alreadyChosen = selectedSlugs.has(existing?.slug ?? slugifyTag(typed))
  // Offer the typed text as a new tag only when it isn't an existing (or chosen) one.
  const canAddTyped = tags !== null && typed !== '' && !existing && !alreadyChosen && isValidTagName(typed)

  function add(tag: Tag) {
    if (!selectedSlugs.has(tag.slug)) onChange([...selected, tag])
    setQuery('')
  }

  function addTyped() {
    if (!tags) return
    const match = findTag(tags, typed) // acts as the existing tag if it is one
    add(match ?? { kind, slug: slugifyTag(typed), name: typed, category: READER_CATEGORY, isNew: true })
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>

      {selected.length > 0 && (
        <View style={styles.chips} aria-label={`Chosen ${noun}`}>
          {selected.map((tag) => (
            <Pressable
              key={tag.slug}
              role="button"
              aria-label={`Remove ${tag.name}`}
              onPress={() => onChange(selected.filter((s) => s.slug !== tag.slug))}
              style={[styles.chip, { backgroundColor: t.accent, borderColor: t.accent }]}
            >
              <Text style={{ color: t.accentText, fontSize: 13 }}>
                {tag.name}
                {tag.isNew ? ' (new)' : ''} ✕
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Input
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => (results[0] && results[0].slug === slugifyTag(typed) ? add(results[0]) : canAddTyped && addTyped())}
        placeholder={tags ? `Search or add ${noun}` : `Loading ${noun}…`}
        editable={tags !== null}
        autoCorrect={false}
        aria-label={`Search ${noun}`}
      />

      {typed !== '' && (
        <View style={[styles.results, { borderColor: t.border }]}>
          {results.map((tag) => (
            <Pressable
              key={tag.slug}
              role="button"
              aria-label={`Add ${tag.name}`}
              onPress={() => add(tag)}
              style={({ pressed }) => [styles.result, { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ color: t.text }}>{tag.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{tag.category}</Text>
            </Pressable>
          ))}
          {canAddTyped && (
            <Pressable
              role="button"
              aria-label={`Add “${typed}” as a new ${noun.replace(/s$/, '')}`}
              onPress={addTyped}
              style={({ pressed }) => [styles.result, styles.addRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ color: t.accent, fontWeight: '600' }}>+ Add “{typed}”</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>New {noun.replace(/s$/, '')} · {READER_CATEGORY}</Text>
            </Pressable>
          )}
          {results.length === 0 && !canAddTyped && (
            <Text style={[styles.empty, { color: t.muted }]}>
              {alreadyChosen
                ? 'Already added.'
                : !isValidTagName(typed)
                  ? 'Tags need 2–40 characters, including letters or numbers.'
                  : `No matching ${noun}.`}
            </Text>
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
  results: { borderWidth: 1, borderRadius: 8, maxHeight: 280, overflow: 'hidden' },
  result: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  addRow: { borderBottomWidth: 0 },
  empty: { padding: 12 },
})
