"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

export default function HomePage() {
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
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
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
              Your Savings, Our Priority!
            </h1>
            <p className="text-xl text-gray-700 mb-6">
              Protecting what matters most: Auto, Home, Renters, Business, and
              More.
            </p>
            <a
              href="/auto"
              className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#102a56]"
            >
              GET QUOTE
            </a>
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
              Experience the Difference: Personalized Insurance Solutions
            </h1>
            <p className="text-xl text-gray-700 mb-6">
              With access to 40+ leading companies and over 10 years of industry
              expertise, we&apos;ll guide you to the right coverage. Don&apos;t
              navigate the insurance maze alone - schedule your free
              consultation and let us help you find the perfect fit.
            </p>
          </div>

          {/* Right side: Gradient Section with Card */}
          <div className="lg:w-1/2 flex mt-10 lg:mt-0">
            {/* Gradient Half */}
            <div className="w-1/2 bg-gradient-to-b from-[#a0103d] to-[#102a56] text-white flex flex-col justify-center items-center p-6 rounded-l-md">
              <div className="text-center">
                <p className="text-4xl font-bold">40+</p>
                <p className="text-lg">COMPANIES</p>
              </div>
              <div className="border-t border-white/50 my-4 w-3/4"></div>
              <div className="text-center">
                <p className="text-4xl font-bold">10+</p>
                <p className="text-lg">YEARS EXPERIENCE</p>
              </div>
            </div>

            {/* White Card Half */}
            <div className="w-1/2 bg-white shadow-lg rounded-r-md p-6 flex flex-col justify-between">
              <div className="text-lg text-gray-800 leading-relaxed">
                <p className="text-3xl">
                  Not sure what kind of coverage you need?
                </p>{" "}
                Speak with one of our professional agents we&apos;ll help you
                find the best and most affordable insurance option tailored for
                you.
              </div>
              <a
                href="tel:+14697295185"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition text-center mt-4"
              >
                CALL US
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ===== SECTION 3: INSURANCE TYPES (GIF CARDS) ===== */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Auto Card */}
            <a
              href="/auto"
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
              <p className="text-xl font-bold text-gray-900 mb-2">Auto</p>
              <p className="text-sm text-gray-500 mb-6">Protect your Auto</p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                Quote Now &gt;&gt;
              </div>
            </a>

            {/* Home Card */}
            <a
              href="/homeowners"
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
              <p className="text-xl font-bold text-gray-900 mb-2">Home</p>
              <p className="text-sm text-gray-500 mb-6">Protect your home</p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                Quote Now &gt;&gt;
              </div>
            </a>

            {/* Rental Card */}
            <a
              href="/renters"
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
              <p className="text-xl font-bold text-gray-900 mb-2">Rental</p>
              <p className="text-sm text-gray-500 mb-6">Protect your rental</p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                Quote Now &gt;&gt;
              </div>
            </a>

            {/* Motorcycle Card */}
            <a
              href="/motorcycle"
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
              <p className="text-xl font-bold text-gray-900 mb-2">Motorcycle</p>
              <p className="text-sm text-gray-500 mb-6">Protect your ride</p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                Quote Now &gt;&gt;
              </div>
            </a>

            {/* Commercial Card */}
            <a
              href="/general-liability"
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
              <p className="text-xl font-bold text-gray-900 mb-2">Commercial</p>
              <p className="text-sm text-gray-500 mb-6">
                Protect your business
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                Quote Now &gt;&gt;
              </div>
            </a>

            {/* Other Card */}
            <a
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
              <p className="text-xl font-bold text-gray-900 mb-2">Other</p>
              <p className="text-sm text-gray-500 mb-6">
                Specialty Insurance Options
              </p>
              <div className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-6 rounded-md group-hover:bg-[#102a56] transition-colors">
                Contact Us &gt;&gt;
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* ===== SECTION 4: READY TO START SAVING (CTA) ===== */}
      <div className="relative bg-[#E5E5E5] py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Ready to start saving?
            </h2>
            <p className="text-lg text-gray-600">
              Pick a way to connect and get your quote.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Box 1: Call */}
            <a
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
                Call Us
              </h3>
              <p className="text-gray-600 mb-8">Talk to an agent in minutes.</p>
              <div className="w-full bg-[#A0103D] text-white font-bold py-3 rounded-md group-hover:bg-[#102a56] transition-colors text-center uppercase tracking-wider">
                Call Now
              </div>
            </a>

            {/* Box 2: Text */}
            <a
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
                Text Us
              </h3>
              <p className="text-gray-600 mb-8">Fast answers on your phone.</p>
              <div className="w-full bg-[#A0103D] text-white font-bold py-3 rounded-md group-hover:bg-[#102a56] transition-colors text-center uppercase tracking-wider">
                Send Text
              </div>
            </a>

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
                Chat Live
              </h3>
              <p className="text-gray-600 mb-8">
                Talk to us right here online.
              </p>
              <div className="w-full bg-[#A0103D] text-white font-bold py-3 rounded-md group-hover:bg-[#102a56] transition-colors text-center uppercase tracking-wider">
                Start Chat
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
              What are customers saying?
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
                Exceptional service every time from Texas Premium Insurance
                Services. They made starting a new policy easy and found a great
                price. Being able to manage everything via text is incredibly
                convenient. Their efficiency and attention to detail truly
                stands out!
              </p>
              <p className="text-gray-900 font-semibold">Leslie Vance</p>
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
                The staff at Texas Premium Insurance Services are incredibly
                personal and always willing to work with you. They take the time
                to explain coverage, benefits, and costs, and are dedicated to
                finding the best rates—even for those with driving restrictions.
              </p>
              <p className="text-gray-900 font-semibold">Darius Reed</p>
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
                Outstanding customer service! Texas Premium Insurance Services
                is truly a one-stop shop for all your insurance needs across the
                state. No matter where you are in Texas, they&apos;ve got you
                covered!
              </p>
              <p className="text-gray-900 font-semibold">Maya Chen</p>
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
              Compare and Save in 3 Easy Steps
            </h2>
            <p className="text-lg text-gray-600">
              Getting the right coverage has never been easier
            </p>
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
                Tell Us About Yourself
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Share a few details about your insurance needs so we can find
                the best options for you.
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
                Compare Top Insurers
              </h3>
              <p className="text-gray-600 leading-relaxed">
                We&apos;ll search 40+ leading companies to bring you the most
                competitive rates.
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
                Get Covered & Save
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Choose your plan and start saving with coverage that fits your
                needs.
              </p>
            </div>
          </div>

          {/* Final CTA Button */}
          <div className="text-center mt-12">
            <a
              href="/auto"
              className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-8 rounded-full hover:bg-[#102a56] transition"
            >
              Start Your Quote
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
