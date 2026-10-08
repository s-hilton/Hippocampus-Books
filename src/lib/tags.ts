// Searching the trope / content warning lists. No React Native imports, so Node can test it.
import type { Tag } from './types'

const MAX_RESULTS = 25

/** Best matches first: names starting with the query, then words starting with it, then anywhere. */
export function searchTags(tags: Tag[], query: string, exclude: Set<string>): Tag[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { tag: Tag; score: number }[] = []
  for (const tag of tags) {
    if (exclude.has(tag.slug)) continue
    const name = tag.name.toLowerCase()
    const score = name.startsWith(q) ? 0 : name.includes(` ${q}`) ? 1 : name.includes(q) ? 2 : -1
    if (score >= 0) scored.push({ tag, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.tag.name.length - b.tag.name.length)
    .slice(0, MAX_RESULTS)
    .map((s) => s.tag)
}
