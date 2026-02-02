// app/admin/create-quote-proposal/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Shield, Loader2 } from "lucide-react";

export default function CreateQuoteProposal() {
  const [loading, setLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // ✅ Authentication check
  useEffect(() => {
    const checkAuth = () => {
      const savedSession = localStorage.getItem("admin_session");
      if (!savedSession) {
        window.location.href = "/admin";
        return;
      }

      try {
        const session = JSON.parse(savedSession);
        const now = Date.now();

        if (now >= session.expiresAt) {
          localStorage.removeItem("admin_session");
          window.location.href = "/admin";
        } else {
          setIsCheckingAuth(false);
        }
      } catch {
        localStorage.removeItem("admin_session");
        window.location.href = "/admin";
      }
    };

    checkAuth();
    const interval = setInterval(checkAuth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth: string): number => {
    if (!dateOfBirth) return 0;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  };

  const [formData, setFormData] = useState({
    // Customer Info
    customerName: "",
    customerAddress: "",
    customerPhone: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    term: "6", // 6 months or 12 months

    // Drivers
    drivers: [
      {
        name: "",
        dateOfBirth: "",
        licenseNumber: "",
      },
    ],

    // Vehicles
    vehicles: [
      {
        year: "",
        make: "",
        model: "",
        vin: "",
      },
    ],

    // Coverages
    bodilyInjury: "30/60",
    propertyDamage: "25",
    pip: "2500",
    umbi: "30/60",
    umpd: "25",
    comprehensive: "500",
    collision: "500",
    rental: "None",
    rentalAmount: "",
    towing: "None",
    towingAmount: "",

    // Pricing
    paidInFullPrice: "",
    downPayment: "",
    monthlyPaymentEFT: "", // Bank/EFT
    monthlyPaymentRCC: "", // Credit/Debit Card
    monthlyPaymentDirectBill: "", // Direct Bill
  });

  // Driver functions
  const handleDriverChange = (index: number, field: string, value: string) => {
    const newDrivers = [...formData.drivers];
    newDrivers[index] = { ...newDrivers[index], [field]: value };
    setFormData({ ...formData, drivers: newDrivers });
  };

  const addDriver = () => {
    setFormData({
      ...formData,
      drivers: [
        ...formData.drivers,
        { name: "", dateOfBirth: "", licenseNumber: "" },
      ],
    });
  };

  const removeDriver = (index: number) => {
    const newDrivers = formData.drivers.filter((_, i) => i !== index);
    setFormData({ ...formData, drivers: newDrivers });
  };

  // Vehicle functions
  const handleVehicleChange = (index: number, field: string, value: string) => {
    const newVehicles = [...formData.vehicles];
    newVehicles[index] = { ...newVehicles[index], [field]: value };
    setFormData({ ...formData, vehicles: newVehicles });
  };

  const addVehicle = () => {
    setFormData({
      ...formData,
      vehicles: [
        ...formData.vehicles,
        { year: "", make: "", model: "", vin: "" },
      ],
    });
  };

  const removeVehicle = (index: number) => {
    const newVehicles = formData.vehicles.filter((_, i) => i !== index);
    setFormData({ ...formData, vehicles: newVehicles });
  };

  const calculateTotals = () => {
    const down = parseFloat(formData.downPayment) || 0;
    const termMonths = parseInt(formData.term);
    const paidInFull = parseFloat(formData.paidInFullPrice) || 0;

    // Calculate totals for each payment method
    const monthlyEFT = parseFloat(formData.monthlyPaymentEFT) || 0;
    const monthlyRCC = parseFloat(formData.monthlyPaymentRCC) || 0;
    const monthlyDirectBill =
      parseFloat(formData.monthlyPaymentDirectBill) || 0;

    const totalEFT = down + monthlyEFT * (termMonths - 1);
    const totalRCC = down + monthlyRCC * (termMonths - 1);
    const totalDirectBill = down + monthlyDirectBill * (termMonths - 1);

    // Calculate down payment percentages for each
    const downPaymentPercentageEFT =
      totalEFT > 0 ? ((down / totalEFT) * 100).toFixed(2) : "0";
    const downPaymentPercentageRCC =
      totalRCC > 0 ? ((down / totalRCC) * 100).toFixed(2) : "0";
    const downPaymentPercentageDirectBill =
      totalDirectBill > 0 ? ((down / totalDirectBill) * 100).toFixed(2) : "0";

    return {
      paidInFull: paidInFull.toFixed(2),
      totalEFT: totalEFT.toFixed(2),
      totalRCC: totalRCC.toFixed(2),
      totalDirectBill: totalDirectBill.toFixed(2),
      downPaymentPercentageEFT,
      downPaymentPercentageRCC,
      downPaymentPercentageDirectBill,
      savingsEFT: (totalEFT - paidInFull).toFixed(2),
      savingsRCC: (totalRCC - paidInFull).toFixed(2),
      savingsDirectBill: (totalDirectBill - paidInFull).toFixed(2),
    };
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const totals = calculateTotals();

      const response = await fetch("/api/generate-quote-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          totals,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quote_${formData.customerName.replace(
        /\s/g,
        "_"
      )}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  // ✅ Loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-700 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 mt-4">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Auto Insurance Quote Proposal Generator
          </h1>

          {/* Customer Information */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">
              Customer Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) =>
                    setFormData({ ...formData, customerName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) =>
                    setFormData({ ...formData, customerPhone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="(555) 123-4567"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  value={formData.customerAddress}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      customerAddress: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="123 Main St, City, State 12345"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effective Date *
                </label>
                <input
                  type="date"
                  value={formData.effectiveDate}
                  onChange={(e) =>
                    setFormData({ ...formData, effectiveDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Policy Term *
                </label>
                <select
                  value={formData.term}
                  onChange={(e) =>
                    setFormData({ ...formData, term: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="6">6 Months</option>
                  <option value="12">12 Months</option>
                </select>
              </div>
            </div>
          </div>

          {/* Drivers */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 flex-grow">
                Drivers
              </h2>
              <button
                onClick={addDriver}
                className="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
              >
                + Add Driver
              </button>
            </div>

            {formData.drivers.map((driver, index) => (
              <div
                key={index}
                className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50"
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-gray-700">
                    Driver {index + 1}
                  </h3>
                  {formData.drivers.length > 1 && (
                    <button
                      onClick={() => removeDriver(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Driver Name"
                    value={driver.name}
                    onChange={(e) =>
                      handleDriverChange(index, "name", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <div>
                    <input
                      type="date"
                      placeholder="Date of Birth"
                      value={driver.dateOfBirth}
                      onChange={(e) =>
                        handleDriverChange(index, "dateOfBirth", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                    {driver.dateOfBirth && (
                      <p className="text-sm text-gray-600 mt-1">
                        Age: {calculateAge(driver.dateOfBirth)}
                      </p>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="License # (optional)"
                    value={driver.licenseNumber}
                    onChange={(e) =>
                      handleDriverChange(index, "licenseNumber", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Vehicles */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 flex-grow">
                Vehicles
              </h2>
              <button
                onClick={addVehicle}
                className="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
              >
                + Add Vehicle
              </button>
            </div>

            {formData.vehicles.map((vehicle, index) => (
              <div
                key={index}
                className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50"
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-gray-700">
                    Vehicle {index + 1}
                  </h3>
                  {formData.vehicles.length > 1 && (
                    <button
                      onClick={() => removeVehicle(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <input
                    type="text"
                    placeholder="Year"
                    value={vehicle.year}
                    onChange={(e) =>
                      handleVehicleChange(index, "year", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <input
                    type="text"
                    placeholder="Make"
                    value={vehicle.make}
                    onChange={(e) =>
                      handleVehicleChange(index, "make", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <input
                    type="text"
                    placeholder="Model"
                    value={vehicle.model}
                    onChange={(e) =>
                      handleVehicleChange(index, "model", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <input
                    type="text"
                    placeholder="VIN (Last 6)"
                    value={vehicle.vin}
                    onChange={(e) =>
                      handleVehicleChange(index, "vin", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md"
                    maxLength={6}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Coverages */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">
              Coverage Limits
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bodily Injury
                </label>
                <select
                  value={formData.bodilyInjury}
                  onChange={(e) =>
                    setFormData({ ...formData, bodilyInjury: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="30/60">$30,000/$60,000</option>
                  <option value="50/100">$50,000/$100,000</option>
                  <option value="100/300">$100,000/$300,000</option>
                  <option value="250/500">$250,000/$500,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Damage
                </label>
                <select
                  value={formData.propertyDamage}
                  onChange={(e) =>
                    setFormData({ ...formData, propertyDamage: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="25">$25,000</option>
                  <option value="50">$50,000</option>
                  <option value="100">$100,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIP
                </label>
                <select
                  value={formData.pip}
                  onChange={(e) =>
                    setFormData({ ...formData, pip: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="None">None</option>
                  <option value="2500">$2,500</option>
                  <option value="5000">$5,000</option>
                  <option value="10000">$10,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  UMBI
                </label>
                <select
                  value={formData.umbi}
                  onChange={(e) =>
                    setFormData({ ...formData, umbi: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="None">None</option>
                  <option value="30/60">$30,000/$60,000</option>
                  <option value="50/100">$50,000/$100,000</option>
                  <option value="100/300">$100,000/$300,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  UMPD
                </label>
                <select
                  value={formData.umpd}
                  onChange={(e) =>
                    setFormData({ ...formData, umpd: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="None">None</option>
                  <option value="25">$25,000</option>
                  <option value="50">$50,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comprehensive Deductible
                </label>
                <select
                  value={formData.comprehensive}
                  onChange={(e) =>
                    setFormData({ ...formData, comprehensive: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="None">None</option>
                  <option value="250">$250</option>
                  <option value="500">$500</option>
                  <option value="1000">$1,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Collision Deductible
                </label>
                <select
                  value={formData.collision}
                  onChange={(e) =>
                    setFormData({ ...formData, collision: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="None">None</option>
                  <option value="250">$250</option>
                  <option value="500">$500</option>
                  <option value="1000">$1,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rental Reimbursement
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.rental}
                    onChange={(e) => {
                      setFormData({ ...formData, rental: e.target.value });
                      if (e.target.value === "None") {
                        setFormData({
                          ...formData,
                          rental: "None",
                          rentalAmount: "",
                        });
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="None">None</option>
                    <option value="Yes">Yes</option>
                  </select>
                  {formData.rental === "Yes" && (
                    <input
                      type="text"
                      value={formData.rentalAmount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rentalAmount: e.target.value,
                        })
                      }
                      placeholder="30/900"
                      className="w-32 px-3 py-2 border border-gray-300 rounded-md"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Towing & Labor
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.towing}
                    onChange={(e) => {
                      setFormData({ ...formData, towing: e.target.value });
                      if (e.target.value === "None") {
                        setFormData({
                          ...formData,
                          towing: "None",
                          towingAmount: "",
                        });
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="None">None</option>
                    <option value="Yes">Yes</option>
                  </select>
                  {formData.towing === "Yes" && (
                    <input
                      type="text"
                      value={formData.towingAmount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          towingAmount: e.target.value,
                        })
                      }
                      placeholder="75/225"
                      className="w-32 px-3 py-2 border border-gray-300 rounded-md"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">
              Payment Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paid in Full Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.paidInFullPrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paidInFullPrice: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="999.00"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Down Payment (applies to all payment plans) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.downPayment}
                  onChange={(e) =>
                    setFormData({ ...formData, downPayment: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="249.91"
                  required
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
              <h3 className="font-semibold text-gray-800 mb-3">
                Monthly Payment Plans
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    EFT (Bank) Monthly
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.monthlyPaymentEFT}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monthlyPaymentEFT: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="169.99"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RCC (Card) Monthly
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.monthlyPaymentRCC}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monthlyPaymentRCC: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="179.99"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Direct Bill Monthly
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.monthlyPaymentDirectBill}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monthlyPaymentDirectBill: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="189.99"
                  />
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-gray-800 mb-3">
                Payment Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Paid in Full:</span>
                  <span className="font-semibold text-green-600">
                    ${totals.paidInFull}
                  </span>
                </div>

                {formData.monthlyPaymentEFT && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">EFT Plan Total:</span>
                    <span className="font-semibold">
                      ${totals.totalEFT} (Save ${totals.savingsEFT})
                    </span>
                  </div>
                )}

                {formData.monthlyPaymentRCC && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">RCC Plan Total:</span>
                    <span className="font-semibold">
                      ${totals.totalRCC} (Save ${totals.savingsRCC})
                    </span>
                  </div>
                )}

                {formData.monthlyPaymentDirectBill && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Direct Bill Total:</span>
                    <span className="font-semibold">
                      ${totals.totalDirectBill} (Save $
                      {totals.savingsDirectBill})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-end">
            <button
              onClick={generatePDF}
              disabled={
                loading ||
                !formData.customerName ||
                !formData.paidInFullPrice ||
                !formData.customerAddress ||
                !formData.customerPhone
              }
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold text-lg flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                "Generate Quote PDF"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
