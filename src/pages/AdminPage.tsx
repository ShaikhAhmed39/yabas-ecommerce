import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, Upload, Loader2, Package, ArrowLeft,
  ImageIcon, Save, AlertCircle, CheckCircle2, ClipboardList, ShoppingBag
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { HeroMediaManager } from '@/components/admin/HeroMediaManager';
import { OrdersPanel } from '@/components/admin/OrdersPanel';
import { ReturnsPanel } from '@/components/admin/ReturnsPanel';
import { compressImageToWebP, formatFileSize } from '@/utils/imageCompress';
import { formatINR, calculateDiscount } from '@/utils/format';
import type { Product, ProductInput } from '@/types';

interface AdminPageProps {
  onNavigate: (page: 'storefront' | 'admin') => void;
}

const EMPTY_FORM: ProductInput = {
  title: '',
  description: '',
  original_price: 0,
  selling_price: 0,
  discount_percent: 0,
  stock: 0,
  weight_grams: 100,
  image_url: '',
  material_type: '',
  polish_finish: '',
  dimensions: '',
  category: '',
  sub_category: '',
  occasion_wear: '',
  is_featured: false,
};

const CATEGORIES = ['Necklace', 'Earrings', 'Bangles', 'Rings', 'Bracelet', 'Bridal', 'Anklets'];

const SUB_CATEGORIES: Record<string, string[]> = {
  Necklace: ['Choker', 'Long', 'Rani Haar', 'Mangalsutra', 'Pendant'],
  Earrings: ['Studs', 'Jhumka', 'Chandbali', 'Hoop', 'Drop'],
  Bangles: ['Kada', 'Stack', 'Glass', 'Gold Plated'],
  Rings: ['Cocktail', 'Engagement', 'Daily Wear', 'Adjustable'],
  Bracelet: ['Chain', 'Cuff', 'Charm', 'Pearl'],
  Bridal: ['Full Set', 'Necklace Set', 'Maang Tikka', 'Nath', 'Kamarbandh'],
  Anklets: ['Chain', 'Beaded', 'Traditional', 'Modern'],
};

const OCCASIONS = ['Daily Wear', 'Wedding', 'Festive', 'Party', 'Traditional', 'Office', 'Casual'];


