import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// AsyncStorage references `window` which doesn't exist during Expo Router's
// server-side rendering pass. Skip it in that context — SSR doesn't need
// session persistence; auth only runs on-device.
const isSsr = typeof window === 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isSsr ? undefined : AsyncStorage,
    autoRefreshToken: !isSsr,
    persistSession: !isSsr,
    detectSessionInUrl: false,
  },
});
