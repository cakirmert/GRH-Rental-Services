export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="h-44 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
