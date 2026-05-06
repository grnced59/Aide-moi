// ─────────────────────────────────────────────────────────────────
//  MODULE AUTH — login, register, Google OAuth, session, profil
// ─────────────────────────────────────────────────────────────────

var Auth = (function () {

  // ── Session courante en mémoire ────────────────────────────────
  var _currentSession = null;
  var _currentProfile = null;

  // ── Vérifie auth et redirige si non connecté ──────────────────
  async function checkAuth() {
    var sb = getSupabaseClient();
    if (!sb) {
      // Mode hors-ligne / non configuré : on laisse passer
      return { user: null, offline: true };
    }
    try {
      var { data: { session }, error } = await sb.auth.getSession();
      if (error || !session) {
        window.location.href = './auth.html';
        return null;
      }
      _currentSession = session;
      _currentProfile = await fetchProfile(session.user.id);
      return { session, profile: _currentProfile };
    } catch (e) {
      console.warn('[Auth] checkAuth error', e);
      window.location.href = './auth.html';
      return null;
    }
  }

  // ── Récupère le profil utilisateur ────────────────────────────
  async function fetchProfile(userId) {
    var sb = getSupabaseClient();
    if (!sb) return null;
    var { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data;
  }

  // ── Connexion email + mot de passe ────────────────────────────
  async function signInEmail(email, password) {
    var sb = getSupabaseClient();
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    var { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      _currentSession = data.session;
      _currentProfile = await fetchProfile(data.user.id);
      logActivity('login', data.user.id);
    }
    return { data, error };
  }

  // ── Inscription email + mot de passe ─────────────────────────
  async function signUpEmail(email, password, displayName, role) {
    var sb = getSupabaseClient();
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    var { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, role: role || 'educateur' }
      }
    });
    return { data, error };
  }

  // ── Connexion / inscription via Google OAuth ──────────────────
  async function signInWithGoogle() {
    var sb = getSupabaseClient();
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    var redirectTo = window.location.origin + '/auth.html';
    var { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, scopes: 'email profile' }
    });
    return { data, error };
  }

  // ── Déconnexion ───────────────────────────────────────────────
  async function signOut() {
    var sb = getSupabaseClient();
    if (sb) {
      logActivity('logout', _currentSession?.user?.id);
      await sb.auth.signOut();
    }
    _currentSession = null;
    _currentProfile = null;
    window.location.href = './auth.html';
  }

  // ── Envoi email de réinitialisation ───────────────────────────
  async function resetPassword(email) {
    var sb = getSupabaseClient();
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    var redirectTo = window.location.origin + '/reset-password.html';
    var { data, error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    return { data, error };
  }

  // ── Mise à jour du mot de passe (après reset) ─────────────────
  async function updatePassword(newPassword) {
    var sb = getSupabaseClient();
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    var { data, error } = await sb.auth.updateUser({ password: newPassword });
    return { data, error };
  }

  // ── Mise à jour du profil ─────────────────────────────────────
  async function updateProfile(fields) {
    var sb = getSupabaseClient();
    if (!sb || !_currentSession) return { error: { message: 'Non connecté' } };
    var { data, error } = await sb
      .from('profiles')
      .upsert({ id: _currentSession.user.id, ...fields, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (!error) _currentProfile = data;
    return { data, error };
  }

  // ── Gestion du callback OAuth (appelé sur auth.html) ──────────
  async function handleAuthCallback() {
    var sb = getSupabaseClient();
    if (!sb) return null;
    var { data: { session }, error } = await sb.auth.getSession();
    if (session) {
      _currentSession = session;
      // Créer le profil si c'est la première connexion Google
      await ensureProfile(session.user);
      return session;
    }
    return null;
  }

  // ── Crée le profil si absent (1ère connexion) ─────────────────
  async function ensureProfile(user) {
    var sb = getSupabaseClient();
    if (!sb) return;
    var { data: existing } = await sb
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();
    if (!existing) {
      var displayName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || 'Utilisateur';
      var avatarUrl = user.user_metadata?.avatar_url || null;
      await sb.from('profiles').insert({
        id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl,
        role: 'educateur'
      });
    }
  }

  // ── Log d'activité silencieux ─────────────────────────────────
  async function logActivity(action, userId) {
    if (!userId) return;
    var sb = getSupabaseClient();
    if (!sb) return;
    try {
      await sb.from('activity_logs').insert({
        user_id: userId,
        action,
        metadata: {
          user_agent: navigator.userAgent.substring(0, 200),
          ts: new Date().toISOString()
        }
      });
    } catch (_) {}
  }

  // ── Getters ───────────────────────────────────────────────────
  function getCurrentSession() { return _currentSession; }
  function getCurrentProfile() { return _currentProfile; }
  function getCurrentUser() { return _currentSession?.user || null; }

  // ── Écoute changements d'état auth ───────────────────────────
  function onAuthStateChange(callback) {
    var sb = getSupabaseClient();
    if (!sb) return;
    sb.auth.onAuthStateChange(function (event, session) {
      _currentSession = session;
      callback(event, session);
    });
  }

  return {
    checkAuth,
    signInEmail,
    signUpEmail,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    handleAuthCallback,
    ensureProfile,
    getCurrentSession,
    getCurrentProfile,
    getCurrentUser,
    onAuthStateChange
  };
})();
