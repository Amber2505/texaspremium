// lib/documentRequests.ts
// Shared logic for customer document requests (admin page, public upload
// page, and their API routes). Railway's reminder job reads the same
// `document_requests` documents, so labels are stored on each item at
// creation time — Railway never needs this catalog.
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from "@azure/storage-blob";
import connectToDatabase from "@/lib/mongodb";

export const DOCS_CONTAINER =
  process.env.REQUESTED_DOCS_CONTAINER || "requested-documents";
export const LINK_DAYS = 10;
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://www.texaspremiumins.com";
export const RAILWAY_URL =
  process.env.RAILWAY_HTTP_URL ||
  "https://texaspremium-production.up.railway.app";

// Vercel rejects request bodies over 4.5 MB before the route even runs.
export const MAX_UPLOAD_BYTES = 4.3 * 1024 * 1024;
export const MAX_FILES_PER_SLOT = 10;

// ─── Types ───────────────────────────────────────────────────────────────────
export type DocType =
  | "vehicle"
  | "license"
  | "pop"
  | "poh"
  | "membership"
  | "goodStudent"
  | "military"
  | "garaging"
  | "other";

export interface DocFile {
  id: string;
  blobName: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface DocSlot {
  key: string;
  labelEn: string;
  labelEs: string;
  hintEn?: string;
  hintEs?: string;
  guideImage?: string;
  single: boolean; // one file; a new upload replaces it
  imagesOnly: boolean;
  files: DocFile[];
}

export interface DocItem {
  id: string;
  type: DocType;
  labelEn: string; // also used in the reminder texts
  labelEs: string;
  hintEn?: string;
  hintEs?: string;
  slots: DocSlot[];
  review: "accepted" | "rejected" | null;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
}

export interface DocRequest {
  _id?: ObjectId;
  token: string;
  customerName: string;
  customerPhone: string; // 10 digits
  language: "en" | "es";
  items: DocItem[];
  createdAt: Date;
  createdBy: string | null;
  expiresAt: Date;
  reopenedAt: Date | null;
  sentReminders: string[];
  allReceivedAt: Date | null;
  allReceivedSmsAt: Date | null;
  lastUploadAt: Date | null;
  lastViewedAt: Date | null;
  paymentLinkId?: ObjectId | null; // set when the request came from a payment link
  laterTextAt?: Date | null; // "upload later" text sent
}

export type RequestSpec =
  | { type: "vehicle"; vehicles: string[] }
  | { type: "license"; drivers: number }
  | { type: "pop"; months: number }
  | { type: "goodStudent"; students: string[] }
  | { type: "other"; labels: { en: string; es: string }[] }
  | { type: "poh" | "membership" | "military" | "garaging" };

// ─── Item catalog ────────────────────────────────────────────────────────────
const VEHICLE_SLOTS: Omit<DocSlot, "files" | "single" | "imagesOnly">[] = [
  { key: "driver-side", labelEn: "Driver side", labelEs: "Lado del conductor", guideImage: "/document-guide/driver-side.jpg" },
  { key: "passenger-side", labelEn: "Passenger side", labelEs: "Lado del pasajero", guideImage: "/document-guide/passenger-side.jpg" },
  { key: "front", labelEn: "Front", labelEs: "Frente", guideImage: "/document-guide/front.jpg" },
  { key: "rear", labelEn: "Rear", labelEs: "Atrás", guideImage: "/document-guide/rear.jpg" },
  {
    key: "odometer",
    labelEn: "Mileage (odometer)",
    labelEs: "Millaje (odómetro)",
    hintEn: "Car on, numbers clear",
    hintEs: "Vehículo encendido, números claros",
    guideImage: "/document-guide/odometer.jpg",
  },
  {
    key: "vin",
    labelEn: "VIN number",
    labelEs: "Número VIN",
    hintEn: "Driver door sticker or bottom of windshield",
    hintEs: "Calcomanía de la puerta o parte baja del parabrisas",
    guideImage: "/document-guide/vin.jpg",
  },
];

const multiSlot = (key = "files", labelEn = "Files", labelEs = "Archivos"): DocSlot => ({
  key,
  labelEn,
  labelEs,
  single: false,
  imagesOnly: false,
  files: [],
});

const shortId = () => randomBytes(6).toString("base64url");

function baseItem(type: DocType, labelEn: string, labelEs: string, slots: DocSlot[], hintEn?: string, hintEs?: string): DocItem {
  return { id: shortId(), type, labelEn, labelEs, hintEn, hintEs, slots, review: null, reviewNote: null, reviewedBy: null, reviewedAt: null };
}

const clean = (s: unknown, max = 80) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Turns the agent's tile selections into stored items. Throws on bad input. */
export function buildItems(specs: RequestSpec[]): DocItem[] {
  const items: DocItem[] = [];
  for (const spec of specs) {
    switch (spec.type) {
      case "vehicle": {
        const cars = (spec.vehicles || []).map((v) => clean(v)).filter(Boolean);
        if (!cars.length) throw new Error("Enter at least one vehicle (e.g. 2015 Nissan Altima).");
        for (const car of cars.slice(0, 8)) {
          items.push(
            baseItem("vehicle", `Photos – ${car}`, `Fotos – ${car}`,
              VEHICLE_SLOTS.map((s) => ({ ...s, single: true, imagesOnly: true, files: [] })),
              "6 photos: all 4 sides, mileage and VIN. Daylight, no glare, whole vehicle in frame.",
              "6 fotos: los 4 lados, millaje y VIN. Con buena luz, sin reflejos, todo el vehículo visible."),
          );
        }
        break;
      }
      case "license": {
        const n = Math.round(Number(spec.drivers));
        if (!(n >= 1 && n <= 10)) throw new Error("Number of drivers must be between 1 and 10.");
        items.push(
          baseItem("license",
            n === 1 ? "Driver's license/ID" : `Driver's license/ID (${n} drivers)`,
            n === 1 ? "Licencia/identificación" : `Licencia/identificación (${n} conductores)`,
            Array.from({ length: n }, (_, i) => multiSlot(`driver-${i + 1}`, `Driver ${i + 1}`, `Conductor ${i + 1}`)),
            "Front and back. Driver's license, state ID, out-of-state license, passport or consular ID.",
            "Frente y reverso. Licencia, identificación estatal, licencia de otro estado, pasaporte o matrícula consular."),
        );
        break;
      }
      case "pop": {
        const m = Math.round(Number(spec.months));
        if (!(m >= 1 && m <= 60)) throw new Error("Proof of prior months must be between 1 and 60.");
        items.push(
          baseItem("pop", `Proof of prior insurance (${m} months)`, `Comprobante de seguro anterior (${m} meses)`, [multiSlot()],
            `Your previous insurance documents covering the last ${m} months (declarations page or insurance card). You can upload several files.`,
            `Documentos de su seguro anterior que cubran los últimos ${m} meses (página de declaraciones o tarjeta de seguro). Puede subir varios archivos.`),
        );
        break;
      }
      case "goodStudent": {
        const names = (spec.students || []).map((v) => clean(v, 60)).filter(Boolean);
        if (!names.length) throw new Error("Enter the student driver's name for Good Student.");
        for (const name of names.slice(0, 6)) {
          items.push(
            baseItem("goodStudent", `Good student proof – ${name}`, `Comprobante de buen estudiante – ${name}`, [multiSlot()],
              "Recent report card or transcript showing a B average or better.",
              "Boleta de calificaciones o expediente reciente con promedio de B o mejor."),
          );
        }
        break;
      }
      case "other": {
        const labels = (spec.labels || []).map((l) => ({ en: clean(l?.en), es: clean(l?.es) || clean(l?.en) })).filter((l) => l.en);
        if (!labels.length) throw new Error("Describe the other document you need.");
        for (const l of labels.slice(0, 6)) items.push(baseItem("other", l.en, l.es, [multiSlot()]));
        break;
      }
      case "poh":
        items.push(baseItem("poh", "Proof of homeownership", "Comprobante de propiedad de vivienda", [multiSlot()],
          "Anything showing you own your home: mortgage statement, property tax bill, deed, or homeowners insurance declarations page.",
          "Cualquier documento que muestre que es dueño de su casa: estado de cuenta de hipoteca, recibo de impuestos de propiedad, escritura o póliza de seguro de casa."));
        break;
      case "membership":
        items.push(baseItem("membership", "Sam's Club or Costco membership card", "Tarjeta de membresía Sam's Club o Costco", [multiSlot()],
          "Photo of your membership card showing your name.", "Foto de su tarjeta de membresía donde se vea su nombre."));
        break;
      case "military":
        items.push(baseItem("military", "Military ID or proof of service", "Identificación militar o comprobante de servicio", [multiSlot()],
          "Military ID, DD-214, or other proof of service.", "Identificación militar, DD-214 u otro comprobante de servicio."));
        break;
      case "garaging":
        items.push(baseItem("garaging", "Proof of address", "Comprobante de domicilio", [multiSlot()],
          "Utility bill, lease, or bank statement showing the address where the vehicle is kept.",
          "Recibo de servicios, contrato de renta o estado de cuenta con la dirección donde se guarda el vehículo."));
        break;
      default:
        throw new Error("Unknown document type.");
    }
  }
  if (!items.length) throw new Error("Pick at least one document.");
  return items;
}

// ─── Status helpers ──────────────────────────────────────────────────────────
export const itemUploaded = (item: DocItem) => item.slots.every((s) => s.files.length > 0);
export const allUploaded = (req: DocRequest) => req.items.every(itemUploaded);

export function requestStatus(req: DocRequest): "received" | "closed" | "open" {
  if (req.allReceivedAt) return "received";
  if (new Date(req.expiresAt).getTime() <= Date.now()) return "closed";
  return "open";
}

export const linkFor = (req: Pick<DocRequest, "language" | "token">) => `${SITE_URL}/${req.language}/docs/${req.token}`;

/** What the customer's browser is allowed to see — no blob names, no URLs. */
export function toPublic(req: DocRequest) {
  return {
    customerName: req.customerName.split(" ")[0] || "",
    language: req.language,
    expiresAt: req.expiresAt,
    expired: new Date(req.expiresAt).getTime() <= Date.now(),
    items: req.items.map((i) => ({
      id: i.id,
      type: i.type,
      labelEn: i.labelEn,
      labelEs: i.labelEs,
      hintEn: i.hintEn,
      hintEs: i.hintEs,
      locked: i.review === "accepted",
      slots: i.slots.map((s) => ({
        key: s.key,
        labelEn: s.labelEn,
        labelEs: s.labelEs,
        hintEn: s.hintEn,
        hintEs: s.hintEs,
        guideImage: s.guideImage,
        single: s.single,
        imagesOnly: s.imagesOnly,
        files: s.files.map((f) => ({ id: f.id, originalName: f.originalName, uploadedAt: f.uploadedAt })),
      })),
    })),
  };
}

// ─── Mongo ───────────────────────────────────────────────────────────────────
let indexesReady: Promise<unknown> | null = null;

export async function requestsCollection() {
  const client = await connectToDatabase;
  const col = client.db("db").collection<DocRequest>("document_requests");
  if (!indexesReady) {
    indexesReady = Promise.all([
      col.createIndex({ token: 1 }, { unique: true }),
      col.createIndex({ createdAt: -1 }),
      col.createIndex({ allReceivedAt: 1, expiresAt: 1 }),
    ]).catch(() => {});
  }
  return col;
}

export const newToken = () => randomBytes(9).toString("base64url"); // 12 chars

/**
 * Payment-link flow: creates the document request the first time the customer
 * reaches the upload step, so links that never get paid never start
 * reminders. Returns null when the link didn't ask for documents.
 */
export async function ensureRequestForPaymentLink(link: {
  _id: ObjectId;
  customerName?: string | null;
  description?: string | null;
  customerPhone?: string | null;
  language?: string | null;
  documentSpecs?: RequestSpec[] | null;
  documentRequestId?: ObjectId | null;
}): Promise<{ token: string; done: boolean } | null> {
  const col = await requestsCollection();
  const client = await connectToDatabase;
  const links = client.db("db").collection("payment_link_generated");
  const result = (r: DocRequest) => ({ token: r.token, done: requestStatus(r) !== "open" });

  if (link.documentRequestId) {
    const existing = await col.findOne({ _id: link.documentRequestId });
    return existing ? result(existing) : null;
  }
  if (!link.documentSpecs?.length) return null;

  let items: DocItem[];
  try {
    items = buildItems(link.documentSpecs);
  } catch {
    return null;
  }

  const now = new Date();
  const doc: DocRequest = {
    token: newToken(),
    customerName: (link.customerName || (link.description || "").split(" - ")[0] || "Customer").trim().slice(0, 80),
    customerPhone: String(link.customerPhone || "").replace(/\D/g, "").slice(-10),
    language: link.language === "es" ? "es" : "en",
    items,
    createdAt: now,
    createdBy: "Payment link",
    expiresAt: new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000),
    reopenedAt: null,
    sentReminders: [],
    allReceivedAt: null,
    allReceivedSmsAt: null,
    lastUploadAt: null,
    lastViewedAt: null,
    paymentLinkId: link._id,
    laterTextAt: null,
  };
  const { insertedId } = await col.insertOne(doc);

