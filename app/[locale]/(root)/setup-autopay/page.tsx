// app\(root)\setup-autopay
import { Suspense } from "react";
import SetupAutopayContent from "./SetupAutopayContent";

export default function SetupAutopayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      }
    >
      <SetupAutopayContent />
    </Suspense>
  );
}
