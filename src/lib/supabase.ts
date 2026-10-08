import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // No `lock` option: supabase-js now coordinates token refreshes itself, and the
    // old processLock option is deprecated (it logged a warning on startup).
  },
})

// On mobile, only refresh the session token while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}