  // Two tabs at once: only one request may attach to the link
  const claimed = await links.updateOne(
    { _id: link._id, documentRequestId: null },
    { $set: { documentRequestId: insertedId } },
  );
  if (!claimed.modifiedCount) {
    await col.deleteOne({ _id: insertedId });
    const fresh = await links.findOne({ _id: link._id });
    const existing = fresh?.documentRequestId ? await col.findOne({ _id: fresh.documentRequestId }) : null;
    return existing ? result(existing) : null;
  }
  return { token: doc.token, done: false };
}

/** Same check as the Autopay Portal: today's 4-digit code from Railway. */
export async function verifyDailyCode(code: unknown): Promise<boolean> {
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) return false;
  const client = await connectToDatabase;
  const doc = await client.db("db").collection("texas_autopay_security").findOne({ type: "daily_code" });
  return !!doc && doc.code === code;
}

// ─── Azure (private container) ───────────────────────────────────────────────
let azure: { cred: StorageSharedKeyCredential; service: BlobServiceClient } | null = null;

function getAzure() {
  if (azure) return azure;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  // AccountKey ends in "=" padding, so split each pair on the FIRST "=" only
  const parts: Record<string, string> = {};
  for (const seg of conn.split(";")) {
    const i = seg.indexOf("=");
    if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  if (!parts.AccountName || !parts.AccountKey) {
    throw new Error("Connection string needs AccountName and AccountKey to sign private view links");
  }
  const cred = new StorageSharedKeyCredential(parts.AccountName, parts.AccountKey);
  const protocol = parts.DefaultEndpointsProtocol || "https";
  const suffix = parts.EndpointSuffix || "core.windows.net";
  const service = new BlobServiceClient(`${protocol}://${parts.AccountName}.blob.${suffix}`, cred);
  azure = { cred, service };
  return azure;
}

export const docsContainer = () => getAzure().service.getContainerClient(DOCS_CONTAINER);

/** Read-only link that stops working after `minutes`. */
export function signedReadUrl(blobName: string, minutes = 15, downloadName?: string) {
  const { cred } = getAzure();
  const blob = docsContainer().getBlockBlobClient(blobName);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: DOCS_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(Date.now() - 5 * 60 * 1000), // clock skew
      expiresOn: new Date(Date.now() + minutes * 60 * 1000),
      // Makes the browser save the file (with this name) instead of opening it
      ...(downloadName ? { contentDisposition: `attachment; filename="${downloadName}"` } : {}),
    },
    cred,
  ).toString();
  return `${blob.url}?${sas}`;
}

export async function deleteBlobQuietly(blobName: string) {
  try {
    await docsContainer().getBlockBlobClient(blobName).deleteIfExists();
  } catch (e) {
    console.error("Blob delete failed:", blobName, e);
  }
}

// ─── Railway ─────────────────────────────────────────────────────────────────
export async function notifyRailway(path: string, body: unknown) {
  try {
    await fetch(`${RAILWAY_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    // Non-fatal: Railway's 5-minute sweep catches anything missed here
    console.error(`Railway notify ${path} failed:`, e);
  }
}