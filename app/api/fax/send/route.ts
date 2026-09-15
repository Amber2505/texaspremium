// app/api/fax/send/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { azureStorage } from "@/lib/services/azureStorage";
import { SDK } from "@ringcentral/sdk";
import FormData from "form-data";

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";
const FAX_NUMBER = process.env.RINGCENTRAL_FAX_NUMBER || "";

// RC rejects oversized sends outright; fail fast with a clear message instead.
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

// Module-scope cache — a JWT login per send is an extra RC auth call that
// counts against the same limit the status poller was already exhausting.
let cachedPlatform: any = null;
let cachedExpiry = 0;

async function getRingCentralClient() {
  if (cachedPlatform && Date.now() < cachedExpiry) return cachedPlatform;
  const rcsdk = new SDK({
    server: RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });
  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  cachedPlatform = platform;
  cachedExpiry = Date.now() + 30 * 60 * 1000;
  return platform;
}

interface RcFaxResponse {
  id: number | string;
  messageStatus?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  faxPageCount?: number;
  to?: { phoneNumber?: string }[];
  from?: { phoneNumber?: string };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 },
      );
    }

    const formDataIn = await request.formData();

    // Recipients — single 'to' or repeated 'to[]'
    const toArray = formDataIn.getAll("to[]") as string[];
    const toField = formDataIn.get("to") as string | null;
    let recipients: string[] =
      toArray.length > 0
        ? toArray
        : toField
          ? toField.split(",").map((p) => p.trim())
          : [];
    recipients = recipients.filter(Boolean);

    const coverPageText = ((formDataIn.get("coverPageText") || "") as string).trim();
    const faxResolution =
      ((formDataIn.get("faxResolution") || "High") as string) === "Low"
        ? "Low"
        : "High";

    const files: File[] = [];
    for (const entry of formDataIn.getAll("files")) {
      if (entry instanceof File) files.push(entry);
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "At least one fax number is required" },
        { status: 400 },
      );
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one document is required" },
        { status: 400 },
      );
    }

    // RC caps cover page text at 1024 characters.
    if (coverPageText.length > 1024) {
      return NextResponse.json(
        { error: "Cover page text is limited to 1024 characters" },
        { status: 400 },
      );
    }

    // Normalize to E.164
    const formatted: string[] = [];
    for (const raw of recipients) {
      const cleaned = raw.replace(/\D/g, "");
      if (cleaned.length < 10) {
        return NextResponse.json(
          { error: `Invalid fax number: ${raw}` },
          { status: 400 },
        );
      }
      const e164 = cleaned.startsWith("1") ? `+${cleaned}` : `+1${cleaned}`;
      if (!/^\+1\d{10}$/.test(e164)) {
        return NextResponse.json(
          { error: `Invalid fax number format: ${e164}` },
          { status: 400 },
        );
      }
      formatted.push(e164);
    }

    // Read every file once — we need the bytes for both RC and Azure.
    const fileBuffers: { name: string; type: string; buffer: Buffer }[] = [];
    let totalBytes = 0;
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      totalBytes += buffer.length;
      fileBuffers.push({
        name: file.name,
        type: file.type || "application/octet-stream",
        buffer,
      });
    }

    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          error: `Total attachment size is ${(totalBytes / 1024 / 1024).toFixed(1)}MB — the limit is 20MB.`,
        },
        { status: 400 },
      );
    }

    console.log(
      `📠 Sending fax to [${formatted.join(", ")}] — ${fileBuffers.length} file(s), ${(totalBytes / 1024 / 1024).toFixed(2)}MB`,
    );

    // ── Build the RC multipart request ───────────────────────────────────
    // The fax endpoint takes a JSON root part then one part per document, in
    // transmission order. Unlike SMS, `from` is NOT settable — RC uses the
    // extension's own fax number.
    const platform = await getRingCentralClient();
    const rcForm = new FormData();

    const body: Record<string, unknown> = {
      to: formatted.map((phoneNumber) => ({ phoneNumber })),
      faxResolution,
    };
    if (coverPageText) body.coverPageText = coverPageText;

    rcForm.append("json", Buffer.from(JSON.stringify(body), "utf8"), {
      filename: "request.json",
      contentType: "application/json",
    });

    for (const f of fileBuffers) {
      rcForm.append("attachment", f.buffer, {
        filename: f.name,
        contentType: f.type,
      });
    }

    let result: RcFaxResponse;
    try {
      const response = await platform.post(
        "/restapi/v1.0/account/~/extension/~/fax",
        rcForm,
      );
      result = (await response.json()) as RcFaxResponse;
      console.log(
        `✅ Fax queued — RC id ${result.id}, status ${result.messageStatus}`,
      );
    } catch (rcError: any) {
      console.error("❌ RingCentral fax error:", rcError?.message);
      let errorMessage = "Failed to send fax via RingCentral";
      if (rcError?.response) {
        try {
          const errorData = await rcError.response.json();
          console.error("   RC said:", JSON.stringify(errorData).slice(0, 500));
          errorMessage =
            errorData.message ||
            errorData.errorCode ||
            errorData.error_description ||
            errorMessage;
        } catch {
          errorMessage = rcError.message || errorMessage;
        }
      } else {
        errorMessage = rcError?.message || errorMessage;
      }
      if (/rate exceeded|rate limit|429/i.test(rcError?.message || "")) {
        cachedPlatform = null;
        cachedExpiry = 0;
        const secs = Math.ceil((rcError?.retryAfter || 60000) / 1000);
        return NextResponse.json(
          {
            error: `RingCentral is rate limiting this account. Try again in about ${secs} seconds.`,
            rateLimited: true,
          },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    // ── Copy documents to Azure ──────────────────────────────────────────
    // RC's own attachment URIs need a bearer token, so the browser can't load
    // them directly. Upload after the send succeeds — a failed send shouldn't
    // leave orphan blobs.
    const attachments: Array<{
      id: string;
      filename: string;
      contentType: string;
      azureUrl: string;
    }> = [];

    for (const f of fileBuffers) {
      try {
        const azureUrl = await azureStorage.uploadAttachment(
          f.buffer,
          `fax_${result.id}_${f.name}`,
          f.type,
        );
        attachments.push({
          id: `${result.id}_${attachments.length}`,
          filename: f.name,
          contentType: f.type,
          azureUrl,
        });
      } catch (e) {
        console.error(`❌ Azure upload failed for ${f.name}:`, e);
      }
    }

    // ── Save ─────────────────────────────────────────────────────────────
    const client = await connectToDatabase;
    const faxes = client.db("db").collection("texas_premium_faxes");

    const faxId = `fax_${result.id}`;
    const doc = {
      id: faxId,
      rcMessageId: result.id.toString(),
      direction: "Outbound" as const,
      status: result.messageStatus || "Queued",
      from: FAX_NUMBER,
      to: formatted,
      creationTime: new Date(result.creationTime || Date.now()).toISOString(),
      lastModifiedTime: new Date(
        result.lastModifiedTime || Date.now(),
      ).toISOString(),
      pageCount: result.faxPageCount || 0,
      readStatus: "Read" as const, // we sent it
      coverPageText: coverPageText || null,
      attachments,
      errorMessage: null,
      createdAt: new Date(),
    };

    // The sync may have already picked this up — don't double-insert.
    await faxes.updateOne(
      { id: faxId },
      { $set: doc },
      { upsert: true },
    );

    // Nudge the socket server so any open fax page refreshes immediately.
    try {
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.replace(
        /^wss?:\/\//,
        (m) => (m === "wss://" ? "https://" : "http://"),
      );
      if (socketUrl) {
        await fetch(`${socketUrl}/notify/fax`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faxId }),
        });
      }
    } catch {
      /* non-fatal — the 5-min sync picks it up */
    }

    return NextResponse.json({
      success: true,
      faxId,
      rcMessageId: result.id,
      status: doc.status,
      pageCount: doc.pageCount,
      recipients: formatted.length,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("❌ Fax send error:", error);
    return NextResponse.json(
      { error: err.message || "Failed to send fax" },
      { status: 500 },
    );
  }
}