"use client";

import { useState } from "react";
import { format, toZonedTime } from "date-fns-tz";
import { LoadScript, Autocomplete } from "@react-google-maps/api";
import Image from "next/image";

// Define types for Rider and Motorcycle objects
interface Rider {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  idType: string;
  idNumber: string;
  state?: string;
  country?: string;
  idSubType?: string;
  relationship: string;
}

interface Motorcycle {
  vinNumber: string;
  make: string;
  model: string;
  year?: string;
  coverage: string[];
}

// Define type for formData state
interface FormData {
  F_name: string;
  L_name: string;
  Address: string;
  DOB: string;
  phone: string;
  maritalStatus: string;
  residencyType: string;
  effectiveDate: string;
  emailAddress: string;
  policyStartDate: string;
  RidersNo: number;
  MotorcycleNo: number;
  Riders: Rider[];
  Motorcycles: Motorcycle[];
  priorCoverage: string;
  priorCoverageMonths: string;
  expirationDate: string;
  membership: string;
}

export default function AutoQuote() {
  const [step, setStep] = useState(1);
  const [priorCoverage, setPriorCoverage] = useState<string>("");
  const [vinLoading, setVinLoading] = useState<number | null>(null);
  const [vinError, setVinError] = useState<string>("");
  const [isAddressSelected, setIsAddressSelected] = useState(false);

  // Calculate todays date in Central Time for default effective date
  const CENTRAL_TIME_ZONE = "America/Chicago";
  const getTodayInCT = () => {
    const now = new Date();
    const zonedNow = toZonedTime(now, CENTRAL_TIME_ZONE);
    return format(zonedNow, "yyyy-MM-dd");
  };

  const [formData, setFormData] = useState<FormData>(() => {
    const today = getTodayInCT();
    return {
      F_name: "",
      L_name: "",
      Address: "",
      DOB: "",
      phone: "",
      maritalStatus: "",
      residencyType: "",
      effectiveDate: today,
      emailAddress: "",
      policyStartDate: today,
      RidersNo: 0,
      MotorcycleNo: 0,
      Riders: [],
      Motorcycles: [],
      priorCoverage: "",
      priorCoverageMonths: "",
      expirationDate: "",
      membership: "",
    };
  });

  const Maps_API_KEY = "AIzaSyBLuP6q4FOjpst6zlSJw9wFYSfyvQZCJsk"; // **WARNING: Do NOT expose API keys directly in client-side code in a production environment.** This key should be loaded securely (e.g., from environment variables) and restricted to your domain/IP for security.
  const libraries: "places"[] = ["places"];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "phone") {
      const digitsOnly = value.replace(/\D/g, "");
      const limitedDigits = digitsOnly.substring(0, 10);
      let formattedPhoneNumber = limitedDigits;
      if (limitedDigits.length > 6) {
        formattedPhoneNumber = `(${limitedDigits.substring(
          0,
          3
        )}) ${limitedDigits.substring(3, 6)}-${limitedDigits.substring(6, 10)}`;
      } else if (limitedDigits.length > 3) {
        formattedPhoneNumber = `(${limitedDigits.substring(
          0,
          3
        )}) ${limitedDigits.substring(3, 6)}`;
      } else if (limitedDigits.length > 0) {
        formattedPhoneNumber = `(${limitedDigits.substring(0, 3)})`;
      }

      setFormData((prevFormData) => ({
        ...prevFormData,
        phone: formattedPhoneNumber,
      }));
    } else if (name === "popcoverage") {
      setPriorCoverage(value);
    } else {
      setFormData((prevFormData) => ({
        ...prevFormData,
        [name]: value,
      }));
      // Only reset isAddressSelected if the Address field is cleared
      if (name === "Address" && value === "") {
        setIsAddressSelected(false);
      }
    }
  };

  const handleAddressSelect = (
    autocomplete: google.maps.places.Autocomplete
  ) => {
    const place = autocomplete.getPlace();
    if (place) {
      // Add a check that place itself is not null/undefined
      const formattedAddress = place.formatted_address || ""; // Provide a default empty string
      setFormData((prevFormData) => ({
        ...prevFormData,
        Address: formattedAddress,
      }));
      setIsAddressSelected(true);
    }
  };

  const handleSubmitStep1 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAddressSelected) {
      alert("Please select an address from the suggestions.");
      return;
    }

    // After submitting step 1, ensure the primary applicants details
    // are reflected in Riders[0] if RidersNo is 1 or more.
    setFormData((prevFormData) => {
      const newRiders = [...prevFormData.Riders];
      if (prevFormData.RidersNo > 0) {
        if (newRiders.length === 0) {
          // If Riders array is empty, initialize the first Rider
          newRiders.push({
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            gender: "", // Default or actual values for required fields
            idType: "",
            idNumber: "",
            relationship: "Policyholder",
          });
        } else {
          // Ensure the first Riders details always match the main form fields
          newRiders[0] = {
            ...newRiders[0],
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            relationship: "Policyholder",
          };
        }
      } else {
        // If RidersNo is 0, ensure the Riders array is empty.
        newRiders.length = 0;
      }

      return {
        ...prevFormData,
        Riders: newRiders,
      };
    });

    setStep(2); // Go to next step
  };

  const handleSubmitStep2 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setStep(3); // Go to next step
  };

  const handleSubmitStep3 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setStep(4); // Go to next step
  };

  const handleSubmitStep4 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const message = formatQuoteMessage(formData);
    const encodedMessage = encodeURIComponent(message);
    const toNumber = "9727486404";
    const url = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;

    try {
      const response = await fetch(url, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const result = await response.json();
      console.log("Message sent successfully:", result);
      alert("An Agent would contact you soon, Thanks for get a Quote");

      // Reset form data and navigate to Step 1
      const today = getTodayInCT();
      setFormData({
        F_name: "",
        L_name: "",
        Address: "",
        DOB: "",
        phone: "",
        maritalStatus: "",
        residencyType: "",
        effectiveDate: today,
        emailAddress: "",
        policyStartDate: today,
        RidersNo: 0,
        MotorcycleNo: 0,
        Riders: [],
        Motorcycles: [],
        priorCoverage: "",
        priorCoverageMonths: "",
        expirationDate: "",
        membership: "",
      });
      setPriorCoverage("");
      setVinLoading(null);
      setVinError("");
      setIsAddressSelected(false);
      setStep(1);
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send quote via SMS. Please try again.");
    }
  };

  // Initialize Riders array based on RidersNo
  const initializeRiders = (count: number): Rider[] => {
    const newRiders = Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        // For the first Rider, always pull from formDatas main fields
        return {
          firstName: formData.F_name,
          lastName: formData.L_name,
          dateOfBirth: formData.DOB,
          gender: formData.Riders[0]?.gender || "", // Preserve if already set
          idType: formData.Riders[0]?.idType || "",
          idNumber: formData.Riders[0]?.idNumber || "",
          state: formData.Riders[0]?.state || "",
          country: formData.Riders[0]?.country || "",
          idSubType: formData.Riders[0]?.idSubType || "",
          relationship: "Policyholder",
        };
      } else {
        // For additional Riders, try to preserve their existing data or create new
        return (
          formData.Riders[index] || {
            firstName: "",
            lastName: "",
            dateOfBirth: "",
            gender: "",
            idType: "",
            idNumber: "",
            state: "",
            country: "",
            idSubType: "",
            relationship: "",
          }
        );
      }
    });
    return newRiders;
  };

  // Initialize Motorcycles array based on MotorcycleNo
  const initializeMotorcycles = (count: number): Motorcycle[] => {
    const newMotorcycles = Array.from({ length: count }, (_, index) => {
      const existingMotorcycle = formData.Motorcycles[index] || {
        vinNumber: "",
        make: "",
        model: "",
        year: "",
        coverage: ["Liability"],
      };
      return {
        vinNumber: existingMotorcycle.vinNumber || "",
        make: existingMotorcycle.make || "",
        model: existingMotorcycle.model || "",
        year: existingMotorcycle.year || "",
        coverage: existingMotorcycle.coverage || ["Liability"],
      };
    });
    return newMotorcycles;
  };

  // Updated VIN search function
  const handleVinSearch = async (MotorcycleIndex: number, vin: string) => {
    if (!vin || vin.length !== 17) {
      return;
    }
    const isDuplicate = formData.Motorcycles.some(
      (Motorcycle, index) =>
        index !== MotorcycleIndex && Motorcycle.vinNumber === vin
    );
    if (isDuplicate) {
      setVinError("This VIN has already been added to another Motorcycle.");
      return;
    }
    setVinLoading(MotorcycleIndex);
    setVinError("");
    try {
      const response = await fetch(
        `https://astraldbapi.herokuapp.com/basic_vin_data/${vin}`
      );
      if (!response.ok) {
        throw new Error("Invalid VIN or response");
      }
      const data = await response.json();
      if (data && data.vin) {
        const updatedMotorcycles = [...formData.Motorcycles];
        updatedMotorcycles[MotorcycleIndex] = {
          ...updatedMotorcycles[MotorcycleIndex],
          vinNumber: vin,
          make: data.make || "",
          model: data.model || "",
          year: data.year ? data.year.toString() : "",
          coverage: updatedMotorcycles[MotorcycleIndex].coverage || [],
        };
        setFormData({
          ...formData,
          Motorcycles: updatedMotorcycles,
        });
      } else {
        setVinError("No Motorcycle info found for that VIN.");
      }
    } catch (err) {
      console.error("VIN API Error:", err);
      setVinError("Something went wrong while searching VIN.");
    } finally {
      setVinLoading(null);
    }
  };

  // Handle VIN input change with automatic search when 17 characters
  const handleVinInputChange = (MotorcycleIndex: number, value: string) => {
    const updatedMotorcycles = [...formData.Motorcycles];
    updatedMotorcycles[MotorcycleIndex] = {
      ...updatedMotorcycles[MotorcycleIndex],
      vinNumber: value,
      coverage: updatedMotorcycles[MotorcycleIndex].coverage || [],
    };
    setFormData({
      ...formData,
      Motorcycles: updatedMotorcycles,
    });

    setVinError(""); // Clear previous error

    if (value.length === 17) {
      handleVinSearch(MotorcycleIndex, value);
    }
  };

  // Handle coverage selection for a Motorcycle
  const handleCoverageChange = (
    MotorcycleIndex: number,
    coverageOption: string
  ) => {
    const updatedMotorcycles = [...formData.Motorcycles];
    const Motorcycle = updatedMotorcycles[MotorcycleIndex];
    const currentCoverage = Motorcycle.coverage || [];

    // Prevent changes to Liability (mandatory)
    if (
      coverageOption === "Liability" &&
      currentCoverage.includes("Liability")
    ) {
      return;
    }

    // Handle mutual exclusivity between PIP and Medical Payments
    let newCoverage = [...currentCoverage];
    if (coverageOption === "Personal Injury Protection") {
      if (newCoverage.includes("Personal Injury Protection")) {
        // Deselect PIP
        newCoverage = newCoverage.filter(
          (option) => option !== "Personal Injury Protection"
        );
      } else {
        // Select PIP and remove Medical Payments
        newCoverage = newCoverage.filter(
          (option) => option !== "Medical Payments"
        );
        newCoverage.push("Personal Injury Protection");
      }
    } else if (coverageOption === "Medical Payments") {
      if (newCoverage.includes("Medical Payments")) {
        // Deselect Medical Payments
        newCoverage = newCoverage.filter(
          (option) => option !== "Medical Payments"
        );
      } else {
        // Select Medical Payments and remove PIP
        newCoverage = newCoverage.filter(
          (option) => option !== "Personal Injury Protection"
        );
        newCoverage.push("Medical Payments");
      }
    } else {
      // Toggle other coverage options (except Liability)
      if (newCoverage.includes(coverageOption)) {
        newCoverage = newCoverage.filter((option) => option !== coverageOption);
      } else {
        newCoverage.push(coverageOption);
      }
    }

    // Update Motorcycle coverage
    updatedMotorcycles[MotorcycleIndex] = {
      ...Motorcycle,
      coverage: newCoverage,
    };

    setFormData({
      ...formData,
      Motorcycles: updatedMotorcycles,
    });
  };

  const formatPhoneForDisplay = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.substring(0, 3)}) ${digits.substring(
        3,
        6
      )}-${digits.substring(6, 10)}`;
    }
    return phone;
  };

  const formatQuoteMessage = (data: FormData) => {
    const {
      F_name,
      L_name,
      Address,
      DOB,
      phone,
      emailAddress,
      maritalStatus,
      residencyType,
      effectiveDate,
      Riders,
      Motorcycles,
      priorCoverage,
      priorCoverageMonths,
      expirationDate,
      membership,
    } = data;

    const personalInfo = `Test \n\n Motorcycle Quote Requested \n\n Personal Info:
