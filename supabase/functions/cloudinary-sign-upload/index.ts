import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://yabasjewellers.com",
  "https://www.yabasjewellers.com",
  "https://yabas.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173",
]);

const UPLOAD_PRESET = "yabas_hero_media";
const HERO_FOLDER = "yabas/hero";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createCloudinarySignature(
  params: Record<string, string>,
  apiSecret: string,
): Promise<string> {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const input = new TextEncoder().encode(canonical + apiSecret);
  const digest = await crypto.subtle.digest("SHA-1", input);

  return bytesToHex(new Uint8Array(digest));
}

function validCloudinaryUrl(value: unknown, cloudName: string): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/`)
    );
  } catch {
    return false;
  }
}

function cloudinaryAssetFromUrl(
  value: string,
  cloudName: string,
): { publicId: string; resourceType: "image" | "video" } | null {
  if (!validCloudinaryUrl(value, cloudName)) return null;
  const url = new URL(value);
  const match = url.pathname.match(
    new RegExp(`^/${cloudName}/(image|video)/upload/(.+)$`),
  );
  if (!match) return null;

  const resourceType = match[1] as "image" | "video";
  const pathAfterUpload = match[2].split("/");
  if (pathAfterUpload[0]?.startsWith("v") && /^v\d+$/.test(pathAfterUpload[0])) {
    pathAfterUpload.shift();
  }
  const last = pathAfterUpload.length - 1;
  pathAfterUpload[last] = pathAfterUpload[last].replace(/\.[a-zA-Z0-9]+$/, "");
  const publicId = decodeURIComponent(pathAfterUpload.join("/"));
  if (!publicId.startsWith(`${HERO_FOLDER}/`)) return null;
  return { publicId, resourceType };
}

async function deleteCloudinaryAsset(
  publicId: string,
  resourceType: "image" | "video",
  apiKey: string,
  apiSecret: string,
): Promise<boolean> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { public_id: publicId, timestamp };
  const signature = await createCloudinarySignature(params, apiSecret);
  const form = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: apiKey,
    signature,
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(Deno.env.get("CLOUDINARY_CLOUD_NAME") || "")}/${resourceType}/destroy`,
    { method: "POST", body: form },
  );
  const result = await response.json().catch(() => null);
  return response.ok && result?.result === "ok";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Origin not allowed.", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": origin,
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required." }, 401, origin);
    }

    const token = authHeader.slice("Bearer ".length);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey ||
      !cloudName ||
      !apiKey ||
      !apiSecret
    ) {
      console.error("Required server configuration is missing.");
      return jsonResponse(
        { error: "Server configuration is incomplete." },
        500,
        origin,
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse(
        { error: "Invalid or expired session." },
        401,
        origin,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: admin, error: adminError } = await adminClient
      .from("admin_users")
      .select("id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Admin authorization lookup failed.");
      return jsonResponse(
        { error: "Could not verify administrator access." },
        500,
        origin,
      );
    }

    if (!admin) {
      return jsonResponse(
        { error: "Administrator access required." },
        403,
        origin,
      );
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;

    // Existing responsibility: issue a signed Cloudinary upload request.
    if (
      !action &&
      (body?.resourceType === "image" || body?.resourceType === "video")
    ) {
      const resourceType = body.resourceType as "image" | "video";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const publicId = `hero_${crypto.randomUUID()}`;

      const paramsToSign: Record<string, string> = {
        folder: HERO_FOLDER,
        overwrite: "false",
        public_id: publicId,
        timestamp,
        upload_preset: UPLOAD_PRESET,
      };

      const signature = await createCloudinarySignature(
        paramsToSign,
        apiSecret,
      );

      return jsonResponse(
        {
          cloudName,
          apiKey,
          timestamp: Number(timestamp),
          signature,
          folder: HERO_FOLDER,
          publicId,
          uploadPreset: UPLOAD_PRESET,
          resourceType,
        },
        200,
        origin,
      );
    }

    if (action === "load") {
      const { data, error } = await adminClient
        .from("hero_media_settings")
        .select(
          "id,draft_mode,draft_image_urls,draft_video_url,published_mode,published_image_urls,published_video_url,is_published",
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Hero settings load failed:", error.message);
        return jsonResponse(
          { error: "Could not load hero settings." },
          500,
          origin,
        );
      }

      return jsonResponse({ settings: data }, 200, origin);
    }

    if (action === "hideFromLive") {
      const mediaUrl = body?.url;
      const requestedType = body?.resourceType;
      if (typeof mediaUrl !== "string" || requestedType !== "image") {
        return jsonResponse({ error: "Provide a valid image URL to hide from the live hero." }, 400, origin);
      }

      const asset = cloudinaryAssetFromUrl(mediaUrl, cloudName);
      if (!asset || asset.resourceType !== "image") {
        return jsonResponse({ error: "This is not a valid image in the configured hero Cloudinary folder." }, 400, origin);
      }

      const { data: settings, error: settingsError } = await adminClient
        .from("hero_media_settings")
        .select("id,published_image_urls,is_published")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsError || !settings) {
        return jsonResponse({ error: "Could not locate saved hero settings." }, 500, origin);
      }

      const publishedImages = Array.isArray(settings.published_image_urls) ? settings.published_image_urls : [];
      if (!publishedImages.includes(mediaUrl)) {
        return jsonResponse({ error: "This image is not currently in the published hero." }, 409, origin);
      }

      const { error: updateError } = await adminClient
        .from("hero_media_settings")
        .update({
          published_image_urls: publishedImages.filter((url: string) => url !== mediaUrl),
          updated_by: authData.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);

      if (updateError) {
        console.error("Temporary live hero removal failed:", updateError.message);
        return jsonResponse({ error: "Could not temporarily remove the image from the live hero." }, 500, origin);
      }

      return jsonResponse({ success: true, action, retainedInDraft: true }, 200, origin);
    }

    if (action === "publishImage") {
      const mediaUrl = body?.url;
      if (typeof mediaUrl !== "string" || body?.resourceType !== "image") {
        return jsonResponse({ error: "Provide a valid image URL to publish." }, 400, origin);
      }

      const asset = cloudinaryAssetFromUrl(mediaUrl, cloudName);
      if (!asset || asset.resourceType !== "image") {
        return jsonResponse({ error: "This is not a valid image in the configured hero Cloudinary folder." }, 400, origin);
      }

      const { data: settings, error: settingsError } = await adminClient
        .from("hero_media_settings")
        .select("id,draft_image_urls,published_image_urls,is_published")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsError || !settings) {
        return jsonResponse({ error: "Could not locate saved hero settings." }, 500, origin);
      }

      const draftImages = Array.isArray(settings.draft_image_urls) ? settings.draft_image_urls : [];
      const publishedImages = Array.isArray(settings.published_image_urls) ? settings.published_image_urls : [];
      if (!draftImages.includes(mediaUrl)) {
        return jsonResponse({ error: "This image is not in your saved draft. Save the draft first, then publish it." }, 409, origin);
      }
      if (publishedImages.includes(mediaUrl)) {
        return jsonResponse({ success: true, action, publishedImageUrls: publishedImages, alreadyPublished: true }, 200, origin);
      }
      if (publishedImages.length >= 5) {
        return jsonResponse({ error: "The live hero already has five images. Temporarily hide one before publishing another." }, 409, origin);
      }

      const now = new Date().toISOString();
      const nextPublishedImages = [...publishedImages, mediaUrl];
      const { error: updateError } = await adminClient
        .from("hero_media_settings")
        .update({
          published_mode: "slideshow",
          published_image_urls: nextPublishedImages,
          published_video_url: null,
          is_published: true,
          published_at: now,
          updated_by: authData.user.id,
          updated_at: now,
        })
        .eq("id", settings.id);

      if (updateError) {
        console.error("Single hero image publish failed:", updateError.message);
        return jsonResponse({ error: "Could not publish the selected image." }, 500, origin);
      }

      return jsonResponse({ success: true, action, publishedImageUrls: nextPublishedImages }, 200, origin);
    }

    if (action === "deleteMedia") {
      const mediaUrl = body?.url;
      const requestedType = body?.resourceType;
      if (typeof mediaUrl !== "string" || (requestedType !== "image" && requestedType !== "video")) {
        return jsonResponse({ error: "Provide a valid media URL and resource type." }, 400, origin);
      }

      const asset = cloudinaryAssetFromUrl(mediaUrl, cloudName);
      if (!asset || asset.resourceType !== requestedType) {
        return jsonResponse({ error: "This media URL is not a valid asset in the configured hero Cloudinary folder." }, 400, origin);
      }

      const { data: settings, error: settingsError } = await adminClient
        .from("hero_media_settings")
        .select("id,draft_image_urls,draft_video_url,published_image_urls,published_video_url,is_published")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsError || !settings) {
        return jsonResponse({ error: "Could not locate saved hero settings for this media." }, 500, origin);
      }

      const draftImages = Array.isArray(settings.draft_image_urls) ? settings.draft_image_urls : [];
      const publishedImages = Array.isArray(settings.published_image_urls) ? settings.published_image_urls : [];
      const referenced = requestedType === "image"
        ? draftImages.includes(mediaUrl) || publishedImages.includes(mediaUrl)
        : settings.draft_video_url === mediaUrl || settings.published_video_url === mediaUrl;

      if (!referenced) {
        return jsonResponse({ error: "This media is no longer referenced by the saved hero settings. Refresh the manager and try again." }, 409, origin);
      }

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        updated_by: authData.user.id,
        updated_at: now,
      };
      if (requestedType === "image") {
        patch.draft_image_urls = draftImages.filter((url: string) => url !== mediaUrl);
        patch.published_image_urls = publishedImages.filter((url: string) => url !== mediaUrl);
      } else {
        if (settings.draft_video_url === mediaUrl) patch.draft_video_url = null;
        if (settings.published_video_url === mediaUrl) patch.published_video_url = null;
      }

      const { error: updateError } = await adminClient
        .from("hero_media_settings")
        .update(patch)
        .eq("id", settings.id);
      if (updateError) {
        console.error("Hero media reference removal failed:", updateError.message);
        return jsonResponse({ error: "Could not remove this media from Supabase settings." }, 500, origin);
      }

      let cloudinaryDeleted = false;
      try {
        cloudinaryDeleted = await deleteCloudinaryAsset(
          asset.publicId,
          asset.resourceType,
          apiKey,
          apiSecret,
        );
      } catch (deleteError) {
        console.error("Cloudinary deletion failed:", deleteError instanceof Error ? deleteError.message : "Unknown error");
      }

      return jsonResponse({
        success: true,
        action,
        cloudinaryDeleted,
        isPublished: Boolean(settings.is_published),
      }, 200, origin);
    }

    if (action === "save" || action === "publish") {
      const mode = body?.mode;
      const imageUrls = body?.imageUrls;
      const videoUrl = body?.videoUrl ?? null;

      if (mode !== "slideshow" && mode !== "video") {
        return jsonResponse(
          { error: "mode must be slideshow or video." },
          400,
          origin,
        );
      }

      if (
        !Array.isArray(imageUrls) ||
        imageUrls.length > 5 ||
        !imageUrls.every((url: unknown) => validCloudinaryUrl(url, cloudName))
      ) {
        return jsonResponse(
          {
            error:
              "Image URLs must be valid HTTPS URLs from this Cloudinary account; a maximum of five is allowed.",
          },
          400,
          origin,
        );
      }

      if (mode === "slideshow" && imageUrls.length < 1) {
        return jsonResponse(
          { error: "Choose at least one image for a slideshow." },
          400,
          origin,
        );
      }

      if (mode === "video" && !validCloudinaryUrl(videoUrl, cloudName)) {
        return jsonResponse(
          { error: "Choose a valid Cloudinary video URL." },
          400,
          origin,
        );
      }

      const { data: existing, error: findError } = await adminClient
        .from("hero_media_settings")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error("Hero settings lookup failed:", findError.message);
        return jsonResponse(
          { error: "Could not locate hero settings." },
          500,
          origin,
        );
      }

      const now = new Date().toISOString();
      const row: Record<string, unknown> = {
        draft_mode: mode,
        draft_image_urls: mode === "slideshow" ? imageUrls : [],
        draft_video_url: mode === "video" ? videoUrl : null,
        updated_by: authData.user.id,
        updated_at: now,
      };

      if (action === "publish") {
        row.published_mode = mode;
        row.published_image_urls = mode === "slideshow" ? imageUrls : [];
        row.published_video_url = mode === "video" ? videoUrl : null;
        row.is_published = true;
        row.published_at = now;
      }

      let result;
      if (existing?.id) {
        result = await adminClient
          .from("hero_media_settings")
          .update(row)
          .eq("id", existing.id)
          .select("id")
          .single();
      } else {
        result = await adminClient
          .from("hero_media_settings")
          .insert(row)
          .select("id")
          .single();
      }

      if (result.error) {
        console.error("Hero settings write failed:", result.error.message);
        return jsonResponse(
          { error: "Could not save hero settings." },
          500,
          origin,
        );
      }

      return jsonResponse(
        { success: true, action, id: result.data.id },
        200,
        origin,
      );
    }

    return jsonResponse(
      {
        error:
          "Unsupported request. Use resourceType for uploads or action load/save/publish/publishImage/hideFromLive/deleteMedia for settings.",
      },
      400,
      origin,
    );
  } catch (error) {
    console.error(
      "Hero media request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return jsonResponse(
      { error: "Hero media request failed." },
      500,
      origin,
    );
  }
});
