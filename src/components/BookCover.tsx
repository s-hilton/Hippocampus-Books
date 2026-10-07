import { coverUrl } from '../lib/openLibrary'

export default function BookCover({ coverId, title }: { coverId: number | null; title: string }) {
  const src = coverUrl(coverId)
  return src ? (
    <img className="cover" src={src} alt={`Cover of ${title}`} loading="lazy" />
  ) : (
    <div className="cover placeholder" aria-hidden="true">
      📖
    </div>
  )
}
