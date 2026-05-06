-- ═══════════════════════════════════════════════════════════════════
--  AIDE MOI — Schéma Supabase complet
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
--  EXTENSIONS
-- ────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────
--  TABLE : profiles  (extension de auth.users)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL DEFAULT '',
  avatar_url    TEXT,
  role          TEXT        NOT NULL DEFAULT 'educateur'
                            CHECK (role IN ('admin','chef_service','educateur','therapeute','famille','partenaire')),
  fonction      TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN     NOT NULL DEFAULT true
);

-- Trigger : mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger : création automatique du profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'role', 'educateur')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────────────
--  TABLE : children  (fiches enfants)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.children (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  prenom        TEXT        NOT NULL,
  age           TEXT        NOT NULL DEFAULT '',
  diag          TEXT        NOT NULL DEFAULT '',
  avatar_emoji  TEXT        NOT NULL DEFAULT '🧒',
  bg_color      TEXT        NOT NULL DEFAULT '#9FE1CB',
  data          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  photo_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived   BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_children_created_by ON public.children(created_by);
CREATE INDEX idx_children_archived ON public.children(is_archived);

CREATE TRIGGER children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────
--  TABLE : child_access  (permissions d'accès aux fiches)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.child_access (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      UUID        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by    UUID        NOT NULL REFERENCES public.profiles(id),
  access_type   TEXT        NOT NULL CHECK (access_type IN ('permanent','temporary')),
  permission    TEXT        NOT NULL CHECK (permission IN ('read','read_comment')),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(child_id, user_id)
);

CREATE INDEX idx_child_access_user ON public.child_access(user_id);
CREATE INDEX idx_child_access_child ON public.child_access(child_id);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : share_links  (liens de partage temporaires)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.share_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64url'),
  child_id        UUID        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.profiles(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  pin_hash        TEXT,
  permission      TEXT        NOT NULL DEFAULT 'read' CHECK (permission IN ('read','read_comment')),
  accessed_count  INT         NOT NULL DEFAULT 0,
  last_accessed   TIMESTAMPTZ,
  is_revoked      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_links_token ON public.share_links(token);
CREATE INDEX idx_share_links_child ON public.share_links(child_id);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : access_logs  (traçabilité RGPD)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.access_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        UUID        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  actor_id        UUID        REFERENCES public.profiles(id),
  share_link_id   UUID        REFERENCES public.share_links(id),
  event           TEXT        NOT NULL
                              CHECK (event IN ('view','edit','download_pdf','share_created','share_revoked','comment_added')),
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_logs_child ON public.access_logs(child_id);
CREATE INDEX idx_access_logs_actor ON public.access_logs(actor_id);
CREATE INDEX idx_access_logs_ts ON public.access_logs(created_at DESC);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : invitations
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.invitations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(20), 'base64url'),
  email         TEXT        NOT NULL,
  invited_by    UUID        NOT NULL REFERENCES public.profiles(id),
  role          TEXT        NOT NULL DEFAULT 'educateur',
  child_ids     UUID[]      NOT NULL DEFAULT ARRAY[]::UUID[],
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : conversations
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.conversations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT        NOT NULL CHECK (type IN ('direct','group')),
  name          TEXT,
  child_id      UUID        REFERENCES public.children(id) ON DELETE SET NULL,
  created_by    UUID        NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : conversation_members
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.conversation_members (
  conversation_id UUID    NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_muted        BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conv_members_user ON public.conversation_members(user_id);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : messages
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES public.profiles(id),
  type            TEXT        NOT NULL DEFAULT 'text'
                              CHECK (type IN ('text','image','video','child_card','file')),
  content         TEXT,
  media_url       TEXT,
  media_meta      JSONB,
  child_id        UUID        REFERENCES public.children(id),
  share_link_id   UUID        REFERENCES public.share_links(id),
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);

CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────────────
--  TABLE : user_sessions
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.user_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_info   TEXT,
  ip_address    INET,
  last_active   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminated_at TIMESTAMPTZ
);

-- ────────────────────────────────────────────────────────────────────
--  TABLE : activity_logs
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.activity_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  ip_address  INET,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);

