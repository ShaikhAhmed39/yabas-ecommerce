import { useEffect, useRef, useState } from 'react';

import {

  X,

  Loader2,

  CheckCircle2,

  MapPin,

  Phone,

  User as UserIcon,

  CreditCard,

  Truck,

  Lock,

} from 'lucide-react';

import { useCart } from '@/context/CartContext';

import { useAuth } from '@/context/AuthContext';

import { supabase } from '@/lib/supabase';

import { formatINR } from '@/utils/format';



interface CheckoutModalProps {

  open: boolean;

  onClose: () => void;

  onRequireAuth: () => void;

}



const INDIAN_STATES = [

  'Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Telangana', 'Gujarat',

  'Rajasthan', 'Uttar Pradesh', 'West Bengal', 'Kerala', 'Punjab', 'Haryana',

  'Madhya Pradesh', 'Bihar', 'Andhra Pradesh', 'Odisha', 'Assam', 'Jharkhand',

  'Chhattisgarh', 'Goa', 'Himachal Pradesh', 'Jammu and Kashmir', 'Manipur',

  'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura', 'Uttarakhand',

  'Arunachal Pradesh',

];



type PaymentMethod = 'razorpay' | 'cod';



type RazorpaySuccessResponse = {

  razorpay_order_id: string;

  razorpay_payment_id: string;

  razorpay_signature: string;

};



type RazorpayOptions = {

  key: string;

  amount: number;

  currency: string;

  name: string;

  description: string;

  order_id: string;

  prefill?: { name?: string; email?: string; contact?: string };

  theme?: { color?: string };

  modal?: { ondismiss?: () => void };

  handler: (response: RazorpaySuccessResponse) => void | Promise<void>;

};



declare global {

  interface Window {

    Razorpay?: new (options: RazorpayOptions) => {

      open: () => void;

      on: (event: string, callback: (response: unknown) => void) => void;

    };

  }

}



const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

const COD_UNAVAILABLE_MESSAGE =

  'Cash on Delivery is currently unavailable while development is in progress. Please choose Razorpay for online payment.';



function loadRazorpayScript(): Promise<boolean> {

  if (window.Razorpay) return Promise.resolve(true);



  return new Promise((resolve) => {

    const existing = document.querySelector<HTMLScriptElement>(

      `script[src="${RAZORPAY_CHECKOUT_URL}"]`,

    );



    if (existing) {

      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });

      existing.addEventListener('error', () => resolve(false), { once: true });

      if (window.Razorpay) resolve(true);

      return;

    }



    const script = document.createElement('script');

    script.src = RAZORPAY_CHECKOUT_URL;

    script.async = true;

    script.onload = () => resolve(Boolean(window.Razorpay));

    script.onerror = () => resolve(false);

    document.body.appendChild(script);

  });

}



function validateIndianMobile(phone: string): string | null {
  if (!/^[6-9]\d{9}$/.test(phone)) return 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.';
  if (/^(\d)\1{9}$/.test(phone)) return 'Enter your real mobile number, not a repeated-digit number.';
  return null;
}

function validateIndianPincodeFormat(pincode: string): string | null {
  if (!/^[1-9]\d{5}$/.test(pincode)) return 'Enter a valid 6-digit Indian PIN code starting from 1 to 9.';
  if (/^(\d)\1{5}$/.test(pincode)) return 'Enter a real 6-digit Indian PIN code, not a repeated-digit code.';
  return null;
}

async function verifyIndianPincode(pincode: string): Promise<boolean> {
  const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
  if (!response.ok) throw new Error('PIN code verification is temporarily unavailable. Please try again.');
  const result: unknown = await response.json();
  if (!Array.isArray(result) || result.length === 0) return false;
  const first = result[0] as { Status?: unknown; PostOffice?: unknown };
  return first.Status === 'Success' && Array.isArray(first.PostOffice) && first.PostOffice.length > 0;
}