- Name: ${F_name} ${L_name}
- Address: ${Address}
- DOB: ${DOB}
- Phone: ${phone}
- Email: ${emailAddress}
- Marital Status: ${maritalStatus}
- Residency: ${residencyType}
- Effective Date: ${effectiveDate}`;

    const RiderInfo = Riders.length
      ? Riders.map((Rider, index) => {
          const {
            firstName,
            lastName,
            dateOfBirth,
            gender,
            idType,
            idNumber,
            state,
            country,
            idSubType,
            relationship,
          } = Rider;

          return `Rider ${index + 1}:
- Name: ${firstName} ${lastName}
- DOB: ${dateOfBirth}
- Gender: ${gender}
- Relationship: ${relationship || "N/A"}
- ID Type: ${idType}
- ID Number: ${idNumber || "N/A"}
${
  idType === "out-of-state-DL" || idType === "out-of-state-ID"
    ? `- State: ${state || "N/A"}`
    : ""
}
${
  idType === "international"
    ? `- Country: ${country || "N/A"}\n- Sub-Type: ${idSubType || "N/A"}`
    : ""
}`.trim();
        }).join("\n\n")
      : "No Riders added.";

    const MotorcycleInfo = Motorcycles.length
      ? Motorcycles.map((Motorcycle, index) => {
          const { vinNumber, make, model, year, coverage } = Motorcycle;
          return `Motorcycle ${index + 1}:
