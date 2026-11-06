import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const HERO_IMAGE =
  "https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&w=2000";

const FALLBACK_IMAGE =
  "https://placehold.co/1200x1500/FAF0E8/96691F?text=Yaba%27s+Jewellery";

type PublishedHeroSettings = {
  published_mode: "slideshow" | "video";
  published_image_urls: string[] | null;
  published_video_url: string | null;
  is_published: boolean;
};

export function Hero() {
  const [heroImages, setHeroImages] = useState<string[]>([HERO_IMAGE]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heroVideo, setHeroVideo] = useState("");
  const [isVideo, setIsVideo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPublishedHero = async () => {
      const { data, error } = await supabase
        .from("hero_media_settings")
        .select(
          "published_mode,published_image_urls,published_video_url,is_published",
        )
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || error || !data || !data.is_published) return;

      const settings = data as PublishedHeroSettings;

      if (settings.published_mode === "video" && settings.published_video_url) {
        setHeroVideo(settings.published_video_url);
        setIsVideo(true);
        setHeroImages([HERO_IMAGE]);
        setActiveIndex(0);
        return;
      }

      const publishedImages = (settings.published_image_urls || []).filter(
        (url): url is string =>
          typeof url === "string" && url.startsWith("https://"),
      );

      if (publishedImages.length > 0) {
        setHeroImages(publishedImages);
        setActiveIndex(0);
        setHeroVideo("");
        setIsVideo(false);
      }
    };

    void loadPublishedHero();

    return () => {
      cancelled = true;
    };
  }, []);

  // Advance to the next photo every 20 seconds.
  useEffect(() => {
    if (isVideo || heroImages.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % heroImages.length);
    }, 20000);

    return () => window.clearInterval(timer);
  }, [heroImages.length, isVideo]);

  const showPrevious = () => {
    setActiveIndex(
      (current) => (current - 1 + heroImages.length) % heroImages.length,
    );
  };

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % heroImages.length);
  };

  const mediaClass = 'absolute inset-0 h-full w-full object-cover';

  return (
    <section id="home" className="relative isolate overflow-hidden bg-onyx-300 text-cream-100">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:min-h-[680px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-12 lg:py-20">
        {/* Copy */}
        <div className="order-2 mx-auto w-full max-w-xl lg:order-1 lg:mx-0">
          <h1 className="font-display text-[2.4rem] leading-[1.12] text-gold-100 sm:text-5xl xl:text-6xl text-balance">
            1 gram gold jewellery for weddings, festivals and every day
          </h1>

          <p className="mt-6 max-w-md text-base leading-8 text-cream-200/85">
            Gold-plated necklaces, bangles, earrings and bridal sets from Mira Road, Mumbai.
            Pay online and we deliver across India.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <a
              href="#collections"
              className="inline-flex min-h-12 items-center justify-center bg-gold-300 px-8 py-3 text-[15px] font-medium text-onyx-400 transition-colors hover:bg-gold-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-200"
            >
              Shop the collection
            </a>
            <a
              href="#about"
              className="inline-flex min-h-12 items-center justify-center border border-gold-300/60 px-8 py-3 text-[15px] text-gold-100 transition-colors hover:border-gold-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-200"
            >
              Our story
            </a>
          </div>
        </div>

        {/* The arch: a display niche for the piece being shown */}
        <div className="order-1 mx-auto w-full max-w-[400px] lg:order-2 lg:max-w-[460px]">
          <div className="arch-outline arch relative aspect-[4/5] w-full bg-cream-100 animate-arch-rise">
            <div className="arch absolute inset-0 overflow-hidden">
              {isVideo && heroVideo ? (
                <video src={heroVideo} autoPlay muted loop playsInline preload="metadata" className={mediaClass} />
              ) : (
                heroImages.map((image, index) => (
                  <img
                    key={`${image}-${index}`}
                    src={image}
                    alt={index === activeIndex ? "Yaba's jewellery collection" : ''}
                    fetchPriority={index === activeIndex ? 'high' : 'auto'}
                    decoding="async"
                    onError={(event) => {
                      if (event.currentTarget.src !== FALLBACK_IMAGE) event.currentTarget.src = FALLBACK_IMAGE;
                    }}
                    className={`${mediaClass} transition-opacity duration-700 ease-in-out ${index === activeIndex ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden={index !== activeIndex}
                  />
                ))
              )}
            </div>
          </div>

          {!isVideo && heroImages.length > 1 && (
            <div className="mt-8 flex items-center justify-center gap-5">
              <button type="button" onClick={showPrevious} aria-label="Previous photo" className="p-2 text-gold-300 hover:text-gold-100 transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2" role="group" aria-label="Choose hero image">
                {heroImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Show image ${index + 1}`}
                    aria-current={activeIndex === index ? 'true' : undefined}
                    className={`h-1.5 rounded-full transition-all duration-300 ${activeIndex === index ? 'w-7 bg-gold-300' : 'w-2 bg-gold-300/35 hover:bg-gold-300/70'}`}
                  />
                ))}
              </div>
              <button type="button" onClick={showNext} aria-label="Next photo" className="p-2 text-gold-300 hover:text-gold-100 transition-colors">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
