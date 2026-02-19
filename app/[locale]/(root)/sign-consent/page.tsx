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
} from "lucide-react";
import Image from "next/image";

type SignatureMethod = "type" | "draw" | "upload";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default function SignConsentPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const lang = resolvedParams.locale;
  const router = useRouter();

  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "0.00";
  const cardLast4 = searchParams.get("card") || "1234";
  const email = searchParams.get("email") || "";
  const method = searchParams.get("method") || "card";
  const phone = searchParams.get("phone") || "";
  const linkId = searchParams.get("linkId") || "";

  const isSpanish = lang === "es";

  const [customerName, setCustomerName] = useState("");
  const [signatureMethod, setSignatureMethod] =
    useState<SignatureMethod>("type");
  const [uploadedSignature, setUploadedSignature] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [clientIP, setClientIP] = useState("");
  const [isCheckingProgress, setIsCheckingProgress] = useState(true);

  // ✅ Resolved data from DB - shows shimmer until loaded
  const [resolvedEmail, setResolvedEmail] = useState(email);
  const [resolvedCard, setResolvedCard] = useState(
    cardLast4 !== "1234" ? cardLast4 : "",
  );
  const [resolvedAmount, setResolvedAmount] = useState(
    amount !== "0.00" ? amount : "",
  );
  const [isLoadingDetails, setIsLoadingDetails] = useState(!!linkId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureSectionRef = useRef<HTMLDivElement>(null);

  const scrollToSignature = () => {
    signatureSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  // ✅ Combined init: check progress + fetch real card/email in parallel
  useEffect(() => {
    if (!linkId) {
      setIsCheckingProgress(false);
      setIsLoadingDetails(false);
      return;
    }

    const init = async () => {
      try {
        const [progressRes, detailsRes] = await Promise.all([
          fetch(`/api/check-progress?linkId=${linkId}`),
          fetch(`/api/get-link-details?linkId=${linkId}`),
        ]);

        const progressData = await progressRes.json();
        const detailsData = await detailsRes.json();

        // Handle details - card, email, amount
        if (detailsData.success) {
          if (detailsData.email) setResolvedEmail(detailsData.email);
          if (detailsData.cardLast4) setResolvedCard(detailsData.cardLast4);
          if (detailsData.amount) {
            setResolvedAmount((detailsData.amount / 100).toFixed(2));
          }
        }

        // Handle progress - redirect if consent already done
        if (progressData.success && progressData.progress?.consent) {
          router.push(progressData.redirectTo);
          return;
        }
      } catch (err) {
        console.error("Error initializing:", err);
      } finally {
        setIsCheckingProgress(false);
        setIsLoadingDetails(false);
      }
    };

    init();
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
      alert(
        isSpanish ? "Por favor sube una imagen" : "Please upload an image file",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) =>
      setUploadedSignature(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      alert(
        isSpanish ? "Por favor ingrese su nombre" : "Please enter your name",
      );
      return;
    }
    if (!agreedToTerms) {
      alert(
        isSpanish
          ? "Por favor acepta los términos y condiciones"
          : "Please agree to the terms and conditions",
      );
      return;
    }
    if (!resolvedCard) {
      alert(
        isSpanish
          ? "Información de tarjeta aún cargando, intente de nuevo"
          : "Card info still loading, please try again",
      );
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
        alert(
          isSpanish
            ? "Por favor sube tu firma"
            : "Please upload your signature",
        );
        return;
      }
      signatureDataUrl = uploadedSignature;
    }

    setIsSubmitting(true);

    // ✅ Fetch email one more time at submit if still missing
    let finalEmail = resolvedEmail;
    if (!finalEmail && linkId) {
      try {
        const res = await fetch(`/api/get-link-details?linkId=${linkId}`);
        const data = await res.json();
        if (data.success && data.email) {
          finalEmail = data.email;
          setResolvedEmail(data.email);
        }
      } catch {
        // Will fall back to server-side lookup in generate-signed-consent
      }
    }

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
          language: lang,
          clientIP,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate PDF");
      await response.json();

      if (linkId) {
        await fetch("/api/update-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkId,
            step: "consent",
          }),
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
      alert(
        isSpanish
          ? "Error al procesar la firma. Por favor intenta de nuevo."
          : "Error processing signature. Please try again.",
      );
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

  const todayDate = new Date().toLocaleDateString(
    isSpanish ? "es-US" : "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );

  // ── Loading State (only for progress check) ──
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
        <p className="text-gray-500 text-sm font-medium">
          {isSpanish ? "Verificando..." : "Verifying..."}
        </p>
      </div>
    );
  }

  // ── Success State ──
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
            {isSpanish ? "Firmado Exitosamente" : "Successfully Signed"}
          </h2>
          <p className="text-white/70 mb-2 text-sm leading-relaxed">
            {isSpanish
              ? "Se ha enviado una copia a su correo electrónico."
              : "A copy has been sent to your email."}
          </p>
          <p className="text-white/70 text-sm mb-8">
            {method === "direct-bill"
              ? isSpanish
                ? "Redirigiendo..."
                : "Redirecting..."
              : isSpanish
                ? "Redirigiendo a configuración de autopago..."
                : "Redirecting to autopay setup..."}
          </p>
          <div className="w-8 h-8 rounded-full border-4 border-white/20 border-t-white animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  // ── Main Form ──
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
            {isSpanish
              ? "Formulario de Autorización de Pago"
              : "Payment Authorization Form"}
          </h1>
          <p className="text-white/60 text-xs mt-2 font-medium tracking-wider">
            {todayDate}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-3 text-white/40 text-xs">
            <Lock className="w-3 h-3" />
            <span>{isSpanish ? "Documento seguro" : "Secure document"}</span>
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
              {isSpanish
                ? "Firma requerida para completar su transacción"
                : "Signature required to complete your transaction"}
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {isSpanish
                ? "Su pago no se procesará hasta que firme este formulario de autorización."
                : "Your payment will not be processed until you sign this authorization form."}
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
                {isSpanish
                  ? "Ir a la sección de firma"
                  : "Jump to signature section"}
              </span>
            </div>
            <ChevronDown className="w-5 h-5 opacity-70 group-hover:translate-y-0.5 transition-transform" />
          </div>
        </button>

        {/* Document Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Transaction Summary - with shimmer loading */}
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
                  {isSpanish ? "Monto a autorizar" : "Amount to authorize"}
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
                  {isSpanish ? "Tarjeta" : "Card"}
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

          {/* Authorization Text - with inline shimmer for card/amount */}
          <div className="px-6 py-6">
            <p className="text-gray-700 leading-relaxed text-sm">
              {isSpanish ? (
                <>
                  Yo, confirmo que soy el titular autorizado de la tarjeta de
                  crédito/débito que termina en{" "}
                  {resolvedCard ? (
                    <strong>****{resolvedCard}</strong>
                  ) : (
                    <span className="inline-block h-4 w-16 bg-gray-200 rounded animate-pulse align-middle"></span>
                  )}
                  . Nadie más está utilizando mi tarjeta en mi nombre. Estoy
                  realizando esta transacción de mi propia voluntad.
                </>
              ) : (
                <>
                  I confirm that I am the authorized holder of the credit/debit
                  card ending in{" "}
                  {resolvedCard ? (
                    <strong>****{resolvedCard}</strong>
                  ) : (
                    <span className="inline-block h-4 w-16 bg-gray-200 rounded animate-pulse align-middle"></span>
                  )}
                  . No one else is using my card on my behalf. I am making this
                  transaction of my own free will.
                </>
              )}
            </p>

            <p className="text-gray-700 leading-relaxed text-sm mt-4">
              {isSpanish ? (
                <>
                  Por la presente autorizo a{" "}
                  <strong>Texas Premium Insurance Services</strong> a procesar
                  un cargo de{" "}
                  {resolvedAmount ? (
                    <strong style={{ color: "#1E3A5F" }}>
                      ${resolvedAmount} USD
                    </strong>
                  ) : (
                    <span className="inline-block h-4 w-20 bg-gray-200 rounded animate-pulse align-middle"></span>
                  )}{" "}
                  a mi tarjeta mencionada anteriormente para el pago de mi
                  póliza de seguro.
                </>
              ) : (
                <>
                  I hereby authorize{" "}
                  <strong>Texas Premium Insurance Services</strong> to process a
                  charge of{" "}
                  {resolvedAmount ? (
                    <strong style={{ color: "#1E3A5F" }}>
                      ${resolvedAmount} USD
                    </strong>
                  ) : (
                    <span className="inline-block h-4 w-20 bg-gray-200 rounded animate-pulse align-middle"></span>
                  )}{" "}
                  to my above-mentioned card for payment of my insurance policy.
                </>
              )}
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
                {isSpanish ? "Términos" : "Terms"}
              </p>
              <div className="space-y-2.5">
                {[
                  isSpanish
                    ? "Soy el titular legalmente autorizado de la tarjeta."
                    : "I am the legally authorized holder of the card.",
                  isSpanish
                    ? "Autorizo personalmente esta transacción."
                    : "I am personally authorizing this transaction.",
                  isSpanish
                    ? "Acepto que esta firma electrónica es legalmente vinculante."
                    : "I agree that this electronic signature is legally binding.",
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
            {/* Section Header */}
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
                  {isSpanish ? "Firma del titular" : "Cardholder Signature"}
                </h3>
                <p className="text-xs text-gray-500">
                  {isSpanish
                    ? "Requerido para completar"
                    : "Required to complete"}
                </p>
              </div>
            </div>

            {/* Name Input */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                {isSpanish
                  ? "Nombre completo del titular"
                  : "Cardholder Full Name"}{" "}
                <span style={{ color: "#8B1A3D" }}>*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={
                  isSpanish
                    ? "Ingrese su nombre completo"
                    : "Enter your full name"
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base text-gray-900 placeholder:text-gray-400 transition-all outline-none"
                style={{ boxShadow: "none" }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1E3A5F";
                  e.target.style.boxShadow = "0 0 0 3px rgba(30,58,95,0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#d1d5db";
                  e.target.style.boxShadow = "none";
                }}
                required
              />
            </div>

            {/* Signature Method Selector */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                {isSpanish ? "Método de firma" : "Signature Method"}{" "}
                <span style={{ color: "#8B1A3D" }}>*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    key: "type" as SignatureMethod,
                    icon: Type,
                    label: isSpanish ? "Escribir" : "Type",
                  },
                  {
                    key: "draw" as SignatureMethod,
                    icon: Edit3,
                    label: isSpanish ? "Dibujar" : "Draw",
                  },
                  {
                    key: "upload" as SignatureMethod,
                    icon: Upload,
                    label: isSpanish ? "Subir" : "Upload",
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
                  {isSpanish ? "Firma" : "Signature"}{" "}
                  <span style={{ color: "#8B1A3D" }}>*</span>
                </label>
                {signatureMethod !== "type" && (
                  <button
                    onClick={clearSignature}
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "#8B1A3D" }}
                  >
                    {isSpanish ? "Borrar" : "Clear"}
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
                    <p className="text-gray-400 text-sm">
                      {isSpanish
                        ? "Ingrese su nombre arriba para previsualizar"
                        : "Enter your name above to preview"}
                    </p>
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
                    {isSpanish ? "Firme aquí" : "Sign here"}
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
                        {isSpanish
                          ? "Haz clic para subir imagen de firma"
                          : "Click to upload signature image"}
                      </span>
                      <span className="text-xs text-gray-400">
                        PNG, JPG {isSpanish ? "o" : "or"} SVG
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
                {isSpanish
                  ? "Confirmo que soy el titular autorizado de la tarjeta y que mi firma electrónica es legalmente vinculante."
                  : "I confirm I am the authorized cardholder and that my electronic signature is legally binding."}
              </span>
            </label>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!customerName.trim() || !agreedToTerms || isSubmitting}
              className="w-full py-4 text-white rounded-lg font-semibold text-base transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 hover:opacity-90"
              style={{
                background:
                  "linear-gradient(135deg, #1E3A5F 0%, #2B4C7E 40%, #6B1D3A 80%, #8B1A3D 100%)",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isSpanish ? "Procesando..." : "Processing..."}</span>
                </>
              ) : (
                <>
                  <FileSignature className="w-5 h-5" />
                  <span>
                    {isSpanish ? "Firmar y Continuar" : "Sign & Continue"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer Trust Indicators */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>{isSpanish ? "Cifrado SSL" : "SSL Encrypted"}</span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>{isSpanish ? "Firma segura" : "Secure Signing"}</span>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-3">
          &copy; {new Date().getFullYear()} Texas Premium Insurance Services
        </p>
      </div>
    </div>
  );
}