- VIN: ${vinNumber}
- Make: ${make}
- Model: ${model}
- Year: ${year}
- Coverage: ${coverage.length ? coverage.join(", ") : "None"}`;
        }).join("\n\n")
      : "No Motorcycles added.";

    let coverageDetails = `Prior Coverage: ${priorCoverage || "None"}`;
    if (priorCoverage === "yes") {
      coverageDetails += `\n- Months: ${
        priorCoverageMonths || "N/A"
      }\n- Expiration: ${expirationDate || "N/A"}`;
    }
    if (priorCoverage === "no" || membership) {
      coverageDetails += `\n- Membership: ${membership || "N/A"}`;
    }

    return `${personalInfo}

${RiderInfo}

${MotorcycleInfo}

${coverageDetails}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center items-start py-10">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-5xl text-sm">
        {/* Progress Bar */}
        <div className="flex justify-between items-center mb-6">
          {[1, 2, 3, 4].map((num) => (
            <div key={num} className="flex flex-col items-center">
              <div
                className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${
                  step >= num ? "bg-blue-600 text-white" : "bg-gray-300"
                }`}
              >
                {num}
              </div>
              <div className="text-xs mt-1">
                {
                  [
                    "Info",
                    "Riders & Motorcycles",
                    "Coverage & Discounts",
                    "Review",
                  ][num - 1]
                }
              </div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <LoadScript googleMapsApiKey={Maps_API_KEY} libraries={libraries}>
            <form onSubmit={handleSubmitStep1}>
              <div className="text-center mb-6">
                <Image
                  src="/motorcycle1.png"
                  alt="Banner"
                  width={160}
                  height={80}
                  className="mx-auto mb-4"
                />

                <h1 className="text-2xl font-bold mb-2">
                  Rev Up for the Perfect Motorcycle Insurance Quote!
                </h1>
                <p className="text-xl text-gray-1000">
                  Your ride deserves the best—let’s make sure it’s protected.
                </p>
                <p className="text-gray-700">
                  Fill out the details below to get a fast, accurate quote
                  tailored just for you and your bike.
                </p>
              </div>
              <div className="mb-4 text-center">
                <label className="block text-sm mb-1">
                  Effective Date (Default to Today&apos;s Date click on Calendar
                  to change it)
                </label>
                <input
                  type="date"
                  name="effectiveDate"
                  min={getTodayInCT()}
                  value={formData.effectiveDate}
                  onChange={handleChange}
                  onKeyDown={(e) => e.preventDefault()}
                  className="border p-2 w-48 rounded text-center"
                  required
                />
              </div>

              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">First Name</label>
                  <input
                    type="text"
                    name="F_name"
                    className="border p-2 w-full rounded"
                    placeholder="Enter First Name"
                    value={formData.F_name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">Last Name</label>
                  <input
                    type="text"
                    name="L_name"
                    className="border p-2 w-full rounded"
                    placeholder="Enter Last Name"
                    value={formData.L_name}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">Address</label>
                  <Autocomplete
                    onLoad={(autocomplete) => {
                      autocomplete.addListener("place_changed", () =>
                        handleAddressSelect(autocomplete)
                      );
                    }}
                    onPlaceChanged={() => {}}
                  >
                    <input
                      type="text"
                      name="Address"
                      className="border p-2 w-full rounded"
                      placeholder="Enter Address"
                      value={formData.Address}
                      onChange={handleChange}
                      required
                    />
                  </Autocomplete>
                </div>
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">Date of Birth</label>
                  <input
                    type="date"
                    name="DOB"
                    className="border p-2 w-full rounded"
                    value={formData.DOB}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">Phone Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="phone"
                    placeholder="Enter 10-digit phone number"
                    className="border p-2 w-full rounded"
                    value={formData.phone || ""} // Ensure value is never undefined
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">Email address</label>
                  <input
                    type="email"
                    name="emailAddress"
                    className="border p-2 w-full rounded"
                    placeholder="Enter Email Address"
                    value={formData.emailAddress}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">
                    Marital Status:
                  </label>
                  <label className="block mb-1">
                    Optimize your price by choosing to include or exclude your
                    spouse.
                  </label>
                  <select
                    name="maritalStatus"
                    className="border p-2 w-full rounded"
                    value={formData.maritalStatus}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select...</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="civil_union">Civil Union</option>
                    <option value="divorced">Divorced</option>
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="block mb-1 font-bold">
                    Residency Type:
                  </label>
                  <label className="block mb-1">
                    Homeownership may lower your rate.
                  </label>
                  <select
                    name="residencyType"
                    className="border p-2 w-full rounded"
                    value={formData.residencyType}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select...</option>
                    <option value="own">Own</option>
                    <option value="rent">Rent</option>
                    <option value="parents">Live with Parents</option>
                  </select>
                </div>
              </div>

              <div className="text-center">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            </form>
          </LoadScript>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmitStep2}>
            <div>
              <h2 className="text-xl font-bold mb-4">
                Step 2: Rider & Motorcycle Information
              </h2>
              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1">
                    How many Riders (including you)
                  </label>
                  <select
                    name="RidersNo"
                    className={`border p-2 w-full rounded ${
                      formData.RidersNo === 0 ? "border-red-500" : ""
                    }`}
                    required
                    value={formData.RidersNo}
                    onChange={(e) => {
                      const numRiders = parseInt(e.target.value) || 0;
                      setFormData((prevFormData) => ({
                        ...prevFormData,
                        RidersNo: numRiders,
                        Riders: initializeRiders(numRiders),
                      }));
                    }}
                  >
                    <option value="">Select...</option>
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="block mb-1">How many Motorcycles</label>
                  <select
                    name="MotorcycleNo"
                    className={`border p-2 w-full rounded ${
                      formData.MotorcycleNo === 0 ? "border-red-500" : ""
                    }`}
                    value={formData.MotorcycleNo}
                    required
                    onChange={(e) => {
                      const numMotorcycles = parseInt(e.target.value) || 0;
                      setFormData((prevFormData) => ({
                        ...prevFormData,
                        MotorcycleNo: numMotorcycles,
                        Motorcycles: initializeMotorcycles(numMotorcycles),
                      }));
                    }}
                  >
                    <option value="">Select...</option>
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.Riders.map((Rider, index) => (
                <div key={index} className="mb-4 p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Rider {index + 1}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold">First Name</label>
                      <input
                        type="text"
                        // FOR THE FIRST Rider, ALWAYS PULL FROM formData.F_name
                        value={index === 0 ? formData.F_name : Rider.firstName}
                        onChange={(e) => {
                          // Only allow changing for additional Riders (index > 0)
                          if (index > 0) {
                            const updatedRiders = [...formData.Riders];
                            updatedRiders[index] = {
                              ...updatedRiders[index],
                              firstName: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              Riders: updatedRiders,
                            }));
                          }
                        }}
                        className="border p-2 w-full rounded"
                        placeholder="Enter First Name"
                        disabled={index === 0} // Disable for the first Rider
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">Last Name</label>
                      <input
                        type="text"
                        // FOR THE FIRST Rider, ALWAYS PULL FROM formData.L_name
                        value={index === 0 ? formData.L_name : Rider.lastName}
                        onChange={(e) => {
                          // Only allow changing for additional Riders (index > 0)
                          if (index > 0) {
                            const updatedRiders = [...formData.Riders];
                            updatedRiders[index] = {
                              ...updatedRiders[index],
                              lastName: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              Riders: updatedRiders,
                            }));
                          }
                        }}
                        className="border p-2 w-full rounded"
                        placeholder="Enter Last Name"
                        disabled={index === 0} // Disable for the first Rider
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        // FOR THE FIRST Rider, ALWAYS PULL FROM formData.DOB
                        value={index === 0 ? formData.DOB : Rider.dateOfBirth}
                        onChange={(e) => {
                          // Only allow changing for additional Riders (index > 0)
                          if (index > 0) {
                            const updatedRiders = [...formData.Riders];
                            updatedRiders[index] = {
                              ...updatedRiders[index],
                              dateOfBirth: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              Riders: updatedRiders,
                            }));
                          }
                        }}
                        className="border p-2 w-full rounded"
                        disabled={index === 0} // Disable for the first Rider
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">
                        Relationship
                      </label>
                      {index === 0 ? (
                        <input
                          type="text"
                          value="Policyholder"
                          className="border p-2 w-full rounded bg-gray-100"
                          disabled
                        />
                      ) : (
                        <select
                          value={Rider.relationship}
                          onChange={(e) => {
                            const updatedRiders = [...formData.Riders];
                            updatedRiders[index] = {
                              ...updatedRiders[index],
                              relationship: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              Riders: updatedRiders,
                            }));
                          }}
                          className="border p-2 w-full rounded"
                          required
                        >
                          <option value="">Select...</option>
                          <option value="spouse">Spouse</option>
                          <option value="child">Child</option>
                          <option value="parent">Parent</option>
                          <option value="other_relative">Other Relative</option>
                          <option value="non_relative">Non-Relative</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">Gender</label>
                      <select
                        value={Rider.gender}
                        onChange={(e) => {
                          const updatedRiders = [...formData.Riders];
                          updatedRiders[index] = {
                            ...updatedRiders[index],
                            gender: e.target.value,
                          };
                          setFormData((prev) => ({
                            ...prev,
                            Riders: updatedRiders,
                          }));
                        }}
                        required
                        className="border p-2 w-full rounded"
                      >
                        <option value="">Select...</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">ID Type</label>
                      <select
                        value={Rider.idType}
                        onChange={(e) => {
                          const updatedRiders = [...formData.Riders];
                          updatedRiders[index] = {
                            ...updatedRiders[index],
                            idType: e.target.value,
                            idNumber: "", // Reset related fields when ID Type changes
                            state: "", // Reset state for out-of-state options
                            country: "", // Reset country for international option
                            idSubType: "", // Reset Matricular/Passport selection
                          };
                          setFormData((prev) => ({
                            ...prev,
                            Riders: updatedRiders,
                          }));
                        }}
                        className="border p-2 w-full rounded"
                        required
                      >
                        <option value="">Select...</option>
                        <option value="in-state-dl">
                          In-State Driver&apos;s License
                        </option>
                        <option value="in-state-id">In-State ID</option>
                        <option value="out-of-state-DL">
                          Out-of-State Driver&apos;s License
                        </option>
                        <option value="out-of-state-ID">Out-of-State ID</option>
                        <option value="international">
                          International/Foreign ID/Passport
                        </option>
                      </select>
                    </div>

                    {Rider.idType === "in-state-dl" && (
                      <div>
                        <label className="block mb-1 font-bold">
                          Rider&apos;s License Number
                        </label>
                        <input
                          type="text"
                          value={Rider.idNumber || ""}
                          onChange={(e) => {
                            const onlyNumbers = e.target.value.replace(
                              /\D/g,
                              ""
                            );
                            const updatedRiders = [...formData.Riders];
                            updatedRiders[index] = {
                              ...updatedRiders[index],
                              idNumber: onlyNumbers,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              Riders: updatedRiders,
                            }));
                          }}
                          className="border p-2 w-full rounded"
                          placeholder="Enter Drivers License Number"
                          required
                          maxLength={8}
                          inputMode="numeric" // Shows numeric keyboard on mobile
                          pattern="[0-9]*" // Allows only digits
                        />
                        {Rider.idNumber && Rider.idNumber.length !== 8 && (
                          <p className="text-red-500 text-sm mt-1">
                            Rider&apos;s License must be exactly 8 digits.
                          </p>
                        )}
                      </div>
                    )}

                    {Rider.idType === "in-state-id" && (
                      <div>
                        <label className="block mb-1 font-bold">
                          ID Number
                        </label>
                        <input
                          type="text"
                          value={Rider.idNumber || ""}
                          onChange={(e) => {
                            const updatedRiders = [...formData.Riders];
                            updatedRiders[index] = {
                              ...updatedRiders[index],
                              idNumber: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              Riders: updatedRiders,
                            }));
                          }}
                          className="border p-2 w-full rounded"
                          placeholder="Enter ID Number"
                          required
                        />
                      </div>
                    )}

                    {Rider.idType === "out-of-state-DL" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold">
                            Rider&apos;s License Number
                          </label>
                          <input
                            type="text"
                            value={Rider.idNumber || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                idNumber: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter Drivers License Number"
                            required
                            inputMode="numeric"
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold">State</label>
                          <input
                            type="text"
                            value={Rider.state || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                state: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter State (e.g., TX)"
                            required
                          />
                        </div>
                      </>
                    )}

                    {Rider.idType === "out-of-state-ID" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold">
                            ID Number
                          </label>
                          <input
                            type="text"
                            value={Rider.idNumber || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                idNumber: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter ID Number"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold">State</label>
                          <input
                            type="text"
                            value={Rider.state || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                state: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter State (e.g., TX)"
                            required
                          />
                        </div>
                      </>
                    )}

                    {Rider.idType === "international" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold">
                            International ID Number
                          </label>
                          <input
                            type="text"
                            value={Rider.idNumber || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                idNumber: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter International ID Number"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold">
                            Country
                          </label>
                          <input
                            type="text"
                            value={Rider.country || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                country: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter Country (e.g., Mexico)"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold">
                            ID Type
                          </label>
                          <select
                            value={Rider.idSubType || ""}
                            onChange={(e) => {
                              const updatedRiders = [...formData.Riders];
                              updatedRiders[index] = {
                                ...updatedRiders[index],
                                idSubType: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                Riders: updatedRiders,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            required
                          >
                            <option value="">Select...</option>
                            <option value="matricular">
                              Matricular Consular
                            </option>
                            <option value="passport">Passport</option>
                            <option value="other_foreign">
                              Other Foreign ID
                            </option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {formData.Motorcycles.map((Motorcycle, index) => (
                <div key={index} className="mb-4 p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Motorcycle {index + 1}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold">VIN Number</label>
                      <input
                        type="text"
                        value={Motorcycle.vinNumber}
                        onChange={(e) =>
                          handleVinInputChange(index, e.target.value)
                        }
                        className="border p-2 w-full rounded"
                        placeholder="Enter 17-digit VIN"
                        maxLength={17}
                        required
                      />
                      {vinLoading === index && (
                        <p className="text-blue-500 text-xs mt-1">
                          Searching VIN...
                        </p>
                      )}
                      {vinError && vinLoading !== index && (
                        <p className="text-red-500 text-xs mt-1">{vinError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">Make</label>
                      <input
                        type="text"
                        value={Motorcycle.make}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100"
                        placeholder="Auto-filled from VIN"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">Model</label>
                      <input
                        type="text"
                        value={Motorcycle.model}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100"
                        placeholder="Auto-filled from VIN"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">Year</label>
                      <input
                        type="text"
                        value={Motorcycle.year}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100"
                        placeholder="Auto-filled from VIN"
                        disabled
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block mb-1 font-bold">
                        Coverage Options (Hover over Coverage to see what
                        exactly it covers)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            name: "Liability",
                            description:
                              "Texas law requires minimum liability coverage of 30/60/25: $30,000 per person for bodily injury, $60,000 total per accident for bodily injury, and $25,000 for property damage. This coverage only pays for damages and injuries you cause to others in an at-fault accident. Liability insurance does not cover your own injuries or Motorcycle damage - you need additional coverage like collision or comprehensive for that protection.",
                          },
                          {
                            name: "Comprehensive/Collision (Basic Full coverage)",
                            description:
                              "Comprehensive covers damage to your Motorcycle from non-collision events like theft, weather, vandalism, or animal strikes. Collision covers damage to your Motorcycle from crashes with other Motorcycles or objects. Both are optional in Texas but typically required if you have a car loan or lease - together they provide 'full coverage' protecting your own Motorcycle regardless of fault.",
                          },
                          {
                            name: "Personal Injury Protection",
                            description:
                              "PIP covers your medical expenses, lost wages (up to 80%), and household services regardless of who caused the accident. Texas requires insurance companies to offer at least $2,500 of PIP coverage, though it's optional to purchase. PIP is not mandatory in Texas but provides immediate coverage for you and your passengers without waiting to determine fault in an accident.",
                          },
                          {
                            name: "Medical Payments",
                            description:
                              "MedPay covers medical bills for you and your passengers after an accident, regardless of who's at fault. It's optional in Texas and typically offers coverage in amounts like $1,000, $2,500, or $5,000. Unlike PIP, MedPay only covers medical expenses - no lost wages or household services - making it a simpler, more focused coverage option.",
                          },
                          {
                            name: "Uninsured Motorist",
                            description:
                              "Protects you when the at-fault Rider has no insurance or insufficient coverage to pay for your injuries and damages. With 12% of Texas registered Motorcycles unmatched to insurance policies, this optional coverage is crucial. It also pays if you're in a hit-and-run accident. Texas insurers must offer this coverage, but you can reject it in writing.",
                          },
                          {
                            name: "Towing",
                            description:
                              "Covers the cost of towing your Motorcycle to a repair shop or safe location after an accident, breakdown, or if your car becomes disabled. This is specifically for towing services only, not other roadside assistance like jump-starts or tire changes. Coverage limits typically range from $50-$200 per towing incident, and it's an optional add-on that helps with unexpected towing expenses.",
                          },
                          {
                            name: "Rental",
                            description:
                              "Covers the cost of a rental car while your Motorcycle is being repaired after a covered claim or if it's stolen. Typically pays a daily amount (like $30-$50 per day) for a specified number of days (usually 30 days maximum). This optional coverage ensures you stay mobile while your car is out of commission, helping you maintain your daily routine during the repair process.",
                          },
                          {
                            name: "Roadside Assistance",
                            description:
                              "Provides emergency services when your Motorcycle breaks down or you're stranded, including jump-starts for dead batteries, flat tire changes, lockout assistance, and emergency fuel delivery. Available 24/7 regardless of where the breakdown occurs, this optional coverage. It's separate from towing coverage and focuses on getting you back on the road quickly for minor issues.",
                          },
                        ].map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() =>
                              handleCoverageChange(index, option.name)
                            }
                            className={`px-4 py-2 border rounded-full text-xs font-medium ${
                              Motorcycle.coverage.includes(option.name)
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            } ${
                              option.name === "Liability"
                                ? "opacity-75 cursor-not-allowed"
                                : ""
                            }`}
                            disabled={option.name === "Liability"}
                            title={option.description} // Add tooltip with description
                          >
                            {option.name}
                            {option.name === "Liability" && (
                              <span className="ml-1 text-red-500">*</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        *Liability coverage is mandatory and included by
                        default.
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-gray-300 text-gray-800 px-6 py-2 rounded hover:bg-gray-400"
                >
                  Back
                </button>

                <div className="text-center">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmitStep3}>
            <div>
              <h2 className="text-xl font-bold mb-4">
                Step 3: Coverage & Discounts
              </h2>
              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1">Prior Coverage</label>
                  <select
                    name="popcoverage"
                    className="border p-2 w-full rounded"
                    value={priorCoverage}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              {priorCoverage === "yes" && (
                <div className="flex gap-4 mb-4">
                  <div className="w-1/2">
                    <label className="block mb-1 font-bold">How long</label>
                    <label className="block mb-1 font-bold">
                      (How many months were you with the older company)
                    </label>
                    <select
                      name="priorCoverageMonths"
                      className="border p-2 w-full rounded"
                      required
                      value={formData.priorCoverageMonths}
                      onChange={handleChange}
                    >
                      <option value="">Select...</option>
                      <option value="6">6</option>
                      <option value="12">12</option>
                      <option value="18">18</option>
                      <option value="24">24</option>
                    </select>
                  </div>
                  <div className="w-1/2">
                    <label className="block mb-1 font-bold">
                      Expiration Date
                    </label>
                    <label className="block mb-1">
                      (When did the old policy get cancelled or is it still
                      active)
                    </label>
                    <input
                      type="date"
                      name="expirationDate" // Match the state property name
                      className="border p-2 w-full rounded"
                      required
                      value={formData.expirationDate || ""} // Bind to formData.explanationDate
                      onChange={handleChange}
                      max={getTodayInCT()}
                    />
                  </div>
                </div>
              )}
              {priorCoverage === "no" && (
                <div className="mb-4 text-center">
                  <div className="w-full">
                    <label className="block mb-1 font-bold">Membership</label>
                    <label className="block mb-1">
                      (Many companies offer a better price if you have a
                      Membership with Sam&apos;s or Costco)
                    </label>
                    <select
                      name="membership"
                      className="border p-2 w-full rounded"
                      required
                      value={formData.membership || ""} // Bind to formData.membership
                      onChange={handleChange}
                    >
                      <option value="">Select...</option>
                      <option value="sams_club">Sam&apos;s Club</option>
                      <option value="costco">Costco</option>
                      <option value="none">None</option>{" "}
                      {/* Fixed duplicate value */}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="bg-gray-300 text-gray-800 px-6 py-2 rounded hover:bg-gray-400"
                >
                  Back
                </button>

                <div className="text-center">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* {step == 4 && (
          <div>
            <h2 className="text-xl font-bold mb-4">
              Step 4: Review Your Quote
            </h2>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-xs">
              {JSON.stringify(formData, null, 2)}
            </pre>
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="bg-gray-300 text-gray-800 px-6 py-2 rounded hover:bg-gray-400"
              >
                Back
              </button>
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
              >
                Get Quote
              </button>
            </div>
          </div>
        )} */}
        {step === 4 && (
          <form onSubmit={handleSubmitStep4}>
            <div>
              <h2 className="text-xl font-bold mb-4">
                Step 4: Review Your Quote
              </h2>
              <div className="bg-gray-100 p-6 rounded-lg shadow-inner text-sm">
                {/* Personal Information Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Personal Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <p>
                      <span className="font-medium text-gray-700">
                        First Name:
                      </span>{" "}
                      {formData.F_name || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Last Name:
                      </span>{" "}
                      {formData.L_name || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Address:
                      </span>{" "}
                      {formData.Address || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Date of Birth:
                      </span>{" "}
                      {formData.DOB || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Phone Number:
                      </span>{" "}
                      {formatPhoneForDisplay(formData.phone) || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Email Address:
                      </span>{" "}
                      {formData.emailAddress || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Marital Status:
                      </span>{" "}
                      {formData.maritalStatus || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Residency Type:
                      </span>{" "}
                      {formData.residencyType || "Not provided"}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        Effective Date:
                      </span>{" "}
                      {formData.effectiveDate || "Not provided"}
                    </p>
                  </div>
                </div>

                {/* Riders Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Riders
                  </h3>
                  {formData.Riders.length > 0 ? (
                    formData.Riders.map((Rider, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2">
                          Rider {index + 1}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <p>
                            <span className="font-medium text-gray-700">
                              First Name:
                            </span>{" "}
                            {Rider.firstName || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Last Name:
                            </span>{" "}
                            {Rider.lastName || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Date of Birth:
                            </span>{" "}
                            {Rider.dateOfBirth || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Relationship:
                            </span>{" "}
                            {Rider.relationship || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Gender:
                            </span>{" "}
                            {Rider.gender || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              ID Type:
                            </span>{" "}
                            {Rider.idType || "Not provided"}
                          </p>
                          {Rider.idType && (
                            <>
                              <p>
                                <span className="font-medium text-gray-700">
                                  ID Number:
                                </span>{" "}
                                {Rider.idNumber || "Not provided"}
                              </p>
                              {["out-of-state-DL", "out-of-state-ID"].includes(
                                Rider.idType
                              ) && (
                                <p>
                                  <span className="font-medium text-gray-700">
                                    State:
                                  </span>{" "}
                                  {Rider.state || "Not provided"}
                                </p>
                              )}
                              {Rider.idType === "international" && (
                                <>
                                  <p>
                                    <span className="font-medium text-gray-700">
                                      Country:
                                    </span>{" "}
                                    {Rider.country || "Not provided"}
                                  </p>
                                  <p>
                                    <span className="font-medium text-gray-700">
                                      ID Sub-Type:
                                    </span>{" "}
                                    {Rider.idSubType || "Not provided"}
                                  </p>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">No Riders added.</p>
                  )}
                </div>

                {/* Motorcycles Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Motorcycles
                  </h3>
                  {formData.Motorcycles.length > 0 ? (
                    formData.Motorcycles.map((Motorcycle, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2">
                          Motorcycle {index + 1}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <p>
                            <span className="font-medium text-gray-700">
                              VIN Number:
                            </span>{" "}
                            {Motorcycle.vinNumber || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Make:
                            </span>{" "}
                            {Motorcycle.make || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Model:
                            </span>{" "}
                            {Motorcycle.model || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Year:
                            </span>{" "}
                            {Motorcycle.year || "Not provided"}
                          </p>
                          <p className="col-span-2">
                            <span className="font-medium text-gray-700">
                              Coverage:
                            </span>{" "}
                            {Motorcycle.coverage.length > 0
                              ? Motorcycle.coverage.join(", ")
                              : "None selected"}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">No Motorcycles added.</p>
                  )}
                </div>

                {/* Coverage & Discounts Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Coverage & Discounts
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <p>
                      <span className="font-medium text-gray-700">
                        Prior Coverage:
                      </span>{" "}
                      {priorCoverage || "Not provided"}
                    </p>
                    {priorCoverage === "yes" && (
                      <>
                        <p>
                          <span className="font-medium text-gray-700">
                            Prior Coverage Months:
                          </span>{" "}
                          {formData.priorCoverageMonths || "Not provided"}
                        </p>
                        <p>
                          <span className="font-medium text-gray-700">
                            Expiration Date:
                          </span>{" "}
                          {formData.expirationDate || "Not provided"}
                        </p>
                      </>
                    )}
                    {priorCoverage === "no" && (
                      <p>
                        <span className="font-medium text-gray-700">
                          Membership:
                        </span>{" "}
                        {formData.membership || "Not provided"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="bg-gray-300 text-gray-800 px-6 py-2 rounded hover:bg-gray-400"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                >
                  Get Quote
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
