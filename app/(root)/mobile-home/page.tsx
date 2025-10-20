"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function MobileHomeInsurancePage() {
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
    const message = `Test \nMobile Home Insurance Inquiry:\nName: ${
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
              Mobile Home Insurance in Texas
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your mobile home in Texas!</strong> This guide
              explains what mobile home insurance is, why you need it, how to
              get it, and what it covers for Texas residents looking to
              safeguard their home and belongings.
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
              src="/mobilehomepic.jpg"
              alt="Mobile home in a scenic Texas landscape"
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
          Request a Mobile Home Insurance Quote
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
              placeholder="Tell us about your mobile home insurance needs"
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
        What Is Mobile Home Insurance in Texas?
      </h2>
      <p className="mb-4">
        Mobile home insurance in Texas is a specialized policy designed to
        protect manufactured or mobile homes, which differ from traditional
        site-built homes. It provides financial protection against damage to
        your home, personal belongings, and liability risks. In Texas, mobile
        home insurance is often required by lenders if you have a loan on your
        home or if you live in a mobile home park.
      </p>
      <p className="mb-4">
        This insurance ensures that your investment is safeguarded against
        common risks like storms, fire, or theft, giving you peace of mind as a
        mobile homeowner in Texas.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need Mobile Home Insurance in Texas?
      </h2>
      <p className="mb-4">
        Mobile homes face unique risks due to their construction and location,
        making insurance essential. Common reasons to get mobile home insurance
        in Texas include:
      </p>
      <ul className="mb-4 pl-5">
        <li className="mb-2">
          <strong>Lender Requirements</strong>: If you have a mortgage or loan
          on your mobile home, your lender will likely require insurance to
          protect their investment.
        </li>
        <li className="mb-2">
          <strong>Mobile Home Park Rules</strong>: Many Texas mobile home
          communities require residents to carry insurance as a condition of
          residency.
        </li>
        <li className="mb-2">
          <strong>Weather-Related Risks</strong>: Texas is prone to hurricanes,
          tornadoes, and hailstorms, which can cause significant damage to
          mobile homes.
        </li>
        <li className="mb-2">
          <strong>Theft or Vandalism</strong>: Mobile homes may be vulnerable to
          theft or vandalism, and insurance can cover losses to your property or
          belongings.
        </li>
        <li className="mb-2">
          <strong>Liability Protection</strong>: If someone is injured on your
          property, liability coverage can protect you from legal and medical
          expenses.
        </li>
        <li className="mb-2">
          <strong>Peace of Mind</strong>: Insurance ensures you’re financially
          protected against unexpected events, preserving your home and
          lifestyle.
        </li>
      </ul>
      <p className="mb-4">
        Even if not required, mobile home insurance is a smart investment to
        protect your home and belongings in Texas’s unpredictable environment.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does Mobile Home Insurance Work in Texas?
      </h2>
      <p className="mb-4">
        Mobile home insurance in Texas provides coverage tailored to the unique
        needs of manufactured homes. Here’s how the process works:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Determine the value of your mobile
          home, personal belongings, and any additional structures (like sheds
          or porches) to ensure adequate coverage.
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong>, and we’ll guide you
          through finding the right mobile home insurance policy.
          <br />- We’ll help you choose coverage for your{" "}
          <strong>home structure</strong>,<strong>personal property</strong>,{" "}
          <strong>liability</strong>, and optional add-ons like flood or
          windstorm coverage.
          <br />- If you <strong>rent your mobile home</strong>, we can provide
          a policy tailored for renters’ needs.
        </li>
        <li>
          <strong>Policy Issuance</strong>: Once you select a policy, we’ll work
          with top insurers to issue your coverage, ensuring all requirements
          (like lender or park rules) are met.
        </li>
        <li>
          <strong>Premium Payments</strong>: You’ll pay premiums (monthly or
          annually) to maintain coverage. We’ll help you find affordable options
          that fit your budget.
        </li>
        <li>
          <strong>Claims Process</strong>: If your home is damaged or you face a
          liability claim, contact us, and we’ll assist you in filing a claim
          with your insurer for prompt resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: We’ll monitor your policy to ensure
          it remains up-to-date and recommend adjustments as your needs change
          or if you relocate your mobile home.
        </li>
      </ol>
      <div className="mb-4">
        Standard mobile home insurance typically covers:
        <ul className="pl-5">
          <li>
            <strong>Dwelling</strong>: Repairs or replacement of your mobile
            home’s structure.
          </li>
          <li>
            <strong>Personal Property</strong>: Replacement of belongings like
            furniture or electronics.
          </li>
          <li>
            <strong>Liability</strong>: Protection against lawsuits or medical
            costs if someone is injured.
          </li>
          <li>
            <strong>Additional Living Expenses</strong>: Temporary housing costs
            if your home is uninhabitable.
          </li>
        </ul>
        Optional coverages, like flood or earthquake insurance, may be
        recommended based on your location in Texas.
      </div>
      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Mobile Home Insurance Today
        </a>
      </div>
    </div>
  );
}
