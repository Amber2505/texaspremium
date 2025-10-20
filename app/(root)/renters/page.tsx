"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function RentersInsurancePage() {
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
    const message = `Test \nRenters Insurance Inquiry:\nName: ${
      formData.name
    }\nEmail: ${formData.email}\nPhone: ${formData.phone}\nMessage: ${
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
              Renters Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your belongings as a renter in Texas!</strong>{" "}
              This guide explains what renters insurance is, why you need it,
              how to get it, and what it covers for Texas renters looking to
              safeguard their personal property and liability.
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
              src="/renterspic.jpg"
              alt="Cozy apartment interior in Texas"
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
          Request a Renters Insurance Quote
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
              placeholder="Tell us about your renters insurance needs"
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
        What Is Renters Insurance in Texas?
      </h2>
      <p className="mb-4">
        Renters insurance in Texas is a policy designed to protect tenants by
        covering personal belongings, liability, and additional living expenses
        in case of unexpected events like theft, fire, or natural disasters.
        Unlike homeowners insurance, it focuses on the renter’s possessions and
        liability, not the building itself, which is typically covered by the
        landlord’s insurance.
      </p>
      <p className="mb-4">
        This insurance provides peace of mind for Texas renters, ensuring
        financial protection for their belongings and liability risks in
        apartments, condos, or rented houses.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need Renters Insurance in Texas?
      </h2>
      <p className="mb-4">
        Renters insurance is essential for protecting your personal property and
        covering liability risks while renting in Texas. Common reasons to get
        renters insurance include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>Landlord Requirements</strong>: Many Texas landlords or
          property management companies require renters insurance as a condition
          of the lease.
        </li>
        <li className="mb-2">
          <strong>Personal Property Protection</strong>: Covers the cost of
          replacing personal items like electronics, furniture, or clothing
          damaged by covered events like fire or theft.
        </li>
        <li className="mb-2">
          <strong>Liability Coverage</strong>: Protects you from financial
          responsibility if someone is injured in your rental or if you
          accidentally damage someone else’s property.
        </li>
        <li className="mb-2">
          <strong>Weather-Related Risks</strong>: Texas is prone to hurricanes,
          tornadoes, and flooding, which can damage your belongings; renters
          insurance helps cover these losses.
        </li>
        <li className="mb-2">
          <strong>Additional Living Expenses</strong>: Pays for temporary
          housing or other expenses if your rental becomes uninhabitable due to
          a covered event.
        </li>
        <li className="mb-2">
          <strong>Affordable Protection</strong>: Renters insurance is
          cost-effective, often costing less than $20/month, making it a smart
          investment for financial security.
        </li>
      </ul>
      <p className="mb-4">
        Even if not required by your landlord, renters insurance is a wise
        choice to protect your belongings and avoid unexpected costs in Texas’s
        unpredictable environment.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does Renters Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        Renters insurance in Texas provides tailored coverage for tenants’
        needs. Here’s how the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Evaluate the value of your
          personal belongings and potential liability risks to determine the
          coverage amount you need.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll help you
          find the right renters insurance policy.
          <br />- We’ll customize coverage for{" "}
          <strong>personal property</strong>, <strong>liability</strong>,{" "}
          <strong>additional living expenses</strong>, and optional add-ons like
          flood or jewelry coverage.
          <br />- We’ll ensure the policy meets any landlord or lease
          requirements.
        </li>
        <li>
          <strong>Policy Issuance</strong>: We’ll work with top insurers to
          issue a policy that protects your belongings and meets Texas
          regulations.
        </li>
        <li>
          <strong>Premium Payments</strong>: You’ll pay affordable premiums
          (monthly or annually) to maintain coverage. We’ll help you find
          budget-friendly options.
        </li>
        <li>
          <strong>Claims Process</strong>: If your belongings are damaged or you
          face a liability claim, contact us, and we’ll guide you through filing
          a claim with your insurer for prompt resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: We’ll monitor your policy to ensure
          it remains up-to-date and recommend adjustments as your needs change
          or if you move to a new rental.
        </li>
      </ol>
      <div className="mb-4">
        <p>Standard renters insurance typically covers:</p>
        <ul className="pl-5">
          <li>
            <strong>Personal Property</strong>: Replacement or repair of
            belongings like furniture, electronics, or clothing.
          </li>
          <li>
            <strong>Liability</strong>: Protection against lawsuits or medical
            costs if someone is injured in your rental.
          </li>
          <li>
            <strong>Additional Living Expenses</strong>: Temporary housing costs
            if your rental is uninhabitable.
          </li>
          <li>
            <strong>Guest Medical Protection</strong>: Covers medical expenses
            for guests injured in your rental.
          </li>
        </ul>
        <p>
          Optional coverages, such as flood insurance or high-value item
          protection, may be added based on your needs and location in Texas.
        </p>
      </div>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Renters Insurance Today
        </a>
      </div>
    </div>
  );
}
