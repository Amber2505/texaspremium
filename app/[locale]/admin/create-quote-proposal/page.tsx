// admin/create-quote-proposal/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Loader2 } from "lucide-react";
import AdminShell from "../_components/AdminShell";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";

const MAPS_LIBRARIES: "places"[] = ["places"];

type Vehicle = {
  year: string;
  make: string;
  model: string;
  vin: string;
  coverageType: "full" | "liability";
  comprehensive: string;
  collision: string;
  rental: string;
  rentalAmount: string;
  towing: string;
  towingAmount: string;
};

export default function CreateQuoteProposal() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyBmzpqcVcNNEuoCpgrmIcB3mNcRx0Z05zs",
    libraries: MAPS_LIBRARIES,
  });

  const [loading, setLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [vinLoading, setVinLoading] = useState<number | null>(null);
  const [vinErrors, setVinErrors] = useState<Record<number, string>>({});
  const [quoteHistory, setQuoteHistory] = useState<any[]>([]);
  const [markingSold, setMarkingSold] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function deleteQuote(id: string) {
    if (!confirm("Delete this quote?")) return;
    setDeleting(id);
    await fetch(`/api/quote-history/${id}`, { method: "DELETE" });
    setQuoteHistory((prev) => prev.filter((q) => q._id.toString() !== id));
    setDeleting(null);
  }
  const autocompleteRef = useRef<any>(null);
  const turboRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const importTurboRater = async (file: File) => {
    setImporting(true);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch("/api/parse-turborater", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed");
      const d = json.data;
      // Use first driver's name as customer name
      const firstDriverName = d.drivers?.[0]?.name || d.customerName || "";
      setFormData((prev) => ({
        ...prev,
        customerName: firstDriverName || prev.customerName,
        customerAddress: d.customerAddress || prev.customerAddress,
        customerPhone: d.customerPhone || prev.customerPhone,
        effectiveDate: d.effectiveDate || prev.effectiveDate,
        term: d.term || prev.term,
        drivers: d.drivers?.length
          ? d.drivers.map((dr: any, idx: number) => ({
              name:
                idx === 0
                  ? firstDriverName || (dr.name ?? "")
                  : (dr.name ?? ""),
              dateOfBirth: dr.dateOfBirth ?? "",
              licenseNumber: "",
            }))
          : prev.drivers,
        vehicles: d.vehicles?.length
          ? d.vehicles.map((v: any) => ({
              year: v.year ?? "",
              make: v.make ?? "",
              model: v.model ?? "",
              vin: v.vin ?? "",
              coverageType: v.coverageType ?? "liability",
              comprehensive: v.comprehensive ?? "500",
              collision: v.collision ?? "500",
              rental: v.rental ?? "None",
              rentalAmount: v.rentalAmount ?? "",
              towing: v.towing ?? "None",
              towingAmount: v.towingAmount ?? "",
            }))
          : prev.vehicles,
        bodilyInjury: d.bodilyInjury || prev.bodilyInjury,
        propertyDamage: d.propertyDamage || prev.propertyDamage,
        pip: d.pip || prev.pip,
        medPay: d.medPay || prev.medPay,
        umbi: d.umbi || prev.umbi,
        umpd: d.umpd || prev.umpd,
        isNonOwner: d.isNonOwner ?? prev.isNonOwner,
        paidInFullPrice: prev.paidInFullPrice,
        downPayment: prev.downPayment,
        monthlyPaymentEFT: prev.monthlyPaymentEFT,
      }));
    } catch (e: any) {
      setImportError(e.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const checkAuth = () => {
      const s = localStorage.getItem("admin_session");
      if (!s) {
        window.location.href = "/admin";
        return;
      }
      try {
        const session = JSON.parse(s);
        if (Date.now() >= session.expiresAt) {
          localStorage.removeItem("admin_session");
          window.location.href = "/admin";
        } else setIsCheckingAuth(false);
      } catch {
        localStorage.removeItem("admin_session");
        window.location.href = "/admin";
      }
    };
    checkAuth();
    const iv = setInterval(checkAuth, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    fetch("/api/quote-history")
      .then((r) => r.json())
      .then((d) => setQuoteHistory(d.quotes ?? []));
  }, []);

  async function markSold(id: string) {
    setMarkingSold(id);
    await fetch(`/api/quote-history/${id}`, { method: "PATCH" });
    setQuoteHistory((prev) =>
      prev.map((q) => (q._id.toString() === id ? { ...q, status: "sold" } : q)),
    );
    setMarkingSold(null);
  }

  const calculateAge = (dob: string): number => {
    if (!dob) return 0;
    const today = new Date(),
      b = new Date(dob);
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
    return age;
  };

  const blankVehicle = (): Vehicle => ({
    year: "",
    make: "",
    model: "",
    vin: "",
    coverageType: "full",
    comprehensive: "500",
    collision: "500",
    rental: "None",
    rentalAmount: "",
    towing: "None",
    towingAmount: "",
  });

  const [formData, setFormData] = useState({
    customerName: "",
    customerAddress: "",
    customerPhone: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    term: "6",
    drivers: [{ name: "", dateOfBirth: "", licenseNumber: "" }],
    vehicles: [blankVehicle()],
    bodilyInjury: "30/60",
    propertyDamage: "25",
    pip: "None",
    umbi: "None",
    umpd: "None",
    medPay: "None",
    paidInFullPrice: "",
    downPayment: "",
    monthlyPaymentEFT: "",
    monthlyPaymentRCC: "",
    monthlyPaymentDirectBill: "",
    isNonOwner: false,
  });

  const handleDriverChange = (i: number, f: string, v: string) => {
    const d = [...formData.drivers];
    d[i] = { ...d[i], [f]: v };
    setFormData({ ...formData, drivers: d });
  };

  const addDriver = () =>
    setFormData({
      ...formData,
      drivers: [
        ...formData.drivers,
        { name: "", dateOfBirth: "", licenseNumber: "" },
      ],
    });
  const removeDriver = (i: number) =>
    setFormData({
      ...formData,
      drivers: formData.drivers.filter((_, idx) => idx !== i),
    });

  const handleVehicleChange = (i: number, f: string, v: string) => {
    const vs = [...formData.vehicles];
    vs[i] = { ...vs[i], [f]: v } as Vehicle;
    setFormData({ ...formData, vehicles: vs });
  };

  const addVehicle = () =>
    setFormData({
      ...formData,
      vehicles: [...formData.vehicles, blankVehicle()],
    });
  const removeVehicle = (i: number) =>
    setFormData({
      ...formData,
      vehicles: formData.vehicles.filter((_, idx) => idx !== i),
    });

  const handleVinLookup = async (index: number, vin: string) => {
    const errs = { ...vinErrors };
    if (vin.length !== 17) {
      errs[index] = "VIN must be 17 characters.";
      setVinErrors(errs);
      return;
    }
    delete errs[index];
    setVinErrors(errs);
    setVinLoading(index);
    try {
      const res = await fetch(
        `https://astraldbapi.herokuapp.com/basic_vin_data/${vin}`,
      );
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (d?.vin) {
        const vs = [...formData.vehicles];
        vs[index] = {
          ...vs[index],
          vin,
          make: d.make || "",
          model: d.model || "",
          year: d.year?.toString() || "",
        };
        setFormData({ ...formData, vehicles: vs });
      } else
        setVinErrors({
          ...vinErrors,
          [index]: "No vehicle found for this VIN.",
        });
    } catch {
      setVinErrors({ ...vinErrors, [index]: "VIN lookup failed." });
    } finally {
      setVinLoading(null);
    }
  };

  const calculateTotals = () => {
    const down = parseFloat(formData.downPayment) || 0;
    const term = parseInt(formData.term);
    const full = parseFloat(formData.paidInFullPrice) || 0;
    const eft = parseFloat(formData.monthlyPaymentEFT) || 0;
    const rcc = parseFloat(formData.monthlyPaymentRCC) || 0;
    const db = parseFloat(formData.monthlyPaymentDirectBill) || 0;
    const tEFT = down + eft * (term - 1);
    const tRCC = down + rcc * (term - 1);
    const tDB = down + db * (term - 1);
    return {
      paidInFull: full.toFixed(2),
      totalEFT: tEFT.toFixed(2),
      totalRCC: tRCC.toFixed(2),
      totalDirectBill: tDB.toFixed(2),
      savingsEFT: (tEFT - full).toFixed(2),
      savingsRCC: (tRCC - full).toFixed(2),
      savingsDirectBill: (tDB - full).toFixed(2),
    };
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const totals = calculateTotals();
      const res = await fetch("/api/generate-quote-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, totals }),
      });
      if (!res.ok) throw new Error("Failed");

      const { pdfBase64, fileName, pdfUrl } = await res.json();

      fetch("/api/quote-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, totals, pdfUrl }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.id)
            setQuoteHistory((prev) => [
              {
                _id: d.id,
                customerName: formData.customerName,
                customerPhone: formData.customerPhone,
                vehicles: formData.vehicles,
                paidInFull: totals.paidInFull,
                pdfUrl,
                status: "active",
                createdAt: new Date().toISOString(),
              },
              ...prev.slice(0, 19),
            ]);
        });

      const byteArr = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([byteArr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch {
      alert("Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  if (isCheckingAuth)
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );

  const inp =
    "w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm";
  const sel = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm";

  return (
    <AdminShell activePath="/admin/create-quote-proposal">
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Header */}
            <button
              onClick={() => (window.location.href = "/admin")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Admin
            </button>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Auto Insurance Quote Generator
                </h1>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-gray-500">
                    Policy Type:
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="policyType"
                      checked={!formData.isNonOwner}
                      onChange={() =>
                        setFormData((prev) => ({ ...prev, isNonOwner: false }))
                      }
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      Standard
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="policyType"
                      checked={!!formData.isNonOwner}
                      onChange={() =>
                        setFormData((prev) => ({
                          ...prev,
                          isNonOwner: true,
                          vehicles: [],
                        }))
                      }
                    />
                    <span className="text-sm font-semibold text-amber-600">
                      Non-Owner
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {importError && (
                  <p className="text-xs text-red-500">{importError}</p>
                )}
                <button
                  onClick={() => turboRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition text-sm font-medium disabled:opacity-60"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      Import TurboRater PDF
                    </>
                  )}
                </button>
                <input
                  ref={turboRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importTurboRater(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {/* ── Customer Info ─────────────────────────────────────────── */}
            <section className="mb-6">
              <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-3">
                Customer Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={formData.customerName}
                    placeholder="John Doe"
                    onChange={(e) => {
                      const name = e.target.value;
                      const d = [...formData.drivers];
                      d[0] = { ...d[0], name };
                      setFormData({
                        ...formData,
                        customerName: name,
                        drivers: d,
                      });
                    }}
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={formData.customerPhone}
                    placeholder="(972) 555-0123"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customerPhone: e.target.value,
                      })
                    }
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Effective Date *
                  </label>
                  <input
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        effectiveDate: e.target.value,
                      })
                    }
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Term *
                  </label>
                  <select
                    value={formData.term}
                    onChange={(e) =>
                      setFormData({ ...formData, term: e.target.value })
                    }
                    className={sel}
                  >
                    <option value="6">6 Months</option>
                    <option value="12">12 Months</option>
                  </select>
                </div>
                <div className="md:col-span-2 lg:col-span-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Address *
                  </label>
                  {isLoaded ? (
                    <Autocomplete
                      onLoad={(ac) => (autocompleteRef.current = ac)}
                      onPlaceChanged={() => {
                        const place = autocompleteRef.current?.getPlace();
                        if (place?.formatted_address) {
                          setFormData((prev) => ({
                            ...prev,
                            customerAddress: place.formatted_address,
                          }));
                          if (addressInputRef.current) {
                            addressInputRef.current.value =
                              place.formatted_address;
                          }
                        }
                      }}
                      options={{
                        types: ["address"],
                        componentRestrictions: { country: "us" },
                      }}
                    >
                      <input
                        ref={addressInputRef}
                        type="text"
                        value={formData.customerAddress}
                        placeholder="Start typing address…"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customerAddress: e.target.value,
                          })
                        }
                        className={inp}
                        autoComplete="off"
                      />
                    </Autocomplete>
                  ) : (
                    <input
                      type="text"
                      value={formData.customerAddress}
                      placeholder="Loading maps…"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customerAddress: e.target.value,
                        })
                      }
                      className={inp}
                      autoComplete="off"
                    />
                  )}
                </div>
              </div>
            </section>

            {/* ── Drivers ───────────────────────────────────────────────── */}
            <section className="mb-6">
              <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-3">
                Drivers
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {formData.drivers.map((driver, i) => (
                  <div
                    key={i}
                    className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Driver {i + 1}
                      </span>
                      {formData.drivers.length > 1 && (
                        <button
                          onClick={() => removeDriver(i)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Full name"
                        value={driver.name}
                        onChange={(e) =>
                          handleDriverChange(i, "name", e.target.value)
                        }
                        className={inp}
                      />
                      <div>
                        <input
                          type="text"
                          placeholder="Date of birth MM/DD/YYYY"
                          value={driver.dateOfBirth}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const m = raw.match(
                              /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
                            );
                            handleDriverChange(
                              i,
                              "dateOfBirth",
                              m
                                ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
                                : raw,
                            );
                          }}
                          className={inp}
                        />
                        {driver.dateOfBirth && (
                          <p className="text-xs text-blue-600 mt-0.5">
                            Age: {calculateAge(driver.dateOfBirth)}
                          </p>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="License # (optional)"
                        value={driver.licenseNumber ?? ""}
                        onChange={(e) =>
                          handleDriverChange(i, "licenseNumber", e.target.value)
                        }
                        className={inp}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={addDriver}
                className="mt-3 px-4 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm"
              >
                + Add Driver
              </button>
            </section>

            {/* ── Vehicles ──────────────────────────────────────────────── */}
            {formData.isNonOwner && (
              <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                <span className="text-amber-600 text-lg">🚗</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Non-Owner Policy
                  </p>
                  <p className="text-xs text-amber-600">
                    No vehicles needed — this policy covers the driver, not a
                    specific vehicle.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, isNonOwner: false }))
                  }
                  className="ml-auto text-xs text-amber-500 hover:text-amber-700 underline"
                >
                  Switch to standard
                </button>
              </div>
            )}
            {!formData.isNonOwner && (
              <section className="mb-6">
                <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-3">
                  Vehicles
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {formData.vehicles.map((vehicle, i) => (
                    <div
                      key={i}
                      className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            Vehicle {i + 1}
                          </span>
                          {vehicle.vin && (
                            <span className="ml-2 text-xs text-gray-400 font-mono">
                              {vehicle.vin}
                            </span>
                          )}
                        </div>
                        {formData.vehicles.length > 1 && (
                          <button
                            onClick={() => removeVehicle(i)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {/* VIN lookup */}
                      <div className="flex gap-1.5 mb-2">
                        <input
                          type="text"
                          placeholder="VIN (17 chars)"
                          value={vehicle.vin}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase();
                            handleVehicleChange(i, "vin", v);
                            if (v.length === 17) handleVinLookup(i, v);
                          }}
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md font-mono text-xs"
                          maxLength={17}
                        />
                        <button
                          onClick={() => handleVinLookup(i, vehicle.vin)}
                          disabled={
                            vehicle.vin.length !== 17 || vinLoading === i
                          }
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs disabled:bg-gray-300"
                        >
                          {vinLoading === i ? "…" : "Lookup"}
                        </button>
                      </div>
                      {vinErrors[i] && (
                        <p className="text-red-500 text-xs mb-1">
                          {vinErrors[i]}
                        </p>
                      )}

                      {/* Year / Make / Model */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">
                            Year
                          </label>
                          <input
                            readOnly
                            value={vehicle.year}
                            placeholder="—"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded bg-gray-100 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">
                            Make
                          </label>
                          <input
                            readOnly
                            value={vehicle.make}
                            placeholder="—"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded bg-gray-100 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">
                            Model
                          </label>
                          <input
                            readOnly
                            value={vehicle.model}
                            placeholder="—"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded bg-gray-100 text-xs"
                          />
                        </div>
                      </div>

                      {/* Coverage type */}
                      <div className="flex gap-4 mb-2 pt-2 border-t border-gray-200">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`cov-${i}`}
                            checked={vehicle.coverageType === "full"}
                            onChange={() =>
                              handleVehicleChange(i, "coverageType", "full")
                            }
                          />
                          <span className="text-xs font-semibold text-blue-700">
                            Full Coverage
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`cov-${i}`}
                            checked={vehicle.coverageType === "liability"}
                            onChange={() =>
                              handleVehicleChange(
                                i,
                                "coverageType",
                                "liability",
                              )
                            }
                          />
                          <span className="text-xs font-semibold text-gray-600">
                            Liability Only
                          </span>
                        </label>
                      </div>

                      {vehicle.coverageType === "full" && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase">
                              Comp Ded.
                            </label>
                            <select
                              value={vehicle.comprehensive}
                              onChange={(e) =>
                                handleVehicleChange(
                                  i,
                                  "comprehensive",
                                  e.target.value,
                                )
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                            >
                              <option value="250">$250</option>
                              <option value="500">$500</option>
                              <option value="1000">$1,000</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase">
                              Collision Ded.
                            </label>
                            <select
                              value={vehicle.collision}
                              onChange={(e) =>
                                handleVehicleChange(
                                  i,
                                  "collision",
                                  e.target.value,
                                )
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                            >
                              <option value="250">$250</option>
                              <option value="500">$500</option>
                              <option value="1000">$1,000</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase">
                              Rental
                            </label>
                            <div className="flex gap-1">
                              <select
                                value={vehicle.rental}
                                onChange={(e) =>
                                  handleVehicleChange(
                                    i,
                                    "rental",
                                    e.target.value,
                                  )
                                }
                                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                              >
                                <option value="None">None</option>
                                <option value="Yes">Yes</option>
                              </select>
                              {vehicle.rental === "Yes" && (
                                <input
                                  type="text"
                                  placeholder="30/900"
                                  value={vehicle.rentalAmount}
                                  onChange={(e) =>
                                    handleVehicleChange(
                                      i,
                                      "rentalAmount",
                                      e.target.value,
                                    )
                                  }
                                  className="w-16 px-1.5 py-1.5 border border-gray-300 rounded text-xs"
                                />
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase">
                              Towing
                            </label>
                            <div className="flex gap-1">
                              <select
                                value={vehicle.towing}
                                onChange={(e) =>
                                  handleVehicleChange(
                                    i,
                                    "towing",
                                    e.target.value,
                                  )
                                }
                                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                              >
                                <option value="None">None</option>
                                <option value="Yes">Yes</option>
                              </select>
                              {vehicle.towing === "Yes" && (
                                <input
                                  type="text"
                                  placeholder="75/225"
                                  value={vehicle.towingAmount}
                                  onChange={(e) =>
                                    handleVehicleChange(
                                      i,
                                      "towingAmount",
                                      e.target.value,
                                    )
                                  }
                                  className="w-16 px-1.5 py-1.5 border border-gray-300 rounded text-xs"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addVehicle}
                  className="mt-3 px-4 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm"
                >
                  + Add Vehicle
                </button>
              </section>
            )}

            {/* ── Coverage Limits ───────────────────────────────────────── */}
            <section className="mb-6">
              <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-3">
                Policy Coverage Limits
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Bodily Injury
                  </label>
                  <select
                    value={formData.bodilyInjury}
                    onChange={(e) =>
                      setFormData({ ...formData, bodilyInjury: e.target.value })
                    }
                    className={sel}
                  >
                    <option value="30/60">$30k/$60k</option>
                    <option value="50/100">$50k/$100k</option>
                    <option value="100/300">$100k/$300k</option>
                    <option value="250/500">$250k/$500k</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Property Damage
                  </label>
                  <select
                    value={formData.propertyDamage}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        propertyDamage: e.target.value,
                      })
                    }
                    className={sel}
                  >
                    <option value="25">$25,000</option>
                    <option value="50">$50,000</option>
                    <option value="100">$100,000</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    PIP
                  </label>
                  <select
                    value={formData.pip}
                    onChange={(e) =>
                      setFormData({ ...formData, pip: e.target.value })
                    }
                    className={sel}
                  >
                    <option value="None">None</option>
                    <option value="2500">$2,500</option>
                    <option value="5000">$5,000</option>
                    <option value="10000">$10,000</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Med Pay
                  </label>
                  <select
                    value={formData.medPay}
                    onChange={(e) =>
                      setFormData({ ...formData, medPay: e.target.value })
                    }
                    className={sel}
                  >
                    <option value="None">None</option>
                    <option value="1000">$1,000</option>
                    <option value="2000">$2,000</option>
                    <option value="5000">$5,000</option>
                    <option value="10000">$10,000</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    UMBI
                  </label>
                  <select
                    value={formData.umbi}
                    onChange={(e) =>
                      setFormData({ ...formData, umbi: e.target.value })
                    }
                    className={sel}
                  >
                    <option value="None">None</option>
                    <option value="30/60">$30k/$60k</option>
                    <option value="50/100">$50k/$100k</option>
                    <option value="100/300">$100k/$300k</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    UMPD
                  </label>
                  <select
                    value={formData.umpd}
                    onChange={(e) =>
                      setFormData({ ...formData, umpd: e.target.value })
                    }
                    className={sel}
                  >
                    <option value="None">None</option>
                    <option value="25">$25,000</option>
                    <option value="50">$50,000</option>
                  </select>
                </div>
              </div>
            </section>

            {/* ── Payment ───────────────────────────────────────────────── */}
            <section className="mb-6">
              <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-3">
                Payment Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Paid in Full Price *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="999.00"
                    value={formData.paidInFullPrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        paidInFullPrice: e.target.value,
                      })
                    }
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Down Payment *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="249.00"
                    value={formData.downPayment}
                    onChange={(e) =>
                      setFormData({ ...formData, downPayment: e.target.value })
                    }
                    className={inp}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    EFT (Bank) Monthly
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="169.99"
                    value={formData.monthlyPaymentEFT}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monthlyPaymentEFT: e.target.value,
                      })
                    }
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    RCC (Card) Monthly
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="179.99"
                    value={formData.monthlyPaymentRCC}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monthlyPaymentRCC: e.target.value,
                      })
                    }
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Direct Bill Monthly
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="189.99"
                    value={formData.monthlyPaymentDirectBill}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monthlyPaymentDirectBill: e.target.value,
                      })
                    }
                    className={inp}
                  />
                </div>
              </div>

              {/* Payment summary */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Paid in Full:</span>
                  <span className="font-semibold text-green-600">
                    ${totals.paidInFull}
                  </span>
                </div>
                {formData.monthlyPaymentEFT && (
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">EFT Total:</span>
                    <span className="font-semibold">
                      ${totals.totalEFT} (save ${totals.savingsEFT})
                    </span>
                  </div>
                )}
                {formData.monthlyPaymentRCC && (
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">RCC Total:</span>
                    <span className="font-semibold">
                      ${totals.totalRCC} (save ${totals.savingsRCC})
                    </span>
                  </div>
                )}
                {formData.monthlyPaymentDirectBill && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Direct Bill:</span>
                    <span className="font-semibold">
                      ${totals.totalDirectBill} (save $
                      {totals.savingsDirectBill})
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Generate */}
            <div className="flex justify-end mb-8">
              <button
                onClick={generatePDF}
                disabled={
                  loading ||
                  !formData.customerName ||
                  !formData.paidInFullPrice ||
                  !formData.customerAddress ||
                  !formData.customerPhone
                }
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold text-base flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate Quote PDF"
                )}
              </button>
            </div>

            {/* Quote History */}
            {quoteHistory.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-gray-800 border-b pb-1 mb-3">
                  Recent Quotes{" "}
                  <span className="text-sm font-normal text-gray-400">
                    (last 20)
                  </span>
                </h2>
                <div className="space-y-2">
                  {quoteHistory.map((q) => (
                    <div
                      key={q._id.toString()}
                      className={`flex items-center justify-between p-3 rounded-lg border text-sm ${q.status === "sold" ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-wrap">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {q.customerName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {q.customerPhone}
                          </p>
                        </div>
                        <p className="hidden md:block text-xs text-gray-500">
                          {q.vehicles
                            ?.map((v: any) => `${v.year} ${v.make} ${v.model}`)
                            .join(", ")}
                        </p>
                        <p className="text-xs font-semibold text-gray-700">
                          ${q.paidInFull}{" "}
                          <span className="font-normal text-gray-400">
                            full
                          </span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(q.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {q.pdfUrl && (
                          <a
                            href={q.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-full hover:bg-gray-700"
                          >
                            View PDF
                          </a>
                        )}
                        {q.status === "sold" ? (
                          <span className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                            ✓ SOLD
                          </span>
                        ) : (
                          <button
                            onClick={() => markSold(q._id.toString())}
                            disabled={markingSold === q._id.toString()}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full hover:bg-blue-700 disabled:opacity-50"
                          >
                            {markingSold === q._id.toString()
                              ? "Saving…"
                              : "Mark Sold"}
                          </button>
                        )}
                        <button
                          onClick={() => deleteQuote(q._id.toString())}
                          disabled={deleting === q._id.toString()}
                          className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full hover:bg-red-600 disabled:opacity-50"
                        >
                          {deleting === q._id.toString() ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
