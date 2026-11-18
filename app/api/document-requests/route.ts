// app/api/document-requests/route.ts
// POST: agent creates a request → returns the customer link
// GET:  list for the admin Documents page (no file URLs here)
import { NextRequest, NextResponse } from "next/server";
import {
  buildItems,
  itemUploaded,
  linkFor,
  LINK_DAYS,
  newToken,
  requestsCollection,
  requestStatus,
  type DocRequest,
  type RequestSpec,
} from "@/lib/documentRequests";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const customerName = String(body.customerName || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const customerPhone = String(body.customerPhone || "").replace(/\D/g, "");
    const language = body.language === "es" ? "es" : body.language === "en" ? "en" : null;
    const specs = Array.isArray(body.specs) ? (body.specs as RequestSpec[]) : [];

    if (!customerName) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    if (customerPhone.length !== 10)
      return NextResponse.json({ error: "Customer phone number must be 10 digits." }, { status: 400 });
    if (!language) return NextResponse.json({ error: "Pick a language." }, { status: 400 });

    let items;
    try {
      items = buildItems(specs);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    const now = new Date();
    const doc: DocRequest = {
      token: newToken(),
      customerName,
      customerPhone,
      language,
      items,
      createdAt: now,
      createdBy: body.createdBy ? String(body.createdBy).slice(0, 60) : null,
      expiresAt: new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000),
      reopenedAt: null,
      sentReminders: [],
      allReceivedAt: null,
      allReceivedSmsAt: null,
      lastUploadAt: null,
      lastViewedAt: null,
    };

    const col = await requestsCollection();
    const { insertedId } = await col.insertOne(doc);
    return NextResponse.json({ success: true, id: insertedId.toString(), link: linkFor(doc) });
  } catch (e) {
    console.error("Create document request error:", e);
    return NextResponse.json({ error: "Couldn't create the request." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const search = (sp.get("search") || "").trim();
    const status = sp.get("status") || "open";
    const now = new Date();

    const filter: Record<string, unknown> = {};
    if (status === "open") Object.assign(filter, { allReceivedAt: null, expiresAt: { $gt: now } });
    else if (status === "received") Object.assign(filter, { allReceivedAt: { $ne: null } });
    else if (status === "closed") Object.assign(filter, { allReceivedAt: null, expiresAt: { $lte: now } });

    if (search) {
      const digits = search.replace(/\D/g, "");
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { customerName: { $regex: escaped, $options: "i" } },
        ...(digits.length >= 3 ? [{ customerPhone: { $regex: digits } }] : []),
      ];
    }

    const col = await requestsCollection();
    const docs = await col.find(filter).sort({ createdAt: -1 }).limit(100).toArray();

    const requests = docs.map((d) => ({
      id: d._id!.toString(),
      link: linkFor(d),
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      language: d.language,
      createdAt: d.createdAt,
      createdBy: d.createdBy,
      expiresAt: d.expiresAt,
      status: requestStatus(d),
      sentReminders: d.sentReminders || [],
      allReceivedAt: d.allReceivedAt,
      hasNew: !!d.lastUploadAt && (!d.lastViewedAt || d.lastUploadAt > d.lastViewedAt),
      items: d.items.map((i) => ({ id: i.id, label: i.labelEn, uploaded: itemUploaded(i), review: i.review })),
    }));

    return NextResponse.json({ success: true, requests });
  } catch (e) {
    console.error("List document requests error:", e);
    return NextResponse.json({ error: "Couldn't load requests." }, { status: 500 });
  }
}