import { fontCss, newSeed, withBBox } from "../canvas/geometry";
import type { Annotation, SidecarFile } from "../model/types";

/**
 * Brings older sidecar files up to the current schema.
 *
 * v1 -> v2 (hand-drawn redesign):
 * - shapes get Excalidraw style fields (transparent, solid, artist wobble)
 * - text boxes become free text: their word-wrapped lines are kept as
 *   explicit line breaks so they look the same
 */
export function migrate(raw: { schemaVersion?: number; annotations?: unknown[] } & Record<string, unknown>): SidecarFile {
  if (raw.schemaVersion === 2) return raw as unknown as SidecarFile;
  if (raw.schemaVersion !== 1) throw new Error("formato de arquivo desconhecido");
  const annotations = (raw.annotations ?? []).map((item) => migrateV1(item as Record<string, unknown>));
  return { ...(raw as unknown as SidecarFile), schemaVersion: 2, annotations: annotations.filter(Boolean) as Annotation[] };
}

function migrateV1(a: Record<string, unknown>): Annotation | null {
  switch (a.type) {
    case "arrow":
    case "rect":
    case "ellipse":
      return withBBox({
        fill: null,
        fillStyle: "solid",
        strokeStyle: "solid",
        roughness: 1,
        edges: "round",
        seed: newSeed(),
        ...a,
      } as unknown as Annotation);
    case "text": {
      const bbox = a.bbox as { x: number; y: number; w: number; h: number };
      const fontSize = Number(a.fontSize) || 14;
      const content = wrapV1(String(a.content ?? ""), bbox.w - 8, fontSize);
      return withBBox({
        ...a,
        content,
        fontSize,
        fontFamily: "normal",
        textAlign: "left",
        bbox: { x: bbox.x + 4, y: bbox.y + 4, w: 0, h: 0 },
      } as unknown as Annotation);
    }
    default:
      return a as unknown as Annotation;
  }
}

/** Word wrap used by v1 text boxes. */
function wrapV1(content: string, max: number, fontSize: number): string {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = fontCss(fontSize, "normal");
  const out: string[] = [];
  for (const paragraph of content.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (line && ctx.measureText(next.trimEnd()).width > max) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = next;
      }
    }
    out.push(line.trimEnd());
  }
  return out.join("\n");
}
