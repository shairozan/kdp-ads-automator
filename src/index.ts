/**
 * KDP Ad Automator
 *
 * Main entry point for programmatic usage.
 * For MCP server, use: npm run mcp
 */

export { KdpDatabase } from './db/index.js';
export { AmazonAdsClient, createAmazonAdsClient } from './api/index.js';
export {
  calculateROI,
  comparePeriods,
  generateROISummary,
  generateComparisonSummary,
} from './analysis/index.js';
export * from './types/index.js';
