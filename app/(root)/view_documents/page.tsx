"use client";

import { useState } from "react";
import Head from "next/head";
import { motion } from "framer-motion";

interface Attachment {
  filename: string;
  content_type: string;
  bytes: string;
  date: string;
}

export default function Attachments() {
  const [searchEmail, setSearchEmail] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchAttachments = async (email: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `https://astraldbapi.herokuapp.com/attachments?search_email==${encodeURIComponent(
          email
        )}`
      );
      if (!response.ok) {
        throw new Error(
          (await response.json()).detail || "Failed to fetch attachments"
        );
      }
      const data = await response.json();
      setAttachments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchEmail && searchEmail.includes("@")) {
      fetchAttachments(searchEmail);
    } else {
      setError("Please enter a valid email address");
    }
  };

  const downloadAttachment = (attachment: Attachment) => {
    const byteString = atob(attachment.bytes);
    const byteNumbers = new Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteNumbers[i] = byteString.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: attachment.content_type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 flex flex-col justify-center sm:py-12">
      <Head>
        <title>Retrieve My Documents</title>
        <meta name="description" content="Retrieve My Policy Documents" />
      </Head>

      <div className="relative py-3 sm:max-w-4xl sm:mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-[#a30f3e] to-[#102b56] shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-3 sm:rounded-2xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-xl sm:rounded-2xl sm:p-20">
          <h1 className="text-3xl font-bold mb-1 text-[#102b56] text-center">
            Retrieve My Documents
          </h1>
          <p className="text-1xl mb-6 text-[#102b56] text-center">
            Access your policy Documents and ID cards
          </p>

          <form onSubmit={handleSubmit} className="mb-8">
            <div className="flex items-center border-b-2 border-[#a30f3e] py-2">
              <input
                className="appearance-none bg-transparent border-none w-full text-gray-800 mr-3 py-2 px-3 leading-tight focus:outline-none focus:ring-0"
                type="email"
                placeholder="Enter Policyholder email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
              />
              <button
                className="flex-shrink-0 bg-[#a30f3e] hover:bg-[#102b56] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300"
                type="submit"
                disabled={loading}
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </form>

          {error && (
            <div
              className="bg-red-50 border border-red-300 text-red-600 px-4 py-3 rounded-lg relative mb-6"
              role="alert"
            >
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {attachments.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="border border-gray-200 p-4 rounded-lg flex flex-col items-center bg-white shadow-md hover:shadow-lg hover:bg-gray-50 transition-all duration-300 cursor-pointer"
                  onClick={() => downloadAttachment(attachment)}
                >
                  <svg
                    className="w-8 h-8 mb-2 text-[#a30f3e]"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                    <path d="M7 15h3v-2H7v2zm0-4h10v-2H7v2zm0-4h10V5H7v2z" />
                  </svg>
                  <h3 className="font-semibold text-[#102b56] text-center truncate w-full mb-3">
                    {attachment.filename}
                  </h3>
                  <button className="bg-[#102b56] hover:bg-[#a30f3e] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300">
                    Download
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500">
              {loading ? "Loading attachments..." : "No attachments found"}
            </p>
          )}
          {/* Back to Homepage Button */}
          <div className="text-center mt-8">
            <motion.a
              href="/"
              className="inline-block bg-[#a30f3e] text-white font-semibold py-3 px-6 rounded-lg hover:bg-[#102b56] transition-colors duration-300"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              Back to Homepage
            </motion.a>
          </div>
        </div>
      </div>
    </div>
  );
}
