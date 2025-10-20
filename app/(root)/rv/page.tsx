"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function RVInsurancePage() {
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
    const message = `Test \nRV Insurance Inquiry:\nName: ${
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
              RV Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your RV adventures in Texas!</strong> This guide
              explains what RV insurance is, why you need it, how to get it, and
              what it covers for Texas RV owners looking to safeguard their
              recreational vehicles and travel experiences.
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
              src="/rvpic.jpg"
              alt="RV parked in a scenic Texas landscape"
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
          Request an RV Insurance Quote
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
              placeholder="Tell us about your RV insurance needs"
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
        What Is RV Insurance in Texas?
      </h2>
      <p className="mb-4">
        RV insurance in Texas is a specialized policy that protects recreational
        vehicles, such as motorhomes, travel trailers, and campers, used for
        travel, camping, or full-time living. It covers damage to your RV,
        personal belongings, and liability risks, ensuring financial protection
        during your adventures. In Texas, RV insurance is often required if your
        RV is motorized or financed, or if you use it as a primary residence.
      </p>
      <p className="mb-4">
        This insurance safeguards your RV and ensures compliance with Texas
        regulations, allowing you to enjoy your travels with peace of mind.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need RV Insurance in Texas?
      </h2>
      <p className="mb-4">
        RV insurance is essential for protecting your recreational vehicle and
        covering liability risks while traveling or camping in Texas. Common
        reasons to get RV insurance include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>Legal Requirements</strong>: Motorized RVs in Texas must carry
          minimum liability coverage (30/60/25) to cover bodily injury and
          property damage, similar to auto insurance.
        </li>
        <li className="mb-2">
          <strong>Lender Requirements</strong>: If your RV is financed, lenders
          typically require insurance to protect their investment.
        </li>
        <li className="mb-2">
          <strong>Property Protection</strong>: Covers repairs or replacement
          for damage to your RV from accidents, theft, vandalism, or natural
          disasters like storms.
        </li>
        <li className="mb-2">
          <strong>Liability Coverage</strong>: Protects you from financial
          responsibility if your RV causes injury or property damage to others
          while on the road or at a campsite.
        </li>
        <li className="mb-2">
          <strong>Personal Belongings</strong>: Replaces personal items inside
          your RV, such as electronics or camping gear, damaged by covered
          events.
        </li>
        <li className="mb-2">
          <strong>Full-Time RV Living</strong>: If you live in your RV
          full-time, specialized coverage can protect it as your primary
          residence, similar to homeowners insurance.
        </li>
      </ul>
      <p className="mb-4">
        Whether you use your RV for weekend getaways or full-time living, RV
        insurance is a smart investment to protect your vehicle and avoid costly
        repairs or legal expenses in Texas.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does RV Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        RV insurance in Texas provides tailored coverage for recreational
        vehicles, whether motorized or towable. Here’s how the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Evaluate the type, value, and
          usage of your RV (e.g., motorhome, travel trailer, or camper) to
          determine the coverage amount you need.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll help you
          find the right RV insurance policy.
          <br />- We’ll customize coverage for <strong>liability</strong>,{" "}
          <strong>physical damage</strong>,<strong>personal belongings</strong>,
          and optional add-ons like roadside assistance or full-timer coverage.
          <br />- We’ll ensure the policy meets any lender or state
          requirements.
        </li>
        <li>
          <strong>Policy Issuance</strong>: We’ll work with top insurers to
          issue a policy that protects your RV and complies with Texas
          regulations.
        </li>
        <li>
          <strong>Premium Payments</strong>: You’ll pay premiums (monthly or
          annually) to maintain coverage. We’ll help you find affordable options
          tailored to your budget.
        </li>
        <li>
          <strong>Claims Process</strong>: If your RV is damaged or you face a
          liability claim, contact us, and we’ll guide you through filing a
          claim with your insurer for prompt resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: We’ll monitor your policy to ensure
          it remains up-to-date and recommend adjustments as your RV usage or
          needs change.
        </li>
      </ol>
      <div className="mb-4">
        <p>Standard RV insurance typically covers:</p>
        <ul className="pl-5">
          <li>
            <strong>Liability</strong>: Covers bodily injury and property damage
            caused by your RV.
          </li>
          <li>
            <strong>Physical Damage</strong>: Repairs or replacement for damage
            to your RV from accidents or other covered events.
          </li>
          <li>
            <strong>Personal Belongings</strong>: Replacement of items inside
            your RV, like camping gear or electronics.
          </li>
          <li>
            <strong>Emergency Expenses</strong>: Covers temporary lodging or
            travel costs if your RV is uninhabitable due to a covered event.
          </li>
        </ul>
        <p>
          Optional coverages, such as roadside assistance, full-timer liability,
          or vacation liability, may be added based on your RV usage and
          location in Texas.
        </p>
      </div>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your RV Insurance Today
        </a>
      </div>
    </div>
  );
}
