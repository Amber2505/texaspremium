// app/api/guides/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { BlobServiceClient } from "@azure/storage-blob";
import { renderPdfToImages } from "../../../lib/pdfToImages";
import { extractPdfSteps } from "../../../lib/extractPdfSteps";
import { generateTutorialVideo } from "../../../lib/generateTutorialVideo";
// PDF → images rendering needs the Node runtime (not edge) and a little headroom
export const runtime = "nodejs";
export const maxDuration = 800; // PDF render + per-step TTS + ffmpeg encode needs real headroom (Vercel Pro+ with Fluid Compute; Hobby caps at 60s regardless)

const mongoClient = new MongoClient(process.env.MONGODB_URI!);

async function getCollection() {
  await mongoClient.connect();
  return mongoClient.db("db").collection("admin_guides");
}

// GET /api/guides
export async function GET() {
  try {
    const col = await getCollection();
    const guides = await col.find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ guides });
  } catch {
    return NextResponse.json({ error: "Failed to fetch guides" }, { status: 500 });
  }
}

// POST /api/guides — JSON body: title, description, category, duration,
// steps, embedUrl, and EITHER pdfBlobName OR videoBlobName (already
// uploaded straight to Azure by the client via /api/guides/upload-url).
// No raw file bytes travel through this route — that's what keeps every
// request well under Vercel's 4.5MB serverless body limit, even for a
// 30MB+ PDF.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title: string = body.title ?? "";
    const description: string = body.description ?? "";
    const category: string = body.category ?? "General";
    const duration: string = body.duration ?? "";
    let steps: { title: string; description: string }[] = Array.isArray(body.steps)
      ? body.steps
      : [];
    const embedUrl: string = body.embedUrl ?? "";
    const pdfBlobName: string | null = body.pdfBlobName ?? null;
    const videoBlobName: string | null = body.videoBlobName ?? null;

    if (!title || (!pdfBlobName && !videoBlobName && !embedUrl)) {
      return NextResponse.json(
        { error: "Title and a file or embed URL are required." },
        { status: 400 },
      );
    }

    // ── Slug + collection (needed by every path, PDF included) ──
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const col = await getCollection();
    if (await col.findOne({ slug })) {
      return NextResponse.json(
        { error: "A guide with that title already exists." },
        { status: 409 },
      );
    }

    // ── Azure container (files already live here — client uploaded direct) ──
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!,
    );
    const containerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_GUIDES_CONTAINER ?? "guides",
    );
    await containerClient.createIfNotExists({ access: "blob" });

    // ════════════════════════════════════════════════════════════════════════
    // PDF PATH: download the already-uploaded PDF from Azure (server-side
    // fetch — not subject to the client→Vercel body limit), render pages,
    // extract steps, upload the clean page images, delete the temp PDF.
    // ════════════════════════════════════════════════════════════════════════
    if (pdfBlobName) {
      const pdfBlob = containerClient.getBlockBlobClient(pdfBlobName);
      const pdfBuffer = await pdfBlob.downloadToBuffer();

      // 1. Extract clean screenshots (page 1 cover skipped inside the
      //    helper; pages with no real screenshot — e.g. a closing card —
      //    are skipped too, so `rendered` may have gaps in pageNumber).
      const rendered = await renderPdfToImages(pdfBuffer, {
        scale: 2.0,
        cropTop: 0.09,
        cropBottom: 0.07,
        skipFirstPage: true,
      });

      // 2. Upload each page image to Azure, keeping its source pageNumber
      const uploadedPages: { pageNumber: number; url: string }[] = [];
      for (const pg of rendered) {
        const blobName = `${slug}-p${pg.pageNumber}-${Date.now()}.png`;
        const blob = containerClient.getBlockBlobClient(blobName);
        await blob.uploadData(pg.png, {
          blobHTTPHeaders: { blobContentType: "image/png" },
        });
        uploadedPages.push({ pageNumber: pg.pageNumber, url: blob.url });
      }

      // 3. Extract steps if the admin didn't type any in manually. This
      //    returns one entry per PDF page (page 1 skipped, same as above),
      //    so stepsFromPdf[k] corresponds to page number (2 + k).
      const startPage = 2; // matches skipFirstPage: true above
      let stepsFromPdf: { title: string; description: string }[] = [];
      if (!steps || steps.length === 0) {
        try {
          stepsFromPdf = await extractPdfSteps(pdfBuffer, true);
        } catch (e) {
          console.error("PDF step extraction failed:", e);
          stepsFromPdf = [];
        }
      }

      // 4. Pair each uploaded page image with the step text for that EXACT
      //    page number — not array position — so a skipped closing-card
      //    page in the middle/end can never shift later steps' text.
      const pages = uploadedPages.map((pg, i) => {
        const stepForPage = stepsFromPdf[pg.pageNumber - startPage];
        return {
          image: pg.url,
          title: steps[i]?.title ?? stepForPage?.title ?? `Step ${i + 1}`,
          description: steps[i]?.description ?? stepForPage?.description ?? "",
        };
      });
      if (stepsFromPdf.length > 0 && (!steps || steps.length === 0)) {
        steps = stepsFromPdf;
      }

      // 5. Clean up the temp source PDF — we only needed it for rendering.
      await pdfBlob.deleteIfExists();

      // 6. Auto-generate a narrated walkthrough video. Best-effort: if TTS
      //    or ffmpeg fails, the guide still saves fine with its images and
      //    text — a video failure should never block the upload itself.
      let narratedVideoUrl = "";
      try {
        const videoSteps = rendered.map((pg, i) => ({
          imageBuffer: pg.png,
          narration:
            [pages[i]?.title, pages[i]?.description].filter(Boolean).join(". ") ||
            `Step ${i + 1}.`,
        }));
        const videoBuffer = await generateTutorialVideo(videoSteps);

        const videoBlobName = `${slug}-tutorial-${Date.now()}.mp4`;
        const videoBlob = containerClient.getBlockBlobClient(videoBlobName);
        await videoBlob.uploadData(videoBuffer, {
          blobHTTPHeaders: { blobContentType: "video/mp4" },
        });
        narratedVideoUrl = videoBlob.url;
      } catch (e) {
        console.error("Narrated video generation failed (guide still saved):", e);
      }

      const doc = {
        slug,
        title,
        description,
        category,
        duration,
        steps,
        pages,
        fileType: "pdf-steps",
        videoUrl: "",
        narratedVideoUrl, // auto-generated narrated walkthrough, "" if generation failed
        embedUrl: "",
        blobName: "",
        createdAt: new Date(),
      };

      await col.insertOne(doc);
      return NextResponse.json({ guide: doc });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VIDEO / EMBED PATH — video was already uploaded direct to Azure too;
    // just reference the blob that's already there.
    // ════════════════════════════════════════════════════════════════════════
    let videoUrl = embedUrl;
    let blobName = "";
    const fileType = embedUrl ? "embed" : videoBlobName ? "video" : "embed";

    if (videoBlobName) {
      blobName = videoBlobName;
      videoUrl = containerClient.getBlockBlobClient(videoBlobName).url;
    }

    const doc = {
      slug,
      title,
      description,
      category,
      duration,
      steps,
      fileType,
      embedUrl,
      videoUrl,
      blobName,
      createdAt: new Date(),
    };

    await col.insertOne(doc);
    return NextResponse.json({ guide: doc });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "Upload failed." }, { status: 500 });
  }
}