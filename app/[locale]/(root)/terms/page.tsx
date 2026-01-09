/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from "fs";
import path from "path";
import { getLocale } from "next-intl/server";
import TermsClient from "./TermsClient";

export default async function TermsPage() {
  // Get the current locale (en or es)
  const locale = await getLocale();

  // Load the language-specific HTML file
  const filePath = path.join(
    process.cwd(),
    "app",
    "[locale]",
    "(root)",
    "terms",
    `terms-${locale}.html`
  );

  let htmlContent = "";

  try {
    htmlContent = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Failed to read terms-${locale}.html at:`, filePath);
    // Fallback to English if the locale-specific file doesn't exist
    const fallbackPath = path.join(
      process.cwd(),
      "app",
      "[locale]",
      "(root)",
      "terms",
      "terms-en.html"
    );

    try {
      htmlContent = fs.readFileSync(fallbackPath, "utf8");
      console.log("Loaded fallback English terms");
    } catch (fallbackError) {
      return (
        <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
          <h1>Terms of Service</h1>
          <p>Content could not be loaded. Please contact support.</p>
        </div>
      );
    }
  }

  return <TermsClient htmlContent={htmlContent} />;
}
