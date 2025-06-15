"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function Carousel() {
  const images = [
    { src: "/car.png", alt: "Car" },
    { src: "/motorcycle1.png", alt: "Motorcycle" },
    { src: "/house1.png", alt: "House" },
    { src: "/rental-apt1.png", alt: "Rental" },
    { src: "/commercial1.png", alt: "Commercial" },
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className="lg:w-1/2 relative mt-10 lg:mt-0">
      <Image
        src={images[currentImageIndex].src}
        alt={images[currentImageIndex].alt}
        width={600}
        height={400}
        className="object-contain"
      />
      <div className="flex justify-center mt-4 space-x-2">
        {images.map((_, i) => (
          <span
            key={i}
            className={`w-4 h-1 ${
              i === currentImageIndex ? "bg-[#A0103D]" : "bg-gray-400"
            }`}
            style={{ borderRadius: "2px" }}
          ></span>
        ))}
      </div>
    </div>
  );
}
