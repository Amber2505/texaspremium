// app/[locale]/(root)/sign-consent/page.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useRef, useEffect, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import {
  FileSignature,
  CheckCircle,
  Type,
  Edit3,
  Upload,
  Loader2,
  Shield,
  ChevronDown,
  Lock,
  Mail,
  MapPin,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

type SignatureMethod = "type" | "draw" | "upload";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default function SignConsentPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const lang = resolvedParams.locale;
  const router = useRouter();

  const t = useTranslations("consent");

  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "0.00";
  const cardLast4 = searchParams.get("card") || "1234";
  const email = searchParams.get("email") || "";
  const method = searchParams.get("method") || "card";
  const phone = searchParams.get("phone") || "";
  const linkId = searchParams.get("linkId") || "";

  const [customerName, setCustomerName] = useState("");
  const [cardholderEmail, setCardholderEmail] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [signatureMethod, setSignatureMethod] =
    useState<SignatureMethod>("type");
  const [uploadedSignature, setUploadedSignature] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [avsAttested, setAvsAttested] = useState(false);
  const [clientIP, setClientIP] = useState("");
  const [isCheckingProgress, setIsCheckingProgress] = useState(true);

  const [resolvedEmail, setResolvedEmail] = useState(email);
  const [resolvedCard, setResolvedCard] = useState(
    cardLast4 !== "1234" ? cardLast4 : "",
  );
  const [resolvedAmount, setResolvedAmount] = useState(
    amount !== "0.00" ? amount : "",
  );
  const [isLoadingDetails, setIsLoadingDetails] = useState(!!linkId);

  // ── 30-second review progress (0 → 100) ──────────────────────────────────
  const REVIEW_SECONDS = 30;
  const [reviewProgress, setReviewProgress] = useState(0);
  const reviewReadyRef = useRef(false);

  useEffect(() => {
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      const pct = Math.min(100, Math.round((elapsed / REVIEW_SECONDS) * 100));
      setReviewProgress(pct);
      if (pct >= 100) {
        reviewReadyRef.current = true;
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Behavioral tracking refs (no re-renders)
  const pageLoadTimeRef = useRef<number>(Date.now());
  const maxScrollDepthRef = useRef<number>(0);
  const fieldInteractionsRef = useRef<Record<string, number>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureSectionRef = useRef<HTMLDivElement>(null);

  const scrollToSignature = () => {
    signatureSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  // Track max scroll depth
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));
      if (pct > maxScrollDepthRef.current) {
        maxScrollDepthRef.current = pct;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const trackFieldFocus = (fieldName: string) => {
    fieldInteractionsRef.current[fieldName] =
      (fieldInteractionsRef.current[fieldName] || 0) + 1;
  };

  // Poll check-progress until the card number arrives from Square webhook
  useEffect(() => {
    if (!linkId) {
      setIsCheckingProgress(false);
      setIsLoadingDetails(false);
      return;
    }

    let mounted = true;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchOnce = async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/check-progress?linkId=${linkId}`);
        const data = await res.json();

        if (!mounted) return true;

        if (data.success && data.progress?.consent) {
          router.push(data.redirectTo);
          return true;
        }

        if (data.success && data.linkData) {
          const { amount: amt, customerEmail, cardLast4: card } = data.linkData;

          if (customerEmail) setResolvedEmail(customerEmail);
          if (amt) setResolvedAmount((amt / 100).toFixed(2));
          if (card) {
            setResolvedCard(card);
            return true;
          }
        }

        return false;
      } catch (err) {
        console.error("Error fetching progress:", err);
        return false;
      }
    };

    const poll = async () => {
      const gotCard = await fetchOnce();
      if (!mounted) return;

      setIsCheckingProgress(false);

      if (gotCard || attempts >= MAX_ATTEMPTS) {
        setIsLoadingDetails(false);
        return;
      }

      attempts++;
      timeoutId = setTimeout(poll, 1500);
    };

    poll();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [linkId, router]);

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => setClientIP(data.ip))
      .catch(() => setClientIP(""));
  }, []);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 400;
    ctx.scale(2, 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  useEffect(() => {
    if (signatureMethod === "draw") {
      setTimeout(initCanvas, 100);
    }
  }, [signatureMethod]);

  const getCoordinates = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    if (signatureMethod === "draw") initCanvas();
    else if (signatureMethod === "upload") {
      setUploadedSignature("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert(t("uploadImage"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) =>
      setUploadedSignature(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      alert(t("enterName"));
      return;
    }
    if (!agreedToTerms) {
      alert(t("agreeTerms"));
      return;
    }
    if (!avsAttested) {
      alert(t("confirmAvs"));
      return;
    }
    if (!resolvedCard) {
      alert(t("cardLoading"));
      return;
    }
    if (!billingZip.trim() || !/^\d{5}$/.test(billingZip.trim())) {
      alert(t("invalidZip"));
      return;
    }
    if (
      !cardholderEmail.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cardholderEmail.trim())
    ) {
      alert(t("invalidEmail"));
      return;
    }

    let signatureDataUrl = "";
    if (signatureMethod === "draw") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signatureDataUrl = canvas.toDataURL("image/png");
    } else if (signatureMethod === "type") {
      signatureDataUrl = await convertTypedSignatureToImage(customerName);
    } else if (signatureMethod === "upload") {
      if (!uploadedSignature) {
        alert(t("uploadYourSignature"));
        return;
      }
      signatureDataUrl = uploadedSignature;
    }

    // Minimum review time gate
    const timeOnPageSeconds = Math.round(
      (Date.now() - pageLoadTimeRef.current) / 1000,
    );
    if (timeOnPageSeconds < REVIEW_SECONDS) {
      alert(t("reviewTimeRequired"));
      return;
    }

    setIsSubmitting(true);

    let finalEmail = resolvedEmail;
    if (!finalEmail && linkId) {
      try {
        const res = await fetch(`/api/check-progress?linkId=${linkId}`);
        const data = await res.json();
        if (data.success && data.linkData?.customerEmail) {
          finalEmail = data.linkData.customerEmail;
          setResolvedEmail(data.linkData.customerEmail);
        }
      } catch {
        // Fall back to server-side lookup
      }
    }

    const userAgent =
      typeof window !== "undefined" ? navigator.userAgent : "Unknown";

    const browserFingerprint = {
      screenResolution:
        typeof window !== "undefined"
          ? `${window.screen.width}x${window.screen.height}`
          : "Unknown",
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : "Unknown",
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "Unknown",
      language:
        typeof navigator !== "undefined" ? navigator.language : "Unknown",
      platform:
        typeof navigator !== "undefined" ? navigator.platform : "Unknown",
      colorDepth: typeof window !== "undefined" ? window.screen.colorDepth : 0,
    };

    const behavioralEvidence = {
      timeOnPageSeconds,
      maxScrollDepthPct: maxScrollDepthRef.current,
      fieldInteractions: fieldInteractionsRef.current,
      browserFingerprint,
      avsAttested,
      agreedToTerms,
    };

    try {
      const response = await fetch("/api/generate-signed-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          amount: resolvedAmount || amount,
          cardLast4: resolvedCard,
          email: finalEmail,
          phone,
          linkId,
          signatureDataUrl,
          signatureMethod,
          language: "en",
          clientIP,
          cardholderEmail: cardholderEmail.trim(),
          billingZip: billingZip.trim(),
          userAgent,
          behavioralEvidence,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate PDF");
      await response.json();

      if (linkId) {
        await fetch("/api/update-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId, step: "consent" }),
        });
      }

      setIsSigned(true);

      setTimeout(() => {
        if (linkId) {
          window.location.href = `/${lang}/pay/${linkId}`;
        } else {
          if (method === "direct-bill") {
            window.location.href = `/${lang}/payment-thankyou`;
          } else {
            window.location.href = `/${lang}/setup-autopay?${method}&phone=${phone}&redirect=payment&linkId=${linkId}`;
          }
        }
      }, 2000);
    } catch (error) {
      console.error("Error:", error);
      alert(t("errorProcessing"));
      setIsSubmitting(false);
    }
  };

  const convertTypedSignatureToImage = (text: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 150;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1e293b";
      ctx.font = "48px 'Brush Script MT', cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      resolve(canvas.toDataURL("image/png"));
    });
  };

  const inputClass =
    "w-full px-4 py-3 border border-gray-300 rounded-lg text-base text-gray-900 placeholder:text-gray-400 transition-all outline-none";
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#1E3A5F";
    e.target.style.boxShadow = "0 0 0 3px rgba(30,58,95,0.1)";
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#d1d5db";
    e.target.style.boxShadow = "none";
  };

  const todayDate = new Date().toLocaleDateString(
    lang === "es" ? "es-US" : "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  );

  // Derived state for submit button
  const formReady =
    !!customerName.trim() &&
    agreedToTerms &&
    avsAttested &&
    !!cardholderEmail.trim() &&
    billingZip.length === 5;
  const reviewDone = reviewProgress >= 100;
  const canSubmit = formReady && reviewDone && !isSubmitting;
  const secondsLeft = Math.max(
    0,
    REVIEW_SECONDS - Math.round((reviewProgress / 100) * REVIEW_SECONDS),
  );

  // Loading State
  if (isCheckingProgress) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Image
          src="/logo.png"
          alt="Texas Premium Insurance Services"
          width={160}
          height={64}
          className="mb-8"
        />
        <div className="relative w-10 h-10 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          <div
            className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "#1E3A5F", borderTopColor: "transparent" }}
          ></div>
        </div>
        <p className="text-gray-500 text-sm font-medium">{t("verifying")}</p>
      </div>
    );
  }

  // Success State
  if (isSigned) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 50%, #8B1A3D 100%)",
        }}
      >
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-6 border border-white/20">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
            {t("successTitle")}
          </h2>
          <p className="text-white/70 mb-2 text-sm leading-relaxed">
            {t("successEmailSent")}
          </p>
          <p className="text-white/70 text-sm mb-8">
            {method === "direct-bill"
              ? t("redirecting")
              : t("redirectingAutopay")}
          </p>
          <div className="w-8 h-8 rounded-full border-4 border-white/20 border-t-white animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  // Main Form
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg, #f0f2f5 0%, #e8eaef 50%, #f5f0f2 100%)",
      }}
    >
      {/* Hero Header */}
      <div
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 40%, #6B1D3A 80%, #8B1A3D 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        ></div>
        <div className="relative max-w-2xl mx-auto px-4 py-8 text-center">
          <h1 className="text-xl font-bold text-white tracking-wide uppercase">
            {t("pageTitle")}
          </h1>
          <p className="text-white/60 text-xs mt-2 font-medium tracking-wider">
            {todayDate}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-3 text-white/40 text-xs">
            <Lock className="w-3 h-3" />
            <span>{t("secureDocument")}</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4 pb-10 relative z-10">
        {/* Action Required Banner */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-5 py-4 mb-5 flex items-start gap-3 shadow-sm">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: "#8B1A3D" }}
          >
            <FileSignature className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {t("actionRequired")}
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {t("actionRequiredDesc")}
            </p>
          </div>
        </div>

        {/* Scroll to Signature CTA */}
        <button onClick={scrollToSignature} className="w-full mb-5 group">
          <div
            className="rounded-lg px-5 py-3.5 flex items-center justify-between text-white transition-opacity hover:opacity-90"
            style={{
              background:
                "linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 60%, #6B1D3A 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <Edit3 className="w-5 h-5 opacity-80" />
              <span className="text-sm font-semibold">
                {t("jumpToSignature")}
              </span>
            </div>
            <ChevronDown className="w-5 h-5 opacity-70 group-hover:translate-y-0.5 transition-transform" />
          </div>
        </button>

        {/* Document Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Transaction Summary */}
          <div
            className="px-6 py-5 border-b border-gray-100"
            style={{
              background: "linear-gradient(135deg, #f8f9fb 0%, #f3f0f4 100%)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-xs font-medium uppercase tracking-wider mb-1"
                  style={{ color: "#1E3A5F" }}
                >
                  {t("amountToAuthorize")}
                </p>
                {resolvedAmount ? (
                  <p
                    className="text-3xl font-bold tracking-tight"
                    style={{ color: "#1E3A5F" }}
                  >
                    ${resolvedAmount}
                    <span className="text-sm font-normal text-gray-400 ml-1.5">
                      USD
                    </span>
                  </p>
                ) : (
                  <div className="h-9 w-32 bg-gray-200 rounded animate-pulse mt-1"></div>
                )}
              </div>
              <div className="text-right">
                <p
                  className="text-xs font-medium uppercase tracking-wider mb-1"
                  style={{ color: "#1E3A5F" }}
                >
                  {t("card")}
                </p>
                {resolvedCard ? (
                  <p className="text-base font-semibold text-gray-700 font-mono tracking-wider">
                    &bull;&bull;&bull;&bull; {resolvedCard}
                  </p>
                ) : (
                  <div className="h-6 w-24 bg-gray-200 rounded animate-pulse mt-1"></div>
                )}
              </div>
            </div>
          </div>

          {/* Authorization Text */}
          <div className="px-6 py-6">
            <p className="text-gray-700 leading-relaxed text-sm">
              {t("authText1_prefix")}{" "}
              {resolvedCard ? (
                <strong>****{resolvedCard}</strong>
              ) : (
                <span className="inline-block h-4 w-16 bg-gray-200 rounded animate-pulse align-middle"></span>
              )}
              {t("authText1_suffix")}
            </p>

            <p className="text-gray-700 leading-relaxed text-sm mt-4">
              {t("authText2_prefix")} <strong>{t("authText2_company")}</strong>{" "}
              {t("authText2_middle")}{" "}
              {resolvedAmount ? (
                <strong style={{ color: "#1E3A5F" }}>
                  ${resolvedAmount} USD
                </strong>
              ) : (
                <span className="inline-block h-4 w-20 bg-gray-200 rounded animate-pulse align-middle"></span>
              )}{" "}
              {t("authText2_suffix")}
            </p>

            {/* Terms */}
            <div
              className="mt-5 rounded-lg p-4 border border-gray-100"
              style={{ backgroundColor: "#f8f9fb" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "#1E3A5F" }}
              >
                {t("terms")}
              </p>
              <div className="space-y-2.5">
                {[
                  t("term1"),
                  t("term2"),
                  t("term3"),
                  t("term4"),
                  t("term5"),
                ].map((term, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "#1E3A5F" }}
                    >
                      <span className="text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {term}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="px-6">
            <div className="border-t border-dashed border-gray-300"></div>
          </div>

          {/* Signature Section */}
          <div className="px-6 py-6" ref={signatureSectionRef}>
            <div className="flex items-center gap-2.5 mb-6">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #1E3A5F 0%, #8B1A3D 100%)",
                }}
              >
                <FileSignature className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {t("cardholderSignature")}
                </h3>
                <p className="text-xs text-gray-500">
                  {t("requiredToComplete")}
                </p>
              </div>
            </div>

            {/* Name Input */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                {t("cardholderFullName")}{" "}
                <span style={{ color: "#8B1A3D" }}>*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t("enterFullName")}
                className={inputClass}
                style={{ boxShadow: "none" }}
                onFocus={(e) => {
                  trackFieldFocus("customerName");
                  inputFocus(e);
                }}
                onBlur={inputBlur}
                required
              />
            </div>

            {/* Cardholder Email + Billing Zip */}
            <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    {t("cardholderEmailLabel")}{" "}
                    <span style={{ color: "#8B1A3D" }}>*</span>
                  </span>
                </label>
                <input
                  type="email"
                  value={cardholderEmail}
                  onChange={(e) => setCardholderEmail(e.target.value)}
                  placeholder={t("cardholderEmailPlaceholder")}
                  className={inputClass}
                  style={{ boxShadow: "none" }}
                  onFocus={(e) => {
                    trackFieldFocus("cardholderEmail");
                    inputFocus(e);
                  }}
                  onBlur={inputBlur}
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                  {t("cardholderEmailHelper")}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    {t("billingZipLabel")}{" "}
                    <span style={{ color: "#8B1A3D" }}>*</span>
                  </span>
                </label>
                <input
                  type="text"
                  value={billingZip}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                    setBillingZip(val);
                  }}
                  placeholder={t("billingZipPlaceholder")}
                  inputMode="numeric"
                  maxLength={5}
                  className={inputClass}
                  style={{ boxShadow: "none" }}
                  onFocus={(e) => {
                    trackFieldFocus("billingZip");
                    inputFocus(e);
                  }}
                  onBlur={inputBlur}
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                  {t("billingZipHelper")}
                </p>
              </div>
            </div>

            {/* Identity Confirmation Notice */}
            <div className="mb-5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-xs text-blue-800 leading-relaxed">
                <strong>{t("identityConfirmTitle")}</strong>{" "}
                {t("identityConfirm_prefix")}{" "}
                {resolvedCard ? (
                  <strong>****{resolvedCard}</strong>
                ) : (
                  <span className="inline-block h-3.5 w-14 bg-blue-200 rounded animate-pulse align-middle" />
                )}
                {t("identityConfirm_suffix")}
              </p>
            </div>

            {/* Signature Method Selector */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                {t("signatureMethod")}{" "}
                <span style={{ color: "#8B1A3D" }}>*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    key: "type" as SignatureMethod,
                    icon: Type,
                    label: t("type"),
                  },
                  {
                    key: "draw" as SignatureMethod,
                    icon: Edit3,
                    label: t("draw"),
                  },
                  {
                    key: "upload" as SignatureMethod,
                    icon: Upload,
                    label: t("upload"),
                  },
                ].map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSignatureMethod(key)}
                    className="flex items-center justify-center gap-2 py-3 px-3 rounded-lg border-2 text-sm font-medium transition-all"
                    style={
                      signatureMethod === key
                        ? {
                            borderColor: "#1E3A5F",
                            backgroundColor: "rgba(30,58,95,0.05)",
                            color: "#1E3A5F",
                          }
                        : {
                            borderColor: "#e5e7eb",
                            backgroundColor: "white",
                            color: "#6b7280",
                          }
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Signature Input Area */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {t("signature")} <span style={{ color: "#8B1A3D" }}>*</span>
                </label>
                {signatureMethod !== "type" && (
                  <button
                    onClick={clearSignature}
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "#8B1A3D" }}
                  >
                    {t("clear")}
                  </button>
                )}
              </div>

              {signatureMethod === "type" && (
                <div className="py-8 border-2 border-gray-200 rounded-lg bg-white text-center relative">
                  {customerName ? (
                    <p
                      className="text-4xl text-gray-800"
                      style={{ fontFamily: "'Brush Script MT', cursive" }}
                    >
                      {customerName}
                    </p>
                  ) : (
                    <p className="text-gray-400 text-sm">{t("typePreview")}</p>
                  )}
                  <div className="absolute bottom-3 left-4 right-4 border-b border-gray-200"></div>
                </div>
              )}

              {signatureMethod === "draw" && (
                <div className="border-2 border-gray-200 rounded-lg bg-white overflow-hidden relative">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full cursor-crosshair"
                    style={{ height: "200px", touchAction: "none" }}
                  />
                  <div className="absolute bottom-4 left-4 right-4 border-b border-gray-200 pointer-events-none"></div>
                  <p className="absolute bottom-1 right-4 text-[10px] text-gray-300 pointer-events-none">
                    {t("signHere")}
                  </p>
                </div>
              )}

              {signatureMethod === "upload" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {!uploadedSignature ? (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-10 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-all flex flex-col items-center gap-2 group"
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                        <Upload className="w-5 h-5 text-gray-400 group-hover:text-gray-500 transition-colors" />
                      </div>
                      <span className="text-sm text-gray-500 group-hover:text-gray-600 font-medium transition-colors">
                        {t("uploadSignature")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {t("uploadFormats")}
                      </span>
                    </button>
                  ) : (
                    <div className="py-6 border-2 border-gray-200 rounded-lg bg-white text-center relative">
                      <img
                        src={uploadedSignature}
                        alt="Uploaded signature"
                        className="max-h-28 mx-auto"
                      />
                      <div className="absolute bottom-3 left-4 right-4 border-b border-gray-200"></div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AVS Zip Attestation */}
            <label className="flex items-start gap-3 cursor-pointer mb-4 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-all bg-blue-50/30">
              <input
                type="checkbox"
                checked={avsAttested}
                onChange={(e) => setAvsAttested(e.target.checked)}
                className="mt-0.5 w-5 h-5 border-gray-300 rounded cursor-pointer"
                style={{ accentColor: "#1E3A5F" }}
              />
              <span className="text-xs text-gray-700 leading-relaxed">
                {t("avsAttestation")}
              </span>
            </label>

            {/* Agreement Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer mb-6 p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-5 h-5 border-gray-300 rounded cursor-pointer"
                style={{ accentColor: "#1E3A5F" }}
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                {t("confirmCheckbox")}
              </span>
            </label>

            {/* ── Submit Button: simple left-to-right gradient progress fill ── */}
            <>
              <div
                className="relative w-full rounded-lg overflow-hidden"
                style={{ height: "56px", backgroundColor: "#e2e8f0" }}
              >
                {/* Gradient fill — grows from 0% to 100% width */}
                {!reviewDone && (
                  <div
                    className="absolute left-0 top-0 bottom-0 transition-[width] duration-1000 ease-linear"
                    style={{
                      width: `${reviewProgress}%`,
                      background:
                        "linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 40%, #6B1D3A 80%, #8B1A3D 100%)",
                      backgroundSize: "400px 100%",
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                )}

                {/* Fully filled — same gradient, full width */}
                {reviewDone && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 40%, #6B1D3A 80%, #8B1A3D 100%)",
                      opacity: canSubmit ? 1 : 0.6,
                    }}
                  />
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="absolute inset-0 w-full font-semibold text-base flex items-center justify-between px-6"
                  style={{
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    background: "transparent",
                  }}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2.5 w-full justify-center text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t("processing")}</span>
                    </span>
                  ) : reviewDone ? (
                    <span className="flex items-center gap-2.5 w-full justify-center text-white">
                      <FileSignature className="w-5 h-5" />
                      <span>{t("signAndContinue")}</span>
                    </span>
                  ) : (
                    <>
                      <span
                        className="tabular-nums text-sm font-semibold"
                        style={{
                          color: reviewProgress > 15 ? "#fff" : "#64748b",
                        }}
                      >
                        {t("signAndContinue")}
                      </span>
                      <span
                        className="tabular-nums text-sm font-bold"
                        style={{
                          color: reviewProgress > 85 ? "#fff" : "#64748b",
                        }}
                      >
                        {reviewProgress}%
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Helper text below button while waiting */}
              {!reviewDone && (
                <p className="text-center text-xs text-gray-400 mt-2">
                  Please review the document above before signing
                </p>
              )}
            </>
          </div>
        </div>

        {/* Footer Trust Indicators */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>{t("sslEncrypted")}</span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>{t("secureSigning")}</span>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-3">
          &copy; {new Date().getFullYear()} Texas Premium Insurance Services
        </p>
      </div>
    </div>
  );
}
