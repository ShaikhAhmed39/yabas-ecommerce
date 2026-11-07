import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { shopHref } from '@/lib/router';

const HERO_IMAGE = 'https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&w=2000';
const FALLBACK_IMAGE = 'https://placehold.co/1200x1500/ECE2CF/A98445?text=Yaba%27s';

type PublishedHeroSettings = {
  published_mode: 'slideshow' | 'video';
  published_image_urls: string[] | null;
  published_video_url: string | null;
  is_published: boolean;
};

/** Editorial hero: centred italic headline over a champagne wash, with the photos inside a hairline-gold arch.
 *  Photos or video come from Admin > Home banner (Cloudinary), exactly as before. */
export function Hero() {
  const [images, setImages] = useState<string[]>([HERO_IMAGE]);
  const [active, setActive] = useState(0);
  const [video, setVideo] = useState('');
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('hero_media_settings')
        .select('published_mode,published_image_urls,published_video_url,is_published')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const s = data as PublishedHeroSettings;
      if (s.published_mode === 'video' && s.published_video_url) { setVideo(s.published_video_url); return; }
      const urls = (s.published_image_urls ?? []).filter((u): u is string => typeof u === 'string' && u.startsWith('https://'));
      if (urls.length) { setImages(urls); setActive(0); setVideo(''); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (video || images.length < 2 || paused) return;
    const t = window.setInterval(() => setActive((c) => (c + 1) % images.length), 6000);
    return () => window.clearInterval(t);
  }, [images.length, video, paused]);

  const prev = () => setActive((c) => (c - 1 + images.length) % images.length);
  const next = () => setActive((c) => (c + 1) % images.length);
  const media = 'absolute inset-0 h-full w-full object-cover';

  return (
    <section id="home" className="relative isolate overflow-hidden bg-gradient-to-b from-[#F1E9DA] to-[#E3D3B6] text-ink">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-0 pt-10 sm:px-8 lg:min-h-[680px] lg:grid-cols-[1fr_0.9fr] lg:gap-12 lg:px-12 lg:py-0">
        <div className="order-1 mx-auto w-full max-w-xl text-center lg:mx-0 lg:text-left">
          <p className="text-[10.5px] tracking-[0.4em] text-gold-700">NEW SEASON · 1 GRAM GOLD</p>
          <h1 className="mt-4 font-display text-[3.4rem] font-normal italic leading-[0.92] sm:text-7xl xl:text-[5.5rem]">
            Quietly <br className="hidden lg:block" />radiant
          </h1>
          <p className="mt-5 text-[12px] font-light uppercase tracking-[0.5em]">Jewellery for every occasion</p>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-7 text-ink/75 lg:mx-0">
            Gold-plated pieces for weddings, festivals and everyday wear. Designed in Mira Road, Mumbai and delivered across India.
          </p>
          <div className="mt-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <a href={shopHref()} className="inline-flex min-h-12 items-center justify-center bg-onyx-300 px-10 text-[12px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-onyx-200">Shop the collection</a>
            <a href="#about" className="inline-flex min-h-12 items-center text-[12px] font-medium uppercase tracking-[0.2em]"><span className="border-b border-ink pb-1">Our story</span></a>
          </div>
        </div>

        <div className="order-2 mx-auto mt-2 w-full max-w-[300px] sm:max-w-[380px] lg:max-w-[440px] lg:self-end" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div
            className="relative rounded-t-full border border-b-0 border-[#A9844599] p-3 animate-arch-rise"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null || images.length < 2) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
            }}
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-full border border-b-0 border-[#A9844599] bg-[#ECE2CF]">
              {video ? (
                <video src={video} autoPlay muted loop playsInline preload="metadata" className={media} />
              ) : (
                images.map((src, i) => (
                  <img
                    key={`${src}-${i}`}
                    src={src}
                    alt={i === active ? "Yaba's jewellery collection" : ''}
                    aria-hidden={i !== active}
                    {...{ fetchpriority: i === active ? 'high' : 'auto' }}
                    decoding="async"
                    onError={(e) => { if (e.currentTarget.src !== FALLBACK_IMAGE) e.currentTarget.src = FALLBACK_IMAGE; }}
                    className={`${media} transition-opacity duration-700 ${i === active ? 'opacity-100' : 'opacity-0'}`}
                  />
                ))
              )}
            </div>
            {!video && images.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 bg-gradient-to-t from-black/45 to-transparent pb-1 pt-8">
                <button type="button" onClick={prev} aria-label="Previous photo" className="grid h-10 w-10 place-items-center text-white"><ChevronLeft className="h-5 w-5" /></button>
                <div className="flex items-center" role="group" aria-label="Choose hero image">
                  {images.map((_, i) => (
                    <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-current={active === i ? 'true' : undefined} className="grid h-6 w-6 place-items-center">
                      <span className={`block h-1.5 transition-all ${active === i ? 'w-6 bg-white' : 'w-1.5 bg-white/60'}`} />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={next} aria-label="Next photo" className="grid h-10 w-10 place-items-center text-white"><ChevronRight className="h-5 w-5" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
