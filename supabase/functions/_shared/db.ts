// Service-role database access for Edge Functions. Supabase provides SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY to every function; if they're missing we skip saving.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

let client: SupabaseClient | null | undefined

export function serviceClient(): SupabaseClient | null {
  if (client === undefined) {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  }
  return client
}

/**
 * Run `work` after the response is sent when the runtime supports it (Supabase's
 * EdgeRuntime.waitUntil), so saving never slows down the user. Errors are logged, not thrown.
 */
export function inBackground(label: string, work: () => Promise<unknown>): void {
  const task = work().catch((err) => console.error(`${label} failed:`, err instanceof Error ? err.message : err))
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  runtime?.waitUntil(task)
}

/** Add or enrich books in the shared catalog (see catalog_books in the migrations). */
export function catalogBooks(books: object[]): void {
  const db = serviceClient()
  if (!db || books.length === 0) return
  inBackground('catalog_books', async () => {
    const { error } = await db.rpc('catalog_books', { p_books: books })
    if (error) throw error
  })
}
