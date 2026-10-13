import {
  addDays,
  effectiveSpanMeters,
  evaluateResult,
  formworkRemovalDays,
  formworkState,
  knownRequiredMpa28,
} from "./concrete-rules";

describe("concrete rules", () => {
  it("knows only the grade the checklist gives a figure for", () => {
    expect(knownRequiredMpa28("ב-30")).toBe(33);
    expect(knownRequiredMpa28("ב-40")).toBeUndefined();
  });

  it("passes a 7-day result at 62% of the 28-day requirement and fails just below", () => {
    expect(evaluateResult(7, 33 * 0.62, 33)).toBe("pass");
    expect(evaluateResult(7, 33 * 0.62 - 0.1, 33)).toBe("fail");
  });

  it("needs the full requirement at 28 days", () => {
    expect(evaluateResult(28, 33, 33)).toBe("pass");
    expect(evaluateResult(28, 32.9, 33)).toBe("fail");
  });

  it("counts a cantilever double and goes by the longer side", () => {
    expect(effectiveSpanMeters(2, 2)).toBe(4);
    expect(effectiveSpanMeters(5, 1)).toBe(5);
    expect(effectiveSpanMeters(null, null)).toBeNull();
  });

  it.each([
    [3, 6],
    [3.01, 7],
    [6, 7],
    [6.01, 10],
  ])("span %d m needs %d days", (span, days) => {
    expect(formworkRemovalDays(span)).toBe(days);
  });
});

describe("formworkState", () => {
  const castAt = new Date("2026-10-01T08:00:00Z");
  const pour = { castAt, spanMeters: 4, cantileverMeters: null, formworkRemovedAt: null };

  it("is too early until the removal date, then ready", () => {
    const earliest = addDays(castAt, 7);
    expect(formworkState(pour, false, addDays(castAt, 6))).toEqual({ earliestRemovalAt: earliest, status: "too_early" });
    expect(formworkState(pour, false, earliest).status).toBe("ready");
  });

  it("is blocked by failed cubes even after the wait, and by an unknown span", () => {
    expect(formworkState(pour, true, addDays(castAt, 30)).status).toBe("blocked_failed_cubes");
    expect(formworkState({ ...pour, spanMeters: null }, false, addDays(castAt, 30)).status).toBe("span_unknown");
  });

  it("reports an already-removed formwork as removed", () => {
    expect(formworkState({ ...pour, formworkRemovedAt: castAt }, true, castAt).status).toBe("removed");
  });
});
