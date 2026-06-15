export function DataPageSkeleton() {
  return (
    <div className="space-y-4 px-4 lg:px-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border bg-muted/40"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl border bg-muted/40" />
    </div>
  )
}
