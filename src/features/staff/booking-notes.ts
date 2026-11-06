export const splitNoteEntries = (notes?: string | null) => {
  if (!notes) return []
  return notes
    .split(/\r?\n\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export const getLatestNotePreview = (notes?: string | null) => {
  const entries = splitNoteEntries(notes)
  if (!entries.length) return null
  const latest = entries[entries.length - 1]
  const normalized = latest.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim()
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
}
