// Searching the trope / content warning lists. No React Native imports, so Node can test it.
import type { Tag } from './types'

const MAX_RESULTS = 25

/**
 * The slug for a tag name: "Brother's Best Friend" -> "brothers-best-friend", "Ménage" ->
 * "menage". Must match tag_slug() in the database (it reproduces every built-in slug).
 */
export function slugifyTag(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** How a typed tag name is stored: trimmed, inner spaces collapsed. */
export const cleanTagName = (name: string) => name.trim().replace(/\s+/g, ' ')

/** Same rules as the database: 2–40 characters, with letters or numbers. */
export function isValidTagName(name: string): boolean {
  const clean = cleanTagName(name)
  return clean.length >= 2 && clean.length <= 40 && slugifyTag(clean).length >= 2
}

/** The existing tag a typed name means (same slug, or same name ignoring case), if any. */
export function findTag(tags: Tag[], name: string): Tag | undefined {
  const clean = cleanTagName(name).toLowerCase()
  const slug = slugifyTag(clean)
  return tags.find((t) => t.slug === slug) ?? tags.find((t) => t.name.toLowerCase() === clean)
}

/** Best matches first: names starting with the query, then words starting with it, then anywhere. */
export function searchTags(tags: Tag[], query: string, exclude: Set<string>): Tag[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const qSlug = slugifyTag(q)
  const scored: { tag: Tag; score: number }[] = []
  for (const tag of tags) {
    if (exclude.has(tag.slug)) continue
    const name = tag.name.toLowerCase()
    // An exact match (same slug, e.g. "enemies-to-lovers") always comes first.
    const score =
      tag.slug === qSlug ? 0 : name.startsWith(q) ? 1 : name.includes(` ${q}`) ? 2 : name.includes(q) ? 3 : -1
    if (score >= 0) scored.push({ tag, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.tag.name.length - b.tag.name.length)
    .slice(0, MAX_RESULTS)
    .map((s) => s.tag)
}