export function AdminPage({ onNavigate }: AdminPageProps) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showReturns, setShowReturns] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showHeroMedia, setShowHeroMedia] = useState(false);

  // Compressed Image Asset Processing States
  const [, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<{ original: string; compressed: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setProducts(data ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to retrieve inventory listings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchProducts();
    }
  }, [user, isAdmin, fetchProducts]);

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      title: product.title,
      description: product.description || '',
      original_price: product.original_price,
      selling_price: product.selling_price,
      discount_percent: product.discount_percent,
      stock: product.stock,
      weight_grams: product.weight_grams ?? 100,
      image_url: product.image_url,
      material_type: product.material_type || '',
      polish_finish: product.polish_finish || '',
      dimensions: product.dimensions || '',
      category: product.category,
      sub_category: product.sub_category || '',
      occasion_wear: product.occasion_wear || '',
      is_featured: product.is_featured,
    });
    setImagePreview(product.image_url);
    setUploadInfo(null);
    setUploadFile(null);
    setError(null);
    setSuccess(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImagePreview('');
    setUploadInfo(null);
    setUploadFile(null);
    setError(null);
    setSuccess(null);
    setShowForm(true);
  };
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Maximum source file size: 100MB
  if (file.size > 100 * 1024 * 1024) {
    setError('File too large. Maximum 100MB.');
    return;
  }

  // Allow only supported product image formats
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    setError(
      'Invalid file type. Please upload JPG, JPEG, PNG, or WebP images only.'
    );
    return;
  }

  setUploadFile(file);
  setError(null);

  setUploadInfo({
    original: formatFileSize(file.size),
    compressed: 'Compressing...',
  });
  

    // Instantly display high performance local URL preview object
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      setUploading(true);
      const compressed = await compressImageToWebP(file);
      
      setUploadInfo({
        original: formatFileSize(file.size),
        compressed: formatFileSize(compressed.size),
      });

      const fileName = `product-${Date.now()}.webp`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, compressed, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setForm((prev) => ({ ...prev, image_url: urlData.publicUrl }));
      setImagePreview(urlData.publicUrl);
    } catch (err) {
      setError(errorMessage(err, 'Image asset processing failed.'));
      setUploadInfo(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuth(true);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    // Compute automatic pricing fallback calculations
    const computedDiscount = form.discount_percent || calculateDiscount(Number(form.original_price), Number(form.selling_price));
    const payload = { ...form, discount_percent: computedDiscount };

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (updateError) throw updateError;
        setSuccess('Product details successfully updated.');
      } else {
        const { error: insertError } = await supabase
          .from('products')
          .insert(payload);
        if (insertError) throw insertError;
        setSuccess('New luxury product successfully created.');
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      setImagePreview('');
      setUploadFile(null);
      setUploadInfo(null);
      setEditingId(null);
      await fetchProducts();
    } catch (err) {
      setError(errorMessage(err, 'Failed to save catalogue data.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (!confirm('Delete this product? This cannot be undone.')) return;

    setError(null);
    setSuccess(null);
    try {
      const { error: delError } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (delError) throw delError;
      setSuccess('Item successfully deleted from database.');
      await fetchProducts();
    } catch (err) {
      setError(errorMessage(err, 'Deletion operation aborted by server.'));
    }
  };

  // Auth Loading Shield Wrapper
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-gold-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-onyx-200">Verifying administrative security credentials...</p>
        </div>
      </div>
    );
  }

  // Admin Security Door Clearance Check
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-cream-50 p-8 rounded-3xl shadow-soft text-center border border-gold-200/20">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-gold-500" />
          </div>
          <h2 className="font-display text-2xl font-bold text-onyx-300 mb-2">Admin Access Required</h2>
          <p className="text-sm text-onyx-200 mb-6 leading-relaxed">
            {!user
              ? 'Please sign in with an administrator account to manage the catalogue.'
              : 'Your account does not have administrator privileges.'}
          </p>
          <div className="flex flex-col gap-3">
            {!user && (
              <button
                onClick={() => setShowAuth(true)}
                className="w-full py-3.5 gold-gradient text-cream-100 font-medium rounded-xl shadow-gold hover:scale-[1.01] transition-transform"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => onNavigate('storefront')}
              className="w-full py-3.5 bg-cream-200 text-onyx-300 font-medium rounded-xl hover:bg-cream-300 transition-colors text-sm"
            >
              Back to Store
            </button>
          </div>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} title="Admin Sign In" />
      </div>
    );
  }

 // Display Computed Automatic Discounts Inline Live
const calculatedLiveDiscount =
  Number(form.original_price) > 0 && Number(form.selling_price) > 0
    ? calculateDiscount(
        Number(form.original_price),
        Number(form.selling_price)
      )
    : 0;

