// app/api/plaid/create-link-token/route.ts
import { NextResponse } from "next/server";
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from "plaid";

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
}));

export async function POST() {
  const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "texas-premium-admin" },
      client_name: "Texas Premium Insurance",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      redirect_uri: "https://www.texaspremiumins.com/admin/bank-connect",
    });
  return NextResponse.json({ link_token: response.data.link_token });
}