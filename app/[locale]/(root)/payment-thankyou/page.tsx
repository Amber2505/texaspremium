import { Suspense } from "react";
import ThankYouContent from "./ThankYouContent";

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          Loading...
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  );
}
