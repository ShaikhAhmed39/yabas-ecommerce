import { ArrowRight } from 'lucide-react';

const LOGO_PATH = '/yabas_logo.png';

export function Hero() {
  return (
    <section id="home" className="relative overflow-hidden bg-cream-100">
      {/* Decorative gradient orbs */}
      <div className="absolute top-20 -left-20 w-72 h-72 bg-gold-100/30 rounded-full blur-3xl" />
      <div className="absolute bottom-10 -right-20 w-96 h-96 bg-gold-200/20 rounded-full blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Text */}
          <div className="text-center lg:text-left animate-slide-up order-2 lg:order-1">
            <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-bold text-onyx-300 leading-tight text-balance">
              Adorn Yourself in
              <span className="block gold-text">Timeless Elegance</span>
            </h1>

            <p className="mt-5 sm:mt-6 text-base sm:text-lg text-onyx-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Discover handcrafted gold-plated necklaces, earrings, bangles and more.
              Premium quality imitation jewellery that captures the essence of luxury
              without the price tag.
            </p>

            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
              <a
                href="#collections"
                className="group inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 gold-gradient text-cream-100 font-medium rounded-full shadow-gold hover:shadow-medium transition-all duration-300 hover:scale-[1.02]"
              >
                Explore Collections
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#about"
                className="inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 border border-gold-300 text-onyx-300 font-medium rounded-full hover:bg-gold-50 transition-all duration-300"
              >
                Our Story
              </a>
            </div>
          </div>

          {/* Image collage */}
          <div className="relative grid grid-cols-2 gap-3 sm:gap-4 animate-fade-in order-1 lg:order-2">
            <div className="space-y-3 sm:space-y-4">
              <div className="aspect-square rounded-2xl overflow-hidden shadow-soft">
                <img
                  src="https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                  alt="Gold necklace set"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-soft">
                <img
                  src="https://images.pexels.com/photos/3266700/pexels-photo-3266700.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                  alt="Gold earrings"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>
            <div className="space-y-3 sm:space-y-4 pt-4 sm:pt-8">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-soft">
                <img
                  src="https://images.pexels.com/photos/20429577/pexels-photo-20429577.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                  alt="Gold bangles"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="aspect-square rounded-2xl overflow-hidden shadow-soft">
                <img
                  src="https://images.pexels.com/photos/8306529/pexels-photo-8306529.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                  alt="Gold ring"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
