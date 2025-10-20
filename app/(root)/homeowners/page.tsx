"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function HomeownersInsurancePage() {
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
    const message = `Test \nHomeowners Insurance Inquiry:\nName: ${
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
              Homeowners Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your home in Texas!</strong> This guide explains
              what homeowners insurance is, why you need it, how to get it, and
              what it covers for Texas homeowners looking to safeguard their
              property and belongings.
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
              src="/housepic.jpg"
              alt="Modern Texas home exterior"
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
          Request a Homeowners Insurance Quote
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
              placeholder="Tell us about your homeowners insurance needs"
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
        What Is Homeowners Insurance in Texas?
      </h2>
      <p className="mb-4">
        Homeowners insurance in Texas is a policy that protects your home,
        personal belongings, and liability risks from events like fire, theft,
        storms, or injuries on your property. It provides financial coverage for
        repairs, replacements, and legal expenses, ensuring your investment and
        peace of mind are secure. In Texas, homeowners insurance is often
        required by mortgage lenders to protect their financial interest in your
        property.
      </p>
      <p className="mb-4">
        This insurance is essential for Texas homeowners due to the state’s
        unique risks, such as hurricanes, hailstorms, and flooding, which can
        cause significant property damage.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need Homeowners Insurance in Texas?
      </h2>
      <p className="mb-4">
        Homeowners insurance is critical for protecting your home and financial
        stability in Texas. Common reasons to get homeowners insurance include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>Mortgage Requirements</strong>: Most lenders require
          homeowners insurance as a condition of your mortgage to protect their
          investment in your property.
        </li>
        <li className="mb-2">
          <strong>Property Protection</strong>: Covers repairs or rebuilding
          costs if your home is damaged by covered events like fire, windstorms,
          or vandalism.
        </li>
        <li className="mb-2">
          <strong>Personal Belongings</strong>: Replaces personal items like
          furniture, electronics, or clothing damaged by covered events such as
          theft or natural disasters.
        </li>
        <li className="mb-2">
          <strong>Liability Coverage</strong>: Protects you from financial
          responsibility if someone is injured on your property or if you
          accidentally damage someone else’s property.
        </li>
        <li className="mb-2">
          <strong>Weather-Related Risks</strong>: Texas is prone to hurricanes,
          tornadoes, hailstorms, and flooding, which can cause extensive damage
          to your home and belongings.
        </li>
        <li className="mb-2">
          <strong>Peace of Mind</strong>: Ensures you’re financially protected
          against unexpected events, allowing you to focus on enjoying your
          home.
        </li>
      </ul>
      <p className="mb-4">
        Even if you own your home outright, homeowners insurance is a smart
        investment to safeguard your property and avoid costly repairs or legal
        expenses in Texas’s unpredictable environment.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does Homeowners Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        Homeowners insurance in Texas provides comprehensive coverage tailored
        to your home’s needs. Here’s how the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Evaluate the value of your home,
          personal belongings, and potential liability risks to determine the
          coverage amount you need.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll help you
          find the right homeowners insurance policy.
          <br />- We’ll customize coverage for <strong>dwelling</strong>,{" "}
          <strong>personal property</strong>,<strong>liability</strong>, and
          optional add-ons like flood or windstorm insurance.
          <br />- We’ll ensure the policy meets any lender requirements or your
          specific needs.
        </li>
        <li>
          <strong>Policy Issuance</strong>: We’ll work with top insurers to
          issue a policy that protects your home and meets Texas regulations.
        </li>
        <li>
          <strong>Premium Payments</strong>: You’ll pay premiums (monthly or
          annually) to maintain coverage. We’ll help you find budget-friendly
          options tailored to your needs.
        </li>
        <li>
          <strong>Claims Process</strong>: If your home or belongings are
          damaged, or you face a liability claim, contact us, and we’ll guide
          you through filing a claim with your insurer for prompt resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: We’ll monitor your policy to ensure
          it remains up-to-date and recommend adjustments as your needs change
          or if you renovate or move.
        </li>
      </ol>
      <div className="mb-4">
        <p>Standard homeowners insurance typically covers:</p>
        <ul className="pl-5">
          <li>
            <strong>Dwelling</strong>: Repairs or rebuilding costs for your
            home’s structure.
          </li>
          <li>
            <strong>Personal Property</strong>: Replacement of belongings like
            furniture, electronics, or clothing.
          </li>
          <li>
            <strong>Liability</strong>: Protection against lawsuits or medical
            costs if someone is injured on your property.
          </li>
          <li>
            <strong>Additional Living Expenses</strong>: Temporary housing costs
            if your home is uninhabitable due to a covered event.
          </li>
        </ul>
        <p>
          Optional coverages, such as flood insurance or coverage for high-value
          items, may be added based on your needs and location in Texas.
        </p>
      </div>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Homeowners Insurance Today
        </a>
      </div>
    </div>
  );
}
