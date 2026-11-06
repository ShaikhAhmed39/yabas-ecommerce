import { supabase } from '@/lib/supabase';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Calls an edge function and throws an ApiError carrying the SERVER's message
 * (supabase-js otherwise only says "Edge Function returned a non-2xx status code").
 */
export async function callFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let message = 'Something went wrong. Please try again.';
    let status = 500;
    let code: string | undefined;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      status = context.status;
      try {
        const payload = (await context.clone().json()) as { error?: string; message?: string; code?: string };
        message = payload.error || payload.message || message;
        code = payload.code;
      } catch {
        /* response was not JSON */
      }
    } else if (error.message) {
      message = /fetch|network/i.test(error.message)
        ? 'Could not reach the server. Check your connection and try again.'
        : error.message;
    }
    throw new ApiError(message, status, code);
  }

  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new ApiError(String((data as { error: string }).error), 400);
  }
  return data as T;
}

export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof Error && e.message) return e.message;
  // Supabase (PostgREST / storage) errors are plain objects with a message, not Error instances.
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message || fallback;
  }
  return fallback;
}
