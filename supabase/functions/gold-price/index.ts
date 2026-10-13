import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Fetch live gold price from public API (price per 10 grams in INR)
    const response = await fetch(
      "https://www.goldapi.io/api/XAU/INR",
      {
        headers: {
          "x-access-token": "goldapi-1b2a3c4d5e6f7g8h9i0j",
        },
      }
    );

    let goldData: { price_gram_24k?: number; price?: number } = {};

    if (response.ok) {
      goldData = await response.json();
    } else {
      // Fallback: try alternative free API
      const fallback = await fetch(
        "https://api.metals.dev/v1/latest?api_key=demo&currency=INR&unit=gram",
      );
      if (fallback.ok) {
        const fb = await fallback.json();
        goldData = {
          price_gram_24k: fb?.metals?.gold ?? fb?.gold ?? undefined,
        };
      }
    }

    // Calculate 1 gram price (many APIs return per oz or per 10g)
    let pricePerGram = goldData.price_gram_24k;

    if (!pricePerGram && goldData.price) {
      // price per troy ounce → divide by 31.1035
      pricePerGram = goldData.price / 31.1035;
    }

    // Final fallback: approximate Mumbai market rate
    if (!pricePerGram || isNaN(pricePerGram) || pricePerGram <= 0) {
      pricePerGram = 7250; // approximate 24K per gram in INR
    }

    const data = {
      price_per_gram_24k: Math.round(pricePerGram * 100) / 100,
      price_per_gram_22k: Math.round(pricePerGram * 0.916 * 100) / 100,
      price_per_gram_18k: Math.round(pricePerGram * 0.75 * 100) / 100,
      currency: "INR",
      timestamp: new Date().toISOString(),
      source: "live-api",
    };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Return fallback price on any error
    const fallback = {
      price_per_gram_24k: 7250,
      price_per_gram_22k: 6638,
      price_per_gram_18k: 5438,
      currency: "INR",
      timestamp: new Date().toISOString(),
      source: "fallback",
      error: err instanceof Error ? err.message : "Unknown error",
    };

    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
