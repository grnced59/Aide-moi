// ─────────────────────────────────────────────────────────────────
//  MODULE SYNC — migration localStorage → Supabase + cloud save/load
// ─────────────────────────────────────────────────────────────────

var Sync = (function () {

  var MIGRATION_KEY = 'aideMoi_migrated_at';
  var _isSyncing = false;

  // ── Vérifie si des données locales n'ont pas encore été migrées
  function detectLocalData() {
    var alreadyMigrated = localStorage.getItem(MIGRATION_KEY);
    if (alreadyMigrated) return false;
    var saved = localStorage.getItem('aideMoi_kids');
    if (!saved) return false;
    try {
      var parsed = JSON.parse(saved);
      // Ne migre pas si ce sont uniquement les données de démo (Hugo/Emma par défaut)
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── Affiche le bandeau de migration ───────────────────────────
  function showMigrationBanner() {
    var existing = document.getElementById('migration-banner');
    if (existing) return;
    var banner = document.createElement('div');
    banner.id = 'migration-banner';
    banner.style = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9000',
      'background:#534AB7', 'color:white', 'padding:12px 16px',
      'font-size:13px', 'font-family:system-ui,sans-serif',
      'display:flex', 'align-items:center', 'gap:10px'
    ].join(';');
    banner.innerHTML = [
      '<span style="flex:1">☁️ Données locales détectées — cliquez pour les synchroniser avec votre compte cloud</span>',
      '<button id="migration-yes" style="background:white;color:#534AB7;border:none;border-radius:20px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Migrer</button>',
      '<button id="migration-no" style="background:transparent;color:rgba(255,255,255,.7);border:none;font-size:18px;cursor:pointer;padding:0 6px;">✕</button>'
    ].join('');
    document.body.prepend(banner);
    document.getElementById('migration-yes').addEventListener('click', function () {
      banner.remove();
      runMigration();
    });
    document.getElementById('migration-no').addEventListener('click', function () {
      banner.remove();
      localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
    });
  }

  // ── Lance la migration effective ──────────────────────────────
  async function runMigration() {
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();
    if (!sb || !user) return;

    var saved = localStorage.getItem('aideMoi_kids');
    if (!saved) return;

    var localKids;
    try { localKids = JSON.parse(saved); } catch (_) { return; }
    if (!Array.isArray(localKids) || localKids.length === 0) return;

    showToast('Migration en cours…', '#534AB7');

    var errors = 0;
    for (var i = 0; i < localKids.length; i++) {
      var k = localKids[i];
      // Extrait les champs de base et met le reste dans data JSONB
      var { prenom, age, diag, av, bg, hbg, htxt, photo, ...rest } = k;
      var row = {
        created_by: user.id,
        prenom: prenom || 'Sans nom',
        age: age || '',
        diag: diag || '',
        avatar_emoji: av || '🧒',
        bg_color: bg || '#9FE1CB',
        data: { hbg, htxt, ...rest }
      };
      // Si une photo est stockée en base64 local, on la met de côté
      // (le stockage Supabase Storage sera fait en Phase 5)
      if (photo && photo.startsWith('data:')) {
        row.data._localPhoto = photo;
        row.photo_url = null;
      }
      var { error } = await sb.from('children').insert(row);
      if (error) errors++;
    }

    localStorage.setItem(MIGRATION_KEY, new Date().toISOString());

    if (errors === 0) {
      showToast('✓ Migration réussie — données synchronisées', '#1D9E75');
      // Recharger depuis le cloud
      await loadDataCloud();
      if (typeof render === 'function') render();
    } else {
      showToast('Erreur partielle — ' + errors + ' fiche(s) non migrée(s)', '#E24B4A');
    }
  }

  // ── Sauvegarde dans Supabase ─────────────────────────────────
  async function saveDataCloud() {
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();
    if (!sb || !user || _isSyncing) {
      // Fallback : sauvegarde locale
      _saveLocal();
      return;
    }
    _isSyncing = true;
    try {
      // Mise à jour de chaque enfant dans la DB
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (!k._id) {
          // Pas encore d'ID cloud → insert
          var { prenom, age, diag, av, bg, hbg, htxt, photo, _id, ...rest } = k;
          var { data: inserted, error } = await sb.from('children').insert({
            created_by: user.id,
            prenom: prenom || 'Sans nom',
            age: age || '',
            diag: diag || '',
            avatar_emoji: av || '🧒',
            bg_color: bg || '#9FE1CB',
            data: { hbg, htxt, ...rest }
          }).select('id').single();
          if (!error && inserted) kids[i]._id = inserted.id;
        } else {
          // Déjà en DB → update
          var { prenom, age, diag, av, bg, hbg, htxt, photo, _id, ...restU } = k;
          await sb.from('children').update({
            prenom: prenom || 'Sans nom',
            age: age || '',
            diag: diag || '',
            avatar_emoji: av || '🧒',
            bg_color: bg || '#9FE1CB',
            data: { hbg, htxt, ...restU },
            updated_at: new Date().toISOString()
          }).eq('id', _id).eq('created_by', user.id);
        }
      }
      // Toujours aussi mettre à jour le localStorage comme cache offline
      _saveLocal();
    } catch (e) {
      console.warn('[Sync] saveDataCloud error', e);
      _saveLocal();
    } finally {
      _isSyncing = false;
    }
  }

  // ── Charge depuis Supabase ───────────────────────────────────
  async function loadDataCloud() {
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();
    if (!sb || !user) {
      _loadLocal();
      return;
    }
    try {
      // Fiches créées par l'utilisateur
      var { data: owned, error: e1 } = await sb
        .from('children')
        .select('*')
        .eq('created_by', user.id)
        .eq('is_archived', false)
        .order('created_at');

      // Fiches partagées avec l'utilisateur
      var { data: shared, error: e2 } = await sb
        .from('child_access')
        .select('child_id, children(*)')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

      if (e1 && e2) {
        _loadLocal();
        return;
      }

      var ownedIds = new Set((owned || []).map(function (r) { return r.id; }));
      var allRows = (owned || []).map(function (r) {
        return Object.assign({}, r, { _isShared: false });
      });
      if (shared) {
        shared.forEach(function (row) {
          if (row.children && !ownedIds.has(row.children.id)) {
            allRows.push(Object.assign({}, row.children, {
              _isShared: true,
              _sharingPermission: row.permission || 'read'
            }));
          }
        });
      }

      if (allRows.length === 0 && localStorage.getItem('aideMoi_kids')) {
        // Aucune fiche en cloud mais données locales présentes → garder les locales
        _loadLocal();
        return;
      }

      // Convertit le format DB vers le format kids[] existant
      kids = allRows.map(function (row) {
        var d = row.data || {};
        return Object.assign({}, d, {
          _id: row.id,
          _ownerId: row.created_by || null,
          _isShared: row._isShared || false,
          _sharingPermission: row._sharingPermission || null,
          prenom: row.prenom,
          age: row.age || '',
          diag: row.diag || '',
          av: row.avatar_emoji || '🧒',
          bg: row.bg_color || '#9FE1CB',
          hbg: d.hbg || '#EEEDFE',
          htxt: d.htxt || '#3C3489',
          photo: row.photo_url || d._localPhoto || null
        });
      });

      idx = Math.min(idx, Math.max(0, kids.length - 1));
      _saveLocal(); // mise à jour cache
    } catch (e) {
      console.warn('[Sync] loadDataCloud error', e);
      _loadLocal();
    }
  }

  // ── Sauvegarde locale (cache offline) ────────────────────────
  function _saveLocal() {
    try {
      localStorage.setItem('aideMoi_kids', JSON.stringify(kids));
      localStorage.setItem('aideMoi_idx', String(idx));
      localStorage.setItem('aideMoi_version', DATA_VERSION);
    } catch (_) {}
  }

  // ── Chargement local (fallback) ──────────────────────────────
  function _loadLocal() {
    try {
      var version = localStorage.getItem('aideMoi_version');
      if (version !== DATA_VERSION) {
        localStorage.removeItem('aideMoi_kids');
        localStorage.removeItem('aideMoi_idx');
        localStorage.setItem('aideMoi_version', DATA_VERSION);
        return;
      }
      var saved = localStorage.getItem('aideMoi_kids');
      var savedIdx = localStorage.getItem('aideMoi_idx');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (saved.length > MAX_STORAGE_CHARS) {
          trimHeavyDocPayload(parsed);
          localStorage.setItem('aideMoi_kids', JSON.stringify(parsed));
        }
        kids = parsed;
      }
      if (savedIdx !== null) idx = parseInt(savedIdx, 10);
    } catch (e) {
      localStorage.removeItem('aideMoi_kids');
      localStorage.removeItem('aideMoi_idx');
    }
  }

  // ── Toast utilitaire ─────────────────────────────────────────
  function showToast(msg, color) {
    var n = document.getElementById('save-notif');
    if (!n) return;
    n.style.background = color || '#1D9E75';
    n.textContent = msg;
    n.style.opacity = '1';
    setTimeout(function () { n.style.opacity = '0'; }, 3000);
  }

  // ── Supprime une fiche de Supabase par son ID ────────────────
  async function deleteFromCloud(id) {
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();
    if (!sb || !user || !id) return;
    try {
      await sb.from('children').delete().eq('id', id).eq('created_by', user.id);
    } catch (e) {
      console.warn('[Sync] deleteFromCloud error', e);
    }
  }

  async function deleteAllUserData() {
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();
    if (!sb || !user) return;
    try {
      await sb.from('children').delete().eq('created_by', user.id);
    } catch (e) {
      console.warn('[Sync] deleteAllUserData error', e);
    }
  }

  return {
    detectLocalData,
    showMigrationBanner,
    runMigration,
    saveDataCloud,
    loadDataCloud,
    deleteFromCloud,
    deleteAllUserData
  };
})();
