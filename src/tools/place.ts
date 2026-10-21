import type { Annotation } from "../model/types";
import { pageForRect } from "../pdf/layout";
import type { ToolContext } from "./Tool";

/** Sets which page owns an annotation (null = scratch area). */
export function placeOnPage<T extends Annotation>(ctx: ToolContext, a: T): T {
  if (a.type !== "text-highlight") a.page = pageForRect(ctx.layout.pages, a.bbox);
  return a;
}
