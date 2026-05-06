// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION SUPABASE — à remplir après création du projet
//  1. Aller sur https://app.supabase.com
//  2. Créer un projet (région : EU Frankfurt pour RGPD)
//  3. Settings → API → copier Project URL et anon key
// ─────────────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://VOTRE_PROJECT_ID.supabase.co';
var SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY_ICI';

// Détecte si les clés sont encore les placeholders
function supabaseIsConfigured() {
  return SUPABASE_URL !== 'https://VOTRE_PROJECT_ID.supabase.co'
    && SUPABASE_ANON_KEY !== 'VOTRE_ANON_KEY_ICI';
}

// Client global — null si non configuré (mode localStorage pur)
var _supabaseClient = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (!supabaseIsConfigured()) return null;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
  _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'aideMoi_auth'
    }
  });
  return _supabaseClient;
}
