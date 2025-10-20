"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function SR22Page() {
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

    // Format the message from form data
    const message = `Test \nSR-22 Inquiry:\nName: ${formData.name}\nEmail: ${
      formData.email
    }\nPhone: ${formData.phone}\nMessage: ${
      formData.message || "No message provided"
    }`;
    const encodedMessage = encodeURIComponent(message);
    const toNumber = "9727486404";
    const url = `https://astraldbapi.herokuapp.com/texas_premium_message_send/?message=${encodedMessage}&To=${toNumber}`;

    try {
      const response = await fetch(url, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const result = await response.json();
      console.log("Message sent successfully:", result);
      alert("Thank you for your inquiry! An agent will contact you soon.");

      // Reset form data
      setFormData({
        name: "",
        email: "",
        phone: "",
        message: "",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert(
        "Failed to send inquiry via SMS. Please try again or call (469) 729-5185."
      );
    }
  };
  return (
    <div className="font-sans leading-relaxed m-0 p-2 max-w-7xl mx-auto text-gray-800">
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Call to Get a Quote
        </a>
      </div>

      {/* Header with Text and Image */}
      <header className="relative bg-gray-50 py-12 mb-8 rounded-xl overflow-hidden">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center">
          <div className="md:w-3/5 z-10">
            <h1 className="text-gray-700 text-4xl md:text-5xl font-bold mb-4">
              SR-22 Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Need an SR-22 in Texas?</strong> This guide explains what
              an SR-22 is, why you might need it, how to get it, and what it
              means for Texas drivers looking to reinstate their driving
              privileges.
            </p>
            <a
              href="tel:+1-469-729-5185"
              className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
            >
              Get Started Now
            </a>
          </div>
          <div className="md:w-2/5 mt-8 md:mt-0">
            <Image
              src="/Sr22pic.jpg"
              alt="Business professional in a modern office"
              width={400}
              height={300}
              className="rounded-lg shadow-xl transform -rotate-3 hover:rotate-0 transition duration-300 ease-in-out"
            />
          </div>
        </div>
      </header>

      {/* New Contact Form Section */}
      <section className="bg-gray-50 p-6 rounded-xl mb-8 border-l-4 border-blue-500">
        <h2 className="text-gray-700 text-3xl mb-4">
          Request a SR-22 Insurance Quote
        </h2>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label
              htmlFor="name"
              className="block text-gray-700 font-medium mb-1"
            >
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your full name"
              required
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-gray-700 font-medium mb-1"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your email address"
              required
            />
          </div>
          <div>
            <label
              htmlFor="phone"
              className="block text-gray-700 font-medium mb-1"
            >
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your phone number"
              required
            />
          </div>
          <div>
            <label
              htmlFor="message"
              className="block text-gray-700 font-medium mb-1"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tell us about your SR-22 needs or driving situation"
              rows={4}
            />
          </div>
          <button
            type="submit"
            className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl w-full md:w-auto transition duration-300 ease-in-out transform hover:scale-105"
          >
            Submit Inquiry
          </button>
        </form>
      </section>

      <h2 className="text-gray-700 text-3xl mt-8">
        What Is SR-22 Insurance in Texas?
      </h2>
      <p className="mb-4">
        In Texas, an SR-22 is a{" "}
        <strong>Certificate of Financial Responsibility</strong> filed by your
        auto insurance company with the Texas Department of Public Safety (DPS)
        to prove you carry the state&#39;s minimum liability insurance coverage.
        It&#39;s not a type of insurance but a document verifying that you meet
        Texas&#39;s financial responsibility requirements, typically required
        for high-risk drivers after serious driving violations or license
        suspensions.
      </p>
      <p className="mb-4">
        The SR-22 ensures you maintain continuous insurance coverage for a
        specified period, allowing you to regain or maintain your driving
        privileges in Texas.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Might You Need an SR-22 in Texas?
      </h2>
      <p className="mb-4">
        In Texas, an SR-22 is required for drivers who have committed certain
        violations or had their license suspended. Common reasons include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>DWI or DUI convictions</strong>: Driving while intoxicated or
          under the influence is a common trigger for an SR-22 requirement.
        </li>
        <li className="mb-2">
          <strong>Driving without insurance</strong>: Operating a vehicle
          without valid liability insurance violates Texas law and often
          requires an SR-22.
        </li>
        <li className="mb-2">
          <strong>Driving with a suspended or revoked license</strong>: If
          caught driving while your license is suspended, you may need an SR-22
          to reinstate it.
        </li>
        <li className="mb-2">
          <strong>Serious traffic violations</strong>: Offenses like reckless
          driving or accumulating too many points on your driving record can
          lead to an SR-22 mandate.
        </li>
        <li className="mb-2">
          <strong>At-fault accidents without insurance</strong>: Causing an
          accident while uninsured often requires an SR-22 to prove future
          financial responsibility.
        </li>
        <li className="mb-2">
          <strong>Failure to pay judgments</strong>: Unresolved traffic-related
          judgments may necessitate an SR-22 filing.
        </li>
      </ul>
      <p className="mb-4">
        The Texas DPS or a court will notify you if an SR-22 is required,
        typically through a court order or a letter from the DPS.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does SR-22 Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        An SR-22 in Texas is a form your insurance provider files with the Texas
        DPS to confirm you have at least the state&#39;s minimum liability
        insurance, which is 30/60/25 coverage ($30,000 per person, $60,000 per
        accident for bodily injury, and $25,000 for property damage). Here&#39;s
        how the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Notification</strong>: You receive a court order or a letter
          from the Texas Department of Public Safety (DPS) stating that you’re
          required to file an SR-22.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll handle
          the SR-22 process for you—making it simple and stress-free.
          <br />- If you <strong>own a vehicle</strong>, we can provide you with
          an auto insurance policy that includes the SR-22 filing.
          <br />- If you <strong>don’t own a car</strong>, we’ll help you obtain
          a <strong>non-owner SR-22 policy</strong> that meets Texas
          requirements.
        </li>
        <li>
          <strong>Filing the SR-22</strong>: Once your policy is in place, we’ll
          have your insurer <strong>electronically file the SR-22</strong> with
          the Texas DPS. Most companies charge a small filing fee.
        </li>
        <li>
          <strong>Submit to DPS</strong>: In addition to the electronic filing,
          you are also required to submit your SR-22 documentation to the Texas
          DPS. You can send it using any of the following methods:
          <ul>
            <li>
              <strong>Mailing Address</strong>:<br />
              Texas Department of Public Safety
              <br />
              Enforcement and Compliance Service
              <br />
              P.O. Box 4087
              <br />
              Austin, TX 78773-0320
            </li>
            <li>
              <strong>Fax</strong>: (512) 424-2848
            </li>
            <li>
              <strong>Email</strong>: driver.improvement@dps.texas.gov
            </li>
          </ul>
        </li>
        <li>
          <strong>Maintain Coverage</strong>: You must maintain continuous
          insurance coverage for the duration of the SR-22 requirement,
          typically <strong>2 years</strong> in Texas. A lapse in coverage will
          result in penalties.
        </li>
        <li>
          <strong>DPS Monitoring</strong>: The Texas DPS actively monitors your
          insurance status. If your policy lapses or is canceled, your insurer
          will file an <strong>SR-26 form</strong>, which can result in{" "}
          <strong>license suspension</strong> or other consequences.
        </li>
        <li>
          <strong>Completion</strong>: After the SR-22 period ends, you can
          request to end the filing, and we will coordinate with your insurer to
          stop the SR-22 submission, which may{" "}
          <strong>lower your premiums</strong>.
        </li>
      </ol>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your SR-22 Insurance Today
        </a>
      </div>
    </div>
  );
}
