// ─────────────────────────────────────────────────────────────────
//  MODULE CHAT — messagerie temps réel par fiche enfant (Supabase Realtime)
// ─────────────────────────────────────────────────────────────────

var Chat = (function () {

  var _childId = null;
  var _channel = null;
  var _messages = [];
  var _loaded = false;

  // ── Ouvre le chat pour l'enfant courant ───────────────────────
  async function open(childId) {
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();

    if (!sb || !user) { _showState('no-cloud'); return; }
    if (!childId) { _showState('no-child'); return; }

    if (_childId === childId && _loaded) {
      _showState('chat');
      _scrollToBottom();
      return;
    }

    _unsubscribe();
    _childId = childId;
    _messages = [];
    _loaded = false;
    _showState('chat');
    _updateTitle();
    _renderMessages();
    await _loadMessages();
    _subscribe();
  }

  // ── Charge les 100 derniers messages ──────────────────────────
  async function _loadMessages() {
    var sb = getSupabaseClient();
    if (!sb || !_childId) return;
    try {
      var { data, error } = await sb
        .from('chat_messages')
        .select('*')
        .eq('child_id', _childId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!error && data) {
        _messages = data;
        _loaded = true;
        _renderMessages();
        _scrollToBottom();
      }
    } catch (e) {
      console.warn('[Chat] loadMessages', e);
    }
  }

  // ── Abonnement Realtime ────────────────────────────────────────
  function _subscribe() {
    var sb = getSupabaseClient();
    if (!sb || !_childId) return;
    _channel = sb
      .channel('chat-child-' + _childId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: 'child_id=eq.' + _childId
      }, function (payload) {
        var exists = _messages.some(function (m) { return m.id === payload.new.id; });
        if (!exists) {
          _messages.push(payload.new);
          _renderMessages();
          _scrollToBottom();
        }
        var tab = document.getElementById('tab-chat');
        if (!tab || !tab.classList.contains('visible')) _addBadge();
      })
      .subscribe();
  }

  function _unsubscribe() {
    if (!_channel) return;
    var sb = getSupabaseClient();
    if (sb) sb.removeChannel(_channel);
    _channel = null;
  }

  // ── Envoi d'un message ────────────────────────────────────────
  async function sendMessage() {
    var input = document.getElementById('chat-input');
    if (!input) return;
    var msg = input.value.trim();
    if (!msg) return;
    var sb = getSupabaseClient();
    var user = Auth.getCurrentUser();
    var profile = Auth.getCurrentProfile();
    if (!sb || !user || !_childId) return;
    var displayName = (profile && profile.display_name) || user.email || 'Utilisateur';
    input.value = '';
    input.style.height = 'auto';
    try {
      var { error } = await sb.from('chat_messages').insert({
        child_id: _childId,
        user_id: user.id,
        display_name: displayName,
        message: msg
      });
      if (error) { console.warn('[Chat] send error', error); input.value = msg; }
    } catch (e) {
      console.warn('[Chat] send', e);
      input.value = msg;
    }
  }

  // ── Rendu des messages ────────────────────────────────────────
  function _renderMessages() {
    var container = document.getElementById('chat-messages');
    if (!container) return;
    var user = Auth.getCurrentUser();
    var myId = user ? user.id : null;
    if (!_loaded) {
      container.innerHTML = '<div class="chat-empty">Chargement…</div>';
      return;
    }
    if (_messages.length === 0) {
      container.innerHTML = '<div class="chat-empty">Aucun message.<br>Commencez la conversation !</div>';
      return;
    }
    var lastDate = '';
    container.innerHTML = _messages.map(function (m) {
      var isMe = m.user_id === myId;
      var dt = new Date(m.created_at);
      var dateStr = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      var timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      var separator = '';
      if (dateStr !== lastDate) {
        separator = '<div class="chat-date-sep">' + dateStr + '</div>';
        lastDate = dateStr;
      }
      return separator + [
        '<div class="chat-msg ' + (isMe ? 'chat-msg-me' : 'chat-msg-other') + '">',
          !isMe ? '<div class="chat-msg-name">' + _esc(m.display_name) + '</div>' : '',
          '<div class="chat-bubble">' + _esc(m.message).replace(/\n/g, '<br>') + '</div>',
          '<div class="chat-time">' + timeStr + '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function _scrollToBottom() {
    var c = document.getElementById('chat-messages');
    if (c) requestAnimationFrame(function () { c.scrollTop = c.scrollHeight; });
  }

  function _updateTitle() {
    var el = document.getElementById('chat-child-name');
    if (!el) return;
    var k = typeof kids !== 'undefined' && typeof idx !== 'undefined' ? kids[idx] : null;
    el.textContent = k ? 'Chat — ' + k.prenom : 'Chat';
  }

  function _showState(state) {
    var noCloud = document.getElementById('chat-no-cloud');
    var noChild = document.getElementById('chat-no-child');
    var wrap = document.getElementById('chat-wrap');
    if (!noCloud || !noChild || !wrap) return;
    noCloud.style.display = state === 'no-cloud' ? '' : 'none';
    noChild.style.display = state === 'no-child' ? '' : 'none';
    wrap.style.display = state === 'chat' ? '' : 'none';
  }

  function _addBadge() {
    var badge = document.getElementById('chat-badge');
    if (!badge) return;
    var n = parseInt(badge.textContent || '0', 10) + 1;
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.style.display = '';
  }

  function clearBadge() {
    var badge = document.getElementById('chat-badge');
    if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { open: open, sendMessage: sendMessage, clearBadge: clearBadge };
})();
