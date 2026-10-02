import { trialSource, groupAnonymousUsers, groupEmailLeads, groupSavePrompt } from "../bot-trials";
import { cleanAttribution, readAttributionCookie } from "../attribution";

const x = { utm_source: "x", utm_campaign: "x_tips", utm_content: "afternoon_tip" };

describe("trialSource", () => {
  it("labels missing attribution as untracked", () => {
    expect(trialSource(undefined).utm_source).toBe("untracked");
    expect(trialSource(null).utm_source).toBe("untracked");
  });
  it("uses referral when only a referrer host is present, else direct", () => {
    expect(trialSource({ referrer_host: "biggerpockets.com" }).utm_source).toBe("referral");
    expect(trialSource({}).utm_source).toBe("direct");
  });
  it("lowercases the source and keeps campaign and content", () => {
    expect(trialSource({ ...x, utm_source: " X " })).toEqual(x);
  });
});

describe("groupAnonymousUsers", () => {
  it("groups by source, campaign and content and counts uploaders", () => {
    const out = groupAnonymousUsers([
      { attribution: x, uploads: 2 },
      { attribution: x, uploads: 0 },
      { attribution: { utm_source: "x", utm_campaign: "bio", utm_content: "profile" }, uploads: 1 },
      { uploads: 1 },
    ]);
    expect(out[0]).toEqual({ ...x, users: 2, users_with_1plus_upload: 1 });
    expect(out).toHaveLength(3);
    expect(out.find(g => g.utm_source === "untracked")).toEqual({ utm_source: "untracked", utm_campaign: null, utm_content: null, users: 1, users_with_1plus_upload: 1 });
  });
  it("excludes test traffic", () => {
    expect(groupAnonymousUsers([{ attribution: { utm_source: "Test" }, uploads: 3 }])).toEqual([]);
  });
  it("returns only aggregate fields", () => {
    const [g] = groupAnonymousUsers([{ attribution: x, uploads: 1 }]);
    expect(Object.keys(g).sort()).toEqual(["users", "users_with_1plus_upload", "utm_campaign", "utm_content", "utm_source"]);
  });
});

describe("groupEmailLeads", () => {
  it("counts leads per source and drops test traffic", () => {
    const out = groupEmailLeads([{ attribution: x }, { attribution: x }, {}, { attribution: { utm_source: "test" } }]);
    expect(out).toEqual([
      { ...x, leads: 2 },
      { utm_source: "untracked", utm_campaign: null, utm_content: null, leads: 1 },
    ]);
  });
});

describe("cleanAttribution", () => {
  it("falls back to direct when nothing useful is present", () => {
    expect(cleanAttribution(undefined).utm_source).toBe("direct");
    expect(cleanAttribution({ landing_path: "/" }).utm_source).toBe("direct");
  });
  it("trims, caps and lowercases", () => {
    const a = cleanAttribution({ utm_source: " X ", utm_campaign: "c".repeat(200), referrer_host: "T.CO" });
    expect(a.utm_source).toBe("x");
    expect(a.utm_campaign).toHaveLength(80);
    expect(a.referrer_host).toBe("t.co");
  });
  it("reads the som_attr cookie from a Cookie header", () => {
    const cookie = `a=1; som_attr=${encodeURIComponent(JSON.stringify(x))}; b=2`;
    expect(cleanAttribution(readAttributionCookie(cookie))).toMatchObject(x);
    expect(readAttributionCookie("a=1")).toBeUndefined();
    expect(readAttributionCookie("som_attr=%7Bbroken")).toBeUndefined();
  });
});

describe("groupSavePrompt", () => {
  const g = { utm_source: "google_ads", utm_medium: "cpc", utm_campaign: "paid_test_oct26", utm_content: "g1_speed" };
  it("counts shown, dismissed and signups per utm_source", () => {
    const out = groupSavePrompt([
      { attribution: g, shown: true, dismissed: true, signedUp: false },
      { attribution: g, shown: true, dismissed: false, signedUp: true },
      { attribution: x, shown: true, dismissed: false, signedUp: false },
      { attribution: x, shown: false, dismissed: false, signedUp: false },
      { attribution: { utm_source: "test" }, shown: true, dismissed: true, signedUp: true },
    ]);
    expect(out.totals).toEqual({ shown: 3, dismissed: 1, signups_from_prompt: 1 });
    expect(out.by_utm_source).toEqual([
      { utm_source: "google_ads", shown: 2, dismissed: 1, signups_from_prompt: 1 },
      { utm_source: "x", shown: 1, dismissed: 0, signups_from_prompt: 0 },
    ]);
  });
});

describe("utm_medium", () => {
  it("is kept and lowercased by cleanAttribution", () => {
    expect(cleanAttribution({ utm_source: "google_ads", utm_medium: "CPC" }).utm_medium).toBe("cpc");
    expect(cleanAttribution({ utm_source: "x" }).utm_medium).toBeNull();
  });
});
