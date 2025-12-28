/**
 * Core types for KDP Advertising campaigns
 * Based on Amazon Advertising API Sponsored Products schema
 */

export interface Campaign {
  id: string;
  name: string;
  campaignType: 'sponsoredProducts' | 'sponsoredBrands' | 'sponsoredDisplay';
  state: 'enabled' | 'paused' | 'archived';
  dailyBudget: number;
  startDate: string; // YYYYMMDD format
  endDate?: string;
  targetingType: 'manual' | 'auto';
  createdAt: Date;
  updatedAt: Date;
}

export interface AdGroup {
  id: string;
  campaignId: string;
  name: string;
  state: 'enabled' | 'paused' | 'archived';
  defaultBid: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Keyword {
  id: string;
  adGroupId: string;
  campaignId: string;
  keywordText: string;
  matchType: 'broad' | 'phrase' | 'exact';
  state: 'enabled' | 'paused' | 'archived';
  bid: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductAd {
  id: string;
  adGroupId: string;
  campaignId: string;
  asin: string;
  sku?: string;
  state: 'enabled' | 'paused' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Product targeting types supported by Amazon Advertising API
 */
export type ProductTargetType =
  | 'asinSameAs'           // Target specific ASIN
  | 'asinExpandedFrom'     // Expanded targeting from an ASIN
  | 'asinCategorySameAs'   // Target ASINs in same category
  | 'asinBrandSameAs'      // Target ASINs of same brand
  | 'asinPriceLessThan'    // Target ASINs below price
  | 'asinPriceBetween'     // Target ASINs in price range
  | 'asinPriceGreaterThan' // Target ASINs above price
  | 'asinReviewRatingLessThan'    // Target by review rating
  | 'asinReviewRatingBetween'     // Target by review rating range
  | 'asinReviewRatingGreaterThan'; // Target by review rating

/**
 * Product target (ASIN targeting)
 */
export interface ProductTarget {
  id: string;
  adGroupId: string;
  campaignId: string;
  targetType: ProductTargetType;
  expressionValue: string;  // The ASIN or value being targeted
  resolvedExpression?: {    // Full targeting expression from API
    type: string;
    value: string;
  }[];
  state: 'enabled' | 'paused' | 'archived';
  bid: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Category target
 */
export interface CategoryTarget {
  id: string;
  adGroupId: string;
  campaignId: string;
  categoryId: string;
  categoryName?: string;
  state: 'enabled' | 'paused' | 'archived';
  bid: number;
  refinements?: {
    brands?: string[];
    priceRange?: { min?: number; max?: number };
    reviewRating?: { min?: number; max?: number };
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Metrics from Amazon Advertising reports
 */
export interface CampaignMetrics {
  campaignId: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number; // in dollars
  sales: number; // attributed sales in dollars
  orders: number; // number of orders
  unitsSold: number;
  // Kindle-specific metrics
  kenpRoyalties?: number;
  kenpPagesRead?: number;
}

export interface KeywordMetrics {
  keywordId: string;
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  unitsSold: number;
}

export interface ProductTargetMetrics {
  targetId: string;
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  unitsSold: number;
}

export interface CategoryTargetMetrics {
  targetId: string;
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  unitsSold: number;
}

/**
 * Calculated ROI metrics
 */
export interface ROIMetrics {
  campaignId: string;
  campaignName: string;
  period: {
    startDate: string;
    endDate: string;
  };
  // Raw metrics
  totalSpend: number;
  totalSales: number;
  totalOrders: number;
  totalUnitsSold: number;
  totalImpressions: number;
  totalClicks: number;
  // Calculated metrics
  acos: number; // Advertising Cost of Sales (spend/sales * 100)
  roas: number; // Return on Ad Spend (sales/spend)
  ctr: number; // Click-through rate (clicks/impressions * 100)
  cpc: number; // Cost per click (spend/clicks)
  conversionRate: number; // orders/clicks * 100
  // Profitability (requires book royalty info)
  estimatedRoyalties: number;
  estimatedProfit: number; // royalties - spend
  profitMargin: number; // profit/royalties * 100
  breakEvenAcos: number; // maximum ACOS to break even
}

export interface PeriodComparison {
  currentPeriod: ROIMetrics;
  previousPeriod: ROIMetrics;
  changes: {
    spendChange: number; // percentage
    salesChange: number;
    acosChange: number;
    profitChange: number;
    impressionsChange: number;
    clicksChange: number;
  };
}

/**
 * Book configuration for royalty calculations
 */
export interface BookConfig {
  title: string;
  asin: string;
  royaltyPerSale: number; // USD per sale
  kenpRatePerPage?: number; // USD per KENP page read
  listPrice?: number;
}

/**
 * API response types
 */
export interface AmazonApiError {
  code: string;
  message: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextToken?: string;
  totalCount?: number;
}
