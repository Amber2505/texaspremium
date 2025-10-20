"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function BondedTitlePage() {
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
    const message = `Test \nSurety Bond Inquiry:\nName: ${
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
              Texas Certificate of Title Surety Bond
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Need a bonded title in Texas?</strong> This guide explains
              what a Certificate of Title Surety Bond is, why you might need it,
              how to get it, and what it means for Texas vehicle owners looking
              to register their vehicle without a title.
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
              src="/suretybondpic.jpg"
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
          Request a Surety Bond Quote
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
              placeholder="Tell us about your bonded title needs or vehicle situation"
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
        What is a Texas Bonded Title?
      </h2>
      <p className="mb-4">
        A <strong>Texas Certificate of Title Surety Bond</strong>, also known as
        a bonded title or lost title bond, is a document issued by the Texas
        Department of Motor Vehicles (TxDMV) to establish vehicle ownership when
        the original title is lost, damaged, incorrectly assigned, or
        unavailable. Required under Texas Transportation Code §501.053, the bond
        serves as a financial guarantee to protect previous owners, lienholders,
        and future owners against fraudulent ownership claims. It remains active
        for three years, after which a standard title is issued if no claims are
        filed.
      </p>
      <p className="mb-4">
        A bonded title allows you to legally register, insure, sell, or transfer
        ownership of a vehicle in Texas. It’s often needed in situations like
        purchasing a vehicle without a title, recovering a stolen vehicle, or
        resolving incomplete transactions. At{" "}
        <strong>Texas Premium Insurance Services</strong>, we make obtaining
        your surety bond fast and hassle-free.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need a Bonded Title?
      </h2>
      <p className="mb-4">
        The TxDMV requires a bonded title when you cannot provide sufficient
        proof of ownership. Common scenarios include:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>Lost or stolen original title.</li>
        <li>Title never received from the seller.</li>
        <li>Damaged or illegible title.</li>
        <li>Improperly assigned title (e.g., missing signatures).</li>
        <li>Vehicle purchased without a title in a private sale.</li>
        <li>Vehicle gifted without a title transfer.</li>
      </ul>
      <p className="mb-4">
        The surety bond ensures compensation if someone else proves rightful
        ownership during the bond’s three-year term. Let us help you navigate
        this process with ease.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does a Bonded Title Work in Texas?
      </h2>
      <p className="mb-4">
        A Texas Certificate of Title Surety Bond is a straightforward way to
        register your vehicle when a title is missing. Here’s how the process
        works with <strong>Texas Premium Insurance Services</strong>:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Determine Need</strong>: Confirm with the TxDMV that a bonded
          title is required for your vehicle. You can check requirements or
          download forms at{" "}
          <a
            href="https://www.txdmv.gov"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.txdmv.gov
          </a>
          .
        </li>
        <li>
          <strong>Contact Us</strong>: Reach out to{" "}
          <strong>Texas Premium Insurance Services</strong> by calling{" "}
          <a
            href="tel:+1-469-729-5185"
            className="text-blue-600 hover:underline"
          >
            (469) 729-5185
          </a>
          . We’ll guide you through the bonded title process, making it simple
          and stress-free.
          <ul className="list-disc pl-6 mt-1">
            <li>
              Provide vehicle details (year, make, model, VIN) and proof of
              ownership (e.g., bill of sale).
            </li>
            <li>
              We’ll help you gather necessary TxDMV forms, such as Form VTR-275
              (Request for Motor Vehicle Information) and Form VTR-130-SOF
              (Statement of Fact for Bonded Title).
            </li>
          </ul>
        </li>
        <li>
          <strong>Submit Initial Application</strong>: Submit your documents and
          a $15 application fee to your nearest TxDMV Regional Service Center.
          The TxDMV will issue a Notice of Determination for Bonded Title (Form
          VTR-130-ND), specifying the bond amount (typically 1.5 times the
          vehicle’s value).
        </li>
        <li>
          <strong>Purchase Your Surety Bond</strong>: We’ll provide you with a
          surety bond tailored to the TxDMV’s requirements. Bonds up to $25,000
          usually require no credit check, and we offer competitive rates
          starting at $100. Simply sign the bond certificate we provide.
        </li>
        <li>
          <strong>Submit Final Documents</strong>: Within 30 days of receiving
          the bond, submit the following to your county tax office:
          <ul className="list-disc pl-6 mt-1">
            <li>Notice of Determination (Form VTR-130-ND)</li>
            <li>
              Signed surety bond certificate from Texas Premium Insurance
              Services
            </li>
            <li>
              Application for Texas Title and/or Registration (Form 130-U)
            </li>
            <li>Proof of liability insurance</li>
            <li>
              VIN inspection report (if required for out-of-state vehicles)
            </li>
            <li>
              Weight certificate (for commercial vehicles) or customs
              declaration (for imported vehicles)
            </li>
          </ul>
        </li>
        <li>
          <strong>Receive Your Bonded Title</strong>: Upon approval, the TxDMV
          issues your bonded title, valid for three years. If no claims are
          filed, a standard title is issued thereafter. We’ll follow up to
          ensure everything goes smoothly.
        </li>
        <li>
          <strong>Ongoing Support</strong>: Our team is here to answer any
          questions during the three-year bond period. If a claim arises, we’ll
          assist you in navigating the process with the surety company.
        </li>
      </ol>

      <h2 className="text-gray-700 text-3xl mt-8">Eligibility Requirements</h2>
      <p className="mb-4">
        To qualify for a Texas bonded title, you must meet the following
        criteria:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>Be a Texas resident or military personnel stationed in Texas.</li>
        <li>
          Legally possess the vehicle (not abandoned, stolen, junked, or
          involved in pending litigation).
        </li>
        <li>
          Provide evidence of ownership (e.g., bill of sale, invoice, canceled
          check).
        </li>
        <li>
          Ensure the vehicle is complete (frame, motor, and body; or frame and
          motor for motorcycles).
        </li>
        <li>
          For out-of-state vehicles, obtain a VIN inspection from a
          Texas-certified Safety Inspection Station or an auto theft
          investigator if never titled in Texas.
        </li>
      </ul>
      <p className="mb-4">
        Note: Salvage or non-repairable vehicles are ineligible for bonded
        titles under Texas Transportation Code §501.091. Call us at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        to confirm your eligibility.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Costs of a Texas Bonded Title
      </h2>
      <p className="mb-4">
        The cost of obtaining a bonded title includes several fees, but we
        strive to keep your bond premium affordable:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Surety Bond Premium</strong>: Starting from $100, plus
          applicable fees, depending on the bond amount and vehicle value.
        </li>
        <li>
          <strong>Application Fee</strong>: $15, paid to the TxDMV.
        </li>
        <li>
          <strong>Vehicle Appraisal Fee</strong>: $50–$100, if required for
          vehicles not listed in the TxDMV’s Standard Presumptive Value (SPV)
          calculator.
        </li>
        <li>
          <strong>VIN Inspection Fee</strong>: $20–$40, for out-of-state or
          untitled vehicles.
        </li>
        <li>
          <strong>Additional Fees</strong>: Vary by county (e.g., registration,
          sales tax).
        </li>
      </ul>
      <p className="mb-4">
        Example: For a vehicle valued at $10,000, the bond amount is $15,000
        (1.5x value), with a premium of about $225. Total costs, including fees,
        may range from $300–$500. Contact us for a personalized quote at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">Risks and Limitations</h2>
      <p className="mb-4">
        While a bonded title enables legal vehicle use, there are risks to
        understand:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Potential Claims</strong>: If another party proves ownership
          within three years, they can file a claim against the bond. The surety
          pays the claimant, but you must reimburse the surety, plus legal fees.
        </li>
        <li>
          <strong>No Clear Title History</strong>: A bonded title may not
          guarantee a clean title, potentially affecting resale value.
        </li>
        <li>
          <strong>Lien Restrictions</strong>: If a lien less than 10 years old
          exists, we’ll verify it’s released before issuing your bond.
        </li>
        <li>
          <strong>Non-Eligible Vehicles</strong>: Junked, salvage, or
          non-repairable vehicles cannot receive bonded titles.
        </li>
      </ul>
      <p className="mb-4">
        Our team at Texas Premium Insurance Services will help you assess these
        risks. Call us at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        for expert guidance.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4 mb-8">
        <div>
          <h3 className="text-lg font-medium">
            How long is a Texas bonded title valid?
          </h3>
          <p className="text-gray-700">
            The bonded title is valid for three years. If no claims are filed,
            the TxDMV issues a standard title afterward.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Can I get a bonded title with bad credit?
          </h3>
          <p className="text-gray-700">
            Yes, bonds up to $25,000 typically require no credit check. For
            larger bonds, we offer solutions for applicants with credit
            challenges. Call us to discuss your options.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            What if my bond application is rejected by the TxDMV?
          </h3>
          <p className="text-gray-700">
            We’ll ensure your information matches the Notice of Determination
            exactly. If amendments are needed, we’ll assist with corrections at
            minimal or no additional cost.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Can I transfer a bonded title to another state?
          </h3>
          <p className="text-gray-700">
            Transferability depends on the other state’s DMV policies. We can
            help you understand the requirements for your situation.
          </p>
        </div>
      </div>

      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Bonded Title Today
        </a>
      </div>
    </div>
  );
}
