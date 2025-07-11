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
  verificationCode?: string;
  inputCode?: string;
}

export default function AutoQuote() {
  const [step, setStep] = useState(1);
  const [priorCoverage, setPriorCoverage] = useState<string>("");
  const [vinLoading, setVinLoading] = useState<number | null>(null);
  const [vinError, setVinError] = useState<string>("");
  const [isAddressSelected, setIsAddressSelected] = useState(false);
  const [phoneError, setPhoneError] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [codeError, setCodeError] = useState<string>("");
  const [addressError, setAddressError] = useState<string>("");
  const [submitError, setSubmitError] = useState<string>("");

  // Calculate today's date in Central Time for default effective date
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
      verificationCode: "",
      inputCode: "",
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
        formattedPhoneNumber = limitedDigits;
      }

      setPhoneError(
        limitedDigits.length !== 10 && limitedDigits.length > 0
          ? "Phone number must be exactly 10 digits."
          : ""
      );

      setFormData((prevFormData) => ({
        ...prevFormData,
        phone: formattedPhoneNumber,
      }));
    } else if (name === "popcoverage") {
      setPriorCoverage(value);
      setFormData((prevFormData) => ({
        ...prevFormData,
        priorCoverage: value,
        priorCoverageMonths:
          value === "no" ? "" : prevFormData.priorCoverageMonths,
        expirationDate: value === "no" ? "" : prevFormData.expirationDate,
      }));
    } else if (name === "inputCode") {
      setFormData((prevFormData) => ({
        ...prevFormData,
        inputCode: value,
      }));
    } else {
      setFormData((prevFormData) => ({
        ...prevFormData,
        [name]: value,
      }));
      if (name === "Address" && value === "") {
        setIsAddressSelected(false);
        setAddressError("");
      } else if (name === "Address") {
        validateAddress(value);
        setIsAddressSelected(value.trim() !== "");
      }
    }
  };

  const validateAddress = (address: string) => {
    const trimmedAddress = address.trim().toLowerCase();
    const isApartmentComplex =
      trimmedAddress.includes("apartments") ||
      trimmedAddress.includes("apts") ||
      trimmedAddress.includes("condo") ||
      trimmedAddress.includes("tower") ||
      trimmedAddress.includes("residence");
    const hasUnitNumber =
      trimmedAddress.includes("apt") ||
      trimmedAddress.includes("unit") ||
      trimmedAddress.includes("#") ||
      trimmedAddress.includes("suite");

    if (isApartmentComplex && !hasUnitNumber) {
      setAddressError(
        "Please verify or add your apartment number (e.g., Apt 1525)."
      );
    } else if (!isApartmentComplex && !hasUnitNumber) {
      setAddressError("");
    } else if (hasUnitNumber) {
      setAddressError("");
    } else {
      setAddressError(
        "Please verify if this is an apartment address and add the apartment number if applicable (e.g., Apt 1525)."
      );
    }
  };

  const handleAddressSelect = (
    autocomplete: google.maps.places.Autocomplete
  ) => {
    const place = autocomplete.getPlace();
    if (place) {
      const formattedAddress = place.formatted_address || "";
      const isTexasAddress = place.address_components?.some(
        (component) =>
          component.types.includes("administrative_area_level_1") &&
          component.short_name === "TX"
      );

      if (!isTexasAddress) {
        alert("Please select an address within Texas.");
        setFormData((prevFormData) => ({
          ...prevFormData,
          Address: "",
        }));
        setIsAddressSelected(false);
        setAddressError("");
        return;
      }

      validateAddress(formattedAddress);
      setFormData((prevFormData) => ({
        ...prevFormData,
        Address: formattedAddress,
      }));
      setIsAddressSelected(true);
    } else {
      setFormData((prevFormData) => ({
        ...prevFormData,
        Address: "",
      }));
      setIsAddressSelected(false);
      setAddressError("");
    }
  };

  const handleSendCode = async () => {
    const phoneDigits = formData.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit phone number.");
      return;
    }

    setIsSending(true);
    setPhoneError("");

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const message = `Your verification code is: ${verificationCode} - Texas Premium Insurance Services`;
    const encodedMessage = encodeURIComponent(message);
    const toNumber = `+1${phoneDigits}`;
    const smsUrl = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;

    try {
      const response = await fetch(smsUrl, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to send verification code");
      }

      setFormData((prev) => ({
        ...prev,
        verificationCode,
      }));
      alert("Verification code sent successfully!");
    } catch (error) {
      setPhoneError("Failed to send verification code. Please try again.");
      console.error("Error sending SMS:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyCode = () => {
    console.log(
      "Verification Check - Code:",
      formData.verificationCode,
      "Input:",
      formData.inputCode
    );
    if (
      formData.inputCode === formData.verificationCode &&
      formData.inputCode
    ) {
      setIsPhoneVerified(true);
      setCodeError("");
      setSubmitError(""); // Clear submitError when verified
      alert("Phone number verified successfully!");
    } else {
      setCodeError("Invalid verification code. Please try again.");
    }
  };

  const handleSubmitStep1 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(
      "Submit Step 1 - isPhoneVerified:",
      isPhoneVerified,
      "Address Error:",
      addressError
    );

    const phoneDigits = formData.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setSubmitError("Please enter a valid 10-digit phone number.");
      return;
    } else if (!isAddressSelected) {
      setSubmitError("Please enter an address.");
      return;
    } else if (addressError) {
      setSubmitError("Please correct the address error before continuing.");
      return;
    } else if (!isPhoneVerified) {
      setSubmitError("Please verify your phone number before continuing.");
      return;
    }

    setSubmitError("");
    setFormData((prevFormData) => {
      const newDrivers = [...prevFormData.drivers];
      if (prevFormData.DriversNo > 0) {
        if (newDrivers.length === 0) {
          newDrivers.push({
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            gender: "",
            idType: "",
            idNumber: "",
            relationship: "Policyholder",
          });
        } else {
          newDrivers[0] = {
            ...newDrivers[0],
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            relationship: "Policyholder",
          };
        }
      } else {
        newDrivers.length = 0;
      }

      return {
        ...prevFormData,
        drivers: newDrivers,
      };
    });

    setStep(2);
  };

  const handleSubmitStep2 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (formData.vehicles.length === 0 || formData.drivers.length === 0) {
      alert("Please add at least one driver and one vehicle.");
      return;
    }

    if (vinError) {
      alert(vinError);
      return;
    }

    const invalidVehicles = formData.vehicles.filter(
      (vehicle) =>
        !vehicle.vinNumber ||
        vehicle.vinNumber.length !== 17 ||
        !vehicle.make ||
        !vehicle.model ||
        !vehicle.year
    );

    if (invalidVehicles.length > 0) {
      alert(
        "One or more VINs are invalid or missing vehicle information. Please verify all VINs before continuing."
      );
      return;
    }

    setStep(3);
  };

  const handleSubmitStep3 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStep(4);
  };

  const handleSubmitStep4 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const message = formatQuoteMessage(formData);
    const encodedMessage = encodeURIComponent(message);
    const toNumber = "9727486404";
    const quoteURL = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;

    const campaign = sessionStorage.getItem("campaignName");
    if (campaign?.toLowerCase() === "raviraj") {
      const fullName = `${formData.F_name} ${formData.L_name}`.toUpperCase();
      const cleanPhone = formData.phone.replace(/\D/g, "").slice(0, 10);

      if (fullName && cleanPhone.length === 10) {
        const campaignURL = `https://astraldbapi.herokuapp.com/gsheetupdate/?name=${encodeURIComponent(
          fullName
        )}&phone=${cleanPhone}`;

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
        verificationCode: "",
        inputCode: "",
      });
      setPriorCoverage("");
      setVinLoading(null);
      setVinError("");
      setIsAddressSelected(false);
      setIsPhoneVerified(false);
      setAddressError("");
      setStep(1);
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send quote via SMS. Please try again.");
    }
  };

  const initializeDrivers = (count: number): Driver[] => {
    const newDrivers = Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        return {
          firstName: formData.F_name,
          lastName: formData.L_name,
          dateOfBirth: formData.DOB,
          gender: formData.drivers[0]?.gender || "",
          idType: formData.drivers[0]?.idType || "",
          idNumber: formData.drivers[0]?.idNumber || "",
          state: formData.drivers[0]?.state || "",
          country: formData.drivers[0]?.country || "",
          idSubType: formData.drivers[0]?.idSubType || "",
          relationship: "Policyholder",
        };
      } else {
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

  const handleVinSearch = async (vehicleIndex: number, vin: string) => {
    if (!vin) {
      setVinError("Please enter a VIN.");
      return;
    }
    if (vin.length !== 17) {
      setVinError("VIN must be exactly 17 characters.");
      return;
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      setVinError(
        "Invalid VIN format. Use only letters (A-Z, excluding I, O, Q) and numbers."
      );
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
        `https://astraldbapi.herokuapp.com/basic_vin_data/${vin}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API error: ${response.status} - ${
            errorText || "Invalid VIN or server error"
          }`
        );
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
        setVinError("No vehicle information found for this VIN.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setVinError(
          err.message.includes("Failed to fetch")
            ? "Unable to connect to the VIN lookup service. Please try again later."
            : `Invalid VIN: ${err.message}`
        );
      } else {
        setVinError("An unexpected error occurred.");
      }
    } finally {
      setVinLoading(null);
    }
  };

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

    setVinError("");

    if (value.length === 17) {
      handleVinSearch(vehicleIndex, value);
    }
  };

  const handleCoverageChange = (
    vehicleIndex: number,
    coverageOption: string
  ) => {
    const updatedVehicles = [...formData.vehicles];
    const vehicle = updatedVehicles[vehicleIndex];
    const currentCoverage = vehicle.coverage || [];

    if (
      coverageOption === "Liability" &&
      currentCoverage.includes("Liability")
    ) {
      return;
    }

    let newCoverage = [...currentCoverage];
    if (coverageOption === "Personal Injury Protection") {
      if (newCoverage.includes("Personal Injury Protection")) {
        newCoverage = newCoverage.filter(
          (option) => option !== "Personal Injury Protection"
        );
      } else {
        newCoverage = newCoverage.filter(
          (option) => option !== "Medical Payments"
        );
        newCoverage.push("Personal Injury Protection");
      }
    } else if (coverageOption === "Medical Payments") {
      if (newCoverage.includes("Medical Payments")) {
        newCoverage = newCoverage.filter(
          (option) => option !== "Medical Payments"
        );
      } else {
        newCoverage = newCoverage.filter(
          (option) => option !== "Personal Injury Protection"
        );
        newCoverage.push("Medical Payments");
      }
    } else {
      if (newCoverage.includes(coverageOption)) {
        newCoverage = newCoverage.filter((option) => option !== coverageOption);
      } else {
        newCoverage.push(coverageOption);
      }
    }

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
    <div className="min-h-screen bg-gray-100 flex justify-center items-start py-4 sm:py-10 px-4 sm:px-0">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg w-full max-w-4xl text-sm">
        {/* Progress Bar */}
        <div className="flex flex-wrap justify-between items-center mb-4 sm:mb-6 gap-2">
          {[1, 2, 3, 4].map((num) => (
            <div key={num} className="flex flex-col items-center">
              <div
                className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-xs sm:text-sm font-bold ${
                  step >= num ? "bg-blue-600 text-white" : "bg-gray-300"
                }`}
              >
                {num}
              </div>
              <div className="text-xs mt-1 text-center">
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
              <div className="text-center mb-4 sm:mb-6">
                <Image
                  src="/autoquote.png"
                  alt="Banner"
                  width={120}
                  height={60}
                  className="mx-auto mb-2 sm:mb-4"
                />
                <h1 className="text-xl sm:text-2xl font-bold mb-2">
                  Let&apos;s put together a plan that fits you perfectly.
                </h1>
                <p className="text-gray-700 text-xs sm:text-sm">
                  Please fill out the information below as accurately as
                  possible for a precise quote.
                </p>
              </div>
              <div className="mb-4 text-center">
                <label className="block text-xs sm:text-sm mb-1">
                  Effective Date (Click calendar to change)
                </label>
                <input
                  type="date"
                  name="effectiveDate"
                  min={getTodayInCT()}
                  value={formData.effectiveDate}
                  onChange={handleChange}
                  onKeyDown={(e) => e.preventDefault()}
                  className="border p-2 w-40 sm:w-48 rounded text-center text-xs sm:text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="F_name"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
                    placeholder="Enter First Name"
                    value={formData.F_name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="L_name"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
                    placeholder="Enter Last Name"
                    value={formData.L_name}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Address
                  </label>
                  <Autocomplete
                    onLoad={(autocomplete) => {
                      autocomplete.addListener("place_changed", () =>
                        handleAddressSelect(autocomplete)
                      );
                      autocomplete.setComponentRestrictions({ country: "us" });
                      const texasBounds = new google.maps.LatLngBounds(
                        new google.maps.LatLng(25.8371, -106.6456),
                        new google.maps.LatLng(36.5007, -93.5083)
                      );
                      autocomplete.setOptions({
                        bounds: texasBounds,
                        strictBounds: true,
                        types: [],
                      });
                    }}
                    onPlaceChanged={() => {}}
                  >
                    <input
                      type="text"
                      name="Address"
                      className={`border p-2 w-full rounded text-xs sm:text-sm ${
                        addressError ? "border-red-500" : ""
                      }`}
                      placeholder="Enter Address (e.g., 123 Main St Apt 1525)"
                      value={formData.Address}
                      onChange={handleChange}
                      required
                      autoComplete="off" // Disable browser autofill
                    />
                  </Autocomplete>
                  {addressError && (
                    <p className="text-red-500 text-xs mt-1">{addressError}</p>
                  )}
                </div>
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="DOB"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
                    value={formData.DOB}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Phone Number
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      name="phone"
                      placeholder="Enter 10-digit phone number"
                      className={`border p-2 w-full rounded text-xs sm:text-sm ${
                        phoneError ? "border-red-500" : ""
                      }`}
                      value={formData.phone || ""}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      className={`px-4 py-2 rounded text-xs sm:text-sm ${
                        isPhoneVerified
                          ? "bg-green-500 text-white hover:bg-green-600"
                          : isSending
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-blue-500 text-white hover:bg-blue-600"
                      }`}
                      onClick={handleSendCode}
                      disabled={isSending || isPhoneVerified}
                    >
                      {isSending
                        ? "Sending..."
                        : isPhoneVerified
                        ? "Verified"
                        : "Send Code"}
                    </button>
                  </div>
                  {phoneError && (
                    <p className="text-red-500 text-xs mt-1">{phoneError}</p>
                  )}
                  {!isPhoneVerified && (
                    <div className="mt-2">
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Verification Code
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          name="inputCode"
                          placeholder="Enter 6-digit code"
                          className={`border p-2 w-full rounded text-xs sm:text-sm ${
                            codeError ? "border-red-500" : ""
                          }`}
                          value={formData.inputCode || ""}
                          onChange={handleChange}
                          maxLength={6}
                        />
                        <button
                          type="button"
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-xs sm:text-sm"
                          onClick={handleVerifyCode}
                        >
                          Verify Code
                        </button>
                      </div>
                      {codeError && (
                        <p className="text-red-500 text-xs mt-1">{codeError}</p>
                      )}
                    </div>
                  )}
                  {submitError && (
                    <p className="text-red-500 text-xs mt-1">{submitError}</p>
                  )}
                  <p className="text-gray-600 text-xs mt-1">
                    Verification Status:{" "}
                    {isPhoneVerified ? "Verified" : "Not Verified"}
                  </p>
                </div>
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="emailAddress"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
                    placeholder="Enter Email Address"
                    value={formData.emailAddress}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Marital Status
                  </label>
                  <label className="block mb-1 text-xs sm:text-sm">
                    Optimize your price by choosing to include or exclude your
                    spouse.
                  </label>
                  <select
                    name="maritalStatus"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
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
                <div>
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Residency Type
                  </label>
                  <label className="block mb-1 text-xs sm:text-sm">
                    Homeownership may lower your rate.
                  </label>
                  <select
                    name="residencyType"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
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
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-blue-700 text-xs sm:text-sm"
                >
                  Continue
                </button>
                {submitError && (
                  <p className="text-red-500 text-xs mt-1">{submitError}</p>
                )}
              </div>
            </form>
          </LoadScript>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmitStep2}>
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-4">
                Step 2: Driver & Vehicle Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1 text-xs sm:text-sm">
                    How many Drivers (including you)
                  </label>
                  <select
                    name="DriversNo"
                    className={`border p-2 w-full rounded text-xs sm:text-sm ${
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
                <div>
                  <label className="block mb-1 text-xs sm:text-sm">
                    How many Vehicles
                  </label>
                  <select
                    name="VehicleNo"
                    className={`border p-2 w-full rounded text-xs sm:text-sm ${
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
                  <h4 className="font-medium mb-2 text-sm sm:text-base">
                    Driver {index + 1}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={index === 0 ? formData.F_name : driver.firstName}
                        onChange={(e) => {
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        placeholder="Enter First Name"
                        disabled={index === 0}
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={index === 0 ? formData.L_name : driver.lastName}
                        onChange={(e) => {
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        placeholder="Enter Last Name"
                        disabled={index === 0}
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={index === 0 ? formData.DOB : driver.dateOfBirth}
                        onChange={(e) => {
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        disabled={index === 0}
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Relationship
                      </label>
                      {index === 0 ? (
                        <input
                          type="text"
                          value="Policyholder"
                          className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
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
                          className="border p-2 w-full rounded text-xs sm:text-sm"
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
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Gender
                      </label>
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                      >
                        <option value="">Select...</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        ID Type
                      </label>
                      <select
                        value={driver.idType}
                        onChange={(e) => {
                          const updatedDrivers = [...formData.drivers];
                          updatedDrivers[index] = {
                            ...updatedDrivers[index],
                            idType: e.target.value,
                            idNumber: "",
                            state: "",
                            country: "",
                            idSubType: "",
                          };
                          setFormData((prev) => ({
                            ...prev,
                            drivers: updatedDrivers,
                          }));
                        }}
                        className="border p-2 w-full rounded text-xs sm:text-sm"
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
                        <label className="block mb-1 font-bold text-xs sm:text-sm">
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
                          className="border p-2 w-full rounded text-xs sm:text-sm"
                          placeholder="Enter Drivers License Number"
                          required
                          maxLength={8}
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        {driver.idNumber && driver.idNumber.length !== 8 && (
                          <p className="text-red-500 text-xs mt-1">
                            Driver&apos;s License must be exactly 8 digits.
                          </p>
                        )}
                      </div>
                    )}

                    {driver.idType === "in-state-id" && (
                      <div>
                        <label className="block mb-1 font-bold text-xs sm:text-sm">
                          ID Number
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
                          className="border p-2 w-full rounded text-xs sm:text-sm"
                          placeholder="Enter ID Number"
                          required
                          maxLength={8}
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </div>
                    )}

                    {driver.idType === "out-of-state-DL" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            Driver&apos;s License Number (Enter as shown on your
                            license)
                          </label>
                          <p className="text-gray-600 text-xs mb-1">
                            Include any letters or numbers exactly as they
                            appear (e.g., A1234567 or X123-4A56).
                          </p>
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder="Enter Drivers License Number"
                            required
                            inputMode="numeric"
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            State
                          </label>
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder="Enter State (e.g., TX)"
                            required
                          />
                        </div>
                      </>
                    )}

                    {driver.idType === "out-of-state-ID" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            ID Number (Enter as shown on your State ID)
                          </label>
                          <p className="text-gray-600 text-xs mb-1">
                            Include any letters or numbers exactly as they
                            appear (e.g., A1234567 or X123-4A56).
                          </p>
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder="Enter ID Number"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            State
                          </label>
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder="Enter State (e.g., TX)"
                            required
                          />
                        </div>
                      </>
                    )}

                    {driver.idType === "international" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder="Enter International ID Number"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder="Enter Country (e.g., Mexico)"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
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
                  <h4 className="font-medium mb-2 text-sm sm:text-base">
                    Vehicle {index + 1}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        VIN Number
                      </label>
                      <input
                        type="text"
                        value={vehicle.vinNumber}
                        onChange={(e) =>
                          handleVinInputChange(index, e.target.value)
                        }
                        className="border p-2 w-full rounded text-xs sm:text-sm"
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
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Make
                      </label>
                      <input
                        type="text"
                        value={vehicle.make}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
                        placeholder="Auto-filled from VIN"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Model
                      </label>
                      <input
                        type="text"
                        value={vehicle.model}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
                        placeholder="Auto-filled from VIN"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Year
                      </label>
                      <input
                        type="text"
                        value={vehicle.year}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
                        placeholder="Auto-filled from VIN"
                        disabled
                      />
                    </div>

                    <div className="col-span-1 sm:col-span-2">
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        Coverage Options
                      </label>
                      <p className="text-gray-600 text-xs mb-2">
                        Hover over the boxes below to see what each coverage
                        means.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            name: "Liability",
                            description:
                              "Texas law requires minimum liability coverage of 30/60/25: $30,000 per person for bodily injury, $60,000 total per accident for bodily injury, and $25,000 for property damage.",
                          },
                          {
                            name: "Comprehensive/Collision",
                            description:
                              "Comprehensive covers non-collision events like theft, weather, vandalism. Collision covers crashes with vehicles or objects.",
                          },
                          {
                            name: "Personal Injury Protection",
                            description:
                              "PIP covers medical expenses, lost wages, and household services regardless of fault.",
                          },
                          {
                            name: "Medical Payments",
                            description:
                              "MedPay covers medical bills for you and passengers, regardless of fault.",
                          },
                          {
                            name: "Uninsured Motorist",
                            description:
                              "Protects you when the at-fault driver has no or insufficient insurance.",
                          },
                          {
                            name: "Towing",
                            description:
                              "Covers towing costs after an accident or breakdown.",
                          },
                          {
                            name: "Rental",
                            description:
                              "Covers rental car costs while your vehicle is repaired.",
                          },
                          {
                            name: "Roadside Assistance",
                            description:
                              "Provides emergency services like jump-starts, tire changes, and fuel delivery.",
                          },
                        ].map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() =>
                              handleCoverageChange(index, option.name)
                            }
                            className={`px-3 py-1 sm:px-4 sm:py-2 border rounded-full text-xs font-medium ${
                              vehicle.coverage.includes(option.name)
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            } ${
                              option.name === "Liability"
                                ? "opacity-75 cursor-not-allowed"
                                : ""
                            }`}
                            title={option.description} // Tooltip on hover
                            disabled={option.name === "Liability"}
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

              <div className="flex flex-col sm:flex-row justify-between mt-4 sm:mt-6 gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-gray-300 text-gray-800 px-4 sm:px-6 py-2 rounded hover:bg-gray-400 text-xs sm:text-sm"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-blue-700 text-xs sm:text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmitStep3}>
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-4">
                Step 3: Coverage & Discounts
              </h2>
              <div className="mb-4 text-center">
                <div className="w-full">
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    Prior Coverage
                  </label>
                  <label className="block mb-1 text-xs sm:text-sm">
                    (Many companies offer a better price if you have an active
                    policy)
                  </label>
                  <select
                    name="popcoverage"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block mb-1 font-bold text-xs sm:text-sm">
                      How long
                    </label>
                    <label className="block mb-1 text-xs sm:text-sm">
                      (Months with the previous company)
                    </label>
                    <select
                      name="priorCoverageMonths"
                      className="border p-2 w-full rounded text-xs sm:text-sm"
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
                  <div>
                    <label className="block mb-1 font-bold text-xs sm:text-sm">
                      Expiration Date
                    </label>
                    <label className="block mb-1 text-xs sm:text-sm">
                      (When did the old policy end or is it active)
                    </label>
                    <input
                      type="date"
                      name="expirationDate"
                      className="border p-2 w-full rounded text-xs sm:text-sm"
                      required
                      value={formData.expirationDate || ""}
                      onChange={handleChange}
                      max={getTodayInCT()}
                    />
                  </div>
                </div>
              )}
              {priorCoverage === "no" && (
                <div className="mb-4 text-center">
                  <div className="w-full">
                    <label className="block mb-1 font-bold text-xs sm:text-sm">
                      Membership
                    </label>
                    <label className="block mb-1 text-xs sm:text-sm">
                      (Sam&apos;s or Costco membership may lower your rate)
                    </label>
                    <select
                      name="membership"
                      className="border p-2 w-full rounded text-xs sm:text-sm"
                      required
                      value={formData.membership || ""}
                      onChange={handleChange}
                    >
                      <option value="">Select...</option>
                      <option value="sams_club">Sam&apos;s Club</option>
                      <option value="costco">Costco</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row justify-between mt-4 sm:mt-6 gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="bg-gray-300 text-gray-800 px-4 sm:px-6 py-2 rounded hover:bg-gray-400 text-xs sm:text-sm"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-blue-700 text-xs sm:text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </form>
        )}

        {step === 4 && (
          <form onSubmit={handleSubmitStep4}>
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-4">
                Step 4: Review Your Quote
              </h2>
              <div className="bg-gray-100 p-4 sm:p-6 rounded-lg shadow-inner text-xs sm:text-sm">
                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
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

                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Drivers
                  </h3>
                  {formData.drivers.length > 0 ? (
                    formData.drivers.map((driver, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2 text-sm sm:text-base">
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

                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    Vehicles
                  </h3>
                  {formData.vehicles.length > 0 ? (
                    formData.vehicles.map((vehicle, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2 text-sm sm:text-base">
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
                          <p className="col-span-1 sm:col-span-2">
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

                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
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

              <div className="flex flex-col sm:flex-row justify-between mt-4 sm:mt-6 gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="bg-gray-300 text-gray-800 px-4 sm:px-6 py-2 rounded hover:bg-gray-400 text-xs sm:text-sm"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="bg-green-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-green-700 text-xs sm:text-sm"
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
