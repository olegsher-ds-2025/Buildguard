import { printable, RtlPdf, visualRuns } from "./rtl-pdf";

describe("visualRuns", () => {
  it("keeps numbers left-to-right inside a Hebrew line, reordered for display", () => {
    // logical: Hebrew word, number, Hebrew word  ->  visual (left→right): second Hebrew, number, first Hebrew
    const runs = visualRuns("שלום 123 עולם");
    expect(runs.map((r) => r.text.trim())).toEqual(["עולם", "123", "שלום"]);
  });

  it("mirrors brackets inside right-to-left text", () => {
    const text = visualRuns("(בדיקה)").map((r) => r.text).join("");
    expect(text).toContain(")");
    expect(text.indexOf(")")).toBeLessThan(text.indexOf("("));
  });

  it("returns nothing for an empty line and drops characters the font cannot draw", () => {
    expect(visualRuns("")).toEqual([]);
    expect(visualRuns("בדיקה 😀").map((r) => r.text).join("")).not.toContain("😀");
  });
});

describe("printable", () => {
  it("swaps comparison arrows the font cannot draw for ASCII", () => {
    expect(printable("ערך ≥ 95% וגם ≤ 98")).toBe("ערך >= 95% וגם <= 98");
  });
});

describe("RtlPdf", () => {
  it("renders a multi-page Hebrew document to a valid PDF buffer", async () => {
    const pdf = new RtlPdf("בדיקה");
    pdf.heading("דוח בדיקה");
    for (let i = 0; i < 80; i++) pdf.text(`שורה מספר ${i} עם טקסט בעברית ומספרים ${i * 7}`);
    pdf.table([{ title: "סעיף", width: 3 }, { title: "תוצאה", width: 1 }], [["חפירה והידוק", "תקין"]]);
    const buffer = await pdf.finish("דוח");
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5000);
  });
});
