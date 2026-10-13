import { join } from "node:path";
import PDFDocument from "pdfkit";
import bidiFactory from "bidi-js";
import type { PhotoMarkupShape } from "@buildguard/shared-types";

const bidi = bidiFactory();
const FONT_PATH = join(__dirname, "fonts", "Heebo.ttf");
const INK = "#17202a";
const MUTED = "#66717e";
const ACCENT = "#1f3a5f";
const MARKUP = "#d62828";
// pdfkit lays text out word by word unless `features` is passed, which would reverse letters inside each
// word but leave the words in logical order. Any array makes fontkit lay the whole run out as one.
const NO_FEATURES: PDFKit.Mixins.OpenTypeFeatures[] = [];

// Heebo has no glyphs for these, which would print as empty boxes.
const UNSUPPORTED: [RegExp, string][] = [
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/[←⟵]/g, "<-"],
  [/[→⟶]/g, "->"],
];

export function printable(text: string): string {
  return UNSUPPORTED.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

interface Run {
  text: string;
  level: number;
}

/**
 * Splits one line into bidi runs and returns them left-to-right as they must be
 * drawn. Each run is drawn as logical text; fontkit lays an RTL-script run out
 * in visual order itself, so only the order of the runs needs fixing here.
 */
export function visualRuns(line: string): Run[] {
  const clean = line.replace(/[\u{10000}-\u{10FFFF}]/gu, "");
  if (clean === "") return [];
  const embedding = bidi.getEmbeddingLevels(clean, "rtl");
  const mirrored = bidi.getMirroredCharactersMap(clean, embedding.levels);

  const runs: Run[] = [];
  for (let i = 0; i < clean.length; i++) {
    const level = embedding.levels[i];
    const ch = level % 2 === 1 ? (mirrored.get(i) ?? clean[i]) : clean[i];
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.text += ch;
    else runs.push({ text: ch, level });
  }

  const highest = Math.max(...runs.map((r) => r.level));
  const lowestOdd = Math.min(...runs.filter((r) => r.level % 2 === 1).map((r) => r.level), highest + 1);
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].level < level) continue;
      let j = i;
      while (j + 1 < runs.length && runs[j + 1].level >= level) j++;
      const reversed = runs.slice(i, j + 1).reverse();
      runs.splice(i, j - i + 1, ...reversed);
      i = j;
    }
  }
  return runs;
}

type Align = "right" | "left" | "center";

interface TextOptions {
  size?: number;
  color?: string;
  align?: Align;
  width?: number;
  x?: number;
  gap?: number;
}

export interface TableColumn {
  title: string;
  width: number;
}

/** A4 portrait RTL document: Hebrew text, wrapped and bidi-ordered, with tables and images. */
export class RtlPdf {
  readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private readonly finished: Promise<Buffer>;

