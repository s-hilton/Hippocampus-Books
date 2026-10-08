import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { updateReadDates } from '../lib/db'
import { parseDateTime, toDateInput, toTimeInput } from '../lib/dates'
import type { Read } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Text } from './Text'
import { Button, ErrorText, Input } from './ui'

const FUTURE_SLACK_MS = 5 * 60 * 1000

/**
 * Correct when a read started and finished. Dates are typed (YYYY-MM-DD) so the form
 * works the same on iOS, Android and web; a blank start date means "not recorded".
 */
export default function DatesForm({
  visible,
  read,
  onClose,
  onSaved,
}: {
  visible: boolean
  read: Read
  onClose: () => void
  onSaved: (dates: Pick<Read, 'started_at' | 'finished_at'>) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible && <Form read={read} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

function Form({ read, onClose, onSaved }: Omit<Parameters<typeof DatesForm>[0], 'visible'>) {
  const t = useTheme()
  const [startDate, setStartDate] = useState(read.started_at ? toDateInput(read.started_at) : '')
  const [startTime, setStartTime] = useState(read.started_at ? toTimeInput(read.started_at) : '')
  const [endDate, setEndDate] = useState(read.finished_at ? toDateInput(read.finished_at) : '')
  const [endTime, setEndTime] = useState(read.finished_at ? toTimeInput(read.finished_at) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finished = read.status !== 'reading'

  async function save() {
    let started_at: string | null = null
    if (startDate.trim()) {
      started_at = parseDateTime(startDate, startTime)
      if (!started_at) return setError('Enter the start date as YYYY-MM-DD and the time as HH:MM.')
    }
    let finished_at: string | null = null
    if (finished) {
      finished_at = parseDateTime(endDate, endTime)
      if (!finished_at) return setError('Enter the finish date as YYYY-MM-DD and the time as HH:MM.')
    }
    const latest = Date.now() + FUTURE_SLACK_MS
    if ([started_at, finished_at].some((d) => d && Date.parse(d) > latest)) {
      return setError('Dates can’t be in the future.')
    }
    if (started_at && finished_at && finished_at < started_at) {
      return setError('The finish has to be after the start.')
    }
    setBusy(true)
    setError(null)
    try {
      await updateReadDates(read.id, { started_at, finished_at })
      onSaved({ started_at, finished_at })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save the dates.')
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} aria-label="Close" />
      <View style={[styles.sheet, { backgroundColor: t.card, borderColor: t.border }]} role="dialog" aria-label="Edit dates">
        <Text style={[styles.heading, { color: t.text }]}>Edit dates</Text>
        <DateTimeFields
          label="Started"
          date={startDate}
          time={startTime}
          onDate={setStartDate}
          onTime={setStartTime}
          hint="Leave the date blank if you don’t know when you started."
        />
        {finished && (
          <DateTimeFields
            label={read.status === 'dnf' ? 'Stopped' : 'Finished'}
            date={endDate}
            time={endTime}
            onDate={setEndDate}
            onTime={setEndTime}
          />
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <View style={styles.actions}>
          <Button variant="link" title="Cancel" onPress={onClose} />
          <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function DateTimeFields({
  label,
  date,
  time,
  onDate,
  onTime,
  hint,
}: {
  label: string
  date: string
  time: string
  onDate: (v: string) => void
  onTime: (v: string) => void
  hint?: string
}) {
  const t = useTheme()
  return (
    <View style={styles.group}>
      <Text style={{ color: t.text, fontWeight: '600' }}>{label}</Text>
      <View style={styles.fields}>
        <View style={styles.dateField}>
          <Input
            value={date}
            onChangeText={onDate}
            placeholder="YYYY-MM-DD"
            aria-label={`${label} date, year-month-day`}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
          />
        </View>
        <View style={styles.timeField}>
          <Input
            value={time}
            onChangeText={onTime}
            placeholder="HH:MM"
            aria-label={`${label} time, 24-hour`}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={5}
          />
        </View>
      </View>
      {hint && <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700' },
  group: { gap: 4 },
  fields: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 3 },
  timeField: { flex: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
})
