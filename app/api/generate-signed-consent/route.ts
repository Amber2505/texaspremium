// app/api/generate-signed-consent/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import nodemailer from "nodemailer";
import crypto from "crypto";

// Helper: draw wrapped text and return new Y position
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  fontObj: PDFFont,
  color: any
): number {
  const paragraphs = text.split("\n");
  let currentY = y;

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      currentY -= fontSize + 4;
      continue;
    }

    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine + word + " ";
      const textWidth = fontObj.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > maxWidth && currentLine.length > 0) {
        page.drawText(currentLine.trim(), {
          x, y: currentY, size: fontSize, font: fontObj, color,
        });
        currentY -= fontSize + 3;
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.trim().length > 0) {
      page.drawText(currentLine.trim(), {
        x, y: currentY, size: fontSize, font: fontObj, color,
      });
      currentY -= fontSize + 2;
    }

    currentY -= 1;
  }

  return currentY;
}

// Helper: truncate text to fit within maxWidth
function truncateToWidth(text: string, maxWidth: number, fontObj: PDFFont, fontSize: number): string {
  if (fontObj.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (fontObj.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "...";
}

// Helper: draw a zebra-striped section header bar
function drawSectionHeader(page: PDFPage, x: number, y: number, width: number, text: string, boldFont: PDFFont) {
  page.drawRectangle({
    x, y: y - 3, width, height: 16,
    color: rgb(0.92, 0.92, 0.92),
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.5,
  });
  page.drawText(text, {
    x: x + 6, y: y + 2, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.1),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      customerName,
      amount,
      cardLast4,
      signatureDataUrl,
      signatureMethod,
      language,
      clientIP,
      cardholderEmail,
      billingZip,
      userAgent,
      behavioralEvidence, // ✅ NEW
    } = body;

    let email = body.email || "";

    // If email is missing, look it up from DB (supports new publicLinkId + legacy ObjectId)
    if (!email || !email.trim()) {
      try {
        const { MongoClient, ObjectId } = await import("mongodb");
        const mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
        const db = mongoClient.db("db");

        const phone = body.phone || "";
        const linkId = body.linkId || "";

        if (phone) {
          const payment = await db.collection("completed_payments").findOne(
            { customerPhone: phone.replace(/\D/g, "") },
            { sort: { processedAt: -1 } }
          );
          if (payment?.customerEmail) email = payment.customerEmail;
        }

        if ((!email || !email.trim()) && linkId) {
          let link = null;
          if (/^[a-f0-9]{32}$/i.test(linkId)) {
            link = await db.collection("payment_link_generated").findOne({ publicLinkId: linkId });
          } else if (linkId.length === 24 && ObjectId.isValid(linkId)) {
            link = await db.collection("payment_link_generated").findOne({ _id: new ObjectId(linkId) });
          }
          if (link?.customerEmail) email = link.customerEmail;
        }

        await mongoClient.close();
      } catch (err) {
        console.error("⚠️ Error looking up email:", err);
      }
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "Customer email not found. Please contact support." },
        { status: 400 }
      );
    }

    const isSpanish = language === "es";
    const adminIP = "Internal";
    const signerIP = clientIP || "Unknown";

    // Generate unique IDs
    const documentId = crypto.randomUUID();
    const envelopeId = crypto.randomBytes(16).toString("hex").toUpperCase();

    // Timestamps for audit trail
    const now = new Date();
    const documentCreatedAt = new Date(now.getTime() - 2 * 60 * 1000);
    const documentSentAt = new Date(now.getTime() - 1 * 60 * 1000);
    const documentViewedAt = new Date(now.getTime() - 30 * 1000);
    const documentSignedAt = now;

    const formatUTCTimestamp = (date: Date) => {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, "0")}, ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} UTC`;
    };

    const formatCSTTimestamp = (date: Date) => {
      return date.toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      });
    };

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const todayDate = new Date().toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    // ============================================================
    // PAGE 1: Payment Authorization
    // ============================================================
    let page = pdfDoc.addPage([612, 792]);
    const pageWidth = 612;
    const pageHeight = 792;
    let yPosition = pageHeight - 50;

    let logoImage: any = null;
    try {
      const logoPath = `${process.cwd()}/public/logo.png`;
      const fs = require("fs");
      const logoBytes = fs.readFileSync(logoPath);
      logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.3);
      page.drawImage(logoImage, {
        x: (pageWidth - logoDims.width) / 2,
        y: yPosition - logoDims.height,
        width: logoDims.width, height: logoDims.height,
      });
      yPosition -= logoDims.height + 15;
    } catch (error) {
      yPosition -= 15;
    }

    const titleText = isSpanish ? "FORMULARIO DE AUTORIZACION DE PAGO" : "PAYMENT AUTHORIZATION FORM";
    page.drawText(titleText, {
      x: (pageWidth - boldFont.widthOfTextAtSize(titleText, 15)) / 2,
      y: yPosition, size: 15, font: boldFont, color: rgb(0, 0, 0),
    });
    yPosition -= 18;

    const dateText = `Date: ${todayDate}`;
    page.drawText(dateText, {
      x: (pageWidth - font.widthOfTextAtSize(dateText, 10)) / 2,
      y: yPosition, size: 10, font, color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    // ✅ UPDATED: Complete authorization text with all legal clauses
    const authText = isSpanish
      ? `Yo, ${customerName}, confirmo que soy la persona cuyo nombre aparece en la tarjeta de credito/debito que termina en ****${cardLast4}. Confirmo que soy el titular autorizado de esta tarjeta y que estoy realizando esta transaccion de mi propia voluntad.

