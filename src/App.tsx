import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'
import Auth from './components/Auth'
import SearchTab from './components/SearchTab'
import PileTab from './components/PileTab'

type Tab = 'search' | 'pile'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('search')

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured) {
    return (
      <main className="container">
        <h1>Hippocampus Books</h1>
        <p className="notice">
          Supabase isn't configured. Copy <code>.env.example</code> to <code>.env.local</code> and fill in
          your project URL and anon key.
        </p>
      </main>
    )
  }

  if (loading) return <main className="container">Loading…</main>
  if (!session) return <Auth />

  return (
    <main className="container">
      <header className="app-header">
        <h1>Hippocampus Books</h1>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>
          Search
        </button>
        <button role="tab" aria-selected={tab === 'pile'} onClick={() => setTab('pile')}>
          My Pile
        </button>
      </nav>

      {tab === 'search' ? <SearchTab /> : <PileTab />}
    </main>
  )
}
