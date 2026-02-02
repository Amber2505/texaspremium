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

    // Helper function to calculate age from date of birth
    const calculateAge = (dateOfBirth: string): number => {
      if (!dateOfBirth) return 0;
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      return age;
    };

    // Format phone number to always show (972) 748-6404
    const formatPhoneNumber = (): string => {
      return "(972) 748-6404";
    };

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    // Track all pages for adding footer later
    const allPages = [page];

    // Embed fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Colors
    const darkBlue = rgb(0.1, 0.2, 0.4);
    const lightGray = rgb(0.95, 0.95, 0.95);
    const mediumGray = rgb(0.5, 0.5, 0.5);
    const blueBox = rgb(0.9, 0.95, 1);
    const blueBorder = rgb(0.2, 0.4, 0.8);

    let yPosition = height - 60;

    // Try to load logo
    let logoImage = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "logo.png");
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        logoImage = await pdfDoc.embedPng(logoBytes);
      }
    } catch (error) {
      console.log("Logo not found, continuing without logo");
    }

    // Header with logo
    if (logoImage) {
      const logoDims = logoImage.scale(0.2);
      page.drawImage(logoImage, {
        x: 50,
        y: yPosition - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });
      yPosition -= logoDims.height + 20;
    } else {
      // Company name if no logo
      page.drawText("TEXAS PREMIUM INSURANCE SERVICES", {
        x: 50,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: darkBlue,
      });
      yPosition -= 30;
    }

    // Title
    page.drawText("AUTO INSURANCE QUOTE PROPOSAL", {
      x: 50,
      y: yPosition,
      size: 18,
      font: helveticaBold,
      color: darkBlue,
    });
    yPosition -= 20;

    // Agency Disclaimer
    page.drawText("Texas Premium Insurance Services is an independent insurance agency.", {
      x: 50,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: mediumGray,
    });
    yPosition -= 12;
    page.drawText("Coverage will be provided by one of our partnered insurance carriers.", {
      x: 50,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: mediumGray,
    });
    yPosition -= 23;

    // Customer Info Section - Gray Box
    const customerBoxHeight = 110;
    page.drawRectangle({
      x: 40,
      y: yPosition - customerBoxHeight + 10,
      width: width - 80,
      height: customerBoxHeight,
      color: lightGray,
    });

    yPosition -= 10;

    // Left column - Customer info
    page.drawText("Prepared for:", {
      x: 50,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: mediumGray,
    });

    page.drawText(data.customerName, {
      x: 50,
      y: yPosition - 16,
      size: 12,
      font: helveticaBold,
      color: darkBlue,
      maxWidth: 250,
    });

    // Split address if too long
    const addressMaxWidth = 250;
    const addressWords = data.customerAddress.split(' ');
    let addressLine1 = '';
    let addressLine2 = '';
    
    for (const word of addressWords) {
      const testLine = addressLine1 ? `${addressLine1} ${word}` : word;
      const textWidth = helvetica.widthOfTextAtSize(testLine, 10);
      
      if (textWidth < addressMaxWidth || !addressLine1) {
        addressLine1 = testLine;
      } else {
        addressLine2 = addressLine2 ? `${addressLine2} ${word}` : word;
      }
    }

    page.drawText(addressLine1, {
      x: 50,
      y: yPosition - 32,
      size: 10,
      font: helvetica,
      color: darkBlue,
    });

    if (addressLine2) {
      page.drawText(addressLine2, {
        x: 50,
        y: yPosition - 46,
        size: 10,
        font: helvetica,
        color: darkBlue,
      });
    }

    // Phone on separate line with more space
    page.drawText(formatPhoneNumber(), {
      x: 50,
      y: addressLine2 ? yPosition - 60 : yPosition - 48,
      size: 10,
      font: helvetica,
      color: darkBlue,
    });

    // Right column - Dates
    const effectiveDate = new Date(data.effectiveDate);
    const endDate = new Date(effectiveDate);
    endDate.setMonth(endDate.getMonth() + parseInt(data.term));

    page.drawText("Effective dates:", {
      x: 350,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: mediumGray,
    });

    page.drawText(
      `${effectiveDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      {
        x: 350,
        y: yPosition - 16,
        size: 11,
        font: helvetica,
        color: darkBlue,
      }
    );

    page.drawText(`Policy Term: ${data.term} months`, {
      x: 350,
      y: yPosition - 32,
      size: 11,
      font: helvetica,
      color: darkBlue,
    });

    yPosition -= customerBoxHeight + 5;

    // Drivers Section
    page.drawText("INSURED DRIVERS", {
      x: 50,
      y: yPosition,
      size: 13,
      font: helveticaBold,
      color: darkBlue,
    });
    yPosition -= 20;

    data.drivers.forEach((driver: any, index: number) => {
      const age = driver.dateOfBirth ? calculateAge(driver.dateOfBirth) : null;
      const driverText = `${index + 1}. ${driver.name}${age ? `, Age ${age}` : ""}`;
      page.drawText(driverText, {
        x: 60,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: darkBlue,
      });
      yPosition -= 16;
    });

    yPosition -= 5;

    // Vehicles Section
    page.drawText("INSURED VEHICLES", {
      x: 50,
      y: yPosition,
      size: 13,
      font: helveticaBold,
      color: darkBlue,
    });
    yPosition -= 20;

    data.vehicles.forEach((vehicle: any, index: number) => {
      const vinDisplay = vehicle.vin ? ` - VIN: XXXX${vehicle.vin}` : '';
      const vehicleText = `${index + 1}. ${vehicle.year} ${vehicle.make} ${vehicle.model}${vinDisplay}`;
      page.drawText(vehicleText, {
        x: 60,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: darkBlue,
      });
      yPosition -= 16;
    });

    yPosition -= 5;

    // Coverage Section
    page.drawText("COVERAGE LIMITS", {
      x: 50,
      y: yPosition,
      size: 13,
      font: helveticaBold,
      color: darkBlue,
    });
    yPosition -= 20;

    // Build coverages array and filter out "None" values
    const allCoverages = [
      { label: "Bodily Injury", value: `$${data.bodilyInjury.split('/')[0]},000 / $${data.bodilyInjury.split('/')[1]},000` },
      { label: "Property Damage", value: `$${data.propertyDamage},000` },
      data.pip !== "None" ? { label: "Personal Injury Protection (PIP)", value: `$${data.pip}` } : null,
      data.umbi !== "None" ? { label: "Uninsured Motorist BI (UMBI)", value: `$${data.umbi.split('/')[0]},000 / $${data.umbi.split('/')[1]},000` } : null,
      data.umpd !== "None" ? { label: "Uninsured Motorist PD (UMPD)", value: `$${data.umpd},000` } : null,
      data.comprehensive !== "None" ? { label: "Comprehensive", value: `$${data.comprehensive} Deductible` } : null,
      data.collision !== "None" ? { label: "Collision", value: `$${data.collision} Deductible` } : null,
      data.rental === "Yes" ? { label: "Rental Reimbursement", value: data.rentalAmount || "Included" } : null,
      data.towing === "Yes" ? { label: "Towing & Labor", value: data.towingAmount || "Included" } : null,
    ];

    // Filter out null values (coverages that are "None")
    const coverages = allCoverages.filter(c => c !== null);

    const rowHeight = 16;
    coverages.forEach((coverage, index) => {
      // Draw light gray background for alternating rows
      if (index % 2 === 0) {
        page.drawRectangle({
          x: 40,
          y: yPosition - rowHeight,
          width: width - 80,
          height: rowHeight,
          color: lightGray,
        });
      }

      // Text centered in 16px box - offset by 11px from top for better centering
      page.drawText(coverage.label, {
        x: 50,
        y: yPosition - 11,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      page.drawText(coverage.value, {
        x: 350,
        y: yPosition - 11,
        size: 9,
        font: helveticaBold,
        color: darkBlue,
      });

      yPosition -= rowHeight;
    });

    yPosition -= 10;

    // Check if we need a second page for payment options
    const paymentBoxHeight = 150;
    const disclaimerHeight = 50;
    const footerHeight = 40;
    const requiredSpace = paymentBoxHeight + disclaimerHeight + footerHeight;

    let currentPage = page;
    
    if (yPosition < requiredSpace) {
      // Need a second page
      currentPage = pdfDoc.addPage([612, 792]);
      allPages.push(currentPage);
      yPosition = height - 60;
      
      // Add logo on second page too
      if (logoImage) {
        const logoDims = logoImage.scale(0.15);
        currentPage.drawImage(logoImage, {
          x: 50,
          y: yPosition - logoDims.height,
          width: logoDims.width,
          height: logoDims.height,
        });
        yPosition -= logoDims.height + 20;
      }
    }

    // Payment Options Section
    currentPage.drawRectangle({
      x: 40,
      y: yPosition - paymentBoxHeight + 10,
      width: width - 80,
      height: paymentBoxHeight,
      color: blueBox,
      borderColor: blueBorder,
      borderWidth: 2,
    });

    yPosition -= 5;

    currentPage.drawText("PAYMENT OPTIONS", {
      x: 50,
      y: yPosition,
      size: 13,
      font: helveticaBold,
      color: darkBlue,
    });
    yPosition -= 22;

    // Payment table header
    currentPage.drawText("Payment Plan", {
      x: 60,
      y: yPosition,
      size: 9,
      font: helveticaBold,
      color: darkBlue,
    });

    currentPage.drawText("Down Payment", {
      x: 190,
      y: yPosition,
      size: 9,
      font: helveticaBold,
      color: darkBlue,
    });

    currentPage.drawText("Monthly", {
      x: 320,
      y: yPosition,
      size: 9,
      font: helveticaBold,
      color: darkBlue,
    });

    currentPage.drawText("Total", {
      x: 450,
      y: yPosition,
      size: 9,
      font: helveticaBold,
      color: darkBlue,
    });

    yPosition -= 18;

    // Paid in Full option
    currentPage.drawText("Paid in Full", {
      x: 60,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: darkBlue,
    });

    currentPage.drawText(`$${data.totals.paidInFull}`, {
      x: 190,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: darkBlue,
    });

    currentPage.drawText("-", {
      x: 320,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: darkBlue,
    });

    currentPage.drawText(`$${data.totals.paidInFull}`, {
      x: 450,
      y: yPosition,
      size: 9,
      font: helveticaBold,
      color: rgb(0, 0.6, 0),
    });

    yPosition -= 16;

    // EFT Plan
    if (data.monthlyPaymentEFT) {
      const termMonths = parseInt(data.term);
      const totalEFT = parseFloat(data.downPayment) + (parseFloat(data.monthlyPaymentEFT) * (termMonths - 1));
      const downPercentageEFT = ((parseFloat(data.downPayment) / totalEFT) * 100).toFixed(2);

      currentPage.drawText(`${termMonths}-Month EFT (Bank)`, {
        x: 60,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${parseFloat(data.downPayment).toFixed(2)} (${downPercentageEFT}%)`, {
        x: 190,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${parseFloat(data.monthlyPaymentEFT).toFixed(2)}`, {
        x: 320,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${totalEFT.toFixed(2)}`, {
        x: 450,
        y: yPosition,
        size: 9,
        font: helveticaBold,
        color: darkBlue,
      });

      yPosition -= 16;
    }

    // RCC Plan
    if (data.monthlyPaymentRCC) {
      const termMonths = parseInt(data.term);
      const totalRCC = parseFloat(data.downPayment) + (parseFloat(data.monthlyPaymentRCC) * (termMonths - 1));
      const downPercentageRCC = ((parseFloat(data.downPayment) / totalRCC) * 100).toFixed(2);

      currentPage.drawText(`${termMonths}-Month RCC (Card)`, {
        x: 60,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${parseFloat(data.downPayment).toFixed(2)} (${downPercentageRCC}%)`, {
        x: 190,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${parseFloat(data.monthlyPaymentRCC).toFixed(2)}`, {
        x: 320,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${totalRCC.toFixed(2)}`, {
        x: 450,
        y: yPosition,
        size: 9,
        font: helveticaBold,
        color: darkBlue,
      });

      yPosition -= 16;
    }

    // Direct Bill Plan
    if (data.monthlyPaymentDirectBill) {
      const termMonths = parseInt(data.term);
      const totalDirectBill = parseFloat(data.downPayment) + (parseFloat(data.monthlyPaymentDirectBill) * (termMonths - 1));
      const downPercentageDirectBill = ((parseFloat(data.downPayment) / totalDirectBill) * 100).toFixed(2);

      currentPage.drawText(`${termMonths}-Month Direct Bill`, {
        x: 60,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${parseFloat(data.downPayment).toFixed(2)} (${downPercentageDirectBill}%)`, {
        x: 190,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${parseFloat(data.monthlyPaymentDirectBill).toFixed(2)}`, {
        x: 320,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: darkBlue,
      });

      currentPage.drawText(`$${totalDirectBill.toFixed(2)}`, {
        x: 450,
        y: yPosition,
        size: 9,
        font: helveticaBold,
        color: darkBlue,
      });

      yPosition -= 16;
    }

    // Savings messages
    const savings = [];
    if (data.monthlyPaymentEFT) {
      const savingsEFT = parseFloat(data.totals.savingsEFT);
      if (savingsEFT > 0) savings.push(`EFT (Electronic Fund Transfer): $${savingsEFT.toFixed(2)}`);
    }
    if (data.monthlyPaymentRCC) {
      const savingsRCC = parseFloat(data.totals.savingsRCC);
      if (savingsRCC > 0) savings.push(`RCC (Recurring Credit Card): $${savingsRCC.toFixed(2)}`);
    }
    if (data.monthlyPaymentDirectBill) {
      const savingsDirectBill = parseFloat(data.totals.savingsDirectBill);
      if (savingsDirectBill > 0) savings.push(`Direct Bill: $${savingsDirectBill.toFixed(2)}`);
    }

    if (savings.length > 0) {
      yPosition -= 5;
      currentPage.drawText(`Save with one-time payment! vs monthly payments (${savings.join(", ")})`, {
        x: 60,
        y: yPosition,
        size: 9,
        font: helveticaBold,
        color: rgb(0, 0.6, 0),
      });
    }

    yPosition -= paymentBoxHeight - 80;

    // Ensure enough space for disclaimer and footer
    if (yPosition < 80) {
      currentPage = pdfDoc.addPage([612, 792]);
      allPages.push(currentPage);
      yPosition = height - 60;
    }

    // Disclaimer - 24 hours validity
    const disclaimerText = [
      "IMPORTANT DISCLOSURE: This is a quote proposal and not a policy or binder. This quote is valid for 24 hours from the date prepared.",
      "Texas Premium Insurance Services is an independent insurance agency and not an insurance carrier. The actual insurance policy will be",
      "issued by one of our partnered insurance carriers. Final premium is subject to underwriting approval and may change based on additional",
      "information provided during the application process. Coverage is subject to policy terms, conditions, and exclusions as determined by the",
      "selected insurance carrier. By accepting this quote, you acknowledge that Texas Premium Insurance Services acts as your Agent of Record",
      "and will remain on file with the issuing carrier to assist you with policy service, claims support, and coverage questions.",
    ];

    disclaimerText.forEach((line) => {
      currentPage.drawText(line, {
        x: 50,
        y: yPosition,
        size: 8,
        font: helvetica,
        color: mediumGray,
        maxWidth: width - 100,
      });
      yPosition -= 11;
    });

    // Footer - Add to ALL pages
    const today = new Date().toLocaleDateString();
    
    allPages.forEach((pageToAddFooter) => {
      pageToAddFooter.drawText(`Quote prepared on ${today}`, {
        x: 50,
        y: 30,
        size: 8,
        font: helvetica,
        color: mediumGray,
      });

      pageToAddFooter.drawText("Texas Premium Insurance Services", {
        x: width - 230,
        y: 30,
        size: 8,
        font: helvetica,
        color: mediumGray,
      });
    });

    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Auto_Quote_${data.customerName.replace(/\s/g, "_")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}