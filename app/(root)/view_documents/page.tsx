"use client";

import { useState } from "react";
import Head from "next/head";
import { motion } from "framer-motion";

interface Attachment {
  filename: string;
  content_type?: string;
  bytes: string;
  date: string;
  message_id?: string;
  subject?: string;
}

interface GroupedAttachments {
  date: string;
  original: string;
  attachments: Attachment[];
}

interface ApiResponse {
  attachments: Attachment[];
  total: number;
  hasMore: boolean;
}

export default function ViewDocuments() {
  const [searchEmail, setSearchEmail] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentSkip, setCurrentSkip] = useState(0);
  const [totalEmails, setTotalEmails] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadCount, setLoadCount] = useState(0);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null
  );
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const getCurrentLimit = () => {
    if (loadCount === 0) return 1;
    if (loadCount === 1) return 2;
    if (loadCount === 2) return 3;
    return 5;
  };

  const fetchAttachments = async (
    email: string,
    skip: number = 0,
    append: boolean = false
  ) => {
    const limit = getCurrentLimit();
    if (skip === 0) {
      setLoading(true);
      setAttachments([]);
    } else {
      setLoadingMore(true);
    }
    setError("");

    try {
      const response = await fetch(
        `https://astraldbapi.herokuapp.com/attachments?search_email=${encodeURIComponent(
          email
        )}&limit=${limit}&skip=${skip}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch attachments");
      }
      const data: ApiResponse = await response.json();

      if (append) {
        setAttachments((prev) => [...prev, ...data.attachments]);
      } else {
        setAttachments(data.attachments);
      }

      setHasMore(data.hasMore);
      setTotalEmails(data.total);
      setCurrentSkip(skip + limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchEmail && searchEmail.includes("@")) {
      setCurrentSkip(0);
      setHasSearched(false);
      setLoadCount(0);
      fetchAttachments(searchEmail, 0, false);
      setHasSearched(true);
    } else {
      setError("Please enter a valid email address");
    }
  };

  const handleLoadMore = () => {
    setLoadCount((prev) => prev + 1);
    fetchAttachments(searchEmail, currentSkip, true);
  };

  const createBlobUrl = (attachment: Attachment) => {
    try {
      const byteString = atob(attachment.bytes);
      const byteNumbers = new Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteNumbers[i] = byteString.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: attachment.content_type || "application/pdf",
      });
      return window.URL.createObjectURL(blob);
    } catch (err) {
      console.error("Blob creation error:", err);
      setError("Failed to process file");
      return "";
    }
  };

  const handlePreview = (attachment: Attachment) => {
    const url = createBlobUrl(attachment);
    if (url) {
      setPreviewUrl(url);
      setPreviewAttachment(attachment);
    }
  };

  const handleDownload = (attachment: Attachment) => {
    const url = createBlobUrl(attachment);
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewAttachment(null);
    setPreviewUrl("");
  };

  const formatDateOnly = (dateString: string): string => {
    if (!dateString) return "Unknown Date";

    try {
      if (dateString.includes(" at ")) {
        return dateString.split(" at ")[0];
      }

      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Group attachments by date
  const groupByDate = (attachments: Attachment[]): GroupedAttachments[] => {
    const groups: {
      [key: string]: {
        formatted: string;
        original: string;
        attachments: Attachment[];
      };
    } = {};

    for (const attachment of attachments) {
      const dateKey = formatDateOnly(attachment.date);
      if (!groups[dateKey]) {
        groups[dateKey] = {
          formatted: dateKey,
          original: attachment.date,
          attachments: [],
        };
      }
      groups[dateKey].attachments.push(attachment);
    }

    // Sort by date (newest first)
    return Object.values(groups)
      .sort((a, b) => {
        const parseDate = (dateStr: string): number => {
          if (!dateStr) return 0;
          const cleanDate = dateStr.includes(" at ")
            ? dateStr.split(" at ")[0]
            : dateStr;
          const parsed = new Date(cleanDate);
          return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        };
        return parseDate(b.original) - parseDate(a.original);
      })
      .map(({ formatted, original, attachments }) => ({
        date: formatted,
        original,
        attachments,
      }));
  };

  const groupedAttachments = groupByDate(attachments);

  return (
    <div className="min-h-screen bg-gray-50 py-6 flex flex-col justify-center sm:py-12">
      <Head>
        <title>Retrieve My Documents</title>
        <meta name="description" content="Retrieve My Policy Documents" />
      </Head>

      <div className="relative py-3 sm:max-w-4xl sm:mx-auto w-full px-4">
        <div className="absolute inset-0 bg-gradient-to-r from-[#a30f3e] to-[#102b56] shadow-lg transform -skew-y-6 sm:skew-y-0 sm:-rotate-3 sm:rounded-2xl"></div>
        <div className="relative px-4 py-10 bg-white shadow-xl sm:rounded-2xl sm:p-20">
          <h1 className="text-3xl font-bold mb-1 text-[#102b56] text-center">
            Retrieve My Documents
          </h1>
          <p className="text-lg mb-6 text-[#102b56] text-center">
            Access your policy documents and ID cards
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
                className="flex-shrink-0 bg-[#a30f3e] hover:bg-[#102b56] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#a30f3e] mb-4"></div>
              <p className="text-gray-600">Searching for your documents...</p>
            </div>
          )}

          {!loading && groupedAttachments.length > 0 && (
            <div className="space-y-6">
              {/* <p className="text-sm text-gray-500 text-center mb-6">
                Showing {attachments.length} document
                {attachments.length !== 1 ? "s" : ""}
                {totalEmails > 0 &&
                  ` from ${Math.min(
                    currentSkip,
                    totalEmails
                  )} of ${totalEmails} emails`}
              </p> */}

              {groupedAttachments.map((group, groupIndex) => (
                <motion.div
                  key={group.date}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIndex * 0.1, duration: 0.3 }}
                >
                  {/* Date Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2 bg-[#102b56] text-white px-4 py-2 rounded-lg">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="font-semibold">{group.date}</span>
                    </div>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>

                  {/* Attachments for this date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ml-2">
                    {group.attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.filename}-${index}`}
                        className="border border-gray-200 p-4 rounded-lg bg-white shadow-sm hover:shadow-md hover:border-[#a30f3e] transition-all duration-300 flex flex-col gap-3"
                      >
                        {/* PDF Icon and Filename */}
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                              <svg
                                className="w-6 h-6 text-[#a30f3e]"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-[#102b56] text-sm truncate">
                              {attachment.filename}
                            </h3>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-between gap-3 pt-2">
                          <button
                            onClick={() => handlePreview(attachment)}
                            className="flex-1 bg-gray-100 hover:bg-gray-200 text-[#102b56] text-sm font-semibold py-2.5 rounded-lg transition-colors"
                          >
                            View
                          </button>

                          <button
                            onClick={() => handleDownload(attachment)}
                            className="flex-1 bg-[#a30f3e] hover:bg-[#102b56] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="text-center pt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-[#102b56] font-semibold py-3 px-6 rounded-lg transition-colors duration-300 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#a30f3e]"></div>
                        Loading...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        Another Policy or Prior Policy Document
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* End of results */}
              {!hasMore && attachments.length > 0 && (
                <p className="text-center text-sm text-gray-400 pt-4">
                  — End of documents —
                </p>
              )}
            </div>
          )}

          {!loading && attachments.length === 0 && !error && hasSearched && (
            <div className="text-center py-12">
              <svg
                className="w-16 h-16 text-gray-300 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-gray-500">No documents found for this email</p>
              <p className="text-sm text-gray-400 mt-2">
                Make sure you&apos;re using the email address associated with
                your policy
              </p>
            </div>
          )}

          {!loading && !searchEmail && (
            <div className="text-center py-8">
              <svg
                className="w-16 h-16 text-gray-300 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-gray-500">
                Enter your email address to search for documents
              </p>
            </div>
          )}

          {/* Preview Modal */}
          {previewAttachment && previewUrl && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md"
              onClick={closePreview}
            >
              <div
                className="bg-gray-100 p-4 rounded-lg w-[95vw] h-[95vh] max-w-6xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between mb-2">
                  <h3 className="text-lg font-semibold text-[#102b56]">
                    {previewAttachment.filename}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(previewAttachment)}
                      className="bg-[#a30f3e] text-white py-1 px-3 rounded hover:bg-[#102b56]"
                    >
                      Download
                    </button>
                    <button
                      onClick={closePreview}
                      className="bg-gray-200 text-gray-800 py-1 px-3 rounded hover:bg-gray-300"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-gray-300 rounded-lg p-4 overflow-hidden">
                  <embed
                    src={previewUrl}
                    type="application/pdf"
                    className="w-full h-full bg-white rounded shadow"
                  />
                </div>
              </div>
            </div>
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
