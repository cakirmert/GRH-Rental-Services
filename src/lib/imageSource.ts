/** Exact owned origins only; never trust the multi-tenant Blob suffix. */
export function ownedImageUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null
    const origins = [process.env.BLOB_URL_BASE, process.env.IMAGE_DOMAIN && `https://${process.env.IMAGE_DOMAIN}`]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => {
        try { return [new URL(value).origin] } catch { return [] }
      })
    return origins.includes(url.origin) ? url : null
  } catch { return null }
}
