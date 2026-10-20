-- Sapor schema (SQLite). Written to port cleanly to Postgres later:
-- TEXT ids are UUIDs, timestamps are ISO-8601 TEXT, booleans are 0/1 INTEGER.
-- SQLite has no row-level security, so every read/write goes through
-- src/server/repo/*, which applies the visibility rules for the viewer.

PRAGMA foreign_keys = ON;

-- ============ identity ============
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- "algorithm$salt$hexdigest", e.g. "scrypt:16384:8:1$<salt>$<hash>" (see src/server/password.ts)
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  TEXT NOT NULL
);

-- Opaque session tokens live only in an httpOnly cookie; we store their SHA-256.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,               -- sha256(token) hex
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Public face of a user. Never contains email or password.
CREATE TABLE profiles (
  user_id              TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name         TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  bio                  TEXT CHECK (bio IS NULL OR length(bio) <= 160),
  avatar_media_id      TEXT REFERENCES media (id) ON DELETE SET NULL,
  pinned_collection_id TEXT REFERENCES collections (id) ON DELETE SET NULL,
  share_scores         INTEGER NOT NULL DEFAULT 0, -- opt-in: include my scores in community averages
  created_at           TEXT NOT NULL
);

-- ============ catalog (admin-managed) ============
CREATE TABLE retailers (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id               TEXT PRIMARY KEY,
  retailer_id      TEXT NOT NULL REFERENCES retailers (id),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('frozen-meals','snacks','desserts','sauces','bakery','drinks')),
  description      TEXT NOT NULL DEFAULT '',
  emoji            TEXT,
  photo_url        TEXT,   -- freely licensed representative photo, with attribution below
  photo_credit     TEXT,
  photo_license    TEXT,
  photo_source     TEXT,
  instagram_url    TEXT,   -- shown only through Instagram's official embed
  availability     TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown','active','seasonal','discontinued')),
  source_url       TEXT,
  last_verified_at TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (retailer_id, slug)
);
CREATE INDEX products_category_idx ON products (category);

-- ============ personal tracking + scores (private) ============
-- One row per user+product. The user's 1–10 score is DERIVED from tier +
-- position in their overall taste ranking (src/lib/scores.ts); it is never stored.
CREATE TABLE user_products (
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id     TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('want_to_try', 'tried')),
  notes          TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  first_tried_on TEXT,
  tier           TEXT CHECK (tier IN ('loved', 'fine', 'disliked')),   -- NULL = not scored yet
  tier_position  INTEGER CHECK (tier_position >= 0),                    -- order within tier; NULL = unplaced
  tied_with_prev INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX user_products_product_idx ON user_products (product_id);

-- ============ curated rankings ============
CREATE TABLE collections (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 280),
  visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX collections_owner_idx ON collections (owner_id);

CREATE TABLE collection_items (
  collection_id  TEXT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  product_id     TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position       INTEGER CHECK (position >= 0), -- NULL = added, not yet placed
  tied_with_prev INTEGER NOT NULL DEFAULT 0,
  added_at       TEXT NOT NULL,
  PRIMARY KEY (collection_id, product_id)
);

-- Every answer from guided placement. collection_id NULL = the user's overall taste ranking.
CREATE TABLE comparisons (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  collection_id    TEXT REFERENCES collections (id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  other_product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  result           TEXT NOT NULL CHECK (result IN ('prefer_this','prefer_that','same','unsure')),
  created_at       TEXT NOT NULL
);
CREATE INDEX comparisons_user_idx ON comparisons (user_id, created_at);

-- ============ user content ============
-- Uploaded files. Videos are reserved: 'processing' status leaves room for a
-- transcoding pipeline later without changing the shape.
CREATE TABLE media (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  mime         TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  storage_key  TEXT NOT NULL UNIQUE,  -- path under the media store (local disk now, object storage later)
  width        INTEGER,
  height       INTEGER,
  duration_ms  INTEGER,               -- videos
  poster_media_id TEXT REFERENCES media (id) ON DELETE SET NULL, -- video thumbnail
  status       TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'processing', 'failed')),
  created_at   TEXT NOT NULL
);

-- One table for everything people publish about products.
--   review : one per user+product (enforced below); built today
--   hack   : recipe / combo / prep tip, may involve several products (post_products)
--   post   : general text/photo post
--   video  : taste-test video (media kind 'video')
CREATE TABLE posts (
  id          TEXT PRIMARY KEY,
  author_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('review', 'hack', 'post', 'video')),
  product_id  TEXT REFERENCES products (id) ON DELETE CASCADE, -- primary product (required for reviews)
  title       TEXT CHECK (title IS NULL OR length(title) <= 120),
  body        TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'public')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  CHECK (kind <> 'review' OR product_id IS NOT NULL)
);
CREATE UNIQUE INDEX posts_one_review_per_product ON posts (author_id, product_id) WHERE kind = 'review' AND deleted_at IS NULL;
CREATE INDEX posts_product_idx ON posts (product_id, created_at);
CREATE INDEX posts_feed_idx ON posts (visibility, created_at);

-- Extra products a post mentions (e.g. a hack combining three products).
CREATE TABLE post_products (
  post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, product_id)
);

CREATE TABLE post_media (
  post_id  TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (post_id, media_id)
);

-- Threaded comments on products today; posts and collections later (polymorphic target).
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  author_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'post', 'collection')),
  target_id   TEXT NOT NULL,
  parent_id   TEXT REFERENCES comments (id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX comments_target_idx ON comments (target_type, target_id, created_at);

-- ============ future social features (schema only, no UI yet) ============
CREATE TABLE reactions (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'collection')),
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'like' CHECK (kind IN ('like')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id, kind)
);

CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'collection', 'profile')),
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL CHECK (length(reason) <= 500),
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
