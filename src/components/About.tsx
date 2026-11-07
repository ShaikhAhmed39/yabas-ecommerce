import { Section } from '@/components/ornaments';

export function About() {
  const points = [
    { title: 'Gold-plated finish', desc: 'Each piece carries a gold-plated finish. The Jewellery Care guide in the footer shows how to keep it bright.' },
    { title: '7-day returns', desc: 'Not right? Raise a return from My orders within 7 days of delivery. We arrange the pickup and refund you after inspection.' },
    { title: 'Delivered across India', desc: 'Pay online and we ship to your pincode, with tracking you can follow any time.' },
    { title: 'Real people to talk to', desc: 'Call or WhatsApp the shop for help choosing a set. The numbers are in the footer.' },
  ];
  return (
    <section id="about" className="jaali-teal mt-8 py-14 text-cream-100 sm:py-20">
      <Section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <p className="font-deva text-gold-200">हमारी कहानी</p>
          <h2 className="mt-1 font-display text-2xl leading-tight tracking-wide text-gold-100 sm:text-4xl">Born in Mumbai&apos;s jewellery lanes, made for every occasion</h2>
          <p className="mt-5 max-w-lg text-base leading-8 text-cream-200/90">
            Yaba&apos;s Imitation &amp; Jewellery brings the look of gold-plated craftsmanship at honest prices. We believe every woman deserves to shine, whatever her budget.
          </p>
        </div>
        <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.title} className="border-t border-gold-400/50 pt-4">
              <dt className="font-display text-lg tracking-wide text-gold-200">{p.title}</dt>
              <dd className="mt-2 text-[15px] leading-7 text-cream-200/85">{p.desc}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </section>
  );
}
