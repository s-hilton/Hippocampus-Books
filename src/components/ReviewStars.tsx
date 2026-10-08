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
      <StarRating value={rating} style={styles.stars} />
      <Text style={[styles.edit, { color: t.muted }]} aria-hidden>
        Edit review
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Stars and text are centred on the same line; the spacing above sits on the row, not
  // on either child, so it can't push one of them out of line.
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', marginTop: 6 },
  stars: { marginTop: 0 },
  // The text box reserves room below the line for letters like "g" and "y"; "Edit review" has
  // none, so its letters sit ~1px high. A 2px top margin moves its centre down by 1px.
  edit: { fontSize: 14, lineHeight: 18, marginTop: 2 },
})
