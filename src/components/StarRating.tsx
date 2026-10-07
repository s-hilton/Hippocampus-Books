interface Props {
  value: number | null
  onChange: (rating: number | null) => void
}

export default function StarRating({ value, onChange }: Props) {
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={value !== null && n <= value ? 'star filled' : 'star'}
          // Clicking the current rating again clears it.
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}
