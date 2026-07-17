import { useState } from 'react'

/**
 * Turn an on-chain image value into something an <img> can actually load,
 * or null if it can't. Coin metadata is arbitrary user input set at creation,
 * so it's often a bare emoji, plain text, or an ipfs:// URI — none of which
 * a browser can render directly. Anything that isn't a real http(s)/data URL
 * (or an ipfs URI we can route through a gateway) falls back to the egg.
 */
function resolveImage(src?: string): string | null {
  if (!src) return null
  const s = src.trim()
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  if (s.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + s.slice(7)
  return null
}

/**
 * Coin avatar that gracefully falls back to the 🥚 egg when there's no usable
 * image — whether the value is missing, junk, or a link that fails to load.
 */
export function CoinImage({ src, alt }: { src?: string; alt: string; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  const url = resolveImage(src)
  if (!url || failed) return <span className="card-egg">🥚</span>
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}
