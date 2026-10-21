import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Substitua estas strings pelas chaves do seu projeto Supabase
const supabaseUrl = "https://bvurjcrovovofaszzddh.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dXJqY3Jvdm92b2Zhc3p6ZGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MjA4NTgsImV4cCI6MjEwODA5Njg1OH0.P_CVyro1QIUzXSbXM9c2dhqkyS-kMIf7EelG0GSwGcw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