export function CheckoutModal({ open, onClose, onRequireAuth }: CheckoutModalProps) {

  const { items, totalPrice, clearCart } = useCart();

  const { user } = useAuth();

  const [razorpayLoading, setRazorpayLoading] = useState(false);

  const [success, setSuccess] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('razorpay');

  const checkoutRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);



  const [form, setForm] = useState({

    full_name: '',

    address_line_1: '',

    address_line_2: '',

    city: '',

    state: '',

    pincode: '',

    primary_phone: '',

    backup_phone: '',

  });



  useEffect(() => {

    if (open) {

      setError(null);

      setNotice(null);

      setSuccess(null);

    }

  }, [open]);



  const update = (key: keyof typeof form, value: string) => {

    if (key === 'pincode') value = value.replace(/\D/g, '').slice(0, 6);

    if (key === 'primary_phone' || key === 'backup_phone') {

      value = value.replace(/\D/g, '').slice(0, 10);

    }

    setForm((previous) => ({ ...previous, [key]: value }));

  };



  const validate = (): string | null => {
    if (!form.full_name.trim()) return 'Full name is required.';
    if (!form.address_line_1.trim()) return 'Address Line 1 is required.';
    if (!form.city.trim()) return 'City is required.';
    if (!form.state) return 'Please select your state.';
    const pinError = validateIndianPincodeFormat(form.pincode);
    if (pinError) return pinError;
    const phoneError = validateIndianMobile(form.primary_phone);
    if (phoneError) return phoneError;
    if (form.backup_phone) {
      if (validateIndianMobile(form.backup_phone)) return 'Enter a valid backup mobile number starting with 6, 7, 8, or 9.';
      if (form.backup_phone === form.primary_phone) return 'Backup phone must be different from the primary phone.';
    }
    return null;
  };



  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {

    event.preventDefault();

    setError(null);

    setNotice(null);



    if (!user) {

      onRequireAuth();

      return;

    }



    if (paymentMethod === 'cod') {

      setNotice(COD_UNAVAILABLE_MESSAGE);

      return;

    }



    const validationError = validate();

    if (validationError) {

      setError(validationError);

      return;

    }



    if (items.length === 0) {

      setError('Your bag is empty. Add an item before checkout.');

      return;

    }



    setRazorpayLoading(true);
    try {
      const pinExists = await verifyIndianPincode(form.pincode);
      if (!pinExists) {
        setError('This PIN code was not found in the Indian postal directory. Check it and try again.');
        setRazorpayLoading(false);
        return;
      }
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : 'Could not verify the PIN code. Please try again.');
      setRazorpayLoading(false);
      return;
    }

    const fingerprint = JSON.stringify({

      items: items.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))

        .sort((a, b) => a.product_id.localeCompare(b.product_id)),

      customer: {

        customer_name: form.full_name.trim(),

        shipping_address_line1: form.address_line_1.trim(),

        shipping_address_line2: form.address_line_2.trim() || null,

        city: form.city.trim(),

        state: form.state,

        pincode: form.pincode,

        primary_phone: form.primary_phone,

        backup_phone: form.backup_phone || null,

      },

    });

    if (!checkoutRequestRef.current || checkoutRequestRef.current.fingerprint !== fingerprint) {

      checkoutRequestRef.current = { fingerprint, id: crypto.randomUUID() };

    }

    const checkoutRequestId = checkoutRequestRef.current.id;



    setRazorpayLoading(true);

    try {

      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {

        throw new Error('Razorpay checkout could not be loaded. Check your connection and retry.');

      }



      const { data: createData, error: createError } = await supabase.functions.invoke(

        'create-razorpay-order',

        {

          body: {

            checkout_request_id: checkoutRequestId,

            items: items.map((item) => ({

              product_id: item.product.id,

              quantity: item.quantity,

            })),

            customer: {

              customer_name: form.full_name.trim(),

              shipping_address_line1: form.address_line_1.trim(),

              shipping_address_line2: form.address_line_2.trim() || null,

              city: form.city.trim(),

              state: form.state,

              pincode: form.pincode,

              primary_phone: form.primary_phone,

              backup_phone: form.backup_phone || null,

            },

          },

        },

      );



      if (createError) {

        const context = createError.context;

        let serverMessage = '';

        if (context instanceof Response) {

          try {

            const body: unknown = await context.clone().json();

            if (typeof body === 'object' && body !== null && 'error' in body &&

              typeof body.error === 'string') serverMessage = body.error;

          } catch {

            // Use the generic error below when the response is not JSON.

          }

        }

        throw new Error(serverMessage || createError.message || 'Could not start payment.');

      }



      if (!createData || typeof createData !== 'object') {

        throw new Error('The payment service returned an invalid response.');

      }



      const paymentData = createData as {

        orderId?: string;

        razorpayOrderId?: string;

        amount?: number;

        currency?: string;

        keyId?: string;

      };



      if (

        !paymentData.orderId || !paymentData.razorpayOrderId ||

        !Number.isInteger(paymentData.amount) || !paymentData.currency || !paymentData.keyId

      ) {

        throw new Error('Payment configuration is incomplete. The store owner must configure Razorpay keys.');

      }



      const Razorpay = window.Razorpay;

      if (!Razorpay) throw new Error('Razorpay checkout is unavailable. Please retry.');



      const checkout = new Razorpay({

        key: paymentData.keyId,

        amount: paymentData.amount!,

        currency: paymentData.currency,

        name: "Yaba's Jewelry",

        description: 'Secure online payment',

        order_id: paymentData.razorpayOrderId,

        prefill: {

          name: form.full_name.trim(),

          email: user.email ?? undefined,

          contact: form.primary_phone,

        },

        theme: { color: '#B58B3B' },

        modal: {

          ondismiss: () => {

            setRazorpayLoading(false);

            setNotice('Payment window closed. Your order has not been confirmed. You can retry checkout.');

          },

        },

        handler: async (response) => {

          try {

            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(

              'verify-razorpay-payment',

              { body: response },

            );

            if (verifyError) throw new Error(verifyError.message || 'Payment verification failed.');

            if (!verifyData || verifyData.success !== true || verifyData.payment_status !== 'paid') {

              throw new Error(

                typeof verifyData?.message === 'string'

                  ? verifyData.message

                  : 'Payment could not be confirmed yet. Do not pay again; retry verification or contact support.',

              );

            }



            setSuccess(String(verifyData.order_id || paymentData.orderId));

            checkoutRequestRef.current = null;

            clearCart();

          } catch (verificationError) {

            setError(

              verificationError instanceof Error

                ? `${verificationError.message} If money was deducted, do not pay again; contact support with your payment reference.`

                : 'Payment verification failed. If money was deducted, do not pay again; contact support.',

            );

          } finally {

            setRazorpayLoading(false);

          }

        },

      });



      checkout.on('payment.failed', (failure) => {

        const description =

          typeof failure === 'object' && failure !== null && 'error' in failure &&

          typeof failure.error === 'object' && failure.error !== null &&

          'description' in failure.error && typeof failure.error.description === 'string'

            ? failure.error.description

            : 'Payment failed or was cancelled.';

        setError(`${description} You can retry checkout. If money was deducted, do not pay again until the payment status is checked.`);

        setRazorpayLoading(false);

      });



      checkout.open();

    } catch (submitError) {

      setError(

        submitError instanceof Error

          ? submitError.message

          : 'Payment initiation failed. Please try again.',

      );

      setRazorpayLoading(false);

    }

  };



  if (!open) return null;



  if (success) {

    return (

      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fade-in">

        <div className="absolute inset-0 bg-onyx-500/60 backdrop-blur-md" onClick={onClose} />

        <div className="relative w-full max-w-md bg-cream-100 rounded-3xl shadow-medium p-8 text-center animate-scale-in">

          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">

            <CheckCircle2 className="h-8 w-8 text-green-600" />

          </div>

          <h2 className="font-display text-2xl font-bold text-onyx-300 mb-2">Payment Confirmed!</h2>

          <p className="text-sm text-onyx-300 mb-1">Your payment has been verified and recorded.</p>

          <p className="text-xs text-onyx-300 mb-6">

            Order ID: <span className="font-mono text-gold-500">{success.slice(0, 8)}</span>

          </p>

          <button onClick={onClose} className="px-8 py-3 gold-gradient text-cream-100 font-medium rounded-full shadow-gold hover:scale-[1.02] transition-transform">

            Continue Shopping

          </button>

        </div>

      </div>

    );

  }



  const isBusy = razorpayLoading;



  return (

    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fade-in">

      <div className="absolute inset-0 bg-onyx-500/60 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-cream-100 rounded-3xl shadow-medium max-h-[90vh] overflow-y-auto scrollbar-hide animate-scale-in">

        <div className="sticky top-0 bg-cream-100 px-5 sm:px-6 py-4 border-b border-gold-200/40 flex items-center justify-between z-10">

          <h2 className="font-display text-lg sm:text-xl font-bold text-onyx-300">Checkout</h2>

          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300" aria-label="Close checkout">

            <X className="h-5 w-5" />

          </button>

        </div>



        <div className="px-5 sm:px-6 py-6">

          {!user && (

            <div className="mb-5 bg-gold-50 border border-gold-200/50 rounded-xl px-4 py-3 text-sm text-onyx-300 flex items-center gap-2">

              <UserIcon className="h-4 w-4 flex-shrink-0" /> Please sign in to complete your purchase.

            </div>

          )}

          {error && <div role="alert" className="mb-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

          {notice && <div role="status" className="mb-5 text-sm text-onyx-300 bg-gold-50 border border-gold-200/50 rounded-xl px-4 py-3">{notice}</div>}



          <div className="mb-6 bg-cream-200/40 rounded-xl p-4">

            <h3 className="text-xs font-semibold text-onyx-300 uppercase tracking-wider mb-3">Order Summary</h3>

            <div className="space-y-2">

              {items.map((item) => (

                <div key={item.product.id} className="flex justify-between text-sm text-onyx-300 gap-2">

                  <span className="flex-1 truncate">{item.product.title} × {item.quantity}</span>

                  <span className="font-medium whitespace-nowrap">{formatINR(item.product.selling_price * item.quantity)}</span>

                </div>

              ))}

            </div>

            <div className="mt-3 pt-3 border-t border-gold-200/40 flex justify-between items-center">

              <span className="font-serif font-semibold text-onyx-300">Subtotal</span>

              <span className="font-display text-base font-bold text-onyx-300">{formatINR(totalPrice)}</span>

            </div>

            <div className="mt-2 pt-2 border-t border-gold-200/40 flex justify-between items-center">

              <span className="font-serif font-semibold text-onyx-300">Total</span>

              <span className="font-display text-lg sm:text-xl font-bold text-gold-500">{formatINR(totalPrice)}</span>

            </div>

            <p className="mt-2 text-xs text-onyx-300/80">Final amount is calculated securely by the server using current product prices.</p>

          </div>



          <form onSubmit={handleSubmit} className="space-y-4">

            <div>

              <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Full Name *</label>

              <div className="relative">

                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" />

                <input type="text" required maxLength={120} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all" placeholder="Your full name" />

              </div>

            </div>



            <div>

              <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Address Line 1 *</label>

              <div className="relative">

                <MapPin className="absolute left-3 top-3 h-4 w-4 text-onyx-100" />

                <textarea required maxLength={300} value={form.address_line_1} onChange={(e) => update('address_line_1', e.target.value)} rows={2} className="w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all resize-none" placeholder="House / Shop / Building no." />

              </div>

            </div>



            <div>

              <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Address Line 2 (optional)</label>

              <input type="text" maxLength={300} value={form.address_line_2} onChange={(e) => update('address_line_2', e.target.value)} className="w-full px-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all" placeholder="Street / Area / Landmark" />

            </div>



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>

                <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">City *</label>

                <input type="text" required maxLength={100} value={form.city} onChange={(e) => update('city', e.target.value)} className="w-full px-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all" placeholder="Mumbai" />

              </div>

              <div>

                <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">State *</label>

                <select required value={form.state} onChange={(e) => update('state', e.target.value)} className="w-full px-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all">

                  <option value="">Select state</option>

                  {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}

                </select>

              </div>

            </div>



            <div>

              <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Pincode (6 digits) *</label>

              <input type="text" required inputMode="numeric" pattern="[1-9][0-9]{5}" value={form.pincode} onChange={(e) => update('pincode', e.target.value)} className="w-full px-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all" placeholder="401107" maxLength={6} title="Enter a valid 6-digit Indian PIN code" />

              {form.pincode.length > 0 && form.pincode.length !== 6 && <p className="text-xs text-red-600 mt-1">Pincode must be exactly 6 digits.</p>}

            </div>



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>

                <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Primary Phone *</label>

                <div className="relative">

                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" />

                  <input type="tel" required inputMode="numeric" pattern="[6-9][0-9]{9}" value={form.primary_phone} onChange={(e) => update('primary_phone', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all" placeholder="9876543210" maxLength={10} />

                </div>

              </div>

              <div>

                <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Backup Phone (optional)</label>

                <div className="relative">

                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" />

                  <input type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" value={form.backup_phone} onChange={(e) => update('backup_phone', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all" placeholder="9876543211" maxLength={10} />

                </div>

              </div>

            </div>



            <div className="pt-2">

              <h3 className="text-xs font-semibold text-onyx-300 uppercase tracking-wider mb-3">Payment Method</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <button type="button" disabled={isBusy} onClick={() => { setPaymentMethod('razorpay'); setNotice(null); }} className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${paymentMethod === 'razorpay' ? 'border-gold-400 bg-gold-50' : 'border-gold-200/40 bg-cream-200/30 hover:border-gold-300'}`}>

                  <CreditCard className={`h-5 w-5 mt-0.5 flex-shrink-0 ${paymentMethod === 'razorpay' ? 'text-gold-500' : 'text-onyx-300'}`} />

                  <div><p className="text-sm font-semibold text-onyx-300">Razorpay</p><p className="text-xs text-onyx-300 mt-0.5">Prepaid · Card / UPI / Wallet</p></div>

                </button>

                <button type="button" disabled={isBusy} onClick={() => { setPaymentMethod('cod'); setNotice(COD_UNAVAILABLE_MESSAGE); setError(null); }} className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${paymentMethod === 'cod' ? 'border-gold-400 bg-gold-50' : 'border-gold-200/40 bg-cream-200/30 hover:border-gold-300'}`}>

                  <Truck className={`h-5 w-5 mt-0.5 flex-shrink-0 ${paymentMethod === 'cod' ? 'text-gold-500' : 'text-onyx-300'}`} />

                  <div><p className="text-sm font-semibold text-onyx-300">Cash on Delivery</p><p className="text-xs text-onyx-300 mt-0.5">Currently unavailable</p></div>

                </button>

              </div>

            </div>



            <button type="submit" disabled={isBusy || items.length === 0} className="w-full flex items-center justify-center gap-2 py-3.5 gold-gradient text-cream-100 font-medium rounded-xl shadow-gold hover:scale-[1.01] transition-transform disabled:opacity-60 disabled:cursor-not-allowed mt-6">

              {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : !user ? 'Sign In to Place Order' : paymentMethod === 'razorpay' ? <><Lock className="h-4 w-4" /> Pay {formatINR(totalPrice)} via Razorpay</> : 'Cash on Delivery Unavailable'}

            </button>

          </form>

        </div>

      </div>

    </div>

  );

}
