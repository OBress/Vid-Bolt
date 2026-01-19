import React from "react";
import { ArrowLeft, ArrowRight, Construction } from "lucide-react";

interface PlaceholderStepProps {
  title: string;
  description: string;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
}

export function PlaceholderStep({
  title,
  description,
  onNext,
  onBack,
  isLocked = false,
}: PlaceholderStepProps) {
  return (
    <div className="flex flex-col h-full bg-[#0F0F0F] rounded-xl border border-[#272727] overflow-hidden">
      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-20 h-20 bg-[#272727] rounded-full flex items-center justify-center">
          <Construction className="w-10 h-10 text-orange-500" />
        </div>

        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <p className="text-gray-400">{description}</p>
        </div>

        <div className="p-4 bg-[#1A1A1A] rounded-lg border border-[#272727] max-w-lg w-full">
          <p className="text-sm text-gray-500">
            This step is currently under development. You can proceed to the
            next step.
          </p>
        </div>
      </div>

      <div className="p-6 border-t border-[#272727] bg-[#141414] flex justify-between items-center">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#272727] transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <button
          onClick={onNext}
          disabled={isLocked}
          className={`
            flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all
            ${
              isLocked
                ? "bg-[#272727] text-gray-500 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20"
            }
          `}
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
