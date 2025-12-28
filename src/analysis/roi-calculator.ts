/**
 * ROI and Profitability Calculator for KDP Advertising
 *
 * Calculates key metrics:
 * - ACOS (Advertising Cost of Sales)
 * - ROAS (Return on Ad Spend)
 * - CTR (Click-Through Rate)
 * - CPC (Cost Per Click)
 * - Conversion Rate
 * - Estimated Profit/Loss
 * - Break-Even ACOS
 */

import type {
  CampaignMetrics,
  ROIMetrics,
  PeriodComparison,
  BookConfig,
  Campaign,
} from '../types/index.js';

export interface AnalysisConfig {
  royaltyPerSale: number;
  kenpRatePerPage?: number;
}

/**
 * Aggregate multiple days of metrics into a single summary
 */
function aggregateMetrics(metrics: CampaignMetrics[]): {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  unitsSold: number;
  kenpRoyalties: number;
} {
  return metrics.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      spend: acc.spend + m.spend,
      sales: acc.sales + m.sales,
      orders: acc.orders + m.orders,
      unitsSold: acc.unitsSold + m.unitsSold,
      kenpRoyalties: acc.kenpRoyalties + (m.kenpRoyalties ?? 0),
    }),
    {
      impressions: 0,
      clicks: 0,
      spend: 0,
      sales: 0,
      orders: 0,
      unitsSold: 0,
      kenpRoyalties: 0,
    }
  );
}

/**
 * Calculate ROI metrics for a campaign over a time period
 */
export function calculateROI(
  campaignId: string,
  campaignName: string,
  metrics: CampaignMetrics[],
  config: AnalysisConfig
): ROIMetrics {
  const agg = aggregateMetrics(metrics);

  // Calculate basic metrics
  const acos = agg.sales > 0 ? (agg.spend / agg.sales) * 100 : 0;
  const roas = agg.spend > 0 ? agg.sales / agg.spend : 0;
  const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
  const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
  const conversionRate = agg.clicks > 0 ? (agg.orders / agg.clicks) * 100 : 0;

  // Calculate royalties and profit
  const salesRoyalties = agg.unitsSold * config.royaltyPerSale;
  const totalRoyalties = salesRoyalties + agg.kenpRoyalties;
  const profit = totalRoyalties - agg.spend;
  const profitMargin = totalRoyalties > 0 ? (profit / totalRoyalties) * 100 : 0;

  // Break-even ACOS: the ACOS at which you neither profit nor lose
  // If royalty is $2.80 on a $9.99 book, break-even ACOS = (2.80/9.99) * 100 = 28%
  // Simplified: if we assume sales = list_price * units, then:
  // break-even when spend = royalties, so ACOS = (spend/sales) * 100
  // At break-even: spend = royaltyPerSale * unitsSold
  // So: (royaltyPerSale * units) / (listPrice * units) * 100 = (royalty/listPrice) * 100
  // For now, we'll calculate it based on actual data:
  const breakEvenAcos =
    agg.sales > 0
      ? (totalRoyalties / agg.sales) * 100
      : config.royaltyPerSale > 0
        ? 30 // reasonable default
        : 0;

  const dateRange =
    metrics.length > 0
      ? {
          startDate: metrics[0].date,
          endDate: metrics[metrics.length - 1].date,
        }
      : { startDate: '', endDate: '' };

  return {
    campaignId,
    campaignName,
    period: dateRange,
    totalSpend: agg.spend,
    totalSales: agg.sales,
    totalOrders: agg.orders,
    totalUnitsSold: agg.unitsSold,
    totalImpressions: agg.impressions,
    totalClicks: agg.clicks,
    acos,
    roas,
    ctr,
    cpc,
    conversionRate,
    estimatedRoyalties: totalRoyalties,
    estimatedProfit: profit,
    profitMargin,
    breakEvenAcos,
  };
}

/**
 * Calculate percentage change between two values
 */
function percentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Compare two time periods
 */
