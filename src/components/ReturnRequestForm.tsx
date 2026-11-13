import { useRef, useState } from 'react';

import type { FormEvent } from 'react';

import { ArrowLeft, ImagePlus, X } from 'lucide-react';

import {

  compressImageToWebP,

  formatFileSize,

} from '@/utils/imageCompress';

const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024; // 10 MB

const MAX_COMPRESSED_SIZE = 10 * 1024 * 1024; // 10 MB

const MAX_PHOTOS = 5;

const ALLOWED_TYPES = new Set([

  'image/jpeg',

  'image/png',

  'image/webp',

]);

const RETURN_REASONS = [

  'Damaged or defective',

  'Wrong item received',

  'Item differs from description',

  'Quality issue',

  'Other',

];

interface ReturnRequestFormProps {

  orderId: string;

  orderItemId: string;

  productTitle: string;

  /** how many pieces of this line can still be returned */

  maxQuantity?: number;

  onCancel: () => void;

  onSubmit?: (data: {

    reason: string;

    description: string;

    photos: File[];

    quantity: number;

  }) => void | Promise<void>;

}

export function ReturnRequestForm({

  orderId,

  orderItemId,

  productTitle,

  maxQuantity = 1,

  onCancel,

  onSubmit,

}: ReturnRequestFormProps) {

  const inputRef = useRef<HTMLInputElement>(null);

  const [reason, setReason] = useState('');

  const [quantity, setQuantity] = useState(1);

  const [description, setDescription] = useState('');

  const [photos, setPhotos] = useState<File[]>([]);

  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState(false);

  const addPhotos = (selected: FileList | null) => {

    if (!selected) return;

    setError(null);

    const incoming = Array.from(selected);

    if (photos.length + incoming.length > MAX_PHOTOS) {

      setError(`You can select a maximum of ${MAX_PHOTOS} photos.`);

      return;

    }

    for (const file of incoming) {

      if (!ALLOWED_TYPES.has(file.type)) {

        setError('Only JPEG, PNG, and WebP images are allowed.');

        return;

      }

      if (file.size === 0 || file.size > MAX_ORIGINAL_SIZE) {

        setError('Each original image must be 10 MB or smaller.');

        return;

      }

    }

    setPhotos((current) => [...current, ...incoming]);

    setPreviewUrls((current) => [

      ...current,

      ...incoming.map((file) => URL.createObjectURL(file)),

    ]);

  };

  const removePhoto = (index: number) => {

    URL.revokeObjectURL(previewUrls[index]);

    setPhotos((current) => current.filter((_, i) => i !== index));

    setPreviewUrls((current) =>

      current.filter((_, i) => i !== index),

    );

  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault();

    setError(null);

    if (!orderId || !orderItemId) {

      setError('The order or product information is missing.');

      return;

    }

    if (!reason) {

      setError('Please select a reason for your return.');

      return;

    }

    if (reason.trim().length < 3 || reason.trim().length > 100) {

      setError('The return reason must be 3–100 characters.');

      return;

    }

    if (

      description.trim().length < 10 ||

      description.trim().length > 2000

    ) {

      setError(

        'Please provide a description between 10 and 2000 characters.',

      );

      return;

    }

    setBusy(true);

    try {

      // Recheck the original size and validate the compressed output.

      for (const photo of photos) {

        if (

          photo.size === 0 ||

          photo.size > MAX_ORIGINAL_SIZE ||

          !ALLOWED_TYPES.has(photo.type)

        ) {

          throw new Error(

            'A selected photo is invalid or exceeds the 10 MB limit.',

          );

        }

        const compressed = await compressImageToWebP(photo);

        if (

          compressed.size === 0 ||

          compressed.size > MAX_COMPRESSED_SIZE

        ) {

          throw new Error(

            `${photo.name} exceeds the 10 MB limit after compression. Please choose a smaller image.`,

          );

        }

      }

      if (!onSubmit) {

        throw new Error(

          'Return submission is not connected yet. Your information has not been submitted.',

        );

      }

      await onSubmit({

        reason: reason.trim(),

        description: description.trim(),

        photos,

        quantity: Math.min(Math.max(quantity, 1), maxQuantity),

      });

      setSuccess(true);

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : 'Unable to prepare your return request.',

      );

    } finally {

      setBusy(false);

    }

  };

  return (

    <main className="min-h-screen bg-cream-100 px-4 py-8 sm:px-6">

      <div className="mx-auto max-w-2xl">

        <button

          type="button"

          onClick={onCancel}

          className="mb-6 inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900"

        >

          <ArrowLeft size={16} />

          Back to My Orders

        </button>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">

          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">

            Yaba's Jewelry

          </p>

          <h1 className="mt-2 text-2xl font-semibold text-stone-900">

            Request a Return

          </h1>

          <p className="mt-2 text-sm text-stone-600">

            Product:{' '}

            <span className="font-medium">{productTitle}</span>

          </p>

          {success ? (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5">
              <p className="font-semibold text-green-800">
                Return request submitted successfully!
              </p>
              <p className="mt-1 text-sm text-green-700">
                Your return request has been received. You can check its status
                in My Orders.
              </p>
              <button
                type="button"
                onClick={onCancel}
                className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                Back to My Orders
              </button>
            </div>
          ) : (

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">

              {maxQuantity > 1 && (

                <div>

                  <label htmlFor="return-quantity" className="mb-2 block text-sm font-medium text-stone-800">

                    How many pieces do you want to return?

                  </label>

                  <select

                    id="return-quantity"

                    value={quantity}

                    onChange={(event) => setQuantity(Number(event.target.value))}

                    className="w-full rounded-lg border border-cream-400 bg-white px-3 py-2.5 text-sm sm:w-48"

                  >

                    {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (

                      <option key={n} value={n}>{n} of {maxQuantity}</option>

                    ))}

                  </select>

                </div>

              )}

              <div>

                <label

                  htmlFor="return-reason"

                  className="mb-2 block text-sm font-medium text-stone-800"

                >

                  Reason for return

                </label>

                <select

                  id="return-reason"

                  value={reason}

                  onChange={(event) => setReason(event.target.value)}

                  required

                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm outline-none focus:border-stone-600"

                >

                  <option value="">Select a reason</option>

                  {RETURN_REASONS.map((item) => (

                    <option key={item} value={item}>

                      {item}

                    </option>

                  ))}

                </select>

              </div>

              <div>

                <label

                  htmlFor="return-description"

                  className="mb-2 block text-sm font-medium text-stone-800"

                >

                  Describe the issue

                </label>

                <textarea

                  id="return-description"

                  value={description}

                  onChange={(event) => setDescription(event.target.value)}

                  minLength={10}

                  maxLength={2000}

                  rows={5}

                  required

                  placeholder="Tell us what happened and why you want to return this item..."

                  className="w-full resize-y rounded-lg border border-stone-300 px-3 py-3 text-sm outline-none focus:border-stone-600"

                />

                <p className="mt-1 text-right text-xs text-stone-500">

                  {description.length}/2000

                </p>

              </div>

              <div>

                <div className="mb-2 flex items-center justify-between gap-3">

                  <label className="text-sm font-medium text-stone-800">

                    Photos of the item

                  </label>

                  <span className="text-xs text-stone-500">

                    Optional · Up to {MAX_PHOTOS}

                  </span>

                </div>

                <input

                  ref={inputRef}

                  type="file"

                  accept="image/jpeg,image/png,image/webp"

                  multiple

                  onChange={(event) => {

                    addPhotos(event.target.files);

                    event.target.value = '';

                  }}

                  className="hidden"

                />

                <button

                  type="button"

                  onClick={() => inputRef.current?.click()}

                  disabled={photos.length >= MAX_PHOTOS || busy}

                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"

                >

                  <ImagePlus size={20} />

                  Add photos

                </button>

                <p className="mt-2 text-xs text-stone-500">

                  JPEG, PNG, or WebP. Each original image must be

                  10 MB or smaller. Photos are compressed before upload.

                </p>

                {previewUrls.length > 0 && (

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">

                    {previewUrls.map((url, index) => (

                      <div

                        key={url}

                        className="relative overflow-hidden rounded-xl border border-stone-200"

                      >

                        <img

                          src={url}

                          alt={`Return evidence ${index + 1}`}

                          className="h-32 w-full object-cover"

                        />

                        <div className="p-2">

                          <p className="truncate text-xs text-stone-700">

                            {photos[index]?.name}

                          </p>

                          <p className="text-xs text-stone-500">

                            {formatFileSize(photos[index]?.size ?? 0)}

                          </p>

                        </div>

                        <button

                          type="button"

                          onClick={() => removePhoto(index)}

                          disabled={busy}

                          aria-label={`Remove photo ${index + 1}`}

                          className="absolute right-2 top-2 rounded-full bg-white p-1.5 text-stone-700 shadow hover:bg-stone-100"

                        >

                          <X size={14} />

                        </button>

                      </div>

                    ))}

                  </div>

                )}

              </div>

              {error && (

                <div

                  role="alert"

                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"

                >

                  {error}

                </div>

              )}

              <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">

                Return requests are subject to delivery verification,

                the seven-day return window, and product inspection.

                Refunds are initiated within 3–5 working days after

                return approval and receipt/inspection of the product,

                where the return is eligible.

              </div>

              <button

                type="submit"

                disabled={busy}

                className="w-full rounded-lg bg-stone-900 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"

              >

                {busy ? 'Preparing request...' : 'Continue'}

              </button>

            </form>

          )}

        </section>

      </div>

    </main>

  );

}