-- ═══════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_access      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs     ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────────────
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_select_peers" ON public.profiles
  FOR SELECT USING (
    id IN (
      SELECT cm2.user_id FROM public.conversation_members cm2
      WHERE cm2.conversation_id IN (
        SELECT cm.conversation_id FROM public.conversation_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- ── children ──────────────────────────────────────────────────────
CREATE POLICY "children_select" ON public.children
  FOR SELECT USING (
    is_archived = false
    AND (
      created_by = auth.uid()
      OR id IN (
        SELECT ca.child_id FROM public.child_access ca
        WHERE ca.user_id = auth.uid()
          AND ca.revoked_at IS NULL
          AND (ca.expires_at IS NULL OR ca.expires_at > NOW())
      )
    )
  );

CREATE POLICY "children_insert" ON public.children
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "children_update" ON public.children
  FOR UPDATE USING (
    created_by = auth.uid()
    OR auth.uid() IN (
      SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','chef_service')
    )
  );

CREATE POLICY "children_delete" ON public.children
  FOR DELETE USING (
    created_by = auth.uid()
    OR auth.uid() IN (
      SELECT p.id FROM public.profiles p WHERE p.role = 'admin'
    )
  );

-- ── child_access ──────────────────────────────────────────────────
CREATE POLICY "child_access_select" ON public.child_access
  FOR SELECT USING (
    user_id = auth.uid()
    OR granted_by = auth.uid()
    OR child_id IN (SELECT id FROM public.children WHERE created_by = auth.uid())
  );

CREATE POLICY "child_access_insert" ON public.child_access
  FOR INSERT WITH CHECK (
    granted_by = auth.uid()
    AND (
      child_id IN (SELECT id FROM public.children WHERE created_by = auth.uid())
      OR auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','chef_service'))
    )
  );

CREATE POLICY "child_access_update" ON public.child_access
  FOR UPDATE USING (
    granted_by = auth.uid()
    OR child_id IN (SELECT id FROM public.children WHERE created_by = auth.uid())
  );

-- ── share_links ───────────────────────────────────────────────────
CREATE POLICY "share_links_select" ON public.share_links
  FOR SELECT USING (
    created_by = auth.uid()
    OR child_id IN (
      SELECT ca.child_id FROM public.child_access ca
      WHERE ca.user_id = auth.uid() AND ca.revoked_at IS NULL
    )
  );

CREATE POLICY "share_links_insert" ON public.share_links
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      child_id IN (SELECT id FROM public.children WHERE created_by = auth.uid())
      OR child_id IN (
        SELECT ca.child_id FROM public.child_access ca
        WHERE ca.user_id = auth.uid() AND ca.revoked_at IS NULL
      )
    )
  );

CREATE POLICY "share_links_update" ON public.share_links
  FOR UPDATE USING (created_by = auth.uid());

-- ── access_logs ───────────────────────────────────────────────────
CREATE POLICY "access_logs_select" ON public.access_logs
  FOR SELECT USING (
    actor_id = auth.uid()
    OR child_id IN (SELECT id FROM public.children WHERE created_by = auth.uid())
    OR auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','chef_service'))
  );

CREATE POLICY "access_logs_insert" ON public.access_logs
  FOR INSERT WITH CHECK (true); -- append-only, tout le monde peut logger

-- ── invitations ───────────────────────────────────────────────────
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    invited_by = auth.uid()
    OR auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role = 'admin')
  );

CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND auth.uid() IN (
      SELECT p.id FROM public.profiles p WHERE p.role IN ('admin','chef_service')
    )
  );

-- ── conversations ─────────────────────────────────────────────────
CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT USING (
    id IN (
      SELECT cm.conversation_id FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- ── conversation_members ──────────────────────────────────────────
CREATE POLICY "conv_members_select" ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR conversation_id IN (
      SELECT cm.conversation_id FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "conv_members_insert" ON public.conversation_members
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT c.id FROM public.conversations c WHERE c.created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "conv_members_update_own" ON public.conversation_members
  FOR UPDATE USING (user_id = auth.uid());

-- ── messages ──────────────────────────────────────────────────────
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT cm.conversation_id FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT cm.conversation_id FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE USING (sender_id = auth.uid());

-- ── user_sessions ─────────────────────────────────────────────────
CREATE POLICY "sessions_select_own" ON public.user_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "sessions_insert_own" ON public.user_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "sessions_update_own" ON public.user_sessions
  FOR UPDATE USING (user_id = auth.uid());

-- ── activity_logs ─────────────────────────────────────────────────
CREATE POLICY "activity_select_own" ON public.activity_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR auth.uid() IN (SELECT p.id FROM public.profiles p WHERE p.role = 'admin')
  );

CREATE POLICY "activity_insert" ON public.activity_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
--  REALTIME — activer pour le chat
-- ═══════════════════════════════════════════════════════════════════
-- Dans Supabase Dashboard → Database → Replication → Tables :
-- Activer "messages" et "conversation_members" pour le realtime.

-- ═══════════════════════════════════════════════════════════════════
--  STORAGE BUCKETS  (à créer dans Dashboard → Storage)
-- ═══════════════════════════════════════════════════════════════════
-- Bucket "children-photos"  : privé, taille max 5 MB
-- Bucket "chat-media"       : privé, taille max 50 MB
-- Bucket "documents"        : privé, taille max 20 MB

-- ═══════════════════════════════════════════════════════════════════
--  GOOGLE OAUTH  (Dashboard → Auth → Providers → Google)
-- ═══════════════════════════════════════════════════════════════════
-- 1. Créer un projet Google Cloud : console.cloud.google.com
-- 2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
-- 3. Type : Web application
-- 4. Authorized redirect URIs :
--    https://VOTRE_PROJECT_ID.supabase.co/auth/v1/callback
-- 5. Copier Client ID + Client Secret dans Supabase Auth → Google
