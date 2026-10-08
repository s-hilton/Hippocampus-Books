import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../lib/theme'

export default function StarRating({
  value,
  onChange,
}: {
  value: number | null
  onChange: (rating: number | null) => void
}) {
  const t = useTheme()
  return (
    <View style={styles.row} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          hitSlop={4}
          // Tapping the current rating again clears it.
          onPress={() => onChange(value === n ? null : n)}
        >
          <Text style={[styles.star, { color: value !== null && n <= value ? t.star : t.border }]}>★</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginTop: 6 },
  star: { fontSize: 24 },
})
