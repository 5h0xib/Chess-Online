// ===== SUPABASE CLIENT CONFIGURATION =====
// Replace these placeholders with your actual Supabase project values
// Found at: Supabase Dashboard → Settings → API

const SUPABASE_URL = 'https://fjmsygdibkssbllbsnfg.supabase.co';     // e.g. https://abcdefghij.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbXN5Z2RpYmtzc2JsbGJzbmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MzYyNDQsImV4cCI6MjA4ODExMjI0NH0.1JT64VlpZRO6q0qWCJWpV2-KtoSMFnm66J8MlXUAu8k'; // starts with 'eyJhbGci...'

// Load Supabase from CDN (loaded in HTML via <script> tag before this file)
const { createClient } = supabase;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// Export the configured client
window.sb = supabaseClient;
