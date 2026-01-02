# KDP Ad Automator

- What it solves (Amazon ads are opaque, manual optimization is tedious)
- Architecture (sync service → MCP server → Claude skill)
- Setup (API credentials, installation, configuration)
- Usage examples (actual Claude conversations showing optimization suggestions)
- Example output (before/after campaign performance)

An MCP server for analyzing and managing Amazon KDP advertising campaigns with ROI tracking, profitability analysis, and natural language control.

## Features

- **Campaign Analytics**: Monitor Sponsored Products campaigns with ACOS, ROAS, and profit tracking
- **ROI Analysis**: Calculate break-even points and profitability per campaign
- **Period Comparison**: Compare performance across time periods
- **MCP Integration**: Query and control your ads conversationally through Claude
- **Campaign Management**: Propose and approve bid changes, budget adjustments, and keyword pausing (with confirmation workflow)
- **Docker Support**: Run with PostgreSQL for multi-user/production use

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Amazon Ads API │◀───▶│   Sync Worker    │────▶│   PostgreSQL    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  Claude Desktop  │◀───▶│   MCP Server    │
                        └──────────────────┘     └─────────────────┘
```

## Quick Start (Docker)

### 1. Clone and Configure

```bash
cp .env.example .env
# Edit .env with your settings
```

### 2. Start Services

```bash
# Build and start (without API - uses demo data)
docker-compose up -d postgres migrate mcp-server

# With Amazon API sync (requires credentials)
docker-compose --profile with-api up -d
```

### 3. Configure Claude Desktop

Add to your Claude Desktop config:

**Linux**: `~/.config/Claude/claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kdp-ads": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

### 4. Restart Claude Desktop

Restart Claude Desktop to connect to the MCP server.

## Quick Start (Local Development)

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16+

### 2. Install and Build

```bash
npm install
npm run build
```

### 3. Setup Database

```bash
# Create PostgreSQL database
createdb kdp_ads

# Run migrations with demo data
DATABASE_URL=postgresql://localhost/kdp_ads npm run db:migrate -- --demo
```

### 4. Configure Claude Desktop

```json
{
  "mcpServers": {
    "kdp-ads": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

## Using with Claude

### Reading Data

- "What campaigns do I have running?"
- "Analyze the ROI of my campaigns for the last 7 days"
- "Compare this week's performance to last week"
- "What's my ACOS and am I profitable?"
- "Show me the keywords for my manual campaign"

### Making Changes (with confirmation)

- "This keyword has low impressions, can we increase the bid?"
- "The ACOS on this keyword is too high, we should pause it"
- "The campaign is performing well, increase the budget to $20/day"
- "Add 'free ebook' as a negative keyword to block wasted spend"

Claude will propose changes that you must approve before execution.

## Available MCP Tools

### Read Tools

| Tool | Description |
|------|-------------|
| `get_campaigns` | List all campaigns with status and budget |
| `get_keywords` | Get keywords for a campaign |
| `get_campaign_metrics` | Get metrics for a date range |
| `analyze_roi` | Full ROI and profitability analysis |
| `compare_periods` | Compare two time periods |
| `get_daily_breakdown` | Day-by-day performance data |
| `get_data_range` | Available data date range |

### Write Tools (require approval)

| Tool | Description |
|------|-------------|
| `propose_bid_change` | Propose a keyword bid adjustment |
| `propose_keyword_state_change` | Propose to pause/enable a keyword |
| `propose_budget_change` | Propose a campaign budget change |
| `propose_negative_keyword` | Propose adding a negative keyword |
| `list_pending_changes` | View pending changes |
| `approve_change` | Approve and execute a change |
| `reject_change` | Reject a proposed change |

## Configuration

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/kdp_ads

# Book profitability
BOOK_ROYALTY_AMOUNT=2.80
KENP_RATE_PER_PAGE=0.0045

# Amazon API (optional - enables auto-sync and change execution)
AMAZON_CLIENT_ID=...
AMAZON_CLIENT_SECRET=...
AMAZON_REFRESH_TOKEN=...
AMAZON_PROFILE_ID=...

# Sync worker
SYNC_INTERVAL_MINUTES=60
METRICS_LOOKBACK_DAYS=14
```

## Importing Data

### CSV Import (No API required)

Export campaign data from the KDP Advertising dashboard, then:

```bash
DATABASE_URL=postgresql://localhost/kdp_ads npm run import:csv -- ./imports/report.csv
```

### Amazon Advertising API

Once you have API access, the sync worker automatically fetches data:

```bash
# Start sync worker
docker-compose --profile with-api up -d sync-worker
```

## Getting Amazon Advertising API Access

1. Create an [Amazon Developer account](https://developer.amazon.com)
2. Apply for [Amazon Advertising API access](https://advertising.amazon.com/API/docs/en-us/setting-up/step-1-create-a-developer-account)
3. Create an app in the developer console
4. Set up Login with Amazon (LWA) for OAuth
5. Complete the OAuth flow to get your refresh token

Note: API approval can take several weeks. Use CSV imports in the meantime.

## Project Structure

```
ad-automator/
├── src/
│   ├── api/           # Amazon Advertising API client
│   ├── db/            # PostgreSQL database layer
│   ├── analysis/      # ROI calculation functions
│   ├── mcp/           # MCP server with read/write tools
│   ├── worker/        # Background sync worker
│   ├── scripts/       # CLI utilities (CSV import)
│   └── types/         # TypeScript type definitions
├── docker-compose.yml # Docker orchestration
├── Dockerfile.mcp     # MCP server container
└── Dockerfile.worker  # Sync worker container
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run mcp` | Start MCP server |
| `npm run worker` | Start sync worker |
| `npm run db:migrate` | Run database migrations |
| `npm run import:csv -- <file>` | Import CSV data |

## Understanding the Metrics

### ACOS (Advertising Cost of Sales)
- Formula: (Spend / Sales) × 100
- Lower is better
- Example: 30% ACOS = $0.30 spent per $1 in sales

### Break-Even ACOS
- The ACOS threshold for profitability
- Formula: (Royalty / Book Price) × 100
- Below this = profitable

### ROAS (Return on Ad Spend)
- Formula: Sales / Spend
- Higher is better
- Example: 3.0 ROAS = $3 earned per $1 spent

### Profit Calculation
- Profit = Royalties - Ad Spend
- Royalties = (Units × Royalty/Unit) + KENP Royalties

## License

MIT
