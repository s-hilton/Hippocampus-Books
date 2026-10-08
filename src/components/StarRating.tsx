import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { useTheme } from '../lib/theme'

/**
 * Five stars. With `onChange` the user can pick a rating; without it the stars just show
 * one (e.g. a saved review).
 */
export default function StarRating({
  value,
  onChange,
  size = 24,
}: {
  value: number | null
  onChange?: (rating: number) => void
  size?: number
}) {
  const t = useTheme()
  const star = (n: number) => (
    <Text style={[styles.star, { fontSize: size, color: value !== null && n <= value ? t.star : t.border }]}>★</Text>
  )

  if (!onChange) {
    return (
      <View style={styles.row} role="img" aria-label={value ? `Rated ${value} out of 5` : 'Not rated'}>
        {[1, 2, 3, 4, 5].map((n) => (
          <View key={n} aria-hidden>
            {star(n)}
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.row} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          hitSlop={4}
          onPress={() => onChange(n)}
        >
          {star(n)}
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginTop: 6 },
  star: {},
})