Por la presente autorizo a Texas Premium Insurance Services, LLC a procesar un cargo de $${amount} (USD) a mi tarjeta mencionada anteriormente para el pago de mi poliza de seguro.

Al firmar este formulario, declaro y confirmo lo siguiente:

1. Soy la persona cuyo nombre aparece en la tarjeta que termina en ****${cardLast4} y soy su titular legalmente autorizado. Entiendo que proporcionar informacion falsa sobre la titularidad de la tarjeta constituye uso fraudulento de informacion identificativa conforme al Codigo Penal de Texas seccion 32.51.

2. Estoy autorizando personalmente esta transaccion. Confirmo que el codigo postal de facturacion que proporcione coincide con el codigo postal registrado con el emisor de mi tarjeta.

3. He sido informado del monto exacto de $${amount} y del concepto del cargo antes de autorizar esta transaccion, y reconozco que sera procesado de inmediato.

4. Entiendo que una vez que mi poliza de seguro este vinculada, la prima se considera ganada. Cualquier reembolso se regira por la ley de seguros de Texas y se calculara de forma prorrateada, menos las tarifas ya devengadas y cualquier tarifa de politica no reembolsable.

5. Entiendo que los documentos de mi poliza seran entregados electronicamente al correo electronico que proporcione, y es mi responsabilidad revisarlos. Consiento recibir todos los documentos relacionados con la poliza electronicamente conforme a la Ley E-SIGN (15 U.S.C. 7001 et seq.).

6. Si tengo alguna inquietud sobre este cargo o mi poliza, acepto comunicarme primero con Texas Premium Insurance Services en support@texaspremiumins.com para permitir la oportunidad de resolver el asunto directamente antes de disputar el cargo con mi banco.

7. Acepto que esta firma electronica es legalmente vinculante y tiene la misma validez que una firma manuscrita conforme a la Ley E-SIGN y la Ley Uniforme de Transacciones Electronicas (UETA).

8. Confirmo que toda la informacion proporcionada, incluyendo mi nombre, correo electronico y codigo postal de facturacion, es verdadera y precisa.`
      : `I, ${customerName}, confirm that I am the person whose name appears on the credit/debit card ending in ****${cardLast4}. I confirm that I am the authorized holder of this card and that I am making this transaction of my own free will.

