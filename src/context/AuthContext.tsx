import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthResult {
  error: string | null;
}
interface SignUpResult extends AuthResult {
  /** true when Supabase created the account but wants the e-mail confirmed before the first sign-in */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true until we know BOTH who the user is AND whether they are an admin (prevents a "not allowed" flash) */
  loading: boolean;
  isAdmin: boolean;
  /** true after the user opened a password-reset e-mail link */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setSessionLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setSessionLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // The shop owner flag comes from the admin_users table. The server re-checks it on every admin call.
  const userId = user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setIsAdmin(false);
      setAdminLoading(false);
      return;
    }
    setAdminLoading(true);
    supabase
      .from('admin_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data);
      })
      .then(
        () => { if (!cancelled) setAdminLoading(false); },
        () => { if (!cancelled) { setIsAdmin(false); setAdminLoading(false); } },
      );
    return () => { cancelled = true; };
  }, [userId]);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    // Supabase hides "already registered" by returning a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: 'User already registered' };
    }
    return { error: null, needsConfirmation: !data.session };
  };

  const sendPasswordReset = async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecovering(false);
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session, user, isAdmin, recovering,
        loading: sessionLoading || adminLoading,
        signIn, signUp, sendPasswordReset, updatePassword, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
