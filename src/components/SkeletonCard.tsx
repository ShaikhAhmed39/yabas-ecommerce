export function SkeletonCard() {
  return (
    <div className="bg-cream-50 rounded-2xl overflow-hidden shadow-soft">
      <div className="aspect-square shimmer-bg animate-shimmer" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-1/3 shimmer-bg animate-shimmer rounded-full" />
        <div className="h-4 w-full shimmer-bg animate-shimmer rounded-full" />
        <div className="h-4 w-2/3 shimmer-bg animate-shimmer rounded-full" />
        <div className="h-6 w-1/2 shimmer-bg animate-shimmer rounded-full" />
        <div className="h-8 w-full shimmer-bg animate-shimmer rounded-full" />
      </div>
    </div>
  );
}
