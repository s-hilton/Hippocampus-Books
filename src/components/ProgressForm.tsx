import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { logProgress } from '../lib/db'
import type { Read } from '../lib/types'
import { useTheme } from '../lib/theme'
import Chip from './Chip'
import { progressPercent } from './ProgressBar'
import { Text } from './Text'
import { Button, ErrorText, Input } from './ui'

/**
 * Update how far a read is, by page or by percent. The page count is editable because
 * editions differ. Percent is saved as a page when the page count is known, otherwise
 * the read is tracked in percent. "I finished it" hands off to the screen, which marks
 * the book Read.
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
  const [mode, setMode] = useState<'pages' | 'percent'>(read.progress_unit)
  const [page, setPage] = useState(read.progress_unit === 'pages' && read.current_page ? String(read.current_page) : '')
  const [percent, setPercent] = useState(() => {
    const p = progressPercent(read)
    return p ? String(p) : ''
  })
  const [total, setTotal] = useState(read.page_count ? String(read.page_count) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = total.trim() ? Number.parseInt(total, 10) : null
  const validTotal = n !== null && Number.isFinite(n) && n > 0 ? n : null

  async function save() {
    if (n !== null && !validTotal) return setError('Enter how many pages the book has, or leave it blank.')
    let progress: Parameters<typeof logProgress>[1]
    if (mode === 'pages') {
      const p = Number.parseInt(page, 10)
      if (!Number.isFinite(p) || p < 0) return setError('Enter the page you’re on.')
      if (validTotal !== null && p > validTotal) return setError(`That’s past the last page (${validTotal}).`)
      if (read.progress_unit === 'percent' && validTotal === null) {
        return setError('Enter how many pages your edition has to track this read in pages.')
      }
      progress = { unit: 'pages', page: p, pageCount: validTotal }
    } else {
      const pct = Number.parseFloat(percent)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return setError('Enter a percent from 0 to 100.')
      progress =
        validTotal !== null
          ? { unit: 'pages', page: Math.round((pct / 100) * validTotal), pageCount: validTotal }
          : { unit: 'percent', percent: Math.round(pct) }
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await logProgress(read.id, progress))
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
        <View style={styles.modes} role="radiogroup" aria-label="Track by">
          <Chip label="Page" active={mode === 'pages'} onPress={() => setMode('pages')} />
          <Chip label="Percent" active={mode === 'percent'} onPress={() => setMode('percent')} />
        </View>
        <View style={styles.fields}>
          {mode === 'pages' ? (
            <View style={styles.field}>
              <Text style={{ color: t.muted }}>Page</Text>
              <Input
                key="page"
                value={page}
                onChangeText={setPage}
                keyboardType="number-pad"
                inputMode="numeric"
                aria-label="Page you're on"
                autoFocus
                onSubmitEditing={save}
              />
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={{ color: t.muted }}>Percent</Text>
              <Input
                key="percent"
                value={percent}
                onChangeText={setPercent}
                keyboardType="decimal-pad"
                inputMode="decimal"
                aria-label="Percent read"
                placeholder="%"
                autoFocus
                onSubmitEditing={save}
              />
            </View>
          )}
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
        {mode === 'percent' && (
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {validTotal
              ? 'Saved as the matching page of your edition.'
              : 'No page count: this read will be tracked in percent.'}
          </Text>
        )}
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
  modes: { flexDirection: 'row', gap: 6, marginTop: 4 },
  fields: { flexDirection: 'row', gap: 12, marginTop: 4 },
  field: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8 },
})
