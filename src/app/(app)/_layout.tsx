import { useEffect } from 'react'
import { Redirect, Stack } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { getAllTags } from '../../lib/db'
import { fontFamily, useTheme } from '../../lib/theme'
import { Loading } from '../../components/ui'

// Everything in this group requires a signed-in user.
export default function AppLayout() {
  const t = useTheme()
  const { session, loading } = useAuth()

  // Load the trope / content warning lists in the background so the review form is ready.
  useEffect(() => {
    if (session) getAllTags().catch(() => {}) // the review form retries and shows any error
  }, [session])

  if (loading) return <Loading />
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.accent, fontFamily, fontWeight: '700' },
        headerTintColor: t.accent,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="book/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
      <Stack.Screen name="series" options={{ title: 'Series', headerBackTitle: 'Back' }} />
      <Stack.Screen name="read/[id]" options={{ title: 'Your read', headerBackTitle: 'Back' }} />
    </Stack>
  )
}
