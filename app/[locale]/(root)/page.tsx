// app/[locale]/(root)/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function HomePage() {
  const t = useTranslations("home");
  const params = useParams();
  const locale = params.locale as string;

  const images = [
    { src: "/car.png", alt: "Car" },
    { src: "/home_page_bike.png", alt: "Motorcycle" },
    { src: "/house1.png", alt: "House" },
    { src: "/rental-apt1.png", alt: "Rental" },
    { src: "/commercial1.png", alt: "Commercial" },
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === images.length - 1 ? 0 : prevIndex + 1,
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [images.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const campaign = urlParams.get("utm_medium") || "Direct";
      sessionStorage.setItem("campaignName", campaign);
    }
  }, []);

  // ✅ NEW: Scroll to contact section if hash is present
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#contact") {
      setTimeout(() => {
        const contactSection = document.getElementById("contact-section");
        if (contactSection) {
          contactSection.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);
    }
  }, []);

  const openLiveAgentChat = () => {
    sessionStorage.setItem("openLiveAgentChat", "true");
    window.dispatchEvent(new CustomEvent("openLiveAgentChat"));
  };

  return (
    <>
      {/* ===== SECTION 1: HERO ===== */}
      {/* MOBILE: py-8 (32px) | TABLET+: py-12 (48px) */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between">
          {/* Left side: Text and Button */}
          <div className="lg:w-1/2 text-center lg:text-left">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              {t("hero.title")}
            </h1>
            <p className="text-xl text-gray-700 mb-6">{t("hero.subtitle")}</p>
            <Link
              href={`/${locale}/auto`}
              className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#102a56]"
            >
              {t("hero.cta")}
            </Link>
          </div>

          {/* Right side: Auto-Scrolling Image */}
          <div className="lg:w-1/2 relative mt-10 lg:mt-0">
            <Image
              src={images[currentImageIndex].src}
              alt={images[currentImageIndex].alt}
              width={600}
              height={400}
              className="object-contain"
            />

            {/* Cursor Indicator */}
            <div className="flex justify-center mt-4 space-x-2">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`w-4 h-1 ${
                    i === currentImageIndex ? "bg-[#A0103D]" : "bg-gray-400"
                  }`}
                  style={{ borderRadius: "2px" }}
                ></span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== SECTION 2: PERSONALIZED SOLUTIONS ===== */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between">
          {/* Left side: Text */}
          <div className="lg:w-1/2 text-center lg:text-left">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              {t("personalized.title")}
            </h1>
            <p className="text-xl text-gray-700 mb-6">
              {t("personalized.description")}
            </p>
          </div>

          {/* Right side: Gradient Section with Card */}
          <div className="lg:w-1/2 flex mt-10 lg:mt-0">
            {/* Gradient Half */}
            <div className="w-1/2 bg-gradient-to-b from-[#a0103d] to-[#102a56] text-white flex flex-col justify-center items-center p-6 rounded-l-md">
              <div className="text-center">
                <p className="text-4xl font-bold">
                  {t("personalized.stats.companies.number")}
                </p>
                <p className="text-lg">
                  {t("personalized.stats.companies.label")}
                </p>
              </div>
              <div className="border-t border-white/50 my-4 w-3/4"></div>
              <div className="text-center">
                <p className="text-4xl font-bold">
                  {t("personalized.stats.experience.number")}
                </p>
                <p className="text-lg">
                  {t("personalized.stats.experience.label")}
                </p>
              </div>
            </div>

            {/* White Card Half */}
            <div className="w-1/2 bg-white shadow-lg rounded-r-md p-6 flex flex-col justify-between">
              <div className="text-lg text-gray-800 leading-relaxed">
                <p className="text-3xl">{t("personalized.card.question")}</p>{" "}
                {t("personalized.card.description")}
              </div>
              <Link
                href="tel:+14697295185"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition text-center mt-4"
              >
                {t("personalized.card.cta")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===== SECTION 3: INSURANCE TYPES (GIF CARDS) ===== */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Auto Card */}
            <Link
              href={`/${locale}/auto`}
              className="group bg-white rounded-2xl shadow-md p-6 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#A0103D] rounded-2xl rotate-0 opacity-0 group-hover:rotate-12 group-hover:opacity-10 transition-all duration-500 scale-125"></div>
                <Image
                  src="/car-animated.gif"
                  alt="Auto"
                  width={100}
                  height={100}
                  className="relative mx-auto object-contain group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="text-xl font-bold text-gray-900 mb-2">
                {t("insuranceTypes.auto.title")}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t("insuranceTypes.auto.description")}
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                {t("insuranceTypes.auto.cta")}
              </div>
            </Link>

            {/* Home Card */}
            <Link
              href={`/${locale}/homeowners`}
              className="group bg-white rounded-2xl shadow-md p-6 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#102a56] rounded-2xl rotate-0 opacity-0 group-hover:-rotate-12 group-hover:opacity-10 transition-all duration-500 scale-125"></div>
                <Image
                  src="/home-animated.gif"
                  alt="Home"
                  width={100}
                  height={100}
                  className="relative mx-auto object-contain group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="text-xl font-bold text-gray-900 mb-2">
                {t("insuranceTypes.home.title")}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t("insuranceTypes.home.description")}
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                {t("insuranceTypes.home.cta")}
              </div>
            </Link>

            {/* Rental Card */}
            <Link
              href={`/${locale}/renters`}
              className="group bg-white rounded-2xl shadow-md p-6 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#A0103D] rounded-2xl rotate-0 opacity-0 group-hover:rotate-12 group-hover:opacity-10 transition-all duration-500 scale-125"></div>
                <Image
                  src="/rental-animated.gif"
                  alt="Rental"
                  width={100}
                  height={100}
                  className="relative mx-auto object-contain group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="text-xl font-bold text-gray-900 mb-2">
                {t("insuranceTypes.rental.title")}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t("insuranceTypes.rental.description")}
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                {t("insuranceTypes.rental.cta")}
              </div>
            </Link>

            {/* Motorcycle Card */}
            <Link
              href={`/${locale}/motorcycle`}
              className="group bg-white rounded-2xl shadow-md p-6 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#102a56] rounded-2xl rotate-0 opacity-0 group-hover:-rotate-12 group-hover:opacity-10 transition-all duration-500 scale-125"></div>
                <Image
                  src="/motorcycle-animated.gif"
                  alt="Motorcycle"
                  width={100}
                  height={100}
                  className="relative mx-auto object-contain group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="text-xl font-bold text-gray-900 mb-2">
                {t("insuranceTypes.motorcycle.title")}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t("insuranceTypes.motorcycle.description")}
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                {t("insuranceTypes.motorcycle.cta")}
              </div>
            </Link>

            {/* Commercial Card */}
            <Link
              href={`/${locale}/general-liability`}
              className="group bg-white rounded-2xl shadow-md p-6 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#A0103D] rounded-2xl rotate-0 opacity-0 group-hover:rotate-12 group-hover:opacity-10 transition-all duration-500 scale-125"></div>
                <Image
                  src="/commercial-animated.gif"
                  alt="Commercial"
                  width={100}
                  height={100}
                  className="relative mx-auto object-contain group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="text-xl font-bold text-gray-900 mb-2">
                {t("insuranceTypes.commercial.title")}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t("insuranceTypes.commercial.description")}
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                {t("insuranceTypes.commercial.cta")}
              </div>
            </Link>

            {/* Other Card - KEEP AS IS (phone link) */}
            <Link
              href="tel:+14697295185"
              className="group bg-white rounded-2xl shadow-md p-6 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#102a56] rounded-2xl rotate-0 opacity-0 group-hover:-rotate-12 group-hover:opacity-10 transition-all duration-500 scale-125"></div>
                <Image
                  src="/other-animated.gif"
                  alt="Other"
                  width={100}
                  height={100}
                  className="relative mx-auto object-contain group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="text-xl font-bold text-gray-900 mb-2">
                {t("insuranceTypes.other.title")}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {t("insuranceTypes.other.description")}
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                {t("insuranceTypes.other.cta")}
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* ===== SECTION 4: READY TO START SAVING (CTA) ===== */}
      {/* ✅ ADDED: id="contact-section" for scroll targeting */}
      <div
        id="contact-section"
        className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t("contact.title")}
            </h2>
            <p className="text-lg text-gray-600">{t("contact.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Box 1: Call - KEEP AS IS (phone link) */}
            <Link
              href="tel:+14697295185"
              className="group bg-white rounded-2xl shadow-lg p-10 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-[#102a56] rounded-2xl rotate-0 opacity-0 group-hover:rotate-12 group-hover:opacity-10 transition-all duration-500"></div>
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-[#102a56] group-hover:scale-110 transition-transform duration-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 uppercase tracking-wide">
                {t("contact.call.title")}
              </h3>
              <p className="text-gray-600 mb-8">
                {t("contact.call.description")}
              </p>
              <div className="w-full bg-[#A0103D] text-white font-bold py-3 rounded-md group-hover:bg-[#102a56] transition-colors text-center uppercase tracking-wider">
                {t("contact.call.cta")}
              </div>
            </Link>

            {/* Box 2: Text - KEEP AS IS (SMS link) */}
            <Link
              href="sms:+14697295185"
              className="group bg-white rounded-2xl shadow-lg p-10 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-[#A0103D] rounded-2xl rotate-0 opacity-0 group-hover:-rotate-12 group-hover:opacity-10 transition-all duration-500"></div>
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-[#A0103D] group-hover:scale-110 transition-transform duration-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 uppercase tracking-wide">
                {t("contact.text.title")}
              </h3>
              <p className="text-gray-600 mb-8">
                {t("contact.text.description")}
              </p>
              <div className="w-full bg-[#A0103D] text-white font-bold py-3 rounded-md group-hover:bg-[#102a56] transition-colors text-center uppercase tracking-wider">
                {t("contact.text.cta")}
              </div>
            </Link>

            {/* Box 3: Chat Live */}
            <button
              onClick={openLiveAgentChat}
              className="group bg-white rounded-2xl shadow-lg p-10 text-center flex flex-col items-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-green-600 rounded-2xl rotate-0 opacity-0 group-hover:rotate-12 group-hover:opacity-10 transition-all duration-500"></div>
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-green-600 group-hover:scale-110 transition-transform duration-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 uppercase tracking-wide">
                {t("contact.chat.title")}
              </h3>
              <p className="text-gray-600 mb-8">
                {t("contact.chat.description")}
              </p>
              <div className="w-full bg-[#A0103D] text-white font-bold py-3 rounded-md group-hover:bg-[#102a56] transition-colors text-center uppercase tracking-wider">
                {t("contact.chat.cta")}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ===== SECTION 5: CUSTOMER TESTIMONIALS ===== */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t("testimonials.title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
                <Image
                  src="/testo1.png"
                  alt="Leslie Vance"
                  width={96}
                  height={96}
                  className="object-cover"
                />
              </div>
              <p className="text-gray-700 mb-4 italic">
                {t("testimonials.reviews.leslie.text")}
              </p>
              <p className="text-gray-900 font-semibold">
                {t("testimonials.reviews.leslie.name")}
              </p>
              <div className="flex justify-center mt-2">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <span key={i} className="text-cyan-600 text-xl">
                      ★
                    </span>
                  ))}
              </div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
                <Image
                  src="/testo2.png"
                  alt="Darius Reed"
                  width={96}
                  height={96}
                  className="object-cover"
                />
              </div>
              <p className="text-gray-700 mb-4 italic">
                {t("testimonials.reviews.darius.text")}
              </p>
              <p className="text-gray-900 font-semibold">
                {t("testimonials.reviews.darius.name")}
              </p>
              <div className="flex justify-center mt-2">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <span key={i} className="text-cyan-600 text-xl">
                      ★
                    </span>
                  ))}
              </div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
                <Image
                  src="/testo3.png"
                  alt="Maya Chen"
                  width={96}
                  height={96}
                  className="object-cover"
                />
              </div>
              <p className="text-gray-700 mb-4 italic">
                {t("testimonials.reviews.maya.text")}
              </p>
              <p className="text-gray-900 font-semibold">
                {t("testimonials.reviews.maya.name")}
              </p>
              <div className="flex justify-center mt-2">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <span key={i} className="text-cyan-600 text-xl">
                      ★
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== SECTION 6: 3 EASY STEPS ===== */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t("steps.title")}
            </h2>
            <p className="text-lg text-gray-600">{t("steps.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative bg-white rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold shadow-lg">
                1
              </div>
              <div className="mt-8 mb-6 flex justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-[#102a56]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {t("steps.step1.title")}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {t("steps.step1.description")}
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold shadow-lg">
                2
              </div>
              <div className="mt-8 mb-6 flex justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-50 to-purple-100 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-[#102a56]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {t("steps.step2.title")}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {t("steps.step2.description")}
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold shadow-lg">
                3
              </div>
              <div className="mt-8 mb-6 flex justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-[#102a56]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {t("steps.step3.title")}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {t("steps.step3.description")}
              </p>
            </div>
          </div>

          {/* Final CTA Button */}
          <div className="text-center mt-12">
            <Link
              href={`/${locale}/auto`}
              className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-8 rounded-full hover:bg-[#102a56] transition"
            >
              {t("steps.cta")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
