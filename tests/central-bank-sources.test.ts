import { describe, expect, it } from "vitest";
import { parseCentralBankPolicyHtml } from "@/lib/macro/central-bank-sources";

const NOW = new Date("2026-10-19T16:30:00.000Z");

describe("official G8 central-bank parsers", () => {
  it("reads the Fed's published target range from the linked FOMC decision", () => {
    const page = '<p>Released September 16, 2026.</p><h2>FOMC Statement:</h2><a href="/newsevents/pressreleases/monetary20260916a.htm">HTML</a>';
    const decision = '<p>The Committee decided to raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent.</p>';
    const result = parseCentralBankPolicyHtml("USD", page, NOW, decision, "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm");
    expect(result).toMatchObject({ status: "available", rateLow: 3.75, rateHigh: 4, rateText: "3.75%–4%", asOf: "2026-09-16" });
  });

  it("reads the latest BoE rate and published decision date", () => {
    const html = '<p>Current Bank Rate 3.75%</p><p>Published on 17 September 2026</p><p>Next due: 5 November 2026</p>';
    const result = parseCentralBankPolicyHtml("GBP", html, NOW);
    expect(result).toMatchObject({ status: "available", rateLow: 3.75, rateHigh: 3.75, asOf: "2026-09-17", latestDecisionAt: "2026-09-17", nextDecision: "5 November 2026" });
  });

  it("reads the BoJ overnight-call-rate guideline without treating other currencies as evidence", () => {
    const html = '<p>Guideline The Bank will encourage the uncollateralized overnight call rate to remain at around 1.25 percent.</p><p>The rate applies since September 24, 2026.</p><p>Next Monetary Policy Meeting Date October 29–30, 2026</p>';
    const result = parseCentralBankPolicyHtml("JPY", html, NOW);
    expect(result).toMatchObject({ status: "available", rateLow: 1.25, rateHigh: 1.25, asOf: "2026-09-24", latestDecisionAt: "2026-09-24" });
    expect(result.rateText).toContain("em torno de 1.25%");
  });

  it("keeps the SNB page observation date separate from the last decision date", () => {
    const page = '<p>SNB policy rate 0.00% 19.10.2026</p>';
    const decision = '<p>Monetary policy assessment of 24 September 2026: the SNB leaves its policy rate unchanged at 0.00%.</p>';
    const result = parseCentralBankPolicyHtml("CHF", page, NOW, decision, "https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20260924");
    expect(result).toMatchObject({ status: "available", rateLow: 0, rateHigh: 0, asOf: "2026-10-19", latestDecisionAt: "2026-09-24" });
  });

  it("reads the RBNZ OCR and page-update date without pretending it is a decision date", () => {
    const html = '<p>Official Cash Rate 2.75%</p><p>Updated: 2 September 2026</p><p>Next update: 28 October 2026</p>';
    const result = parseCentralBankPolicyHtml("NZD", html, NOW);
    expect(result).toMatchObject({ status: "available", rateLow: 2.75, rateHigh: 2.75, asOf: "2026-09-02", latestDecisionAt: null, nextDecision: "28 October 2026" });
  });

  it("reads the RBA target from its dated official table row", () => {
    const html = '<table><tr><td>30 Sep 2026</td><td><a href="/media-releases/2026/mr-26-27.html">Statement</a></td><td>4.60</td></tr></table>';
    const decisionUrl = "https://www.rba.gov.au/media-releases/2026/mr-26-27.html";
    const result = parseCentralBankPolicyHtml("AUD", html, NOW, "<p>The Board decided to increase the cash rate target to 4.60 per cent.</p>", decisionUrl);
    expect(result).toMatchObject({ status: "available", rateLow: 4.6, rateHigh: 4.6, asOf: "2026-09-30", decisionUrl });
  });

  it("reads the latest BoC policy target from its official target table", () => {
    const html = '<table id="target-table"><tr><td>September 2, 2026</td><td>2.25%</td></tr></table><p>The next scheduled date for announcing the overnight rate target is October 28, 2026.</p>';
    const result = parseCentralBankPolicyHtml("CAD", html, NOW);
    expect(result).toMatchObject({ status: "available", rateLow: 2.25, rateHigh: 2.25, asOf: "2026-09-02", nextDecision: "2026-10-28" });
  });

  it("reads all three ECB rates and labels the deposit facility as the reference rate", () => {
    const html = '<table><tr><td>2026</td><td>16 September</td><td>2.50</td><td>2.65</td><td>2.75</td><td>2.90</td></tr></table>';
    const result = parseCentralBankPolicyHtml("EUR", html, NOW);
    expect(result).toMatchObject({ status: "available", rateLow: 2.5, rateHigh: 2.5, asOf: "2026-09-16" });
    expect(result.excerpt).toContain("depósito 2.5%");
    expect(result.excerpt).toContain("refinanciamento principal 2.65%");
    expect(result.excerpt).toContain("crédito marginal 2.9%");
  });

  it("returns unavailable instead of estimating when a policy rate cannot be parsed", () => {
    const result = parseCentralBankPolicyHtml("NZD", "<html><p>Policy details are being updated.</p></html>", NOW);
    expect(result.status).toBe("unavailable");
    expect(result.rateLow).toBeNull();
    expect(result.rateHigh).toBeNull();
  });
});
