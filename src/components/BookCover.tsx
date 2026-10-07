import { Image, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../lib/theme'

export default function BookCover({ uri }: { uri: string | null }) {
  const t = useTheme()
  if (!uri) {
    return (
      <View style={[styles.cover, styles.placeholder, { backgroundColor: t.border }]}>
        <Text>📖</Text>
      </View>
    )
  }
  return <Image source={{ uri }} style={styles.cover} resizeMode="cover" />
}

const styles = StyleSheet.create({
  cover: { width: 48, height: 72, borderRadius: 4 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
})
