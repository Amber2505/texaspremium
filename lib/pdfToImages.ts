//app/lib/pdfToImages.ts
/*eslint-disable @typescript-eslint/no-require-imports*/
// Pulls the actual embedded screenshot out of each PDF page, instead of
// rendering the whole page and cropping fixed top/bottom fractions.
//
// Why: guidemaker exports (MagicHow, Scribe, etc.) lay out each page as
// [banner] [screenshot] [title] [description] [footer]. A fractional crop
// can only ever remove the banner/footer strips — the title/description
// text sits between the screenshot and the footer and always survives,
// showing up as duplicate text under the image. The screenshot itself is
// stored in the PDF as its own separate embedded image object, completely
// free of that surrounding banner/text/logo, so extracting it directly
// removes all of it in one step with no crop math or guesswork.
//
// Requires: pdfjs-dist and canvas (node-canvas)
//   npm install pdfjs-dist@4.0.379 canvas
import { createCanvas, ImageData, type Canvas } from "canvas";

// pdfjs-dist v3's legacy build is CommonJS. `import pkg from "..."` goes
// through webpack's ESM/CJS interop, which can resolve to `undefined` for
// the default export depending on how the module gets bundled — this is
// what broke the production build ("Cannot destructure property
// 'getDocument' of ... undefined"). A plain require() sidesteps that
// interop entirely and always returns the raw CommonJS exports object.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLegacy = require("pdfjs-dist/legacy/build/pdf.js");
const { getDocument, OPS } = pdfjsLegacy;

// Do NOT set GlobalWorkerOptions.workerSrc here. With disableWorker: true,
// pdf.js's Node "fake worker" path requires ./pdf.worker.js internally via
// a plain relative require and needs no workerSrc at all — setting it to a
// real path instead pushes pdf.js into its browser-style worker-loading
// logic, which crashes in Node ("e.endsWith is not a function") because
// that path expects a browser Worker/URL context that doesn't exist here.
// outputFileTracingIncludes in next.config.ts is what actually fixes the
// "Cannot find module" error, by making sure pdf.worker.js physically
// ships next to pdf.js in the deployed bundle.

// pdf.js needs a canvas factory in Node for the page-render fallback path.
const CanvasFactory = {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  },
  reset(cc: { canvas: Canvas }, width: number, height: number) {
    cc.canvas.width = width;
    cc.canvas.height = height;
  },
  destroy(cc: { canvas: Canvas }) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

export interface RenderedPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

export interface RenderOptions {
  // Upscale factor used ONLY by the full-page fallback (rare — see below).
  scale?: number;
  // Fallback-only crop fractions, used ONLY if a page has no extractable
  // embedded image and we fall back to rendering the whole page.
  cropTop?: number;
  cropBottom?: number;
  // Skip the first page (guidemaker title/cover page). Default true.
  skipFirstPage?: boolean;
  // Max time (ms) to wait for a single embedded image to resolve before
  // giving up on it. Some images live in nested transparency groups pdf.js
  // never resolves — this keeps one bad reference from hanging the render.
  imageResolveTimeoutMs?: number;
}

interface PdfImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8ClampedArray | Uint8Array;
}

// pdf.js resolves an image object via a callback, not a promise — wrap it
// with a timeout so an unresolvable reference (e.g. inside a nested Form
// XObject group) can't hang the whole page.
function getImageObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  name: string,
  timeoutMs: number,
): Promise<PdfImage | null> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    page.objs.get(name, (img: PdfImage) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(img ?? null);
      }
    });
  });
}

