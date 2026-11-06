# Yaba's Jewellery: production setup guide

Do these in order. Every step says **why**, so you can fix things yourself later.

## 0. What changed (one minute)

| Area | Before | Now |
|---|---|---|
| Orders | 1 status column, no order number | Order numbers `YB001001`, separate **order / payment / shipment / return+refund** states, audit trail per order |
| Delivery | Admin typed a status by hand | Shiprocket booking (courier, AWB, pickup, label) + automatic tracking by webhook |
| Returns | Admin clicked statuses, refunds were manual | Approve = pickup booked at the customer; courier delivery marks "received"; refund via Razorpay with duplicate protection |
| Payments | Verified in browser callback only | Signature + Razorpay re-check, `authorized` payments captured, webhook for every event, late/duplicate payments auto-refunded, 15-minute safety-net job |
| Customer | Basic list | Order tracker, parcel timeline, cancel before pickup, return flow with photos, refund status |

**Why four separate states?** "Paid", "packed", "on the way" and "refunded" are different facts that change at different times and from different sources (Razorpay vs the courier). One column cannot hold them without lying.

## 1. Database

1. Supabase -> SQL Editor -> run `supabase/migrations/20261028090000_production_orders_shipping_refunds.sql` (or `supabase db push`).
2. It is safe on your live data: existing orders get order numbers, duplicate return requests are auto-cancelled, nothing is deleted. It was tested by upgrading a copy of the old schema that contained data.
3. In **Authentication -> Providers -> Email**: set minimum password length to 8, keep "Confirm email" ON, and add your site URL under **URL Configuration** (needed for the password-reset link).
4. Make sure your own user exists in `admin_users` (column `id` = your auth user id).

## 2. Razorpay

1. Dashboard -> **API Keys**: copy Key Id and Secret.
2. **Webhooks -> Add**: URL `https://<PROJECT_REF>.supabase.co/functions/v1/razorpay-webhook`, type your own **Secret** (this is `RAZORPAY_WEBHOOK_SECRET`), tick: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `refund.failed`.
3. Settings -> **Payment capture**: Automatic (recommended). If it is Manual, the code still captures for you.
4. **Test first** with `rzp_test_` keys. Going live = replace the 3 Razorpay secrets with `rzp_live_` ones **and** set `APP_ENV=production`. With `APP_ENV=production` the system refuses to take payments on a test key.

## 3. Shiprocket

1. Shiprocket panel -> **Settings -> API -> Create API User**. Use a **separate** e-mail (Shiprocket does not allow the main login). Put it in `SHIPROCKET_API_EMAIL` / `SHIPROCKET_API_PASSWORD`.
2. **Settings -> Pickup Addresses**: add your shop address and note its exact nickname -> `SHIPROCKET_PICKUP_LOCATION`, its pincode -> `SHIPROCKET_PICKUP_PINCODE`.
3. Recharge the Shiprocket **wallet** (a booking fails if the wallet is empty; the admin screen shows the reason).
4. **Settings -> API -> Webhooks**: URL `https://<PROJECT_REF>.supabase.co/functions/v1/courier-webhook`, token = your `SHIPROCKET_WEBHOOK_TOKEN`. (The function name has no brand word on purpose.)
5. Fill the `WAREHOUSE_*` values: this is where customer **returns** are sent.
6. Keep `SHIPPING_MODE=mock` until step 7 passes, then set `SHIPPING_MODE=live`.

### Please verify once in your own Shiprocket account
I could not test against a real Shiprocket account, so these four points are written from their public API documentation, not from a live run. Each is isolated in one file (`supabase/functions/_shared/shipping/shiprocket.ts` or `payloads.ts`), so a fix is a few lines:
1. The **return order** endpoint/fields (`/orders/create/return`).
2. The **webhook payload** field names (the parser accepts several variants).
3. The public **tracking URL** pattern (`TRACKING_URL_TEMPLATE`).
4. **Cancel** by order id (`/orders/cancel`).

A single test return in the Shiprocket sandbox/panel settles all four.

## 4. Deploy the functions

```bash
supabase link --project-ref <PROJECT_REF>
supabase secrets set --env-file supabase/functions/.env.production
supabase functions deploy            # deploys every function in supabase/functions
```
`supabase/config.toml` already marks `razorpay-webhook`, `courier-webhook`, `reconcile-orders`, `check-delivery` as public (they prove who they are by signature/token). Everything else requires a signed-in user, and admin functions additionally check `admin_users` on the server.

## 5. Safety-net job

Open `supabase/cron.sql`, replace `<PROJECT_REF>` and `<CRON_SECRET>`, run it once. Every 15 minutes it: settles payments whose webhook never arrived, frees stock held by abandoned checkouts, retries refunds Razorpay did not answer, and polls parcels with no update for 6 hours.

## 6. Frontend

Vercel/Netlify env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RETURN_WINDOW_DAYS`. Build `npm run build`, output `dist`. Then set `ALLOWED_ORIGINS` (backend) to your real domain(s).

## 7. Test checklist (use mock mode + Razorpay test keys)

| # | Do | Expect |
|---|---|---|
| 1 | Pay with a Razorpay test card | Order `YB00xxxx` in My Orders = Paid; admin "To ship" shows it; stock reduced |
| 2 | Close the Razorpay window before paying, wait 30+ min (or run the cron) | Order expires, stock returns |
| 3 | Admin -> order -> **Book shipment** | AWB + courier appear; order = Processing |
| 4 | (mock) **Simulate** picked up -> delivered | Customer timeline updates; order = Delivered; delivered e-mail (if Resend set) |
| 5 | Customer -> Return item (with photo) | Admin Returns -> Needs action |
| 6 | Admin approve | Pickup booked automatically; customer sees return tracker |
| 7 | Simulate return delivered, inspection passed, set amount, **Issue refund** | Refund pending then processed (Razorpay test dashboard shows it) |
| 8 | Pay, then cancel before shipping | Order cancelled, stock back, full refund started |
| 9 | Press the return **Issue refund** button twice quickly | Only one refund (idempotent) |
| 10 | Switch to `SHIPPING_MODE=live` with Shiprocket test pickup | Real AWB, label opens, webhook updates arrive |

## 8. Known limits (honest list)

* **Prepaid only.** Cash on delivery is shown as unavailable; adding it needs COD remittance reconciliation.
* One order = one parcel (Shiprocket cannot split a shipment).
* Refunds made by hand in the Razorpay dashboard are **not** linked to a return. Always refund from the admin screen.
* E-mails need a Resend account and a verified domain; WhatsApp/SMS are not included.
* Shiprocket tracking text is mapped by a rule table (`_shared/shipping/status.ts`); an unknown courier status is stored in the timeline but changes nothing, which is the safe default.

## 9. Tests in this repo

```bash
PGPORT=5433 ./supabase/tests/run.sh                # 16 database scenarios (payments, refunds, shipments, permissions)
PGPORT=5433 ./supabase/tests/upgrade_with_data.sh  # upgrade a legacy schema that contains data
cd supabase/functions && deno test --allow-env _shared/tests/
npm run typecheck && npm run lint && npm run build
```
(The SQL tests need a local Postgres 16; see the header of `supabase/tests/run.sh`.)
