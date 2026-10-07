import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="container narrow">
      <h1>Hippocampus Books</h1>
      {sent ? (
        <p>Check {email} for a sign-in link.</p>
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <label htmlFor="email">Sign in with a magic link</label>
          <input
            id="email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send link'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  )
}
