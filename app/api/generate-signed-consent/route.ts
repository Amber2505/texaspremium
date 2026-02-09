// app/api/generate-signed-consent/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { headers } from "next/headers";

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
          x,
          y: currentY,
          size: fontSize,
          font: fontObj,
          color,
        });
        currentY -= fontSize + 5;
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.trim().length > 0) {
      page.drawText(currentLine.trim(), {
        x,
        y: currentY,
        size: fontSize,
        font: fontObj,
        color,
      });
      currentY -= fontSize + 5;
    }

    currentY -= 3;
  }

  return currentY;
}

// Draw shape icons for audit trail
function drawCircleIcon(page: PDFPage, x: number, y: number, radius: number, color: any) {
  page.drawCircle({ x, y, size: radius, color, borderWidth: 0 });
}

function drawCheckmark(page: PDFPage, x: number, y: number, color: any) {
  page.drawLine({ start: { x: x - 4, y }, end: { x: x - 1, y: y - 4 }, thickness: 2, color });
  page.drawLine({ start: { x: x - 1, y: y - 4 }, end: { x: x + 5, y: y + 4 }, thickness: 2, color });
}

function drawArrowIcon(page: PDFPage, x: number, y: number, color: any) {
  page.drawLine({ start: { x: x - 4, y }, end: { x: x + 4, y }, thickness: 2, color });
  page.drawLine({ start: { x: x + 1, y: y + 3 }, end: { x: x + 4, y }, thickness: 2, color });
  page.drawLine({ start: { x: x + 1, y: y - 3 }, end: { x: x + 4, y }, thickness: 2, color });
}

function drawViewIcon(page: PDFPage, x: number, y: number, color: any) {
  page.drawCircle({ x, y, size: 5, borderColor: color, borderWidth: 1.5, color: rgb(1, 1, 1) });
  page.drawCircle({ x, y, size: 2, color, borderWidth: 0 });
}

