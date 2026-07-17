import { useState } from 'react'

/** Speckled robin-egg blue logo, drawn inline so it needs no hosting. */
const ROBIN_EGG_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='.3' y2='1'><stop offset='0' stop-color='#A8E6E4'/><stop offset='1' stop-color='#5FBEC2'/></linearGradient></defs><rect width='400' height='400' fill='#101720'/><ellipse cx='200' cy='330' rx='95' ry='18' fill='#000' opacity='.35'/><path d='M200 45C133 45 88 152 88 240c0 62 50 105 112 105s112-43 112-105C312 152 267 45 200 45Z' fill='url(#g)' stroke='#3FA0A5' stroke-width='8'/><ellipse cx='163' cy='140' rx='26' ry='48' fill='#fff' opacity='.25' transform='rotate(-14 163 140)'/><g fill='#3E8F93' opacity='.6'><circle cx='160' cy='150' r='7'/><circle cx='240' cy='120' r='5'/><circle cx='215' cy='210' r='6'/><circle cx='150' cy='250' r='5'/><circle cx='255' cy='265' r='7'/><circle cx='195' cy='305' r='5'/><circle cx='235' cy='170' r='4'/></g></svg>"

/**
 * Display overrides for coins whose on-chain image can't be changed anymore
 * (metadata is set once at creation). Keyed by the exact on-chain image URL.
 */
const IMAGE_OVERRIDES: Record<string, string> = {
  // FLOCK (0xBBE5…3D76) was hatched with a placeholder photo URL — show the robin egg instead.
  'https://picsum.photos/seed/flocktest/400':
    'data:image/svg+xml;utf8,' + encodeURIComponent(ROBIN_EGG_SVG),
}

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
  const override = IMAGE_OVERRIDES[s]
  if (override) return override
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
