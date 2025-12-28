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

3. **Targeting Details**: Use get_all_targets or get_product_targets/get_category_targets to show:

   **Product Targets (ASIN Targeting)**:
   - Target ASIN, Target Type (asinSameAs, asinExpandedFrom, etc.)
   - Current Bid, State (enabled/paused)
   - Group by campaign for clarity

   **Category Targets**:
   - Category Name/ID
   - Current Bid, State
   - Any refinements (brands, price ranges, review ratings)
   - Group by campaign for clarity

4. **ROI Analysis**: Use the analyze_roi tool to show:
   - Overall ACOS vs break-even ACOS
   - ROAS
   - Estimated profit/loss
   - Profitability status

5. **Daily Trend (Last 7 Days)**: Use get_daily_breakdown to show a table of daily performance with:
   - Date, Impressions, Clicks, Spend, Sales, ACOS

6. **Recommendations**: Based on the data, provide 2-3 actionable recommendations for:
   - Target bid adjustments (increase bids on high-performing ASINs/categories, decrease on poor performers)
   - Targets to pause or enable
   - Budget allocation changes

## Output Format

Format everything as clean markdown tables. Use these guidelines:
- Currency values: $X.XX format
- Percentages: X.XX% format
- Large numbers: use commas (e.g., 12,345)
- Highlight concerning metrics (high ACOS, negative profit) with notes

## Date Range

Unless specified otherwise, analyze the last 7 days of data. Use get_data_range to determine available dates.