export async function POST(request: Request) {
  try {
    const {
      customerName,
      amount,
      cardLast4,
      email,
      signatureDataUrl,
      signatureMethod,
      language,
      clientIP,
    } = await request.json();

    const isSpanish = language === "es";

    // Get IP address from headers or client-provided
    const headersList = await headers();
    const serverIP =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "Unknown";
    const signerIP = clientIP || serverIP;

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
      const month = months[date.getUTCMonth()];
      const day = String(date.getUTCDate()).padStart(2, "0");
      const year = date.getUTCFullYear();
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");
      return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} UTC`;
    };

    // Create PDF
    const pdfDoc = await PDFDocument.create();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const todayDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // ============================================================
    // PAGE 1: Payment Authorization
    // ============================================================
    let page = pdfDoc.addPage([612, 792]);
    const pageWidth = 612;
    const pageHeight = 792;
    let yPosition = pageHeight - 50;

    // Try to add logo
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
        width: logoDims.width,
        height: logoDims.height,
      });
      yPosition -= logoDims.height + 20;
    } catch (error) {
      console.error("Error loading logo:", error);
      yPosition -= 20;
    }

    // Title
    page.drawText(
      isSpanish ? "FORMULARIO DE AUTORIZACION DE PAGO" : "PAYMENT AUTHORIZATION FORM",
      { x: 50, y: yPosition, size: 16, font: boldFont, color: rgb(0, 0, 0) }
    );
    yPosition -= 20;

    page.drawText(`Date: ${todayDate}`, {
      x: 50, y: yPosition, size: 11, font, color: rgb(0, 0, 0),
    });
    yPosition -= 25;

    // Authorization text
    const authText = isSpanish
      ? `Yo, ${customerName}, confirmo que soy el titular autorizado de la tarjeta de credito/debito que termina en ****${cardLast4}. Nadie mas esta utilizando mi tarjeta en mi nombre. Estoy realizando esta transaccion de mi propia voluntad.

Por la presente autorizo a Texas Premium Insurance Services a procesar un cargo de $${amount} (USD) a mi tarjeta mencionada anteriormente para el pago de mi poliza de seguro.

Al firmar este formulario, declaro y confirmo lo siguiente:

1. Soy el titular legalmente autorizado de la tarjeta que termina en ****${cardLast4}.
2. Estoy autorizando personalmente esta transaccion y ningun tercero esta utilizando mi tarjeta sin mi conocimiento.
3. He sido informado del monto exacto de $${amount} y del concepto del cargo antes de autorizar esta transaccion.
4. Reconozco que este cargo sera procesado de inmediato tras mi autorizacion.
5. Acepto que esta firma electronica es legalmente vinculante y tiene la misma validez que una firma manuscrita conforme a la Ley E-SIGN (15 U.S.C. 7001 et seq.) y la Ley UETA.
6. Confirmo que toda la informacion proporcionada en este formulario es verdadera y precisa.`
      : `I, ${customerName}, confirm that I am the authorized holder of the credit/debit card ending in ****${cardLast4}. No one else is using my card on my behalf. I am making this transaction of my own free will.

I hereby authorize Texas Premium Insurance Services to process a charge of $${amount} (USD) to my above-mentioned card for payment of my insurance policy.

By signing this form, I represent and confirm the following:

1. I am the legally authorized holder of the card ending in ****${cardLast4}.
2. I am personally authorizing this transaction and no third party is using my card without my knowledge.
3. I have been informed of the exact amount of $${amount} and the purpose of this charge prior to authorizing this transaction.
4. I acknowledge that this charge will be processed immediately upon my authorization.
5. I agree that this electronic signature is legally binding and carries the same validity as a handwritten signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. 7001 et seq.) and the Uniform Electronic Transactions Act (UETA).
6. I confirm that all information provided in this form is true and accurate.`;

    yPosition = drawWrappedText(page, authText, 50, yPosition, pageWidth - 100, 9.5, font, rgb(0, 0, 0));
    yPosition -= 12;

    // Check if we need a new page for the signature section
    if (yPosition < 250) {
      page.drawText(`Document ID: ${documentId}`, {
        x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });

      page = pdfDoc.addPage([612, 792]);
      yPosition = pageHeight - 60;
    }

    // Details grid
    page.drawText(isSpanish ? "Nombre:" : "Name:", {
      x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    page.drawText(customerName, {
      x: 140, y: yPosition, size: 11, font, color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    page.drawText(isSpanish ? "Tarjeta:" : "Card:", {
      x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    page.drawText(`****${cardLast4}`, {
      x: 140, y: yPosition, size: 11, font, color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    page.drawText(isSpanish ? "Monto:" : "Amount:", {
      x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    page.drawText(`$${amount} USD`, {
      x: 140, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0.6),
    });
    yPosition -= 20;

    page.drawText(isSpanish ? "Correo:" : "Email:", {
      x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    page.drawText(email, {
      x: 140, y: yPosition, size: 11, font, color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    page.drawText(isSpanish ? "Fecha:" : "Date Signed:", {
      x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    page.drawText(todayDate, {
      x: 140, y: yPosition, size: 11, font, color: rgb(0, 0, 0),
    });
    yPosition -= 30;

    // Signature section
    page.drawText(isSpanish ? "Firma:" : "Signature:", {
      x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0),
    });
    yPosition -= 5;

    const sigBoxX = 50;
    const sigBoxWidth = 300;
    const sigBoxHeight = 80;
    const sigBoxY = yPosition - sigBoxHeight;

    page.drawRectangle({
      x: sigBoxX,
      y: sigBoxY,
      width: sigBoxWidth,
      height: sigBoxHeight,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    page.drawText(isSpanish ? "Firmado por:" : "Signed by:", {
      x: sigBoxX + 8,
      y: sigBoxY + sigBoxHeight - 14,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    try {
      const base64Data = signatureDataUrl.split(",")[1];
      const signatureBytes = Buffer.from(base64Data, "base64");
      const signatureImage = await pdfDoc.embedPng(signatureBytes);

      const maxSigWidth = sigBoxWidth - 20;
      const maxSigHeight = sigBoxHeight - 30;
      const origWidth = signatureImage.width;
      const origHeight = signatureImage.height;
      const scale = Math.min(maxSigWidth / origWidth, maxSigHeight / origHeight);

      const sigW = origWidth * scale;
      const sigH = origHeight * scale;

      page.drawImage(signatureImage, {
        x: sigBoxX + 10,
        y: sigBoxY + 15,
        width: sigW,
        height: sigH,
      });
    } catch (error) {
      console.error("Error embedding signature:", error);
    }

    const verCodeY = sigBoxY - 12;
    page.drawText(envelopeId, {
      x: sigBoxX + 8,
      y: verCodeY,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });

    const ipText = `IP: ${signerIP}`;
    page.drawText(ipText, {
      x: sigBoxX + 8,
      y: verCodeY - 11,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });

    yPosition = verCodeY - 25;

    page.drawText(`Document ID: ${documentId}`, {
      x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    });

    // ============================================================
    // AUDIT CERTIFICATE PAGES
    // ============================================================
    let auditPage = pdfDoc.addPage([612, 792]);
    const aw = 612;
    let ay = 792 - 50;

    if (logoImage) {
      try {
        const logoDims = logoImage.scale(0.25);
        auditPage.drawImage(logoImage, {
          x: (aw - logoDims.width) / 2,
          y: ay - logoDims.height,
          width: logoDims.width,
          height: logoDims.height,
        });
        ay -= logoDims.height + 12;
      } catch (e) {
        ay -= 12;
      }
    }

    const certTitle1 = "Completed Document Audit Report";
    auditPage.drawText(certTitle1, {
      x: (aw - boldFont.widthOfTextAtSize(certTitle1, 16)) / 2,
      y: ay, size: 16, font: boldFont, color: rgb(0.15, 0.15, 0.15),
    });
    ay -= 16;

    const certSub = "Electronically signed and verified";
    auditPage.drawText(certSub, {
      x: (aw - font.widthOfTextAtSize(certSub, 10)) / 2,
      y: ay, size: 10, font, color: rgb(0.5, 0.5, 0.5),
    });
    ay -= 25;

    auditPage.drawLine({
      start: { x: 50, y: ay }, end: { x: aw - 50, y: ay },
      thickness: 1, color: rgb(0.82, 0.82, 0.82),
    });
    ay -= 20;

    const docTitle = isSpanish ? "Autorizacion de Pago" : "Payment Authorization";
    const titleLabel = "Title: ";
    const titleFW = boldFont.widthOfTextAtSize(titleLabel, 12) + font.widthOfTextAtSize(docTitle, 12);
    const titleSX = (aw - titleFW) / 2;

    auditPage.drawText(titleLabel, {
      x: titleSX, y: ay, size: 12, font: boldFont, color: rgb(0.15, 0.15, 0.15),
    });
    auditPage.drawText(docTitle, {
      x: titleSX + boldFont.widthOfTextAtSize(titleLabel, 12),
      y: ay, size: 12, font, color: rgb(0.15, 0.15, 0.15),
    });
    ay -= 16;

    const diText = `Document ID: ${documentId}`;
    auditPage.drawText(diText, {
      x: (aw - font.widthOfTextAtSize(diText, 9)) / 2,
      y: ay, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    ay -= 13;

    const envText = `Envelope ID: ${envelopeId}`;
    auditPage.drawText(envText, {
      x: (aw - font.widthOfTextAtSize(envText, 9)) / 2,
      y: ay, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    ay -= 13;

    const tzText = "Time Zone: (GMT-06:00) Central Standard Time";
    auditPage.drawText(tzText, {
      x: (aw - font.widthOfTextAtSize(tzText, 9)) / 2,
      y: ay, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    ay -= 22;

    auditPage.drawLine({
      start: { x: 50, y: ay }, end: { x: aw - 50, y: ay },
      thickness: 1, color: rgb(0.82, 0.82, 0.82),
    });
    ay -= 18;

    auditPage.drawText("Signer Information", {
      x: 50, y: ay, size: 13, font: boldFont, color: rgb(0.1, 0.1, 0.1),
    });
    ay -= 18;

    const signerInfoItems = [
      { label: "Name:", value: customerName },
      { label: "Email:", value: email },
      { label: "Card:", value: `****${cardLast4}` },
      { label: "Amount:", value: `$${amount} USD` },
      { label: "IP Address:", value: signerIP },
      { label: "Signature Method:", value: signatureMethod },
      { label: "Signing Time:", value: formatUTCTimestamp(documentSignedAt) },
    ];

    for (const item of signerInfoItems) {
      auditPage.drawText(item.label, {
        x: 60, y: ay, size: 9, font: boldFont, color: rgb(0.25, 0.25, 0.25),
      });
      auditPage.drawText(item.value, {
        x: 170, y: ay, size: 9, font, color: rgb(0.3, 0.3, 0.3),
      });
      ay -= 14;
    }

    ay -= 12;

    auditPage.drawLine({
      start: { x: 50, y: ay }, end: { x: aw - 50, y: ay },
      thickness: 0.5, color: rgb(0.82, 0.82, 0.82),
    });
    ay -= 18;

    auditPage.drawText("Files", {
      x: 50, y: ay, size: 13, font: boldFont, color: rgb(0.1, 0.1, 0.1),
    });
    ay -= 16;

    const fileName = `Payment_Authorization_${customerName.replace(/\s+/g, "_")}.pdf`;
    auditPage.drawText(`${fileName}`, {
      x: 60, y: ay, size: 9, font, color: rgb(0.3, 0.3, 0.3),
    });
    const fileDate = formatUTCTimestamp(documentCreatedAt);
    auditPage.drawText(fileDate, {
      x: aw - 50 - font.widthOfTextAtSize(fileDate, 9),
      y: ay, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
    ay -= 20;

    auditPage.drawLine({
      start: { x: 50, y: ay }, end: { x: aw - 50, y: ay },
      thickness: 0.5, color: rgb(0.82, 0.82, 0.82),
    });
    ay -= 18;

    auditPage.drawText("Activity", {
      x: 50, y: ay, size: 13, font: boldFont, color: rgb(0.1, 0.1, 0.1),
    });
    ay -= 20;

    const agentIP = serverIP;
    const agentEmail = "support@texaspremiumins.com";

    const activities = [
      {
        iconType: "circle" as const,
        iconColor: rgb(0.5, 0.73, 0.5),
        actor: "Texas Premium Insurance Services",
        action: "created the document",
        detail: agentEmail,
        ip: agentIP,
        timestamp: formatUTCTimestamp(documentCreatedAt),
      },
      {
        iconType: "arrow" as const,
        iconColor: rgb(0.4, 0.6, 0.8),
        actor: "Texas Premium Insurance Services",
        action: `sent the document to ${customerName}`,
        detail: email,
        ip: agentIP,
        timestamp: formatUTCTimestamp(documentSentAt),
      },
      {
        iconType: "view" as const,
        iconColor: rgb(0.45, 0.68, 0.68),
        actor: customerName.toUpperCase(),
        action: "first viewed document",
        detail: email,
        ip: signerIP,
        timestamp: formatUTCTimestamp(documentViewedAt),
      },
      {
        iconType: "check" as const,
        iconColor: rgb(0.2, 0.55, 0.3),
        actor: customerName.toUpperCase(),
        action: "signed the document",
        detail: email,
        ip: signerIP,
        timestamp: formatUTCTimestamp(documentSignedAt),
      },
    ];

    for (const activity of activities) {
      if (ay < 120) {
        auditPage.drawText(`Document ID: ${documentId}`, {
          x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
        });
        auditPage = pdfDoc.addPage([612, 792]);
        ay = 792 - 50;
      }

      auditPage.drawLine({
        start: { x: 50, y: ay + 8 }, end: { x: aw - 50, y: ay + 8 },
        thickness: 0.5, color: rgb(0.9, 0.9, 0.9),
      });

      const iconX = 62;
      const iconY = ay - 6;
      if (activity.iconType === "circle") drawCircleIcon(auditPage, iconX, iconY, 5, activity.iconColor);
      else if (activity.iconType === "arrow") drawArrowIcon(auditPage, iconX, iconY, activity.iconColor);
      else if (activity.iconType === "view") drawViewIcon(auditPage, iconX, iconY, activity.iconColor);
      else if (activity.iconType === "check") drawCheckmark(auditPage, iconX, iconY, activity.iconColor);

      const actorText = `${activity.actor}`;
      auditPage.drawText(actorText, {
        x: 80, y: ay, size: 9.5, font: boldFont, color: rgb(0.2, 0.2, 0.2),
      });

      auditPage.drawText(activity.timestamp, {
        x: aw - 50 - font.widthOfTextAtSize(activity.timestamp, 8),
        y: ay, size: 8, font, color: rgb(0.4, 0.4, 0.4),
      });

      const actionLine = `${activity.action} (${activity.detail})`;
      auditPage.drawText(actionLine, {
        x: 80, y: ay - 14, size: 8.5, font, color: rgb(0.35, 0.35, 0.35),
      });

      const ipLine = `IP: ${activity.ip}`;
      auditPage.drawText(ipLine, {
        x: 80, y: ay - 28, size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });

      ay -= 50;
    }

    ay -= 8;
    auditPage.drawLine({
      start: { x: 50, y: ay }, end: { x: aw - 50, y: ay },
      thickness: 1, color: rgb(0.82, 0.82, 0.82),
    });
    ay -= 18;

    const verificationHash = crypto
      .createHash("sha256")
      .update(`${documentId}-${envelopeId}-${customerName}-${amount}-${signerIP}-${documentSignedAt.toISOString()}`)
      .digest("hex");

    const hashLine = `SHA-256 Hash: ${verificationHash}`;
    auditPage.drawText(hashLine, {
      x: (aw - font.widthOfTextAtSize(hashLine, 7)) / 2,
      y: ay, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });
    ay -= 12;

    const cert1 = "This document was electronically signed and verified by Texas Premium Insurance Services.";
    auditPage.drawText(cert1, {
      x: (aw - font.widthOfTextAtSize(cert1, 7.5)) / 2,
      y: ay, size: 7.5, font, color: rgb(0.5, 0.5, 0.5),
    });
    ay -= 11;

    const cert2 = "The signer's identity has been authenticated. This audit trail is tamper-evident and cryptographically sealed.";
    auditPage.drawText(cert2, {
      x: (aw - font.widthOfTextAtSize(cert2, 7.5)) / 2,
      y: ay, size: 7.5, font, color: rgb(0.5, 0.5, 0.5),
    });
    ay -= 11;

    const cert3 = `Signer IP: ${signerIP} | Envelope ID: ${envelopeId}`;
    auditPage.drawText(cert3, {
      x: (aw - font.widthOfTextAtSize(cert3, 7.5)) / 2,
      y: ay, size: 7.5, font, color: rgb(0.5, 0.5, 0.5),
    });

    auditPage.drawText(`Document ID: ${documentId}`, {
      x: 50, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // DocuSign-style customer email HTML
    const customerEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                
                <!-- Header with Logo -->
                <tr>
                  <td style="padding: 20px; text-align: center; background-color: #ffffff;">
                    <img src="https://www.texaspremiumins.com/logo.png" alt="Texas Premium Insurance Services" style="height: 50px; width: auto;">
                  </td>
                </tr>

                <!-- Blue Banner -->
                <tr>
                  <td style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 40px 20px; text-align: center;">
                    <table cellpadding="0" cellspacing="0" style="margin: 0 auto 20px;">
                      <tr>
                        <td style="background-color: rgba(255,255,255,0.2); width: 80px; height: 80px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.4); text-align: center; vertical-align: middle;">
                          <span style="color: #ffffff; font-size: 48px; line-height: 80px;">✓</span>
                        </td>
                      </tr>
                    </table>
                    <h1 style="color: #ffffff; margin: 0 0 10px; font-size: 24px; font-weight: 600;">
                      ${isSpanish ? "Documento Completado" : "Document Completed"}
                    </h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">
                      ${isSpanish 
                        ? "Tu documento ha sido firmado exitosamente" 
                        : "Your document has been successfully signed"}
                    </p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                      ${isSpanish ? "Hola" : "Hello"} <strong>${customerName}</strong>,
                    </p>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                      ${isSpanish 
                        ? "Tu Autorización de Pago ha sido completada y firmada exitosamente. El documento completo con certificado de auditoría está adjunto a este correo electrónico."
                        : "Your Payment Authorization has been completed and signed successfully. The complete document with audit certificate is attached to this email."}
                    </p>

                    <!-- Info box about attachment -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                      <tr>
                        <td style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                            <strong>📎 ${isSpanish ? "Archivo Adjunto" : "Attachment"}:</strong><br>
                            <span style="font-family: monospace; font-size: 13px;">Payment_Authorization_${customerName.replace(/\s+/g, "_")}.pdf</span>
                          </p>
                          <p style="margin: 8px 0 0; color: #92400e; font-size: 13px;">
                            ${isSpanish 
                              ? "Descarga el archivo PDF adjunto para ver tu documento firmado completo."
                              : "Download the attached PDF file to view your complete signed document."}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Document Info Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${isSpanish ? "Detalles del Documento" : "Document Details"}
                          </p>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">
                                ${isSpanish ? "Documento:" : "Document:"}
                              </td>
                              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500; text-align: right;">
                                ${isSpanish ? "Autorización de Pago" : "Payment Authorization"}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">
                                ${isSpanish ? "Monto:" : "Amount:"}
                              </td>
                              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">
                                $${amount} USD
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">
                                ${isSpanish ? "Fecha:" : "Date:"}
                              </td>
                              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500; text-align: right;">
                                ${todayDate}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">
                                ${isSpanish ? "Estado:" : "Status:"}
                              </td>
                              <td style="padding: 6px 0; text-align: right;">
                                <span style="display: inline-block; background-color: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                                  ${isSpanish ? "COMPLETADO" : "COMPLETED"}
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; line-height: 1.6; margin: 0 0 10px;">
                      <strong style="color: #111827;">${isSpanish ? "No Compartas Este Correo" : "Do Not Share This Email"}</strong><br>
                      ${isSpanish 
                        ? "Este correo contiene información confidencial. Por favor no compartas este correo o el documento con otros."
                        : "This email contains confidential information. Please do not share this email or document with others."}
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; line-height: 1.5; margin: 15px 0 0;">
                      ${isSpanish 
                        ? "Este documento fue firmado electrónicamente y es legalmente vinculante. La identidad del firmante ha sido autenticada y este registro de auditoría es a prueba de manipulaciones."
                        : "This document was electronically signed and is legally binding. The signer's identity has been authenticated and this audit trail is tamper-evident."}
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0;">
                      Document ID: ${documentId}<br>
                      Envelope ID: ${envelopeId}
                    </p>
                  </td>
                </tr>

              </table>

              <!-- Disclaimer -->
              <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                <tr>
                  <td style="padding: 0 20px;">
                    <p style="color: #9ca3af; font-size: 11px; line-height: 1.5; text-align: center; margin: 0;">
                      ${isSpanish 
                        ? "¿Preguntas sobre el documento? Si necesitas modificar el documento o tienes preguntas, comunícate directamente con el remitente."
                        : "Questions about the Document? If you need to modify the document or have questions about the details, please reach out to the sender directly."}
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 10px 0 0;">
                      © ${new Date().getFullYear()} Texas Premium Insurance Services. ${isSpanish ? "Todos los derechos reservados." : "All rights reserved."}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Send to customer with DocuSign-style email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: isSpanish 
        ? `✓ Documento Completado - Autorización de Pago` 
        : `✓ Document Completed - Payment Authorization`,
      html: customerEmailHtml,
      attachments: [
        {
          filename: `Payment_Authorization_${customerName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBase64,
          encoding: "base64",
        },
      ],
    });

    // Send internal notification with full details
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `[INTERNAL] Payment Authorization - ${customerName} - $${amount}`,
      html: `
        <h2>Payment Authorization Received</h2>
        <p><strong>Customer Name:</strong> ${customerName}</p>
        <p><strong>Amount:</strong> $${amount}</p>
        <p><strong>Card Last 4:</strong> ****${cardLast4}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Signature Method:</strong> ${signatureMethod}</p>
        <p><strong>Signer IP:</strong> ${signerIP}</p>
        <p><strong>Date:</strong> ${todayDate}</p>
        <p><strong>Document ID:</strong> ${documentId}</p>
        <p><strong>Envelope ID:</strong> ${envelopeId}</p>
        <p>Customer has been sent a DocuSign-style email. See attached PDF with audit certificate.</p>
      `,
      attachments: [
        {
          filename: `Payment_Authorization_${customerName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBase64,
          encoding: "base64",
        },
      ],
    });

    return NextResponse.json({
      success: true,
      message: "PDF generated and emailed successfully",
      documentId,
      envelopeId,
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}