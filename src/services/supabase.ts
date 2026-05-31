import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Clés extraites automatiquement depuis votre projet Supabase !
const supabaseUrl = 'https://fymbdhyncstulgkknkjd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5bWJkaHluY3N0dWxna2tua2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzMzMzAsImV4cCI6MjA5NTc0OTMzMH0.u9Rq0Dl8vhUScAcjLyNnO5JmKPQzfDMEeL2wJTNcYa0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