  constructor(title: string) {
    this.doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: title }, bufferPages: true });
    this.doc.registerFont("Heebo", FONT_PATH);
    this.doc.font("Heebo");
    this.finished = new Promise((resolve, reject) => {
      this.doc.on("data", (c: Buffer) => this.chunks.push(c));
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
    });
  }

  get left(): number {
    return this.doc.page.margins.left;
  }
  get right(): number {
    return this.doc.page.width - this.doc.page.margins.right;
  }
  get contentWidth(): number {
    return this.right - this.left;
  }
  private get bottom(): number {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  wrap(text: string, width: number, size: number): string[] {
    this.doc.fontSize(size);
    const lines: string[] = [];
    for (const paragraph of printable(text).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && this.doc.widthOfString(candidate) > width) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  private ensureSpace(height: number): void {
    if (this.doc.y + height > this.bottom) this.doc.addPage();
  }

  private drawLine(line: string, x: number, y: number, width: number, align: Align, size: number, color: string): void {
    const runs = visualRuns(line);
    this.doc.fontSize(size).fillColor(color);
    const widths = runs.map((r) => this.doc.widthOfString(r.text));
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = align === "right" ? x + width - total : align === "center" ? x + (width - total) / 2 : x;
    runs.forEach((run, i) => {
      this.doc.text(run.text, cx, y, { lineBreak: false, features: NO_FEATURES });
      cx += widths[i];
    });
  }

  text(text: string, opts: TextOptions = {}): void {
    const { size = 11, color = INK, align = "right", gap = 4 } = opts;
    const width = opts.width ?? this.contentWidth;
    const x = opts.x ?? this.left;
    const lineHeight = size * 1.4;
    for (const line of this.wrap(text, width, size)) {
      this.ensureSpace(lineHeight);
      this.drawLine(line, x, this.doc.y, width, align, size, color);
      this.doc.y += lineHeight;
    }
    this.doc.y += gap;
  }

  heading(text: string, level: 1 | 2 = 1): void {
    this.ensureSpace(40);
    this.text(text, { size: level === 1 ? 20 : 14, color: ACCENT, gap: level === 1 ? 8 : 4 });
    if (level === 1) this.rule();
  }

  rule(): void {
    const y = this.doc.y;
    this.doc.moveTo(this.left, y).lineTo(this.right, y).lineWidth(0.8).strokeColor(ACCENT).stroke();
    this.doc.y += 8;
  }

  /** "label: value" on one line, label on the right. */
  keyValue(label: string, value: string): void {
    this.text(`${label}: ${value}`);
  }

  muted(text: string): void {
    this.text(text, { size: 9, color: MUTED });
  }

  /** Columns are given in reading order (first = rightmost). */
  table(columns: TableColumn[], rows: string[][]): void {
    const size = 9;
    const pad = 4;
    const lineHeight = size * 1.4;
    const total = columns.reduce((a, c) => a + c.width, 0);
    const scale = this.contentWidth / total;
    const widths = columns.map((c) => c.width * scale);

    const drawRow = (cells: string[], header: boolean) => {
      const wrapped = cells.map((c, i) => this.wrap(c, widths[i] - pad * 2, size));
      const height = Math.max(...wrapped.map((l) => l.length)) * lineHeight + pad * 2;
      this.ensureSpace(height);
      const top = this.doc.y;
      let cx = this.right;
      wrapped.forEach((lines, i) => {
        const x = cx - widths[i];
        if (header) this.doc.rect(x, top, widths[i], height).fill("#e8eef5");
        this.doc.rect(x, top, widths[i], height).lineWidth(0.5).strokeColor("#b8c2cc").stroke();
        lines.forEach((line, li) =>
          this.drawLine(line, x + pad, top + pad + li * lineHeight, widths[i] - pad * 2, "right", size, INK),
        );
        cx = x;
      });
      this.doc.y = top + height;
    };

    drawRow(columns.map((c) => c.title), true);
    rows.forEach((r) => drawRow(r, false));
    this.doc.y += 8;
  }

  /** Draws a JPEG/PNG scaled to fit, with optional markup on top. Returns false if the image can't be decoded. */
  image(buffer: Buffer, opts: { maxWidth: number; maxHeight: number; markup?: PhotoMarkupShape[] }): boolean {
    let img: { width: number; height: number };
    try {
      // openImage exists at runtime but is missing from @types/pdfkit.
      img = (this.doc as unknown as { openImage(b: Buffer): { width: number; height: number } }).openImage(buffer);
    } catch {
      return false;
    }
    const scale = Math.min(opts.maxWidth / img.width, opts.maxHeight / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    this.ensureSpace(h + 6);
    const x = this.right - w;
    const y = this.doc.y;
    this.doc.image(buffer, x, y, { width: w, height: h });
    for (const shape of opts.markup ?? []) this.drawMarkup(shape, x, y, w, h);
    this.doc.y = y + h + 6;
    return true;
  }

  private drawMarkup(shape: PhotoMarkupShape, x: number, y: number, w: number, h: number): void {
    this.doc.lineWidth(2).strokeColor(MARKUP).fillColor(MARKUP);
    if (shape.type === "circle") {
      this.doc.ellipse(x + shape.x * w, y + shape.y * h, shape.r * w, shape.r * w).stroke();
    } else if (shape.type === "arrow") {
      const [x1, y1, x2, y2] = [x + shape.x1 * w, y + shape.y1 * h, x + shape.x2 * w, y + shape.y2 * h];
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 8;
      this.doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
      this.doc
        .moveTo(x2, y2)
        .lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
        .lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
        .fill();
    } else {
      this.drawLine(shape.text, x + shape.x * w - 60, y + shape.y * h, 120, "center", 10, MARKUP);
    }
    this.doc.strokeColor(INK).fillColor(INK);
  }

  /** Page numbers, then closes the document. */
  async finish(footer?: string): Promise<Buffer> {
    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      this.doc.switchToPage(range.start + i);
      const y = this.doc.page.height - 30;
      this.drawLine(`${footer ? `${footer} · ` : ""}${i + 1}/${range.count}`, this.left, y, this.contentWidth, "center", 8, MUTED);
    }
    this.doc.end();
    return this.finished;
  }
}
