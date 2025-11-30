"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

export default function HomePage() {
  const images = [
    { src: "/car.png", alt: "Car" },

    { src: "/home_page_bike.png", alt: "Motorcycle" },

    { src: "/house1.png", alt: "House" }, // Add more image paths

    { src: "/rental-apt1.png", alt: "Rental" }, // Add more image paths

    { src: "/commercial1.png", alt: "Commercial" }, // Add more image paths

    // Add more images as needed
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, [images.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const campaign = urlParams.get("utm_medium") || "Direct"; // 👈 updated key
      sessionStorage.setItem("campaignName", campaign);
    }
  }, []);

  return (
    <>
      <div className="relative bg-[#E5E5E5] py-16 px-4 sm:px-6 lg:px-8">
        {/* Main container with flex layout for text and image */}

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

        {/* Add margin-top to create space between sections */}

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between">
          {/* Left side: Text and Button */}

          <div className="lg:w-1/2 text-center lg:text-left">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Experience the Difference: Personalized Insurance Solutions
            </h1>

            <p className="text-xl text-gray-700 mb-6">
              With acess to 30+ leading companies and over 10 years of industry
              expertise, we’ll guide you to the right coverage. Don’t navigate
              the insurance maze alone - schedule your free consultation and let
              us help you find the perfect fit.
            </p>
          </div>

          {/* Right side: Gradient Section with Card */}

          <div className="lg:w-1/2 flex mt-10 lg:mt-0">
            {/* Gradient Half */}

            <div className="w-1/2 bg-gradient-to-b from-[#a0103d] to-[#102a56] text-white flex flex-col justify-center items-center p-6 rounded-l-md">
              <div className="text-center">
                <p className="text-4xl font-bold">30+</p>

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
                Speak with one of our professional agents we’ll help you find
                the best and most affordable insurance option tailored for you.
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

        {/* Add margin-top to create space between sections */}

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

        {/* Section with Header and GIF Cards */}

        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          {/* Header and Subheader */}

          <div className="text-center mb-2">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Explore Your Coverage Options
            </h2>

            <p className="text-lg text-gray-700">
              Get personalized quotes for all your insurance needs with just one
              click.
            </p>
          </div>
        </div>

        {/* New Section with GIF Cards */}

        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Auto Card */}

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <Image
                src="/car-animated.gif" // Replace with your GIF path
                alt="Auto"
                width={100}
                height={100}
                className="mx-auto mb-4 object-contain"
              />

              <p className="text-gray-700 mb-2">Auto</p>

              <p className="text-sm text-gray-500 mb-4">Protect your Auto</p>

              <a
                href="/auto"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
              >
                Quote Now &gt;&gt;
              </a>
            </div>

            {/* Home Card */}

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <Image
                src="/home-animated.gif" // Replace with your GIF path
                alt="Home"
                width={100}
                height={100}
                className="mx-auto mb-4 object-contain"
              />

              <p className="text-gray-700 mb-2">Home</p>

              <p className="text-sm text-gray-500 mb-4">Protect your home</p>

              <a
                href="/homeowners"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
              >
                Quote Now &gt;&gt;
              </a>
            </div>

            {/* Rental Card */}

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <Image
                src="/rental-animated.gif" // Replace with your GIF path
                alt="Rental"
                width={100}
                height={100}
                className="mx-auto mb-4 object-contain"
              />

              <p className="text-gray-700 mb-2">Rental</p>

              <p className="text-sm text-gray-500 mb-4">
                Protect your business
              </p>

              <a
                href="/renters"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
              >
                Quote Now &gt;&gt;
              </a>
            </div>

            {/* Motorcycle Card */}

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <Image
                src="/motorcycle-animated.gif" // Replace with your GIF path
                alt="Motorcycle"
                width={100}
                height={100}
                className="mx-auto mb-4 object-contain"
              />

              <p className="text-gray-700 mb-2">Motorcycle</p>

              <p className="text-sm text-gray-500 mb-4">Protect your ride</p>

              <a
                href="/motorcycle"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
              >
                Quote Now &gt;&gt;
              </a>
            </div>

            {/* Commercial Card */}

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <Image
                src="/commercial-animated.gif" // Replace with your GIF path
                alt="Commercial"
                width={100}
                height={100}
                className="mx-auto mb-4 object-contain"
              />

              <p className="text-gray-700 mb-2">Commercial</p>

              <p className="text-sm text-gray-500 mb-4">
                Protect your business
              </p>

              <a
                href="/general-liability"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
              >
                Quote Now &gt;&gt;
              </a>
            </div>

            {/* Other Card */}

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <Image
                src="/other-animated.gif" // Replace with your GIF path
                alt="Other"
                width={100}
                height={100}
                className="mx-auto mb-4 object-contain"
              />

              <p className="text-gray-700 mb-2">Other</p>

              <p className="text-sm text-gray-500 mb-4">
                SR-22, Boat, RV, Mobile Home, Bond, Mexico Ins, other
              </p>

              <a
                href="tel:+14697295185"
                className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
              >
                Contact Us &gt;&gt;
              </a>
            </div>
          </div>
        </div>

        {/* Add margin-top to create space between sections */}

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

        {/* Customer Testimonials Section */}

        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
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
                  src="/testo1.png" // Replace with your image path
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
                  src="/testo2.png" // Replace with your image path
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
                  src="/testo3.png" // Replace with your image path
                  alt="Maya Chen"
                  width={96}
                  height={96}
                  className="object-cover"
                />
              </div>

              <p className="text-gray-700 mb-4 italic">
                Outstanding customer service! Texas Premium Insurance Services
                is truly a one-stop shop for all your insurance needs across the
                state. No matter where you are in Texas, they’ve got you
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

        {/* Add margin-top to create space between sections */}

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
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
              {/* Number Badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold shadow-lg">
                1
              </div>

              {/* Icon */}
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
              {/* Number Badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold shadow-lg">
                2
              </div>

              {/* Icon */}
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
                We&apos;ll search 30+ leading companies to bring you the most
                competitive rates.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-shadow duration-300">
              {/* Number Badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold shadow-lg">
                3
              </div>

              {/* Icon */}
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
        </div>

        <div className="text-center mt-12">
          <a
            href="/quote"
            className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-8 rounded-full hover:bg-[#102a56] transition"
          >
            Start Your Quote
          </a>
        </div>
      </div>
    </>
  );
}
