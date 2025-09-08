// pages/shortlinkcreated/page.tsx
"use client";
import { useState, FormEvent } from "react";

export default function InfluencerLinkPage() {
  const [influencerName, setInfluencerName] = useState<string>("");
  //   const [longUrl, setLongUrl] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setShortUrl(null);
    setIsLoading(true);

    //     try {
    //       if (!influencerName.trim()) {
    //         throw new Error("Please enter a valid influencer name.");
    //       }

    //       const formattedName = influencerName
    //         .trim()
    //         .toLowerCase()
    //         .replace(/[^a-z0-9]+/g, "_")
    //         .replace(/(^_|_$)/g, "");

    //       const longLinkResponse = await fetch(
    //         `https://astraldbapi.herokuapp.com/generate_long_link/${formattedName}`
    //       );

    //       if (!longLinkResponse.ok) {
    //         throw new Error("Failed to get long link from API.");
    //       }

    //       const longLinkData = await longLinkResponse.json();
    //       console.log("Long link response:", longLinkData);
    //       if (!longLinkData.Data) {
    //         throw new Error("No long link returned from the API.");
    //       }

    //       const generatedLongUrl = longLinkData.Data;
    //       //   setLongUrl(generatedLongUrl);

    //       const shortenResponse = await fetch(
    //         `https://astraldbapi.herokuapp.com/shorten?url=${encodeURIComponent(
    //           generatedLongUrl
    //         )}`,
    //         {
    //           method: "POST",
    //           headers: {
    //             "Content-Type": "application/json",
    //           },
    //         }
    //       );

    //       const shortenData = await shortenResponse.json();
    //       console.log("Shorten API response:", shortenData);
    //       if (!shortenResponse.ok || !shortenData.short_url) {
    //         throw new Error("Failed to shorten link with FastAPI backend.");
    //       }

    //       setShortUrl(shortenData.short_url);
    //     } catch (err: any) {
    //       console.error("Error:", err.message);
    //       setError(err.message || "An error occurred while generating the link.");
    //     } finally {
    //       setIsLoading(false);
    //     }
  };

  return (
    <div className="min-h-screen bg-[#E5E5E5] py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 text-center mb-8">
          Generate Influencer Link
        </h1>
        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-lg rounded-lg p-6"
        >
          <div className="mb-4">
            <label
              htmlFor="influencerName"
              className="block text-gray-700 font-semibold mb-2"
            >
              Influencer Name
            </label>
            <input
              type="text"
              id="influencerName"
              value={influencerName}
              onChange={(e) => setInfluencerName(e.target.value)}
              placeholder="Charli D'Amelio"
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
            {isLoading ? "Generating Link..." : "Generate Link"}
          </button>
        </form>
        {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
        {shortUrl && (
          <div className="mt-6 text-center">
            <p className="text-gray-700 font-semibold">Your Shortened Link:</p>
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
                alert("Short link copied to clipboard!");
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
