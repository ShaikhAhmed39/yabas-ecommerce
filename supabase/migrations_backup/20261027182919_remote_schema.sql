


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."attach_return_photo_paths"("p_return_request_id" "uuid", "p_photo_paths" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_return_request_id IS NULL
     OR p_photo_paths IS NULL
     OR cardinality(p_photo_paths) < 1
     OR cardinality(p_photo_paths) > 5
     OR array_position(p_photo_paths, NULL) IS NOT NULL
  THEN
    RETURN false;
  END IF;

  UPDATE public.return_requests
  SET
    photo_paths = p_photo_paths,
    updated_at = now()
  WHERE id = p_return_request_id
    AND cardinality(photo_paths) = 0;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."attach_return_photo_paths"("p_return_request_id" "uuid", "p_photo_paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_payment_webhook_event"("p_event_id" "text", "p_event_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_event public.payment_webhook_events%ROWTYPE;
  v_token uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_event_id IS NULL OR length(p_event_id) < 1 OR length(p_event_id) > 255
     OR p_event_type IS NULL OR length(p_event_type) < 1 OR length(p_event_type) > 255 THEN
    RAISE EXCEPTION 'invalid event details';
  END IF;

  INSERT INTO public.payment_webhook_events (
    razorpay_event_id, event_type, processing_status, claimed_at,
    attempt_count, claim_token, processed_at
  )
  VALUES (p_event_id, p_event_type, 'pending', NULL, 0, NULL, NULL)
  ON CONFLICT (razorpay_event_id) DO NOTHING;

  SELECT *
  INTO v_event
  FROM public.payment_webhook_events
  WHERE razorpay_event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event claim failed';
  END IF;

  IF v_event.processed_at IS NOT NULL OR v_event.processing_status = 'processed' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_processed');
  END IF;

  IF v_event.processing_status = 'processing'
     AND v_event.claimed_at IS NOT NULL
     AND v_event.claimed_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  END IF;

  v_token := gen_random_uuid();

  UPDATE public.payment_webhook_events
  SET event_type = p_event_type,
      processing_status = 'processing',
      claimed_at = now(),
      attempt_count = attempt_count + 1,
      claim_token = v_token
  WHERE razorpay_event_id = p_event_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'claimToken', v_token
  );
END;
$$;


ALTER FUNCTION "public"."claim_payment_webhook_event"("p_event_id" "text", "p_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_payment_webhook_event"("p_event_id" "text", "p_claim_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rows integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.payment_webhook_events
  SET processing_status = 'processed',
      processed_at = now(),
      claimed_at = NULL,
      claim_token = NULL
  WHERE razorpay_event_id = p_event_id
    AND claim_token = p_claim_token
    AND processing_status = 'processing'
    AND processed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows = 1);
END;
$$;


ALTER FUNCTION "public"."complete_payment_webhook_event"("p_event_id" "text", "p_claim_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_order_payment_and_commit_inventory"("p_order_id" "uuid", "p_razorpay_payment_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF p_order_id IS NULL OR p_razorpay_payment_id !~ '^pay_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid payment confirmation';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF v_order.payment_status = 'paid'
     AND v_order.razorpay_payment_id = p_razorpay_payment_id
     AND v_order.inventory_status = 'committed' THEN
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true,
      'orderId', v_order.id, 'paymentStatus', 'paid', 'inventoryStatus', 'committed');
  END IF;

  IF v_order.payment_status = 'paid'
     OR v_order.inventory_status <> 'reserved'
     OR (v_order.razorpay_payment_id IS NOT NULL
         AND v_order.razorpay_payment_id <> p_razorpay_payment_id) THEN
    RAISE EXCEPTION 'order payment/inventory state requires reconciliation';
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid',
      razorpay_payment_id = p_razorpay_payment_id,
      paid_at = coalesce(paid_at, now()),
      payment_error = NULL,
      inventory_status = 'committed'
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'alreadyProcessed', false,
    'orderId', p_order_id, 'paymentStatus', 'paid', 'inventoryStatus', 'committed');
END;
$_$;


ALTER FUNCTION "public"."confirm_order_payment_and_commit_inventory"("p_order_id" "uuid", "p_razorpay_payment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_inventory_reservation"("p_user_id" "uuid", "p_checkout_request_id" "uuid", "p_customer" "jsonb", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_item record;
  v_product public.products%ROWTYPE;
  v_order_id uuid;
  v_total_paise bigint := 0;
  v_line_paise bigint;
  v_count integer;
  v_name text;
  v_address1 text;
  v_address2 text;
  v_city text;
  v_state text;
  v_pincode text;
  v_phone text;
  v_backup text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_user_id IS NULL OR p_checkout_request_id IS NULL
     OR p_customer IS NULL OR jsonb_typeof(p_customer) <> 'object'
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid checkout request';
  END IF;

  SELECT count(*) INTO v_count FROM jsonb_array_elements(p_items);
  IF v_count < 1 OR v_count > 50 THEN
    RAISE EXCEPTION 'invalid cart item count';
  END IF;

  -- Serialize duplicate submissions for the same user + checkout UUID.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_checkout_request_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.orders
  WHERE user_id = p_user_id
    AND checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'pending'
       AND v_existing.payment_status = 'pending'
       AND v_existing.inventory_status = 'reserved' THEN
      RETURN jsonb_build_object(
        'orderId', v_existing.id,
        'totalAmount', v_existing.total_amount,
        'razorpayOrderId', v_existing.razorpay_order_id,
        'inventoryStatus', v_existing.inventory_status,
        'existing', true
      );
    END IF;
    RAISE EXCEPTION 'checkout request already exists and cannot be reused';
  END IF;

  v_name := nullif(btrim(p_customer->>'customer_name'), '');
  v_address1 := nullif(btrim(p_customer->>'shipping_address_line1'), '');
  v_address2 := nullif(btrim(p_customer->>'shipping_address_line2'), '');
  v_city := nullif(btrim(p_customer->>'city'), '');
  v_state := nullif(btrim(p_customer->>'state'), '');
  v_pincode := nullif(btrim(p_customer->>'pincode'), '');
  v_phone := nullif(btrim(p_customer->>'primary_phone'), '');
  v_backup := nullif(btrim(p_customer->>'backup_phone'), '');

  IF v_name IS NULL OR length(v_name) > 120
     OR v_address1 IS NULL OR length(v_address1) > 300
     OR v_city IS NULL OR length(v_city) > 100
     OR v_state IS NULL OR length(v_state) > 100
     OR v_pincode !~ '^[0-9]{6}$'
     OR v_phone !~ '^[0-9]{10}$'
     OR (v_backup IS NOT NULL AND v_backup !~ '^[0-9]{10}$') THEN
    RAISE EXCEPTION 'invalid customer details';
  END IF;

  -- Validate and total products while locking in deterministic product-ID order.
  FOR v_item IN
    SELECT e.value->>'product_id' AS product_id_text,
           sum((e.value->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) e(value)
    GROUP BY e.value->>'product_id'
    ORDER BY e.value->>'product_id'
  LOOP
    IF v_item.product_id_text IS NULL
       OR v_item.product_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR v_item.quantity < 1 OR v_item.quantity > 20 THEN
      RAISE EXCEPTION 'invalid product or quantity';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id_text::uuid
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'product unavailable'; END IF;
    IF v_product.stock < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient stock for %', v_product.title;
    END IF;
    IF v_product.selling_price IS NULL OR v_product.selling_price <= 0 THEN
      RAISE EXCEPTION 'invalid product price';
    END IF;

    v_line_paise := round(v_product.selling_price * 100)::bigint * v_item.quantity;
    IF v_line_paise <= 0 THEN RAISE EXCEPTION 'invalid line amount'; END IF;
    v_total_paise := v_total_paise + v_line_paise;
    IF v_total_paise > 9000000000000000 THEN
      RAISE EXCEPTION 'order amount too large';
    END IF;
  END LOOP;

  IF v_total_paise < 100 THEN
    RAISE EXCEPTION 'minimum online payment amount is INR 1.00';
  END IF;

  INSERT INTO public.orders (
    user_id, checkout_request_id, total_amount, status, payment_method,
    payment_status, payment_error, customer_name, shipping_address_line1,
    shipping_address_line2, city, state, pincode, primary_phone,
    backup_phone, cod_fee, inventory_status
  ) VALUES (
    p_user_id, p_checkout_request_id, v_total_paise / 100.0, 'pending',
    'Razorpay', 'pending', NULL, v_name, v_address1, v_address2,
    v_city, v_state, v_pincode, v_phone, v_backup, 0, 'reserved'
  )
  RETURNING id INTO v_order_id;

  -- The whole function is one transaction: any error rolls back stock and order.
  FOR v_item IN
    SELECT e.value->>'product_id' AS product_id_text,
           sum((e.value->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) e(value)
    GROUP BY e.value->>'product_id'
    ORDER BY e.value->>'product_id'
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id_text::uuid
    FOR UPDATE;

    UPDATE public.products
    SET stock = stock - v_item.quantity
    WHERE id = v_product.id AND stock >= v_item.quantity;

    IF NOT FOUND THEN RAISE EXCEPTION 'stock reservation failed'; END IF;

    INSERT INTO public.order_items (
      order_id, product_id, product_title, unit_price, quantity
    ) VALUES (
      v_order_id, v_product.id, v_product.title,
      round(v_product.selling_price * 100) / 100.0, v_item.quantity
    );
  END LOOP;

  RETURN jsonb_build_object(
    'orderId', v_order_id, 'totalAmount', v_total_paise / 100.0,
    'razorpayOrderId', NULL, 'inventoryStatus', 'reserved', 'existing', false
  );
END;
$_$;


ALTER FUNCTION "public"."create_order_with_inventory_reservation"("p_user_id" "uuid", "p_checkout_request_id" "uuid", "p_customer" "jsonb", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_failed_order_inventory"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF v_order.inventory_status = 'released' THEN
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true,
      'orderId', v_order.id, 'inventoryStatus', 'released');
  END IF;

  IF v_order.inventory_status <> 'reserved'
     OR v_order.payment_status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'only definitively failed/cancelled reserved orders can release stock';
  END IF;

  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    UPDATE public.products SET stock = stock + v_item.quantity
    WHERE id = v_item.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cannot restore stock for product %', v_item.product_id;
    END IF;
  END LOOP;

  UPDATE public.orders SET inventory_status = 'released' WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'alreadyProcessed', false,
    'orderId', p_order_id, 'inventoryStatus', 'released');
END;
$$;


ALTER FUNCTION "public"."release_failed_order_inventory"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_payment_webhook_event_claim"("p_event_id" "text", "p_claim_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rows integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.payment_webhook_events
  SET processing_status = 'pending',
      claimed_at = NULL,
      claim_token = NULL
  WHERE razorpay_event_id = p_event_id
    AND claim_token = p_claim_token
    AND processing_status = 'processing'
    AND processed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows = 1);
END;
$$;


ALTER FUNCTION "public"."release_payment_webhook_event_claim"("p_event_id" "text", "p_claim_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gold_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rate_per_gram_24k" numeric NOT NULL,
    "raw_rate_per_gram" numeric NOT NULL,
    "margin_percent" numeric DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'goldapi.io'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gold_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hero_media_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draft_mode" "text" DEFAULT 'slideshow'::"text" NOT NULL,
    "draft_image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "draft_video_url" "text",
    "published_mode" "text" DEFAULT 'slideshow'::"text" NOT NULL,
    "published_image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "published_video_url" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    CONSTRAINT "hero_media_settings_draft_image_urls_check" CHECK (("jsonb_typeof"("draft_image_urls") = 'array'::"text")),
    CONSTRAINT "hero_media_settings_draft_mode_check" CHECK (("draft_mode" = ANY (ARRAY['slideshow'::"text", 'video'::"text"]))),
    CONSTRAINT "hero_media_settings_published_image_urls_check" CHECK (("jsonb_typeof"("published_image_urls") = 'array'::"text")),
    CONSTRAINT "hero_media_settings_published_mode_check" CHECK (("published_mode" = ANY (ARRAY['slideshow'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."hero_media_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_title" "text" NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "quantity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "total_amount" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "payment_method" "text" DEFAULT 'Razorpay'::"text",
    "razorpay_order_id" "text",
    "razorpay_payment_id" "text",
    "customer_name" "text" NOT NULL,
    "shipping_address_line1" "text" NOT NULL,
    "shipping_address_line2" "text",
    "city" "text" DEFAULT 'Mumbai'::"text" NOT NULL,
    "state" "text" DEFAULT 'Maharashtra'::"text" NOT NULL,
    "pincode" character varying(6) NOT NULL,
    "primary_phone" "text" NOT NULL,
    "backup_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cod_fee" numeric(10,2) DEFAULT 0,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "payment_error" "text",
    "checkout_request_id" "uuid",
    "delivery_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "inventory_status" "text" DEFAULT 'not_reserved'::"text" NOT NULL,
    CONSTRAINT "orders_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'shipped'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'delivery_failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "orders_inventory_status_check" CHECK (("inventory_status" = ANY (ARRAY['not_reserved'::"text", 'reserved'::"text", 'committed'::"text", 'released'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "razorpay_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "claimed_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "claim_token" "uuid",
    CONSTRAINT "payment_webhook_events_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "payment_webhook_events_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'processed'::"text"])))
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "original_price" numeric DEFAULT 0,
    "selling_price" numeric NOT NULL,
    "discount_percent" integer DEFAULT 0,
    "stock" integer DEFAULT 0 NOT NULL,
    "image_url" "text" NOT NULL,
    "material_type" "text",
    "polish_finish" "text",
    "dimensions" "text",
    "category" "text" NOT NULL,
    "sub_category" "text",
    "occasion_wear" "text",
    "is_featured" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."return_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "admin_note" "text",
    "rejection_reason" "text",
    "pickup_scheduled_at" timestamp with time zone,
    "refund_amount" numeric(10,2),
    "refund_initiated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_paths" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "return_requests_description_check" CHECK ((("char_length"("description") >= 10) AND ("char_length"("description") <= 2000))),
    CONSTRAINT "return_requests_reason_check" CHECK ((("char_length"("reason") >= 3) AND ("char_length"("reason") <= 100))),
    CONSTRAINT "return_requests_refund_amount_check" CHECK ((("refund_amount" IS NULL) OR ("refund_amount" >= (0)::numeric))),
    CONSTRAINT "return_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'rejected'::"text", 'pickup_scheduled'::"text", 'received'::"text", 'inspection_passed'::"text", 'inspection_failed'::"text", 'refund_pending'::"text", 'refund_initiated'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."return_requests" REPLICA IDENTITY FULL;


ALTER TABLE "public"."return_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gold_rates"
    ADD CONSTRAINT "gold_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hero_media_settings"
    ADD CONSTRAINT "hero_media_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_id_order_id_t04_key" UNIQUE ("id", "order_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_id_user_id_t04_key" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_razorpay_order_id_key" UNIQUE ("razorpay_order_id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_razorpay_event_id_key" UNIQUE ("razorpay_event_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."return_requests"
    ADD CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key");



CREATE INDEX "gold_rates_created_idx" ON "public"."gold_rates" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_inventory_status" ON "public"."orders" USING "btree" ("inventory_status", "payment_status");



CREATE INDEX "idx_orders_tracking" ON "public"."orders" USING "btree" ("user_id", "razorpay_order_id");



CREATE UNIQUE INDEX "idx_orders_user_checkout_request" ON "public"."orders" USING "btree" ("user_id", "checkout_request_id") WHERE ("checkout_request_id" IS NOT NULL);



CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_payment_webhook_events_pending" ON "public"."payment_webhook_events" USING "btree" ("created_at") WHERE ("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "idx_products_category_lookup" ON "public"."products" USING "btree" ("category");



CREATE INDEX "idx_products_featured_lookup" ON "public"."products" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "idx_return_requests_order_id" ON "public"."return_requests" USING "btree" ("order_id");



CREATE INDEX "idx_return_requests_status" ON "public"."return_requests" USING "btree" ("status");



CREATE INDEX "idx_return_requests_user_id" ON "public"."return_requests" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."return_requests"
    ADD CONSTRAINT "return_requests_item_order_t04_fkey" FOREIGN KEY ("order_item_id", "order_id") REFERENCES "public"."order_items"("id", "order_id");



ALTER TABLE ONLY "public"."return_requests"
    ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."return_requests"
    ADD CONSTRAINT "return_requests_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."return_requests"
    ADD CONSTRAINT "return_requests_order_user_t04_fkey" FOREIGN KEY ("order_id", "user_id") REFERENCES "public"."orders"("id", "user_id");



ALTER TABLE ONLY "public"."return_requests"
    ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



CREATE POLICY "Allow public read access to products" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "Customers can view their own return requests" ON "public"."return_requests" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Public can read gold rates" ON "public"."gold_rates" FOR SELECT USING (true);



CREATE POLICY "Public can read published hero media" ON "public"."hero_media_settings" FOR SELECT TO "authenticated", "anon" USING (("is_published" = true));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own order items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "admin_update_orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_read_own_grant" ON "public"."admin_users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "auth_delete_products" ON "public"."products" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "auth_insert_products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



CREATE POLICY "auth_update_products" ON "public"."products" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."gold_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hero_media_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."return_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_own_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."return_requests";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."attach_return_photo_paths"("p_return_request_id" "uuid", "p_photo_paths" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_return_photo_paths"("p_return_request_id" "uuid", "p_photo_paths" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_payment_webhook_event"("p_event_id" "text", "p_event_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_payment_webhook_event"("p_event_id" "text", "p_event_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_payment_webhook_event"("p_event_id" "text", "p_claim_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_payment_webhook_event"("p_event_id" "text", "p_claim_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_order_payment_and_commit_inventory"("p_order_id" "uuid", "p_razorpay_payment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_order_payment_and_commit_inventory"("p_order_id" "uuid", "p_razorpay_payment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_order_with_inventory_reservation"("p_user_id" "uuid", "p_checkout_request_id" "uuid", "p_customer" "jsonb", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_with_inventory_reservation"("p_user_id" "uuid", "p_checkout_request_id" "uuid", "p_customer" "jsonb", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_failed_order_inventory"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_failed_order_inventory"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_payment_webhook_event_claim"("p_event_id" "text", "p_claim_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_payment_webhook_event_claim"("p_event_id" "text", "p_claim_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."gold_rates" TO "anon";
GRANT ALL ON TABLE "public"."gold_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."gold_rates" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hero_media_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hero_media_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."hero_media_settings" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "service_role";
GRANT SELECT ON TABLE "public"."order_items" TO "authenticated";



GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT SELECT ON TABLE "public"."orders" TO "authenticated";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."return_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."return_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































