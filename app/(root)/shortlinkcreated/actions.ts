"use server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Generate a random 7-character string (a-z, A-Z, 0-9)
const generateRandomString = (length: number = 7): string => {
  const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Read existing short URLs from urls.csv
const readExistingShortUrls = async (): Promise<Set<string>> => {
  const filePath = path.join(process.cwd(), "data", "urls.csv");
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());
    const startIndex = lines[0].startsWith("short_url,long_url") ? 1 : 0;
    return new Set(lines.slice(startIndex).map((line) => line.split(",")[0]));
  } catch {
    // If file doesn't exist, return empty set
    return new Set();
  }
};

// Append to urls.csv
const appendToCsv = async (shortUrl: string, longUrl: string): Promise<void> => {
  const filePath = path.join(process.cwd(), "data", "urls.csv");
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const data = `${shortUrl},${longUrl}\n`;
  try {
    await fs.access(filePath);
    await fs.appendFile(filePath, data, "utf-8");
  } catch {
    // File doesn't exist, create with header
    await fs.writeFile(filePath, "short_url,long_url\n" + data, "utf-8");
  }
};

export async function shortenUrl(longUrl: string): Promise<{ shortUrl?: string; error?: string }> {
  try {
    // Validate URL
    new URL(longUrl);

    // Get existing short URLs
    const existingShortUrls = await readExistingShortUrls();

    // Generate unique short URL
    let shortUrl: string;
    let attempts = 0;
    const maxAttempts = 10;
    do {
      if (attempts++ >= maxAttempts) {
        return { error: "Could not generate a unique short URL. Please try again." };
      }
      shortUrl = generateRandomString();
    } while (existingShortUrls.has(shortUrl));

    // Save to urls.csv
    await appendToCsv(shortUrl, longUrl);

    return { shortUrl };
  } catch {
    return { error: "Failed to shorten URL. Please ensure the URL is valid and try again." };
  }
}