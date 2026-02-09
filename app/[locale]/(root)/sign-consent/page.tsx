"use client";

import { useState, useRef, useEffect, use } from "react"; // Added 'use'
import { useSearchParams } from "next/navigation";
import {
  FileSignature,
  CheckCircle,
  Type,
  Edit3,
  Upload,
  Loader2,
} from "lucide-react";
import Image from "next/image";

type SignatureMethod = "type" | "draw" | "upload";

// Define the interface for Next.js 15+ async params
interface PageProps {
  params: Promise<{ locale: string }>; // Note: Next.js routing uses the folder name [locale]
}

export default function SignConsentPage({ params }: PageProps) {
  // Unwrap params using React.use()
  const resolvedParams = use(params);
  const lang = resolvedParams.locale; // Matches your folder structure [locale]

  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "0.00";
  const cardLast4 = searchParams.get("card") || "1234";
  const email = searchParams.get("email") || "";
  const method = searchParams.get("method") || "card";
  const phone = searchParams.get("phone") || "";

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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch client IP on mount
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
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  useEffect(() => {
    if (signatureMethod === "draw") {
      setTimeout(initCanvas, 100);
    }
  }, [signatureMethod]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
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
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
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
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
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
        isSpanish ? "Por favor sube una imagen" : "Please upload an image file"
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
        isSpanish ? "Por favor ingrese su nombre" : "Please enter your name"
      );
      return;
    }
    if (!agreedToTerms) {
      alert(
        isSpanish
          ? "Por favor acepta los terminos y condiciones"
          : "Please agree to the terms and conditions"
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
          isSpanish ? "Por favor sube tu firma" : "Please upload your signature"
        );
        return;
      }
      signatureDataUrl = uploadedSignature;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/generate-signed-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          amount,
          cardLast4,
          email,
          signatureDataUrl,
          signatureMethod,
          language: lang,
          clientIP,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate PDF");
      await response.json();
      setIsSigned(true);

      setTimeout(() => {
        window.location.href = `https://www.texaspremiumins.com/${lang}/setup-autopay?method=${method}&phone=${phone}&redirect=autopay`;
      }, 2000);
    } catch (error) {
      console.error("Error:", error);
      alert(
        isSpanish
          ? "Error al procesar la firma. Por favor intenta de nuevo."
          : "Error processing signature. Please try again."
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
      ctx.fillStyle = "#000000";
      ctx.font = "48px 'Brush Script MT', cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      resolve(canvas.toDataURL("image/png"));
    });
  };

  const todayDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (isSigned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isSpanish ? "Firmado Exitosamente!" : "Successfully Signed!"}
          </h2>
          <p className="text-gray-600 mb-4">
            {isSpanish
              ? "Se ha enviado una copia por correo electronico"
              : "A copy has been sent via email"}
          </p>
          <p className="text-gray-600 mb-4">
            {isSpanish
              ? "Redirigiendo a la configuracion de autopago..."
              : "Redirecting to autopay setup..."}
          </p>
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <FileSignature className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isSpanish ? "Autorizacion de Pago" : "Payment Authorization"}
              </h1>
              <p className="text-sm text-gray-600">
                {isSpanish
                  ? "Firma este documento para autorizar el cargo"
                  : "Sign this document to authorize the charge"}
              </p>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  {isSpanish
                    ? "Pago procesado exitosamente"
                    : "Payment processed successfully"}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {isSpanish
                    ? "Por favor firma para completar"
                    : "Please sign to complete"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-6">
            <Image
              src="/logo.png"
              alt="Texas Premium Insurance Services"
              width={200}
              height={80}
              className="mx-auto mb-4"
            />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {isSpanish
                ? "FORMULARIO DE AUTORIZACION DE PAGO"
                : "PAYMENT AUTHORIZATION FORM"}
            </h2>
            <p className="text-sm text-gray-600">{todayDate}</p>
          </div>

          <div className="border-2 border-gray-300 rounded-lg p-6 mb-6 bg-gray-50">
            <p className="text-gray-800 leading-relaxed mb-4">
              {isSpanish ? (
                <>
                  Yo,{" "}
                  <strong>
                    confirmo que soy el titular autorizado de la tarjeta de
                    credito/debito que termina en ****{cardLast4}
                  </strong>
                  . Nadie mas esta utilizando mi tarjeta en mi nombre. Estoy
                  realizando esta transaccion de mi propia voluntad.
                </>
              ) : (
                <>
                  I,{" "}
                  <strong>
                    confirm that I am the authorized holder of the credit/debit
                    card ending in ****{cardLast4}
                  </strong>
                  . No one else is using my card on my behalf. I am making this
                  transaction of my own free will.
                </>
              )}
            </p>

            <p className="text-gray-800 leading-relaxed mb-4">
              {isSpanish ? (
                <>
                  Por la presente autorizo a{" "}
                  <strong>Texas Premium Insurance Services</strong> a procesar
                  un cargo de{" "}
                  <span className="text-2xl font-bold text-blue-600">
                    ${amount}
                  </span>{" "}
                  (USD) a mi tarjeta mencionada anteriormente para el pago de mi
                  poliza de seguro.
                </>
              ) : (
                <>
                  I hereby authorize{" "}
                  <strong>Texas Premium Insurance Services</strong> to process a
                  charge of{" "}
                  <span className="text-2xl font-bold text-blue-600">
                    ${amount}
                  </span>{" "}
                  (USD) to my above-mentioned card for payment of my insurance
                  policy.
                </>
              )}
            </p>

            <ol className="list-decimal list-inside text-gray-700 text-sm space-y-2">
              <li>
                {isSpanish
                  ? `Soy el titular legalmente autorizado de la tarjeta.`
                  : `I am the legally authorized holder of the card.`}
              </li>
              <li>
                {isSpanish
                  ? "Autorizo personalmente esta transaccion."
                  : "I am personally authorizing this transaction."}
              </li>
              <li>
                {isSpanish
                  ? "Acepto que esta firma electronica es legalmente vinculante."
                  : "I agree that this electronic signature is legally binding."}
              </li>
            </ol>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isSpanish
                ? "Nombre completo del titular de la tarjeta"
                : "Card Holder's Full Name"}{" "}
              <span className="text-red-500">*</span>
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
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {isSpanish ? "Metodo de Firma" : "Signature Method"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSignatureMethod("type")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition ${
                  signatureMethod === "type"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                <Type className="w-6 h-6" />
                <span className="text-sm font-medium">
                  {isSpanish ? "Escribir" : "Type"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSignatureMethod("draw")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition ${
                  signatureMethod === "draw"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                <Edit3 className="w-6 h-6" />
                <span className="text-sm font-medium">
                  {isSpanish ? "Dibujar" : "Draw"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSignatureMethod("upload")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition ${
                  signatureMethod === "upload"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">
                  {isSpanish ? "Subir" : "Upload"}
                </span>
              </button>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {isSpanish ? "Firma" : "Signature"}{" "}
                <span className="text-red-500">*</span>
              </label>
              {signatureMethod !== "type" && (
                <button
                  onClick={clearSignature}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {isSpanish ? "Borrar" : "Clear"}
                </button>
              )}
            </div>

            {signatureMethod === "type" && (
              <div className="p-6 border-2 border-gray-200 rounded-lg bg-gray-50 text-center">
                {customerName ? (
                  <p
                    className="text-4xl"
                    style={{ fontFamily: "'Brush Script MT', cursive" }}
                  >
                    {customerName}
                  </p>
                ) : (
                  <p className="text-gray-400 text-sm">
                    {isSpanish
                      ? "Ingrese su nombre arriba"
                      : "Enter your name above"}
                  </p>
                )}
              </div>
            )}

            {signatureMethod === "draw" && (
              <div className="border-2 border-gray-300 rounded-lg bg-white">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full cursor-crosshair rounded-lg"
                  style={{ height: "200px", touchAction: "none" }}
                />
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
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition flex flex-col items-center gap-2"
                >
                  <Upload className="w-12 h-12 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {isSpanish ? "Haz clic para subir" : "Click to upload"}
                  </span>
                </button>
                {uploadedSignature && (
                  <div className="mt-4 p-4 border-2 border-gray-200 rounded-lg bg-gray-50 text-center">
                    <img
                      src={uploadedSignature}
                      alt="Uploaded"
                      className="max-h-32 mx-auto"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {isSpanish
                  ? "Confirmo que soy el titular autorizado y mi firma es vinculante."
                  : "I confirm I am the authorized holder and my signature is binding."}
              </span>
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!customerName.trim() || !agreedToTerms || isSubmitting}
            className="w-full px-6 py-4 bg-gradient-to-r from-red-700 to-blue-800 text-white rounded-lg font-semibold text-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />{" "}
                {isSpanish ? "Procesando..." : "Processing..."}
              </>
            ) : (
              <>
                <FileSignature className="w-6 h-6" />{" "}
                {isSpanish ? "Firmar y Continuar" : "Sign and Continue"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
