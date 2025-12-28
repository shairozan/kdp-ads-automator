#!/usr/bin/env node
/**
 * MCP Server for KDP Advertising Analytics
 *
 * Exposes tools and resources for Claude to analyze and manage your KDP ad campaigns.
 *
 * Read Tools:
 * - get_campaigns: List all campaigns
 * - get_campaign_metrics: Get metrics for a specific campaign
 * - get_keywords: Get keywords for a campaign
 * - analyze_roi: Calculate ROI metrics for a campaign
 * - compare_periods: Compare performance between two periods
 * - get_daily_breakdown: Get day-by-day metrics
 * - get_data_range: Get available date range
 *
 * Write Tools (require confirmation):
 * - propose_bid_change: Propose a keyword bid adjustment
 * - propose_keyword_state_change: Propose to pause/enable a keyword
 * - propose_budget_change: Propose a campaign budget change
 * - propose_negative_keyword: Propose adding a negative keyword
 * - list_pending_changes: View all pending changes
 * - approve_change: Approve a pending change (executes it)
 * - reject_change: Reject a pending change
 *
 * Resources:
 * - kdp://campaigns: List of all campaigns
 * - kdp://metrics/summary: Overall metrics summary
 * - kdp://pending-changes: List of pending changes awaiting approval
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { KdpDatabase, type PendingChange } from '../db/database.js';
import { createAmazonAdsClient } from '../api/amazon-ads-client.js';
import {
  calculateROI,
  comparePeriods,
  generateROISummary,
  generateComparisonSummary,
  calculateDailyTrends,
  formatCurrency,
  formatPercentage,
} from '../analysis/roi-calculator.js';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const ROYALTY_PER_SALE = parseFloat(process.env.BOOK_ROYALTY_AMOUNT || '2.80');
const KENP_RATE = parseFloat(process.env.KENP_RATE_PER_PAGE || '0.0045');

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Initialize database
const db = new KdpDatabase(DATABASE_URL);

// Initialize Amazon Ads API client (may be null if not configured)
const adsClient = createAmazonAdsClient();

// Create MCP server
const server = new Server(
  {
    name: 'kdp-ad-automator',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ============================================
// Tool Definitions
// ============================================

const readTools = [
  {
    name: 'get_campaigns',
    description:
      'List all KDP advertising campaigns. Returns campaign ID, name, type, state, budget, and targeting type.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        state: {
          type: 'string',
          enum: ['enabled', 'paused', 'archived'],
          description: 'Filter by campaign state (optional)',
        },
      },
    },
  },
  {
    name: 'get_keywords',
    description:
      'Get all keywords for a campaign with their current bids and states.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to get keywords for',
        },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'get_campaign_metrics',
    description:
      'Get performance metrics for a specific campaign over a date range. Returns impressions, clicks, spend, sales, orders, and units sold.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to get metrics for',
        },
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['campaign_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'analyze_roi',
    description:
      'Calculate comprehensive ROI metrics for a campaign including ACOS, ROAS, CTR, CPC, conversion rate, and profitability analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description:
            'The campaign ID to analyze. Use "all" for aggregate analysis across all campaigns.',
        },
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['campaign_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'compare_periods',
    description:
      'Compare campaign performance between two time periods to identify trends and changes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to compare. Use "all" for aggregate comparison.',
        },
        current_start: {
          type: 'string',
          description: 'Current period start date (YYYY-MM-DD)',
        },
        current_end: {
          type: 'string',
          description: 'Current period end date (YYYY-MM-DD)',
        },
        previous_start: {
          type: 'string',
          description: 'Previous period start date (YYYY-MM-DD)',
        },
        previous_end: {
          type: 'string',
          description: 'Previous period end date (YYYY-MM-DD)',
        },
      },
      required: [
        'campaign_id',
        'current_start',
        'current_end',
        'previous_start',
        'previous_end',
      ],
    },
  },
  {
    name: 'get_daily_breakdown',
    description:
      'Get day-by-day performance breakdown for trend analysis and visualization.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID. Use "all" for all campaigns combined.',
        },
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['campaign_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_data_range',
    description: 'Get the available date range for metrics data in the database.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

const writeTools = [
  {
    name: 'propose_bid_change',
    description:
      'Propose a keyword bid adjustment. This creates a pending change that must be approved before execution. Use this when a keyword needs a bid increase (for more impressions) or decrease (for better ACOS).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyword_id: {
          type: 'string',
          description: 'The keyword ID to adjust',
        },
        new_bid: {
          type: 'number',
          description: 'The new bid amount in dollars (e.g., 0.85)',
        },
        reason: {
          type: 'string',
          description: 'Explanation for why this change is recommended',
        },
      },
      required: ['keyword_id', 'new_bid', 'reason'],
    },
  },
  {
    name: 'propose_keyword_state_change',
    description:
      'Propose to pause or enable a keyword. Creates a pending change for approval. Use this for keywords with poor performance that should be paused, or paused keywords that should be re-enabled.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyword_id: {
          type: 'string',
          description: 'The keyword ID to modify',
        },
        new_state: {
          type: 'string',
          enum: ['enabled', 'paused'],
          description: 'The desired state',
        },
        reason: {
          type: 'string',
          description: 'Explanation for why this change is recommended',
        },
      },
      required: ['keyword_id', 'new_state', 'reason'],
    },
  },
  {
    name: 'propose_budget_change',
    description:
      'Propose a campaign daily budget change. Creates a pending change for approval. Use this when a campaign is performing well and deserves more budget, or poorly and should be reduced.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to modify',
        },
        new_budget: {
          type: 'number',
          description: 'The new daily budget in dollars',
        },
        reason: {
          type: 'string',
          description: 'Explanation for why this change is recommended',
        },
      },
      required: ['campaign_id', 'new_budget', 'reason'],
    },
  },
  {
    name: 'propose_negative_keyword',
    description:
      'Propose adding a negative keyword to block irrelevant search terms. Creates a pending change for approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to add the negative keyword to',
        },
        keyword_text: {
          type: 'string',
          description: 'The negative keyword text to add',
        },
        match_type: {
          type: 'string',
          enum: ['negativeExact', 'negativePhrase'],
          description: 'The match type for the negative keyword',
        },
        reason: {
          type: 'string',
          description: 'Explanation for why this keyword should be blocked',
        },
      },
      required: ['campaign_id', 'keyword_text', 'match_type', 'reason'],
    },
  },
  {
    name: 'list_pending_changes',
    description:
      'List all pending changes awaiting approval. Shows proposed modifications to bids, states, and budgets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'executed', 'failed'],
          description: 'Filter by status (optional, defaults to pending)',
        },
      },
    },
  },
  {
    name: 'approve_change',
    description:
      'Approve and execute a pending change. This will make the actual change via the Amazon Advertising API.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        change_id: {
          type: 'number',
          description: 'The ID of the pending change to approve',
        },
      },
      required: ['change_id'],
    },
  },
  {
    name: 'reject_change',
    description:
      'Reject a pending change. The proposed modification will not be executed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        change_id: {
          type: 'number',
          description: 'The ID of the pending change to reject',
        },
      },
      required: ['change_id'],
    },
  },
];

const tools = [...readTools, ...writeTools];

// ============================================
// Tool Handlers
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ============================================
      // Read Operations
      // ============================================

      case 'get_campaigns': {
        const state = args?.state as 'enabled' | 'paused' | 'archived' | undefined;
        const campaigns = await db.getCampaigns(state);

        if (campaigns.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No campaigns found.' }],
          };
        }

        const output = campaigns
          .map(
            (c) =>
              `• ${c.name}\n  ID: ${c.id}\n  Type: ${c.campaignType} | State: ${c.state}\n  Budget: ${formatCurrency(c.dailyBudget)}/day | Targeting: ${c.targetingType}`
          )
          .join('\n\n');

        return {
          content: [
            { type: 'text' as const, text: `Found ${campaigns.length} campaign(s):\n\n${output}` },
          ],
        };
      }

      case 'get_keywords': {
        const campaignId = args?.campaign_id as string;
        const keywords = await db.getKeywordsByCampaign(campaignId);

        if (keywords.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `No keywords found for campaign ${campaignId}` },
            ],
          };
        }

        const output = keywords
          .map(
            (kw) =>
              `• "${kw.keywordText}" [${kw.matchType}]\n  ID: ${kw.id} | State: ${kw.state} | Bid: ${formatCurrency(kw.bid)}`
          )
          .join('\n\n');

        return {
          content: [
            { type: 'text' as const, text: `Found ${keywords.length} keyword(s):\n\n${output}` },
          ],
        };
      }

      case 'get_campaign_metrics': {
        const campaignId = args?.campaign_id as string;
        const startDate = args?.start_date as string;
        const endDate = args?.end_date as string;

        const metrics = await db.getCampaignMetrics(campaignId, startDate, endDate);

        if (metrics.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No metrics found for campaign ${campaignId} between ${startDate} and ${endDate}`,
              },
            ],
          };
        }

        const agg = await db.getAggregatedMetrics(campaignId, startDate, endDate);

        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Metrics for campaign ${campaignId} (${startDate} to ${endDate}):\n\n` +
                `📊 Summary (${metrics.length} days):\n` +
                `  Impressions: ${agg.impressions.toLocaleString()}\n` +
                `  Clicks: ${agg.clicks.toLocaleString()}\n` +
                `  Spend: ${formatCurrency(agg.spend)}\n` +
                `  Sales: ${formatCurrency(agg.sales)}\n` +
                `  Orders: ${agg.orders}\n` +
                `  Units Sold: ${agg.unitsSold}`,
            },
          ],
        };
      }

      case 'analyze_roi': {
        const campaignId = args?.campaign_id as string;
        const startDate = args?.start_date as string;
        const endDate = args?.end_date as string;

        let campaignName = 'All Campaigns';
        let metrics;

        if (campaignId === 'all') {
          metrics = await db.getAllMetrics(startDate, endDate);
        } else {
          const campaign = await db.getCampaignById(campaignId);
          if (campaign) {
            campaignName = campaign.name;
          }
          metrics = await db.getCampaignMetrics(campaignId, startDate, endDate);
        }

        if (metrics.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No metrics found for ${campaignId === 'all' ? 'any campaigns' : `campaign ${campaignId}`} between ${startDate} and ${endDate}`,
              },
            ],
          };
        }

        const roi = calculateROI(campaignId, campaignName, metrics, {
          royaltyPerSale: ROYALTY_PER_SALE,
          kenpRatePerPage: KENP_RATE,
        });

        return {
          content: [{ type: 'text' as const, text: generateROISummary(roi) }],
        };
      }

      case 'compare_periods': {
        const campaignId = args?.campaign_id as string;
        const currentStart = args?.current_start as string;
        const currentEnd = args?.current_end as string;
        const previousStart = args?.previous_start as string;
        const previousEnd = args?.previous_end as string;

        let campaignName = 'All Campaigns';
        if (campaignId !== 'all') {
          const campaign = await db.getCampaignById(campaignId);
          if (campaign) {
            campaignName = campaign.name;
          }
        }

        const currentMetrics =
          campaignId === 'all'
            ? await db.getAllMetrics(currentStart, currentEnd)
            : await db.getCampaignMetrics(campaignId, currentStart, currentEnd);

        const previousMetrics =
          campaignId === 'all'
            ? await db.getAllMetrics(previousStart, previousEnd)
            : await db.getCampaignMetrics(campaignId, previousStart, previousEnd);

        if (currentMetrics.length === 0 && previousMetrics.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No metrics found for either period.' }],
          };
        }

        const config = {
          royaltyPerSale: ROYALTY_PER_SALE,
          kenpRatePerPage: KENP_RATE,
        };

        const currentROI = calculateROI(campaignId, campaignName, currentMetrics, config);
        const previousROI = calculateROI(campaignId, campaignName, previousMetrics, config);
        const comparison = comparePeriods(currentROI, previousROI);

        return {
          content: [{ type: 'text' as const, text: generateComparisonSummary(comparison) }],
        };
      }

      case 'get_daily_breakdown': {
        const campaignId = args?.campaign_id as string;
        const startDate = args?.start_date as string;
        const endDate = args?.end_date as string;

        const metrics =
          campaignId === 'all'
            ? await db.getAllMetrics(startDate, endDate)
            : await db.getCampaignMetrics(campaignId, startDate, endDate);

        if (metrics.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No data found for the specified period.' }],
          };
        }

        const trends = calculateDailyTrends(metrics);
        const table = trends
          .map(
            (t) =>
              `${t.date}: Spend: ${formatCurrency(t.spend)} | Sales: ${formatCurrency(t.sales)} | ACOS: ${formatPercentage(t.acos)} | Impr: ${t.impressions} | Clicks: ${t.clicks}`
          )
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: `Daily Breakdown (${startDate} to ${endDate}):\n\n${table}` },
          ],
        };
      }

      case 'get_data_range': {
        const range = await db.getDateRange();

        if (!range) {
          return {
            content: [{ type: 'text' as const, text: 'No data in database yet.' }],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Available data range:\n  From: ${range.minDate}\n  To: ${range.maxDate}`,
            },
          ],
        };
      }

      // ============================================
      // Write Operations (Confirmation Workflow)
      // ============================================

      case 'propose_bid_change': {
        const keywordId = args?.keyword_id as string;
        const newBid = args?.new_bid as number;
        const reason = args?.reason as string;

        const keyword = await db.getKeywordById(keywordId);
        if (!keyword) {
          return {
            content: [{ type: 'text' as const, text: `Keyword ${keywordId} not found.` }],
            isError: true,
          };
        }

        const changeId = await db.createPendingChange({
          changeType: 'bid_adjustment',
          targetType: 'keyword',
          targetId: keywordId,
          targetName: keyword.keywordText,
          currentValue: { bid: keyword.bid },
          proposedValue: { bid: newBid },
          reason,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text:
                `✅ Proposed bid change created (ID: ${changeId})\n\n` +
                `Keyword: "${keyword.keywordText}"\n` +
                `Current bid: ${formatCurrency(keyword.bid)}\n` +
                `Proposed bid: ${formatCurrency(newBid)}\n` +
                `Change: ${newBid > keyword.bid ? '+' : ''}${formatCurrency(newBid - keyword.bid)} (${((newBid - keyword.bid) / keyword.bid * 100).toFixed(1)}%)\n` +
                `Reason: ${reason}\n\n` +
                `Use approve_change with ID ${changeId} to execute, or reject_change to cancel.`,
            },
          ],
        };
      }

      case 'propose_keyword_state_change': {
        const keywordId = args?.keyword_id as string;
        const newState = args?.new_state as 'enabled' | 'paused';
        const reason = args?.reason as string;

        const keyword = await db.getKeywordById(keywordId);
        if (!keyword) {
          return {
            content: [{ type: 'text' as const, text: `Keyword ${keywordId} not found.` }],
            isError: true,
          };
        }

        const changeId = await db.createPendingChange({
          changeType: 'state_change',
          targetType: 'keyword',
          targetId: keywordId,
          targetName: keyword.keywordText,
          currentValue: { state: keyword.state },
          proposedValue: { state: newState },
          reason,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text:
                `✅ Proposed state change created (ID: ${changeId})\n\n` +
                `Keyword: "${keyword.keywordText}"\n` +
                `Current state: ${keyword.state}\n` +
                `Proposed state: ${newState}\n` +
                `Reason: ${reason}\n\n` +
                `Use approve_change with ID ${changeId} to execute, or reject_change to cancel.`,
            },
          ],
        };
      }

      case 'propose_budget_change': {
        const campaignId = args?.campaign_id as string;
        const newBudget = args?.new_budget as number;
        const reason = args?.reason as string;

        const campaign = await db.getCampaignById(campaignId);
        if (!campaign) {
          return {
            content: [{ type: 'text' as const, text: `Campaign ${campaignId} not found.` }],
            isError: true,
          };
        }

        const changeId = await db.createPendingChange({
          changeType: 'budget_change',
          targetType: 'campaign',
          targetId: campaignId,
          targetName: campaign.name,
          currentValue: { dailyBudget: campaign.dailyBudget },
          proposedValue: { dailyBudget: newBudget },
          reason,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text:
                `✅ Proposed budget change created (ID: ${changeId})\n\n` +
                `Campaign: "${campaign.name}"\n` +
                `Current budget: ${formatCurrency(campaign.dailyBudget)}/day\n` +
                `Proposed budget: ${formatCurrency(newBudget)}/day\n` +
                `Change: ${newBudget > campaign.dailyBudget ? '+' : ''}${formatCurrency(newBudget - campaign.dailyBudget)} (${((newBudget - campaign.dailyBudget) / campaign.dailyBudget * 100).toFixed(1)}%)\n` +
                `Reason: ${reason}\n\n` +
                `Use approve_change with ID ${changeId} to execute, or reject_change to cancel.`,
            },
          ],
        };
      }

      case 'propose_negative_keyword': {
        const campaignId = args?.campaign_id as string;
        const keywordText = args?.keyword_text as string;
        const matchType = args?.match_type as 'negativeExact' | 'negativePhrase';
        const reason = args?.reason as string;

        const campaign = await db.getCampaignById(campaignId);
        if (!campaign) {
          return {
            content: [{ type: 'text' as const, text: `Campaign ${campaignId} not found.` }],
            isError: true,
          };
        }

        const changeId = await db.createPendingChange({
          changeType: 'add_negative_keyword',
          targetType: 'campaign',
          targetId: campaignId,
          targetName: campaign.name,
          currentValue: {},
          proposedValue: { keywordText, matchType },
          reason,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text:
                `✅ Proposed negative keyword created (ID: ${changeId})\n\n` +
                `Campaign: "${campaign.name}"\n` +
                `Negative keyword: "${keywordText}" [${matchType}]\n` +
                `Reason: ${reason}\n\n` +
                `Use approve_change with ID ${changeId} to execute, or reject_change to cancel.`,
            },
          ],
        };
      }

      case 'list_pending_changes': {
        const status = (args?.status as PendingChange['status']) || 'pending';
        const changes = await db.getPendingChanges(status);

        if (changes.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No ${status} changes found.` }],
          };
        }

        const output = changes
          .map((c) => {
            let details = '';
            if (c.changeType === 'bid_adjustment') {
              const curr = c.currentValue as { bid: number };
              const prop = c.proposedValue as { bid: number };
              details = `Bid: ${formatCurrency(curr.bid)} → ${formatCurrency(prop.bid)}`;
            } else if (c.changeType === 'state_change') {
              const curr = c.currentValue as { state: string };
              const prop = c.proposedValue as { state: string };
              details = `State: ${curr.state} → ${prop.state}`;
            } else if (c.changeType === 'budget_change') {
              const curr = c.currentValue as { dailyBudget: number };
              const prop = c.proposedValue as { dailyBudget: number };
              details = `Budget: ${formatCurrency(curr.dailyBudget)} → ${formatCurrency(prop.dailyBudget)}/day`;
            } else if (c.changeType === 'add_negative_keyword') {
              const prop = c.proposedValue as { keywordText: string; matchType: string };
              details = `Add negative: "${prop.keywordText}" [${prop.matchType}]`;
            }

            return (
              `[ID: ${c.id}] ${c.changeType}\n` +
              `  Target: ${c.targetName || c.targetId} (${c.targetType})\n` +
              `  ${details}\n` +
              `  Reason: ${c.reason || 'N/A'}\n` +
              `  Created: ${c.createdAt.toISOString()}`
            );
          })
          .join('\n\n');

        return {
          content: [
            { type: 'text' as const, text: `${status.toUpperCase()} changes (${changes.length}):\n\n${output}` },
          ],
        };
      }

      case 'approve_change': {
        const changeId = args?.change_id as number;
        const change = await db.getPendingChangeById(changeId);

        if (!change) {
          return {
            content: [{ type: 'text' as const, text: `Change ${changeId} not found.` }],
            isError: true,
          };
        }

        if (change.status !== 'pending') {
          return {
            content: [
              { type: 'text' as const, text: `Change ${changeId} is already ${change.status}.` },
            ],
            isError: true,
          };
        }

        // Check if we have API access
        if (!adsClient) {
          // Update status to approved but note we can't execute
          await db.updatePendingChangeStatus(changeId, 'approved');
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `⚠️ Change ${changeId} approved, but Amazon Advertising API is not configured.\n\n` +
                  `The change has been recorded but cannot be executed automatically.\n` +
                  `Please apply this change manually in the Amazon Advertising console:\n\n` +
                  `Target: ${change.targetName || change.targetId}\n` +
                  `Change: ${JSON.stringify(change.proposedValue)}`,
              },
            ],
          };
        }

        // Execute the change via API
        try {
          switch (change.changeType) {
            case 'bid_adjustment': {
              const newBid = (change.proposedValue as { bid: number }).bid;
              await adsClient.updateKeywordBid(change.targetId, newBid);
              break;
            }
            case 'state_change': {
              const newState = (change.proposedValue as { state: 'enabled' | 'paused' }).state;
              await adsClient.updateKeywordState(change.targetId, newState);
              break;
            }
            case 'budget_change': {
              const newBudget = (change.proposedValue as { dailyBudget: number }).dailyBudget;
              await adsClient.updateCampaignBudget(change.targetId, newBudget);
              break;
            }
            case 'add_negative_keyword': {
              const { keywordText, matchType } = change.proposedValue as {
                keywordText: string;
                matchType: 'negativeExact' | 'negativePhrase';
              };
              await adsClient.addNegativeKeyword(change.targetId, keywordText, matchType);
              break;
            }
            default:
              throw new Error(`Unknown change type: ${change.changeType}`);
          }

          await db.updatePendingChangeStatus(changeId, 'executed');
          await db.recordChangeHistory(
            changeId,
            change.targetType,
            change.targetId,
            change.changeType,
            change.currentValue,
            change.proposedValue,
            true
          );

          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `✅ Change ${changeId} executed successfully!\n\n` +
                  `Target: ${change.targetName || change.targetId}\n` +
                  `Change applied: ${JSON.stringify(change.proposedValue)}`,
              },
            ],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          await db.updatePendingChangeStatus(changeId, 'failed', errorMsg);
          await db.recordChangeHistory(
            changeId,
            change.targetType,
            change.targetId,
            change.changeType,
            change.currentValue,
            change.proposedValue,
            false,
            { error: errorMsg }
          );

          return {
            content: [
              { type: 'text' as const, text: `❌ Failed to execute change ${changeId}: ${errorMsg}` },
            ],
            isError: true,
          };
        }
      }

      case 'reject_change': {
        const changeId = args?.change_id as number;
        const change = await db.getPendingChangeById(changeId);

        if (!change) {
          return {
            content: [{ type: 'text' as const, text: `Change ${changeId} not found.` }],
            isError: true,
          };
        }

        if (change.status !== 'pending') {
          return {
            content: [
              { type: 'text' as const, text: `Change ${changeId} is already ${change.status}.` },
            ],
            isError: true,
          };
        }

        await db.updatePendingChangeStatus(changeId, 'rejected');

        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Change ${changeId} rejected.\n\nThe proposed modification will not be applied.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================
// Resource Handlers
// ============================================

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'kdp://campaigns',
      name: 'Campaign List',
      description: 'List of all KDP advertising campaigns',
      mimeType: 'application/json',
    },
    {
      uri: 'kdp://metrics/summary',
      name: 'Metrics Summary',
      description: 'Overall metrics summary for all campaigns',
      mimeType: 'application/json',
    },
    {
      uri: 'kdp://pending-changes',
      name: 'Pending Changes',
      description: 'List of pending changes awaiting approval',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'kdp://campaigns': {
      const campaigns = await db.getCampaigns();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(campaigns, null, 2),
          },
        ],
      };
    }

    case 'kdp://metrics/summary': {
      const range = await db.getDateRange();
      if (!range) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'No data available' }),
            },
          ],
        };
      }

      const agg = await db.getAggregatedMetrics(null, range.minDate, range.maxDate);
      const summary = {
        dateRange: range,
        totals: agg,
        acos: agg.sales > 0 ? (agg.spend / agg.sales) * 100 : 0,
        roas: agg.spend > 0 ? agg.sales / agg.spend : 0,
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }

    case 'kdp://pending-changes': {
      const changes = await db.getPendingChanges('pending');
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(changes, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// ============================================
// Start Server
// ============================================

async function main() {
  // Run migrations on startup
  await db.migrate();


  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KDP Ad Automator MCP server v2.0.0 running on stdio');
  console.error(`API client: ${adsClient ? 'configured' : 'not configured (changes will be recorded but not executed)'}`);
}

main().catch(console.error);
