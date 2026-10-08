// Small shared building blocks so screens stay consistent.
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { Text } from './Text'
import { fontFamily, useTheme } from '../lib/theme'

export function Button({
  title,
  onPress,
  disabled,
  variant = 'primary',
}: {
  title: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'link'
}) {
  const t = useTheme()
  const bg = variant === 'primary' ? t.accent : 'transparent'
  const color = variant === 'primary' ? t.accentText : variant === 'link' ? t.muted : t.accent
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: t.accent },
        variant === 'link' && styles.link,
      ]}
    >
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </Pressable>
  )
}

export function Input(props: TextInputProps) {
  const t = useTheme()
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[styles.input, { fontFamily, color: t.text, borderColor: t.border, backgroundColor: t.card }, props.style]}
    />
  )
}

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme()
  return <View style={[styles.screen, { backgroundColor: t.bg }]}>{children}</View>
}

export function Loading() {
  const t = useTheme()
  return (
    <View style={[styles.center, { backgroundColor: t.bg }]}>
      <ActivityIndicator color={t.accent} />
    </View>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme()
  return <Text style={{ color: t.danger, marginVertical: 8 }}>{children}</Text>
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  link: { paddingHorizontal: 4, paddingVertical: 4 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
})
