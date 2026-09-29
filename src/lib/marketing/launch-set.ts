import { SITE_URL } from "./server";
import type { SocialPost } from "./social";

/**
 * The ScoreOM launch social set, loaded as drafts from Admin > Marketing > Social.
 * Images live in /public/social/launch (JPEG, since Instagram's API only accepts JPEG).
 * Times are US Central (CDT, UTC-5): Instagram 9:30am, X noon, Mon/Wed/Fri.
 */
const img = (f: string) => `${SITE_URL}/social/launch/${f}`;
const TAGS = "#commercialrealestate #CRE #realestateinvesting #CREinvesting #dealflow #underwriting #offeringmemorandum #proptech";

export const LAUNCH_SET: Omit<SocialPost, "status">[] = [
  {
    channels: ["instagram"],
    mediaType: "image",
    mediaUrl: img("ig-carousel-1.jpg"),
    mediaUrls: [1, 2, 3, 4, 5, 6].map(n => img(`ig-carousel-${n}.jpg`)),
    scheduledAt: "2026-10-05T14:30:00.000Z",
    text: `Every OM is a sales pitch. Every broker writes it their own way.

ScoreOM gives you an honest first pass on each one in about a minute:

1. Rebuilds the NOI with vacancy, expenses and reserves applied
2. Scores the deal on the same criteria as every other OM
3. Shows returns at the ask and at the prices around it
4. Ranks your whole pipeline on one DealBoard

It's a fast, consistent first pass. Your underwriting still makes the call.

Try it on your next OM at scoreom.com (link in bio). No signup needed for your first one.

${TAGS}`,
  },
  {
    channels: ["x"],
    mediaType: "image",
    mediaUrl: img("x-noi.jpg"),
    scheduledAt: "2026-10-05T17:00:00.000Z",
    text: `The OM said $221K NOI.

Rebuilt with vacancy, expenses and reserves: $186K. That's 16% less.

ScoreOM does this on every OM you drop in, in about a minute.

scoreom.com`,
  },
  {
    channels: ["instagram"],
    mediaType: "image",
    mediaUrl: img("ig-deal-desk.jpg"),
    scheduledAt: "2026-10-07T14:30:00.000Z",
    text: `"Why not just paste the OM into ChatGPT?"

You can, and you'll get a decent read. What you won't get is the system around it:

- Same criteria and CRE models on every OM
- Every deal you've scored in one place, ranked and on a map
- Fix a number once and the deal re-scores
- Email or share any deal, formatted and ready

A chat gives you an answer. ScoreOM gives you a deal desk.

scoreom.com (link in bio)

#commercialrealestate #CRE #realestateinvesting #AI #proptech #dealflow`,
  },
  {
    channels: ["x"],
    mediaType: "image",
    mediaUrl: img("x-deal-desk.jpg"),
    scheduledAt: "2026-10-07T17:00:00.000Z",
    text: `You can paste an OM into ChatGPT and get a decent read.

What you won't get: the same criteria on every deal, one ranked pipeline, and corrections that stick.

A chat gives you an answer. ScoreOM gives you a deal desk.

scoreom.com`,
  },
  {
    channels: ["instagram"],
    mediaType: "image",
    mediaUrl: img("ig-score-scale.jpg"),
    scheduledAt: "2026-10-09T14:30:00.000Z",
    text: `A score, not a verdict.

Every OM on ScoreOM is measured against the same criteria and lands in one of three bands:

78 - Strong fit
69 - Worth review
51 - Below criteria

It tells you where to spend your time. You decide what deserves a real underwrite.

scoreom.com (link in bio)

#commercialrealestate #CRE #realestateinvesting #underwriting #dealflow`,
  },
  {
    channels: ["x"],
    mediaType: "image",
    mediaUrl: img("x-pipeline.jpg"),
    scheduledAt: "2026-10-09T17:00:00.000Z",
    text: `Turn your CRE deal flow into a ranked pipeline.

Drop in every OM you receive. Get the numbers, a first-pass score, and one board you can rank and share.

Try it on your next OM: scoreom.com`,
  },
];
