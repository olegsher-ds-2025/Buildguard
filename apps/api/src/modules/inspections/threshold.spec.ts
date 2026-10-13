import { evaluateThreshold } from "./threshold";

const th = (op: "≥" | "≤" | "<" | ">", value: number) => ({ op, value, upperValue: null, unit: null, raw: `${op} ${value}` });

describe("evaluateThreshold", () => {
  it("does not evaluate unreviewed thresholds", () => {
    expect(evaluateThreshold([th("≤", 4)], false, 9)).toEqual({ evaluated: false, breached: false });
  });

  it("does not evaluate ambiguous multi-threshold items or missing values", () => {
    expect(evaluateThreshold([th("≤", 4), th("≤", 3)], true, 9).evaluated).toBe(false);
    expect(evaluateThreshold([th("≤", 4)], true, null).evaluated).toBe(false);
    expect(evaluateThreshold([], true, 1).evaluated).toBe(false);
  });

  it.each([
    ["≥", 95, 94.9, true],
    ["≥", 95, 95, false],
    ["≤", 4, 4.1, true],
    ["≤", 4, 4, false],
    ["<", 5, 5, true],
    ["<", 5, 4.9, false],
    [">", 1, 1, true],
    [">", 1, 1.1, false],
  ] as const)("%s %d with value %d breached=%s", (op, limit, value, breached) => {
    expect(evaluateThreshold([th(op, limit)], true, value)).toEqual({ evaluated: true, breached });
  });
});
