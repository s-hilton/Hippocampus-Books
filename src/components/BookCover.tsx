import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { useTheme } from '../lib/theme'

const SIZES = {
  small: { width: 48, height: 72 },
  large: { width: 120, height: 180 },
}

/** Book cover, cached in memory and on disk so revisited screens show it immediately. */
export default function BookCover({ uri, size = 'small' }: { uri: string | null; size?: keyof typeof SIZES }) {
  const t = useTheme()
  const dims = SIZES[size]
  if (!uri) {
    return (
      <View style={[styles.cover, dims, styles.placeholder, { backgroundColor: t.border }]}>
        <Text style={{ fontSize: size === 'large' ? 40 : 14 }}>📖</Text>
      </View>
    )
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.cover, dims, { backgroundColor: t.border }]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      transition={120}
      accessible={false}
    />
  )
}

const styles = StyleSheet.create({
  cover: { borderRadius: 4 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
})
