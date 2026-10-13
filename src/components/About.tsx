import { Gem, Heart, Shield, Truck } from 'lucide-react';

export function About() {
  const features = [
    { icon: Gem, title: 'Premium Craftsmanship', desc: 'Every piece is meticulously handcrafted by skilled Mumbai artisans.' },
    { icon: Shield, title: 'Quality Guaranteed', desc: 'Gold-plated finishes that last. 7-day exchange on all items.' },
    { icon: Truck, title: 'Pan-India Shipping', desc: 'Free shipping on orders above ₹999. Dispatched within 24 hours.' },
    { icon: Heart, title: 'Care & Service', desc: 'Personalized support and guidance for every purchase you make.' },
  ];

  return (
    <section id="about" className="py-12 sm:py-20 lg:py-24 bg-cream-200/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-xs font-semibold text-gold-500 tracking-widest uppercase mb-3">
            Our Story
          </p>
          <h2 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold text-onyx-300">
            Mumbai's Trusted Jewellery House
          </h2>
          <p className="mt-4 text-sm sm:text-base text-onyx-300 max-w-2xl mx-auto leading-relaxed">
            Born in the bustling lanes of Mumbai's jewellery markets, Yaba's Imitation & Jewellery
            brings you the timeless beauty of gold-plated craftsmanship at honest prices. We believe
            every woman deserves to shine, regardless of her budget.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="bg-cream-50 rounded-2xl p-5 sm:p-6 text-center shadow-soft hover:shadow-medium transition-shadow duration-300"
            >
              <div className="w-12 h-12 rounded-full bg-gold-50 flex items-center justify-center mx-auto mb-4">
                <f.icon className="h-6 w-6 text-gold-500" />
              </div>
              <h3 className="font-serif text-base font-semibold text-onyx-300 mb-2">
                {f.title}
              </h3>
              <p className="text-xs sm:text-sm text-onyx-300 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
