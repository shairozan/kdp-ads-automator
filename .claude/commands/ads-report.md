---
description: Generate a daily KDP advertising performance report with metrics, ROI analysis, and recommendations
---

# KDP Advertising Daily Report

Generate a comprehensive daily summary of KDP advertising campaign performance.

## Instructions

Use the MCP tools to gather data and create a markdown report with the following sections:

1. **Campaign Overview Table**: List all ENABLED campaigns (exclude archived/paused) with their ID, name, budget, and targeting type

2. **Performance Summary (Last 7 Days)**: For each enabled campaign, show:
   - Impressions, Clicks, CTR
   - Spend, Sales, ACOS
   - Orders, Units Sold

3. **ROI Analysis**: Use the analyze_roi tool to show:
   - Overall ACOS vs break-even ACOS
   - ROAS
   - Estimated profit/loss
   - Profitability status

4. **Daily Trend (Last 7 Days)**: Use get_daily_breakdown to show a table of daily performance with:
   - Date, Impressions, Clicks, Spend, Sales, ACOS

5. **Recommendations**: Based on the data, provide 2-3 actionable recommendations

## Output Format

Format everything as clean markdown tables. Use these guidelines:
- Currency values: $X.XX format
- Percentages: X.XX% format
- Large numbers: use commas (e.g., 12,345)
- Highlight concerning metrics (high ACOS, negative profit) with notes

## Date Range

Unless specified otherwise, analyze the last 7 days of data. Use get_data_range to determine available dates.