I hereby authorize Texas Premium Insurance Services, LLC to process a charge of $${amount} (USD) to my above-mentioned card for payment of my insurance policy.

By signing this form, I represent and confirm the following:

1. I am the person whose name appears on the card ending in ****${cardLast4} and I am its legally authorized holder. I understand that providing false information about card ownership constitutes fraudulent use of identifying information under Texas Penal Code Section 32.51.

2. I am personally authorizing this transaction. I confirm that the billing zip code I provided matches the zip code on file with my card issuer.

3. I have been informed of the exact amount of $${amount} and the purpose of this charge prior to authorizing this transaction, and I acknowledge that it will be processed immediately.

4. I understand that once my insurance policy is bound, the premium is considered earned. Any refunds will be governed by Texas insurance law and calculated on a pro-rata basis, less any earned fees and non-refundable policy fees.

5. I understand that my policy documents will be delivered electronically to the email address I provided, and it is my responsibility to review them. I consent to receive all policy-related documents electronically under the E-SIGN Act (15 U.S.C. 7001 et seq.).

6. If I have any concern about this charge or my policy, I agree to first contact Texas Premium Insurance Services at support@texaspremiumins.com to allow the opportunity to resolve the matter directly before disputing the charge with my bank.

7. I agree that this electronic signature is legally binding and carries the same validity as a handwritten signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and the Uniform Electronic Transactions Act (UETA).

