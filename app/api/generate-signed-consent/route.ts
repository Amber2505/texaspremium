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
  color: any,
  lineSpacing = 3
): number {
  const paragraphs = text.split("\n");
  let currentY = y;

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      currentY -= fontSize + lineSpacing;
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
        currentY -= fontSize + lineSpacing;
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.trim().length > 0) {
      page.drawText(currentLine.trim(), {
        x, y: currentY, size: fontSize, font: fontObj, color,
      });
      currentY -= fontSize + lineSpacing;
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

// Helper: draw a two-column metadata row
function drawMetaRow(
  page: PDFPage,
  y: number,
  l1: string, v1: string,
  l2: string, v2: string,
  col1X: number, col2X: number,
  labelW: number, margin: number,
  font: PDFFont, boldFont: PDFFont,
  contentWidth: number
) {
  page.drawText(l1, { x: col1X, y, size: 8, font: boldFont, color: rgb(0.25, 0.25, 0.25) });
  page.drawText(truncateToWidth(v1, contentWidth / 2 - labelW - 15, font, 8), {
    x: col1X + labelW, y, size: 8, font, color: rgb(0.2, 0.2, 0.2),
  });
  if (l2) {
    page.drawText(l2, { x: col2X, y, size: 8, font: boldFont, color: rgb(0.25, 0.25, 0.25) });
    page.drawText(truncateToWidth(v2, 612 - margin - col2X - labelW, font, 8), {
      x: col2X + labelW, y, size: 8, font, color: rgb(0.2, 0.2, 0.2),
    });
  }
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
      behavioralEvidence,
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

    const pageWidth = 612;
    const pageHeight = 792;

    // ============================================================
    // PAGE 1: Payment Authorization — compact, all on one page
    // ============================================================
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - 36; // tighter top margin

    // --- Logo (smaller) ---
    let logoImage: any = null;
    try {
      const logoPath = `${process.cwd()}/public/logo.png`;
      const fs = require("fs");
      const logoBytes = fs.readFileSync(logoPath);
      logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.22); // smaller scale
      page.drawImage(logoImage, {
        x: (pageWidth - logoDims.width) / 2,
        y: yPosition - logoDims.height,
        width: logoDims.width, height: logoDims.height,
      });
      yPosition -= logoDims.height + 8; // tighter gap
    } catch (error) {
      yPosition -= 8;
    }

    // --- Title ---
    const titleText = isSpanish ? "FORMULARIO DE AUTORIZACION DE PAGO" : "PAYMENT AUTHORIZATION FORM";
    page.drawText(titleText, {
      x: (pageWidth - boldFont.widthOfTextAtSize(titleText, 13)) / 2,
      y: yPosition, size: 13, font: boldFont, color: rgb(0, 0, 0),
    });
    yPosition -= 14;

    const dateText = `Date: ${todayDate}`;
    page.drawText(dateText, {
      x: (pageWidth - font.widthOfTextAtSize(dateText, 9)) / 2,
      y: yPosition, size: 9, font, color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 14;

    // Thin divider
    page.drawLine({
      start: { x: 45, y: yPosition }, end: { x: pageWidth - 45, y: yPosition },
      thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
    });
    yPosition -= 10;

    // --- Auth text (compact font & line spacing) ---
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

    // Use fontSize 8.0 with tight line spacing to keep compact
    yPosition = drawWrappedText(page, authText, 45, yPosition, pageWidth - 90, 8.0, font, rgb(0, 0, 0), 2.5);
    yPosition -= 8;

    // Divider before details
    page.drawLine({
      start: { x: 45, y: yPosition }, end: { x: pageWidth - 45, y: yPosition },
      thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
    });
    yPosition -= 10;

    // --- Details grid (2-column layout to save vertical space) ---
    const leftX = 45;
    const midX = 310;
    const labelWidth = 110;
    const rowH = 13; // compact row height

    const col1Rows = [
      { label: isSpanish ? "Nombre:" : "Name:", value: customerName },
      { label: isSpanish ? "Tarjeta:" : "Card:", value: `****${cardLast4}` },
      { label: isSpanish ? "Monto:" : "Amount:", value: `$${amount} USD`, bold: true, blue: true },
      { label: isSpanish ? "Fecha:" : "Date Signed:", value: todayDate },
    ];
    const col2Rows = [
      { label: isSpanish ? "Correo Titular:" : "Cardholder Email:", value: cardholderEmail || "(not provided)" },
      { label: isSpanish ? "Codigo Postal:" : "Billing Zip:", value: billingZip || "(not provided)" },
      { label: isSpanish ? "Correo (Cuenta):" : "Account Email:", value: email },
    ];

    const maxRows = Math.max(col1Rows.length, col2Rows.length);
    for (let i = 0; i < maxRows; i++) {
      const rowY = yPosition - i * rowH;

      if (col1Rows[i]) {
        page.drawText(col1Rows[i].label, {
          x: leftX, y: rowY, size: 9, font: boldFont, color: rgb(0, 0, 0),
        });
        page.drawText(col1Rows[i].value, {
          x: leftX + labelWidth, y: rowY, size: 9,
          font: (col1Rows[i] as any).bold ? boldFont : font,
          color: (col1Rows[i] as any).blue ? rgb(0, 0, 0.6) : rgb(0, 0, 0),
        });
      }

      if (col2Rows[i]) {
        page.drawText(col2Rows[i].label, {
          x: midX, y: rowY, size: 9, font: boldFont, color: rgb(0, 0, 0),
        });
        const val2 = truncateToWidth(col2Rows[i].value, pageWidth - 45 - midX - 90, font, 9);
        page.drawText(val2, {
          x: midX + labelWidth - 10, y: rowY, size: 9, font, color: rgb(0, 0, 0),
        });
      }
    }
    yPosition -= maxRows * rowH + 10;

    // Divider before signature
    page.drawLine({
      start: { x: 45, y: yPosition }, end: { x: pageWidth - 45, y: yPosition },
      thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
    });
    yPosition -= 10;

    // --- Signature section ---
    page.drawText(isSpanish ? "Firma:" : "Signature:", {
      x: leftX, y: yPosition, size: 9, font: boldFont, color: rgb(0, 0, 0),
    });
    yPosition -= 4;

    const sigBoxX = leftX;
    const sigBoxWidth = 320;
    const sigBoxHeight = 80;
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
        x: sigBoxX + 10, y: sigBoxY + 10,
        width: signatureImage.width * scale,
        height: signatureImage.height * scale,
      });
    } catch (error) {
      console.error("Error embedding signature:", error);
    }

    // Envelope ID and IP to the right of the sig box
    const infoX = sigBoxX + sigBoxWidth + 16;
    page.drawText(`Envelope ID:`, { x: infoX, y: sigBoxY + sigBoxHeight - 10, size: 7, font: boldFont, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(envelopeId, { x: infoX, y: sigBoxY + sigBoxHeight - 20, size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(`IP: ${signerIP}`, { x: infoX, y: sigBoxY + sigBoxHeight - 30, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(`Signed: ${formatCSTTimestamp(documentSignedAt)}`, { x: infoX, y: sigBoxY + sigBoxHeight - 40, size: 7, font, color: rgb(0.45, 0.45, 0.45) });

    // Document ID footer
    page.drawText(`Document ID: ${documentId}`, {
      x: 45, y: 22, size: 7.5, font, color: rgb(0.5, 0.5, 0.5),
    });
    const copyright1 = `© ${new Date().getFullYear()} Texas Premium Insurance Services, LLC. All rights reserved.`;
    page.drawText(copyright1, {
      x: pageWidth - 45 - font.widthOfTextAtSize(copyright1, 7),
      y: 22, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });

    // ============================================================
    // PAGE 2: CERTIFICATE OF COMPLETION
    // ============================================================
    const cert = pdfDoc.addPage([pageWidth, pageHeight]);
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    const col1X = margin;
    const col2X = margin + contentWidth / 2 + 10;
    const labelW = 110;
    let cy = pageHeight - 36;

    // ── HEADER ──
    // Draw title on the left
    cert.drawText("Certificate Of Completion", {
      x: margin, y: cy, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.1),
    });
    // Draw logo on the right, vertically centered with the title
    if (logoImage) {
      try {
        const logoDims = logoImage.scale(0.14);
        cert.drawImage(logoImage, {
          x: pageWidth - margin - logoDims.width,
          y: cy - (logoDims.height - 14) / 2,
          width: logoDims.width, height: logoDims.height,
        });
        // Push cy down enough so the divider clears the logo
        cy -= Math.max(logoDims.height + 4, 20);
      } catch (e) {
        cy -= 20;
      }
    } else {
      cy -= 20;
    }
    cert.drawLine({
      start: { x: margin, y: cy }, end: { x: pageWidth - margin, y: cy },
      thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
    });
    cy -= 14;

    // Helper scoped to cert page
    const certMetaRow = (y: number, l1: string, v1: string, l2: string, v2: string) => {
      drawMetaRow(cert, y, l1, v1, l2, v2, col1X, col2X, labelW, margin, font, boldFont, contentWidth);
    };

    // ── ENVELOPE METADATA ──
    certMetaRow(cy, "Envelope ID:", envelopeId, "Status:", "Completed");
    cy -= 12;
    certMetaRow(cy, "Subject:", "Payment Authorization", "Signatures:", "1");
    cy -= 12;
    certMetaRow(cy, "Document Pages:", "1", "Envelope Originator:", "Texas Premium Insurance");
    cy -= 12;
    certMetaRow(cy, "Certificate Pages:", "1", "", "Services, LLC");
    cy -= 12;
    certMetaRow(cy, "AutoNav:", "Enabled", "", "2317 N Josey Ln Ste 104");
    cy -= 12;
    certMetaRow(cy, "Envelope Stamping:", "Enabled", "", "Carrollton, TX 75006");
    cy -= 12;
    certMetaRow(cy, "Time Zone:", "(UTC-06:00) Central Time (US)", "", "support@texaspremiumins.com");
    cy -= 12;
    certMetaRow(cy, "Document ID:", documentId.substring(0, 28), "IP Address:", adminIP);
    cy -= 16;

    // ── RECORD TRACKING ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Record Tracking", boldFont);
    cy -= 20;
    certMetaRow(cy, "Status:", "Original", "Holder:", "Texas Premium Insurance");
    cy -= 12;
    certMetaRow(cy, "Created:", formatCSTTimestamp(documentCreatedAt), "Email:", "support@texaspremiumins.com");
    cy -= 12;
    certMetaRow(cy, "Signing Method:", "Electronic (E-SIGN / UETA)", "Location:", "Web - Self-Service Portal");
    cy -= 16;

    // ── SIGNER EVENTS ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Signer Events", boldFont);
    cy -= 16;

    // Column headers
    cert.drawText("Signer", { x: margin + 4, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cert.drawText("Signature", { x: margin + 190, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cert.drawText("Timestamp", { x: margin + 390, y: cy, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    cy -= 6;
    cert.drawLine({
      start: { x: margin, y: cy }, end: { x: pageWidth - margin, y: cy },
      thickness: 0.3, color: rgb(0.8, 0.8, 0.8),
    });
    cy -= 4;

    const signerStartY = cy;

    // Signer info (left column)
    cy -= 10;
    cert.drawText(customerName, { x: margin + 4, y: cy, size: 9, font: boldFont, color: rgb(0.15, 0.15, 0.15) });
    cy -= 11;
    cert.drawText(truncateToWidth(email, 175, font, 8), { x: margin + 4, y: cy, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
    cy -= 11;
    cert.drawText(`Security: Email + AVS Zip + IP`, { x: margin + 4, y: cy, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
    cy -= 10;
    cert.drawText(`Verified cardholder attestation`, { x: margin + 4, y: cy, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });

    // Signature image (middle column)
    try {
      const base64Data = signatureDataUrl.split(",")[1];
      const signatureBytes = Buffer.from(base64Data, "base64");
      const sigImg = await pdfDoc.embedPng(signatureBytes);
      const maxW = 150;
      const maxH = 38;
      const sc = Math.min(maxW / sigImg.width, maxH / sigImg.height);
      cert.drawImage(sigImg, {
        x: margin + 190, y: signerStartY - 40,
        width: sigImg.width * sc, height: sigImg.height * sc,
      });
      cert.drawText(`Method: ${signatureMethod}`, {
        x: margin + 190, y: signerStartY - 48, size: 7, font, color: rgb(0.45, 0.45, 0.45),
      });
      cert.drawText(`Using IP: ${signerIP}`, {
        x: margin + 190, y: signerStartY - 58, size: 7, font, color: rgb(0.45, 0.45, 0.45),
      });
    } catch (e) {}

    // Timestamps (right column)
    cert.drawText(`Sent: ${formatCSTTimestamp(documentSentAt)}`, {
      x: margin + 390, y: signerStartY - 12, size: 7.5, font, color: rgb(0.3, 0.3, 0.3),
    });
    cert.drawText(`Viewed: ${formatCSTTimestamp(documentViewedAt)}`, {
      x: margin + 390, y: signerStartY - 24, size: 7.5, font, color: rgb(0.3, 0.3, 0.3),
    });
    cert.drawText(`Signed: ${formatCSTTimestamp(documentSignedAt)}`, {
      x: margin + 390, y: signerStartY - 36, size: 7.5, font: boldFont, color: rgb(0.15, 0.4, 0.15),
    });

    cy = signerStartY - 72;

    // ── IDENTITY VERIFICATION ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Identity Verification", boldFont);
    cy -= 20;
    certMetaRow(cy, "Cardholder Name:", customerName, "Billing Zip (AVS):", billingZip || "(not provided)");
    cy -= 12;
    certMetaRow(cy, "Cardholder Email:", cardholderEmail || "(not provided)", "Card Last 4:", `****${cardLast4}`);
    cy -= 12;
    certMetaRow(cy, "Account Email:", email, "Amount Authorized:", `$${amount} USD`);
    cy -= 12;
    certMetaRow(cy, "Signer IP Address:", signerIP, "AVS Zip Attestation:", behavioralEvidence?.avsAttested ? "Confirmed" : "Not Confirmed");
    cy -= 16;

    // ── SIGNING BEHAVIOR & DEVICE EVIDENCE ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Signing Behavior & Device Evidence", boldFont);
    cy -= 20;

    const be = behavioralEvidence || {};
    const fp = be.browserFingerprint || {};
    const fieldInteractions = be.fieldInteractions || {};
    const totalFieldFocuses = Object.values(fieldInteractions).reduce(
      (sum: number, v: any) => sum + (typeof v === "number" ? v : 0), 0
    );

    certMetaRow(cy,
      "Time on Page:", be.timeOnPageSeconds ? `${be.timeOnPageSeconds} seconds` : "N/A",
      "Max Scroll Depth:", be.maxScrollDepthPct != null ? `${be.maxScrollDepthPct}%` : "N/A"
    );
    cy -= 12;
    certMetaRow(cy,
      "Field Interactions:", `${totalFieldFocuses} total focus events`,
      "Terms Agreed:", be.agreedToTerms ? "Yes" : "No"
    );
    cy -= 12;
    certMetaRow(cy,
      "Screen Resolution:", fp.screenResolution || "Unknown",
      "Viewport:", fp.viewport || "Unknown"
    );
    cy -= 12;
    certMetaRow(cy,
      "Timezone:", fp.timezone || "Unknown",
      "Language:", fp.language || "Unknown"
    );
    cy -= 12;
    certMetaRow(cy,
      "Platform:", fp.platform || "Unknown",
      "Color Depth:", fp.colorDepth ? `${fp.colorDepth}-bit` : "Unknown"
    );
    cy -= 12;
    cert.drawText("Browser/Device:", { x: col1X, y: cy, size: 8, font: boldFont, color: rgb(0.25, 0.25, 0.25) });
    cert.drawText(truncateToWidth(userAgent || "Unknown", contentWidth - labelW, font, 7.5), {
      x: col1X + labelW, y: cy, size: 7.5, font, color: rgb(0.2, 0.2, 0.2),
    });
    cy -= 16;

    // ── AUDIT TRAIL ──
    drawSectionHeader(cert, margin, cy, contentWidth, "Audit Trail", boldFont);
    cy -= 14;

    const events = [
      { action: "Envelope Created", actor: "Texas Premium Insurance Services", detail: "support@texaspremiumins.com", ip: adminIP, ts: documentCreatedAt },
      { action: "Envelope Sent", actor: "Texas Premium Insurance Services", detail: `to ${email}`, ip: adminIP, ts: documentSentAt },
      { action: "Document Viewed", actor: customerName, detail: email, ip: signerIP, ts: documentViewedAt },
      { action: "Document Signed", actor: customerName, detail: `${signatureMethod} | Zip: ${billingZip || "N/A"}`, ip: signerIP, ts: documentSignedAt },
      { action: "Envelope Completed", actor: "System", detail: "All signatures collected", ip: "System", ts: documentSignedAt },
    ];

    // Audit table headers
    cert.drawRectangle({
      x: margin, y: cy - 4, width: contentWidth, height: 14,
      color: rgb(0.88, 0.88, 0.88), borderWidth: 0,
    });
    cert.drawText("Event", { x: margin + 4, y: cy + 2, size: 7.5, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    cert.drawText("Actor / Details", { x: margin + 145, y: cy + 2, size: 7.5, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    cert.drawText("IP Address", { x: margin + 340, y: cy + 2, size: 7.5, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    cert.drawText("Timestamp (CST)", { x: margin + 420, y: cy + 2, size: 7.5, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    cy -= 16; // clear below the header bar before first row

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const rowHeight = 26; // taller rows so 2 lines of text don't overlap

      // Alternating background
      if (i % 2 === 0) {
        cert.drawRectangle({
          x: margin, y: cy - rowHeight + 8, width: contentWidth, height: rowHeight,
          color: rgb(0.97, 0.97, 0.97), borderWidth: 0,
        });
      }

      // Line 1: action name (bold) + detail + ip + timestamp — all at same top baseline
      const topY = cy + 6;
      const subY = cy - 4; // line 2: actor (sub-label)

      cert.drawText(ev.action, { x: margin + 4, y: topY, size: 8, font: boldFont, color: rgb(0.15, 0.15, 0.15) });
      cert.drawText(truncateToWidth(ev.actor, 135, font, 6.5), { x: margin + 4, y: subY, size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });

      cert.drawText(truncateToWidth(ev.detail, 185, font, 7.5), { x: margin + 145, y: topY, size: 7.5, font, color: rgb(0.25, 0.25, 0.25) });

      cert.drawText(truncateToWidth(ev.ip, 72, font, 7), { x: margin + 340, y: topY, size: 7, font, color: rgb(0.35, 0.35, 0.35) });

      cert.drawText(formatCSTTimestamp(ev.ts), { x: margin + 420, y: topY, size: 7, font, color: rgb(0.25, 0.25, 0.25) });

      cy -= rowHeight;
    }
    cy -= 10;

    // ── LEGAL DISCLOSURE ──
    // Check if we need a new page
    const legalText = `By electronically signing this document, the signer acknowledges and agrees that: (1) their electronic signature is legally equivalent to a handwritten signature under the E-SIGN Act (15 U.S.C. 7001 et seq.) and UETA; (2) they had full opportunity to review the document before signing; (3) they are the authorized cardholder of the payment card identified herein; (4) they consented to conduct this transaction electronically; and (5) the policy premium is earned upon binding per Texas insurance law. This certificate is cryptographically sealed; any modification to the document will invalidate the signature.`;

    // Estimate legal text height: ~6 lines at 7px + 2.5 spacing = ~58px
    // Crypto seal: ~48px. Section header: 20px. Footer: 30px. Total needed: ~156px
    const neededSpace = 170;

    if (cy < neededSpace + 30) {
      // Add footer to cert page and continue on page 3
      cert.drawText(`Document ID: ${documentId}`, {
        x: margin, y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5),
      });
      const cp = `© ${new Date().getFullYear()} Texas Premium Insurance Services, LLC. All rights reserved.`;
      cert.drawText(cp, {
        x: pageWidth - margin - font.widthOfTextAtSize(cp, 6.5),
        y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5),
      });

      // Page 3 for disclosure + seal
      const certP3 = pdfDoc.addPage([pageWidth, pageHeight]);
      cy = pageHeight - 50;

      drawSectionHeader(certP3, margin, cy, contentWidth, "Electronic Record and Signature Disclosure", boldFont);
      cy -= 14;
      cy = drawWrappedText(certP3, legalText, margin + 4, cy, contentWidth - 8, 7, font, rgb(0.35, 0.35, 0.35), 2.5);
      cy -= 12;

      // Crypto seal
      const behaviorHashInput = JSON.stringify({ time: be.timeOnPageSeconds, scroll: be.maxScrollDepthPct, fp });
      const verificationHash = crypto.createHash("sha256")
        .update(`${documentId}-${envelopeId}-${customerName}-${amount}-${cardLast4}-${signerIP}-${billingZip || ""}-${cardholderEmail || ""}-${behaviorHashInput}-${documentSignedAt.toISOString()}`)
        .digest("hex");

      certP3.drawRectangle({
        x: margin, y: cy - 36, width: contentWidth, height: 38,
        color: rgb(0.97, 0.97, 0.99), borderColor: rgb(0.7, 0.75, 0.85), borderWidth: 0.5,
      });
      certP3.drawText("CRYPTOGRAPHIC SEAL (SHA-256)", {
        x: margin + 6, y: cy - 10, size: 7.5, font: boldFont, color: rgb(0.2, 0.3, 0.5),
      });
      certP3.drawText(verificationHash, {
        x: margin + 6, y: cy - 22, size: 6.5, font, color: rgb(0.3, 0.3, 0.3),
      });
      certP3.drawText(`Generated: ${formatUTCTimestamp(documentSignedAt)}  |  Envelope: ${envelopeId}`, {
        x: margin + 6, y: cy - 32, size: 6.5, font, color: rgb(0.45, 0.45, 0.45),
      });

      certP3.drawText(`Document ID: ${documentId}`, { x: margin, y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5) });
      const cp3 = `© ${new Date().getFullYear()} Texas Premium Insurance Services, LLC. All rights reserved.`;
      certP3.drawText(cp3, {
        x: pageWidth - margin - font.widthOfTextAtSize(cp3, 6.5),
        y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5),
      });
    } else {
      // Everything fits on cert page
      drawSectionHeader(cert, margin, cy, contentWidth, "Electronic Record and Signature Disclosure", boldFont);
      cy -= 14;
      cy = drawWrappedText(cert, legalText, margin + 4, cy, contentWidth - 8, 7, font, rgb(0.35, 0.35, 0.35), 2.5);
      cy -= 12;

      const behaviorHashInput = JSON.stringify({ time: be.timeOnPageSeconds, scroll: be.maxScrollDepthPct, fp });
      const verificationHash = crypto.createHash("sha256")
        .update(`${documentId}-${envelopeId}-${customerName}-${amount}-${cardLast4}-${signerIP}-${billingZip || ""}-${cardholderEmail || ""}-${behaviorHashInput}-${documentSignedAt.toISOString()}`)
        .digest("hex");

      cert.drawRectangle({
        x: margin, y: cy - 36, width: contentWidth, height: 38,
        color: rgb(0.97, 0.97, 0.99), borderColor: rgb(0.7, 0.75, 0.85), borderWidth: 0.5,
      });
      cert.drawText("CRYPTOGRAPHIC SEAL (SHA-256)", {
        x: margin + 6, y: cy - 10, size: 7.5, font: boldFont, color: rgb(0.2, 0.3, 0.5),
      });
      cert.drawText(verificationHash, {
        x: margin + 6, y: cy - 22, size: 6.5, font, color: rgb(0.3, 0.3, 0.3),
      });
      cert.drawText(`Generated: ${formatUTCTimestamp(documentSignedAt)}  |  Envelope: ${envelopeId}`, {
        x: margin + 6, y: cy - 32, size: 6.5, font, color: rgb(0.45, 0.45, 0.45),
      });

      cert.drawText(`Document ID: ${documentId}`, { x: margin, y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5) });
      const cp = `© ${new Date().getFullYear()} Texas Premium Insurance Services, LLC. All rights reserved.`;
      cert.drawText(cp, {
        x: pageWidth - margin - font.widthOfTextAtSize(cp, 6.5),
        y: 20, size: 6.5, font, color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    // ── Save audit record to MongoDB ──
    try {
      const { MongoClient } = await import("mongodb");
      const mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
      const db = mongoClient.db("db");

      await db.collection("consent_audit_log").insertOne({
        documentId,
        envelopeId,
        customerName,
        amount,
        cardLast4,
        email,
        cardholderEmail: cardholderEmail || null,
        billingZip: billingZip || null,
        signerIP,
        signatureMethod,
        language,
        behavioralEvidence: be,
        timestamps: {
          documentCreatedAt,
          documentSentAt,
          documentViewedAt,
          documentSignedAt,
        },
        verificationHash: crypto
          .createHash("sha256")
          .update(`${documentId}-${envelopeId}-${customerName}-${amount}-${cardLast4}-${signerIP}-${billingZip || ""}-${cardholderEmail || ""}-${documentSignedAt.toISOString()}`)
          .digest("hex"),
        pdfBase64,          // full PDF stored for retrieval
        createdAt: new Date(),
      });

      await mongoClient.close();
    } catch (err) {
      console.error("⚠️ Failed to save consent audit log:", err);
      // Don't block — email still sends even if DB write fails
    }

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

    // Internal notification
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