"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

export default function CommercialGeneralLiabilityPage() {
  const t = useTranslations("cgl");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    console.log("Form submitted:", formData);
    alert(t("form.successMessage"));
    setFormData({ name: "", email: "", phone: "", message: "" });
  };

  return (
    <div className="font-sans leading-relaxed m-0 p-2 max-w-7xl mx-auto text-gray-800">
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          {t("header.callToAction")}
        </a>
      </div>

      <header className="relative bg-gray-50 py-12 mb-8 rounded-xl overflow-hidden">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center">
          <div className="md:w-3/5 z-10">
            <h1 className="text-gray-700 text-4xl md:text-5xl font-bold mb-4">
              {t("header.title")}
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>{t("header.subtitle")}</strong> {t("header.description")}
            </p>
            <a
              href="tel:+1-469-729-5185"
              className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
            >
              {t("header.getStarted")}
            </a>
          </div>
          <div className="md:w-2/5 mt-8 md:mt-0">
            <Image
              src="/building-construction-workers-site.jpg"
              alt={t("header.imageAlt")}
              width={400}
              height={300}
              className="rounded-lg shadow-xl transform -rotate-3 hover:rotate-0 transition duration-300 ease-in-out"
            />
          </div>
        </div>
      </header>

      <section className="bg-gray-50 p-6 rounded-xl mb-8 border-l-4 border-blue-500">
        <h2 className="text-gray-700 text-3xl mb-4">{t("form.title")}</h2>
        <div className="grid gap-4">
          <div>
            <label
              htmlFor="name"
              className="block text-gray-700 font-medium mb-1"
            >
              {t("form.nameLabel")}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t("form.namePlaceholder")}
              required
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-gray-700 font-medium mb-1"
            >
              {t("form.emailLabel")}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t("form.emailPlaceholder")}
              required
            />
          </div>
          <div>
            <label
              htmlFor="phone"
              className="block text-gray-700 font-medium mb-1"
            >
              {t("form.phoneLabel")}
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t("form.phonePlaceholder")}
              required
            />
          </div>
          <div>
            <label
              htmlFor="message"
              className="block text-gray-700 font-medium mb-1"
            >
              {t("form.messageLabel")}
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t("form.messagePlaceholder")}
              rows={4}
            />
          </div>
          <button
            onClick={handleSubmit}
            className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl w-full md:w-auto transition duration-300 ease-in-out transform hover:scale-105"
          >
            {t("form.submitButton")}
          </button>
        </div>
      </section>

      <h2 className="text-gray-700 text-3xl mt-8">{t("whatIs.title")}</h2>
      <p className="mb-4">{t("whatIs.paragraph1")}</p>
      <p className="mb-4">
        {t("whatIs.paragraph2")}{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        {t("whatIs.paragraph2End")}
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("whyNeed.title")}</h2>
      <p className="mb-4">{t("whyNeed.intro")}</p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>{t("whyNeed.reasons.legal.title")}</strong>:{" "}
          {t("whyNeed.reasons.legal.description")}
        </li>
        <li>
          <strong>{t("whyNeed.reasons.contract.title")}</strong>:{" "}
          {t("whyNeed.reasons.contract.description")}
        </li>
        <li>
          <strong>{t("whyNeed.reasons.financial.title")}</strong>:{" "}
          {t("whyNeed.reasons.financial.description")}
        </li>
        <li>
          <strong>{t("whyNeed.reasons.reputation.title")}</strong>:{" "}
          {t("whyNeed.reasons.reputation.description")}
        </li>
        <li>
          <strong>{t("whyNeed.reasons.compliance.title")}</strong>:{" "}
          {t("whyNeed.reasons.compliance.description")}{" "}
          <a
            href="https://www.tdi.texas.gov"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.tdi.texas.gov
          </a>
          ).
        </li>
      </ul>
      <p className="mb-4">
        {t("whyNeed.conclusion")}{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("howItWorks.title")}</h2>
      <p className="mb-4">{t("howItWorks.intro")}</p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>{t("howItWorks.steps.step1.title")}</strong>:{" "}
          {t("howItWorks.steps.step1.description")}{" "}
          <a
            href="https://www.tdi.texas.gov"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.tdi.texas.gov
          </a>
          .
        </li>
        <li>
          <strong>{t("howItWorks.steps.step2.title")}</strong>:{" "}
          {t("howItWorks.steps.step2.intro")}{" "}
          <a
            href="tel:+1-469-729-5185"
            className="text-blue-600 hover:underline"
          >
            (469) 729-5185
          </a>{" "}
          {t("howItWorks.steps.step2.description")}
          <ul className="list-disc pl-6 mt-1">
            <li>{t("howItWorks.steps.step2.items.type")}</li>
            <li>{t("howItWorks.steps.step2.items.revenue")}</li>
            <li>{t("howItWorks.steps.step2.items.location")}</li>
            <li>{t("howItWorks.steps.step2.items.claims")}</li>
          </ul>
        </li>
        <li>
          <strong>{t("howItWorks.steps.step3.title")}</strong>:{" "}
          {t("howItWorks.steps.step3.intro")}
          <ul className="list-disc pl-6 mt-1">
            <li>
              <strong>{t("howItWorks.steps.step3.items.bodily.title")}</strong>:{" "}
              {t("howItWorks.steps.step3.items.bodily.description")}
            </li>
            <li>
              <strong>
                {t("howItWorks.steps.step3.items.property.title")}
              </strong>
              : {t("howItWorks.steps.step3.items.property.description")}
            </li>
            <li>
              <strong>
                {t("howItWorks.steps.step3.items.advertising.title")}
              </strong>
              : {t("howItWorks.steps.step3.items.advertising.description")}
            </li>
            <li>
              <strong>
                {t("howItWorks.steps.step3.items.products.title")}
              </strong>
              : {t("howItWorks.steps.step3.items.products.description")}
            </li>
          </ul>
        </li>
        <li>
          <strong>{t("howItWorks.steps.step4.title")}</strong>:{" "}
          {t("howItWorks.steps.step4.description")}
        </li>
        <li>
          <strong>{t("howItWorks.steps.step5.title")}</strong>:{" "}
          {t("howItWorks.steps.step5.description")}
        </li>
        <li>
          <strong>{t("howItWorks.steps.step6.title")}</strong>:{" "}
          {t("howItWorks.steps.step6.description")}
        </li>
        <li>
          <strong>{t("howItWorks.steps.step7.title")}</strong>:{" "}
          {t("howItWorks.steps.step7.description")}{" "}
          <a
            href="tel:+1-469-729-5185"
            className="text-blue-600 hover:underline"
          >
            (469) 729-5185
          </a>
          .
        </li>
      </ol>

      <h2 className="text-gray-700 text-3xl mt-8">{t("coverage.title")}</h2>
      <p className="mb-4">{t("coverage.intro")}</p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>{t("coverage.items.bodily.title")}</strong>:{" "}
          {t("coverage.items.bodily.description")}
        </li>
        <li>
          <strong>{t("coverage.items.property.title")}</strong>:{" "}
          {t("coverage.items.property.description")}
        </li>
        <li>
          <strong>{t("coverage.items.advertising.title")}</strong>:{" "}
          {t("coverage.items.advertising.description")}
        </li>
        <li>
          <strong>{t("coverage.items.products.title")}</strong>:{" "}
          {t("coverage.items.products.description")}
        </li>
        <li>
          <strong>{t("coverage.items.medical.title")}</strong>:{" "}
          {t("coverage.items.medical.description")}
        </li>
        <li>
          <strong>{t("coverage.items.addons.title")}</strong>:{" "}
          {t("coverage.items.addons.description")}
        </li>
      </ul>
      <p className="mb-4">
        {t("coverage.help")}{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("costs.title")}</h2>
      <p className="mb-4">{t("costs.intro")}</p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>{t("costs.items.starting.title")}</strong>:{" "}
          {t("costs.items.starting.description")}
        </li>
        <li>
          <strong>{t("costs.items.factors.title")}</strong>:{" "}
          {t("costs.items.factors.description")}
        </li>
        <li>
          <strong>{t("costs.items.affordable.title")}</strong>:{" "}
          {t("costs.items.affordable.description")}
        </li>
        <li>
          <strong>{t("costs.items.noHidden.title")}</strong>:{" "}
          {t("costs.items.noHidden.description")}
        </li>
      </ul>
      <p className="mb-4">
        {t("costs.example")}{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("risks.title")}</h2>
      <p className="mb-4">{t("risks.intro")}</p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>{t("risks.items.lawsuits.title")}</strong>:{" "}
          {t("risks.items.lawsuits.description")}
        </li>
        <li>
          <strong>{t("risks.items.financial.title")}</strong>:{" "}
          {t("risks.items.financial.description")}
        </li>
        <li>
          <strong>{t("risks.items.contracts.title")}</strong>:{" "}
          {t("risks.items.contracts.description")}
        </li>
        <li>
          <strong>{t("risks.items.reputation.title")}</strong>:{" "}
          {t("risks.items.reputation.description")}
        </li>
      </ul>
      <p className="mb-4">
        {t("risks.conclusion")}{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("faq.title")}</h2>
      <div className="space-y-4 mb-8">
        <div>
          <h3 className="text-lg font-medium">
            {t("faq.questions.required.question")}
          </h3>
          <p className="text-gray-700">
            {t("faq.questions.required.answer")}{" "}
            <a
              href="https://www.tdi.texas.gov"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              www.tdi.texas.gov
            </a>
            .
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            {t("faq.questions.businesses.question")}
          </h3>
          <p className="text-gray-700">
            {t("faq.questions.businesses.answer")}
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            {t("faq.questions.employees.question")}
          </h3>
          <p className="text-gray-700">{t("faq.questions.employees.answer")}</p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            {t("faq.questions.claim.question")}
          </h3>
          <p className="text-gray-700">{t("faq.questions.claim.answer")}</p>
        </div>
      </div>

      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          {t("footer.callToAction")}
        </a>
      </div>
    </div>
  );
}
