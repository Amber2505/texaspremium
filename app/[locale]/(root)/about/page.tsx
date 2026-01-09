"use client";

import { useTranslations } from "next-intl";

export default function About() {
  const t = useTranslations("About");

  return (
    <div
      className="about-content"
      style={{
        padding: "40px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h3 className="text-2xl font-bold mb-6">{t("title")}</h3>

      <p className="mb-6 leading-relaxed">{t("intro")}</p>

      <p className="mb-6 leading-relaxed">{t("mission")}</p>

      <h4 className="text-xl font-semibold mb-4 mt-8">
        {t("whyChoose.title")}
      </h4>

      <p className="mb-4">{t("whyChoose.intro")}</p>

      <ul className="list-disc ml-8 mb-6 space-y-3">
        <li>
          <strong>{t("whyChoose.reasons.shopSave.title")}</strong>:{" "}
          {t("whyChoose.reasons.shopSave.description")}
        </li>
        <li>
          <strong>{t("whyChoose.reasons.coverage.title")}</strong>:{" "}
          {t("whyChoose.reasons.coverage.description")}
        </li>
        <li>
          <strong>{t("whyChoose.reasons.expert.title")}</strong>:{" "}
          {t("whyChoose.reasons.expert.description")}
        </li>
        <li>
          <strong>{t("whyChoose.reasons.allIds.title")}</strong>:{" "}
          {t("whyChoose.reasons.allIds.description")}
        </li>
        <li>
          <strong>{t("whyChoose.reasons.customer.title")}</strong>:{" "}
          {t("whyChoose.reasons.customer.description")}
        </li>
        <li>
          <strong>{t("whyChoose.reasons.fast.title")}</strong>:{" "}
          {t("whyChoose.reasons.fast.description")}
        </li>
      </ul>

      <h4 className="text-xl font-semibold mb-4 mt-8">{t("journey.title")}</h4>

      <p className="mb-6 leading-relaxed">{t("journey.description")}</p>

      <h4 className="text-xl font-semibold mb-4 mt-8">{t("funFact.title")}</h4>

      <p className="mb-6 leading-relaxed">{t("funFact.description")}</p>

      <h4 className="text-xl font-semibold mb-4 mt-8">{t("ready.title")}</h4>

      <p className="mb-6 leading-relaxed">
        {t("ready.description")}{" "}
        <a
          href="tel:+14697295185"
          className="text-blue-600 underline hover:text-blue-800"
        >
          (469) 729-5185
        </a>{" "}
        {t("ready.or")}{" "}
        <a
          href="https://texaspremiumins.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800"
        >
          texaspremiumins.com
        </a>{" "}
        {t("ready.closing")}
      </p>
    </div>
  );
}
