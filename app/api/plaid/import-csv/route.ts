// app/api/plaid/import-csv/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

// Chase business checking CSV format:
// Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
// CREDIT,05/15/2025,"ORIG CO NAME:KEMPER PMT...",487.91,ACH_CREDIT,12345.67,
// DEBIT,05/16/2025,"ATM WITHDRAWAL",-200.00,ATM,12145.67,
//
// Chase signs: credit = positive, debit = negative
// Plaid signs: credit (money in) = negative, debit (money out) = positive
// We INVERT signs on import so everything in bank_transactions follows Plaid convention.

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

function parseChaseDate(s: string): string | null {
  // Chase uses MM/DD/YYYY — convert to YYYY-MM-DD
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
}

function normalizeDescription(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV appears empty or has no data rows" },
        { status: 400 },
      );
    }

    // Find column indexes from header (Chase header is consistent but be defensive)
    const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx = {
      details: headers.indexOf("details"),
      date: headers.findIndex((h) => h.includes("posting date") || h === "date"),
      description: headers.indexOf("description"),
      amount: headers.indexOf("amount"),
      type: headers.indexOf("type"),
      balance: headers.indexOf("balance"),
    };

    if (idx.date === -1 || idx.description === -1 || idx.amount === -1) {
      return NextResponse.json(
        {
          error:
            "Chase CSV columns not detected. Expected: Details, Posting Date, Description, Amount, Type, Balance",
          foundHeaders: headers,
        },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const col = client.db("db").collection("bank_transactions");

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const importedDates: string[] = [];
    const sample: { date: string; name: string; amount: number }[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = splitCsvLine(lines[i]);
        const date = parseChaseDate(cols[idx.date] || "");
        const description = cols[idx.description] || "";
        const rawAmount = parseFloat((cols[idx.amount] || "").replace(/[$,]/g, ""));

        if (!date || !description || isNaN(rawAmount)) {
          errors++;
          continue;
        }

        // CRITICAL sign flip: Chase credit (+) → Plaid credit (−) and vice versa
        const plaidAmount = -rawAmount;

        // Dedup check: same date, same exact amount (signed), similar description
        const normDesc = normalizeDescription(description);
        const existing = await col.findOne({
          date,
          amount: { $gte: plaidAmount - 0.001, $lte: plaidAmount + 0.001 },
        });

        if (existing) {
          // Tighter check: if descriptions overlap meaningfully, treat as same record
          const existingDesc = normalizeDescription(
            (existing.name || existing.merchant_name || "") as string,
          );
          const overlap =
            existingDesc.includes(normDesc.slice(0, 15)) ||
            normDesc.includes(existingDesc.slice(0, 15));
          if (overlap) {
            skipped++;
            continue;
          }
        }

        const csvId = `chase_csv_${date}_${plaidAmount.toFixed(2)}_${normDesc
          .slice(0, 30)
          .replace(/[^a-z0-9]/g, "")}_${i}`;

        await col.insertOne({
          transaction_id: csvId,
          date,
          name: description,
          merchant_name: description,
          amount: plaidAmount,
          iso_currency_code: "USD",
          pending: false,
          category: [cols[idx.type] || "Imported"],
          account_id: existing?.account_id || "chase_csv_import",
          source: "chase_csv_import",
          importedAt: new Date(),
        });

        imported++;
        importedDates.push(date);
        if (sample.length < 3) {
          sample.push({ date, name: description, amount: plaidAmount });
        }
      } catch {
        errors++;
      }
    }

    importedDates.sort();
    const oldestImported = importedDates[0] || null;
    const newestImported = importedDates[importedDates.length - 1] || null;

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      oldestImported,
      newestImported,
      sample,
    });
  } catch (err) {
    console.error("CSV import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}