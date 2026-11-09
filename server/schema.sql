-- Atvents schema. Safe to run on every start: everything is IF NOT EXISTS.
-- Tickets are bought on tiket.com, so nothing here holds a payment or a seat. Tables from
-- the earlier version, which sold tickets itself, are left alone on databases that have them.

-- A click on "Buy on tiket.com". The id travels in the affiliate link as the sub id and comes
-- back in the network's conversion report. No IP address or other personal data.
CREATE TABLE IF NOT EXISTS clicks (
  id          text        PRIMARY KEY CHECK (id ~ '^[a-z0-9]{12}$'),
  event_id    text        NOT NULL,
  src         text        NOT NULL DEFAULT '' CHECK (src ~ '^[a-z0-9_-]{0,32}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- A 3D pass: a fan's claim that they bought a booking through one of our clicks. One pass
-- per booking. The keys that open it on a device are kept only as sha256 hashes.
CREATE TABLE IF NOT EXISTS claims (
  id            text        PRIMARY KEY,
  event_id      text        NOT NULL,
  order_ref     text        NOT NULL,
  email         text        NOT NULL,
  cat           text        NOT NULL,
  qty           integer     NOT NULL CHECK (qty BETWEEN 1 AND 8),
  click_ids     text[]      NOT NULL DEFAULT '{}',
  token_hashes  text[]      NOT NULL DEFAULT '{}',
  status        text        NOT NULL DEFAULT 'checking' CHECK (status IN ('checking', 'confirmed', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, order_ref)
);
CREATE INDEX IF NOT EXISTS claims_clicks ON claims USING gin (click_ids);

-- The affiliate network's verdict on each sale, by our click id, from the imported reports.
CREATE TABLE IF NOT EXISTS conversions (
  sub         text        PRIMARY KEY CHECK (sub ~ '^[a-z0-9]{12}$'),
  status      text        NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Demo requests from the partner page.
CREATE TABLE IF NOT EXISTS partner_leads (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  company     text        NOT NULL,
  email       text        NOT NULL,
  phone       text        NOT NULL DEFAULT '',
  website     text        NOT NULL DEFAULT '',
  kind        text        NOT NULL,
  volume      text        NOT NULL DEFAULT '',
  message     text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The news list and per-concert alerts. One row per address and list. (Older databases
-- also allow 'waitlist' and use `category`; nothing writes either any more.)
CREATE TABLE IF NOT EXISTS subscribers (
  id          bigserial   PRIMARY KEY,
  email       text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('newsletter', 'alerts')),
  event_id    text        NOT NULL DEFAULT '',
  category    text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, event_id, category, email)
);
