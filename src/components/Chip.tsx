import { Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '../lib/theme'

export default function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable
      role="button"
      aria-selected={active}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : 'transparent' },
      ]}
    >
      <Text style={{ color: active ? t.accentText : t.muted, fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
})
