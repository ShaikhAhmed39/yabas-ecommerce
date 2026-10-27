import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Video,
  Trash2,
  Upload,
  MonitorPlay,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type HeroMode = "slideshow" | "video";
type HeroImage = {
  id: string;
  file: File | null;
  previewUrl: string;
  cloudinaryUrl?: string;
};
type SigningResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadPreset: string;
  resourceType: "image" | "video";
};
type HeroSettings = {
  id: string;
  draft_mode: HeroMode;
  draft_image_urls: string[];
  draft_video_url: string | null;
  published_image_urls?: string[] | null;
  published_video_url?: string | null;
  published_mode?: HeroMode;
  is_published: boolean;
};
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];

export function HeroMediaManager() {
  const [mode, setMode] = useState<HeroMode>("slideshow");
  const [images, setImages] = useState<HeroImage[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [liveImageUrls, setLiveImageUrls] = useState<string[]>([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const imageUrls = useRef(new Set<string>());
  const videoObjectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      imageUrls.current.forEach((url) => URL.revokeObjectURL(url));
      if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current);
    },
    [],
  );

  const invokeAdmin = async (body: Record<string, unknown>) => {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session)
      throw new Error("Your session has expired. Sign in again.");
    const { data, error: invokeError } = await supabase.functions.invoke(
      "cloudinary-sign-upload",
      { body },
    );
    if (invokeError)
      throw new Error(
        invokeError.message || "The hero media function request failed.",
      );
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSettings(true);
      try {
        const data = await invokeAdmin({ action: "load" });
        const settings = data?.settings as HeroSettings | null;
        if (!settings || cancelled) return;
        setMode(settings.draft_mode);
        setImages(
          (settings.draft_image_urls || []).map((url, index) => ({
            id: `saved-${index}-${url}`,
            file: null,
            previewUrl: url,
            cloudinaryUrl: url,
          })),
        );
        setUploadedVideoUrl(settings.draft_video_url || "");
        setVideoPreview(settings.draft_video_url || "");
        setLiveImageUrls(settings.is_published ? (settings.published_image_urls || []) : []);
        setIsPublished(Boolean(settings.is_published));
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load saved hero settings.",
          );
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // invokeAdmin is intentionally defined from stable Supabase client; load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addImages = (files: FileList | null) => {
    if (!files) return;
    setError("");
    setNotice("");
    const incoming = Array.from(files);
    if (images.length + incoming.length > MAX_IMAGES) {
      setError(`Choose no more than ${MAX_IMAGES} hero images in total.`);
      return;
    }
    for (const file of incoming) {
      if (!IMAGE_TYPES.includes(file.type)) {
        setError("Use JPG, PNG or WebP images only.");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`${file.name} exceeds the 15 MB image limit.`);
        return;
      }
    }
    const added = incoming.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      imageUrls.current.add(previewUrl);
      return { id: crypto.randomUUID(), file, previewUrl };
    });
    setImages((current) => [...current, ...added]);
  };

  const removeImage = (id: string) => {
    setImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
        imageUrls.current.delete(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
    setError("");
    setNotice("");
  };

  const hideImageFromLive = async (url: string, label: string) => {
    const confirmed = window.confirm(
      `Temporarily remove “${label}” from the live homepage? The file will remain in Supabase draft settings and Cloudinary, so you can publish it again later.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await invokeAdmin({ action: "hideFromLive", url, resourceType: "image" });
      setLiveImageUrls((current) => current.filter((item) => item !== url));
      setNotice(`“${label}” was removed from the live hero only. It remains saved and can be published again later.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not temporarily remove this image from the live hero.");
    } finally {
      setSaving(false);
    }
  };

  const publishSelectedImage = async () => {
    const selected = images.find((image) => image.cloudinaryUrl === selectedImageUrl);
    if (!selected?.cloudinaryUrl) {
      setError("Click a saved, uploaded image first.");
      return;
    }
    if (liveImageUrls.includes(selected.cloudinaryUrl)) {
      setNotice("That image is already in the live hero.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await invokeAdmin({
        action: "publishImage",
        url: selected.cloudinaryUrl,
        resourceType: "image",
      });
      setLiveImageUrls(Array.isArray(result?.publishedImageUrls) ? result.publishedImageUrls : [...liveImageUrls, selected.cloudinaryUrl]);
      setIsPublished(true);
      setMode("slideshow");
      setNotice("Selected image is now published to the live hero. Other live images were kept.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the selected image.");
    } finally {
      setSaving(false);
    }
  };

  const deleteImagePermanently = async (image: HeroImage, index: number) => {
    const label = image.file?.name || `Hero image ${index + 1}`;
    if (image.cloudinaryUrl) {
      const confirmed = window.confirm(
        `Permanently delete “${label}” from the live hero, saved Supabase settings, and Cloudinary? This cannot be undone.`,
      );
      if (!confirmed) return;

      setSaving(true);
      setError("");
      setNotice("");
      try {
        const result = await invokeAdmin({
          action: "deleteMedia",
          url: image.cloudinaryUrl,
          resourceType: "image",
        });
        if (image.cloudinaryUrl) {
          setImages((current) => current.filter((item) => item.cloudinaryUrl !== image.cloudinaryUrl));
          setSelectedImageUrl((current) => current === image.cloudinaryUrl ? "" : current);
        } else {
          removeImage(image.id);
        }
        setLiveImageUrls((current) => current.filter((url) => url !== image.cloudinaryUrl));
        setIsPublished(Boolean(result?.isPublished));
        setNotice(
          result?.cloudinaryDeleted === false
            ? `“${label}” was removed from the live hero and Supabase settings, but Cloudinary could not confirm permanent file deletion. Check Cloudinary before retrying.`
            : `“${label}” was removed from the draft and live hero and permanently deleted from Cloudinary.`,
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not delete this hero image.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const confirmed = window.confirm(
      `Remove “${label}” from this draft? It has not been uploaded to Cloudinary yet.`,
    );
    if (confirmed) {
      removeImage(image.id);
      setNotice(`“${label}” was removed from the local draft.`);
    }
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    setImages((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setNotice("");
  };

  const selectVideo = (file?: File) => {
    setError("");
    setNotice("");
    if (!file) return;
    if (!VIDEO_TYPES.includes(file.type)) {
      setError("Choose an MP4 or WebM video.");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setError("The video must be 100 MB or smaller.");
      return;
    }
    if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current);
    const url = URL.createObjectURL(file);
    videoObjectUrl.current = url;
    setVideo(file);
    setVideoPreview(url);
    setUploadedVideoUrl("");
  };

  const removeVideo = () => {
    if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current);
    videoObjectUrl.current = null;
    setVideo(null);
    setVideoPreview("");
    setUploadedVideoUrl("");
    setNotice("");
    setError("");
  };

  const uploadFile = async (file: File, resourceType: "image" | "video") => {
    const signed = (await invokeAdmin({ resourceType })) as SigningResponse;
    if (
      !signed?.cloudName ||
      !signed.apiKey ||
      !signed.signature ||
      !signed.timestamp ||
      !signed.folder ||
      !signed.publicId ||
      !signed.uploadPreset ||
      signed.resourceType !== resourceType
    ) {
      throw new Error(
        "The signing function returned incomplete data. Check its deployment and configuration.",
      );
    }
    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${resourceType}/upload`;
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", String(signed.timestamp));
    form.append("signature", signed.signature);
    form.append("folder", signed.folder);
    form.append("public_id", signed.publicId);
    form.append("upload_preset", signed.uploadPreset);
    form.append("overwrite", "false");
    const response = await fetch(endpoint, { method: "POST", body: form });
    const result = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        result?.error?.message || "Cloudinary rejected the upload.",
      );
    if (typeof result?.secure_url !== "string")
      throw new Error("Cloudinary did not return a secure media URL.");
    return result.secure_url as string;
  };

  const uploadImages = async () => {
    if (!images.length) {
      setError("Choose at least one image first.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      for (const image of images) {
        if (image.cloudinaryUrl) continue;
        if (!image.file)
          throw new Error(
            "A selected image is missing its original file. Remove it and choose it again.",
          );
        const url = await uploadFile(image.file, "image");
        setImages((current) =>
          current.map((item) =>
            item.id === image.id ? { ...item, cloudinaryUrl: url } : item,
          ),
        );
      }
      setNotice(
        "Images uploaded to Cloudinary. Save the draft to store their URLs in Supabase.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const uploadVideo = async () => {
    if (!video) {
      setError("Choose a video first.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const url = await uploadFile(video, "video");
      setUploadedVideoUrl(url);
      setVideoPreview(url);
      setNotice(
        "Video uploaded to Cloudinary. Save the draft to store its URL in Supabase.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const saveSettings = async (action: "save" | "publish") => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const imageUrlsToSave = images
        .map((image) => image.cloudinaryUrl)
        .filter((url): url is string => Boolean(url));
      if (
        mode === "slideshow" &&
        (!imageUrlsToSave.length || imageUrlsToSave.length !== images.length)
      )
        throw new Error(
          "Upload every selected image to Cloudinary before saving or publishing.",
        );
      if (mode === "video" && !uploadedVideoUrl)
        throw new Error(
          "Upload the selected video to Cloudinary before saving or publishing.",
        );
      await invokeAdmin({
        action,
        mode,
        imageUrls: mode === "slideshow" ? imageUrlsToSave : [],
        videoUrl: mode === "video" ? uploadedVideoUrl : null,
      });
      if (action === "publish") {
        setIsPublished(true);
        setNotice(
          "Hero settings published in Supabase. The homepage must read published settings before the storefront changes.",
        );
      } else
        setNotice(
          "Draft saved to Supabase. The published settings were not changed.",
        );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not ${action} hero settings.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    if (uploading || saving) return;
    images.forEach((image) => {
      if (image.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(image.previewUrl);
        imageUrls.current.delete(image.previewUrl);
      }
    });
    if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current);
    videoObjectUrl.current = null;
    setImages([]);
    setVideo(null);
    setVideoPreview("");
    setUploadedVideoUrl("");
    setMode("slideshow");
    setError("");
    setNotice(
      "Local editor cleared. This does not delete saved settings or remote Cloudinary files.",
    );
  };

  const previewImage = images[0]?.previewUrl ?? "";
  const uploadedCount = images.filter((image) =>
    Boolean(image.cloudinaryUrl),
  ).length;
  const busy = uploading || saving || loadingSettings;

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-gold-600">
          Storefront appearance
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-onyx-300">
          Hero Media Manager
        </h2>
        <p className="mt-2 text-sm text-onyx-100">
          Manage live hero media. Temporarily hide images to keep them for later, click any saved image to select it, then publish that image alone to restore it. Permanent delete removes it from saved settings and Cloudinary.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode("slideshow");
            setError("");
            setNotice("");
          }}
          className={`rounded-2xl border p-4 text-left transition disabled:opacity-50 ${mode === "slideshow" ? "border-gold-500 bg-gold-50" : "border-gold-200/40 bg-cream-50"}`}
        >
          <ImagePlus className="mb-3 h-6 w-6 text-gold-600" />
          <span className="block font-semibold text-onyx-300">
            Image slideshow
          </span>
          <span className="mt-1 block text-xs text-onyx-100">
            Up to five images, with ordering controls.
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode("video");
            setError("");
            setNotice("");
          }}
          className={`rounded-2xl border p-4 text-left transition disabled:opacity-50 ${mode === "video" ? "border-gold-500 bg-gold-50" : "border-gold-200/40 bg-cream-50"}`}
        >
          <Video className="mb-3 h-6 w-6 text-gold-600" />
          <span className="block font-semibold text-onyx-300">
            Background video
          </span>
          <span className="mt-1 block text-xs text-onyx-100">
            MP4 or WebM video up to 100 MB.
          </span>
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-onyx-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </p>
      )}
      {isPublished && liveImageUrls.length > 0 && (
        <div className="space-y-4 rounded-2xl border border-gold-200/30 bg-cream-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-onyx-300">Currently live images</h3>
              <p className="mt-1 text-xs leading-5 text-onyx-100">
                Choose the eye-off action to hide an image from the live hero while keeping it for later, or the red trash action to permanently delete it.
              </p>
            </div>
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-800">Live</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveImageUrls.map((url, index) => (
              <article key={url} className="overflow-hidden rounded-xl border border-gold-200/40 bg-white shadow-sm">
                <img src={url} alt={`Currently live hero image ${index + 1}`} className="aspect-[4/3] w-full bg-onyx-300 object-contain" />
                <div className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1 truncate text-xs text-onyx-300">Live image {index + 1}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void hideImageFromLive(url, `Live image ${index + 1}`)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40"
                    aria-label={`Temporarily hide live image ${index + 1}`}
                    title="Temporarily remove from live hero; keep saved"
                  >
                    <MonitorPlay className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteImagePermanently({ id: `live-${index}-${url}`, file: null, previewUrl: url, cloudinaryUrl: url }, index)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40"
                    aria-label={`Permanently delete live image ${index + 1}`}
                    title="Permanently delete from Supabase settings and Cloudinary"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-gold-200/30 bg-cream-50">
        <div className="flex items-center gap-2 border-b border-gold-200/30 p-4">
          <MonitorPlay className="h-5 w-5 text-gold-600" />
          <h3 className="font-semibold text-onyx-300">Preview</h3>
          <span className="ml-auto text-xs text-onyx-100">
            Not published until you press Publish
          </span>
        </div>
        <div className="relative flex min-h-64 items-center justify-center overflow-hidden bg-onyx-300 sm:aspect-[16/7]">
          {mode === "video" && videoPreview ? (
            <video
              key={videoPreview}
              src={videoPreview}
              controls
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : mode === "slideshow" && previewImage ? (
            <img
              src={previewImage}
              alt="First selected hero image preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="px-6 py-12 text-center text-cream-100/70">
              <MonitorPlay className="mx-auto mb-3 h-10 w-10" />
              <p className="text-sm">Select media to preview your hero.</p>
            </div>
          )}
          {((mode === "slideshow" && previewImage) ||
            (mode === "video" && videoPreview)) && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
              <div className="pointer-events-none relative z-10 mr-auto max-w-lg p-6 text-cream-100 sm:p-10">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-200">
                  Yaba's Jewellery
                </p>
                <h3 className="mt-3 font-serif text-3xl sm:text-5xl">
                  Jewellery That Makes Every Moment Special
                </h3>
              </div>
            </>
          )}
        </div>
      </div>
      {mode === "slideshow" ? (
        <div className="space-y-4 rounded-2xl border border-gold-200/30 bg-cream-50 p-4 sm:p-5">
          <div>
            <h3 className="font-semibold text-onyx-300">
              Hero images ({images.length}/{MAX_IMAGES})
            </h3>
            <p className="mt-1 text-xs text-onyx-100">
              {uploadedCount} uploaded to Cloudinary.
            </p>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/60 p-5 text-sm text-onyx-300 hover:bg-gold-50">
            <Upload className="h-4 w-4" />
            Choose images
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy || images.length >= MAX_IMAGES}
              onChange={(e) => {
                addImages(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((image, index) => (
              <article
                key={image.id}
                className="overflow-hidden rounded-xl border border-gold-200/30 bg-white"
              >
                <button
                  type="button"
                  disabled={busy || !image.cloudinaryUrl}
                  onClick={() => {
                    setSelectedImageUrl(image.cloudinaryUrl || "");
                    setError("");
                    setNotice(image.cloudinaryUrl ? `Selected image ${index + 1}. Press “Publish selected image” to make it live.` : "Upload this image to Cloudinary before selecting it to publish.");
                  }}
                  className={`block w-full text-left disabled:cursor-not-allowed ${selectedImageUrl === image.cloudinaryUrl && image.cloudinaryUrl ? "ring-4 ring-inset ring-gold-500" : ""}`}
                  aria-label={`Select image ${index + 1} to publish`}
                  title="Select this image to publish or restore"
                >
                  <img
                    src={image.previewUrl}
                    alt={`Select hero image ${index + 1}`}
                    className="aspect-video w-full object-cover"
                  />
                </button>
                <div className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1 truncate text-xs text-onyx-300">
                    {index + 1}. {image.file?.name || "Saved Cloudinary image"}
                    {image.cloudinaryUrl ? " · Uploaded" : ""}
                  </span>
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => moveImage(index, -1)}
                    className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30"
                    aria-label={`Move image ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === images.length - 1}
                    onClick={() => moveImage(index, 1)}
                    className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30"
                    aria-label={`Move image ${index + 1} down`}
                  >
                    ↓
                  </button>
                  {image.cloudinaryUrl && liveImageUrls.includes(image.cloudinaryUrl) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void hideImageFromLive(image.cloudinaryUrl!, image.file?.name || `Hero image ${index + 1}`)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40"
                      aria-label={`Temporarily hide image ${index + 1} from live hero`}
                      title="Temporarily hide from live hero; keep for later"
                    >
                      <MonitorPlay className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteImagePermanently(image, index)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40"
                    aria-label={`Permanently delete image ${index + 1}`}
                    title="Permanently delete from Supabase settings and Cloudinary"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-gold-200/40 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-onyx-200">
              {selectedImageUrl
                ? liveImageUrls.includes(selectedImageUrl)
                  ? "Selected image is already live."
                  : "Selected image is saved and ready to publish/restore."
                : "Click any uploaded image above to select it for publishing or restoring."}
            </p>
            <button
              type="button"
              disabled={busy || !selectedImageUrl || liveImageUrls.includes(selectedImageUrl) || !images.some((image) => image.cloudinaryUrl === selectedImageUrl)}
              onClick={() => void publishSelectedImage()}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-onyx-300 disabled:opacity-40"
            >
              <MonitorPlay className="h-4 w-4" />
              Publish selected image
            </button>
          </div>
          <button
            type="button"
            disabled={busy || !images.length || uploadedCount === images.length}
            onClick={() => void uploadImages()}
            className="flex items-center justify-center gap-2 rounded-xl bg-onyx-300 px-5 py-3 text-sm font-semibold text-cream-100 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload images to Cloudinary"}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-gold-200/30 bg-cream-50 p-4 sm:p-5">
          <h3 className="font-semibold text-onyx-300">Hero background video</h3>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/60 p-5 text-sm text-onyx-300 hover:bg-gold-50">
            <Upload className="h-4 w-4" />
            Choose video
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                selectVideo(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {video && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
              <Video className="h-5 w-5 text-gold-600" />
              <span className="min-w-0 flex-1 break-all text-sm text-onyx-300">
                {video.name}
                {uploadedVideoUrl ? " · Uploaded" : ""}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={removeVideo}
                className="flex items-center gap-1 rounded-lg p-2 text-sm text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={busy || !video || Boolean(uploadedVideoUrl)}
            onClick={() => void uploadVideo()}
            className="flex items-center justify-center gap-2 rounded-xl bg-onyx-300 px-5 py-3 text-sm font-semibold text-cream-100 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload video to Cloudinary"}
          </button>
        </div>
      )}
      <div className="rounded-xl border border-gold-200/30 bg-cream-50 p-4 text-sm text-onyx-200">
        {loadingSettings
          ? "Loading saved draft…"
          : isPublished
            ? "A published hero configuration exists. Saving a draft will not change it."
            : "No hero configuration has been published yet."}
      </div>
      <div className="flex flex-col gap-3 border-t border-gold-200/30 pt-5 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSettings("save")}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold-300 px-5 py-3 text-sm font-semibold text-onyx-300 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save
          draft to Supabase
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Publish this hero media to the live homepage settings?",
              )
            )
              void saveSettings("publish");
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-onyx-300 px-5 py-3 text-sm font-semibold text-cream-100 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Publish
          hero media
        </button>
        <button
          type="button"
          disabled={uploading || saving}
          onClick={resetDraft}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold-200/50 px-5 py-3 text-sm text-onyx-300"
        >
          <RotateCcw className="h-4 w-4" />
          Clear local selections
        </button>
      </div>
      <p className="text-xs leading-relaxed text-onyx-100">
        This manager uses the protected cloudinary-sign-upload Edge Function for
        signed uploads and admin-only settings changes. The storefront Hero
        component must separately read published settings before the live design
        changes.
      </p>
    </section>
  );
}
