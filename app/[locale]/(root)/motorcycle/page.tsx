/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useCallback, useEffect } from "react";
import { format, toZonedTime } from "date-fns-tz";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import {
  FaCar,
  FaMotorcycle,
  FaHome,
  FaBuilding,
  FaUmbrella,
} from "react-icons/fa";

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
  verificationCode?: string;
  inputCode?: string;
}

// ThankYou component
function ThankYouPage() {
  const t = useTranslations("motorcyclequote");

  const icons = [
    { id: 1, icon: <FaCar size={32} />, x: "-40vw", y: "-20vh" },
    { id: 2, icon: <FaMotorcycle size={28} />, x: "35vw", y: "-25vh" },
    { id: 3, icon: <FaHome size={30} />, x: "-30vw", y: "25vh" },
    { id: 4, icon: <FaBuilding size={34} />, x: "40vw", y: "20vh" },
    { id: 5, icon: <FaUmbrella size={30} />, x: "0vw", y: "35vh" },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 overflow-hidden p-4">
      {icons.map((item) => (
        <motion.div
          key={item.id}
          className="absolute text-blue-300 opacity-30"
          initial={{ x: item.x, y: item.y, scale: 0.8 }}
          animate={{ y: [item.y, `${parseInt(item.y) + 20}vh`, item.y] }}
          transition={{
            repeat: Infinity,
            duration: 8 + item.id,
            ease: "easeInOut",
          }}
        >
          {item.icon}
        </motion.div>
      ))}

      <motion.div
        className="relative flex items-center justify-center mb-10"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.6, ease: "backOut" }}
      >
        <motion.div
          className="w-40 h-40 rounded-full border-4 border-green-500 flex items-center justify-center relative"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
        >
          <motion.div
            className="text-green-500 text-6xl font-bold"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
          >
            ✓
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.h1
        className="text-2xl font-bold text-gray-800 mb-3 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
      >
        {t("thankYou.title")}
      </motion.h1>

      <motion.p
        className="text-lg text-gray-600 mb-2 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        {t("thankYou.reviewing")}
      </motion.p>

      <motion.p
        className="text-lg text-gray-600 mb-2 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.6 }}
      >
        {t("thankYou.working")}
      </motion.p>

      <motion.h3
        className="text-lg text-gray-700 font-medium text-center mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
      >
        {t("thankYou.callYou")}
      </motion.h3>

      <motion.div
        className="text-center mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 0.8 }}
      >
        <p className="text-gray-500 text-sm sm:text-base">
          {t("thankYou.needHelp")}{" "}
          <a
            href="tel:+14697295185"
            className="text-blue-600 font-medium hover:underline"
          >
            {t("thankYou.callNow")}
          </a>
        </p>
        <motion.a
          href="/"
          className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#102a56] transition-colors mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5, duration: 0.6 }}
        >
          {t("thankYou.backHome")}
        </motion.a>
      </motion.div>
    </div>
  );
}

const Maps_API_KEY = "AIzaSyBmzpqcVcNNEuoCpgrmIcB3mNcRx0Z05zs";
const libraries: "places"[] = ["places"];

