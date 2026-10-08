import { StyleSheet, View } from 'react-native'
import type { TagCount } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Text } from './Text'

/** Tags readers added to a book, each with how many readers added it. */
export default function CommunityTags({ tags, empty }: { tags: TagCount[] | null; empty: string }) {
  const t = useTheme()
  if (tags === null) return <Text style={{ color: t.muted }}>Loading…</Text>
  if (tags.length === 0) return <Text style={{ color: t.muted }}>{empty}</Text>
  return (
    <View style={styles.chips} role="list">
      {tags.map((tag) => (
        <View
          key={tag.slug}
          role="listitem"
          aria-label={`${tag.name}, added by ${tag.readers} ${tag.readers === 1 ? 'reader' : 'readers'}`}
          style={[styles.chip, { borderColor: t.border }]}
        >
          <Text style={{ color: t.text, fontSize: 13 }}>{tag.name}</Text>
          <Text style={[styles.count, { color: t.accentText, backgroundColor: t.accent }]}>{tag.readers}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
  },
  count: { fontSize: 12, fontWeight: '700', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
})
