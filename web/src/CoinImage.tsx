import { useState } from 'react'

/**
 * Coin avatar that gracefully falls back to the 🥚 egg if the image URL is
 * missing or fails to load. Coin images come from arbitrary on-chain
 * metadata set at creation, so plenty will be dead links — this keeps the
 * UI clean instead of showing a broken-image glyph.
 */
export function CoinImage({ src, alt, small }: { src?: string; alt: string; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="card-egg">🥚</span>
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}
