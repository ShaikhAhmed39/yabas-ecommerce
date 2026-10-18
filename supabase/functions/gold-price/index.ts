import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const res = await fetch("https://www.goldapi.io/api/price/XAU/INR", {
    headers: { "x-access-token": Deno.env.get("GOLDAPI_KEY")! },
  });
  if (!res.ok) return new Response(`GoldAPI error ${res.status}`, { status: 502 });

  const data = await res.json();
  const raw = Number(data?.melt_price_per_gram?.["24k"]);
  if (!Number.isFinite(raw) || raw < 1000 || raw > 100000) {
    return new Response("Invalid price from API", { status: 502 });
  }

  const { data: setting } = await supabase
    .from("site_settings").select("value")
    .eq("key", "gold_margin_percent").single();
  const margin = Number(setting?.value ?? 0);
  const finalRate = Math.round(raw * (1 + margin / 100));

  const { error } = await supabase.from("gold_rates").insert({
    rate_per_gram_24k: finalRate,
    raw_rate_per_gram: raw,
    margin_percent: margin,
  });
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ ok: true, raw, margin, finalRate });
});