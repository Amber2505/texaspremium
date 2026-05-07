import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function POST() {
  try {
    const client = await clientPromise;
    const db = client.db("db");

    // Get all pdf-extracted records from the last 24 hours
    const recentPdfs = await db
      .collection("pdf-extracted")
      .find({ reminderSetup: { $ne: true } })
      .toArray();

    if (!recentPdfs.length) return NextResponse.json({ setupCount: 0 });

    // Get all pending customers in one query
    const pendingCustomers = await db
      .collection("customer_policyandclaim_info")
      .find({ status: "PENDING", active: true })
      .toArray();

    if (!pendingCustomers.length) return NextResponse.json({ setupCount: 0 });

    // Index pending customers by policy_no for fast lookup
    const pendingByPolicy = new Map(
      pendingCustomers.map((c) => [c.policy_no?.toUpperCase(), c])
    );

    let setupCount = 0;

    for (const pdf of recentPdfs) {
      const policyNo = pdf.policyNumber?.toUpperCase();
      if (!policyNo) continue;

      const pending = pendingByPolicy.get(policyNo);
      if (!pending) continue;

      // Determine payment type
      let suggestedPaymentType: "regular" | "autopay" | "paid-in-full" = "regular";

      if (pdf.paidInFull) {
        suggestedPaymentType = "paid-in-full";
      } else if (pending.phone) {
        const effDateStr = pending.effective_date
          ? new Date(pending.effective_date).toISOString().split("T")[0]
          : null;
        const expDateStr = pending.expiration_date
          ? new Date(pending.expiration_date).toISOString().split("T")[0]
          : null;

        const autopayQuery: Record<string, unknown> = {
          customerPhone: pending.phone,
          status: "active",
          completed: true,
        };

        if (effDateStr && expDateStr) {
          autopayQuery.$expr = {
            $and: [
              { $gte: [{ $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, effDateStr] },
              { $lte: [{ $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, expDateStr] },
            ],
          };
        }

        const autopayRecord = await db
          .collection("autopay_customers")
          .findOne(autopayQuery);

        if (autopayRecord) suggestedPaymentType = "autopay";
      } else if (pdf.paymentMethod === "cc" || pdf.paymentMethod === "eft") {
        suggestedPaymentType = "autopay";
      }

      const dueDate = pdf.paidInFull ? null : pdf.nextDueDate;
      if (suggestedPaymentType !== "paid-in-full" && !dueDate) continue;

      // Skip if already in payment_reminder_coll
      const alreadyExists = await db
        .collection("payment_reminder_coll")
        .findOne({ id: pending.policy_no });
      if (alreadyExists) {
        // Mark as processed so we don't retry next time
        await db.collection("pdf-extracted").updateOne(
          { _id: pdf._id },
          { $set: { reminderSetup: true } }
        );
        continue;
      }

      // Call setup-reminder
      try {
        const setupRes = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/setup-reminder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              policyNo: pending.policy_no,
              dueDate: dueDate ?? "",
              paymentType: suggestedPaymentType,
            }),
          }
        );
       if (setupRes.ok) {
          setupCount++;
          console.log(`✅ Auto-setup: ${pending.customer_name} (${pending.policy_no}) as ${suggestedPaymentType}`);
          await db.collection("pdf-extracted").updateOne(
            { _id: pdf._id },
            { $set: { reminderSetup: true } }
          );
        }
      } catch {
        // skip
      }
    }

    return NextResponse.json({ setupCount });
  } catch (error) {
    console.error("Auto-setup error:", error);
    return NextResponse.json({ setupCount: 0 });
  }
}