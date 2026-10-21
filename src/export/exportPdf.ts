import fontkit from "@pdf-lib/fontkit";
import { BlendMode, degrees, LineCapStyle, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import rough from "roughjs";
// PDF embedding needs TrueType (pdf-lib cannot subset WOFF2 correctly).
import excalifontUrl from "../assets/fonts/Excalifont-Latin.ttf?url";
import { isShape, lineHeight, shapeDrawables, transformAnnotation, union } from "../canvas/geometry";
import { BACKGROUND_COLORS, HIGHLIGHT_COLORS, PEN_COLORS, strokeColor, strokeOutline } from "../canvas/strokes";
import type { Annotation, FontFamily, Rect, Vec2 } from "../model/types";
import type { PdfDocument } from "../pdf/loader";

export interface ExportOptions {
  /** Put annotations outside the pages on an extra "Rascunhos" page at the end. */
  includeScratch: boolean;
}

/** Margin around scratch annotations on the extra page, in points. */
const SCRATCH_MARGIN = 36;

/**
 * Builds a new PDF with annotations "flattened" onto the pages as vector
 * graphics (the original file is not touched). Hand-drawn shapes keep their
 * exact wobble, text keeps its font, highlights are multiplied over the page.
 */
export async function exportAnnotatedPdf(
  doc: PdfDocument,
  source: Uint8Array,
  annotations: Annotation[],
  options: ExportOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source);
  pdf.registerFontkit(fontkit);
  const fonts = new FontCache(pdf);

  const byPage = new Map<number, Annotation[]>();
  const scratch: Annotation[] = [];
  for (const a of annotations) {
    if (a.page === null || a.page >= doc.pages.length) scratch.push(a);
    else byPage.set(a.page, [...(byPage.get(a.page) ?? []), a]);
  }

  for (const [index, items] of byPage) {
    const box = doc.layout.pages[index];
    const frame = pageFrame(doc, index, pdf.getPage(index));
    for (const a of items) await drawItem(frame, a, { x: box.x, y: box.y }, fonts);
  }

  if (options.includeScratch && scratch.length) {
    const area = union(scratch.map((a) => a.bbox));
    const width = area.w + SCRATCH_MARGIN * 2;
    const height = area.h + SCRATCH_MARGIN * 2 + 24;
    const page = pdf.addPage([width, height]);
    const label = await fonts.get("normal");
    page.drawText(`Rascunhos — ${doc.fileName}`, {
      x: SCRATCH_MARGIN,
      y: height - SCRATCH_MARGIN + 6,
      size: 9,
      font: label,
      color: rgb(0.45, 0.45, 0.47),
    });
    const frame: Frame = { page, origin: { x: 0, y: height - 24 }, angle: 0 };
    const offset = { x: area.x - SCRATCH_MARGIN, y: area.y - SCRATCH_MARGIN };
    for (const a of scratch) await drawItem(frame, a, offset, fonts);
  }

  return pdf.save({ useObjectStreams: true });
}

// ---- page frames ------------------------------------------------------------

/** Where page-local coordinates (points, y down) land in PDF user space. */
interface Frame {
  page: PDFPage;
  origin: Vec2;
  /** Rotation of the page's x axis in PDF space, radians. */
  angle: number;
}

/** Uses PDF.js's viewport so rotated pages and offset media boxes line up. */
function pageFrame(doc: PdfDocument, index: number, page: PDFPage): Frame {
  const viewport = doc.pages[index].getViewport({ scale: 1 });
  const [ox, oy] = viewport.convertToPdfPoint(0, 0);
  const [ux, uy] = viewport.convertToPdfPoint(1, 0);
  return { page, origin: { x: ox, y: oy }, angle: Math.atan2(uy - oy, ux - ox) };
}

function toPdf(frame: Frame, x: number, y: number): Vec2 {
  const c = Math.cos(frame.angle);
  const s = Math.sin(frame.angle);
  // Local y points down; PDF y points up.
  return { x: frame.origin.x + x * c + y * s, y: frame.origin.y + x * s - y * c };
}

interface PathStyle {
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
  opacity: number;
  multiply?: boolean;
}

function drawPath(frame: Frame, d: string, style: PathStyle): void {
  frame.page.drawSvgPath(d, {
    x: frame.origin.x,
    y: frame.origin.y,
    rotate: degrees((frame.angle * 180) / Math.PI),
    color: style.fill ? hex(style.fill) : undefined,
    opacity: style.opacity,
    borderColor: style.stroke ? hex(style.stroke) : undefined,
    borderOpacity: style.opacity,
    borderWidth: style.stroke ? style.width : 0,
    borderDashArray: style.dash,
    borderLineCap: LineCapStyle.Round,
    blendMode: style.multiply ? BlendMode.Multiply : undefined,
  });
}

