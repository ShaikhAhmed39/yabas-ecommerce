import { useEffect, useState } from 'react';

/** Small "remember it on this phone" helpers so the shop still opens with no internet. */
const PREFIX = 'yabas:cache:v1:';

export function saveCache(key: string, data: unknown) {
  try { window.localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked: fine */ }
}
export function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { data: T }).data : null;
  } catch { return null; }
}

/** Downloads every product photo once into the phone's photo cache, quietly, so photos show offline too. */
export function prefetchPhotos(urls: string[]) {
  if (typeof caches === 'undefined' || !navigator.onLine) return;
  const run = async () => {
    try {
      const cache = await caches.open('yabas-photos-v1');
      for (const url of [...new Set(urls)].filter((u) => u.startsWith('https://')).slice(0, 80)) {
        if (await cache.match(url)) continue;
        try { await cache.put(url, await fetch(url, { mode: 'no-cors' })); } catch { /* one photo failing must not stop the rest */ }
      }
    } catch { /* cache unavailable */ }
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => void run()); else setTimeout(() => void run(), 2500);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
