import { Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../lib/theme'
import StarRating from './StarRating'
import { Text } from './Text'

/** A saved review's stars with a muted "Edit review" beside them; tapping either opens the review. */
export default function ReviewStars({ rating, onEdit }: { rating: number; onEdit: () => void }) {
  const t = useTheme()
  return (
    <Pressable
      role="button"
      aria-label={`Rated ${rating} out of 5. Edit your review`}
      onPress={onEdit}
      hitSlop={6}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <StarRating value={rating} />
      <Text style={[styles.edit, { color: t.muted }]} aria-hidden>
        Edit review
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  edit: { fontSize: 14, marginTop: 6 }, // marginTop matches StarRating's, so the text lines up with the stars
})