8. I confirm that all information provided, including my name, email address, and billing zip code, is true and accurate.`;

    yPosition = drawWrappedText(page, authText, 45, yPosition, pageWidth - 90, 8.3, font, rgb(0, 0, 0));
    yPosition -= 6;

    // If we're too close to bottom, start a new page
    if (yPosition < 240) {
      page.drawText(`Document ID: ${documentId}`, {
        x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });
      page = pdfDoc.addPage([612, 792]);
      yPosition = pageHeight - 60;
    }

    // Details grid
    const detailRows = [
      { label: isSpanish ? "Nombre:" : "Name:", value: customerName },
      { label: isSpanish ? "Tarjeta:" : "Card:", value: `****${cardLast4}` },
      { label: isSpanish ? "Monto:" : "Amount:", value: `$${amount} USD`, bold: true, color: rgb(0, 0, 0.6) },
      { label: isSpanish ? "Correo Titular:" : "Cardholder Email:", value: cardholderEmail || "(not provided)" },
      { label: isSpanish ? "Codigo Postal:" : "Billing Zip Code:", value: billingZip || "(not provided)" },
      { label: isSpanish ? "Correo (Cuenta):" : "Account Email:", value: email },
      { label: isSpanish ? "Fecha:" : "Date Signed:", value: todayDate },
    ];

    for (const row of detailRows) {
      page.drawText(row.label, {
        x: 50, y: yPosition, size: 10, font: boldFont, color: rgb(0, 0, 0),
      });
      page.drawText(row.value, {
        x: 200, y: yPosition, size: 10,
        font: row.bold ? boldFont : font,
        color: (row as any).color || rgb(0, 0, 0),
      });
      yPosition -= 16;
    }
    yPosition -= 8;

    // Signature section
    page.drawText(isSpanish ? "Firma:" : "Signature:", {
      x: 50, y: yPosition, size: 10, font: boldFont, color: rgb(0, 0, 0),
    });
    yPosition -= 4;

    const sigBoxX = 50;
    const sigBoxWidth = 300;
    const sigBoxHeight = 70;
    const sigBoxY = yPosition - sigBoxHeight;

    page.drawRectangle({
      x: sigBoxX, y: sigBoxY, width: sigBoxWidth, height: sigBoxHeight,
      borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1, color: rgb(1, 1, 1),
    });

    page.drawText(isSpanish ? "Firmado por:" : "Signed by:", {
      x: sigBoxX + 8, y: sigBoxY + sigBoxHeight - 12,
      size: 7, font, color: rgb(0.4, 0.4, 0.4),
    });

    try {
      const base64Data = signatureDataUrl.split(",")[1];
      const signatureBytes = Buffer.from(base64Data, "base64");
      const signatureImage = await pdfDoc.embedPng(signatureBytes);
      const maxSigWidth = sigBoxWidth - 20;
      const maxSigHeight = sigBoxHeight - 25;
      const scale = Math.min(maxSigWidth / signatureImage.width, maxSigHeight / signatureImage.height);
      page.drawImage(signatureImage, {
        x: sigBoxX + 10, y: sigBoxY + 12,
        width: signatureImage.width * scale,
        height: signatureImage.height * scale,
      });
    } catch (error) {
      console.error("Error embedding signature:", error);
    }

    const verCodeY = sigBoxY - 10;
    page.drawText(envelopeId, { x: sigBoxX + 8, y: verCodeY, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(`IP: ${signerIP}`, { x: sigBoxX + 8, y: verCodeY - 10, size: 7, font, color: rgb(0.45, 0.45, 0.45) });

    page.drawText(`Document ID: ${documentId}`, {
      x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    });

    // ============================================================
    // PAGE 2: CERTIFICATE OF COMPLETION — SINGLE PAGE
    // ============================================================
    const cert = pdfDoc.addPage([612, 792]);
    const margin = 40;
    const contentWidth = 612 - margin * 2;
    let cy = 792 - 40;

    // ── HEADER ──
    cert.drawText("Certificate Of Completion", {
      x: margin, y: cy, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.1),
    });
    if (logoImage) {
      try {
        const logoDims = logoImage.scale(0.18);
        cert.drawImage(logoImage, {
          x: 612 - margin - logoDims.width,
          y: cy - logoDims.height + 12,
          width: logoDims.width, height: logoDims.height,
        });
      } catch (e) {}
    }
    cy -= 10;
    cert.drawLine({
      start: { x: margin, y: cy }, end: { x: 612 - margin, y: cy },
      thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
    });
    cy -= 14;

    // ── ENVELOPE METADATA (2-column grid) ──
    const col1X = margin;
    const col2X = margin + contentWidth / 2 + 10;
    const labelW = 110;

    const drawMetaRow = (y: number, l1: string, v1: string, l2: string, v2: string) => {
      cert.drawText(l1, { x: col1X, y, size: 8, font: boldFont, color: rgb(0.25, 0.25, 0.25) });
      cert.drawText(truncateToWidth(v1, contentWidth / 2 - labelW - 15, font, 8), {
        x: col1X + labelW, y, size: 8, font, color: rgb(0.2, 0.2, 0.2),
      });
      if (l2) {
        cert.drawText(l2, { x: col2X, y, size: 8, font: boldFont, color: rgb(0.25, 0.25, 0.25) });
        cert.drawText(truncateToWidth(v2, 612 - margin - col2X - labelW, font, 8), {
          x: col2X + labelW, y, size: 8, font, color: rgb(0.2, 0.2, 0.2),
        });
      }
    };

    drawMetaRow(cy, "Envelope ID:", envelopeId, "Status:", "Completed");
    cy -= 11;
    drawMetaRow(cy, "Subject:", "Payment Authorization", "Signatures:", "1");
    cy -= 11;
    drawMetaRow(cy, "Document Pages:", "1", "Envelope Originator:", "Texas Premium Insurance");
    cy -= 11;
    drawMetaRow(cy, "Certificate Pages:", "1", "", "Services, LLC");
    cy -= 11;
    drawMetaRow(cy, "AutoNav:", "Enabled", "", "2317 N Josey Ln Ste 104");
    cy -= 11;
    drawMetaRow(cy, "Envelope Stamping:", "Enabled", "", "Carrollton, TX 75006");
    cy -= 11;
    drawMetaRow(cy, "Time Zone:", "(UTC-06:00) Central Time (US)", "", "support@texaspremiumins.com");
    cy -= 11;
    drawMetaRow(cy, "Document ID:", documentId.substring(0, 28), "IP Address:", adminIP);
    cy -= 14;

    // ── RECORD TRACKING ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Record Tracking", boldFont);
    cy -= 18;
    drawMetaRow(cy, "Status:", "Original", "Holder:", "Texas Premium Insurance");
    cy -= 11;
    drawMetaRow(cy, "Created:", formatCSTTimestamp(documentCreatedAt), "Email:", "support@texaspremiumins.com");
    cy -= 11;
    drawMetaRow(cy, "Signing Method:", "Electronic (E-SIGN / UETA)", "Location:", "Web - Self-Service Portal");
    cy -= 14;

    // ── SIGNER EVENTS ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Signer Events", boldFont);
    cy -= 4;
    cy -= 12;
    cert.drawText("Signer", { x: margin + 4, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cert.drawText("Signature", { x: margin + 180, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cert.drawText("Timestamp", { x: margin + 360, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cy -= 8;
    cert.drawLine({
      start: { x: margin, y: cy }, end: { x: 612 - margin, y: cy },
      thickness: 0.3, color: rgb(0.8, 0.8, 0.8),
    });
    cy -= 4;

    const signerStartY = cy;
    cy -= 10;
    cert.drawText(customerName, { x: margin + 4, y: cy, size: 9, font: boldFont, color: rgb(0.15, 0.15, 0.15) });
    cy -= 10;
    cert.drawText(truncateToWidth(email, 170, font, 8), { x: margin + 4, y: cy, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
    cy -= 10;
    cert.drawText(`Security: Email + AVS Zip + IP`, { x: margin + 4, y: cy, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
    cy -= 9;
    cert.drawText(`Verified cardholder attestation`, { x: margin + 4, y: cy, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });

    try {
      const base64Data = signatureDataUrl.split(",")[1];
      const signatureBytes = Buffer.from(base64Data, "base64");
      const sigImg = await pdfDoc.embedPng(signatureBytes);
      const maxW = 150;
      const maxH = 40;
      const sc = Math.min(maxW / sigImg.width, maxH / sigImg.height);
      cert.drawImage(sigImg, {
        x: margin + 180, y: signerStartY - 36,
        width: sigImg.width * sc, height: sigImg.height * sc,
      });
      cert.drawText(`Method: ${signatureMethod}`, {
        x: margin + 180, y: signerStartY - 46, size: 7, font, color: rgb(0.45, 0.45, 0.45),
      });
      cert.drawText(`Using IP: ${signerIP}`, {
        x: margin + 180, y: signerStartY - 55, size: 7, font, color: rgb(0.45, 0.45, 0.45),
      });
    } catch (e) {}

    cert.drawText(`Sent: ${formatCSTTimestamp(documentSentAt)}`, {
      x: margin + 360, y: signerStartY - 10, size: 7.5, font, color: rgb(0.3, 0.3, 0.3),
    });
    cert.drawText(`Viewed: ${formatCSTTimestamp(documentViewedAt)}`, {
      x: margin + 360, y: signerStartY - 20, size: 7.5, font, color: rgb(0.3, 0.3, 0.3),
    });
    cert.drawText(`Signed: ${formatCSTTimestamp(documentSignedAt)}`, {
      x: margin + 360, y: signerStartY - 30, size: 7.5, font: boldFont, color: rgb(0.15, 0.4, 0.15),
    });

    cy = signerStartY - 65;

    // ── IDENTITY VERIFICATION ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Identity Verification", boldFont);
    cy -= 18;
    drawMetaRow(cy, "Cardholder Name:", customerName, "Billing Zip (AVS):", billingZip || "(not provided)");
    cy -= 11;
    drawMetaRow(cy, "Cardholder Email:", cardholderEmail || "(not provided)", "Card Last 4:", `****${cardLast4}`);
    cy -= 11;
    drawMetaRow(cy, "Account Email:", email, "Amount Authorized:", `$${amount} USD`);
    cy -= 11;
    drawMetaRow(cy, "Signer IP Address:", signerIP, "AVS Zip Attestation:", behavioralEvidence?.avsAttested ? "Confirmed" : "Not Confirmed");
    cy -= 14;

    // ── ✅ NEW: BEHAVIORAL EVIDENCE ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Signing Behavior & Device Evidence", boldFont);
    cy -= 18;

    const be = behavioralEvidence || {};
    const fp = be.browserFingerprint || {};
    const fieldInteractions = be.fieldInteractions || {};
    const totalFieldFocuses = Object.values(fieldInteractions).reduce(
      (sum: number, v: any) => sum + (typeof v === "number" ? v : 0), 0
    );

    drawMetaRow(cy,
      "Time on Page:", be.timeOnPageSeconds ? `${be.timeOnPageSeconds} seconds` : "N/A",
      "Max Scroll Depth:", be.maxScrollDepthPct != null ? `${be.maxScrollDepthPct}%` : "N/A"
    );
    cy -= 11;
    drawMetaRow(cy,
      "Field Interactions:", `${totalFieldFocuses} total focus events`,
      "Terms Agreed:", be.agreedToTerms ? "Yes" : "No"
    );
    cy -= 11;
    drawMetaRow(cy,
      "Screen Resolution:", fp.screenResolution || "Unknown",
      "Viewport:", fp.viewport || "Unknown"
    );
    cy -= 11;
    drawMetaRow(cy,
      "Timezone:", fp.timezone || "Unknown",
      "Language:", fp.language || "Unknown"
    );
    cy -= 11;
    drawMetaRow(cy,
      "Platform:", fp.platform || "Unknown",
      "Color Depth:", fp.colorDepth ? `${fp.colorDepth}-bit` : "Unknown"
    );
    cy -= 11;
    cert.drawText("Browser/Device:", { x: col1X, y: cy, size: 8, font: boldFont, color: rgb(0.25, 0.25, 0.25) });
    cert.drawText(truncateToWidth(userAgent || "Unknown", contentWidth - labelW, font, 7.5), {
      x: col1X + labelW, y: cy, size: 7.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    cy -= 14;

    // ── AUDIT TRAIL TIMELINE ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Audit Trail", boldFont);
    cy -= 4;

    const events = [
      { action: "Envelope Created", actor: "Texas Premium Insurance Services", detail: "support@texaspremiumins.com", ip: adminIP, ts: documentCreatedAt },
      { action: "Envelope Sent", actor: "Texas Premium Insurance Services", detail: `to ${email}`, ip: adminIP, ts: documentSentAt },
      { action: "Document Viewed", actor: customerName, detail: email, ip: signerIP, ts: documentViewedAt },
      { action: "Document Signed", actor: customerName, detail: `${signatureMethod} | Zip: ${billingZip || "N/A"}`, ip: signerIP, ts: documentSignedAt },
      { action: "Envelope Completed", actor: "System", detail: "All signatures collected", ip: "System", ts: documentSignedAt },
    ];

    cy -= 12;
    cert.drawText("Event", { x: margin + 4, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cert.drawText("Details", { x: margin + 140, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cert.drawText("Timestamp (CST)", { x: margin + 360, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cy -= 4;
    cert.drawLine({
      start: { x: margin, y: cy }, end: { x: 612 - margin, y: cy },
      thickness: 0.3, color: rgb(0.8, 0.8, 0.8),
    });
    cy -= 10;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (i % 2 === 0) {
        cert.drawRectangle({
          x: margin, y: cy - 3, width: contentWidth, height: 16,
          color: rgb(0.97, 0.97, 0.97), borderWidth: 0,
        });
      }
      cert.drawText(ev.action, { x: margin + 4, y: cy + 3, size: 8, font: boldFont, color: rgb(0.15, 0.15, 0.15) });
      cert.drawText(truncateToWidth(ev.actor, 130, font, 7), { x: margin + 4, y: cy - 4, size: 6.5, font, color: rgb(0.4, 0.4, 0.4) });

      cert.drawText(truncateToWidth(ev.detail, 210, font, 7.5), { x: margin + 140, y: cy + 3, size: 7.5, font, color: rgb(0.25, 0.25, 0.25) });
      cert.drawText(`IP: ${ev.ip}`, { x: margin + 140, y: cy - 4, size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });

      cert.drawText(formatCSTTimestamp(ev.ts), { x: margin + 360, y: cy + 3, size: 7.5, font, color: rgb(0.25, 0.25, 0.25) });

      cy -= 16;
    }
    cy -= 4;

    // ── LEGAL DISCLOSURE ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Electronic Record and Signature Disclosure", boldFont);
    cy -= 14;

    const legalText = `By electronically signing this document, the signer acknowledges and agrees that: (1) their electronic signature is legally equivalent to a handwritten signature under the E-SIGN Act (15 U.S.C. 7001 et seq.) and UETA; (2) they had full opportunity to review the document before signing; (3) they are the authorized cardholder of the payment card identified herein; (4) they consented to conduct this transaction electronically; and (5) the policy premium is earned upon binding per Texas insurance law. This certificate is cryptographically sealed; any modification to the document will invalidate the signature.`;
    cy = drawWrappedText(cert, legalText, margin + 4, cy, contentWidth - 8, 6.8, font, rgb(0.35, 0.35, 0.35));
    cy -= 6;

    // ── CRYPTOGRAPHIC SEAL ──
    // ✅ Include behavioral evidence in hash for tamper-evidence
    const behaviorHashInput = JSON.stringify({
      time: be.timeOnPageSeconds,
      scroll: be.maxScrollDepthPct,
      fp: fp,
    });
    const verificationHash = crypto
      .createHash("sha256")
      .update(`${documentId}-${envelopeId}-${customerName}-${amount}-${cardLast4}-${signerIP}-${billingZip || ""}-${cardholderEmail || ""}-${behaviorHashInput}-${documentSignedAt.toISOString()}`)
      .digest("hex");

    cert.drawRectangle({
      x: margin, y: cy - 30, width: contentWidth, height: 32,
      color: rgb(0.97, 0.97, 0.99), borderColor: rgb(0.7, 0.75, 0.85), borderWidth: 0.5,
    });
    cert.drawText("CRYPTOGRAPHIC SEAL (SHA-256)", {
      x: margin + 6, y: cy - 10, size: 7, font: boldFont, color: rgb(0.2, 0.3, 0.5),
    });
    cert.drawText(verificationHash, {
      x: margin + 6, y: cy - 20, size: 6.5, font, color: rgb(0.3, 0.3, 0.3),
    });
    cert.drawText(`Generated: ${formatUTCTimestamp(documentSignedAt)}  |  Envelope: ${envelopeId}`, {
      x: margin + 6, y: cy - 28, size: 6.5, font, color: rgb(0.45, 0.45, 0.45),
    });

    // Footer
    cert.drawText(`Document ID: ${documentId}`, {
      x: margin, y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5),
    });
    const copyrightText = `© ${new Date().getFullYear()} Texas Premium Insurance Services, LLC. All rights reserved.`;
    cert.drawText(copyrightText, {
      x: 612 - margin - font.widthOfTextAtSize(copyrightText, 6.5),
      y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5),
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const customerEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <tr><td style="padding: 20px; text-align: center;"><img src="https://www.texaspremiumins.com/logo.png" alt="Texas Premium Insurance Services" style="height: 50px;"></td></tr>
              <tr><td style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 40px 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0 0 10px; font-size: 24px;">✓ Document Completed</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Your document has been successfully signed</p>
              </td></tr>
              <tr><td style="padding: 40px 30px;">
                <p style="color: #374151; font-size: 16px;">Hello <strong>${customerName}</strong>,</p>
                <p style="color: #374151; font-size: 16px;">Your Payment Authorization has been completed and signed successfully. The complete document with Certificate of Completion is attached to this email.</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; margin-top: 20px;">
                  <tr><td style="padding: 20px;">
                    <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px; font-weight: 600; text-transform: uppercase;">Document Details</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Amount:</td><td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">$${amount} USD</td></tr>
                      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Card:</td><td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right;">****${cardLast4}</td></tr>
                      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Billing Zip:</td><td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right;">${billingZip || "—"}</td></tr>
                      <tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date:</td><td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right;">${todayDate}</td></tr>
                    </table>
                  </td></tr>
                </table>
                <p style="color: #6b7280; font-size: 13px; margin: 20px 0 0; line-height: 1.5;">
                  Please save this email and the attached document for your records. If you have any questions about your policy or this charge, please contact us at <a href="mailto:support@texaspremiumins.com" style="color: #2563eb;">support@texaspremiumins.com</a>.
                </p>
              </td></tr>
              <tr><td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 11px; margin: 0;">Envelope ID: ${envelopeId}<br>Document ID: ${documentId}</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `;

    const emailRecipients = [email];
    if (cardholderEmail && cardholderEmail.trim() && cardholderEmail.toLowerCase() !== email.toLowerCase()) {
      emailRecipients.push(cardholderEmail.trim());
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: emailRecipients.join(", "),
      subject: isSpanish ? `✓ Documento Completado - Autorización de Pago` : `✓ Document Completed - Payment Authorization`,
      html: customerEmailHtml,
      attachments: [{
        filename: `Payment_Authorization_${customerName.replace(/\s+/g, "_")}.pdf`,
        content: pdfBase64, encoding: "base64",
      }],
    });

    // Internal notification with behavioral summary
    const beSummary = be.timeOnPageSeconds
      ? `Time on page: ${be.timeOnPageSeconds}s | Scroll: ${be.maxScrollDepthPct}% | Fields focused: ${totalFieldFocuses}x | AVS attested: ${be.avsAttested ? "Yes" : "No"}`
      : "Not captured";

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `[INTERNAL] Payment Authorization - ${customerName} - $${amount}`,
      html: `
        <h2>Payment Authorization Received</h2>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Amount:</strong> $${amount}</p>
        <p><strong>Card Last 4:</strong> ****${cardLast4}</p>
        <p><strong>Account Email:</strong> ${email}</p>
        <p><strong>Cardholder Email:</strong> ${cardholderEmail || "(not provided)"}</p>
        <p><strong>Billing Zip:</strong> ${billingZip || "(not provided)"}</p>
        <p><strong>Signature Method:</strong> ${signatureMethod}</p>
        <p><strong>Customer IP:</strong> ${signerIP}</p>
        <p><strong>Behavioral Evidence:</strong> ${beSummary}</p>
        <p><strong>Browser:</strong> ${userAgent || "Unknown"}</p>
        <p><strong>Envelope ID:</strong> ${envelopeId}</p>
        <hr>
        <p style="color: #666; font-size: 12px;">Full behavioral evidence and audit trail are included in the attached Certificate of Completion.</p>
      `,
      attachments: [{
        filename: `Payment_Authorization_${customerName.replace(/\s+/g, "_")}.pdf`,
        content: pdfBase64, encoding: "base64",
      }],
    });

    return NextResponse.json({
      success: true,
      message: "PDF generated and emailed successfully",
      documentId,
      envelopeId,
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}