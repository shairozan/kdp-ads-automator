import pg from 'pg';
import { SCHEMA } from './schema.js';
import type {
  Campaign,
  Keyword,
  CampaignMetrics,
  BookConfig,
} from '../types/index.js';

const { Pool } = pg;

export interface PendingChange {
  id: number;
  changeType: 'bid_adjustment' | 'state_change' | 'budget_change' | 'add_negative_keyword';
  targetType: 'campaign' | 'ad_group' | 'keyword';
  targetId: string;
  targetName: string | null;
  currentValue: Record<string, unknown>;
  proposedValue: Record<string, unknown>;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  createdAt: Date;
  reviewedAt: Date | null;
  executedAt: Date | null;
  errorMessage: string | null;
}

export class KdpDatabase {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
    });
  }

  /**
   * Initialize database schema
   */
  async migrate(): Promise<void> {
    await this.pool.query(SCHEMA);
  }


  // ============================================
  // Campaign Operations
  // ============================================

  async upsertCampaign(campaign: Campaign): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO campaigns (id, name, campaign_type, state, daily_budget, start_date, end_date, targeting_type, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT(id) DO UPDATE SET
        name = $2,
        campaign_type = $3,
        state = $4,
        daily_budget = $5,
        start_date = $6,
        end_date = $7,
        targeting_type = $8,
        updated_at = NOW()
    `,
      [
        campaign.id,
        campaign.name,
        campaign.campaignType,
        campaign.state,
        campaign.dailyBudget,
        campaign.startDate,
        campaign.endDate ?? null,
        campaign.targetingType,
      ]
    );
  }

  async getCampaigns(state?: 'enabled' | 'paused' | 'archived'): Promise<Campaign[]> {
    let query = 'SELECT * FROM campaigns';
    const params: string[] = [];

    if (state) {
      query += ' WHERE state = $1';
      params.push(state);
    }

    query += ' ORDER BY name';

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      campaignType: row.campaign_type as Campaign['campaignType'],
      state: row.state as Campaign['state'],
      dailyBudget: parseFloat(row.daily_budget),
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      targetingType: row.targeting_type as Campaign['targetingType'],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async getCampaignById(id: string): Promise<Campaign | null> {
    const result = await this.pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      campaignType: row.campaign_type as Campaign['campaignType'],
      state: row.state as Campaign['state'],
      dailyBudget: parseFloat(row.daily_budget),
      startDate: row.start_date,
      endDate: row.end_date ?? undefined,
      targetingType: row.targeting_type as Campaign['targetingType'],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ============================================
  // Metrics Operations
  // ============================================

  async upsertCampaignMetrics(metrics: CampaignMetrics): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO campaign_metrics (campaign_id, date, impressions, clicks, spend, sales, orders, units_sold, kenp_royalties, kenp_pages_read)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT(campaign_id, date) DO UPDATE SET
        impressions = $3,
        clicks = $4,
        spend = $5,
        sales = $6,
        orders = $7,
        units_sold = $8,
        kenp_royalties = $9,
        kenp_pages_read = $10
    `,
      [
        metrics.campaignId,
        metrics.date,
        metrics.impressions,
        metrics.clicks,
        metrics.spend,
        metrics.sales,
        metrics.orders,
        metrics.unitsSold,
        metrics.kenpRoyalties ?? null,
        metrics.kenpPagesRead ?? null,
      ]
    );
  }

  async getCampaignMetrics(
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<CampaignMetrics[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM campaign_metrics
      WHERE campaign_id = $1
        AND date >= $2
        AND date <= $3
      ORDER BY date
    `,
      [campaignId, startDate, endDate]
    );

    return result.rows.map((row) => ({
      campaignId: row.campaign_id,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: parseFloat(row.spend),
      sales: parseFloat(row.sales),
      orders: row.orders,
      unitsSold: row.units_sold,
      kenpRoyalties: row.kenp_royalties ? parseFloat(row.kenp_royalties) : undefined,
      kenpPagesRead: row.kenp_pages_read ?? undefined,
    }));
  }

  async getAllMetrics(startDate: string, endDate: string): Promise<CampaignMetrics[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM campaign_metrics
      WHERE date >= $1 AND date <= $2
      ORDER BY date
    `,
      [startDate, endDate]
    );

    return result.rows.map((row) => ({
      campaignId: row.campaign_id,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: parseFloat(row.spend),
      sales: parseFloat(row.sales),
      orders: row.orders,
      unitsSold: row.units_sold,
      kenpRoyalties: row.kenp_royalties ? parseFloat(row.kenp_royalties) : undefined,
      kenpPagesRead: row.kenp_pages_read ?? undefined,
    }));
  }

  async getAggregatedMetrics(
    campaignId: string | null,
    startDate: string,
    endDate: string
  ): Promise<{
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    unitsSold: number;
  }> {
    let query = `
      SELECT
        COALESCE(SUM(impressions), 0) as impressions,
        COALESCE(SUM(clicks), 0) as clicks,
        COALESCE(SUM(spend), 0) as spend,
        COALESCE(SUM(sales), 0) as sales,
        COALESCE(SUM(orders), 0) as orders,
        COALESCE(SUM(units_sold), 0) as units_sold
      FROM campaign_metrics
      WHERE date >= $1 AND date <= $2
    `;

    const params: (string | null)[] = [startDate, endDate];

    if (campaignId) {
      query += ' AND campaign_id = $3';
      params.push(campaignId);
    }

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      impressions: parseInt(row.impressions, 10),
      clicks: parseInt(row.clicks, 10),
      spend: parseFloat(row.spend),
      sales: parseFloat(row.sales),
      orders: parseInt(row.orders, 10),
      unitsSold: parseInt(row.units_sold, 10),
    };
  }

  // ============================================
  // Book Configuration
  // ============================================

  async upsertBook(book: BookConfig): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO books (title, asin, royalty_per_sale, kenp_rate_per_page, list_price, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT(asin) DO UPDATE SET
        title = $1,
        royalty_per_sale = $3,
        kenp_rate_per_page = $4,
        list_price = $5,
        updated_at = NOW()
    `,
      [
        book.title,
        book.asin,
        book.royaltyPerSale,
        book.kenpRatePerPage ?? null,
        book.listPrice ?? null,
      ]
    );
  }

  async getBooks(): Promise<BookConfig[]> {
    const result = await this.pool.query('SELECT * FROM books ORDER BY title');

    return result.rows.map((row) => ({
      title: row.title,
      asin: row.asin,
      royaltyPerSale: parseFloat(row.royalty_per_sale),
      kenpRatePerPage: row.kenp_rate_per_page ? parseFloat(row.kenp_rate_per_page) : undefined,
      listPrice: row.list_price ? parseFloat(row.list_price) : undefined,
    }));
  }

  async getBookByAsin(asin: string): Promise<BookConfig | null> {
    const result = await this.pool.query('SELECT * FROM books WHERE asin = $1', [asin]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      title: row.title,
      asin: row.asin,
      royaltyPerSale: parseFloat(row.royalty_per_sale),
      kenpRatePerPage: row.kenp_rate_per_page ? parseFloat(row.kenp_rate_per_page) : undefined,
      listPrice: row.list_price ? parseFloat(row.list_price) : undefined,
    };
  }

  // ============================================
  // Keywords
  // ============================================

  async upsertKeyword(keyword: Keyword): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO keywords (id, ad_group_id, campaign_id, keyword_text, match_type, state, bid, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT(id) DO UPDATE SET
        ad_group_id = $2,
        campaign_id = $3,
        keyword_text = $4,
        match_type = $5,
        state = $6,
        bid = $7,
        updated_at = NOW()
    `,
      [
        keyword.id,
        keyword.adGroupId,
        keyword.campaignId,
        keyword.keywordText,
        keyword.matchType,
        keyword.state,
        keyword.bid,
      ]
    );
  }

  async getKeywordsByCampaign(campaignId: string): Promise<Keyword[]> {
    const result = await this.pool.query(
      'SELECT * FROM keywords WHERE campaign_id = $1 ORDER BY keyword_text',
      [campaignId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      adGroupId: row.ad_group_id,
      campaignId: row.campaign_id,
      keywordText: row.keyword_text,
      matchType: row.match_type as Keyword['matchType'],
      state: row.state as Keyword['state'],
      bid: parseFloat(row.bid),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async getKeywordById(id: string): Promise<Keyword | null> {
    const result = await this.pool.query('SELECT * FROM keywords WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      adGroupId: row.ad_group_id,
      campaignId: row.campaign_id,
      keywordText: row.keyword_text,
      matchType: row.match_type as Keyword['matchType'],
      state: row.state as Keyword['state'],
      bid: parseFloat(row.bid),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ============================================
  // Pending Changes (Confirmation Workflow)
  // ============================================

  async createPendingChange(change: {
    changeType: PendingChange['changeType'];
    targetType: PendingChange['targetType'];
    targetId: string;
    targetName?: string;
    currentValue: Record<string, unknown>;
    proposedValue: Record<string, unknown>;
    reason?: string;
  }): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO pending_changes (change_type, target_type, target_id, target_name, current_value, proposed_value, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
      [
        change.changeType,
        change.targetType,
        change.targetId,
        change.targetName ?? null,
        JSON.stringify(change.currentValue),
        JSON.stringify(change.proposedValue),
        change.reason ?? null,
      ]
    );

    return result.rows[0].id;
  }

  async getPendingChanges(status?: PendingChange['status']): Promise<PendingChange[]> {
    let query = 'SELECT * FROM pending_changes';
    const params: string[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      changeType: row.change_type,
      targetType: row.target_type,
      targetId: row.target_id,
      targetName: row.target_name,
      currentValue: row.current_value,
      proposedValue: row.proposed_value,
      reason: row.reason,
      status: row.status,
      createdAt: new Date(row.created_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
      executedAt: row.executed_at ? new Date(row.executed_at) : null,
      errorMessage: row.error_message,
    }));
  }

  async getPendingChangeById(id: number): Promise<PendingChange | null> {
    const result = await this.pool.query('SELECT * FROM pending_changes WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      changeType: row.change_type,
      targetType: row.target_type,
      targetId: row.target_id,
      targetName: row.target_name,
      currentValue: row.current_value,
      proposedValue: row.proposed_value,
      reason: row.reason,
      status: row.status,
      createdAt: new Date(row.created_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
      executedAt: row.executed_at ? new Date(row.executed_at) : null,
      errorMessage: row.error_message,
    };
  }

  async updatePendingChangeStatus(
    id: number,
    status: PendingChange['status'],
    errorMessage?: string
  ): Promise<void> {
    const updates: string[] = ['status = $2', 'reviewed_at = NOW()'];
    const params: (number | string)[] = [id, status];

    if (status === 'executed' || status === 'failed') {
      updates.push('executed_at = NOW()');
    }

    if (errorMessage) {
      params.push(errorMessage);
      updates.push(`error_message = $${params.length}`);
    }

    await this.pool.query(
      `UPDATE pending_changes SET ${updates.join(', ')} WHERE id = $1`,
      params
    );
  }

  async recordChangeHistory(
    pendingChangeId: number | null,
    targetType: string,
    targetId: string,
    changeType: string,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
    success: boolean,
    apiResponse?: Record<string, unknown>
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO change_history (pending_change_id, target_type, target_id, change_type, old_value, new_value, success, api_response)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        pendingChangeId,
        targetType,
        targetId,
        changeType,
        oldValue ? JSON.stringify(oldValue) : null,
        JSON.stringify(newValue),
        success,
        apiResponse ? JSON.stringify(apiResponse) : null,
      ]
    );
  }

  // ============================================
  // Utility
  // ============================================

  async getDateRange(): Promise<{ minDate: string; maxDate: string } | null> {
    const result = await this.pool.query(`
      SELECT MIN(date) as min_date, MAX(date) as max_date
      FROM campaign_metrics
    `);

    const row = result.rows[0];
    if (!row.min_date || !row.max_date) return null;

    const formatDate = (d: Date | string) =>
      d instanceof Date ? d.toISOString().split('T')[0] : d;

    return {
      minDate: formatDate(row.min_date),
      maxDate: formatDate(row.max_date),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
