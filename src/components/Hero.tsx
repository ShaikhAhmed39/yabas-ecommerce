import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mandala } from '@/components/ornaments';
import { shopHref } from '@/lib/router';

const HERO_IMAGE = 'https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&w=2000';
const FALLBACK_IMAGE = 'https://placehold.co/1200x1500/0A3A38/E2B04F?text=Yaba%27s';

type PublishedHeroSettings = {
  published_mode: 'slideshow' | 'video';
  published_image_urls: string[] | null;
  published_video_url: string | null;
  is_published: boolean;
};

/** Teal jaali hero. The photos or video come from Admin > Hero media (Cloudinary) exactly as before. */
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
    <section id="home" className="jaali-teal relative isolate overflow-hidden text-cream-100">
      <Mandala className="pointer-events-none absolute left-1/2 top-[34%] -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow lg:left-[75%] lg:top-1/2 lg:h-[760px] lg:w-[760px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-8 pt-5 sm:px-8 lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-12 lg:py-16">
        <div className="order-2 mx-auto w-full max-w-xl text-center lg:order-1 lg:mx-0 lg:text-left">
          <p className="font-deva text-lg text-gold-200">शुभ आरंभ</p>
          <h1 className="mt-1 font-display text-[2rem] leading-[1.15] tracking-[0.03em] text-cream-50 sm:text-5xl xl:text-[3.4rem]">
            Heritage in every gleam
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-cream-100/90 sm:text-base lg:mx-0">
            1-gram gold jewellery for weddings, festivals and everyday wear. Designed in Mira Road, Mumbai and delivered across India.
          </p>
          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a href={shopHref()} className="inline-flex min-h-12 items-center justify-center rounded bg-gradient-to-br from-gold-200 to-gold-500 px-8 font-display text-sm tracking-[0.12em] text-ink shadow-[0_6px_16px_-6px_rgba(0,0,0,.6)] transition-transform hover:-translate-y-0.5">
              SHOP THE COLLECTION
            </a>
            <a href="#about" className="inline-flex min-h-12 items-center justify-center rounded border border-gold-300/70 px-8 font-display text-sm tracking-[0.12em] text-gold-100 transition-colors hover:bg-white/10">
              OUR STORY
            </a>
          </div>
        </div>

        <div className="order-1 mx-auto w-full max-w-[220px] sm:max-w-[340px] lg:order-2 lg:max-w-[430px]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div
            className="relative aspect-[4/5] w-full rounded-t-full border-2 border-gold-400 bg-onyx-400 shadow-[0_0_0_7px_#0F4C4A,0_0_0_8px_#E2B04F,0_24px_40px_-12px_rgba(0,0,0,.6)] animate-arch-rise"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null || images.length < 2) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
            }}
          >
            <div className="absolute inset-0 overflow-hidden rounded-t-full">
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
          </div>
          {!video && images.length > 1 && (
            <div className="mt-7 flex items-center justify-center gap-3">
              <button type="button" onClick={prev} aria-label="Previous photo" className="grid h-10 w-10 place-items-center text-gold-300 hover:text-gold-100"><ChevronLeft className="h-5 w-5" /></button>
              <div className="flex items-center gap-2.5" role="group" aria-label="Choose hero image">
                {images.map((_, i) => (
                  <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-current={active === i ? 'true' : undefined}
                    className="grid h-6 w-6 place-items-center">
                    <span className={`block h-2.5 w-2.5 rotate-45 border border-gold-400 transition-colors ${active === i ? 'bg-gold-400' : ''}`} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={next} aria-label="Next photo" className="grid h-10 w-10 place-items-center text-gold-300 hover:text-gold-100"><ChevronRight className="h-5 w-5" /></button>
            </div>
          )}
        </div>
      </div>
      <div className="scallop-ivory" aria-hidden="true" />
    </section>
  );
}
