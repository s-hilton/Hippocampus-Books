import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { deleteReview, saveReview } from '../lib/db'
import type { Review } from '../lib/types'
import { useTheme } from '../lib/theme'
import StarRating from './StarRating'
import { Text } from './Text'
import { Button, ErrorText, Input } from './ui'

const MAX_LENGTH = 10000

/**
 * Write or edit a review: stars (required) and optional text. Shown as a sheet over the
 * current screen. Calls onSaved / onDeleted with the result so the screen can update.
 */
export default function ReviewForm({
  visible,
  bookId,
  bookTitle,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  visible: boolean
  bookId: string
  bookTitle: string
  existing: Review | null
  onClose: () => void
  onSaved: (review: Review) => void
  onDeleted: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Remount the form each time it opens so it starts from the saved review. */}
      {visible && (
        <Form
          bookId={bookId}
          bookTitle={bookTitle}
          existing={existing}
          onClose={onClose}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </Modal>
  )
}

function Form({
  bookId,
  bookTitle,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: Omit<Parameters<typeof ReviewForm>[0], 'visible'>) {
  const t = useTheme()
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null)
  const [body, setBody] = useState(existing?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!rating) return setError('Choose a star rating.')
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveReview({ bookId, rating, body, existingId: existing?.id }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your review.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing) return
    setBusy(true)
    setError(null)
    try {
      await deleteReview(existing.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your review.')
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} aria-label="Close" />
      <View style={[styles.sheet, { backgroundColor: t.card, borderColor: t.border }]} role="dialog" aria-label="Review">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={[styles.heading, { color: t.text }]}>{existing ? 'Edit your review' : 'Leave a review'}</Text>
          <Text style={{ color: t.muted }} numberOfLines={2}>
            {bookTitle}
          </Text>

          <Text style={[styles.label, { color: t.text }]}>Your rating</Text>
          <StarRating value={rating} onChange={setRating} size={34} />

          <Text style={[styles.label, { color: t.text }]}>Your thoughts (optional)</Text>
          <Input
            value={body}
            onChangeText={setBody}
            placeholder="What did you think?"
            multiline
            maxLength={MAX_LENGTH}
            textAlignVertical="top"
            style={styles.body}
            aria-label="Review text"
          />

          {error && <ErrorText>{error}</ErrorText>}

          <View style={styles.actions}>
            {existing ? <Button variant="link" title="Delete review" onPress={remove} disabled={busy} /> : <View />}
            <View style={styles.right}>
              <Button variant="link" title="Cancel" onPress={onClose} disabled={busy} />
              <Button title={busy ? 'Saving…' : 'Save review'} onPress={save} disabled={busy || !rating} />
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', alignSelf: 'center', borderRadius: 12, borderWidth: 1 },
  content: { padding: 20, gap: 6 },
  heading: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '600', marginTop: 14 },
  body: { minHeight: 140, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  right: { flexDirection: 'row', gap: 8, alignItems: 'center' },
})
