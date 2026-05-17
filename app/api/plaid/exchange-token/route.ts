// app/api/plaid/exchange-token/route.ts
import { NextResponse } from "next/server";
import { PlaidApi, PlaidEnvironments, Configuration } from "plaid";
import clientPromise from "@/lib/mongodb";

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
}));

export async function POST(request: Request) {
  const { public_token } = await request.json();
  const response = await plaidClient.itemPublicTokenExchange({ public_token });
  const access_token = response.data.access_token;

  // Save access token to MongoDB — you only do this once
  const client = await clientPromise;
  await client.db("db").collection("plaid_config").updateOne(
    { key: "chase_access_token" },
    { $set: { access_token, updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}