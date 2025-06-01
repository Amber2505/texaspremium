"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  const [isGetInsuranceOpen, setIsGetInsuranceOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const getInsuranceRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateScreenSize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        getInsuranceRef.current &&
        !getInsuranceRef.current.contains(event.target as Node)
      ) {
        setIsGetInsuranceOpen(false);
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    const handleResize = () => {
      updateScreenSize();
      if (
        isGetInsuranceOpen &&
        dropdownRef.current &&
        getInsuranceRef.current &&
        !isMobileMenuOpen
      ) {
        const dropdown = dropdownRef.current;
        const button = getInsuranceRef.current;
        const rect = button.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const dropdownWidth = dropdown.offsetWidth;
        if (rect.right + dropdownWidth > viewportWidth) {
          dropdown.style.left = `${
            viewportWidth - rect.right - dropdownWidth
          }px`;
          dropdown.style.right = "auto";
        } else {
          dropdown.style.left = "0";
          dropdown.style.right = "auto";
        }
      }
    };

    updateScreenSize();
    if (isGetInsuranceOpen || isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", handleResize);
      handleResize();
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
    };
  }, [isGetInsuranceOpen, isMobileMenuOpen]);

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
    setIsGetInsuranceOpen(false);
  };

  return (
    <div>
      <nav className="bg-[#E5E5E5] text-gray-900 p-5 flex justify-between items-center">
        <Link href="/" onClick={handleNavClick} className="flex items-center">
          <Image
            src="/logo.png"
            alt="Texas Premium Insurance Services"
            width={200} // ✅ pixel value
            height={200} // ✅ pixel value
            className="w-auto" // Tailwind class for automatic width (optional here)
          />
        </Link>

        <div className="relative flex items-center">
          <button
            className="md:hidden text-3xl focus:outline-none transition-transform duration-300"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {isMobileMenuOpen ? "✕" : "☰"}
          </button>

          <div
            id="mobile-menu"
            className={`${
              isMobileMenuOpen ? "block" : "hidden"
            } md:flex md:items-center absolute md:static top-full right-0 w-64 bg-white md:bg-transparent rounded-md shadow-lg md:shadow-none p-4 md:p-0 z-20 md:w-auto md:flex-row transition-all duration-300 ease-in-out`}
          >
            <div className="md:flex md:items-center md:justify-between md:gap-8 md:flex-grow space-y-2 md:space-y-0">
              <div className="relative" ref={getInsuranceRef}>
                <button
                  onClick={() => setIsGetInsuranceOpen(!isGetInsuranceOpen)}
                  className="w-full md:w-auto text-left md:text-center text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200 flex justify-between md:justify-center items-center"
                  aria-expanded={isGetInsuranceOpen}
                  aria-controls="get-insurance-menu"
                >
                  <b>Get Insurance</b>
                  <svg
                    className={`md:ml-1 h-4 w-4 transition-transform ${
                      isGetInsuranceOpen ? "rotate-180" : ""
                    } md:inline-block`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isGetInsuranceOpen && (
                  <div
                    ref={dropdownRef}
                    id="get-insurance-menu"
                    className={`${
                      isMobileMenuOpen
                        ? "pl-4 space-y-2"
                        : "absolute top-full mt-2 w-[calc(100vw-20px)] max-w-[600px] bg-white rounded-md py-4 px-6 shadow-lg md:w-[600px]"
                    } z-10 transition-all duration-300 ease-in-out`}
                    role="menu"
                  >
                    <div
                      className={`${
                        isMobileMenuOpen
                          ? "space-y-4"
                          : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6"
                      }`}
                    >
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          Vehicles
                        </h3>
                        <ul>
                          {[
                            { href: "/auto", label: "Auto" },
                            {
                              href: "/motorcycle",
                              label: "Motorcycle",
                            },
                            {
                              href: "/boats",
                              label: "Boats & Watercraft",
                            },
                            { href: "/rv", label: "RV" },
                            { href: "/sr22", label: "SR-22" },
                          ].map((item) => (
                            <li key={item.href}>
                              <a
                                href={item.href}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          Property
                        </h3>
                        <ul>
                          {[
                            {
                              href: "/homeowners",
                              label: "Homeowners",
                            },
                            { href: "/renters", label: "Renters" },
                            {
                              href: "/mobile-home",
                              label: "Mobile Home",
                            },
                          ].map((item) => (
                            <li key={item.href}>
                              <a
                                href={item.href}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          Commercial
                        </h3>
                        <ul>
                          {[
                            {
                              href: "/commercial-auto",
                              label: "Commercial Auto",
                            },
                            {
                              href: "/general-liability",
                              label: "General Liability",
                            },
                          ].map((item) => (
                            <li key={item.href}>
                              <a
                                href={item.href}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          And More
                        </h3>
                        <ul>
                          {[
                            {
                              href: "/mexico-tourist",
                              label: "Mexico Tourist",
                            },
                            {
                              href: "/surety-bond",
                              label: "Surety Bond",
                            },
                            {
                              href: "/notary-services",
                              label: "Notary Services",
                            },
                          ].map((item) => (
                            <li key={item.href}>
                              <a
                                href={item.href}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Link
                href="/about"
                onClick={handleNavClick}
                className="block text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200"
              >
                <b>About Us</b>
              </Link>

              <a
                href="tel:+14697295185"
                onClick={handleNavClick}
                className="block w-full md:w-auto text-center px-6 py-2 md:py-3 bg-[#a0103d] text-white text-sm md:text-base font-semibold rounded-full shadow-md hover:bg-[#7d0b2e] transition duration-300 ease-in-out group overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full bg-white opacity-10 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out origin-left rounded-full" />
                📞 Call Now 469-729-5185
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* <div className="fixed bottom-4 right-4 bg-gray-800 text-white text-sm px-3 py-2 rounded-md shadow-lg z-50">
        Screen: {screenSize.width}px × {screenSize.height}px
      </div> */}

      {children}
      <footer className="bg-black text-white footer-text">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-center md:text-left">
            <div className="mb-4 md:mb-0">
              <p className="text-sm text-white">
                Contact Us:{" "}
                <a
                  href="tel:+14697295185"
                  className="text-blue-400 hover:underline hover:text-blue-300"
                >
                  (469) 729-5185
                </a>
              </p>
              <p className="text-sm text-white">
                Mon - Sat | 9 a.m. - 7 p.m. CT
              </p>
            </div>
            <div className="flex space-x-4 mb-4 md:mb-0">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24h11.494v-9.294H9.694v-3.622h3.125V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.732 0 1.325-.593 1.325-1.324V1.325C24 .593 23.407 0 22.675 0z" />
                </svg>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.173.281 2.686.505.576.235 1.01.52 1.462.927.452.407.692.885.927 1.462.224.513.443 1.32.505 2.686.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.281 2.173-.505 2.686-.235.576-.52 1.01-.927 1.462-.407.452-.885.692-1.462.927-.513.224-1.32.443-2.686.505-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.173-.281-2.686-.505-.576-.235-1.01-.52-1.462-.927-.452-.407-.692-.885-.927-1.462-.224-.513-.443-1.32-.505-2.686-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.281-2.173.505-2.686.235-.576.52-1.01.927-1.462.407-.452.885-.692 1.462-.927.513-.224 1.32-.443 2.686-.505 1.266-.058 1.646-.07 4.85-.07m0-2.163C8.736 0 8.332.012 7.052.07c-1.338.064-2.127.287-2.784.611-.69.346-1.31.804-1.895 1.388-.585.584-1.042 1.205-1.388 1.895-.324.657-.547 1.446-.611 2.784C.012 8.332 0 8.736 0 12s.012 3.668.07 4.948c.064 1.338.287 2.127.611 2.784.346.69.804 1.31 1.388 1.895.584.585 1.205 1.042 1.895 1.388.657.324 1.446.547 2.784.611 1.28.058 1.684.07 4.948.07s3.668-.012 4.948-.07c1.338-.064 2.127-.287 2.784-.611.69-.346 1.31-.804 1.895-1.388.585-.584 1.042-1.205 1.388-1.895.324-.657.547-1.446.611-2.784.058-1.28.07-1.684.07-4.948s-.012-3.668-.07-4.948c-.064-1.338-.287-2.127-.611-2.784-.346-.69-.804-1.31-1.388-1.895-.584-.585-1.205-1.042-1.895-1.388-.657-.324-1.446-.547-2.784-.611-1.28-.058-1.684-.07-4.948-.07zM12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c0 .796-.646 1.442-1.442 1.442-.796 0-1.442-.646-1.442-1.442 0-.796.646-1.442 1.442-1.442.796 0 1.442.646 1.442 1.442z" />
                </svg>
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M23.954 4.569c-.885.39-1.83.654-2.825.775 1.014-.611 1.794-1.574 2.163-2.723-.951.555-2.005.959-3.127 1.184-.896-.959-2.173-1.559-3.591-1.559-2.717 0-4.92 2.203-4.92 4.917 0 .39.045.765.127 1.124C7.691 8.094 4.066 6.13 1.64 3.161c-.427.722-.666 1.561-.666 2.475 0 1.71.87 3.213 2.188 4.096-.807-.026-1.566-.248-2.228-.616v.061c0 2.385 1.693 4.374 3.946 4.827-.413.111-.849.171-1.296.171-.314 0-.615-.03-.916-.086.631 1.953 2.445 3.377 4.604 3.417-1.68 1.319-3.809 2.105-6.102 2.105-.39 0-.779-.023-1.17-.067 2.189 1.394 4.768 2.209 7.557 2.209 9.054 0 14.008-7.496 14.008-13.985 0-.21 0-.42-.015-.63.961-.695 1.8-1.562 2.457-2.549l-.047-.02z" />
                </svg>
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.555 15.71v-7.397l7.297 3.697-7.297 3.7z" />
                </svg>
              </a>
            </div>
            <div className="text-sm text-white">
              <p className="text-white">
                © 2025 Texas Premium Insurance Services, LLC
              </p>
              <p className="mt-2">
                <a
                  href="/terms"
                  className="underline text-white hover:text-blue-400"
                >
                  Terms of Service
                </a>{" "}
                |{" "}
                <a
                  href="/privacy"
                  className="underline text-white hover:text-blue-400"
                >
                  Privacy Policy
                </a>{" "}
                |{" "}
                <a
                  href="/licenses"
                  className="underline text-white hover:text-blue-400"
                >
                  Licenses
                </a>{" "}
                |{" "}
                <a
                  href="/accessibility"
                  className="underline text-white hover:text-blue-400"
                >
                  Accessibility
                </a>
              </p>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-4 border-t border-gray-600 pt-4 text-sm text-white">
            <p className="text-white">
              Texas Premium Insurance Services LLC is an insurance agency that
              sources quotes from multiple carriers to provide you with the most
              competitive rates. By submitting information through our online
              portal or forms, you certify that all details, including household
              residents, accidents, DUIs/DWIs, tickets, and any expired or
              suspended licenses, are accurate and complete to the best of your
              knowledge. This applies whether you receive an immediate quote or
              are contacted by an agency representative to finalize your quote.
              Failure to provide accurate information may result in increased
              premiums, policy cancellation, or denial of coverage. Claims are
              processed and paid by the selected insurance carrier. Our agency
              will assist you with the claims process but is not responsible for
              claim denials due to misrepresentation, fraud, non-disclosure of
              material facts, policy exclusions, or any other reason.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default RootLayout;
