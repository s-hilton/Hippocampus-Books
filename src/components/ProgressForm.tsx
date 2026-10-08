import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { logProgress } from '../lib/db'
import type { Read } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Text } from './Text'
import { Button, ErrorText, Input } from './ui'

/**
 * Update the page a read is on. The page count is editable because editions differ.
 * "I finished it" hands off to the screen, which marks the book Read.
 */
export default function ProgressForm({
  visible,
  read,
  bookTitle,
  onClose,
  onSaved,
  onFinished,
}: {
  visible: boolean
  read: Read | null
  bookTitle: string
  onClose: () => void
  onSaved: (read: Read) => void
  onFinished: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Remount each time it opens so it starts from the saved page. */}
      {visible && read && (
        <Form read={read} bookTitle={bookTitle} onClose={onClose} onSaved={onSaved} onFinished={onFinished} />
      )}
    </Modal>
  )
}

function Form({
  read,
  bookTitle,
  onClose,
  onSaved,
  onFinished,
}: {
  read: Read
  bookTitle: string
  onClose: () => void
  onSaved: (read: Read) => void
  onFinished: () => void
}) {
  const t = useTheme()
  const [page, setPage] = useState(read.current_page ? String(read.current_page) : '')
  const [total, setTotal] = useState(read.page_count ? String(read.page_count) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const p = Number.parseInt(page, 10)
    const n = total.trim() ? Number.parseInt(total, 10) : null
    if (!Number.isFinite(p) || p < 0) return setError('Enter the page you’re on.')
    if (n !== null && (!Number.isFinite(n) || n <= 0)) return setError('Enter how many pages the book has, or leave it blank.')
    if (n !== null && p > n) return setError(`That’s past the last page (${n}).`)
    setBusy(true)
    setError(null)
    try {
      onSaved(await logProgress(read.id, p, n))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save your progress.')
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} aria-label="Close" />
      <View style={[styles.sheet, { backgroundColor: t.card, borderColor: t.border }]} role="dialog" aria-label="Update progress">
        <Text style={[styles.heading, { color: t.text }]}>Update progress</Text>
        <Text style={{ color: t.muted }} numberOfLines={2}>
          {bookTitle}
        </Text>
        <View style={styles.fields}>
          <View style={styles.field}>
            <Text style={{ color: t.muted }}>Page</Text>
            <Input
              value={page}
              onChangeText={setPage}
              keyboardType="number-pad"
              inputMode="numeric"
              aria-label="Page you're on"
              autoFocus
              onSubmitEditing={save}
            />
          </View>
          <View style={styles.field}>
            <Text style={{ color: t.muted }}>of</Text>
            <Input
              value={total}
              onChangeText={setTotal}
              keyboardType="number-pad"
              inputMode="numeric"
              aria-label="Pages in your edition"
              placeholder="pages"
              onSubmitEditing={save}
            />
          </View>
        </View>
        {error && <ErrorText>{error}</ErrorText>}
        <View style={styles.actions}>
          <Button variant="link" title="Cancel" onPress={onClose} />
          <Button variant="secondary" title="I finished it" onPress={onFinished} disabled={busy} />
          <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 12, borderWidth: 1, padding: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700' },
  fields: { flexDirection: 'row', gap: 12, marginTop: 4 },
  field: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8 },
})
