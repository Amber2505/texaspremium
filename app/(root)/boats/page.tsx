"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function BoatsAndWatercraftInsurancePage() {
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
    const message = `Test \nBoats and Watercraft Insurance Inquiry:\nName: ${
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
              Boats and Watercraft Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your boating adventures in Texas!</strong> This
              guide explains what boats and watercraft insurance is, why you
              need it, how to get it, and what it covers for Texas boat owners
              looking to safeguard their vessels and water activities.
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
              src="/boatspic.jpg"
              alt="Boat on a Texas lake"
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
          Request a Boats and Watercraft Insurance Quote
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
              placeholder="Tell us about your boats and watercraft insurance needs"
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
        What Is Boats and Watercraft Insurance in Texas?
      </h2>
      <p className="mb-4">
        Boats and watercraft insurance in Texas is a specialized policy that
        protects boats, jet skis, yachts, and other watercraft used for
        recreation or personal use. It covers damage to your vessel, personal
        belongings, and liability risks, ensuring financial protection during
        your time on the water. In Texas, while boat insurance isn’t always
        legally required, it’s often mandated by lenders or marinas for financed
        or docked vessels.
      </p>
      <p className="mb-4">
        This insurance safeguards your watercraft and ensures worry-free boating
        on Texas lakes, rivers, and coastal waters.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need Boats and Watercraft Insurance in Texas?
      </h2>
      <p className="mb-4">
        Boats and watercraft insurance is essential for protecting your vessel
        and covering liability risks while boating in Texas. Common reasons to
        get this insurance include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>Lender Requirements</strong>: If your boat or watercraft is
          financed, lenders typically require insurance to protect their
          investment.
        </li>
        <li className="mb-2">
          <strong>Marina or Storage Requirements</strong>: Many Texas marinas or
          storage facilities require proof of insurance for docking or storing
          your vessel.
        </li>
        <li className="mb-2">
          <strong>Vessel Protection</strong>: Covers repairs or replacement for
          damage to your boat or watercraft from accidents, theft, vandalism, or
          natural disasters like storms.
        </li>
        <li className="mb-2">
          <strong>Liability Coverage</strong>: Protects you from financial
          responsibility if your vessel causes injury or property damage to
          others while on the water.
        </li>
        <li className="mb-2">
          <strong>Personal Belongings</strong>: Replaces personal items on your
          boat, such as fishing gear or electronics, damaged by covered events.
        </li>
        <li className="mb-2">
          <strong>Weather-Related Risks</strong>: Texas’s coastal areas and
          lakes are prone to hurricanes, storms, and flooding, which can damage
          your vessel.
        </li>
      </ul>
      <p className="mb-4">
        Whether you use your boat for fishing, watersports, or leisure, boats
        and watercraft insurance is a smart investment to protect your vessel
        and avoid costly repairs or legal expenses in Texas.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does Boats and Watercraft Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        Boats and watercraft insurance in Texas provides tailored coverage for
        vessels of all types, from small jet skis to large yachts. Here’s how
        the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Evaluate the type, value, and
          usage of your boat or watercraft (e.g., fishing boat, jet ski, or
          yacht) to determine the coverage amount you need.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll help you
          find the right boats and watercraft insurance policy.
          <br />- We’ll customize coverage for <strong>liability</strong>,{" "}
          <strong>physical damage</strong>,<strong>personal belongings</strong>,
          and optional add-ons like salvage coverage or towing.
          <br />- We’ll ensure the policy meets any lender, marina, or state
          requirements.
        </li>
        <li>
          <strong>Policy Issuance</strong>: We’ll work with top insurers to
          issue a policy that protects your vessel and complies with Texas
          regulations.
        </li>
        <li>
          <strong>Premium Payments</strong>: You’ll pay premiums (monthly or
          annually) to maintain coverage. We’ll help you find affordable options
          tailored to your budget.
        </li>
        <li>
          <strong>Claims Process</strong>: If your boat is damaged or you face a
          liability claim, contact us, and we’ll guide you through filing a
          claim with your insurer for prompt resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: We’ll monitor your policy to ensure
          it remains up-to-date and recommend adjustments as your boating needs
          or vessel usage change.
        </li>
      </ol>
      <div className="mb-4">
        <p>Standard boats and watercraft insurance typically covers:</p>
        <ul className="pl-5">
          <li>
            <strong>Liability</strong>: Covers bodily injury and property damage
            caused by your vessel.
          </li>
          <li>
            <strong>Physical Damage</strong>: Repairs or replacement for damage
            to your boat or watercraft from accidents or other covered events.
          </li>
          <li>
            <strong>Personal Belongings</strong>: Replacement of items on your
            vessel, like fishing gear or electronics.
          </li>
          <li>
            <strong>Emergency Assistance</strong>: Covers towing, fuel delivery,
            or other on-water assistance if your vessel breaks down.
          </li>
        </ul>
        <p>
          Optional coverages, such as hurricane haul-out, wreck removal, or
          uninsured boater coverage, may be added based on your boating needs
          and location in Texas.
        </p>
      </div>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Boats and Watercraft Insurance Today
        </a>
      </div>
    </div>
  );
}
