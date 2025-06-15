import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params; // Await params to resolve the warning
  const filePath = path.join(process.cwd(), "data", "urls.csv");
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());
    const startIndex = lines[0].startsWith("short_url,long_url") ? 1 : 0;
    for (const line of lines.slice(startIndex)) {
      const [shortUrl, longUrl] = line.split(",");
      if (shortUrl === slug) {
        return NextResponse.redirect(new URL(longUrl), { status: 301 });
      }
    }
    return NextResponse.json({ error: "Short URL not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Failed to read redirects" }, { status: 500 });
  }
}