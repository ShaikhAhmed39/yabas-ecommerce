import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/offline';

/** Slim notice shown only while there is no internet. The saved shop keeps working; paying needs a connection. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-onyx-400 px-4 py-2 text-center text-[13px] text-cream-100">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      You are offline. You can browse your saved collection; checkout needs internet.
    </div>
  );
}
