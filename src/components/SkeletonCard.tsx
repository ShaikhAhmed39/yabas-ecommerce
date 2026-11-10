export function SkeletonCard() {
  return (
    <div aria-hidden="true" className="frame-gold rounded-md bg-cream-50 p-2">
      <div className="aspect-[1/1.08] rounded-t-full shimmer-bg animate-shimmer" />
      <div className="space-y-2 px-2 pb-3 pt-3">
        <div className="mx-auto h-3 w-1/3 rounded shimmer-bg animate-shimmer" />
        <div className="mx-auto h-4 w-4/5 rounded shimmer-bg animate-shimmer" />
        <div className="mx-auto h-4 w-1/3 rounded shimmer-bg animate-shimmer" />
      </div>
    </div>
  );
}
