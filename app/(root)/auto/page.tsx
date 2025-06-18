"use client";

import { useState } from "react";
import { format, toZonedTime } from "date-fns-tz";
import { LoadScript, Autocomplete } from "@react-google-maps/api";
import Image from "next/image";

// Define types for driver and vehicle objects
interface Driver {
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

interface Vehicle {
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
  DriversNo: number;
  VehicleNo: number;
  drivers: Driver[];
  vehicles: Vehicle[];
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
      DriversNo: 0,
      VehicleNo: 0,
      drivers: [],
      vehicles: [],
      priorCoverage: "",
      priorCoverageMonths: "",
      expirationDate: "",
      membership: "",
    };
  });

  const Maps_API_KEY = "AIzaSyBLuP6q4FOjpst6zlSJw9wFYSfyvQZCJsk";
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
    // are reflected in drivers[0] if DriversNo is 1 or more.
    setFormData((prevFormData) => {
      const newDrivers = [...prevFormData.drivers];
      if (prevFormData.DriversNo > 0) {
        if (newDrivers.length === 0) {
          // If drivers array is empty, initialize the first driver
          newDrivers.push({
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            gender: "", // Default or actual values for required fields
            idType: "",
            idNumber: "",
            relationship: "Policyholder",
          });
        } else {
          // Ensure the first drivers details always match the main form fields
          newDrivers[0] = {
            ...newDrivers[0],
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            relationship: "Policyholder",
          };
        }
      } else {
        // If DriversNo is 0, ensure the drivers array is empty.
        newDrivers.length = 0;
      }

      return {
        ...prevFormData,
        drivers: newDrivers,
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
    const quoteURL = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;

    // Campaign Logic
    const campaign = sessionStorage.getItem("campaignName");
    console.log(campaign);
    if (campaign?.toLowerCase() === "raviraj") {
      const fullName = `${formData.F_name} ${formData.L_name}`.toUpperCase();
      const cleanPhone = formData.phone.replace(/\D/g, "").slice(0, 10); // digits only, max 10

      if (fullName && cleanPhone.length === 10) {
        const campaignURL = `https://astraldbapi.herokuapp.com/gsheetupdate/?name=${encodeURIComponent(
          fullName
        )}&phone=${cleanPhone}`;

        // Send to campaign tracking sheet
        fetch(campaignURL)
          .then((res) => res.json())
          .then((data) => {
            console.log("Data sent to campaign sheet:", data);
          })
          .catch((err) => {
            console.error("Campaign sheet error:", err);
          });
      }
    }

    try {
      const response = await fetch(quoteURL, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const result = await response.json();
      console.log("Message sent successfully:", result);
      alert("An Agent would contact you soon, Thanks for getting a Quote");

      // Reset form data and go back to Step 1
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
        DriversNo: 0,
        VehicleNo: 0,
        drivers: [],
        vehicles: [],
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

  // Initialize drivers array based on DriversNo
  const initializeDrivers = (count: number): Driver[] => {
    const newDrivers = Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        // For the first driver, always pull from formDatas main fields
        return {
          firstName: formData.F_name,
          lastName: formData.L_name,
          dateOfBirth: formData.DOB,
          gender: formData.drivers[0]?.gender || "", // Preserve if already set
          idType: formData.drivers[0]?.idType || "",
          idNumber: formData.drivers[0]?.idNumber || "",
          state: formData.drivers[0]?.state || "",
          country: formData.drivers[0]?.country || "",
          idSubType: formData.drivers[0]?.idSubType || "",
          relationship: "Policyholder",
        };
      } else {
        // For additional drivers, try to preserve their existing data or create new
        return (
          formData.drivers[index] || {
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
    return newDrivers;
  };

  // Initialize vehicles array based on VehicleNo
  const initializeVehicles = (count: number): Vehicle[] => {
    const newVehicles = Array.from({ length: count }, (_, index) => {
      const existingVehicle = formData.vehicles[index] || {
        vinNumber: "",
        make: "",
        model: "",
        year: "",
        coverage: ["Liability"],
      };
      return {
        vinNumber: existingVehicle.vinNumber || "",
        make: existingVehicle.make || "",
        model: existingVehicle.model || "",
        year: existingVehicle.year || "",
        coverage: existingVehicle.coverage || ["Liability"],
      };
    });
    return newVehicles;
  };

  // Updated VIN search function
  const handleVinSearch = async (vehicleIndex: number, vin: string) => {
    if (!vin || vin.length !== 17) {
      return;
    }
    const isDuplicate = formData.vehicles.some(
      (vehicle, index) => index !== vehicleIndex && vehicle.vinNumber === vin
    );
    if (isDuplicate) {
      setVinError("This VIN has already been added to another vehicle.");
      return;
    }
    setVinLoading(vehicleIndex);
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
        const updatedVehicles = [...formData.vehicles];
        updatedVehicles[vehicleIndex] = {
          ...updatedVehicles[vehicleIndex],
          vinNumber: vin,
          make: data.make || "",
          model: data.model || "",
          year: data.year ? data.year.toString() : "",
          coverage: updatedVehicles[vehicleIndex].coverage || [],
        };
        setFormData({
          ...formData,
          vehicles: updatedVehicles,
        });
      } else {
        setVinError("No vehicle info found for that VIN.");
      }
    } catch (err) {
      console.error("VIN API Error:", err);
      setVinError("Something went wrong while searching VIN.");
    } finally {
      setVinLoading(null);
    }
  };

  // Handle VIN input change with automatic search when 17 characters
  const handleVinInputChange = (vehicleIndex: number, value: string) => {
    const updatedVehicles = [...formData.vehicles];
    updatedVehicles[vehicleIndex] = {
      ...updatedVehicles[vehicleIndex],
      vinNumber: value,
      coverage: updatedVehicles[vehicleIndex].coverage || [],
    };
    setFormData({
      ...formData,
      vehicles: updatedVehicles,
    });

    setVinError(""); // Clear previous error

    if (value.length === 17) {
      handleVinSearch(vehicleIndex, value);
    }
  };

  // Handle coverage selection for a vehicle
  const handleCoverageChange = (
    vehicleIndex: number,
    coverageOption: string
  ) => {
    const updatedVehicles = [...formData.vehicles];
    const vehicle = updatedVehicles[vehicleIndex];
    const currentCoverage = vehicle.coverage || [];

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

    // Update vehicle coverage
    updatedVehicles[vehicleIndex] = {
      ...vehicle,
      coverage: newCoverage,
    };

    setFormData({
      ...formData,
      vehicles: updatedVehicles,
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
    const campaignName = localStorage.getItem("campaignName") || "Direct";
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
      drivers,
      vehicles,
      priorCoverage,
      priorCoverageMonths,
      expirationDate,
      membership,
    } = data;

    const personalInfo = `Test \n\n Ref by ${campaignName} \n\n Auto Quote Requested \n\n Personal Info:
      - Name: ${F_name} ${L_name}
      - Address: ${Address}
      - DOB: ${DOB}
      - Phone: ${phone}
      - Email: ${emailAddress}
      - Marital Status: ${maritalStatus}
      - Residency: ${residencyType}
      - Effective Date: ${effectiveDate}`;

    const driverInfo = drivers.length
      ? drivers
          .map((driver, index) => {
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
            } = driver;

            return `Driver ${index + 1}:
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
          })
          .join("\n\n")
      : "No drivers added.";

    const vehicleInfo = vehicles.length
      ? vehicles
          .map((vehicle, index) => {
            const { vinNumber, make, model, year, coverage } = vehicle;
            return `Vehicle ${index + 1}:
      - VIN: ${vinNumber}
      - Make: ${make}
      - Model: ${model}
      - Year: ${year}
      - Coverage: ${coverage.length ? coverage.join(", ") : "None"}`;
          })
          .join("\n\n")
      : "No vehicles added.";

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

    ${driverInfo}

    ${vehicleInfo}

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
                    "Drivers & Vehicles",
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
                  src="/autoquote.png"
                  alt="Banner"
                  width={160}
                  height={80}
                  className="mx-auto mb-4"
                />

                <h1 className="text-2xl font-bold mb-2">
                  Let&apos;s put together a plan that fits you perfectly.
                </h1>
                <p className="text-gray-700">
                  Please fill out the information below as accurately as
                  possible for a precise quote.
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
                Step 2: Driver & Vehicle Information
              </h2>
              <div className="flex gap-4 mb-4">
                <div className="w-1/2">
                  <label className="block mb-1">
                    How many Drivers (including you)
                  </label>
                  <select
                    name="DriversNo"
                    className={`border p-2 w-full rounded ${
                      formData.DriversNo === 0 ? "border-red-500" : ""
                    }`}
                    required
                    value={formData.DriversNo}
                    onChange={(e) => {
                      const numDrivers = parseInt(e.target.value) || 0;
                      setFormData((prevFormData) => ({
                        ...prevFormData,
                        DriversNo: numDrivers,
                        drivers: initializeDrivers(numDrivers),
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
                  <label className="block mb-1">How many Vehicles</label>
                  <select
                    name="VehicleNo"
                    className={`border p-2 w-full rounded ${
                      formData.VehicleNo === 0 ? "border-red-500" : ""
                    }`}
                    value={formData.VehicleNo}
                    required
                    onChange={(e) => {
                      const numVehicles = parseInt(e.target.value) || 0;
                      setFormData((prevFormData) => ({
                        ...prevFormData,
                        VehicleNo: numVehicles,
                        vehicles: initializeVehicles(numVehicles),
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

              {formData.drivers.map((driver, index) => (
                <div key={index} className="mb-4 p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Driver {index + 1}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold">First Name</label>
                      <input
                        type="text"
                        // FOR THE FIRST DRIVER, ALWAYS PULL FROM formData.F_name
                        value={index === 0 ? formData.F_name : driver.firstName}
                        onChange={(e) => {
                          // Only allow changing for additional drivers (index > 0)
                          if (index > 0) {
                            const updatedDrivers = [...formData.drivers];
                            updatedDrivers[index] = {
                              ...updatedDrivers[index],
                              firstName: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              drivers: updatedDrivers,
                            }));
                          }
                        }}
                        className="border p-2 w-full rounded"
                        placeholder="Enter First Name"
                        disabled={index === 0} // Disable for the first driver
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">Last Name</label>
                      <input
                        type="text"
                        // FOR THE FIRST DRIVER, ALWAYS PULL FROM formData.L_name
                        value={index === 0 ? formData.L_name : driver.lastName}
                        onChange={(e) => {
                          // Only allow changing for additional drivers (index > 0)
                          if (index > 0) {
                            const updatedDrivers = [...formData.drivers];
                            updatedDrivers[index] = {
                              ...updatedDrivers[index],
                              lastName: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              drivers: updatedDrivers,
                            }));
                          }
                        }}
                        className="border p-2 w-full rounded"
                        placeholder="Enter Last Name"
                        disabled={index === 0} // Disable for the first driver
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
                        // FOR THE FIRST DRIVER, ALWAYS PULL FROM formData.DOB
                        value={index === 0 ? formData.DOB : driver.dateOfBirth}
                        onChange={(e) => {
                          // Only allow changing for additional drivers (index > 0)
                          if (index > 0) {
                            const updatedDrivers = [...formData.drivers];
                            updatedDrivers[index] = {
                              ...updatedDrivers[index],
                              dateOfBirth: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              drivers: updatedDrivers,
                            }));
                          }
                        }}
                        className="border p-2 w-full rounded"
                        disabled={index === 0} // Disable for the first driver
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
                          value={driver.relationship}
                          onChange={(e) => {
                            const updatedDrivers = [...formData.drivers];
                            updatedDrivers[index] = {
                              ...updatedDrivers[index],
                              relationship: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              drivers: updatedDrivers,
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
                        value={driver.gender}
                        onChange={(e) => {
                          const updatedDrivers = [...formData.drivers];
                          updatedDrivers[index] = {
                            ...updatedDrivers[index],
                            gender: e.target.value,
                          };
                          setFormData((prev) => ({
                            ...prev,
                            drivers: updatedDrivers,
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
                        value={driver.idType}
                        onChange={(e) => {
                          const updatedDrivers = [...formData.drivers];
                          updatedDrivers[index] = {
                            ...updatedDrivers[index],
                            idType: e.target.value,
                            idNumber: "", // Reset related fields when ID Type changes
                            state: "", // Reset state for out-of-state options
                            country: "", // Reset country for international option
                            idSubType: "", // Reset Matricular/Passport selection
                          };
                          setFormData((prev) => ({
                            ...prev,
                            drivers: updatedDrivers,
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

                    {driver.idType === "in-state-dl" && (
                      <div>
                        <label className="block mb-1 font-bold">
                          Driver&apos;s License Number
                        </label>
                        <input
                          type="text"
                          value={driver.idNumber || ""}
                          onChange={(e) => {
                            const onlyNumbers = e.target.value.replace(
                              /\D/g,
                              ""
                            );
                            const updatedDrivers = [...formData.drivers];
                            updatedDrivers[index] = {
                              ...updatedDrivers[index],
                              idNumber: onlyNumbers,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              drivers: updatedDrivers,
                            }));
                          }}
                          className="border p-2 w-full rounded"
                          placeholder="Enter Drivers License Number"
                          required
                          maxLength={8}
                          inputMode="numeric" // Shows numeric keyboard on mobile
                          pattern="[0-9]*" // Allows only digits
                        />
                        {driver.idNumber && driver.idNumber.length !== 8 && (
                          <p className="text-red-500 text-sm mt-1">
                            Driver&apos;s License must be exactly 8 digits.
                          </p>
                        )}
                      </div>
                    )}

                    {driver.idType === "in-state-id" && (
                      <div>
                        <label className="block mb-1 font-bold">
                          ID Number
                        </label>
                        <input
                          type="text"
                          value={driver.idNumber || ""}
                          onChange={(e) => {
                            const updatedDrivers = [...formData.drivers];
                            updatedDrivers[index] = {
                              ...updatedDrivers[index],
                              idNumber: e.target.value,
                            };
                            setFormData((prev) => ({
                              ...prev,
                              drivers: updatedDrivers,
                            }));
                          }}
                          className="border p-2 w-full rounded"
                          placeholder="Enter ID Number"
                          required
                        />
                      </div>
                    )}

                    {driver.idType === "out-of-state-DL" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold">
                            Driver&apos;s License Number
                          </label>
                          <input
                            type="text"
                            value={driver.idNumber || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                idNumber: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
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
                            value={driver.state || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                state: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter State (e.g., TX)"
                            required
                          />
                        </div>
                      </>
                    )}

                    {driver.idType === "out-of-state-ID" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold">
                            ID Number
                          </label>
                          <input
                            type="text"
                            value={driver.idNumber || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                idNumber: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
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
                            value={driver.state || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                state: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
                              }));
                            }}
                            className="border p-2 w-full rounded"
                            placeholder="Enter State (e.g., TX)"
                            required
                          />
                        </div>
                      </>
                    )}

                    {driver.idType === "international" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold">
                            International ID Number
                          </label>
                          <input
                            type="text"
                            value={driver.idNumber || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                idNumber: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
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
                            value={driver.country || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                country: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
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
                            value={driver.idSubType || ""}
                            onChange={(e) => {
                              const updatedDrivers = [...formData.drivers];
                              updatedDrivers[index] = {
                                ...updatedDrivers[index],
                                idSubType: e.target.value,
                              };
                              setFormData((prev) => ({
                                ...prev,
                                drivers: updatedDrivers,
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

              {formData.vehicles.map((vehicle, index) => (
                <div key={index} className="mb-4 p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Vehicle {index + 1}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold">VIN Number</label>
                      <input
                        type="text"
                        value={vehicle.vinNumber}
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
                        value={vehicle.make}
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
                        value={vehicle.model}
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
                        value={vehicle.year}
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
                              "Texas law requires minimum liability coverage of 30/60/25: $30,000 per person for bodily injury, $60,000 total per accident for bodily injury, and $25,000 for property damage. This coverage only pays for damages and injuries you cause to others in an at-fault accident. Liability insurance does not cover your own injuries or vehicle damage - you need additional coverage like collision or comprehensive for that protection.",
                          },
                          {
                            name: "Comprehensive/Collision (Basic Full coverage)",
                            description:
                              "Comprehensive covers damage to your vehicle from non-collision events like theft, weather, vandalism, or animal strikes. Collision covers damage to your vehicle from crashes with other vehicles or objects. Both are optional in Texas but typically required if you have a car loan or lease - together they provide 'full coverage' protecting your own vehicle regardless of fault.",
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
                              "Protects you when the at-fault driver has no insurance or insufficient coverage to pay for your injuries and damages. With 12% of Texas registered vehicles unmatched to insurance policies, this optional coverage is crucial. It also pays if you're in a hit-and-run accident. Texas insurers must offer this coverage, but you can reject it in writing.",
                          },
                          {
                            name: "Towing",
                            description:
                              "Covers the cost of towing your vehicle to a repair shop or safe location after an accident, breakdown, or if your car becomes disabled. This is specifically for towing services only, not other roadside assistance like jump-starts or tire changes. Coverage limits typically range from $50-$200 per towing incident, and it's an optional add-on that helps with unexpected towing expenses.",
                          },
                          {
                            name: "Rental",
                            description:
                              "Covers the cost of a rental car while your vehicle is being repaired after a covered claim or if it's stolen. Typically pays a daily amount (like $30-$50 per day) for a specified number of days (usually 30 days maximum). This optional coverage ensures you stay mobile while your car is out of commission, helping you maintain your daily routine during the repair process.",
                          },
                          {
                            name: "Roadside Assistance",
                            description:
                              "Provides emergency services when your vehicle breaks down or you're stranded, including jump-starts for dead batteries, flat tire changes, lockout assistance, and emergency fuel delivery. Available 24/7 regardless of where the breakdown occurs, this optional coverage. It's separate from towing coverage and focuses on getting you back on the road quickly for minor issues.",
                          },
                        ].map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() =>
                              handleCoverageChange(index, option.name)
                            }
                            className={`px-4 py-2 border rounded-full text-xs font-medium ${
                              vehicle.coverage.includes(option.name)
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
              <div className="mb-4 text-center">
                <div className="w-full">
                  <label className="block mb-1 font-bold">Prior Coverage</label>
                  <label className="block mb-1">
                    (Many companies offer a better price if you have an Active
                    policy with the older Company)
                  </label>
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

                {/* Drivers Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Drivers
                  </h3>
                  {formData.drivers.length > 0 ? (
                    formData.drivers.map((driver, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2">
                          Driver {index + 1}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <p>
                            <span className="font-medium text-gray-700">
                              First Name:
                            </span>{" "}
                            {driver.firstName || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Last Name:
                            </span>{" "}
                            {driver.lastName || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Date of Birth:
                            </span>{" "}
                            {driver.dateOfBirth || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Relationship:
                            </span>{" "}
                            {driver.relationship || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Gender:
                            </span>{" "}
                            {driver.gender || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              ID Type:
                            </span>{" "}
                            {driver.idType || "Not provided"}
                          </p>
                          {driver.idType && (
                            <>
                              <p>
                                <span className="font-medium text-gray-700">
                                  ID Number:
                                </span>{" "}
                                {driver.idNumber || "Not provided"}
                              </p>
                              {["out-of-state-DL", "out-of-state-ID"].includes(
                                driver.idType
                              ) && (
                                <p>
                                  <span className="font-medium text-gray-700">
                                    State:
                                  </span>{" "}
                                  {driver.state || "Not provided"}
                                </p>
                              )}
                              {driver.idType === "international" && (
                                <>
                                  <p>
                                    <span className="font-medium text-gray-700">
                                      Country:
                                    </span>{" "}
                                    {driver.country || "Not provided"}
                                  </p>
                                  <p>
                                    <span className="font-medium text-gray-700">
                                      ID Sub-Type:
                                    </span>{" "}
                                    {driver.idSubType || "Not provided"}
                                  </p>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">No drivers added.</p>
                  )}
                </div>

                {/* Vehicles Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Vehicles
                  </h3>
                  {formData.vehicles.length > 0 ? (
                    formData.vehicles.map((vehicle, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2">
                          Vehicle {index + 1}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <p>
                            <span className="font-medium text-gray-700">
                              VIN Number:
                            </span>{" "}
                            {vehicle.vinNumber || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Make:
                            </span>{" "}
                            {vehicle.make || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Model:
                            </span>{" "}
                            {vehicle.model || "Not provided"}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              Year:
                            </span>{" "}
                            {vehicle.year || "Not provided"}
                          </p>
                          <p className="col-span-2">
                            <span className="font-medium text-gray-700">
                              Coverage:
                            </span>{" "}
                            {vehicle.coverage.length > 0
                              ? vehicle.coverage.join(", ")
                              : "None selected"}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">No vehicles added.</p>
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
