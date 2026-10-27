import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const HERO_IMAGE =
  "https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&w=2000";

const FALLBACK_IMAGE =
  "https://placehold.co/1200x1500/211B17/E7C98F?text=Yaba%27s+Jewelry";

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

  return (
    <section
      id="home"
      className="relative isolate overflow-hidden bg-[#211B17] text-white"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr]">
        {/* Left side: hero copy */}
        <div className="relative z-10 flex items-center px-5 py-16 sm:px-10 sm:py-20 lg:px-12 lg:py-24 xl:px-14">
          <div className="mx-auto w-full max-w-xl animate-slide-up lg:mx-0">
            <p className="mb-5 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#E7C98F] sm:mb-6 sm:text-xs sm:tracking-[0.4em]">
              <span className="h-px w-8 bg-[#211B17] sm:w-9" />
              The Art of Adornment
            </p>

            <h1
              className="font-display text-[2.55rem] font-normal leading-[1.1] tracking-tight sm:text-6xl lg:text-5xl xl:text-7xl"
              style={{
                color: "#FFFDF9",
                textShadow: "0 2px 10px rgba(0,0,0,0.3)",
                letterSpacing: "-0.01em",
                WebkitTextStroke: "0.4px rgba(255,248,232,0.22)",
              }}
            >
              Jewellery That
              <span className="mt-1 block italic" style={{ color: "#E7C98F" }}>
                Makes Every
              </span>
              <span className="block">Moment Special</span>
            </h1>

            <p className="mt-5 max-w-lg text-sm leading-7 text-white/80 sm:mt-7 sm:text-base sm:leading-8">
              Discover jewellery that brings elegance to your everyday style and
              adds a special touch to life&apos;s memorable occasions.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:gap-4">
              <a
                href="#collections"
                className="group inline-flex min-h-12 w-full items-center justify-center gap-3 border border-[#E7C98F]/80 bg-black/20 px-6 py-3.5 text-sm font-medium text-white transition-all duration-300 hover:border-[#FFF8E8] hover:bg-black/45 hover:shadow-[0_0_18px_rgba(231,201,143,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C98F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#211B17] sm:w-auto sm:px-7"
              >
                Explore Collections
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>

              <a
                href="#about"
                className="inline-flex min-h-12 w-full items-center justify-center border border-white/50 px-6 py-3.5 text-sm font-medium text-white transition-all duration-300 hover:border-[#E7C98F] hover:bg-white/5 hover:shadow-[0_0_18px_rgba(231,201,143,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C98F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#211B17] sm:w-auto sm:px-7"
              >
                Discover Our Story
              </a>
            </div>

            <div className="mt-8 flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-white/65 sm:mt-12 sm:tracking-[0.24em]">
              <span className="h-px w-10 bg-[#D6B16D] sm:w-12" />
              Elegance in every detail
            </div>
          </div>
        </div>

        {/* Right side: portrait product image with a controlled desktop overlap */}
        <div className="relative z-20 bg-[#211B17] px-4 pb-5 pt-4 sm:px-8 sm:pb-7 sm:pt-6 lg:my-12 lg:-ml-8 lg:bg-transparent lg:px-0 lg:py-0 xl:-ml-12">
          <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
            {/* Cream frame behind the photo; overlap is disabled on small screens. */}
            <div
              aria-hidden="true"
              className="absolute -inset-x-2 -inset-y-2 hidden bg-[#211B17] sm:-inset-x-4 sm:-inset-y-4 lg:block"
            />

            <div className="relative aspect-[4/5] max-h-[680px] w-full overflow-hidden bg-[#211B17]">
              {isVideo && heroVideo ? (
                <video
                  src={heroVideo}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-contain p-3 sm:p-6 lg:p-8"
                />
              ) : (
                heroImages.map((image, index) => (
                  <img
                    key={`${image}-${index}`}
                    src={image}
                    alt="Yaba's Jewelry collection"
                    fetchPriority={index === activeIndex ? "high" : "auto"}
                    decoding="async"
                    onError={(event) => {
                      if (event.currentTarget.src !== FALLBACK_IMAGE) {
                        event.currentTarget.src = FALLBACK_IMAGE;
                      }
                    }}
                    className={`absolute inset-0 h-full w-full object-contain p-3 transition-opacity duration-700 ease-in-out sm:p-6 lg:p-8 ${
                      index === activeIndex ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden={index !== activeIndex}
                  />
                ))
              )}
            </div>

            {/* Slim gold controls sit beneath the image, never over the product. */}
            {!isVideo && heroImages.length > 1 && (
              <div className="relative z-10 mt-4 flex min-h-10 items-center justify-between border-t border-[#B99A61]/50 pt-3 sm:mt-5 sm:pt-4">
                <button
                  type="button"
                  onClick={showPrevious}
                  aria-label="Previous photo"
                  className="inline-flex min-h-10 items-center gap-2 px-1 text-xs font-medium uppercase tracking-[0.16em] text-[#E7C98F] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6B31] focus-visible:ring-offset-2 focus-visible:ring-offset-[#211B17]"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div
                  className="flex items-center gap-2"
                  role="group"
                  aria-label="Choose hero image"
                >
                  {heroImages.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={`Show hero image ${index + 1}`}
                      aria-current={activeIndex === index ? "true" : undefined}
                      className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6B31] focus-visible:ring-offset-2 focus-visible:ring-offset-[#211B17] ${
                        activeIndex === index
                          ? "w-7 bg-[#E7C98F]"
                          : "w-3 bg-[#E7C98F]/35 hover:bg-[#E7C98F]/70"
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={showNext}
                  aria-label="Next photo"
                  className="inline-flex min-h-10 items-center gap-2 px-1 text-xs font-medium uppercase tracking-[0.16em] text-[#E7C98F] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6B31] focus-visible:ring-offset-2 focus-visible:ring-offset-[#211B17]"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subtle bottom border */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#D6B16D]/70 to-transparent"
      />
    </section>
  );
}
