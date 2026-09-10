import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb"; // your existing helper

async function claimsCollection() {
  const client = await clientPromise;
  return client.db().collection("message_agent_claim");
}

// GET — every active claim, for the sidebar counts
export async function GET() {
  const col = await claimsCollection();
  const claims = await col.find({}).toArray();
  return NextResponse.json({
    claims: claims.map((c) => ({
      conversationId: c.conversationId,
      agentName: c.agentName,
      claimedAt: c.claimedAt,
    })),
  });
}

// POST — claim a thread
export async function POST(req: NextRequest) {
  const { conversationId, agentName } = await req.json();
  if (!conversationId || !agentName?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const col = await claimsCollection();
  const existing = await col.findOne({ conversationId });
  if (existing && existing.agentName !== agentName.trim()) {
    return NextResponse.json(
      { error: `Already claimed by ${existing.agentName}` },
      { status: 409 },
    );
  }

  await col.updateOne(
    { conversationId },
    {
      $set: {
        conversationId,
        agentName: agentName.trim(),
        claimedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return NextResponse.json({ success: true });
}

// DELETE — release
export async function DELETE(req: NextRequest) {
  const { conversationId } = await req.json();
  const col = await claimsCollection();
  await col.deleteOne({ conversationId });
  return NextResponse.json({ success: true });
}