return (
  <div className="min-h-screen bg-cream-100">
    {/* Admin header */}
    <div className="bg-onyx-300 text-cream-100 sticky top-0 z-30 shadow-medium">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate("storefront")}
            className="p-2 rounded-full hover:bg-cream-100/10 transition-colors flex-shrink-0"
            title="Return to store homepage"
            aria-label="Return to store homepage"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold truncate">
              Admin Dashboard
            </h1>
            <p className="text-xs text-cream-300 truncate">
              Yaba's Imitation & Jewellery
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowOrders((current) => !current);
              setShowReturns(false);
              setShowForm(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              showOrders
                ? "bg-cream-100 text-onyx-300"
                : "border border-gold-400/50 text-cream-100 hover:bg-cream-100/10"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Orders</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowHeroMedia((current) => !current);
              setShowOrders(false);
              setShowReturns(false);
              setShowForm(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              showHeroMedia
                ? "bg-cream-100 text-onyx-300"
                : "border border-gold-400/50 text-cream-100 hover:bg-cream-100/10"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>Hero Media</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowReturns((current) => !current);
              setShowOrders(false);
              setShowForm(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              showReturns
                ? "bg-cream-100 text-onyx-300"
                : "border border-gold-400/50 text-cream-100 hover:bg-cream-100/10"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            <span>Returns</span>
          </button>
          {!showForm && !showReturns && !showOrders && (
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 gold-gradient rounded-full text-sm font-medium shadow-gold hover:scale-[1.02] transition-transform flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
          )}
        </div>
      </div>
    </div>

    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Real-time System Response Notifications */}
      {error && (
        <div className="mb-5 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-5 flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {showOrders ? (
        <OrdersPanel />
      ) : showReturns ? (
        <ReturnsPanel />
      ) : showHeroMedia ? (
        <HeroMediaManager />
      ) : (
        <>
          {/* Core Product Input Workspace Management Form */}
          {showForm && (
            <div className="mb-6 bg-cream-50 rounded-2xl shadow-soft p-5 sm:p-6 animate-slide-up border border-gold-200/20">
              <div className="flex items-center justify-between mb-5 gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-onyx-300">
                    {editingId
                      ? "Edit Catalogue Item"
                      : "Add New Inventory Piece"}
                  </h2>
                  <p className="text-xs text-onyx-100 mt-1">
                    Manage product details, pricing, inventory and imagery.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                    setImagePreview("");
                    setUploadInfo(null);
                  }}
                  className="p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300 flex-shrink-0"
                  aria-label="Close product form"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                {/* IMAGE UPLOAD SECTION BLOCK */}
                <div>
                  <label className="block text-xs font-medium text-onyx-200 mb-2 uppercase tracking-wider">
                    Product Photograph *
                  </label>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full sm:w-44 h-44 rounded-xl bg-cream-200 overflow-hidden flex items-center justify-center border-2 border-dashed border-gold-200/50 flex-shrink-0">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Product preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-onyx-100/40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 cursor-pointer hover:bg-gold-50 transition-colors">
                        <Upload className="h-4 w-4" />
                        {uploading
                          ? "Compressing & Uploading..."
                          : "Choose Product Image"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileSelect}
                          className="hidden"
                          disabled={uploading}
                        />
                      </label>

                      <p className="mt-2 text-xs text-onyx-100">
                        Accepted formats: JPG, JPEG, PNG, WebP. Maximum source
                        size: 100MB.
                      </p>

                      {uploadInfo && (
                        <div className="mt-3 rounded-xl bg-cream-100 border border-gold-200/20 px-3 py-2 text-xs text-onyx-100 space-y-1">
                          <p>
                            Raw Input Volume:{" "}
                            <span className="text-onyx-300 font-medium">
                              {uploadInfo.original}
                            </span>
                          </p>
                          <p>
                            Optimized WebP Footprint:{" "}
                            <span className="text-green-700 font-medium">
                              {uploadInfo.compressed}
                            </span>
                          </p>
                          <p className="text-gold-500">
                            Automatically compressed and scaled for fast
                            customer loading.
                          </p>
                        </div>
                      )}

                      {uploading && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-onyx-200">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing image scaling pipeline...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CORE BASIC TEXT CONTROLS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Item Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., Heritage Micro Plated Choker"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Core Collection Category *
                    </label>
                    <select
                      required
                      value={form.category}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          category: e.target.value,
                          sub_category: "",
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                    >
                      <option value="">Choose Category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ROUTED SUB-CATEGORICAL CLASSIFICATION MATRIX */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Sub-Category Dropdown
                    </label>
                    <select
                      value={form.sub_category}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sub_category: e.target.value,
                        })
                      }
                      disabled={!form.category}
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">Select Sub-Category</option>
                      {form.category &&
                        SUB_CATEGORIES[form.category]?.map((sc) => (
                          <option key={sc} value={sc}>
                            {sc}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Occasion Wear Segment
                    </label>
                    <select
                      value={form.occasion_wear}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          occasion_wear: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                    >
                      <option value="">Select Occasion</option>
                      {OCCASIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ITEM CHARACTERISTICS DESCRIPTION CONTAINER */}
                <div>
                  <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                    Detailed Catalogue Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all resize-none"
                    placeholder="Describe craftsmanship details, design accents, weight profile, or care requirements..."
                  />
                </div>

                {/* PRICING SCHEMA VALUATION BLOCK */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Retail MRP (â‚¹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.original_price || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          original_price: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Optional Max Price"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Selling Price (â‚¹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={form.selling_price || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          selling_price: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Required Active Price"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Discount Ribbon %
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.discount_percent || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discount_percent: Math.min(
                            100,
                            Math.max(0, Number(e.target.value)),
                          ),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Auto Calculated"
                    />
                    {calculatedLiveDiscount > 0 && (
                      <div className="mt-1.5 text-[10px] text-gold-600 font-medium">
                        Auto-computed: {calculatedLiveDiscount}% Off
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Inventory Stock *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={form.stock || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          stock: Math.max(
                            0,
                            Math.floor(Number(e.target.value)),
                          ),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Available Units"
                    />
                  </div>

                  <div>
                    <label htmlFor="product-weight" className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Shipping Weight (grams) *
                    </label>
                    <input
                      id="product-weight"
                      type="number"
                      required
                      min="1"
                      max="20000"
                      value={form.weight_grams ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, weight_grams: Math.min(20000, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="e.g. 60 (piece + box)"
                    />
                    <p className="mt-1 text-[11px] text-onyx-100">Used for the courier booking and shipping charge. Include the box.</p>
                  </div>
                </div>

                {/* MATERIAL TECHNICAL SPECIFICATIONS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Material Composition
                    </label>
                    <input
                      type="text"
                      value={form.material_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          material_type: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., Stainless Steel / Brass Core"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Polish / Plating Finish
                    </label>
                    <input
                      type="text"
                      value={form.polish_finish}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          polish_finish: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., 22k High Shine Gold Plated"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Sizing Dimensions
                    </label>
                    <input
                      type="text"
                      value={form.dimensions}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dimensions: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., Adjustable Fit / 2.4 Bangles"
                    />
                  </div>
                </div>

                {/* VISIBILITY HIGHLIGHT INTERACTIVE TOGGLE */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_featured}
                      onChange={(e) =>
                        setForm({ ...form, is_featured: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <span className="w-11 h-6 bg-cream-300 rounded-full peer peer-checked:bg-gold-500 transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-cream-100 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                  <span className="text-sm text-onyx-300">
                    Feature this product on homepage catalog grids
                  </span>
                </div>

                {/* FORM COMMIT SUBMISSION UTILITIES */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving || uploading}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 gold-gradient text-cream-100 font-semibold rounded-xl shadow-gold hover:scale-[1.01] transition-transform disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {editingId
                      ? "Update Product Record"
                      : "Publish Product to Store"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                      setImagePreview("");
                      setUploadInfo(null);
                      setError(null);
                    }}
                    className="px-6 py-3.5 bg-cream-200 text-onyx-300 font-medium rounded-xl hover:bg-cream-300 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ACTIVE LIVE GRID CATALOG MONITOR LIST */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-onyx-300">
                  Currently Active Catalogue Listings
                </h2>
                <p className="text-xs text-onyx-100 mt-1">
                  Live inventory synchronized with Supabase.
                </p>
              </div>
              <Package className="h-5 w-5 text-gold-500" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 bg-cream-50 rounded-2xl shadow-soft">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 text-gold-500 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-onyx-200">
                    Syncing database data logs...
                  </p>
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20 bg-cream-50 rounded-2xl shadow-soft border border-gold-200/20">
                <Package className="h-12 w-12 text-onyx-100/40 mx-auto mb-4" />
                <p className="text-sm text-onyx-100">
                  No luxury inventory records active. Click "Add Product" to
                  populate.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-cream-50 rounded-2xl shadow-soft overflow-hidden flex flex-col border border-gold-200/20"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-cream-200">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-10 w-10 text-onyx-100/40" />
                        </div>
                      )}

                      {product.is_featured && (
                        <div className="absolute top-3 left-3 text-[10px] bg-gold-500 text-cream-100 px-2.5 py-1 rounded-full font-semibold shadow-gold">
                          Featured Spot
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-serif text-base font-semibold text-onyx-300 line-clamp-2 flex-1">
                          {product.title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-onyx-100 mb-3">
                        <span>{product.category}</span>
                        <span>Â·</span>
                        <span>Sub: {product.sub_category || "None"}</span>
                        <span>Â·</span>
                        <span
                          className={
                            product.stock === 0
                              ? "text-red-600 font-bold"
                              : "text-onyx-200"
                          }
                        >
                          Units: {product.stock}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <span className="font-display text-lg font-bold text-onyx-300">
                          {formatINR(product.selling_price)}
                        </span>

                        {Number(product.original_price) >
                          Number(product.selling_price) && (
                          <span className="text-xs text-onyx-100 line-through">
                            {formatINR(product.original_price)}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex gap-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-cream-200 text-onyx-300 text-xs font-semibold rounded-xl hover:bg-gold-50 border border-gold-200/30 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Details
                        </button>

                        <button
                          onClick={() => handleDelete(product.id)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-50/60 text-red-600 text-xs rounded-xl hover:bg-red-100 border border-red-200/20 transition-all"
                          title="Permanently remove item from database"
                          aria-label={`Delete ${product.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  </div>
);
}
