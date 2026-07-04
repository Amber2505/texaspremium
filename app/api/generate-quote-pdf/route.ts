// app/api/generate-quote-pdf/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const calculateAge = (dob: string): number => {
      if (!dob) return 0;
      const today = new Date(), b = new Date(dob);
      let age = today.getFullYear() - b.getFullYear();
      const m = today.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
      return age;
    };

    const formatPhone = (phone: string): string => {
      const d = phone.replace(/\D/g, "");
      return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : phone;
    };

    const fmt = (n: string | number) => parseFloat(String(n || 0)).toFixed(2);

    const pdfDoc = await PDFDocument.create();
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const reg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // ── Colors (receipt-style: mostly black & white) ──────────────────────────
    const BLACK  = rgb(0,    0,    0   );
    const WHITE  = rgb(1,    1,    1   );
    const DGRAY  = rgb(0.2,  0.2,  0.2 ); // body text
    const MGRAY  = rgb(0.45, 0.45, 0.45); // secondary text
    const LGRAY  = rgb(0.93, 0.93, 0.93); // alternating row
    const BORDER = rgb(0.7,  0.7,  0.7 ); // table borders

    const PW = 612, PH = 792;
    const L = 36, R = PW - 36, W = R - L;

    let page = pdfDoc.addPage([PW, PH]);
    const allPages: any[] = [page];
    let y = PH - 30;

    // ── Core helpers ──────────────────────────────────────────────────────────
    const txt = (t: string, x: number, yy: number, sz: number,
                 font: any, color: any = DGRAY, mw?: number) =>
      page.drawText(String(t ?? ""), {
        x, y: yy, size: sz, font, color,
        ...(mw ? { maxWidth: mw } : {}),
      });

    const box = (x: number, yy: number, w: number, h: number,
                 fill: any, stroke?: any, sw = 0.5) =>
      page.drawRectangle({
        x, y: yy, width: w, height: h, color: fill,
        ...(stroke ? { borderColor: stroke, borderWidth: sw } : {}),
      });

    const hline = (yy: number, x1 = L, x2 = R, color = BORDER, t = 0.5) =>
      page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color });

    const vline = (x: number, y1: number, y2: number, color = BORDER, t = 0.5) =>
      page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: t, color });

    const needPage = (needed: number) => {
      if (y - needed < 50) {
        page = pdfDoc.addPage([PW, PH]);
        allPages.push(page);
        y = PH - 30;
      }
    };

    // ── Section header (black bar, white text — like the receipt) ─────────────
    const sectionBar = (label: string) => {
      needPage(20);
      y -= 5;
      box(L, y - 14, W, 15, BLACK);
      txt(label, L + 6, y - 11, 8, bold, WHITE);
      y -= 17;
    };

    // ── Logo + header ─────────────────────────────────────────────────────────
    let logoImage: any = null;
    try {
      const lp = path.join(process.cwd(), "public", "logo.png");
      if (fs.existsSync(lp)) logoImage = await pdfDoc.embedPng(fs.readFileSync(lp));
    } catch {}

    const isNonOwner = !!data.isNonOwner;

    if (logoImage) {
      const d = logoImage.scale(0.14);
      page.drawImage(logoImage, { x: L, y: y - d.height, width: d.width, height: d.height });
      const titleX = L + d.width + 14;
      txt(isNonOwner ? "NON-OWNER AUTO INSURANCE QUOTE" : "AUTO INSURANCE QUOTE PROPOSAL", titleX, y - 12, 15, bold, BLACK, R - titleX);
      txt("Texas Premium Insurance Services  |  Independent Agency", titleX, y - 26, 8, reg, MGRAY, R - titleX);
      txt("Coverage provided by one of our partnered insurance carriers.", titleX, y - 37, 7.5, reg, MGRAY, R - titleX);
      y -= Math.max(d.height + 8, 46);
    } else {
      txt("TEXAS PREMIUM INSURANCE SERVICES", L, y, 13, bold, BLACK);
      y -= 16;
      txt("AUTO INSURANCE QUOTE PROPOSAL", L, y, 14, bold, BLACK);
      y -= 12;
      txt("Independent Agency  |  Coverage provided by one of our partnered carriers.", L, y, 7.5, reg, MGRAY, W);
      y -= 12;
    }

    // Thin rule under header (like receipt)
    hline(y, L, R, BLACK, 0.8);
    y -= 16;

    // ── Customer info (two column, borderless — like receipt's address block) ──
    const effectiveDate = new Date(data.effectiveDate);
    const endDate = new Date(effectiveDate);
    endDate.setMonth(endDate.getMonth() + parseInt(data.term));

    // Left: customer
    txt(data.customerName, L, y, 12, bold, BLACK);
    // Right: "QUOTE DETAILS" box (like receipt's RECEIPT box)
    const qbX = L + W * 0.55;
    const qbW = R - qbX;
    const qbY = y + 14;
    const qbH = 56;
    box(qbX, qbY - qbH, qbW, qbH, WHITE, BLACK, 0.8);
    box(qbX, qbY - 18, qbW, 18, BLACK);
    txt("QUOTE DETAILS", qbX + 4, qbY - 13, 8, bold, WHITE);
    // rows
    const qRow = (label: string, val: string, ry: number) => {
      txt(label, qbX + 4, ry, 7.5, bold, DGRAY, qbW * 0.45);
      txt(val,   qbX + qbW * 0.48, ry, 7.5, reg, DGRAY, qbW * 0.5);
      hline(ry - 3, qbX, qbX + qbW, BORDER, 0.3);
    };
    qRow("Effective Date:", effectiveDate.toLocaleDateString(), qbY - 27);
    qRow("Expiry Date:",    endDate.toLocaleDateString(),       qbY - 38);
    qRow("Policy Term:",    `${data.term} months`,              qbY - 49);

    y -= 14;
    txt(data.customerAddress, L, y, 9, reg, DGRAY, W * 0.5);
    y -= 12;
    txt(formatPhone(data.customerPhone), L, y, 9, reg, DGRAY);
    y -= 16;

    hline(y, L, R, BLACK, 0.5);
    y -= 10;

    // ── INSURED DRIVERS ───────────────────────────────────────────────────────
    sectionBar("INSURED DRIVERS");

    const dItems = data.drivers.map((d: any, i: number) => {
      const age = d.dateOfBirth ? calculateAge(d.dateOfBirth) : null;
      return `${i + 1}.  ${d.name}${age ? `  (Age ${age})` : ""}`;
    });

    let alt = false;
    for (let i = 0; i < dItems.length; i += 2) {
      needPage(14);
      if (alt) box(L, y - 13, W, 13, LGRAY);
      box(L, y - 13, W, 13, WHITE, BORDER, 0.3);
      txt(dItems[i], L + 5, y - 10, 8, reg, DGRAY, W / 2 - 10);
      if (dItems[i + 1]) {
        vline(L + W / 2, y, y - 13, BORDER, 0.3);
        txt(dItems[i + 1], L + W / 2 + 5, y - 10, 8, reg, DGRAY, W / 2 - 10);
      }
      alt = !alt;
      y -= 13;
    }

    // ── INSURED VEHICLES ──────────────────────────────────────────────────────
    if (isNonOwner) {
      sectionBar("NON-OWNER POLICY");
      needPage(20);
      box(L, y - 28, W, 28, LGRAY, BORDER, 0.3);
      txt("This is a Non-Owner liability policy. It covers the named insured while", L + 5, y - 10, 8, reg, DGRAY, W - 10);
      txt("driving non-owned vehicles. No specific vehicle is insured under this policy.", L + 5, y - 21, 8, reg, DGRAY, W - 10);
      y -= 30;
    } else {
    sectionBar("INSURED VEHICLES");

    const vHalf = (W - 2) / 2;

    const drawVeh = (v: any, i: number, px: number, startY: number): number => {
      const isLiab = v.coverageType === "liability";
      const extras = !isLiab ? [
        v.rental === "Yes" ? `Rental ${v.rentalAmount || ""}`.trim() : null,
        v.towing === "Yes" ? `Towing ${v.towingAmount || ""}`.trim() : null,
      ].filter(Boolean).join("  |  ") : "";
      const detail = !isLiab
        ? `Comp $${v.comprehensive}  |  Collision $${v.collision}${extras ? "  |  " + extras : ""}`
        : "";
      const hasVin = !!v.vin;
      const lines = 2 + (detail ? 1 : 0) + (hasVin ? 1 : 0);
      const h = lines * 11 + 8;
      const bg = Math.floor(i / 2) % 2 === 0 ? LGRAY : WHITE;

      box(px, startY - h, vHalf, h, bg, BORDER, 0.5);
      let ly = startY - 9;
      txt(`${i + 1}.  ${v.year} ${v.make} ${v.model}`, px + 5, ly, 8, bold, BLACK, vHalf - 10);
      ly -= 11;
      txt(isLiab ? "Liability Only" : "Full Coverage", px + 5, ly, 7.5, reg, MGRAY, vHalf - 10);
      if (detail) { ly -= 10; txt(detail, px + 5, ly, 6.5, reg, DGRAY, vHalf - 10); }
      if (hasVin) { ly -= 10; txt(`VIN: ${v.vin}`, px + 5, ly, 6, reg, MGRAY, vHalf - 10); }
      return h;
    };

    for (let i = 0; i < data.vehicles.length; i += 2) {
      const lh = drawVeh(data.vehicles[i], i, L, y);
      const rh = data.vehicles[i + 1] ? drawVeh(data.vehicles[i + 1], i + 1, L + vHalf + 2, y) : 0;
      const rowH = Math.max(lh, rh);
      needPage(rowH + 4);
      y -= rowH + 2;
    }
    } // end !isNonOwner

    // ── COVERAGE LIMITS ───────────────────────────────────────────────────────
    sectionBar("COVERAGE LIMITS");

    const covs = [
      { label: "Bodily Injury Liability",         value: `$${data.bodilyInjury.split("/")[0]},000 / $${data.bodilyInjury.split("/")[1]},000` },
      { label: "Property Damage",                  value: `$${data.propertyDamage},000` },
      data.pip    !== "None" ? { label: "Personal Injury Protection (PIP)", value: `$${data.pip}` } : null,
      data.medPay && data.medPay !== "None" ? { label: "Medical Payments (MedPay)", value: `$${data.medPay}` } : null,
      data.umbi   !== "None" ? { label: "Uninsured Motorist BI",  value: `$${data.umbi.split("/")[0]},000 / $${data.umbi.split("/")[1]},000` } : null,
      data.umpd   !== "None" ? { label: "Uninsured Motorist PD",  value: `$${data.umpd},000` } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    const half = Math.ceil(covs.length / 2);
    const lCovs = covs.slice(0, half), rCovs = covs.slice(half);
    const cvHalf = W / 2;

    alt = false;
    for (let i = 0; i < Math.max(lCovs.length, rCovs.length); i++) {
      needPage(14);
      box(L, y - 13, W, 13, alt ? LGRAY : WHITE, BORDER, 0.3);
      vline(L + cvHalf, y, y - 13, BORDER, 0.3);
      if (lCovs[i]) {
        txt(lCovs[i].label, L + 5, y - 10, 8, reg, DGRAY, cvHalf * 0.56);
        txt(lCovs[i].value, L + cvHalf * 0.6, y - 10, 8, bold, BLACK, cvHalf * 0.38);
      }
      if (rCovs[i]) {
        txt(rCovs[i].label, L + cvHalf + 5, y - 10, 8, reg, DGRAY, cvHalf * 0.56);
        txt(rCovs[i].value, L + cvHalf + cvHalf * 0.6, y - 10, 8, bold, BLACK, cvHalf * 0.38);
      }
      alt = !alt;
      y -= 13;
    }

    // ── PAYMENT OPTIONS ───────────────────────────────────────────────────────
    sectionBar("PAYMENT OPTIONS");

    // Table column positions
    const c1 = L + 4,   w1 = 158;
    const c2 = L + 168, w2 = 134;
    const c3 = L + 308, w3 = 118;
    const c4 = L + 432, w4 = R - L - 432 + 4;

    // Column header row
    needPage(15);
    box(L, y - 14, W, 14, LGRAY, BORDER, 0.5);
    [c2 - 3, c3 - 3, c4 - 3].forEach(x => vline(x, y, y - 14, BORDER, 0.4));
    txt("Payment Plan", c1, y - 11, 8, bold, BLACK, w1);
    txt("Down Payment", c2, y - 11, 8, bold, BLACK, w2);
    txt("Monthly",      c3, y - 11, 8, bold, BLACK, w3);
    txt("Total",        c4, y - 11, 8, bold, BLACK, w4);
    y -= 14;

    alt = false;
    const payRow = (plan: string, down: string, mo: string, total: string, totalBold = false) => {
      needPage(14);
      box(L, y - 13, W, 13, alt ? LGRAY : WHITE, BORDER, 0.3);
      [c2 - 3, c3 - 3, c4 - 3].forEach(x => vline(x, y, y - 13, BORDER, 0.3));
      txt(plan,  c1, y - 10, 8, reg,  DGRAY, w1);
      txt(down,  c2, y - 10, 8, reg,  DGRAY, w2);
      txt(mo,    c3, y - 10, 8, reg,  DGRAY, w3);
      txt(total, c4, y - 10, 8, totalBold ? bold : reg, BLACK, w4);
      alt = !alt;
      y -= 13;
    };

    payRow("Paid in Full", `$${fmt(data.totals.paidInFull)}`, "-", `$${fmt(data.totals.paidInFull)}`, true);

    const term = parseInt(data.term);
    if (data.monthlyPaymentEFT) {
      const tot = parseFloat(data.downPayment) + parseFloat(data.monthlyPaymentEFT) * (term - 1);
      const pct = ((parseFloat(data.downPayment) / tot) * 100).toFixed(1);
      payRow(`${term}-Mo EFT (Bank)`, `$${fmt(data.downPayment)} (${pct}%)`, `$${fmt(data.monthlyPaymentEFT)}`, `$${fmt(tot)}`, true);
    }
    if (data.monthlyPaymentRCC) {
      const tot = parseFloat(data.downPayment) + parseFloat(data.monthlyPaymentRCC) * (term - 1);
      const pct = ((parseFloat(data.downPayment) / tot) * 100).toFixed(1);
      payRow(`${term}-Mo Card (RCC)`, `$${fmt(data.downPayment)} (${pct}%)`, `$${fmt(data.monthlyPaymentRCC)}`, `$${fmt(tot)}`, true);
    }
    if (data.monthlyPaymentDirectBill) {
      const tot = parseFloat(data.downPayment) + parseFloat(data.monthlyPaymentDirectBill) * (term - 1);
      const pct = ((parseFloat(data.downPayment) / tot) * 100).toFixed(1);
      payRow(`${term}-Mo Direct Bill`, `$${fmt(data.downPayment)} (${pct}%)`, `$${fmt(data.monthlyPaymentDirectBill)}`, `$${fmt(tot)}`, true);
    }

    // Savings line
    const savs: string[] = [];
    if (data.monthlyPaymentEFT        && parseFloat(data.totals.savingsEFT)         > 0) savs.push(`EFT save $${fmt(data.totals.savingsEFT)}`);
    if (data.monthlyPaymentRCC        && parseFloat(data.totals.savingsRCC)         > 0) savs.push(`Card save $${fmt(data.totals.savingsRCC)}`);
    if (data.monthlyPaymentDirectBill && parseFloat(data.totals.savingsDirectBill)  > 0) savs.push(`Direct Bill save $${fmt(data.totals.savingsDirectBill)}`);
    if (savs.length > 0) {
      needPage(14);
      box(L, y - 13, W, 13, WHITE, BORDER, 0.3);
      const saveAmt = savs.map(s => s.replace(/^.+save \$/, "")).join("  |  ");
      txt(`Pay in full & save: $${saveAmt}`, c1, y - 10, 7.5, bold, DGRAY, W - 8);
      y -= 13;
    }

    // ── DISCLAIMER ────────────────────────────────────────────────────────────
    y -= 6;
    needPage(72);
    box(L, y - 70, W, 70, WHITE, BORDER, 0.5);
    hline(y, L, R, BORDER, 0.5);
    const discRaw = "IMPORTANT DISCLOSURE: This is a quote proposal and not a binding policy. Valid for 24 hours from the date prepared. Texas Premium Insurance Services is an independent agency, not an insurance carrier. The actual policy will be issued by one of our partnered carriers. Final premium is subject to underwriting approval and may change based on additional information. Coverage is subject to policy terms, conditions, and exclusions as determined by the selected carrier. By accepting this quote, you acknowledge Texas Premium Insurance Services as your Agent of Record and authorize them to remain on file with the issuing carrier for policy service, claims support, and coverage assistance.";
    const discMaxW = W - 14;
    const discWords = discRaw.split(" ");
    const discLines: string[] = [];
    let discLine = "";
    for (const word of discWords) {
      const test = discLine ? `${discLine} ${word}` : word;
      if (reg.widthOfTextAtSize(test, 6.5) <= discMaxW) {
        discLine = test;
      } else {
        if (discLine) discLines.push(discLine);
        discLine = word;
      }
    }
    if (discLine) discLines.push(discLine);

    const discBoxH = discLines.length * 10 + 12;
    box(L, y - discBoxH, W, discBoxH, WHITE, BORDER, 0.5);
    y -= 8;
    discLines.forEach(l => { txt(l, L + 6, y, 6.5, reg, MGRAY); y -= 10; });

    // ── FOOTER (thin rule + text, like receipt) ────────────────────────────────
    const today = new Date().toLocaleDateString();
    allPages.forEach((pg, pi) => {
      pg.drawLine({ start: { x: L, y: 30 }, end: { x: R, y: 30 }, thickness: 0.6, color: BLACK });
      pg.drawText(`Quote prepared on ${today}`, { x: L, y: 18, size: 7, font: reg, color: MGRAY });
      pg.drawText("Texas Premium Insurance Services  |  TexasPremiumins.com",
        { x: PW / 2 - 95, y: 18, size: 7, font: reg, color: MGRAY });
      if (allPages.length > 1)
        pg.drawText(`Page ${pi + 1} of ${allPages.length}`, { x: R - 36, y: 18, size: 7, font: reg, color: MGRAY });
    });

    const pdfBytes = await pdfDoc.save();

    // Upload to Azure and return URL alongside the PDF
    let pdfUrl: string | null = null;
    try {
      const { BlobServiceClient } = await import("@azure/storage-blob");
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING!
      );
      const containerClient = blobServiceClient.getContainerClient("quote-pdfs");
      await containerClient.createIfNotExists({ access: "blob" });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = data.customerName.replace(/\s/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      const blobName = `Quote_${safeName}_${timestamp}.pdf`;

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(Buffer.from(pdfBytes), {
        blobHTTPHeaders: { blobContentType: "application/pdf" },
      });
      pdfUrl = blockBlobClient.url;
    } catch (azureErr) {
      console.error("Azure upload error (non-fatal):", azureErr);
    }

    // Return JSON with pdfUrl + base64 PDF so the header isn't stripped
    return NextResponse.json({
      pdfBase64: Buffer.from(pdfBytes).toString("base64"),
      fileName: `Quote_${data.customerName.replace(/\s/g, "_")}.pdf`,
      pdfUrl,
    });
  } catch (err) {
    console.error("PDF error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}