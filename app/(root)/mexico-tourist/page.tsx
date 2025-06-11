"use client";
import React, { useState } from "react";
import Image from "next/image";

export default function MexicoTouristCoveragePage() {
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
    const message = `Test \nMexico Tourist Covearge:\nName: ${
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
              Mexico Tourist Auto Insurance
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              <strong>Driving to Mexico from Texas?</strong> This guide explains
              why you need Mexico tourist auto insurance, what it covers, how to
              get it, and how Texas Premium Insurance Services makes it easy for
              Texas drivers.
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
              src="/mexicopic.jpg"
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
          Request a Mexico Tourist Auto Insurance Quote
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
              placeholder="Tell us about your trip to Mexico or insurance needs"
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
        What is Mexico Tourist Auto Insurance?
      </h2>
      <p className="mb-4">
        <strong>Mexico Tourist Auto Insurance</strong> is a mandatory policy
        required for Texas drivers traveling in Mexico. Your U.S. auto insurance
        is not valid in Mexico, so this coverage ensures you meet Mexican legal
        requirements for liability insurance. It protects you, your passengers,
        and others in case of an accident, providing compliance and peace of
        mind while driving south of the border.
      </p>
      <p className="mb-4">
        Issued by licensed Mexican insurers, these policies offer short-term
        options tailored for Texas tourists, covering vehicles with U.S. plates,
        including cars, RVs, motorcycles, and towed units. At{" "}
        <strong>Texas Premium Insurance Services</strong>, we partner with
        top-rated Mexican insurers to provide affordable, reliable coverage for
        your trip.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Why Do You Need Mexico Tourist Auto Insurance?
      </h2>
      <p className="mb-4">
        Mexican law requires all drivers on federal roads to carry liability
        insurance from a Mexican-licensed insurer. Driving without it is illegal
        and risky. Here’s why Texas drivers need this coverage:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Legal Compliance</strong>: Without valid Mexican insurance,
          you face fines, vehicle impoundment, or jail time if involved in an
          accident.
        </li>
        <li>
          <strong>Financial Protection</strong>: You’re personally liable for
          damages or injuries caused in an at-fault accident, which can cost
          hundreds of thousands of dollars.
        </li>
        <li>
          <strong>U.S. Policies Don’t Apply</strong>: Your Texas auto insurance
          is not recognized in Mexico, leaving you unprotected.
        </li>
        <li>
          <strong>Finance Requirements</strong>: If your vehicle is financed,
          your lender may require a Mexico-specific policy to issue a letter of
          permission for cross-border travel.
        </li>
        <li>
          <strong>Peace of Mind</strong>: Coverage ensures you’re protected
          against accidents, theft, or roadside emergencies while exploring
          Mexico.
        </li>
      </ul>
      <p className="mb-4">
        Drive confidently in Mexico. Call{" "}
        <strong>Texas Premium Insurance Services</strong> at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        to get started.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        How Does Mexico Tourist Auto Insurance Work?
      </h2>
      <p className="mb-4">
        Obtaining Mexico tourist auto insurance is quick and simple with{" "}
        <strong>Texas Premium Insurance Services</strong>. Here’s the process
        for Texas drivers to get covered before your trip:
      </p>
      <ol className="mb-4 pl-5">
        <li>
          <strong>Plan Your Trip</strong>: Determine your travel dates, vehicle
          type (car, RV, motorcycle, etc.), and destinations in Mexico. Check
          travel advisories at{" "}
          <a
            href="https://www.gob.mx"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.gob.mx
          </a>{" "}
          to stay informed.
        </li>
        <li>
          <strong>Contact Us</strong>: Call{" "}
          <a
            href="tel:+1-469-729-5185"
            className="text-blue-600 hover:underline"
          >
            (469) 729-5185
          </a>{" "}
          to speak with our team. We’ll collect details about your trip and
          vehicle, including:
          <ul className="list-disc pl-6 mt-1">
            <li>U.S. or Mexican driver’s license</li>
            <li>Vehicle registration</li>
            <li>Texas insurance details</li>
            <li>
              Travel dates and coverage needs (liability-only or full coverage)
            </li>
          </ul>
        </li>
        <li>
          <strong>Choose Your Coverage</strong>: We offer flexible options to
          suit your needs:
          <ul className="list-disc pl-6 mt-1">
            <li>
              <strong>Liability-Only</strong>: Meets Mexico’s minimum
              requirements, covering damages or injuries you cause to others.
            </li>
            <li>
              <strong>Full Coverage</strong>: Includes liability, physical
              damage, theft, vandalism, medical payments, and roadside
              assistance.
            </li>
            <li>
              <strong>Add-Ons</strong>: Legal assistance, travel assistance, or
              coverage for towed units.
            </li>
          </ul>
        </li>
        <li>
          <strong>Purchase Your Policy</strong>: We’ll provide a quote starting
          from a low cost, plus applicable fees. Pay securely online or over the
          phone, and receive your policy instantly via email.
        </li>
        <li>
          <strong>Carry Proof of Insurance</strong>: Print your policy documents
          and keep them in your vehicle at all times. Mexican authorities may
          request proof during traffic stops or accidents.
        </li>
        <li>
          <strong>Travel with Confidence</strong>: Drive legally and safely in
          Mexico, knowing you’re covered. If an accident occurs, call the number
          on your policy for immediate claims support.
        </li>
        <li>
          <strong>Ongoing Support</strong>: Our team is available to answer
          questions, extend coverage, or assist with claims during your trip.
          Call us at{" "}
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
        Mexico tourist auto insurance policies are customizable for Texas
        drivers. Common coverage types include:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Liability Insurance</strong>: Mandatory coverage for bodily
          injury and property damage caused to others, with limits up to
          $1,000,000.
        </li>
        <li>
          <strong>Physical Damage</strong>: Covers damage to your vehicle from
          accidents, collisions, or rollovers.
        </li>
        <li>
          <strong>Theft and Vandalism</strong>: Protects against total or
          partial theft and intentional damage to your vehicle.
        </li>
        <li>
          <strong>Medical Payments</strong>: Covers medical expenses for you and
          your passengers, up to policy limits.
        </li>
        <li>
          <strong>Roadside Assistance</strong>: Includes towing, fuel delivery,
          tire changes, and other emergency services.
        </li>
        <li>
          <strong>Legal Assistance</strong>: Provides legal support and bail
          bond coverage if you face legal issues after an accident.
        </li>
        <li>
          <strong>Travel Assistance</strong>: Helps with lost passports,
          emergency travel arrangements, or roadside emergencies.
        </li>
      </ul>
      <p className="mb-4">
        Unsure which coverage is right for you? Call us at{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        for personalized advice.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Costs of Mexico Tourist Auto Insurance
      </h2>
      <p className="mb-4">
        The cost of Mexico tourist auto insurance varies based on your vehicle,
        trip duration, and coverage level. With{" "}
        <strong>Texas Premium Insurance Services</strong>, you get competitive
        rates tailored to Texas drivers:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Starting Point</strong>: Coverage starts from a low cost, plus
          applicable fees, depending on your policy.
        </li>
        <li>
          <strong>Factors Affecting Cost</strong>: Vehicle type (car, RV,
          motorcycle), trip length (daily, weekly, or annual), coverage type
          (liability-only or full), and driver profile.
        </li>
        <li>
          <strong>Affordable Options</strong>: Daily policies are
          budget-friendly for short trips, while annual policies offer savings
          for frequent travelers.
        </li>
        <li>
          <strong>No Hidden Fees</strong>: We provide transparent quotes with
          all fees included upfront.
        </li>
      </ul>
      <p className="mb-4">
        Example: A week-long trip with liability-only coverage for a standard
        car may start at a low cost, while full coverage for an RV may cost
        more. Get a personalized quote by calling{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>
        .
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Risks of Driving Without Coverage
      </h2>
      <p className="mb-4">
        Driving in Mexico without proper insurance can lead to serious
        consequences for Texas drivers:
      </p>
      <ul className="list-disc pl-6 mt-2 mb-4 text-gray-700">
        <li>
          <strong>Legal Penalties</strong>: Fines, vehicle impoundment, or
          detention if you can’t prove financial responsibility after an
          accident.
        </li>
        <li>
          <strong>Financial Liability</strong>: You’re responsible for paying
          out-of-pocket for damages or injuries, which can exceed $300,000 in
          severe cases.
        </li>
        <li>
          <strong>No Protection</strong>: Without coverage, you’re unprotected
          against theft, damage, or medical expenses.
        </li>
        <li>
          <strong>Border Issues</strong>: Some border checkpoints may require
          proof of insurance before allowing entry.
        </li>
      </ul>
      <p className="mb-4">
        Avoid these risks with a policy from Texas Premium Insurance Services.
        Call{" "}
        <a href="tel:+1-469-729-5185" className="text-blue-600 hover:underline">
          (469) 729-5185
        </a>{" "}
        to get covered today.
      </p>

      <h2 className="text-gray-700 text-3xl mt-8">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4 mb-8">
        <div>
          <h3 className="text-lg font-medium">
            Is Mexico tourist auto insurance mandatory?
          </h3>
          <p className="text-gray-700">
            Yes, Mexican law requires all drivers to carry liability insurance
            from a Mexican insurer. Your Texas policy is not valid.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Can I use a U.S. or Mexican driver’s license?
          </h3>
          <p className="text-gray-700">
            Yes, a valid U.S. driver’s license (from Texas) or a Mexican
            driver’s license is accepted to purchase Mexico tourist auto
            insurance.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Can I buy insurance at the border?
          </h3>
          <p className="text-gray-700">
            Yes, but it’s risky to drive uninsured until you purchase a policy.
            We recommend buying coverage in advance through us for instant
            protection.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-medium">
            What if I have an accident in Mexico?
          </h3>
          <p className="text-gray-700">
            Contact your insurer’s claims number immediately (listed on your
            policy). Our team can assist with the process—just call us at (469)
            729-5185.
          </p>
        </div>
      </div>

      <div className="flex justify-center mt-6 mb-8">
        <a
          href="tel:+1-469-729-5185"
          className="bg-[#a0103d] hover:bg-[#870d34] text-white font-semibold py-3 px-6 rounded-xl text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 hover:shadow-[#a0103d]/50 hover:shadow-xl"
        >
          Get Your Mexico Coverage Today
        </a>
      </div>
    </div>
  );
}
