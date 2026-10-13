import { useState, useEffect } from 'react';
import { X, Mail, Lock, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export function AuthModal({ open, onClose, title }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whenever the modal opens up fresh, always force it to default to 'signin' mode
  // This ensures your shop owners are never greeted by a signup screen by accident.
  useEffect(() => {
    if (open) {
      setMode('signin');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password);

    setLoading(false);

    if (result.error) {
      if (result.error.includes('Invalid login') || result.error.includes('credentials')) {
        setError('Incorrect email or password. Please try again.');
      } else if (result.error.includes('already registered') || result.error.includes('already exists')) {
        setError('An account with this email already exists. Click the link at the bottom to Sign In instead.');
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-onyx-500/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-cream-100 rounded-3xl shadow-medium overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-onyx-300 to-onyx-400 px-6 pt-8 pb-12 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-cream-300 hover:text-cream-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="w-14 h-14 rounded-full gold-gradient flex items-center justify-center mx-auto mb-3 shadow-gold">
            <Sparkles className="h-6 w-6 text-cream-100" />
          </div>
          
          {/* FIXED TITLE LOGIC: Dynamically alters even if a custom checkout title wrapper exists */}
          <h2 className="font-display text-2xl font-bold text-cream-100">
            {mode === 'signin' 
              ? (title || 'Welcome Back') 
              : "Create Your Yaba's Account"}
          </h2>
          
          <p className="text-sm text-cream-300 mt-1.5">
            {mode === 'signin'
              ? 'Sign in to access your administrative tools and storefront'
              : 'Sign up to create a brand new shopping profile'}
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-6 -mt-6 bg-cream-100 rounded-t-3xl">
          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@yabas.com"
                  className="w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 placeholder:text-onyx-100/50 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your security password"
                  className="w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 placeholder:text-onyx-100/50 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 gold-gradient text-cream-100 font-medium rounded-xl shadow-gold hover:scale-[1.01] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In Securely' : 'Register New Account'}
                </>
              )}
            </button>
          </form>

          {/* Toggle Button Container */}
          <div className="mt-5 text-center border-t border-gold-200/20 pt-4">
            <button
              onClick={() => {
                setError(null);
                setMode(mode === 'signin' ? 'signup' : 'signin');
              }}
              className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors"
            >
              {mode === 'signin'
                ? "Don't have an account? Create one here"
                : 'Already registered? Click here to Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
