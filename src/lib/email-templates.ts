/**
 * Email template functions for Deal Signals.
 * Brand-aligned with the live site: dark #0d0d14 header, lime #4D7C0F accent,
 * white body. All styling is inline + table-based for email client compat.
 */

const COLORS = {
  ink: '#0d0d14',        // deep app background
  inkSoft: '#1a1b24',    // slightly lifted dark (section blocks)
  lime: '#4D7C0F',       // primary accent
  limeDark: '#3F6212',   // button hover / shadow
  white: '#FFFFFF',
  pageBg: '#F5F7FA',
  cardBg: '#FFFFFF',
  subtleGray: '#F2F3FB',
  borderGray: '#E5E7EB',
  darkGray: '#525866',
  textGray: '#1F2937',
  muted: '#6B7280',
};

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://dealsignals.app';
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deal Signals</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: ${COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; color: ${COLORS.textGray};">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: ${COLORS.cardBg}; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
    <tr>
      <td>
        ${content}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Brand header: dark bar with the real site logo (white lockup).
 * Uses the same file the in-app nav uses so the email matches exactly.
 */
function emailHeader(): string {
  const appUrl = getAppUrl();
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.ink};">
      <tr>
        <td style="padding: 28px 32px; text-align: center;">
          <a href="${appUrl}" style="text-decoration: none; display: inline-block;">
            <img src="${appUrl}/images/dealsignals-full-logo4.png" alt="Deal Signals" width="200" style="max-width: 200px; height: auto; display: inline-block; border: 0;" />
          </a>
        </td>
      </tr>
      <tr>
        <td style="height: 3px; background: linear-gradient(90deg, ${COLORS.lime}, ${COLORS.limeDark}); line-height: 3px; font-size: 0;">&nbsp;</td>
      </tr>
    </table>
  `;
}

function emailFooter(): string {
  const appUrl = getAppUrl();
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.subtleGray};">
      <tr>
        <td style="padding: 24px 32px; font-size: 11px; color: ${COLORS.muted}; text-align: center; line-height: 1.7;">
          <p style="margin: 0 0 4px 0;">
            <a href="${appUrl}" style="color: ${COLORS.limeDark}; text-decoration: none; font-weight: 600;">dealsignals.app</a>
          </p>
          <p style="margin: 4px 0;">&copy; ${new Date().getFullYear()} Deal Signals. All rights reserved.</p>
          <p style="margin: 4px 0;">Mequon, Wisconsin</p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Registration Welcome Email Template
 */
export function registrationWelcomeTemplate(data: { name: string; email: string }): string {
  const { name, email } = data;
  const appUrl = getAppUrl();
  const displayName = name || email.split('@')[0];

  const content = `
    ${emailHeader()}

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 40px 40px 0;">
          <p style="margin: 0 0 8px 0; color: ${COLORS.limeDark}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Welcome</p>
          <h1 style="margin: 0 0 20px 0; color: ${COLORS.ink}; font-size: 26px; line-height: 1.25; letter-spacing: -0.02em; font-weight: 800;">
            Your workspace is live, ${displayName}.
          </h1>

          <p style="margin: 0 0 14px 0; color: ${COLORS.textGray}; font-size: 15px; line-height: 1.65;">
            Deal Signals turns offering memorandums into institutional-grade first-pass screens in minutes. Drop in an OM and we'll score the deal, pull the financials, flag the risks, and hand you an underwriting workbook ready to share with your partners.
          </p>

          <p style="margin: 0 0 24px 0; color: ${COLORS.textGray}; font-size: 15px; line-height: 1.65;">
            No more late nights rebuilding the same rent roll in Excel. Let's get your first deal on the board.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding: 0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.subtleGray}; border-radius: 10px;">
            <tr>
              <td style="padding: 24px 28px;">
                <p style="margin: 0 0 4px 0; color: ${COLORS.limeDark}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.3px;">Get Started</p>
                <h3 style="margin: 0 0 16px 0; color: ${COLORS.ink}; font-size: 17px; font-weight: 700;">Your first 4 moves</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 7px 0; font-size: 14px; color: ${COLORS.textGray}; line-height: 1.55;">
                      <span style="color: ${COLORS.limeDark}; font-weight: 700; margin-right: 8px;">1.</span>
                      Upload an OM, flyer, or rent roll to get a Deal Score and grade in under 3 minutes
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; font-size: 14px; color: ${COLORS.textGray}; line-height: 1.55;">
                      <span style="color: ${COLORS.limeDark}; font-weight: 700; margin-right: 8px;">2.</span>
                      Review extracted rent roll, T-12 expenses, tenant credit, and risk flags
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; font-size: 14px; color: ${COLORS.textGray}; line-height: 1.55;">
                      <span style="color: ${COLORS.limeDark}; font-weight: 700; margin-right: 8px;">3.</span>
                      Stack deals side-by-side on the scoreboard and filter by market, cap rate, or lens
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 7px 0; font-size: 14px; color: ${COLORS.textGray}; line-height: 1.55;">
                      <span style="color: ${COLORS.limeDark}; font-weight: 700; margin-right: 8px;">4.</span>
                      Share a white-label link or export the underwriting workbook for your IC
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding: 30px 40px 10px; text-align: center;">
          <a href="${appUrl}/workspace" style="background-color: ${COLORS.lime}; color: #FFFFFF; padding: 14px 40px; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 8px; display: inline-block; letter-spacing: 0.02em;">
            Analyze Your First Deal
          </a>
        </td>
      </tr>

      <tr>
        <td style="padding: 20px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.ink}; border-radius: 10px;">
            <tr>
              <td style="padding: 22px 26px; text-align: center;">
                <p style="margin: 0 0 6px 0; color: ${COLORS.lime}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Your Plan</p>
                <p style="margin: 0 0 8px 0; color: ${COLORS.white}; font-size: 17px; font-weight: 700;">Free Tier &middot; 5 Deal Analyses / Month</p>
                <p style="margin: 0 0 14px 0; color: rgba(255,255,255,0.72); font-size: 13px; line-height: 1.6;">
                  Running more than a handful of deals? Pro unlocks 100 analyses per month, Excel exports, portfolio scoreboards, and white-label sharing. 7-day free trial, cancel anytime.
                </p>
                <a href="${appUrl}/pricing" style="display: inline-block; padding: 10px 24px; background-color: ${COLORS.lime}; color: #FFFFFF; font-size: 12px; font-weight: 700; text-decoration: none; border-radius: 6px; letter-spacing: 0.04em;">View Plans</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding: 10px 40px 32px;">
          <p style="margin: 16px 0 0 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
            Questions, feedback, or a deal you'd like us to look at? Just reply. This inbox goes straight to the team.
          </p>
          <p style="margin: 6px 0 0 0; color: ${COLORS.muted}; font-size: 12px;">
            &mdash; The Deal Signals team
          </p>
        </td>
      </tr>
    </table>

    ${emailFooter()}
  `;

  return emailWrapper(content);
}

/**
 * Purchase Confirmation Email Template
 */
export function purchaseConfirmationTemplate(data: { name: string; email: string; plan: string; uploadLimit: number }): string {
  const { name, email, plan, uploadLimit } = data;
  const appUrl = getAppUrl();
  const displayName = name || email.split('@')[0];

  const planDisplay = plan === 'pro_plus' ? 'Pro+' : plan.charAt(0).toUpperCase() + plan.slice(1);
  const planPrice = plan === 'pro_plus' ? '$100/mo' : '$40/mo';

  const content = `
    ${emailHeader()}

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 40px 40px 0;">
          <p style="margin: 0 0 8px 0; color: ${COLORS.limeDark}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">You're on ${planDisplay}</p>
          <h1 style="margin: 0 0 20px 0; color: ${COLORS.ink}; font-size: 26px; line-height: 1.25; letter-spacing: -0.02em; font-weight: 800;">
            Welcome to the full desk, ${displayName}.
          </h1>

          <p style="margin: 0 0 20px 0; color: ${COLORS.textGray}; font-size: 15px; line-height: 1.65;">
            Your ${planDisplay} trial is live. You have 7 days of full workspace access with no charge until the trial ends, and you can cancel anytime from your profile. More deals, faster screens, and the tools to get them in front of your partners.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding: 0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${COLORS.borderGray}; border-radius: 10px; overflow: hidden;">
            <tr>
              <td style="background-color: ${COLORS.ink}; color: ${COLORS.lime}; padding: 14px 22px; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px;">
                Subscription Details
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 22px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.darkGray}; border-bottom: 1px solid ${COLORS.borderGray};">Plan</td>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.ink}; font-weight: 700; text-align: right; border-bottom: 1px solid ${COLORS.borderGray};">Deal Signals ${planDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.darkGray}; border-bottom: 1px solid ${COLORS.borderGray};">Monthly Price</td>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.ink}; font-weight: 700; text-align: right; border-bottom: 1px solid ${COLORS.borderGray};">${planPrice}</td>
                  </tr>
                  <tr>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.darkGray}; border-bottom: 1px solid ${COLORS.borderGray};">Monthly Analyses</td>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.ink}; font-weight: 700; text-align: right; border-bottom: 1px solid ${COLORS.borderGray};">${uploadLimit}</td>
                  </tr>
                  <tr>
                    <td style="padding: 9px 0; font-size: 14px; color: ${COLORS.darkGray};">Status</td>
                    <td style="padding: 9px 0; font-size: 14px; text-align: right;">
                      <span style="background-color: rgba(132,204,22,0.15); color: ${COLORS.limeDark}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700;">Active</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding: 24px 40px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.subtleGray}; border-radius: 10px;">
            <tr>
              <td style="padding: 24px 26px;">
                <p style="margin: 0 0 4px 0; color: ${COLORS.limeDark}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.3px;">Included in ${planDisplay}</p>
                <h3 style="margin: 0 0 14px 0; color: ${COLORS.ink}; font-size: 17px; font-weight: 700;">Everything you need to run more deals</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Up to ${uploadLimit} deal analyses per month</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Full Deal Signals scoring with category breakdowns</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Downloadable XLS worksheets of analysis</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Workspace with saved deals and history</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Property map and scoreboard views</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> White-label shareable links</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Location Intelligence</td></tr>
                  ${plan === 'pro_plus' ? `
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Bulk portfolio uploads &amp; advanced exports</td></tr>
                  <tr><td style="padding: 5px 0; font-size: 14px; color: ${COLORS.textGray};"><span style="color: ${COLORS.limeDark}; margin-right: 8px; font-weight: 700;">&#10003;</span> Priority processing &amp; custom branding</td></tr>
                  ` : ''}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding: 30px 40px 10px; text-align: center;">
          <a href="${appUrl}/workspace" style="background-color: ${COLORS.lime}; color: #FFFFFF; padding: 14px 40px; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 8px; display: inline-block; letter-spacing: 0.02em;">
            Start Analyzing Deals
          </a>
        </td>
      </tr>

      <tr>
        <td style="padding: 20px 40px 32px;">
          <p style="margin: 16px 0 4px 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.65;">
            Manage your subscription, change plans, or cancel anytime from your <a href="${appUrl}/workspace/profile" style="color: ${COLORS.limeDark}; text-decoration: none; font-weight: 600;">account profile</a>.
          </p>
          <p style="margin: 0 0 8px 0; color: ${COLORS.muted}; font-size: 12px; line-height: 1.65;">
            Questions about billing or the platform? Reply to this email and the team will get back to you.
          </p>
          <p style="margin: 10px 0 0 0; color: ${COLORS.muted}; font-size: 12px;">
            &mdash; The Deal Signals team
          </p>
        </td>
      </tr>
    </table>

    ${emailFooter()}
  `;

  return emailWrapper(content);
}