// ---- annotations ------------------------------------------------------------

async function drawItem(frame: Frame, item: Annotation, offset: Vec2, fonts: FontCache): Promise<void> {
  // Work in page-local coordinates.
  const a = transformAnnotation(item, (p) => ({ x: p.x - offset.x, y: p.y - offset.y }));
  const opacity = (a.opacity ?? 100) / 100;

  switch (a.type) {
    case "pen":
    case "highlighter":
      drawPath(frame, outlineToSvg(strokeOutline(a)), {
        fill: strokeColor(a),
        opacity,
        multiply: a.type === "highlighter",
      });
      return;

    case "text-highlight":
      for (const r of a.rects) {
        drawPath(frame, rectToSvg(r), { fill: HIGHLIGHT_COLORS[a.color], opacity: 1, multiply: true });
      }
      return;

    case "text": {
      const font = await fonts.get(a.fontFamily);
      const lh = a.fontSize * lineHeight(a.fontFamily);
      const ascent = font.heightAtSize(a.fontSize, { descender: false });
      const descent = font.heightAtSize(a.fontSize) - ascent;
      const lines = a.content.split("\n").map((t) => fonts.encodable(font, t));
      const widths = lines.map((t) => font.widthOfTextAtSize(t, a.fontSize));
      const w = Math.max(0, ...widths);
      lines.forEach((text, i) => {
        if (!text) return;
        const dx = a.textAlign === "center" ? (w - widths[i]) / 2 : a.textAlign === "right" ? w - widths[i] : 0;
        // Canvas draws each line centred in its line box ("middle" baseline).
        const baseline = a.bbox.y + lh * i + lh / 2 + (ascent - descent) / 2;
        const p = toPdf(frame, a.bbox.x + dx, baseline);
        frame.page.drawText(text, {
          x: p.x,
          y: p.y,
          size: a.fontSize,
          font,
          color: hex(PEN_COLORS[a.color]),
          opacity,
          rotate: degrees((frame.angle * 180) / Math.PI),
        });
      });
      return;
    }

    default: {
      if (!isShape(a)) return;
      const gen = rough.generator();
      for (const drawable of shapeDrawables(a)) {
        const o = drawable.options;
        for (const set of drawable.sets) {
          const d = gen.opsToPath(set, 2);
          if (set.type === "path") {
            drawPath(frame, d, { stroke: o.stroke, width: o.strokeWidth, dash: o.strokeLineDash, opacity });
          } else if (set.type === "fillPath") {
            drawPath(frame, d, { fill: a.fill ? BACKGROUND_COLORS[a.fill] : o.fill, opacity });
          } else {
            // Hachure lines: stroked with the fill color.
            drawPath(frame, d, { stroke: a.fill ? BACKGROUND_COLORS[a.fill] : o.fill, width: o.fillWeight, opacity });
          }
        }
      }
    }
  }
}

function outlineToSvg(outline: number[][]): string {
  const n = outline.length;
  if (n < 2) return "";
  const f = (v: number) => v.toFixed(2);
  let d = `M ${f(outline[0][0])} ${f(outline[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    d += ` Q ${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  }
  return d + " Z";
}

function rectToSvg(r: Rect): string {
  return `M ${r.x} ${r.y} H ${r.x + r.w} V ${r.y + r.h} H ${r.x} Z`;
}

function hex(color: string) {
  const v = color.replace("#", "");
  return rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
}

/** Embeds each font once. Built-in fonts can't show every character, so text
 *  for them is reduced to what they can encode. */
class FontCache {
  private fonts = new Map<FontFamily, Promise<PDFFont>>();
  private charsets = new Map<PDFFont, Set<number>>();

  constructor(private pdf: PDFDocument) {}

  get(family: FontFamily): Promise<PDFFont> {
    let font = this.fonts.get(family);
    if (!font) {
      font = this.load(family);
      this.fonts.set(family, font);
    }
    return font;
  }

  encodable(font: PDFFont, text: string): string {
    const set = this.charsets.get(font);
    if (!set) return text;
    return [...text].map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
  }

  private async load(family: FontFamily): Promise<PDFFont> {
    if (family === "hand") {
      const bytes = await (await fetch(excalifontUrl)).arrayBuffer();
      return this.pdf.embedFont(bytes, { subset: true });
    }
    const font = await this.pdf.embedFont(family === "code" ? StandardFonts.Courier : StandardFonts.Helvetica);
    this.charsets.set(font, new Set(font.getCharacterSet()));
    return font;
  }
}
