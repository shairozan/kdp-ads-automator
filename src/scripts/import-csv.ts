#!/usr/bin/env tsx
/**
 * Import KDP Advertising data from CSV exports
 *
 * Usage:
 *   npm run import:csv -- <csv_file_path>
 *
 * Supports CSV exports from KDP Advertising dashboard:
 * - Campaign reports
 * - Search term reports
 * - Targeting reports
 */

import { parse } from 'csv-parse/sync';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { KdpDatabase } from '../db/database.js';
import type { Campaign, CampaignMetrics } from '../types/index.js';

const DB_PATH = process.env.DATABASE_PATH || './data/kdp-ads.db';

// Ensure data directory exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

interface CampaignReportRow {
  'Campaign Name': string;
  'Campaign ID'?: string;
  'Type'?: string;
  'Status': string;
  'Start Date': string;
  'End Date'?: string;
  'Budget': string;
  'Impressions': string;
  'Clicks': string;
  'Spend': string;
  'Sales': string;
  '14 Day Total Sales'?: string;
  'Orders': string;
  '14 Day Total Orders'?: string;
  'Units': string;
  '14 Day Total Units Sold'?: string;
  'ACOS'?: string;
  'Date'?: string;
  'Targeting Type'?: string;
}

/**
 * Parse currency string to number
 */
function parseCurrency(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/[$,]/g, '')) || 0;
}

/**
 * Parse integer string
 */
function parseInteger(value: string): number {
  if (!value) return 0;
  return parseInt(value.replace(/,/g, ''), 10) || 0;
}

/**
 * Parse date from various formats
 */
function parseDate(dateStr: string): string {
  if (!dateStr) return '';

  // Try YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try MM/DD/YYYY format
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try YYYYMMDD format (Amazon's format)
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }

  return dateStr;
}

/**
 * Generate a campaign ID from the name if not provided
 */
function generateCampaignId(name: string): string {
  return `campaign-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/**
 * Import a campaign report CSV
 */
function importCampaignReport(
  db: KdpDatabase,
  csvPath: string
): { campaigns: number; metrics: number } {
  console.log(`Reading CSV file: ${csvPath}`);

  const content = readFileSync(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CampaignReportRow[];

  console.log(`Found ${records.length} rows`);

  let campaignsImported = 0;
  let metricsImported = 0;

  // Group by campaign
  const campaignMap = new Map<string, CampaignReportRow[]>();

  for (const row of records) {
    const campaignName = row['Campaign Name'];
    if (!campaignName) continue;

    if (!campaignMap.has(campaignName)) {
      campaignMap.set(campaignName, []);
    }
    campaignMap.get(campaignName)!.push(row);
  }

  for (const [campaignName, rows] of campaignMap) {
    const firstRow = rows[0];
    const campaignId =
      firstRow['Campaign ID'] || generateCampaignId(campaignName);

    // Determine campaign state
    let state: Campaign['state'] = 'enabled';
    const status = firstRow['Status']?.toLowerCase();
    if (status === 'paused') state = 'paused';
    else if (status === 'archived') state = 'archived';

    // Determine targeting type
    let targetingType: Campaign['targetingType'] = 'auto';
    const targeting = firstRow['Targeting Type']?.toLowerCase();
    if (targeting === 'manual') targetingType = 'manual';

    // Parse budget
    const budget = parseCurrency(firstRow['Budget']) || 10;

    // Create/update campaign
    const campaign: Campaign = {
      id: campaignId,
      name: campaignName,
      campaignType: 'sponsoredProducts',
      state,
      dailyBudget: budget,
      startDate: parseDate(firstRow['Start Date']).replace(/-/g, ''),
      endDate: firstRow['End Date']
        ? parseDate(firstRow['End Date']).replace(/-/g, '')
        : undefined,
      targetingType,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.upsertCampaign(campaign);
    campaignsImported++;

    // Import metrics for each row (each row could be a different date)
    for (const row of rows) {
      // Try to get date from row, or use today
      let date = row['Date'] ? parseDate(row['Date']) : new Date().toISOString().split('T')[0];

      const metrics: CampaignMetrics = {
        campaignId,
        date,
        impressions: parseInteger(row['Impressions']),
        clicks: parseInteger(row['Clicks']),
        spend: parseCurrency(row['Spend']),
        sales: parseCurrency(row['14 Day Total Sales'] || row['Sales']),
        orders: parseInteger(row['14 Day Total Orders'] || row['Orders']),
        unitsSold: parseInteger(
          row['14 Day Total Units Sold'] || row['Units']
        ),
      };

      db.upsertCampaignMetrics(metrics);
      metricsImported++;
    }
  }

  return { campaigns: campaignsImported, metrics: metricsImported };
}

/**
 * Main entry point
 */
async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.log('Usage: npm run import:csv -- <csv_file_path>');
    console.log('');
    console.log('Supported CSV formats:');
    console.log('  - Campaign Performance Report from KDP Advertising');
    console.log('');
    console.log('Expected columns:');
    console.log('  - Campaign Name (required)');
    console.log('  - Impressions, Clicks, Spend, Sales, Orders, Units');
    console.log('  - Date (optional, for daily data)');
    console.log('');
    console.log('Example:');
    console.log('  npm run import:csv -- ./imports/campaign-report-2024-12.csv');
    process.exit(1);
  }

  if (!existsSync(csvPath)) {
    console.error(`Error: File not found: ${csvPath}`);
    process.exit(1);
  }

  const db = new KdpDatabase(DB_PATH);

  try {
    db.migrate();

    console.log('Importing campaign data...');
    const result = importCampaignReport(db, csvPath);

    console.log('');
    console.log('Import complete!');
    console.log(`  Campaigns: ${result.campaigns}`);
    console.log(`  Metrics records: ${result.metrics}`);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