export default function MotorcycleQuote() {
  const t = useTranslations("motorcyclequote");
  const locale = useLocale();

  // Load Google Maps script once at the top level
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: Maps_API_KEY,
    libraries: libraries,
  });

  // Calculate today's date in Central Time for default effective date
  const CENTRAL_TIME_ZONE = "America/Chicago";
  const getTodayInCT = useCallback(() => {
    const now = new Date();
    const zonedNow = toZonedTime(now, CENTRAL_TIME_ZONE);
    return format(zonedNow, "yyyy-MM-dd");
  }, []);

  // Initialize all state with sessionStorage restoration
  const [step, setStep] = useState(() => {
    // Check if we are in the browser
    if (typeof window !== "undefined") {
      const savedState = sessionStorage.getItem("motorcycleQuoteFormState");
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          return parsed.step || 1;
        } catch (error) {
          return 1;
        }
      }
    }
    return 1;
  });

  const [priorCoverage, setPriorCoverage] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const savedState = sessionStorage.getItem("motorcycleQuoteFormState");
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          return parsed.priorCoverage || "";
        } catch (error) {
          console.log(error);
          return "";
        }
      }
    }
    return "";
  });

  const [isAddressSelected, setIsAddressSelected] = useState(() => {
    if (typeof window !== "undefined") {
      const savedState = sessionStorage.getItem("motorcycleQuoteFormState");
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          return parsed.isAddressSelected || false;
        } catch (error) {
          console.log(error);
          return false;
        }
      }
    }
    return false;
  });

  const [isPhoneVerified, setIsPhoneVerified] = useState(() => {
    if (typeof window !== "undefined") {
      const savedState = sessionStorage.getItem("motorcycleQuoteFormState");
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          return parsed.isPhoneVerified || false;
        } catch (error) {
          console.log(error);
          return false;
        }
      }
    }
    return false;
  });

  const [formData, setFormData] = useState<FormData>(() => {
    const today = getTodayInCT();

    // Check if we are running in the browser
    if (typeof window !== "undefined") {
      const savedState = sessionStorage.getItem("motorcycleQuoteFormState");
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (parsed.formData) {
            return parsed.formData;
          }
        } catch (error) {
          console.error("Error restoring form state:", error);
        }
      }
    }

    // If we are on the server OR no saved state exists, return default
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
      verificationCode: "",
      inputCode: "",
    };
  });

  // Other state variables
  const [vinLoading, setVinLoading] = useState<number | null>(null);
  const [vinError, setVinError] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [codeError, setCodeError] = useState<string>("");
  const [addressError, setAddressError] = useState<string>("");
  const [submitError, setSubmitError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Save form state to sessionStorage whenever it changes
  useEffect(() => {
    if (!submitted) {
      const stateToSave = {
        step,
        formData,
        priorCoverage,
        isAddressSelected,
        isPhoneVerified,
      };
      sessionStorage.setItem(
        "motorcycleQuoteFormState",
        JSON.stringify(stateToSave)
      );
    }
  }, [
    step,
    formData,
    priorCoverage,
    isAddressSelected,
    isPhoneVerified,
    submitted,
  ]);

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
          ? t("step1.errors.phone10Digits")
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
        [name === "userAddressInput" ? "Address" : name]: value,
      }));
      if (name === "userAddressInput" && value === "") {
        setIsAddressSelected(false);
        setAddressError("");
      } else if (name === "userAddressInput") {
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
      trimmedAddress.includes("condominium") ||
      trimmedAddress.includes("tower") ||
      trimmedAddress.includes("residence") ||
      trimmedAddress.includes("residences");

    const hasUnitNumber =
      trimmedAddress.includes("apt") ||
      trimmedAddress.includes("unit") ||
      trimmedAddress.includes("#") ||
      trimmedAddress.includes("suite");

    if (isApartmentComplex && !hasUnitNumber) {
      setAddressError(t("step1.errors.addressApartment"));
    } else if (isApartmentComplex && hasUnitNumber) {
      setAddressError("");
    } else if (!isApartmentComplex) {
      setAddressError("");
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
        alert(t("alerts.texasOnly"));
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
      setPhoneError(t("step1.errors.phone10Digits"));
      return;
    }

    setIsSending(true);
    setPhoneError("");

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const message = `Your verification code is: ${verificationCode} - Texas Premium Insurance Services`;
    const encodedMessage = encodeURIComponent(message);
    const toNumber = `${phoneDigits}`;
    const smsUrl = `https://astraldbapi.herokuapp.com/texas_premium_message_send/?message=${encodedMessage}&To=${toNumber}`;

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
      alert(t("alerts.codeSent"));
    } catch (error) {
      setPhoneError("Failed to send verification code. Please try again.");
      console.error("Error sending SMS:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyCode = () => {
    if (
      formData.inputCode === formData.verificationCode &&
      formData.inputCode
    ) {
      setIsPhoneVerified(true);
      setCodeError("");
      setSubmitError("");
      alert(t("alerts.phoneVerified"));
    } else {
      setCodeError(t("step1.errors.invalidCode"));
    }
  };

  const handleSubmitStep1 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const phoneDigits = formData.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setSubmitError(t("step1.errors.phone10Digits"));
      return;
    } else if (!isAddressSelected) {
      setSubmitError(t("step1.errors.addressRequired"));
      return;
    } else if (addressError) {
      setSubmitError(t("step1.errors.addressError"));
      return;
    } else if (!isPhoneVerified) {
      setSubmitError(t("step1.errors.phoneVerifyRequired"));
      return;
    }

    setSubmitError("");
    setFormData((prevFormData) => {
      const newRiders = [...prevFormData.Riders];
      if (prevFormData.RidersNo > 0) {
        if (newRiders.length === 0) {
          newRiders.push({
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            gender: "",
            idType: "",
            idNumber: "",
            relationship: "Policyholder",
          });
        } else {
          newRiders[0] = {
            ...newRiders[0],
            firstName: prevFormData.F_name,
            lastName: prevFormData.L_name,
            dateOfBirth: prevFormData.DOB,
            relationship: "Policyholder",
          };
        }
      } else {
        newRiders.length = 0;
      }

      return {
        ...prevFormData,
        Riders: newRiders,
      };
    });

    setStep(2);
  };

  const handleSubmitStep2 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (formData.Motorcycles.length === 0 || formData.Riders.length === 0) {
      alert(t("step2.motorcycle.errors.atLeastOne"));
      return;
    }

    if (vinError) {
      alert(vinError);
      return;
    }

    const invalidMotorcycles = formData.Motorcycles.filter(
      (motorcycle) =>
        !motorcycle.vinNumber ||
        motorcycle.vinNumber.length !== 17 ||
        !motorcycle.make ||
        !motorcycle.model ||
        !motorcycle.year
    );

    if (invalidMotorcycles.length > 0) {
      alert(t("step2.motorcycle.errors.invalidVin"));
      return;
    }

    setStep(3);
  };

  const handleSubmitStep3 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStep(4);
  };

  const handleSubmitStep4 = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) return;
      setIsSubmitting(true);

      const submissionId = Math.random().toString(36).substring(2, 15);

      try {
        const message = formatQuoteMessage(formData, locale);
        const encodedMessage = encodeURIComponent(message);
        const toNumber = "9727486404";
        const uniqueId = Date.now().toString();
        const quoteURL = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}&uniqueId=${uniqueId}`;

        const campaign = sessionStorage.getItem("campaignName");
        if (campaign?.toLowerCase() === "raviraj") {
          const fullName =
            `${formData.F_name} ${formData.L_name}`.toUpperCase();
          const cleanPhone = formData.phone.replace(/\D/g, "").slice(0, 10);
          const privateId =
            process.env.NEXT_PUBLIC_RAVIRAJ_PRIVATE_ID || "default_private_id";
          const publicId =
            process.env.NEXT_PUBLIC_RAVIRAJ_PUBLIC_ID || "default_public_id";

          if (fullName && cleanPhone.length === 10 && privateId && publicId) {
            const campaignURL = `https://astraldbapi.herokuapp.com/gsheetupdate/?name=${encodeURIComponent(
              fullName
            )}&phone=${cleanPhone}&private_id=${encodeURIComponent(
              privateId
            )}&public_id=${encodeURIComponent(publicId)}`;

            try {
              const campaignResponse = await fetch(campaignURL, {
                method: "GET",
              });
              if (!campaignResponse.ok) {
                throw new Error(
                  `Campaign sheet update failed: ${campaignResponse.status}`
                );
              }
              const campaignData = await campaignResponse.json();
              console.log("Data sent to campaign sheet:", campaignData);
            } catch (err) {
              console.error("Campaign sheet error:", err);
            }
          }
        }

        const response = await fetch(quoteURL, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const result = await response.json();
        console.log(
          `Message sent successfully for submission: ${submissionId}`,
          result
        );

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
        setSubmitted(true);
        sessionStorage.removeItem("motorcycleQuoteFormState");
      } catch (error) {
        console.error(`Error in submission ${submissionId}:`, error);
        alert(t("alerts.failedToSend"));
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, getTodayInCT, isSubmitting, t, locale]
  );

  const initializeRiders = (count: number): Rider[] => {
    const newRiders = Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        return {
          firstName: formData.F_name,
          lastName: formData.L_name,
          dateOfBirth: formData.DOB,
          gender: formData.Riders[0]?.gender || "",
          idType: formData.Riders[0]?.idType || "",
          idNumber: formData.Riders[0]?.idNumber || "",
          state: formData.Riders[0]?.state || "",
          country: formData.Riders[0]?.country || "",
          idSubType: formData.Riders[0]?.idSubType || "",
          relationship: "Policyholder",
        };
      } else {
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

  const handleVinSearch = async (MotorcycleIndex: number, vin: string) => {
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

    const isDuplicate = formData.Motorcycles.some(
      (Motorcycle, index) =>
        index !== MotorcycleIndex && Motorcycle.vinNumber === vin
    );
    if (isDuplicate) {
      setVinError(t("step2.motorcycle.errors.duplicateVin"));
      return;
    }

    setVinLoading(MotorcycleIndex);
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
        setVinError(t("step2.motorcycle.errors.noInfo"));
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

    setVinError("");

    if (value.length === 17) {
      handleVinSearch(MotorcycleIndex, value);
    }
  };

  const handleCoverageChange = (
    MotorcycleIndex: number,
    coverageOption: string
  ) => {
    const updatedMotorcycles = [...formData.Motorcycles];
    const Motorcycle = updatedMotorcycles[MotorcycleIndex];
    const currentCoverage = Motorcycle.coverage || [];

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

  const formatQuoteMessage = (data: FormData, locale: string) => {
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
      Riders,
      Motorcycles,
      priorCoverage,
      priorCoverageMonths,
      expirationDate,
      membership,
    } = data;

    const languageIndicator = locale === "es" ? " - Spanish" : "";
    const personalInfo = `Test${languageIndicator} \n\n Ref by ${campaignName} \n\n Motorcycle Quote Requested \n\n Personal Info:
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

  // Show loading state while Google Maps is loading
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Error loading maps
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (submitted) {
    return <ThankYouPage />;
  }

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
                {t(`progressBar.step${num}`)}
              </div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <form onSubmit={handleSubmitStep1}>
            <div className="text-center mb-4 sm:mb-6">
              <Image
                src="/motorcycle1.png"
                alt="Banner"
                width={120}
                height={60}
                className="mx-auto mb-2 sm:mb-4"
              />

              <h1 className="text-xl sm:text-2xl font-bold mb-2">
                {t("step1.title")}
              </h1>
              <p className="text-lg sm:text-xl text-gray-1000">
                {t("step1.subtitle")}
              </p>
              <p className="text-gray-700 text-xs sm:text-sm">
                {t("step1.description")}
              </p>
            </div>
            <div className="mb-4 text-center">
              <label className="block text-xs sm:text-sm mb-1">
                {t("step1.effectiveDate")}
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
                  {t("step1.firstName")}
                </label>
                <input
                  type="text"
                  name="F_name"
                  className="border p-2 w-full rounded text-xs sm:text-sm"
                  placeholder={t("step1.placeholders.firstName")}
                  value={formData.F_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label className="block mb-1 font-bold text-xs sm:text-sm">
                  {t("step1.lastName")}
                </label>
                <input
                  type="text"
                  name="L_name"
                  className="border p-2 w-full rounded text-xs sm:text-sm"
                  placeholder={t("step1.placeholders.lastName")}
                  value={formData.L_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block mb-1 font-bold text-xs sm:text-sm">
                  {t("step1.address")}
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
                    placeholder={t("step1.placeholders.address")}
                    value={formData.Address}
                    onChange={handleChange}
                    onFocus={() => {
                      setFormData((prev) => ({ ...prev, Address: "" }));
                      setIsAddressSelected(false);
                      setAddressError("");
                    }}
                    required
                    autoComplete="new-address"
                    key={`address-input-${step}`}
                  />
                </Autocomplete>
                {addressError && (
                  <p className="text-red-500 text-xs mt-1">{addressError}</p>
                )}
              </div>
              <div>
                <label className="block mb-1 font-bold text-xs sm:text-sm">
                  {t("step1.dob")}
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
                  {t("step1.phone")}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    name="phone"
                    placeholder={t("step1.placeholders.phone")}
                    className={`border p-2 w-full rounded text-xs sm:text-sm ${
                      phoneError ? "border-red-500" : ""
                    }`}
                    value={formData.phone || ""}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className={`px-4 py-2 rounded text-xs sm:text-sm whitespace-nowrap ${
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
                      ? t("step1.verification.sending")
                      : isPhoneVerified
                      ? t("step1.verification.verified")
                      : t("step1.verification.sendCode")}
                  </button>
                </div>
                {phoneError && (
                  <p className="text-red-500 text-xs mt-1">{phoneError}</p>
                )}
                {!isPhoneVerified && (
                  <div className="mt-2">
                    <label className="block mb-1 font-bold text-xs sm:text-sm">
                      {t("step1.verification.verificationCode")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="inputCode"
                        placeholder={t("step1.verification.enterCode")}
                        className={`border p-2 w-full rounded text-xs sm:text-sm ${
                          codeError ? "border-red-500" : ""
                        }`}
                        value={formData.inputCode || ""}
                        onChange={handleChange}
                        maxLength={6}
                      />
                      <button
                        type="button"
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-xs sm:text-sm whitespace-nowrap"
                        onClick={handleVerifyCode}
                      >
                        {t("step1.verification.verifyButton")}
                      </button>
                    </div>
                    {codeError && (
                      <p className="text-red-500 text-xs mt-1">{codeError}</p>
                    )}
                  </div>
                )}
                <p className="text-gray-600 text-xs mt-1">
                  {t("step1.verification.status")}{" "}
                  {isPhoneVerified
                    ? t("step1.verification.verified")
                    : t("step1.verification.notVerified")}
                </p>
              </div>
              <div>
                <label className="block mb-1 font-bold text-xs sm:text-sm">
                  {t("step1.email")}
                </label>
                <input
                  type="email"
                  name="emailAddress"
                  className="border p-2 w-full rounded text-xs sm:text-sm"
                  placeholder={t("step1.placeholders.email")}
                  value={formData.emailAddress}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block mb-1 font-bold text-xs sm:text-sm">
                  {t("step1.maritalStatus")}
                </label>
                <label className="block mb-1 text-xs sm:text-sm">
                  {t("step1.maritalStatusHelper")}
                </label>
                <select
                  name="maritalStatus"
                  className="border p-2 w-full rounded text-xs sm:text-sm"
                  value={formData.maritalStatus}
                  onChange={handleChange}
                  required
                >
                  <option value="">{t("step1.maritalOptions.select")}</option>
                  <option value="single">
                    {t("step1.maritalOptions.single")}
                  </option>
                  <option value="married">
                    {t("step1.maritalOptions.married")}
                  </option>
                  <option value="civil_union">
                    {t("step1.maritalOptions.civilUnion")}
                  </option>
                  <option value="divorced">
                    {t("step1.maritalOptions.divorced")}
                  </option>
                </select>
              </div>
              <div>
                <label className="block mb-1 font-bold text-xs sm:text-sm">
                  {t("step1.residencyType")}
                </label>
                <label className="block mb-1 text-xs sm:text-sm">
                  {t("step1.residencyHelper")}
                </label>
                <select
                  name="residencyType"
                  className="border p-2 w-full rounded text-xs sm:text-sm"
                  value={formData.residencyType}
                  onChange={handleChange}
                  required
                >
                  <option value="">{t("step1.residencyOptions.select")}</option>
                  <option value="own">{t("step1.residencyOptions.own")}</option>
                  <option value="rent">
                    {t("step1.residencyOptions.rent")}
                  </option>
                  <option value="parents">
                    {t("step1.residencyOptions.parents")}
                  </option>
                </select>
              </div>
            </div>

            <div className="text-center">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-blue-700 text-xs sm:text-sm"
              >
                {t("step1.buttons.continue")}
              </button>
              {submitError && (
                <p className="text-red-500 text-xs mt-1">{submitError}</p>
              )}
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmitStep2}>
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-4">
                {t("step2.title")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1 text-xs sm:text-sm">
                    {t("step2.ridersLabel")}
                  </label>
                  <select
                    name="RidersNo"
                    className={`border p-2 w-full rounded text-xs sm:text-sm ${
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
                    <option value="">
                      {t("step2.rider.relationships.select")}
                    </option>
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-xs sm:text-sm">
                    {t("step2.motorcyclesLabel")}
                  </label>
                  <select
                    name="MotorcycleNo"
                    className={`border p-2 w-full rounded text-xs sm:text-sm ${
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
                    <option value="">
                      {t("step2.rider.relationships.select")}
                    </option>
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
                  <h4 className="font-medium mb-2 text-sm sm:text-base">
                    {t("step2.riderTitle")} {index + 1}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.rider.firstName")}
                      </label>
                      <input
                        type="text"
                        value={index === 0 ? formData.F_name : Rider.firstName}
                        onChange={(e) => {
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        placeholder={t("step2.rider.placeholders.firstName")}
                        disabled={index === 0}
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.rider.lastName")}
                      </label>
                      <input
                        type="text"
                        value={index === 0 ? formData.L_name : Rider.lastName}
                        onChange={(e) => {
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        placeholder={t("step2.rider.placeholders.lastName")}
                        disabled={index === 0}
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.rider.dob")}
                      </label>
                      <input
                        type="date"
                        value={index === 0 ? formData.DOB : Rider.dateOfBirth}
                        onChange={(e) => {
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        disabled={index === 0}
                        style={
                          index === 0 ? { backgroundColor: "#f3f4f6" } : {}
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.rider.relationship")}
                      </label>
                      {index === 0 ? (
                        <input
                          type="text"
                          value={t("step2.rider.relationships.policyholder")}
                          className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
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
                          className="border p-2 w-full rounded text-xs sm:text-sm"
                          required
                        >
                          <option value="">
                            {t("step2.rider.relationships.select")}
                          </option>
                          <option value="spouse">
                            {t("step2.rider.relationships.spouse")}
                          </option>
                          <option value="child">
                            {t("step2.rider.relationships.child")}
                          </option>
                          <option value="parent">
                            {t("step2.rider.relationships.parent")}
                          </option>
                          <option value="other_relative">
                            {t("step2.rider.relationships.otherRelative")}
                          </option>
                          <option value="non_relative">
                            {t("step2.rider.relationships.nonRelative")}
                          </option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.rider.gender")}
                      </label>
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
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                      >
                        <option value="">
                          {t("step2.rider.genders.select")}
                        </option>
                        <option value="male">
                          {t("step2.rider.genders.male")}
                        </option>
                        <option value="female">
                          {t("step2.rider.genders.female")}
                        </option>
                        <option value="other">
                          {t("step2.rider.genders.other")}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.rider.idType")}
                      </label>
                      <select
                        value={Rider.idType}
                        onChange={(e) => {
                          const updatedRiders = [...formData.Riders];
                          updatedRiders[index] = {
                            ...updatedRiders[index],
                            idType: e.target.value,
                            idNumber: "",
                            state: "",
                            country: "",
                            idSubType: "",
                          };
                          setFormData((prev) => ({
                            ...prev,
                            Riders: updatedRiders,
                          }));
                        }}
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        required
                      >
                        <option value="">
                          {t("step2.rider.idTypes.select")}
                        </option>
                        <option value="in-state-dl">
                          {t("step2.rider.idTypes.inStateDL")}
                        </option>
                        <option value="in-state-id">
                          {t("step2.rider.idTypes.inStateID")}
                        </option>
                        <option value="out-of-state-DL">
                          {t("step2.rider.idTypes.outOfStateDL")}
                        </option>
                        <option value="out-of-state-ID">
                          {t("step2.rider.idTypes.outOfStateID")}
                        </option>
                        <option value="international">
                          {t("step2.rider.idTypes.international")}
                        </option>
                      </select>
                    </div>

                    {Rider.idType === "in-state-dl" && (
                      <div>
                        <label className="block mb-1 font-bold text-xs sm:text-sm">
                          {t("step2.rider.dlNumber")}
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
                          className="border p-2 w-full rounded text-xs sm:text-sm"
                          placeholder={t("step2.rider.placeholders.dlNumber")}
                          required
                          maxLength={8}
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        {Rider.idNumber && Rider.idNumber.length !== 8 && (
                          <p className="text-red-500 text-xs mt-1">
                            {t("step2.rider.errors.dl8Digits")}
                          </p>
                        )}
                      </div>
                    )}

                    {Rider.idType === "in-state-id" && (
                      <div>
                        <label className="block mb-1 font-bold text-xs sm:text-sm">
                          {t("step2.rider.idNumber")}
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
                          className="border p-2 w-full rounded text-xs sm:text-sm"
                          placeholder={t("step2.rider.placeholders.idNumber")}
                          required
                        />
                      </div>
                    )}

                    {Rider.idType === "out-of-state-DL" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.dlNumber")}
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder={t("step2.rider.placeholders.dlNumber")}
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.state")}
                          </label>
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder={t("step2.rider.placeholders.state")}
                            required
                          />
                        </div>
                      </>
                    )}

                    {Rider.idType === "out-of-state-ID" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.idNumber")}
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder={t("step2.rider.placeholders.idNumber")}
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.state")}
                          </label>
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder={t("step2.rider.placeholders.state")}
                            required
                          />
                        </div>
                      </>
                    )}

                    {Rider.idType === "international" && (
                      <>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.internationalId")}
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder={t(
                              "step2.rider.placeholders.internationalId"
                            )}
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.country")}
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            placeholder={t("step2.rider.placeholders.country")}
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 font-bold text-xs sm:text-sm">
                            {t("step2.rider.helpers.idTypeLabel")}
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
                            className="border p-2 w-full rounded text-xs sm:text-sm"
                            required
                          >
                            <option value="">
                              {t("step2.rider.idSubTypes.select")}
                            </option>
                            <option value="matricular">
                              {t("step2.rider.idSubTypes.matricular")}
                            </option>
                            <option value="passport">
                              {t("step2.rider.idSubTypes.passport")}
                            </option>
                            <option value="other_foreign">
                              {t("step2.rider.idSubTypes.otherForeign")}
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
                  <h4 className="font-medium mb-2 text-sm sm:text-base">
                    {t("step2.motorcycleTitle")} {index + 1}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.motorcycle.vinNumber")}
                      </label>
                      <input
                        type="text"
                        value={Motorcycle.vinNumber}
                        onChange={(e) =>
                          handleVinInputChange(index, e.target.value)
                        }
                        className="border p-2 w-full rounded text-xs sm:text-sm"
                        placeholder={t("step2.motorcycle.placeholders.vin")}
                        maxLength={17}
                        required
                      />
                      {vinLoading === index && (
                        <p className="text-blue-500 text-xs mt-1">
                          {t("step2.motorcycle.searching")}
                        </p>
                      )}
                      {vinError && vinLoading !== index && (
                        <p className="text-red-500 text-xs mt-1">{vinError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.motorcycle.make")}
                      </label>
                      <input
                        type="text"
                        value={Motorcycle.make}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
                        placeholder={t(
                          "step2.motorcycle.placeholders.autoFilled"
                        )}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.motorcycle.model")}
                      </label>
                      <input
                        type="text"
                        value={Motorcycle.model}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
                        placeholder={t(
                          "step2.motorcycle.placeholders.autoFilled"
                        )}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.motorcycle.year")}
                      </label>
                      <input
                        type="text"
                        value={Motorcycle.year}
                        readOnly
                        className="border p-2 w-full rounded bg-gray-100 text-xs sm:text-sm"
                        placeholder={t(
                          "step2.motorcycle.placeholders.autoFilled"
                        )}
                        disabled
                      />
                    </div>

                    <div className="col-span-1 sm:col-span-2">
                      <label className="block mb-1 font-bold text-xs sm:text-sm">
                        {t("step2.motorcycle.coverage")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            name: "Liability",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.liability"
                            ),
                          },
                          {
                            name: "Comprehensive/Collision (Basic Full coverage)",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.comprehensive"
                            ),
                          },
                          {
                            name: "Personal Injury Protection",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.pip"
                            ),
                          },
                          {
                            name: "Medical Payments",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.medpay"
                            ),
                          },
                          {
                            name: "Uninsured Motorist",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.uninsured"
                            ),
                          },
                          {
                            name: "Towing",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.towing"
                            ),
                          },
                          {
                            name: "Rental",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.rental"
                            ),
                          },
                          {
                            name: "Roadside Assistance",
                            description: t(
                              "step2.motorcycle.coverageDescriptions.roadside"
                            ),
                          },
                        ].map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() =>
                              handleCoverageChange(index, option.name)
                            }
                            className={`px-3 py-1 sm:px-4 sm:py-2 border rounded-full text-xs font-medium ${
                              Motorcycle.coverage.includes(option.name)
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            } ${
                              option.name === "Liability"
                                ? "opacity-75 cursor-not-allowed"
                                : ""
                            }`}
                            disabled={option.name === "Liability"}
                            title={option.description}
                          >
                            {option.name}
                            {option.name === "Liability" && (
                              <span className="ml-1 text-red-500">*</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("step2.motorcycle.liabilityRequired")}
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
                  {t("step2.buttons.back")}
                </button>

                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-blue-700 text-xs sm:text-sm"
                >
                  {t("step2.buttons.continue")}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmitStep3}>
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-4">
                {t("step3.title")}
              </h2>
              <div className="mb-4 text-center">
                <div className="w-full">
                  <label className="block mb-1 font-bold text-xs sm:text-sm">
                    {t("step3.priorCoverage")}
                  </label>
                  <select
                    name="popcoverage"
                    className="border p-2 w-full rounded text-xs sm:text-sm"
                    value={priorCoverage}
                    onChange={handleChange}
                    required
                  >
                    <option value="">{t("step3.options.select")}</option>
                    <option value="yes">{t("step3.options.yes")}</option>
                    <option value="no">{t("step3.options.no")}</option>
                  </select>
                </div>
              </div>
              {priorCoverage === "yes" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block mb-1 font-bold text-xs sm:text-sm">
                      {t("step3.howLong")}
                    </label>
                    <label className="block mb-1 text-xs sm:text-sm">
                      {t("step3.howLongHelper")}
                    </label>
                    <select
                      name="priorCoverageMonths"
                      className="border p-2 w-full rounded text-xs sm:text-sm"
                      required
                      value={formData.priorCoverageMonths}
                      onChange={handleChange}
                    >
                      <option value="">{t("step3.options.select")}</option>
                      <option value="6">{t("step3.options.months6")}</option>
                      <option value="12">{t("step3.options.months12")}</option>
                      <option value="18">{t("step3.options.months18")}</option>
                      <option value="24">{t("step3.options.months24")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-bold text-xs sm:text-sm">
                      {t("step3.expirationDate")}
                    </label>
                    <label className="block mb-1 text-xs sm:text-sm">
                      {t("step3.expirationHelper")}
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
                      {t("step3.membership")}
                    </label>
                    <label className="block mb-1 text-xs sm:text-sm">
                      {t("step3.membershipHelper")}
                    </label>
                    <select
                      name="membership"
                      className="border p-2 w-full rounded text-xs sm:text-sm"
                      required
                      value={formData.membership || ""}
                      onChange={handleChange}
                    >
                      <option value="">{t("step3.options.select")}</option>
                      <option value="sams_club">
                        {t("step3.options.samsClub")}
                      </option>
                      <option value="costco">
                        {t("step3.options.costco")}
                      </option>
                      <option value="none">{t("step3.options.none")}</option>
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
                  {t("step3.buttons.back")}
                </button>

                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-blue-700 text-xs sm:text-sm"
                >
                  {t("step3.buttons.continue")}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === 4 && (
          <form onSubmit={handleSubmitStep4}>
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-4">
                {t("step4.title")}
              </h2>
              <div className="bg-gray-100 p-4 sm:p-6 rounded-lg shadow-inner text-xs sm:text-sm">
                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    {t("step4.sections.personal")}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.firstName")}
                      </span>{" "}
                      {formData.F_name || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.lastName")}
                      </span>{" "}
                      {formData.L_name || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.address")}
                      </span>{" "}
                      {formData.Address || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.dob")}
                      </span>{" "}
                      {formData.DOB || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.phone")}
                      </span>{" "}
                      {formatPhoneForDisplay(formData.phone) ||
                        t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.email")}
                      </span>{" "}
                      {formData.emailAddress || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.maritalStatus")}
                      </span>{" "}
                      {formData.maritalStatus || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.residency")}
                      </span>{" "}
                      {formData.residencyType || t("step4.noData.notProvided")}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.effectiveDate")}
                      </span>{" "}
                      {formData.effectiveDate || t("step4.noData.notProvided")}
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    {t("step4.sections.riders")}
                  </h3>
                  {formData.Riders.length > 0 ? (
                    formData.Riders.map((Rider, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2 text-sm sm:text-base">
                          {t("step2.riderTitle")} {index + 1}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.firstName")}
                            </span>{" "}
                            {Rider.firstName || t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.lastName")}
                            </span>{" "}
                            {Rider.lastName || t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.dob")}
                            </span>{" "}
                            {Rider.dateOfBirth || t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.relationship")}
                            </span>{" "}
                            {Rider.relationship ||
                              t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.gender")}
                            </span>{" "}
                            {Rider.gender || t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.idType")}
                            </span>{" "}
                            {Rider.idType || t("step4.noData.notProvided")}
                          </p>
                          {Rider.idType && (
                            <>
                              <p>
                                <span className="font-medium text-gray-700">
                                  {t("step4.fields.idNumber")}
                                </span>{" "}
                                {Rider.idNumber ||
                                  t("step4.noData.notProvided")}
                              </p>
                              {["out-of-state-DL", "out-of-state-ID"].includes(
                                Rider.idType
                              ) && (
                                <p>
                                  <span className="font-medium text-gray-700">
                                    {t("step4.fields.state")}
                                  </span>{" "}
                                  {Rider.state || t("step4.noData.notProvided")}
                                </p>
                              )}
                              {Rider.idType === "international" && (
                                <>
                                  <p>
                                    <span className="font-medium text-gray-700">
                                      {t("step4.fields.country")}
                                    </span>{" "}
                                    {Rider.country ||
                                      t("step4.noData.notProvided")}
                                  </p>
                                  <p>
                                    <span className="font-medium text-gray-700">
                                      {t("step4.fields.idSubType")}
                                    </span>{" "}
                                    {Rider.idSubType ||
                                      t("step4.noData.notProvided")}
                                  </p>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">{t("step4.noData.riders")}</p>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    {t("step4.sections.motorcycles")}
                  </h3>
                  {formData.Motorcycles.length > 0 ? (
                    formData.Motorcycles.map((Motorcycle, index) => (
                      <div
                        key={index}
                        className="mb-4 p-4 bg-white rounded-lg shadow-sm"
                      >
                        <h4 className="font-medium text-gray-800 mb-2 text-sm sm:text-base">
                          {t("step2.motorcycleTitle")} {index + 1}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.vin")}
                            </span>{" "}
                            {Motorcycle.vinNumber ||
                              t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.make")}
                            </span>{" "}
                            {Motorcycle.make || t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.model")}
                            </span>{" "}
                            {Motorcycle.model || t("step4.noData.notProvided")}
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.year")}
                            </span>{" "}
                            {Motorcycle.year || t("step4.noData.notProvided")}
                          </p>
                          <p className="col-span-1 sm:col-span-2">
                            <span className="font-medium text-gray-700">
                              {t("step4.fields.coverage")}
                            </span>{" "}
                            {Motorcycle.coverage.length > 0
                              ? Motorcycle.coverage.join(", ")
                              : t("step4.noData.coverageDefault")}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-600">
                      {t("step4.noData.motorcycles")}
                    </p>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-4">
                    {t("step4.sections.coverage")}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <p>
                      <span className="font-medium text-gray-700">
                        {t("step4.fields.priorCoverage")}
                      </span>{" "}
                      {priorCoverage || t("step4.noData.notProvided")}
                    </p>
                    {priorCoverage === "yes" && (
                      <>
                        <p>
                          <span className="font-medium text-gray-700">
                            {t("step4.fields.priorMonths")}
                          </span>{" "}
                          {formData.priorCoverageMonths ||
                            t("step4.noData.notProvided")}
                        </p>
                        <p>
                          <span className="font-medium text-gray-700">
                            {t("step4.fields.expirationDate")}
                          </span>{" "}
                          {formData.expirationDate ||
                            t("step4.noData.notProvided")}
                        </p>
                      </>
                    )}
                    {priorCoverage === "no" && (
                      <p>
                        <span className="font-medium text-gray-700">
                          {t("step4.fields.membership")}
                        </span>{" "}
                        {formData.membership || t("step4.noData.notProvided")}
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
                  {t("step4.buttons.back")}
                </button>
                <button
                  type="submit"
                  className={`bg-blue-600 text-white px-4 sm:px-6 py-2 rounded text-xs sm:text-sm ${
                    isSubmitting
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-blue-700"
                  }`}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t("step4.buttons.submitting")
                    : t("step4.buttons.submit")}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
