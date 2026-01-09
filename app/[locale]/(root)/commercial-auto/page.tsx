"use client";
import React, { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

export default function CommercialAutoInsurancePage() {
  const t = useTranslations("commercialAuto");

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const message = `Test \nCommercial Auto Insurance Inquiry:\nName: ${
      formData.name
    }\nEmail: ${formData.email}\nPhone: ${formData.phone}\nMessage: ${
      formData.message || "No message provided"
    }`;
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
      alert(t("form.successMessage"));

      setFormData({
        name: "",
        email: "",
        phone: "",
        message: "",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert(t("form.errorMessage"));
    }
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
              src="/commercialautopic.jpg"
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
        <form onSubmit={handleSubmit} className="grid gap-4">
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
            type="submit"
            className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl w-full md:w-auto transition duration-300 ease-in-out transform hover:scale-105"
          >
            {t("form.submitButton")}
          </button>
        </form>
      </section>

      <h2 className="text-gray-700 text-3xl mt-8">{t("whatIs.title")}</h2>
      <p className="mb-4">{t("whatIs.paragraph1")}</p>
      <p className="mb-4">{t("whatIs.paragraph2")}</p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("whyNeed.title")}</h2>
      <p className="mb-4">{t("whyNeed.intro")}</p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>{t("whyNeed.reasons.legal.title")}</strong>:{" "}
          {t("whyNeed.reasons.legal.description")}
        </li>
        <li className="mb-2">
          <strong>{t("whyNeed.reasons.asset.title")}</strong>:{" "}
          {t("whyNeed.reasons.asset.description")}
        </li>
        <li className="mb-2">
          <strong>{t("whyNeed.reasons.employee.title")}</strong>:{" "}
          {t("whyNeed.reasons.employee.description")}
        </li>
        <li className="mb-2">
          <strong>{t("whyNeed.reasons.client.title")}</strong>:{" "}
          {t("whyNeed.reasons.client.description")}
        </li>
        <li className="mb-2">
          <strong>{t("whyNeed.reasons.liability.title")}</strong>:{" "}
          {t("whyNeed.reasons.liability.description")}
        </li>
        <li className="mb-2">
          <strong>{t("whyNeed.reasons.continuity.title")}</strong>:{" "}
          {t("whyNeed.reasons.continuity.description")}
        </li>
      </ul>
      <p className="mb-4">{t("whyNeed.conclusion")}</p>

      <h2 className="text-gray-700 text-3xl mt-8">{t("howItWorks.title")}</h2>
      <p className="mb-4">{t("howItWorks.intro")}</p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>{t("howItWorks.steps.step1.title")}</strong>:{" "}
          {t("howItWorks.steps.step1.description")}
        </li>
        <li>
          <strong>{t("howItWorks.steps.step2.title")}</strong>:{" "}
          {t("howItWorks.steps.step2.intro")}
          <br />- {t("howItWorks.steps.step2.bullet1")}
          <br />- {t("howItWorks.steps.step2.bullet2")}
        </li>
        <li>
          <strong>{t("howItWorks.steps.step3.title")}</strong>:{" "}
          {t("howItWorks.steps.step3.description")}
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
      </ol>
      <div className="mb-4">
        <p>{t("howItWorks.coverage.intro")}</p>
        <ul className="pl-5">
          <li>
            <strong>{t("howItWorks.coverage.items.liability.title")}</strong>:{" "}
            {t("howItWorks.coverage.items.liability.description")}
          </li>
          <li>
            <strong>{t("howItWorks.coverage.items.physical.title")}</strong>:{" "}
            {t("howItWorks.coverage.items.physical.description")}
          </li>
          <li>
            <strong>{t("howItWorks.coverage.items.uninsured.title")}</strong>:{" "}
            {t("howItWorks.coverage.items.uninsured.description")}
          </li>
          <li>
            <strong>{t("howItWorks.coverage.items.medical.title")}</strong>:{" "}
            {t("howItWorks.coverage.items.medical.description")}
          </li>
        </ul>
        <p>{t("howItWorks.coverage.optional")}</p>
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
