import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import Chip from './Chip'
import { Button } from './ui'
import { STATUSES, STATUS_LABELS, type ReadingStatus } from '../lib/types'
import { useTheme } from '../lib/theme'

/**
 * Shelf status chips. Choosing Reading for a book that's Read or DNF asks whether this is
 * a reread (a new read, counted separately) or the last read carrying on.
 */
export default function StatusPicker({
  status,
  onChange,
  onReread,
}: {
  status: ReadingStatus
  onChange: (status: ReadingStatus) => void
  onReread: () => void
}) {
  const t = useTheme()
  const [asking, setAsking] = useState(false)

  function choose(next: ReadingStatus) {
    if (next === status) return
    if (next === 'reading' && (status === 'read' || status === 'dnf')) return setAsking(true)
    setAsking(false)
    onChange(next)
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {STATUSES.map((s) => (
          <Chip key={s} label={STATUS_LABELS[s]} active={status === s} onPress={() => choose(s)} />
        ))}
      </View>
      {asking && (
        <View style={[styles.ask, { borderColor: t.border }]} role="group" aria-label="Start reading again">
          <Text style={{ color: t.text }}>
            {status === 'read' ? 'Reading it again?' : 'Picking it back up?'}
          </Text>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              title={status === 'read' ? 'Start a reread' : 'Start over'}
              onPress={() => {
                setAsking(false)
                onReread()
              }}
            />
            <Button
              variant="secondary"
              title={status === 'read' ? 'Not finished yet' : 'Continue where I stopped'}
              onPress={() => {
                setAsking(false)
                onChange('reading')
              }}
            />
            <Button variant="link" title="Cancel" onPress={() => setAsking(false)} />
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ask: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
})
