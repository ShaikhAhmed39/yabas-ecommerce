export function SkeletonCard() {
  return (
    <div aria-hidden="true">
      <div className="arch aspect-[4/5] shimmer-bg animate-shimmer" />
      <div className="mt-4 space-y-2.5">
        <div className="h-4 w-4/5 shimmer-bg animate-shimmer" />
        <div className="h-4 w-1/3 shimmer-bg animate-shimmer" />
      </div>
    </div>
  );
}
