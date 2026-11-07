import { WhatsAppIcon } from '@/components/icons';
import { useStoreConfig } from '@/lib/storeConfig';
import { SHOP_DEFAULTS } from '@/lib/policies';

/** Floating chat button. Uses the number from Store settings, or the shop's number until one is saved. */
export function WhatsAppButton({ message = "Hello Yaba's, I would like help with a piece." }: { message?: string }) {
  const { whatsappLink, config } = useStoreConfig();
  const href = whatsappLink(message) ?? `https://wa.me/91${SHOP_DEFAULTS.whatsapp_number}?text=${encodeURIComponent(message)}`;
  void config;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-[84px] right-4 z-30 grid h-[52px] w-[52px] place-items-center rounded-full bg-[#25D366] text-white shadow-[0_8px_18px_-4px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 lg:bottom-6 lg:right-6 lg:h-14 lg:w-14"
    >
      <WhatsAppIcon className="h-7 w-7 lg:h-8 lg:w-8" />
    </a>
  );
}
