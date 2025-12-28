/**
 * PostgreSQL database schema for KDP advertising data
 */

export const SCHEMA = `
-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('sponsoredProducts', 'sponsoredBrands', 'sponsoredDisplay')),
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  daily_budget DECIMAL(10, 2) NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  targeting_type TEXT NOT NULL CHECK (targeting_type IN ('manual', 'auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ad groups table
CREATE TABLE IF NOT EXISTS ad_groups (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  default_bid DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keywords table
CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  ad_group_id TEXT NOT NULL REFERENCES ad_groups(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  keyword_text TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('broad', 'phrase', 'exact')),
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  bid DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Negative keywords table
CREATE TABLE IF NOT EXISTS negative_keywords (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_group_id TEXT REFERENCES ad_groups(id) ON DELETE CASCADE,
  keyword_text TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('negativeExact', 'negativePhrase')),
  state TEXT NOT NULL CHECK (state IN ('enabled', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product ads table
CREATE TABLE IF NOT EXISTS product_ads (
  id TEXT PRIMARY KEY,
  ad_group_id TEXT NOT NULL REFERENCES ad_groups(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asin TEXT NOT NULL,
  sku TEXT,
  state TEXT NOT NULL CHECK (state IN ('enabled', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign daily metrics
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend DECIMAL(10, 2) NOT NULL DEFAULT 0,
  sales DECIMAL(10, 2) NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  units_sold INTEGER NOT NULL DEFAULT 0,
  kenp_royalties DECIMAL(10, 2),
  kenp_pages_read INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

-- Keyword daily metrics
CREATE TABLE IF NOT EXISTS keyword_metrics (
  id SERIAL PRIMARY KEY,
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend DECIMAL(10, 2) NOT NULL DEFAULT 0,
  sales DECIMAL(10, 2) NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  units_sold INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(keyword_id, date)
);

-- Book configuration for royalty calculations
CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  asin TEXT UNIQUE NOT NULL,
  royalty_per_sale DECIMAL(10, 2) NOT NULL,
  kenp_rate_per_page DECIMAL(10, 6),
  list_price DECIMAL(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending changes (for confirmation workflow)
CREATE TABLE IF NOT EXISTS pending_changes (
  id SERIAL PRIMARY KEY,
  change_type TEXT NOT NULL CHECK (change_type IN ('bid_adjustment', 'state_change', 'budget_change', 'add_negative_keyword')),
  target_type TEXT NOT NULL CHECK (target_type IN ('campaign', 'ad_group', 'keyword')),
  target_id TEXT NOT NULL,
  target_name TEXT,
  current_value JSONB NOT NULL,
  proposed_value JSONB NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Sync history for tracking API fetches
CREATE TABLE IF NOT EXISTS sync_history (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  records_synced INTEGER DEFAULT 0,
  error_message TEXT
);

-- Change history for audit trail
CREATE TABLE IF NOT EXISTS change_history (
  id SERIAL PRIMARY KEY,
  pending_change_id INTEGER REFERENCES pending_changes(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  api_response JSONB
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date ON campaign_metrics(date);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign ON campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_keyword_metrics_date ON keyword_metrics(date);
CREATE INDEX IF NOT EXISTS idx_keyword_metrics_keyword ON keyword_metrics(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keywords_campaign ON keywords(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign ON ad_groups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pending_changes_status ON pending_changes(status);
CREATE INDEX IF NOT EXISTS idx_pending_changes_created ON pending_changes(created_at);
`;

