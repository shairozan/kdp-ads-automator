/**
 * Amazon Advertising API Client (v3)
 *
 * This client handles OAuth authentication and API calls to Amazon's
 * Advertising API for Sponsored Products campaigns.
 *
 * API Documentation: https://advertising.amazon.com/API/docs/en-us
 * Migration Guide: https://advertising.amazon.com/API/docs/en-us/reference/migration-guides/sp-v2-v3
 *
 * Required credentials:
 * - Client ID and Secret from Amazon Developer Console
 * - Refresh token from Login with Amazon OAuth flow
 * - Profile ID for the advertising account
 *
 * Note: v2 API was deprecated March 2023. This client uses v3 endpoints.
 */

import type {
  Campaign,
  AdGroup,
  Keyword,
  ProductTarget,
  CategoryTarget,
  CampaignMetrics,
  AmazonApiError,
  ProductTargetType,
} from '../types/index.js';

const API_BASE = 'https://advertising-api.amazon.com';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

// v3 API content types
const CONTENT_TYPES = {
  campaign: 'application/vnd.spCampaign.v3+json',
  adGroup: 'application/vnd.spAdGroup.v3+json',
  keyword: 'application/vnd.spKeyword.v3+json',
  negativeKeyword: 'application/vnd.spNegativeKeyword.v3+json',
  targeting: 'application/vnd.spTargetingClause.v3+json',
  report: 'application/vnd.createasyncreportrequest.v3+json',
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// v3 API response types
interface AmazonCampaignResponseV3 {
  campaignId: string;
  name: string;
  state: string;
  budget: {
    budget: number;
    budgetType: string;
  };
  startDate: string;
  endDate?: string;
  targetingType: string;
  dynamicBidding?: {
    strategy: string;
    placementBidding: Array<{ placement: string; percentage: number }>;
  };
}

interface AmazonAdGroupResponseV3 {
  adGroupId: string;
  campaignId: string;
  name: string;
  state: string;
  defaultBid: number;
}

interface AmazonKeywordResponseV3 {
  keywordId: string;
  adGroupId: string;
  campaignId: string;
  keywordText: string;
  matchType: string;
  state: string;
  bid: number;
}

interface AmazonTargetingClauseResponseV3 {
  targetId: string;
  adGroupId: string;
  campaignId: string;
  state: string;
  bid: number;
  expression: Array<{
    type: string;
    value?: string;
  }>;
  resolvedExpression?: Array<{
    type: string;
    value?: string;
  }>;
  expressionType: 'auto' | 'manual';
}

// v3 Report types
interface ReportStatusV3 {
  reportId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  url?: string;
  urlExpiresAt?: string;
  failureReason?: string;
}

export class AmazonAdsClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private profileId: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    profileId: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
    this.profileId = config.profileId;
  }

  /**
   * Refresh the OAuth access token
   */
  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getAccessToken(): Promise<string> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry <= new Date()) {
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  /**
   * Make an authenticated API request
   * @param endpoint - API endpoint path
   * @param options - Fetch options
   * @param contentType - v3 content type (e.g., CONTENT_TYPES.campaign)
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    contentType?: string
  ): Promise<T> {
    const token = await this.getAccessToken();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Amazon-Advertising-API-ClientId': this.clientId,
      'Amazon-Advertising-API-Scope': this.profileId,
    };

    if (contentType) {
      headers['Content-Type'] = contentType;
      headers['Accept'] = contentType;
    } else {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const error = JSON.parse(errorText);
        errorMessage = `API Error: ${error.code || response.status} - ${error.message || error.details || errorText}`;
      } catch {
        errorMessage = `API Error: ${response.status} - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // Campaign Operations (v3 API)
  // ============================================

  /**
   * Get all Sponsored Products campaigns
   */
  async getCampaigns(): Promise<Campaign[]> {
    const response = await this.request<{ campaigns: AmazonCampaignResponseV3[] }>(
      '/sp/campaigns/list',
      {
        method: 'POST',
        body: JSON.stringify({ maxResults: 100 }),
      },
      CONTENT_TYPES.campaign
    );

    return response.campaigns.map((c) => ({
      id: c.campaignId,
      name: c.name,
      campaignType: 'sponsoredProducts' as const,
      state: c.state.toLowerCase() as Campaign['state'],
      dailyBudget: c.budget.budget,
      startDate: c.startDate,
      endDate: c.endDate,
      targetingType: c.targetingType.toLowerCase() as Campaign['targetingType'],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Get ad groups for a campaign
   */
  async getAdGroups(campaignId: string): Promise<AdGroup[]> {
    const response = await this.request<{ adGroups: AmazonAdGroupResponseV3[] }>(
      '/sp/adGroups/list',
      {
        method: 'POST',
        body: JSON.stringify({
          campaignIdFilter: { include: [campaignId] },
          maxResults: 100,
        }),
      },
      CONTENT_TYPES.adGroup
    );

    return response.adGroups.map((ag) => ({
      id: ag.adGroupId,
      campaignId: ag.campaignId,
      name: ag.name,
      state: ag.state.toLowerCase() as AdGroup['state'],
      defaultBid: ag.defaultBid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Get keywords for a campaign
   */
  async getKeywords(campaignId: string): Promise<Keyword[]> {
    const response = await this.request<{ keywords: AmazonKeywordResponseV3[] }>(
      '/sp/keywords/list',
      {
        method: 'POST',
        body: JSON.stringify({
          campaignIdFilter: { include: [campaignId] },
          maxResults: 100,
        }),
      },
      CONTENT_TYPES.keyword
    );

    return response.keywords.map((kw) => ({
      id: kw.keywordId,
      adGroupId: kw.adGroupId,
      campaignId: kw.campaignId,
      keywordText: kw.keywordText,
      matchType: kw.matchType.toLowerCase() as Keyword['matchType'],
      state: kw.state.toLowerCase() as Keyword['state'],
      bid: kw.bid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Get product and category targets for a campaign
   * Returns both product targets (ASIN targeting) and category targets
   */
  async getTargets(campaignId: string): Promise<{
    productTargets: ProductTarget[];
    categoryTargets: CategoryTarget[];
  }> {
    const response = await this.request<{ targetingClauses: AmazonTargetingClauseResponseV3[] }>(
      '/sp/targets/list',
      {
        method: 'POST',
        body: JSON.stringify({
          campaignIdFilter: { include: [campaignId] },
          maxResults: 100,
        }),
      },
      CONTENT_TYPES.targeting
    );

    const productTargets: ProductTarget[] = [];
    const categoryTargets: CategoryTarget[] = [];

    for (const target of response.targetingClauses) {
      const expression = target.expression[0];
      if (!expression) continue;

      const expressionType = expression.type.toLowerCase();

      // Category targeting uses 'asinCategorySameAs' type
      if (expressionType === 'asincategorysameas') {
        categoryTargets.push({
          id: target.targetId,
          adGroupId: target.adGroupId,
          campaignId: target.campaignId,
          categoryId: expression.value || '',
          categoryName: undefined, // Would need separate API call to get name
          state: target.state.toLowerCase() as CategoryTarget['state'],
          bid: target.bid,
          refinements: this.parseRefinements(target.expression),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        // All other targeting types are product targets
        productTargets.push({
          id: target.targetId,
          adGroupId: target.adGroupId,
          campaignId: target.campaignId,
          targetType: this.mapTargetType(expressionType),
          expressionValue: expression.value || '',
          resolvedExpression: target.resolvedExpression?.map(e => ({
            type: e.type,
            value: e.value || '',
          })),
          state: target.state.toLowerCase() as ProductTarget['state'],
          bid: target.bid,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return { productTargets, categoryTargets };
  }

  /**
   * Map Amazon API target type to our ProductTargetType
   */
  private mapTargetType(apiType: string): ProductTargetType {
    const typeMap: Record<string, ProductTargetType> = {
      'asinsameas': 'asinSameAs',
      'asinexpandedfrom': 'asinExpandedFrom',
      'asincategorysameas': 'asinCategorySameAs',
      'asinbrandsameas': 'asinBrandSameAs',
      'asinpricelessthan': 'asinPriceLessThan',
      'asinpricebetween': 'asinPriceBetween',
      'asinpricegreaterthan': 'asinPriceGreaterThan',
      'asinreviewratinglessthan': 'asinReviewRatingLessThan',
      'asinreviewratingbetween': 'asinReviewRatingBetween',
      'asinreviewratinggreaterthan': 'asinReviewRatingGreaterThan',
    };
    return typeMap[apiType.toLowerCase()] || 'asinSameAs';
  }

  /**
   * Parse refinements from targeting expression (for category targets)
   */
  private parseRefinements(expressions: Array<{ type: string; value?: string }>): CategoryTarget['refinements'] | undefined {
    if (expressions.length <= 1) return undefined;

    const refinements: CategoryTarget['refinements'] = {};

    for (const expr of expressions.slice(1)) {
      const type = expr.type.toLowerCase();
      if (type === 'asinbrandsameas' && expr.value) {
        refinements.brands = refinements.brands || [];
        refinements.brands.push(expr.value);
      }
      // Add more refinement parsing as needed
    }

    return Object.keys(refinements).length > 0 ? refinements : undefined;
  }

  /**
   * Update product/category target bid
   */
  async updateTargetBid(targetId: string, newBid: number): Promise<{ success: boolean; targetId: string }> {
    const response = await this.request<{ targetingClauses: Array<{ targetId: string; index: number; code: string }> }>(
      '/sp/targets',
      {
        method: 'PUT',
        body: JSON.stringify({
          targetingClauses: [
            {
              targetId,
              bid: newBid,
            },
          ],
        }),
      },
      CONTENT_TYPES.targeting
    );

    const result = response.targetingClauses[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update target bid: ${result.code}`);
    }

    return { success: true, targetId };
  }

  /**
   * Update product/category target state (enable, pause, archive)
   */
  async updateTargetState(
    targetId: string,
    state: 'enabled' | 'paused' | 'archived'
  ): Promise<{ success: boolean; targetId: string }> {
    const response = await this.request<{ targetingClauses: Array<{ targetId: string; index: number; code: string }> }>(
      '/sp/targets',
      {
        method: 'PUT',
        body: JSON.stringify({
          targetingClauses: [
            {
              targetId,
              state: state.toUpperCase(),
            },
          ],
        }),
      },
      CONTENT_TYPES.targeting
    );

    const result = response.targetingClauses[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update target state: ${result.code}`);
    }

    return { success: true, targetId };
  }

  // ============================================
  // Report Operations (v3 API)
  // ============================================

  /**
   * Request a campaign performance report (v3)
   */
  async requestCampaignReport(
    startDate: string,
    endDate: string
  ): Promise<string> {
    // v3 reporting uses different column names than v2
    // See: https://advertising.amazon.com/API/docs/en-us/reporting/v3/report-types
    const reportRequest = {
      startDate,
      endDate,
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['campaign'],
        columns: [
          'campaignId',
          'campaignName',
          'date',
          'impressions',
          'clicks',
          'cost',
          'purchases14d',
          'sales14d',
          'unitsSoldClicks14d',
        ],
        reportTypeId: 'spCampaigns',
        timeUnit: 'DAILY',
        format: 'GZIP_JSON',
      },
    };

    const response = await this.request<{ reportId: string }>(
      '/reporting/reports',
      {
        method: 'POST',
        body: JSON.stringify(reportRequest),
      },
      CONTENT_TYPES.report
    );

    return response.reportId;
  }

  /**
   * Check report generation status (v3)
   */
  async getReportStatus(reportId: string): Promise<ReportStatusV3> {
    return this.request<ReportStatusV3>(`/reporting/reports/${reportId}`);
  }

  /**
   * Download a completed report (v3 - gzipped JSON)
   */
  async downloadReport(location: string): Promise<CampaignMetrics[]> {
    // The report URL is a pre-signed S3 URL with auth in query params
    // Do NOT send Authorization headers - S3 rejects requests with both
    const response = await fetch(location);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download report: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // v3 reports are gzipped - decompress them
    const arrayBuffer = await response.arrayBuffer();
    const decompressed = await this.decompressGzip(new Uint8Array(arrayBuffer));
    const text = new TextDecoder().decode(decompressed);

    // v3 reports can be either:
    // - A JSON array on a single line: [{"campaignId":...}, {"campaignId":...}]
    // - Newline-delimited JSON: {"campaignId":...}\n{"campaignId":...}
    let data: Array<Record<string, unknown>>;

    const trimmedText = text.trim();
    if (trimmedText.startsWith('[')) {
      // JSON array format
      data = JSON.parse(trimmedText) as Array<Record<string, unknown>>;
    } else {
      // Newline-delimited JSON
      const lines = trimmedText.split('\n').filter(line => line.length > 0);
      data = lines.map(line => JSON.parse(line)) as Array<Record<string, unknown>>;
    }

    console.log(`  Report contains ${data.length} records`);

    return data.map((row) => ({
      // campaignId comes as a number, convert to string
      campaignId: String(row.campaignId || ''),
      date: String(row.date || new Date().toISOString().split('T')[0]),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      spend: Number(row.cost || 0),
      sales: Number(row.sales14d || 0),
      orders: Number(row.purchases14d || 0),
      unitsSold: Number(row.unitsSoldClicks14d || 0),
    }));
  }

  /**
   * Decompress gzip data
   */
  private async decompressGzip(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Request and wait for a report to complete
   */
  async fetchCampaignMetrics(
    startDate: string,
    endDate: string,
    pollInterval = 5000,
    maxWaitTime = 300000
  ): Promise<CampaignMetrics[]> {
    const reportId = await this.requestCampaignReport(startDate, endDate);

    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getReportStatus(reportId);

      if (status.status === 'COMPLETED' && status.url) {
        return this.downloadReport(status.url);
      }

      if (status.status === 'FAILED') {
        throw new Error(`Report generation failed: ${status.failureReason || 'Unknown error'}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Report generation timed out');
  }

  // ============================================
  // Write Operations (v3 API)
  // ============================================

  /**
   * Update keyword bid
   */
  async updateKeywordBid(keywordId: string, newBid: number): Promise<{ success: boolean; keywordId: string }> {
    const response = await this.request<{ keywords: Array<{ keywordId: string; index: number; code: string }> }>(
      '/sp/keywords',
      {
        method: 'PUT',
        body: JSON.stringify({
          keywords: [
            {
              keywordId,
              bid: newBid,
            },
          ],
        }),
      },
      CONTENT_TYPES.keyword
    );

    const result = response.keywords[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update keyword bid: ${result.code}`);
    }

    return { success: true, keywordId };
  }

  /**
   * Update keyword state (enable, pause, archive)
   */
  async updateKeywordState(
    keywordId: string,
    state: 'enabled' | 'paused' | 'archived'
  ): Promise<{ success: boolean; keywordId: string }> {
    const response = await this.request<{ keywords: Array<{ keywordId: string; index: number; code: string }> }>(
      '/sp/keywords',
      {
        method: 'PUT',
        body: JSON.stringify({
          keywords: [
            {
              keywordId,
              state: state.toUpperCase(),
            },
          ],
        }),
      },
      CONTENT_TYPES.keyword
    );

    const result = response.keywords[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update keyword state: ${result.code}`);
    }

    return { success: true, keywordId };
  }

  /**
   * Update campaign daily budget
   */
  async updateCampaignBudget(
    campaignId: string,
    dailyBudget: number
  ): Promise<{ success: boolean; campaignId: string }> {
    const response = await this.request<{ campaigns: Array<{ campaignId: string; index: number; code: string }> }>(
      '/sp/campaigns',
      {
        method: 'PUT',
        body: JSON.stringify({
          campaigns: [
            {
              campaignId,
              budget: {
                budget: dailyBudget,
                budgetType: 'DAILY',
              },
            },
          ],
        }),
      },
      CONTENT_TYPES.campaign
    );

    const result = response.campaigns[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update campaign budget: ${result.code}`);
    }

    return { success: true, campaignId };
  }

  /**
   * Update campaign state (enable, pause, archive)
   */
  async updateCampaignState(
    campaignId: string,
    state: 'enabled' | 'paused' | 'archived'
  ): Promise<{ success: boolean; campaignId: string }> {
    const response = await this.request<{ campaigns: Array<{ campaignId: string; index: number; code: string }> }>(
      '/sp/campaigns',
      {
        method: 'PUT',
        body: JSON.stringify({
          campaigns: [
            {
              campaignId,
              state: state.toUpperCase(),
            },
          ],
        }),
      },
      CONTENT_TYPES.campaign
    );

    const result = response.campaigns[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update campaign state: ${result.code}`);
    }

    return { success: true, campaignId };
  }

  /**
   * Add a negative keyword to a campaign
   */
  async addNegativeKeyword(
    campaignId: string,
    keywordText: string,
    matchType: 'negativeExact' | 'negativePhrase'
  ): Promise<{ success: boolean; keywordId: string }> {
    // Map match types to v3 format
    const v3MatchType = matchType === 'negativeExact' ? 'NEGATIVE_EXACT' : 'NEGATIVE_PHRASE';

    const response = await this.request<{ campaignNegativeKeywords: Array<{ keywordId: string; index: number; code: string }> }>(
      '/sp/campaignNegativeKeywords',
      {
        method: 'POST',
        body: JSON.stringify({
          campaignNegativeKeywords: [
            {
              campaignId,
              keywordText,
              matchType: v3MatchType,
              state: 'ENABLED',
            },
          ],
        }),
      },
      CONTENT_TYPES.negativeKeyword
    );

    const result = response.campaignNegativeKeywords[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to add negative keyword: ${result.code}`);
    }

    return { success: true, keywordId: result.keywordId };
  }

  /**
   * Update ad group default bid
   */
  async updateAdGroupBid(
    adGroupId: string,
    defaultBid: number
  ): Promise<{ success: boolean; adGroupId: string }> {
    const response = await this.request<{ adGroups: Array<{ adGroupId: string; index: number; code: string }> }>(
      '/sp/adGroups',
      {
        method: 'PUT',
        body: JSON.stringify({
          adGroups: [
            {
              adGroupId,
              defaultBid,
            },
          ],
        }),
      },
      CONTENT_TYPES.adGroup
    );

    const result = response.adGroups[0];
    if (result.code !== 'SUCCESS') {
      throw new Error(`Failed to update ad group bid: ${result.code}`);
    }

    return { success: true, adGroupId };
  }

  // ============================================
  // Profile Operations
  // ============================================

  /**
   * Get available advertising profiles
   * Useful during initial setup to find the profile ID
   */
  async getProfiles(): Promise<Array<{
    profileId: string;
    countryCode: string;
    accountInfo: {
      marketplaceStringId: string;
      sellerStringId: string;
    };
  }>> {
    // Note: This endpoint doesn't require a profile ID header
    const token = await this.getAccessToken();

    const response = await fetch(`${API_BASE}/v2/profiles`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Amazon-Advertising-API-ClientId': this.clientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get profiles: ${response.statusText}`);
    }

    return response.json() as Promise<Array<{
      profileId: string;
      countryCode: string;
      accountInfo: {
        marketplaceStringId: string;
        sellerStringId: string;
      };
    }>>;
  }
}

/**
 * Factory function to create client from environment variables
 */
export function createAmazonAdsClient(): AmazonAdsClient | null {
  const clientId = process.env.AMAZON_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_REFRESH_TOKEN;
  const profileId = process.env.AMAZON_PROFILE_ID;

  if (!clientId || !clientSecret || !refreshToken || !profileId) {
    return null;
  }

  return new AmazonAdsClient({
    clientId,
    clientSecret,
    refreshToken,
    profileId,
  });
}
