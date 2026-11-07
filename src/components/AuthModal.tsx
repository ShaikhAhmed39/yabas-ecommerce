import { useEffect, useId, useRef, useState } from 'react';
import { X, Mail, Lock, Loader2, Sparkles, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { POLICY_LINKS } from '@/lib/policies';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

type Mode = 'signin' | 'signup' | 'forgot' | 'recovery';

const MIN_PASSWORD = 8;

function friendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login') || msg.includes('credentials')) return 'Incorrect email or password. Please try again.';
  if (msg.includes('already registered') || msg.includes('already exists')) return 'An account with this email already exists. Please sign in instead.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the confirmation link.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('weak') || msg.includes('password should')) return `Choose a stronger password (at least ${MIN_PASSWORD} characters).`;
  if (msg.includes('same password') || msg.includes('different from the old')) return 'Choose a password different from your old one.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Could not reach the server. Check your connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}

export function AuthModal({ open, onClose, title }: AuthModalProps) {
  const { signIn, signUp, sendPasswordReset, updatePassword, recovering } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const uid = useId();

  // The reset-password e-mail link brings the customer back here with a temporary session.
  const visible = open || recovering;
  const activeMode: Mode = recovering ? 'recovery' : mode;

  useEffect(() => {
    if (open) {
      setMode('signin');
      setError(null);
      setInfo(null);
      setLoading(false);
      setPassword('');
      setShowPassword(false);
      setAgree(false);
    }
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => firstField.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !recovering) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, activeMode, recovering, onClose]);

  if (!visible) return null;

  const switchMode = (next: Mode) => {
    setError(null);
    setInfo(null);
    setMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (activeMode !== 'forgot' && password.length < (activeMode === 'signin' ? 1 : MIN_PASSWORD)) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    if (activeMode === 'signup' && !agree) {
      setError('Please accept the Terms & Conditions and Privacy Policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      if (activeMode === 'signin') {
        const r = await signIn(email, password);
        if (r.error) setError(friendlyError(r.error));
        else onClose();
      } else if (activeMode === 'signup') {
        const r = await signUp(email, password);
        if (r.error) setError(friendlyError(r.error));
        else if (r.needsConfirmation) {
          setInfo(`We sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in.`);
          setMode('signin');
          setPassword('');
        } else onClose();
      } else if (activeMode === 'forgot') {
        const r = await sendPasswordReset(email);
        // Same message whether or not the account exists: never reveal who is registered.
        if (r.error && /rate limit|too many/i.test(r.error)) setError(friendlyError(r.error));
        else setInfo('If an account exists for that email, a password-reset link is on its way.');
      } else {
        const r = await updatePassword(password);
        if (r.error) setError(friendlyError(r.error));
        else {
          setPassword('');
          onClose();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const heading =
    activeMode === 'signin' ? title || 'Welcome Back'
    : activeMode === 'signup' ? "Create Your Yaba's Account"
    : activeMode === 'forgot' ? 'Reset Your Password'
    : 'Choose a New Password';

  const subheading =
    activeMode === 'signin' ? 'Sign in to track orders, returns and checkout faster'
    : activeMode === 'signup' ? 'Create an account to save your orders and track every parcel'
    : activeMode === 'forgot' ? "Enter your email and we'll send you a reset link"
    : 'Pick a new password for your account';

  const inputClass =
    'w-full pl-10 pr-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 placeholder:text-onyx-100/50 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/30 transition-all';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
      <div className="absolute inset-0 bg-onyx-500/60 backdrop-blur-md" onClick={recovering ? undefined : onClose} />

      <div className="relative w-full max-w-md bg-cream-100 rounded-3xl shadow-medium overflow-hidden animate-scale-in max-h-[92vh] overflow-y-auto">
        <div className="relative bg-gradient-to-br from-onyx-300 to-onyx-400 px-6 pt-8 pb-12 text-center">
          {!recovering && (
            <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-cream-300 hover:text-cream-100 transition-colors">
              <X className="h-5 w-5" />
            </button>
          )}
          <div className="w-14 h-14 rounded-full gold-gradient flex items-center justify-center mx-auto mb-3 shadow-gold">
            <Sparkles className="h-6 w-6 text-cream-100" />
          </div>
          <h2 id={`${uid}-title`} className="font-display text-2xl font-bold text-cream-100">{heading}</h2>
          <p className="text-sm text-cream-300 mt-1.5">{subheading}</p>
        </div>

        <div className="px-6 py-6 -mt-6 bg-cream-100 rounded-t-3xl">
          {error && (
            <div role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
          )}
          {info && (
            <div role="status" className="mb-4 flex gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
            {activeMode !== 'recovery' && (
              <div>
                <label htmlFor={`${uid}-email`} className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" aria-hidden />
                  <input
                    id={`${uid}-email`}
                    ref={firstField}
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {activeMode !== 'forgot' && (
              <div>
                <label htmlFor={`${uid}-password`} className="block text-xs font-semibold text-onyx-300 mb-1.5 uppercase tracking-wider">
                  {activeMode === 'recovery' ? 'New Password' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-onyx-100" aria-hidden />
                  <input
                    id={`${uid}-password`}
                    ref={activeMode === 'recovery' ? firstField : undefined}
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={activeMode === 'signin' ? undefined : MIN_PASSWORD}
                    autoComplete={activeMode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={activeMode === 'signin' ? 'Your password' : `At least ${MIN_PASSWORD} characters`}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-onyx-100 hover:text-onyx-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {activeMode === 'signin' && (
                  <button type="button" onClick={() => switchMode('forgot')} className="mt-2 text-xs font-medium text-onyx-300 hover:text-gold-500 transition-colors">
                    Forgot your password?
                  </button>
                )}
              </div>
            )}

            {activeMode === 'signup' && (
              <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-onyx-300">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#0F4C4A]" />
                <span>I agree to the <a href={POLICY_LINKS.terms.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Terms &amp; Conditions</a> and the <a href={POLICY_LINKS.privacy.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Privacy Policy</a>.</span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-12 flex items-center justify-center gap-2 py-3.5 gold-gradient text-cream-100 font-medium rounded-xl shadow-gold hover:scale-[1.01] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Please wait" /> : (
                activeMode === 'signin' ? 'Sign In'
                : activeMode === 'signup' ? 'Create Account'
                : activeMode === 'forgot' ? 'Send Reset Link'
                : 'Save New Password'
              )}
            </button>
          </form>

          {!recovering && (
            <div className="mt-5 text-center border-t border-gold-200/20 pt-4">
              {activeMode === 'forgot' ? (
                <button onClick={() => switchMode('signin')} className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors">
                  Back to sign in
                </button>
              ) : (
                <button onClick={() => switchMode(activeMode === 'signin' ? 'signup' : 'signin')} className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors">
                  {activeMode === 'signin' ? "Don't have an account? Create one" : 'Already registered? Sign in'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
