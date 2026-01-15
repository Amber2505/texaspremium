// app/[locale]/(root)/layout.tsx - REPLACE ENTIRE FILE
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import ChatWidget from "../components/ChatButton";
import { useTranslations, useLocale } from "next-intl";

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  const t = useTranslations("RootLayout");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [isGetInsuranceOpen, setIsGetInsuranceOpen] = useState(false);
  const [isPolicyServicesOpen, setIsPolicyServicesOpen] = useState(false); // ✅ NEW
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const getInsuranceRef = useRef<HTMLDivElement>(null);
  const policyServicesRef = useRef<HTMLDivElement>(null); // ✅ NEW
  const insuranceDropdownRef = useRef<HTMLDivElement>(null);
  const policyDropdownRef = useRef<HTMLDivElement>(null); // ✅ NEW

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        getInsuranceRef.current &&
        !getInsuranceRef.current.contains(event.target as Node)
      ) {
        setIsGetInsuranceOpen(false);
      }
      // ✅ NEW: Handle policy services dropdown
      if (
        policyServicesRef.current &&
        !policyServicesRef.current.contains(event.target as Node)
      ) {
        setIsPolicyServicesOpen(false);
      }
      if (
        insuranceDropdownRef.current &&
        !insuranceDropdownRef.current.contains(event.target as Node) &&
        policyDropdownRef.current &&
        !policyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    const handleResize = () => {
      // Get Insurance dropdown resize
      if (
        isGetInsuranceOpen &&
        insuranceDropdownRef.current &&
        getInsuranceRef.current &&
        !isMobileMenuOpen
      ) {
        const dropdown = insuranceDropdownRef.current;
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
      // ✅ NEW: Policy Services dropdown resize
      if (
        isPolicyServicesOpen &&
        policyDropdownRef.current &&
        policyServicesRef.current &&
        !isMobileMenuOpen
      ) {
        const dropdown = policyDropdownRef.current;
        const button = policyServicesRef.current;
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

    if (isGetInsuranceOpen || isPolicyServicesOpen || isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", handleResize);
      handleResize();
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
    };
  }, [isGetInsuranceOpen, isPolicyServicesOpen, isMobileMenuOpen]);

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
    setIsGetInsuranceOpen(false);
    setIsPolicyServicesOpen(false); // ✅ NEW
  };

  const switchLanguage = (newLocale: string) => {
    const pathWithoutLocale = pathname.replace(`/${locale}`, "");
    const searchParams = new URLSearchParams(window.location.search);
    const queryString = searchParams.toString();
    const newUrl = `/${newLocale}${pathWithoutLocale}${
      queryString ? `?${queryString}` : ""
    }`;
    router.push(newUrl);
  };

  // ✅ NEW: Open chat with pre-filled message
  const openChatWithMessage = (message: string) => {
    sessionStorage.setItem("openChatWithMessage", message);
    window.dispatchEvent(
      new CustomEvent("openChatWithMessage", { detail: message })
    );
  };

  return (
    <div>
      <nav className="bg-[#E5E5E5] text-gray-900 p-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}`}
            onClick={handleNavClick}
            className="flex items-center"
          >
            <Image
              src="/logo.png"
              alt={t("nav.logoAlt")}
              width={200}
              height={200}
              className="w-auto"
            />
          </Link>

          {/* Language Switcher - Desktop */}
          <div className="hidden md:flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 shadow-sm">
            <button
              onClick={() => switchLanguage("en")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-sm transition-colors ${
                locale === "en"
                  ? "bg-[#a0103d] text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="2" fill="#B22234" />
                <path
                  d="M0 2.77h24M0 5.54h24M0 8.31h24M0 11.08h24M0 13.85h24M0 16.62h24M0 19.39h24"
                  stroke="white"
                  strokeWidth="1.85"
                />
                <rect width="10" height="10.15" rx="1" fill="#3C3B6E" />
              </svg>
              EN
            </button>
            <button
              onClick={() => switchLanguage("es")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-sm transition-colors ${
                locale === "es"
                  ? "bg-[#a0103d] text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="8" fill="#006847" />
                <rect y="8" width="24" height="8" fill="white" />
                <rect y="16" width="24" height="8" fill="#CE1126" />
              </svg>
              ES
            </button>
          </div>
        </div>

        <div className="relative flex items-center gap-4">
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
            {/* Mobile Language Switcher */}
            <div className="md:hidden flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-2 mb-4">
              <button
                onClick={() => switchLanguage("en")}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md font-semibold text-sm transition-colors flex-1 ${
                  locale === "en"
                    ? "bg-[#a0103d] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="2" fill="#B22234" />
                  <path
                    d="M0 2.77h24M0 5.54h24M0 8.31h24M0 11.08h24M0 13.85h24M0 16.62h24M0 19.39h24"
                    stroke="white"
                    strokeWidth="1.85"
                  />
                  <rect width="10" height="10.15" rx="1" fill="#3C3B6E" />
                </svg>
                EN
              </button>
              <button
                onClick={() => switchLanguage("es")}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md font-semibold text-sm transition-colors flex-1 ${
                  locale === "es"
                    ? "bg-[#a0103d] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="8" fill="#006847" />
                  <rect y="8" width="24" height="8" fill="white" />
                  <rect y="16" width="24" height="8" fill="#CE1126" />
                </svg>
                ES
              </button>
            </div>

            <div className="md:flex md:items-center md:justify-between md:gap-8 md:flex-grow space-y-2 md:space-y-0">
              {/* Get Insurance Dropdown */}
              <div className="relative" ref={getInsuranceRef}>
                <button
                  onClick={() => setIsGetInsuranceOpen(!isGetInsuranceOpen)}
                  className="w-full md:w-auto text-left md:text-center text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200 flex justify-between md:justify-center items-center"
                  aria-expanded={isGetInsuranceOpen}
                  aria-controls="get-insurance-menu"
                >
                  <b>{t("nav.getInsurance")}</b>
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
                    ref={insuranceDropdownRef}
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
                      {/* Vehicle Insurance */}
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          {t("nav.categories.vehicle")}
                        </h3>
                        <ul>
                          {[
                            { href: "/auto", label: t("nav.insurance.auto") },
                            {
                              href: "/motorcycle",
                              label: t("nav.insurance.motorcycle"),
                            },
                            {
                              href: "/boats",
                              label: t("nav.insurance.boats"),
                            },
                            { href: "/rv", label: t("nav.insurance.rv") },
                            { href: "/sr22", label: t("nav.insurance.sr22") },
                          ].map((item) => (
                            <li key={item.href}>
                              <Link
                                href={`/${locale}${item.href}`}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Property Insurance */}
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          {t("nav.categories.property")}
                        </h3>
                        <ul>
                          {[
                            {
                              href: "/homeowners",
                              label: t("nav.insurance.homeowners"),
                            },
                            {
                              href: "/renters",
                              label: t("nav.insurance.renters"),
                            },
                            {
                              href: "/mobile-home",
                              label: t("nav.insurance.mobileHome"),
                            },
                          ].map((item) => (
                            <li key={item.href}>
                              <Link
                                href={`/${locale}${item.href}`}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Commercial Insurance */}
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          {t("nav.categories.commercial")}
                        </h3>
                        <ul>
                          {[
                            {
                              href: "/commercial-auto",
                              label: t("nav.insurance.commercialAuto"),
                            },
                            {
                              href: "/general-liability",
                              label: t("nav.insurance.generalLiability"),
                            },
                          ].map((item) => (
                            <li key={item.href}>
                              <Link
                                href={`/${locale}${item.href}`}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Other Insurance */}
                      <div>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                          {t("nav.categories.andMore")}
                        </h3>
                        <ul>
                          {[
                            {
                              href: "/mexico-tourist",
                              label: t("nav.insurance.mexicoTourist"),
                            },
                            {
                              href: "/surety-bond",
                              label: t("nav.insurance.suretyBond"),
                            },
                          ].map((item) => (
                            <li key={item.href}>
                              <Link
                                href={`/${locale}${item.href}`}
                                className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                                role="menuitem"
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ✅ Manage Policy Dropdown */}
              <div className="relative" ref={policyServicesRef}>
                <button
                  onClick={() => setIsPolicyServicesOpen(!isPolicyServicesOpen)}
                  className="w-full md:w-auto text-left md:text-center text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200 flex justify-between md:justify-center items-center"
                  aria-expanded={isPolicyServicesOpen}
                  aria-controls="policy-services-menu"
                >
                  <b>{t("nav.managePolicy")}</b>
                  <svg
                    className={`md:ml-1 h-4 w-4 transition-transform ${
                      isPolicyServicesOpen ? "rotate-180" : ""
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

                {isPolicyServicesOpen && (
                  <div
                    ref={policyDropdownRef}
                    id="policy-services-menu"
                    className={`${
                      isMobileMenuOpen
                        ? "pl-4 space-y-2"
                        : "absolute top-full mt-2 w-[220px] bg-white rounded-md py-4 px-6 shadow-lg"
                    } z-10 transition-all duration-300 ease-in-out`}
                    role="menu"
                  >
                    <div>
                      <h3 className="text-sm md:text-lg font-semibold text-gray-800 mb-2">
                        {t("nav.policyActions.title")}
                      </h3>
                      <ul>
                        <li>
                          <button
                            onClick={() => {
                              handleNavClick();
                              openChatWithMessage("payment link");
                            }}
                            className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base text-left w-full"
                            role="menuitem"
                          >
                            {t("nav.policyActions.makePayment")}
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              handleNavClick();
                              openChatWithMessage("open a claim");
                            }}
                            className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base text-left w-full"
                            role="menuitem"
                          >
                            {t("nav.policyActions.fileClaim")}
                          </button>
                        </li>
                        <li>
                          <Link
                            href={`/${locale}/view_documents`}
                            className="block py-1 text-gray-700 hover:text-[#a0103d] text-sm md:text-base"
                            role="menuitem"
                            onClick={handleNavClick}
                          >
                            {t("nav.policyActions.accessDocuments")}
                          </Link>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <Link
                href={`/${locale}/about`}
                onClick={handleNavClick}
                className="block text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200"
              >
                <b>{t("nav.aboutUs")}</b>
              </Link>

              <a
                href="tel:+14697295185"
                onClick={handleNavClick}
                className="block w-full md:w-auto text-center px-6 py-2 md:py-3 bg-[#a0103d] text-white text-sm md:text-base font-semibold rounded-full shadow-md hover:bg-[#7d0b2e] transition duration-300 ease-in-out group overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full bg-white opacity-10 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out origin-left rounded-full" />
                {t("nav.callNow")}
              </a>
            </div>
          </div>
        </div>
      </nav>
      {children}
      <footer className="bg-black text-white footer-text">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-center md:text-left">
            <div className="mb-4 md:mb-0">
              <p className="text-sm text-white">
                {t("footer.contactUs")}:{" "}
                <a
                  href="tel:+14697295185"
                  className="text-blue-400 hover:underline hover:text-blue-300"
                >
                  (469) 729-5185
                </a>
              </p>
              <p className="text-sm text-white">{t("footer.hours")}</p>
            </div>
            <div className="flex justify-center space-x-6 mb-4 md:mb-0">
              <a
                href="https://www.facebook.com/TexasPremiumIns"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="transform hover:scale-110 transition-transform duration-200"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-blue-400 transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24h11.494v-9.294H9.694v-3.622h3.125V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.732 0 1.325-.593 1.325-1.324V1.325C24 .593 23.407 0 22.675 0z" />
                </svg>
              </a>

              <a
                href="https://www.instagram.com/texaspremiumins/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="transform hover:scale-110 transition-transform duration-200"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-blue-400 transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.173.281 2.686.505.576.235 1.01.52 1.462.927.452.407.692.885.927 1.462.224.513.443 1.32.505 2.686.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.281 2.173-.505 2.686-.235.576-.52 1.01-.927 1.462-.407.452-.885.692-1.462.927-.513.224-1.32.443-2.686.505-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.173-.281-2.686-.505-.576-.235-1.01-.52-1.462-.927-.452-.407-.692-.885-.927-1.462-.224-.513-.443-1.32-.505-2.686-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.281-2.173.505-2.686.235-.576.52-1.01.927-1.462.407-.452.885-.692 1.462-.927.513-.224 1.32-.443 2.686-.505 1.266-.058 1.646-.07 4.85-.07m0-2.163C8.736 0 8.332.012 7.052.07c-1.338.064-2.127.287-2.784.611-.69.346-1.31.804-1.895 1.388-.585.584-1.042 1.205-1.388 1.895-.324.657-.547 1.446-.611 2.784C.012 8.332 0 8.736 0 12s.012 3.668.07 4.948c.064 1.338.287 2.127.611 2.784.346.69.804 1.31 1.388 1.895.584.585 1.205 1.042 1.895 1.388.657.324 1.446.547 2.784.611 1.28.058 1.684.07 4.948.07s3.668-.012 4.948-.07c1.338-.064 2.127-.287 2.784-.611.69-.346 1.31-.804 1.895-1.388.585-.584 1.042-1.205 1.388-1.895.324-.657.547-1.446.611-2.784.058-1.28.07-1.684.07-4.948s-.012-3.668-.07-4.948c-.064-1.338-.287-2.127-.611-2.784-.346-.69-.804-1.31-1.388-1.895-.584-.585-1.205-1.042-1.895-1.388-.657-.324-1.446-.547-2.784-.611-1.28-.058-1.684-.07-4.948-.07zM12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c0 .796-.646 1.442-1.442 1.442-.796 0-1.442-.646-1.442-1.442 0-.796.646-1.442 1.442-1.442.796 0 1.442.646 1.442 1.442z" />
                </svg>
              </a>

              <a
                href="https://x.com/TexasPremiumIns"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (formerly Twitter)"
                className="transform hover:scale-110 transition-transform duration-200"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-gray-400 transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              <a
                href="https://www.youtube.com/@TexasPremiumIns"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="transform hover:scale-110 transition-transform duration-200"
              >
                <svg
                  className="w-6 h-6 text-white hover:text-red-500 transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.555 15.71v-7.397l7.297 3.697-7.297 3.7z" />
                </svg>
              </a>
            </div>
            <div className="text-sm text-white text-center">
              <p className="text-white">
                © {currentYear} {t("footer.copyright")}
              </p>
              <p className="mt-2">
                <Link
                  href={`/${locale}/terms`}
                  className="underline text-white hover:text-blue-400"
                >
                  {t("footer.termsLink")}
                </Link>
              </p>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-4 border-t border-gray-600 pt-4 text-sm text-white">
            <p className="text-white">{t("footer.disclaimer")}</p>
          </div>
        </div>
      </footer>
      <ChatWidget />
    </div>
  );
};

export default RootLayout;
