export function About() {
  const points = [
    { title: 'Gold-plated finish', desc: 'Each piece has a gold-plated finish. The jewellery care guide in the footer shows how to keep it bright.' },
    { title: '7-day returns', desc: 'Not right? Raise a return from My orders within 7 days of delivery. We arrange the pickup and refund you after inspection.' },
    { title: 'Delivered across India', desc: 'Pay online and we ship to your pincode with tracking you can follow in My orders.' },
    { title: 'Real people to talk to', desc: 'Call or message the shop for help choosing a set. The numbers are in the footer.' },
  ];

  return (
    <section id="about" className="bg-onyx-300 py-16 text-cream-100 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8">
        <div>
          <h2 className="font-display text-3xl leading-tight text-gold-100 sm:text-4xl text-balance">
            Born in Mumbai&apos;s jewellery lanes, made for every occasion
          </h2>
          <p className="mt-6 max-w-lg text-base leading-8 text-cream-200/85">
            Yaba&apos;s Imitation &amp; Jewellery brings the look of gold-plated craftsmanship at honest prices.
            We believe every woman deserves to shine, whatever her budget.
          </p>
        </div>

        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.title} className="border-t border-gold-400/40 pt-5">
              <dt className="font-display text-xl text-gold-200">{p.title}</dt>
              <dd className="mt-2 text-[15px] leading-7 text-cream-200/80">{p.desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
