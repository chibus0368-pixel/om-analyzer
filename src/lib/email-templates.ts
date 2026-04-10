/**
 * Email template functions for Deal Signals
 * All templates use inline CSS and table-based layout for email client compatibility
 */

// Color scheme
const COLORS = {
  navy: '#06080F',
  white: '#FFFFFF',
  red: '#DC3545',
  gold: '#C49A3C',
  lightGray: '#F5F5F5',
  borderGray: '#E5E5E5',
  darkGray: '#666666',
  textGray: '#333333',
};

/**
 * Base email wrapper template
 */
function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deal Signals</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: ${COLORS.textGray};
      background-color: ${COLORS.lightGray};
    }
    table {
      border-collapse: collapse;
    }
    a {
      color: ${COLORS.red};
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: ${COLORS.lightGray}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; color: ${COLORS.textGray};">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: ${COLORS.white};">
    <tr>
      <td style="padding: 40px 20px;">
        ${content}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Get the base app URL for links in emails
 */
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://dealsignals.app';
}

/**
 * Email header with logo
 */
function emailHeader(): string {
  const appUrl = getAppUrl();
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
      <tr>
        <td style="text-align: center; padding-bottom: 20px; border-bottom: 3px solid ${COLORS.navy};">
          <a href="${appUrl}" style="text-decoration: none;">
            <img src="${appUrl}/logo.png" alt="Deal Signals" width="220" style="max-width: 220px; height: auto; display: inline-block;" />
          </a>
          <p style="margin: 8px 0 0 0; color: ${COLORS.gold}; font-size: 12px; font-weight: bold; letter-spacing: 1px;">MARKET INTELLIGENCE</p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Market ticker strip
 */
function marketTickerStrip(marketData: { symbol: string; value: string; change: string; color?: string }[], tickerDate?: string): string {
  const tickers = marketData.slice(0, 4);

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: ${COLORS.navy}; border-radius: 4px;">
      <tr>
        ${tickers
          .map(
            (ticker) => `
          <td style="padding: 15px; border-right: 1px solid rgba(255,255,255,0.1); color: ${COLORS.white}; text-align: center; font-size: 12px;">
            <div style="font-weight: bold; font-size: 14px;">${ticker.symbol}</div>
            <div style="color: ${COLORS.gold}; font-weight: bold; margin: 5px 0;">${ticker.value}</div>
            <div style="color: ${ticker.color || COLORS.red}; font-size: 11px;">${ticker.change}</div>
          </td>
        `
          )
          .join('')}
      </tr>
      ${tickerDate ? `
      <tr>
        <td colspan="${tickers.length}" style="padding: 4px 15px 8px; text-align: right; color: rgba(255,255,255,0.4); font-size: 10px;">
          Data as of ${tickerDate}
        </td>
      </tr>
      ` : ''}
    </table>
  `;
}

/**
 * Registration Welcome Email Template
 * Sent when a new user creates an account
 */
export function registrationWelcomeTemplate(data: { name: string; email: string }): string {
  const { name, email } = data;
  const appUrl = getAppUrl();
  const displayName = name || email.split('@')[0];

  const content = `
    ${emailHeader()}

    <h2 style="margin: 30px 0 20px 0; color: ${COLORS.navy}; text-align: center;">
      Welcome to Deal Signals, ${displayName}!
    </h2>

    <p style="margin: 0 0 15px 0; color: ${COLORS.textGray}; font-size: 14px; line-height: 1.6;">
      Your account has been created and your workspace is ready. You're all set to start analyzing commercial real estate deals with AI-powered intelligence.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0; background-color: ${COLORS.lightGray}; border-radius: 6px;">
      <tr>
        <td style="padding: 20px 24px;">
          <h3 style="margin: 0 0 15px 0; color: ${COLORS.navy}; font-size: 15px;">Here's what you can do:</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.textGray};">
                <span style="color: ${COLORS.red}; font-weight: bold; margin-right: 8px;">1.</span>
                Upload an offering memorandum to get a Deal Signals score
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.textGray};">
                <span style="color: ${COLORS.red}; font-weight: bold; margin-right: 8px;">2.</span>
                Review extracted financials, tenant info, and risk factors
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.textGray};">
                <span style="color: ${COLORS.red}; font-weight: bold; margin-right: 8px;">3.</span>
                Compare deals side-by-side on the scoreboard
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 14px; color: ${COLORS.textGray};">
                <span style="color: ${COLORS.red}; font-weight: bold; margin-right: 8px;">4.</span>
                Share your analysis with partners and investors
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
      <tr>
        <td style="text-align: center;">
          <a href="${appUrl}/workspace" style="background-color: ${COLORS.red}; color: ${COLORS.white}; padding: 14px 36px; font-weight: bold; font-size: 14px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Go to Your Workspace
          </a>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0; background-color: ${COLORS.navy}; border-radius: 6px;">
      <tr>
        <td style="padding: 20px 24px; text-align: center;">
          <p style="margin: 0 0 6px 0; color: ${COLORS.gold}; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px;">Your Plan</p>
          <p style="margin: 0 0 8px 0; color: ${COLORS.white}; font-size: 16px; font-weight: bold;">Free Tier — 2 Deal Analyses / Month</p>
          <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 13px;">
            Upgrade to Pro for 40 analyses, Excel exports, and full workspace features.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin: 12px auto 0;">
            <tr>
              <td>
                <a href="${appUrl}/pricing" style="display: inline-block; padding: 8px 20px; background-color: ${COLORS.gold}; color: ${COLORS.navy}; font-size: 12px; font-weight: bold; text-decoration: none; border-radius: 4px;">View Plans</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: ${COLORS.darkGray}; font-size: 12px;">
      Questions? Just reply to this email — we're happy to help.
    </p>

    <!-- Footer -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${COLORS.borderGray};">
      <tr>
        <td style="font-size: 11px; color: ${COLORS.darkGray}; text-align: center; padding: 20px 0;">
          <p style="margin: 5px 0;">&copy; ${new Date().getFullYear()} Deal Signals. All rights reserved.</p>
          <p style="margin: 5px 0;">Mequon, Wisconsin</p>
        </td>
      </tr>
    </table>
  `;

  return emailWrapper(content);
}

/**
 * Purchase Confirmation Email Template
 * Sent when a user completes a Stripe subscription purchase
 */
export function purchaseConfirmationTemplate(data: { name: string; email: string; plan: string; uploadLimit: number }): string {
  const { name, email, plan, uploadLimit } = data;
  const appUrl = getAppUrl();
  const displayName = name || email.split('@')[0];

  const planDisplay = plan === 'pro_plus' ? 'Pro+' : plan.charAt(0).toUpperCase() + plan.slice(1);
  const planPrice = plan === 'pro_plus' ? '$100/mo' : '$40/mo';

  const content = `
    ${emailHeader()}

    <h2 style="margin: 30px 0 20px 0; color: ${COLORS.navy}; text-align: center;">
      You're Upgraded to ${planDisplay}!
    </h2>

    <p style="margin: 0 0 15px 0; color: ${COLORS.textGray}; font-size: 14px; line-height: 1.6;">
      Thanks for starting your ${planDisplay} trial, ${displayName}! You have 7 days of full access — your card won't be charged until the trial ends.
    </p>

    <!-- Order Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0; border: 1px solid ${COLORS.borderGray}; border-radius: 6px;">
      <tr>
        <td style="background-color: ${COLORS.navy}; color: ${COLORS.white}; padding: 12px 20px; font-weight: bold; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-radius: 6px 6px 0 0;">
          Subscription Details
        </td>
      </tr>
      <tr>
        <td style="padding: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.darkGray}; border-bottom: 1px solid ${COLORS.borderGray};">Plan</td>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.navy}; font-weight: bold; text-align: right; border-bottom: 1px solid ${COLORS.borderGray};">Deal Signals ${planDisplay}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.darkGray}; border-bottom: 1px solid ${COLORS.borderGray};">Monthly Price</td>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.navy}; font-weight: bold; text-align: right; border-bottom: 1px solid ${COLORS.borderGray};">${planPrice}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.darkGray}; border-bottom: 1px solid ${COLORS.borderGray};">Monthly Analyses</td>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.navy}; font-weight: bold; text-align: right; border-bottom: 1px solid ${COLORS.borderGray};">${uploadLimit}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: ${COLORS.darkGray};">Status</td>
              <td style="padding: 8px 0; font-size: 14px; text-align: right;">
                <span style="background-color: #d4edda; color: #155724; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">Active</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- What's Included -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0; background-color: ${COLORS.lightGray}; border-radius: 6px;">
      <tr>
        <td style="padding: 20px 24px;">
          <h3 style="margin: 0 0 15px 0; color: ${COLORS.navy}; font-size: 15px;">What's included in ${planDisplay}:</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Up to ${uploadLimit} deal analyses per month</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Full Deal Signals scoring with category breakdowns</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Downloadable XLS worksheets of analysis</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Workspace with saved deals and history</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Property map and scoreboard views</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> White-label shareable links</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Location Intelligence</td></tr>
            ${plan === 'pro_plus' ? `
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Bulk portfolio uploads &amp; advanced exports</td></tr>
            <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: #28a745; margin-right: 8px;">&#10003;</span> Priority processing &amp; custom branding</td></tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
      <tr>
        <td style="text-align: center;">
          <a href="${appUrl}/workspace" style="background-color: ${COLORS.red}; color: ${COLORS.white}; padding: 14px 36px; font-weight: bold; font-size: 14px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Start Analyzing Deals
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 5px 0; color: ${COLORS.darkGray}; font-size: 12px;">
      You can manage your subscription anytime from your <a href="${appUrl}/workspace/profile" style="color: ${COLORS.red};">account profile</a>.
    </p>
    <p style="margin: 0; color: ${COLORS.darkGray}; font-size: 12px;">
      Questions? Just reply to this email — we're happy to help.
    </p>

    <!-- Footer -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${COLORS.borderGray};">
      <tr>
        <td style="font-size: 11px; color: ${COLORS.darkGray}; text-align: center; padding: 20px 0;">
          <p style="margin: 5px 0;">&copy; ${new Date().getFullYear()} Deal Signals. All rights reserved.</p>
          <p style="margin: 5px 0;">Mequon, Wisconsin</p>
        </td>
      </tr>
    </table>
  `;

  return emailWrapper(content);
}
