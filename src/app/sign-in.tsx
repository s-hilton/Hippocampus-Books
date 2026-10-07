import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '../lib/auth'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { Button, ErrorText, Input, Screen } from '../components/ui'

export default function SignIn() {
  const t = useTheme()
  const { session } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (session) return <Redirect href="/" />

  async function submit() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
    else if (mode === 'sign-up' && !data.session) setMessage('Check your email to confirm your account, then sign in.')
  }

  return (
    <Screen>
      <View style={styles.box}>
        <Text style={[styles.title, { color: t.text }]}>Hippocampus Books</Text>
        {!supabaseConfigured ? (
          <ErrorText>
            Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env).
          </ErrorText>
        ) : (
          <>
            <Input
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              placeholder="Password"
              secureTextEntry
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            {error && <ErrorText>{error}</ErrorText>}
            {message && <Text style={{ color: t.muted }}>{message}</Text>}
            <Button
              title={busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
              onPress={submit}
              disabled={busy || !email || !password}
            />
            <Button
              variant="link"
              title={mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
              onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
            />
          </>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  box: { width: '100%', maxWidth: 400, alignSelf: 'center', marginTop: 80, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
})
