"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function CommercialAutoInsurancePage() {
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
              Commercial Auto Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your business vehicles in Texas!</strong> This
              guide explains what commercial auto insurance is, why your
              business needs it, how to get it, and what it covers for Texas
              businesses relying on vehicles for operations.
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
              src="/commercialautopic.jpg"
              alt="Commercial vehicle in a Texas business setting"
              width={400}
              height={300}
              className="rounded-lg shadow-xl transform -rotate-3 hover:rotate-0 transition duration-300 ease-in-out"
            />
          </div>
        </div>
      </header>

      {/* Contact Form Section */}
      <section className="bg-gray-50 p-6 rounded-xl mb-8 border-l-4 border-blue-500">
        <h2 className="text-gray-700 text-3xl mb-4">
          Request a Commercial Auto Insurance Quote
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
              placeholder="Your business email address"
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
              placeholder="Tell us about your commercial auto insurance needs"
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
        What Is Commercial Auto Insurance in Texas?
      </h2>
      <p className="mb-4">
        Commercial auto insurance in Texas is a policy designed to protect
        vehicles used for business purposes, such as delivery vans, company
        cars, or service trucks. Unlike personal auto insurance, it covers
        unique risks associated with business operations, including liability,
        vehicle damage, and employee-related incidents. In Texas, commercial
        auto insurance is often required to meet state regulations and protect
        your business assets.
      </p>
      <p className="mb-4">
        This insurance ensures your business can operate smoothly, even after
        accidents, theft, or other incidents involving your commercial vehicles.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need Commercial Auto Insurance in Texas?
      </h2>
      <p className="mb-4">
        Businesses that rely on vehicles need commercial auto insurance to
        protect against financial losses and comply with Texas laws. Common
        reasons to get commercial auto insurance include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>Legal Requirements</strong>: Texas requires businesses to
          carry minimum liability coverage (30/60/25) for vehicles used
          commercially to cover bodily injury and property damage.
        </li>
        <li className="mb-2">
          <strong>Business Asset Protection</strong>: Protects your investment
          in vehicles, which are critical to your operations, from damage,
          theft, or vandalism.
        </li>
        <li className="mb-2">
          <strong>Employee Safety</strong>: Covers accidents involving employees
          driving company vehicles, including medical expenses or liability
          claims.
        </li>
        <li className="mb-2">
          <strong>Client or Contract Requirements</strong>: Many clients or
          contracts require proof of commercial auto insurance before doing
          business.
        </li>
        <li className="mb-2">
          <strong>Liability Risks</strong>: Protects your business from lawsuits
          if a company vehicle causes injury or property damage to others.
        </li>
        <li className="mb-2">
          <strong>Business Continuity</strong>: Ensures your business can
          recover quickly from vehicle-related incidents without significant
          financial strain.
        </li>
      </ul>
      <p className="mb-4">
        Even if not legally required, commercial auto insurance is essential for
        businesses to mitigate risks and maintain operational stability.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does Commercial Auto Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        Commercial auto insurance in Texas provides tailored coverage for
        vehicles used in business operations. Here’s how the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Evaluate the types of vehicles
          your business uses (e.g., vans, trucks, or fleets), their value, and
          the risks associated with your operations.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll help you
          find the right commercial auto insurance policy.
          <br />- We’ll customize coverage for <strong>liability</strong>,{" "}
          <strong>physical damage</strong>,
          <strong>uninsured/underinsured motorists</strong>, and optional
          add-ons like roadside assistance.
          <br />- If you have <strong>employees driving</strong>, we’ll ensure
          coverage for hired and non-owned auto liability.
        </li>
        <li>
          <strong>Policy Issuance</strong>: We’ll work with top insurers to
          issue a policy that meets Texas requirements and your business needs,
          including any client-specific coverage demands.
        </li>
        <li>
          <strong>Premium Payments</strong>: You’ll pay premiums (monthly or
          annually) to maintain coverage. We’ll help you find cost-effective
          options tailored to your budget.
        </li>
        <li>
          <strong>Claims Process</strong>: If an accident or loss occurs,
          contact us, and we’ll guide you through filing a claim with your
          insurer for prompt resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: We’ll monitor your policy to ensure
          it remains compliant and recommend updates as your business grows or
          adds vehicles.
        </li>
      </ol>
      <div className="mb-4">
        <p>Standard commercial auto insurance typically covers:</p>
        <ul className="pl-5">
          <li>
            <strong>Liability</strong>: Covers bodily injury and property damage
            caused by your vehicles.
          </li>
          <li>
            <strong>Physical Damage</strong>: Repairs or replacement for damage
            to your business vehicles.
          </li>
          <li>
            <strong>Uninsured/Underinsured Motorist</strong>: Protection if
            another driver lacks adequate insurance.
          </li>
          <li>
            <strong>Medical Payments</strong>: Covers medical expenses for
            injuries sustained in an accident.
          </li>
        </ul>
        <p>
          Optional coverages, such as cargo protection or towing, may be added
          based on your business needs.
        </p>
      </div>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Commercial Auto Insurance Today
        </a>
      </div>
    </div>
  );
}
