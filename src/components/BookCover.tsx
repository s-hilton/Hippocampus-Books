import { Image, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../lib/theme'

const SIZES = {
  small: { width: 48, height: 72 },
  large: { width: 120, height: 180 },
}

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
  return <Image source={{ uri }} style={[styles.cover, dims]} resizeMode="cover" />
}

const styles = StyleSheet.create({
  cover: { borderRadius: 4 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
})
