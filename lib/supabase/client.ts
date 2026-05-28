import { createBrowserClient } from '@supabase/ssr';

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: false,
        storageKey: "ug-session",
      },
      global: {
        headers: {
          "x-session-expires-in": String(getSecondsUntilMidnight()),
        },
      },
    }
  );
}

export const supabase = createClient();