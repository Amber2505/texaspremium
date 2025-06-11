"use client";

import React, { useState } from "react";
import Image from "next/image";

export default function CommercialGeneralLiabilityPage() {
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
    alert("Thank you for your inquiry! We'll contact you soon.");
    setFormData({ name: "", email: "", phone: "", message: "" });
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
              Commercial General Liability Insurance
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Protect your Texas business?</strong> This guide explains
              what Commercial General Liability (CGL) insurance is, why you need
              it, how to get it, and how Texas Premium Insurance Services keeps
              your business safe.
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
              src="/building-construction-workers-site.jpg"
              alt="Business professional in a modern office"
              width={400}
              height={300}
              className="rounded-lg shadow-xl transform -rotate-3 hover:rotate-0 transition duration-300 ease-in-out"
            />
          </div>
        </div>
      </header>

      {/* Contact Form */}
      <section className="bg-gray-50 p-6 rounded-xl mb-8 border-l-4 border-blue-500">
        <h2 className="text-gray-700 text-3xl mb-4">
          Request a CGL Insurance Quote
        </h2>
        <div className="grid gap-4">
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
              placeholder="Tell us about your business or coverage needs"
              rows={4}
            />
          </div>
          <button
            onClick={handleSubmit}
            className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl w-full md:w-auto transition duration-300 ease-in-out transform hover:scale-105"
          >
            Submit Inquiry
          </button>
        </div>
      </section>

      <h2 className="text-gray-700 text-3xl mt-8">
        What is Commercial General Liability Insurance?
      </h2>
      <p className="mb-4">
        <strong>Commercial General Liability (CGL) Insurance</strong> is a
        critical policy for Texas businesses, protecting against common risks
        like bodily injury, property damage, and advertising injuries caused by
        your operations, products, or premises. It covers legal fees,
        settlements, and medical costs if a third party (e.g., a customer or
        vendor) sues your business.
      </p>
      <p className="mb-4">
        CGL is essential for businesses like contractors, retailers,
        restaurants, and offices. At{" "}
        <strong>Texas Premium Insurance Services</strong>, we offer tailored CGL
        policies to safeguard your Texas business from unexpected liabilities.
        Call us at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        to learn more.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need CGL Insurance?
      </h2>
      <p className="mb-4">
        CGL insurance is vital for Texas businesses to avoid financial ruin from
        lawsuits or claims. Reasons you need it include:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Legal Protection</strong>: Covers legal costs if a customer
          slips and falls at your store or a product causes harm.
        </li>
        <li>
          <strong>Contract Requirements</strong>: Many clients, landlords, or
          vendors require CGL coverage before signing contracts.
        </li>
        <li>
          <strong>Financial Security</strong>: Pays for damages or medical
          bills, preventing out-of-pocket expenses that could bankrupt your
          business.
        </li>
        <li>
          <strong>Reputation</strong>: Demonstrates professionalism and
          responsibility to clients and partners.
        </li>
        <li>
          <strong>Regulatory Compliance</strong>: Some Texas industries require
          CGL to meet licensing or regulatory standards (check with{" "}
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
        Protect your business today. Call{" "}
        <strong>Texas Premium Insurance Services</strong> at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does CGL Insurance Work?
      </h2>
      <p className="mb-4">
        Getting CGL insurance for your Texas business is straightforward with{" "}
        <strong>Texas Premium Insurance Services</strong>. Here’s the process:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Assess Your Needs</strong>: Identify your business type, size,
          and risks (e.g., construction, retail, or professional services).
          Review industry regulations at{" "}
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
          <strong>Contact Us</strong>: Call{" "}
          <a
            href="tel:+1-469-729-5185"
            className="text-blue-600 hover:underline"
          >
            (469) 729-5185
          </a>{" "}
          to speak with our team. We’ll gather details about your business,
          including:
          <ul className="list-disc pl-6 mt-1">
            <li>Business type and size</li>
            <li>Annual revenue and payroll</li>
            <li>Location and operations</li>
            <li>Claims history</li>
          </ul>
        </li>
        <li>
          <strong>Choose Your Coverage</strong>: We offer customizable CGL
          policies:
          <ul className="list-disc pl-6 mt-1">
            <li>
              <strong>Bodily Injury</strong>: Covers injuries to third parties
              (e.g., a customer tripping at your store).
            </li>
            <li>
              <strong>Property Damage</strong>: Covers damage to others’
              property caused by your business.
            </li>
            <li>
              <strong>Personal and Advertising Injury</strong>: Covers claims
              like slander or copyright infringement.
            </li>
            <li>
              <strong>Products-Completed Operations</strong>: Covers damages
              from products or services after completion.
            </li>
          </ul>
        </li>
        <li>
          <strong>Purchase Your Policy</strong>: We’ll provide a quote starting
          from a low cost, plus applicable fees. Pay securely online or over the
          phone, and receive your policy documents instantly.
        </li>
        <li>
          <strong>Certificate of Insurance</strong>: We’ll issue a Certificate
          of Insurance (COI) to share with clients or landlords as proof of
          coverage.
        </li>
        <li>
          <strong>File Claims Easily</strong>: If a claim arises, contact us for
          guidance. We’ll help you file with the insurer for quick resolution.
        </li>
        <li>
          <strong>Ongoing Support</strong>: Our team is here to adjust coverage,
          renew policies, or answer questions. Call{" "}
          <a
            href="tel:+1-469-729-5185"
            className="text-blue-600 hover:underline"
          >
            (469) 729-5185
          </a>
          .
        </li>
      </ol>

      <h2 className="text-gray-700 text-3xl mt-8">Coverage Options</h2>
      <p className="mb-4">
        CGL insurance policies are tailored to your Texas business needs. Common
        coverages include:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Bodily Injury</strong>: Medical costs for third-party injuries
          caused by your business operations.
        </li>
        <li>
          <strong>Property Damage</strong>: Repairs for damage to others’
          property (e.g., a contractor damaging a client’s floor).
        </li>
        <li>
          <strong>Personal and Advertising Injury</strong>: Legal fees for
          claims like defamation or false advertising.
        </li>
        <li>
          <strong>Products-Completed Operations</strong>: Liability for damages
          from products or services after delivery.
        </li>
        <li>
          <strong>Medical Payments</strong>: Covers minor medical expenses for
          third parties, regardless of fault.
        </li>
        <li>
          <strong>Add-Ons</strong>: Umbrella coverage, cyber liability, or
          professional liability for enhanced protection.
        </li>
      </ul>
      <p className="mb-4">
        Need help choosing? Call us at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">Costs of CGL Insurance</h2>
      <p className="mb-4">
        The cost of CGL insurance varies based on your business type, size, and
        risks. With <strong>Texas Premium Insurance Services</strong>, you get
        competitive rates:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Starting Point</strong>: Coverage starts from a low cost, plus
          applicable fees, depending on your policy.
        </li>
        <li>
          <strong>Factors Affecting Cost</strong>: Business type (e.g.,
          construction vs. retail), annual revenue, number of employees,
          location, and claims history.
        </li>
        <li>
          <strong>Affordable Options</strong>: Small businesses may qualify for
          low-premium policies, while high-risk industries may need higher
          limits.
        </li>
        <li>
          <strong>No Hidden Fees</strong>: Transparent quotes with all fees
          included upfront.
        </li>
      </ul>
      <p className="mb-4">
        Example: A small retail store may start at a low cost, while a
        construction firm may pay more due to higher risks. Get a personalized
        quote by calling{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Risks of Operating Without CGL Insurance
      </h2>
      <p className="mb-4">
        Operating a Texas business without CGL insurance exposes you to
        significant risks:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Lawsuits</strong>: Pay legal fees and settlements
          out-of-pocket for claims like customer injuries or property damage.
        </li>
        <li>
          <strong>Financial Loss</strong>: A single claim could cost $100,000+
          in damages, threatening your business’s survival.
        </li>
        <li>
          <strong>Contract Violations</strong>: Lose contracts if clients
          require CGL coverage you can’t provide.
        </li>
        <li>
          <strong>Reputational Damage</strong>: Lack of insurance may signal
          unprofessionalism to clients or partners.
        </li>
      </ul>
      <p className="mb-4">
        Avoid these risks with Texas Premium Insurance Services. Call{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4 mb-8">
        <div>
          <h3 className="text-lg font-medium">
            Is CGL insurance required in Texas?
          </h3>
          <p className="text-gray-700">
            It’s not state-mandated for most businesses, but many clients,
            landlords, or industries require it. Check with{" "}
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
            What businesses need CGL insurance?
          </h3>
          <p className="text-gray-700">
            Any business with public interactions, like contractors, retailers,
            or restaurants, benefits from CGL. We can assess your needs—call us.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Does CGL cover employee injuries?
          </h3>
          <p className="text-gray-700">
            No, employee injuries are covered by workers’ compensation
            insurance. We offer both—contact us for a bundle.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">How do I file a CGL claim?</h3>
          <p className="text-gray-700">
            Contact us at (469) 729-5185, and we’ll guide you through filing a
            claim with your insurer for fast resolution.
          </p>
        </div>
      </div>

      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your CGL Insurance Today
        </a>
      </div>
    </div>
  );
}
