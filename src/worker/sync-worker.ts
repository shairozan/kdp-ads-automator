#!/usr/bin/env node
/**
 * Sync Worker for KDP Advertising Data
 *
 * This worker periodically fetches data from the Amazon Advertising API
 * and stores it in the PostgreSQL database.
 *
 * Features:
 * - Syncs campaigns, ad groups, and keywords
 * - Fetches daily performance metrics
 * - Configurable sync interval
 * - Tracks sync history for monitoring
 *
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection string
 * - AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN, AMAZON_PROFILE_ID
 * - SYNC_INTERVAL_MINUTES: How often to sync (default: 60)
 * - METRICS_LOOKBACK_DAYS: How many days of metrics to fetch (default: 14)
 */

import { KdpDatabase } from '../db/database.js';
import { createAmazonAdsClient, AmazonAdsClient } from '../api/amazon-ads-client.js';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '60', 10);
const METRICS_LOOKBACK_DAYS = parseInt(process.env.METRICS_LOOKBACK_DAYS || '14', 10);

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

const db = new KdpDatabase(DATABASE_URL);
const adsClient = createAmazonAdsClient();

if (!adsClient) {
  console.error('Error: Amazon Advertising API credentials not configured');
  console.error('Required environment variables:');
  console.error('  - AMAZON_CLIENT_ID');
  console.error('  - AMAZON_CLIENT_SECRET');
  console.error('  - AMAZON_REFRESH_TOKEN');
  console.error('  - AMAZON_PROFILE_ID');
  process.exit(1);
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format date as YYYYMMDD (Amazon's format)
 */
function formatAmazonDate(date: Date): string {
  return formatDate(date).replace(/-/g, '');
}

/**
 * Get date range for metrics sync
 */
function getMetricsDateRange(): { startDate: string; endDate: string } {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // Yesterday (today's data isn't complete)

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - METRICS_LOOKBACK_DAYS);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

/**
 * Sync campaigns from Amazon API to database
 */
async function syncCampaigns(client: AmazonAdsClient): Promise<number> {
  console.log('Syncing campaigns...');

  const campaigns = await client.getCampaigns();
  console.log(`Found ${campaigns.length} campaigns`);

  for (const campaign of campaigns) {
    await db.upsertCampaign(campaign);
  }

  return campaigns.length;
}

/**
 * Sync ad groups for all campaigns
 */
async function syncAdGroups(client: AmazonAdsClient): Promise<number> {
  console.log('Syncing ad groups...');

  const campaigns = await db.getCampaigns();
  let totalAdGroups = 0;

  for (const campaign of campaigns) {
    // Skip demo campaigns
    if (isDemoCampaignId(campaign.id)) continue;

    try {
      const adGroups = await client.getAdGroups(campaign.id);
      console.log(`  Campaign "${campaign.name}": ${adGroups.length} ad groups`);

      for (const adGroup of adGroups) {
        await db.upsertAdGroup(adGroup);
        totalAdGroups++;
      }
    } catch (error) {
      console.error(`  Error syncing ad groups for campaign ${campaign.id}:`, error);
    }
  }

  return totalAdGroups;
}

/**
 * Check if a campaign ID is a demo/test ID (not from real API)
 */
function isDemoCampaignId(campaignId: string): boolean {
  return campaignId.startsWith('demo-');
}

/**
 * Sync keywords for all campaigns
 */
async function syncKeywords(client: AmazonAdsClient): Promise<number> {
  console.log('Syncing keywords...');

  const campaigns = await db.getCampaigns('enabled');
  let totalKeywords = 0;

  for (const campaign of campaigns) {
    // Skip demo campaigns and non-manual targeting
    if (isDemoCampaignId(campaign.id)) continue;
    if (campaign.targetingType !== 'manual') continue;

    try {
      const keywords = await client.getKeywords(campaign.id);
      console.log(`  Campaign "${campaign.name}": ${keywords.length} keywords`);

      for (const keyword of keywords) {
        await db.upsertKeyword(keyword);
        totalKeywords++;
      }
    } catch (error) {
      console.error(`  Error syncing keywords for campaign ${campaign.id}:`, error);
    }
  }

  return totalKeywords;
}

/**
 * Sync product and category targets for all campaigns
 */
async function syncTargets(client: AmazonAdsClient): Promise<{ productTargets: number; categoryTargets: number }> {
  console.log('Syncing product and category targets...');

  const campaigns = await db.getCampaigns('enabled');
  let totalProductTargets = 0;
  let totalCategoryTargets = 0;

  for (const campaign of campaigns) {
    // Skip demo campaigns and auto-targeting campaigns (they use different targeting)
    if (isDemoCampaignId(campaign.id)) continue;
    if (campaign.targetingType !== 'manual') continue;

    try {
      const { productTargets, categoryTargets } = await client.getTargets(campaign.id);
      console.log(`  Campaign "${campaign.name}": ${productTargets.length} product targets, ${categoryTargets.length} category targets`);

      for (const target of productTargets) {
        await db.upsertProductTarget(target);
        totalProductTargets++;
      }

      for (const target of categoryTargets) {
        await db.upsertCategoryTarget(target);
        totalCategoryTargets++;
      }
    } catch (error) {
      console.error(`  Error syncing targets for campaign ${campaign.id}:`, error);
    }
  }

  return { productTargets: totalProductTargets, categoryTargets: totalCategoryTargets };
}

/**
 * Sync performance metrics
 */
async function syncMetrics(client: AmazonAdsClient): Promise<number> {
  console.log('Syncing metrics...');

  const { startDate, endDate } = getMetricsDateRange();
  console.log(`  Date range: ${startDate} to ${endDate}`);

  try {
    const metrics = await client.fetchCampaignMetrics(startDate, endDate);
    console.log(`  Fetched ${metrics.length} metric records`);

    for (const metric of metrics) {
      await db.upsertCampaignMetrics(metric);
    }

    return metrics.length;
  } catch (error) {
    console.error('  Error fetching metrics:', error);
    return 0;
  }
}

/**
 * Run a full sync
 */
async function runSync(): Promise<void> {
  const startTime = Date.now();
  console.log('='.repeat(50));
  console.log(`Starting sync at ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  let totalRecords = 0;
  let success = true;
  let errorMessage: string | undefined;

  try {
    // Run migrations on startup
    await db.migrate();

    // Sync in order: campaigns -> ad groups -> keywords -> targets -> metrics
    const campaignCount = await syncCampaigns(adsClient!);
    totalRecords += campaignCount;

    const adGroupCount = await syncAdGroups(adsClient!);
    totalRecords += adGroupCount;

    const keywordCount = await syncKeywords(adsClient!);
    totalRecords += keywordCount;

    const { productTargets, categoryTargets } = await syncTargets(adsClient!);
    totalRecords += productTargets + categoryTargets;

    const metricsCount = await syncMetrics(adsClient!);
    totalRecords += metricsCount;

    console.log('');
    console.log('Sync completed successfully!');
    console.log(`  Total records synced: ${totalRecords}`);
    console.log(`    - Campaigns: ${campaignCount}`);
    console.log(`    - Ad groups: ${adGroupCount}`);
    console.log(`    - Keywords: ${keywordCount}`);
    console.log(`    - Product targets: ${productTargets}`);
    console.log(`    - Category targets: ${categoryTargets}`);
    console.log(`    - Metrics: ${metricsCount}`);
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sync failed:', errorMessage);
  }

  const duration = Date.now() - startTime;
  console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log('='.repeat(50));
  console.log('');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('KDP Ad Sync Worker starting...');
  console.log(`  Sync interval: ${SYNC_INTERVAL_MINUTES} minutes`);
  console.log(`  Metrics lookback: ${METRICS_LOOKBACK_DAYS} days`);
  console.log('');

  // Run initial sync
  await runSync();

  // Schedule recurring syncs
  const intervalMs = SYNC_INTERVAL_MINUTES * 60 * 1000;
  setInterval(runSync, intervalMs);

  console.log(`Next sync in ${SYNC_INTERVAL_MINUTES} minutes...`);
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  await db.close();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
