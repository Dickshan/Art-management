-- THE ARTZ — PostgreSQL schema (v2)
-- Single-database architecture: PostgreSQL for all persistent data.
-- Flexible artwork metadata (AI tags, style embeddings) stored as JSONB.
-- Redis handles session management, feed caching, and pub/sub notifications.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for fast ILIKE / full-text search

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username              VARCHAR(30)  UNIQUE NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  display_name          VARCHAR(80)  NOT NULL,
  bio                   TEXT         NOT NULL DEFAULT '',
  avatar_url            TEXT,
  location              VARCHAR(120),
  is_private            BOOLEAN      NOT NULL DEFAULT FALSE,
  two_factor_enabled    BOOLEAN      NOT NULL DEFAULT FALSE,
  show_sales_publicly   BOOLEAN      NOT NULL DEFAULT TRUE,
  email_on_new_follower BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- FOLLOWS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

-- ---------------------------------------------------------------------------
-- PAYMENT METHODS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('UPI', 'QR_CODE')),
  upi_id       VARCHAR(120),
  qr_code_url  TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- ---------------------------------------------------------------------------
-- ARTWORKS
-- Flexible per-artwork data (AI tags, generated description, style vector)
-- lives in the `metadata` JSONB column so the schema never needs altering
-- as AI features evolve.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artworks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency     VARCHAR(3) NOT NULL DEFAULT 'USD',
  category     VARCHAR(30) NOT NULL
                 CHECK (category IN ('Painting','Textile','Illustration','Photography','Sculpture','Digital')),
  image_url    TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available', 'sold', 'archived')),
  like_count   INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  -- JSONB bag for all evolving AI/metadata fields:
  --   ai_tags                TEXT[]  (default [])
  --   ai_generated_description TEXT   (nullable)
  --   style_embedding        FLOAT[] (nullable, for cosine similarity)
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artworks_owner        ON artworks(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_status       ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_category     ON artworks(category);
CREATE INDEX IF NOT EXISTS idx_artworks_metadata_gin ON artworks USING gin(metadata);
-- Trigram index enables fast ILIKE search on title / description
CREATE INDEX IF NOT EXISTS idx_artworks_title_trgm   ON artworks USING gin(title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- LIKES  (many-to-many: users ↔ artworks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS likes (
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artwork_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);

-- Keep artworks.like_count in sync automatically
CREATE OR REPLACE FUNCTION trg_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE artworks SET like_count = like_count + 1 WHERE id = NEW.artwork_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE artworks SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.artwork_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_likes_count ON likes;
CREATE TRIGGER trg_likes_count
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION trg_like_count();

-- ---------------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_artwork ON comments(artwork_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user    ON comments(user_id);

-- ---------------------------------------------------------------------------
-- COLLECTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  cover_image_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner_id);

CREATE TABLE IF NOT EXISTS collection_artworks (
  collection_id  UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  artwork_id     UUID NOT NULL REFERENCES artworks(id)    ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, artwork_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_artworks_artwork ON collection_artworks(artwork_id);

-- ---------------------------------------------------------------------------
-- ACTIVITIES  (notification feed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'sale')),
  artwork_id   UUID REFERENCES artworks(id)  ON DELETE SET NULL,
  comment_id   UUID REFERENCES comments(id)  ON DELETE SET NULL,
  amount_cents INTEGER,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_recipient ON activities(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_unread    ON activities(recipient_id) WHERE read = FALSE;

-- ---------------------------------------------------------------------------
-- TRANSACTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artwork_id      UUID NOT NULL REFERENCES artworks(id),
  seller_id       UUID NOT NULL REFERENCES users(id),
  buyer_id        UUID NOT NULL REFERENCES users(id),
  amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
  payment_method  VARCHAR(20) NOT NULL CHECK (payment_method IN ('UPI', 'QR_CODE')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_seller  ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer   ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_artwork ON transactions(artwork_id);

-- ---------------------------------------------------------------------------
-- updated_at auto-maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at     ON users;
DROP TRIGGER IF EXISTS trg_artworks_updated_at  ON artworks;
DROP TRIGGER IF EXISTS trg_collections_updated_at ON collections;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_artworks_updated_at
  BEFORE UPDATE ON artworks
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