export function comparePeriods(
  current: ROIMetrics,
  previous: ROIMetrics
): PeriodComparison {
  return {
    currentPeriod: current,
    previousPeriod: previous,
    changes: {
      spendChange: percentageChange(current.totalSpend, previous.totalSpend),
      salesChange: percentageChange(current.totalSales, previous.totalSales),
      acosChange: percentageChange(current.acos, previous.acos),
      profitChange: percentageChange(current.estimatedProfit, previous.estimatedProfit),
      impressionsChange: percentageChange(
        current.totalImpressions,
        previous.totalImpressions
      ),
      clicksChange: percentageChange(current.totalClicks, previous.totalClicks),
    },
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Generate a text summary of ROI metrics
 */
export function generateROISummary(roi: ROIMetrics): string {
  const lines = [
    `Campaign: ${roi.campaignName}`,
    `Period: ${roi.period.startDate} to ${roi.period.endDate}`,
    '',
    '📊 Performance Metrics:',
    `  Impressions: ${roi.totalImpressions.toLocaleString()}`,
    `  Clicks: ${roi.totalClicks.toLocaleString()} (CTR: ${formatPercentage(roi.ctr)})`,
    `  Orders: ${roi.totalOrders} (Conversion: ${formatPercentage(roi.conversionRate)})`,
    '',
    '💰 Financial Metrics:',
    `  Spend: ${formatCurrency(roi.totalSpend)}`,
    `  Sales: ${formatCurrency(roi.totalSales)}`,
    `  CPC: ${formatCurrency(roi.cpc)}`,
    '',
    '📈 Efficiency Metrics:',
    `  ACOS: ${formatPercentage(roi.acos)} (Break-even: ${formatPercentage(roi.breakEvenAcos)})`,
    `  ROAS: ${roi.roas.toFixed(2)}x`,
    '',
    '💵 Profitability:',
    `  Estimated Royalties: ${formatCurrency(roi.estimatedRoyalties)}`,
    `  Estimated Profit: ${formatCurrency(roi.estimatedProfit)}`,
    `  Profit Margin: ${formatPercentage(roi.profitMargin)}`,
  ];

  // Add analysis
  lines.push('', '🔍 Analysis:');

  if (roi.acos > roi.breakEvenAcos) {
    lines.push(
      `  ⚠️ ACOS (${formatPercentage(roi.acos)}) is above break-even (${formatPercentage(roi.breakEvenAcos)})`
    );
    lines.push('  Consider optimizing keywords or reducing bids');
  } else {
    lines.push(
      `  ✅ ACOS (${formatPercentage(roi.acos)}) is below break-even (${formatPercentage(roi.breakEvenAcos)})`
    );
    lines.push('  Campaign is profitable');
  }

  if (roi.ctr < 0.3) {
    lines.push('  ⚠️ CTR is low - consider improving ad copy or targeting');
  }

  if (roi.conversionRate < 5) {
    lines.push(
      '  ⚠️ Conversion rate is low - review book listing quality and relevance'
    );
  }

  return lines.join('\n');
}

/**
 * Generate a comparison summary
 */
export function generateComparisonSummary(comparison: PeriodComparison): string {
  const { currentPeriod, previousPeriod, changes } = comparison;

  const formatChange = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    const emoji = value >= 0 ? '📈' : '📉';
    return `${emoji} ${sign}${value.toFixed(1)}%`;
  };

  const lines = [
    `Period Comparison`,
    `Current: ${currentPeriod.period.startDate} to ${currentPeriod.period.endDate}`,
    `Previous: ${previousPeriod.period.startDate} to ${previousPeriod.period.endDate}`,
    '',
    '📊 Changes:',
    `  Spend: ${formatCurrency(currentPeriod.totalSpend)} (${formatChange(changes.spendChange)})`,
    `  Sales: ${formatCurrency(currentPeriod.totalSales)} (${formatChange(changes.salesChange)})`,
    `  ACOS: ${formatPercentage(currentPeriod.acos)} (${formatChange(changes.acosChange)})`,
    `  Profit: ${formatCurrency(currentPeriod.estimatedProfit)} (${formatChange(changes.profitChange)})`,
    `  Impressions: ${currentPeriod.totalImpressions.toLocaleString()} (${formatChange(changes.impressionsChange)})`,
    `  Clicks: ${currentPeriod.totalClicks.toLocaleString()} (${formatChange(changes.clicksChange)})`,
  ];

  // Add interpretation
  lines.push('', '🔍 Interpretation:');

  if (changes.salesChange > changes.spendChange) {
    lines.push('  ✅ Efficiency improving - sales growing faster than spend');
  } else if (changes.salesChange < changes.spendChange) {
    lines.push('  ⚠️ Efficiency declining - spend growing faster than sales');
  }

  if (changes.acosChange < 0) {
    lines.push('  ✅ ACOS improved (lower is better)');
  } else if (changes.acosChange > 10) {
    lines.push('  ⚠️ ACOS increased significantly - review campaign performance');
  }

  return lines.join('\n');
}

/**
 * Calculate daily trends for visualization
 */
export function calculateDailyTrends(
  metrics: CampaignMetrics[]
): Array<{
  date: string;
  spend: number;
  sales: number;
  acos: number;
  impressions: number;
  clicks: number;
}> {
  return metrics.map((m) => ({
    date: m.date,
    spend: m.spend,
    sales: m.sales,
    acos: m.sales > 0 ? (m.spend / m.sales) * 100 : 0,
    impressions: m.impressions,
    clicks: m.clicks,
  }));
}
