import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { layoutPages, type DocumentLayout } from "./layout";

// The legacy build bundles polyfills for JS APIs that the macOS WebView
// (WebKit) does not ship yet, e.g. Map.getOrInsertComputed.
GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfDocument {
  path: string;
  fileName: string;
  fingerprint: string;
  proxy: PDFDocumentProxy;
  pages: PDFPageProxy[];
  layout: DocumentLayout;
  /** Frees the worker and all page data. */
  destroy(): Promise<void>;
}

export async function loadPdf(path: string, data: Uint8Array): Promise<PdfDocument> {
  const assets = new URL("pdfjs/", document.baseURI).href;
  const task = getDocument({
    data,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
    enableXfa: false,
  });
  const proxy = await task.promise;

  // Page proxies are cheap (no drawing data until rendered); fetching them
  // all up front gives exact sizes for the layout.
  const pages = await Promise.all(
    Array.from({ length: proxy.numPages }, (_, i) => proxy.getPage(i + 1)),
  );
  const layout = layoutPages(
    pages.map((p) => {
      const v = p.getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    }),
  );

  return {
    path,
    fileName: path.split("/").pop() ?? path,
    fingerprint: proxy.fingerprints[0] ?? "",
    proxy,
    pages,
    layout,
    destroy: () => task.destroy(),
  };
}
