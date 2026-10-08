import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { addManualBook } from '../lib/db'
import { useTheme } from '../lib/theme'
import { Button, ErrorText, Input } from './ui'

export default function ManualAddForm({ onAdded, onCancel }: { onAdded: (title: string) => void; onCancel: () => void }) {
  const t = useTheme()
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [isbn, setIsbn] = useState('')
  const [pages, setPages] = useState('')
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const isbnDigits = isbn.replace(/[^0-9Xx]/g, '')
    if (!title.trim()) return setError('Title is required.')
    if (isbnDigits && isbnDigits.length !== 10 && isbnDigits.length !== 13) {
      return setError('ISBN should be 10 or 13 characters.')
    }
    setBusy(true)
    setError(null)
    try {
      await addManualBook({
        title: title.trim(),
        authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
        isbn: isbnDigits,
        page_count: Number.parseInt(pages, 10) || null,
        published_date: year.trim(),
      })
      onAdded(title.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add book.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.form, { borderColor: t.border, backgroundColor: t.card }]}>
      <Text style={[styles.heading, { color: t.text }]}>Add a book manually</Text>
      <Input placeholder="Title *" value={title} onChangeText={setTitle} />
      <Input placeholder="Author(s), comma separated" value={authors} onChangeText={setAuthors} />
      <Input placeholder="ISBN (optional)" value={isbn} onChangeText={setIsbn} keyboardType="numbers-and-punctuation" />
      <View style={styles.row}>
        <Input style={styles.flex} placeholder="Pages" value={pages} onChangeText={setPages} keyboardType="number-pad" />
        <Input style={styles.flex} placeholder="Year published" value={year} onChangeText={setYear} keyboardType="number-pad" />
      </View>
      {error && <ErrorText>{error}</ErrorText>}
      <View style={styles.row}>
        <Button title="Cancel" variant="link" onPress={onCancel} />
        <View style={styles.flex} />
        <Button title={busy ? 'Adding…' : 'Add to pile'} onPress={submit} disabled={busy} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginBottom: 12 },
  heading: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
})
