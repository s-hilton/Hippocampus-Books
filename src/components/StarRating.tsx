import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import StarIcon from './StarIcon'
import { useTheme } from '../lib/theme'

/**
 * Five stars. With `onChange` the user can pick a rating; without it the stars just show
 * one (e.g. a saved review).
 */
export default function StarRating({
  value,
  onChange,
  size = 24,
  style,
}: {
  value: number | null
  onChange?: (rating: number) => void
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const star = (n: number) => <StarIcon size={size} color={value !== null && n <= value ? t.star : t.border} />

  if (!onChange) {
    return (
      <View style={[styles.row, style]} role="img" aria-label={value ? `Rated ${value} out of 5` : 'Not rated'}>
        {[1, 2, 3, 4, 5].map((n) => (
          <View key={n} aria-hidden>
            {star(n)}
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={[styles.row, style]} role="radiogroup" aria-label="Rating">
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
})