// Convert whatever pixel format pdf.js decoded (grayscale / RGB / RGBA)
// into a flat RGBA buffer node-canvas can draw.
function toRGBA(img: PdfImage): Uint8ClampedArray {
  const { width, height, data } = img;
  const n = width * height;
  if (data.length === n * 4) {
    return data instanceof Uint8ClampedArray
      ? data
      : new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  }
  if (data.length === n * 3) {
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      out[j] = data[i];
      out[j + 1] = data[i + 1];
      out[j + 2] = data[i + 2];
      out[j + 3] = 255;
    }
    return out;
  }
  if (data.length === n) {
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      out[j] = data[i];
      out[j + 1] = data[i];
      out[j + 2] = data[i];
      out[j + 3] = 255;
    }
    return out;
  }
  throw new Error(
    `Unexpected image data length ${data.length} for ${width}x${height}`,
  );
}

// Find every embedded raster image on a page and return the LARGEST one by
// area — the real screenshot is always far bigger than any thin banner/logo
// strip, so this reliably isolates it regardless of how many other small
// images (banner background, logo, smasks) share the page.
async function extractLargestPageImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  timeoutMs: number,
): Promise<{ png: Buffer; width: number; height: number } | null> {
  const opList = await page.getOperatorList();
  const names: string[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === OPS.paintImageXObject) {
      names.push(opList.argsArray[i][0]);
    }
  }

  let best: { name: string; img: PdfImage; area: number } | null = null;
  for (const name of names) {
    const img = await getImageObject(page, name, timeoutMs);
    if (!img?.width || !img?.height) continue;
    const area = img.width * img.height;
    if (!best || area > best.area) best = { name, img, area };
  }
  if (!best) return null;

  const rgba = toRGBA(best.img);
  const canvas = createCanvas(best.img.width, best.img.height);
  canvas
    .getContext("2d")
    .putImageData(new ImageData(rgba, best.img.width, best.img.height), 0, 0);

  return {
    png: canvas.toBuffer("image/png"),
    width: best.img.width,
    height: best.img.height,
  };
}

// Fallback for the rare page with no extractable embedded image: render the
// whole page and crop fixed top/bottom fractions (old behavior). This will
// still leave any mid-page text in place, but it only kicks in when there's
// no clean screenshot object to pull instead.
async function renderCroppedFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  scale: number,
  cropTop: number,
  cropBottom: number,
): Promise<{ png: Buffer; width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  const full = CanvasFactory.create(viewport.width, viewport.height);
  await page.render({
    canvasContext: full.context as unknown as CanvasRenderingContext2D,
    viewport,
    canvasFactory: CanvasFactory,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).promise;

  const W = Math.round(viewport.width);
  const H = Math.round(viewport.height);
  const topCut = Math.round(H * cropTop);
  const botCut = Math.round(H * cropBottom);
  const cropH = Math.max(1, H - topCut - botCut);

  const out = createCanvas(W, cropH);
  out
    .getContext("2d")
    .drawImage(full.canvas, 0, topCut, W, cropH, 0, 0, W, cropH);

  CanvasFactory.destroy(full);
  return { png: out.toBuffer("image/png"), width: W, height: cropH };
}

/**
 * Extract a clean screenshot for every page of a PDF — the embedded image
 * object itself, not a rendered-and-cropped page. Page 1 (the guidemaker
 * cover) is skipped by default.
 */
export async function renderPdfToImages(
  pdfBuffer: Buffer,
  opts: RenderOptions = {},
): Promise<RenderedPage[]> {
  const {
    scale = 2.0,
    cropTop = 0.09,
    cropBottom = 0.07,
    skipFirstPage = true,
    imageResolveTimeoutMs = 800,
  } = opts;

  const data = new Uint8Array(pdfBuffer);
  const doc = await getDocument({
    data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).promise;

  const pages: RenderedPage[] = [];
  const startPage = skipFirstPage ? 2 : 1;

  for (let n = startPage; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);

    let result = await extractLargestPageImage(page, imageResolveTimeoutMs);
    if (!result) {
      // No embedded image found on this page — fall back to page render.
      result = await renderCroppedFallback(page, scale, cropTop, cropBottom);
    }

    pages.push({
      pageNumber: n,
      png: result.png,
      width: result.width,
      height: result.height,
    });
  }

  return pages;
}