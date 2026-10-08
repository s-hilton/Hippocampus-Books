import { useState } from 'react'
import { Pressable, type TextStyle } from 'react-native'
import { Text } from './Text'
import { useTheme } from '../lib/theme'

/** Long text clamped to a few lines, with a "Show more" toggle when it's long enough to need one. */
export default function ExpandableText({ text, lines = 6, style }: { text: string; lines?: number; style?: TextStyle }) {
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const long = text.length > lines * 60 || text.split('\n').length > lines
  return (
    <>
      <Text style={[{ color: t.text, lineHeight: 22 }, style]} numberOfLines={expanded || !long ? undefined : lines}>
        {text}
      </Text>
      {long && (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} hitSlop={6}>
          <Text style={{ color: t.accent, marginTop: 4, fontWeight: '600' }}>{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      )}
    </>
  )
}
