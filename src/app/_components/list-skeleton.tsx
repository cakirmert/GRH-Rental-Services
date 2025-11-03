export default function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
      {[0, 1, 2].map((placeholder) => (
        <div key={placeholder} className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="aspect-video animate-pulse bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-6 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
