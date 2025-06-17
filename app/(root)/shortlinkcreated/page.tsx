"use client";
import { useState, FormEvent } from "react";
import { shortenUrl } from "./actions";

export default function ShortenPage() {
  const [longUrl, setLongUrl] = useState<string>("");
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Fixed Boolean to boolean (minor type consistency)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setShortUrl(null);
    setIsLoading(true);

    try {
      // Validate URL
      new URL(longUrl);
      const result = await shortenUrl(longUrl);
      if (result.error) {
        setError(result.error);
      } else if (result.shortUrl) {
        setShortUrl(`${window.location.origin}/${result.shortUrl}`);
      }
    } catch {
      setError(
        "Invalid URL. Please enter a valid URL (e.g., https://example.com)."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E5E5E5] py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 text-center mb-8">
          Shorten Your URL
        </h1>
        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-lg rounded-lg p-6"
        >
          <div className="mb-4">
            <label
              htmlFor="longUrl"
              className="block text-gray-700 font-semibold mb-2"
            >
              Enter Long URL
            </label>
            <input
              type="url"
              id="longUrl"
              value={longUrl}
              onChange={(e) => setLongUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#A0103D] text-gray-900"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-[#A0103D] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#102a56] transition ${
              isLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isLoading ? "Shortening..." : "Shorten URL"}
          </button>
        </form>
        {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
        {shortUrl && (
          <div className="mt-6 text-center">
            <p className="text-gray-700 font-semibold">Your Short URL:</p>
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A0103D] hover:underline break-all"
            >
              {shortUrl}
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shortUrl);
                alert("Short URL copied to clipboard!");
              }}
              className="mt-2 bg-[#102a56] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#A0103D] transition"
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
