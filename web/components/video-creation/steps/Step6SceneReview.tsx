"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { SceneReviewSidebar } from "./scene-review/SceneReviewSidebar";
import { SceneList } from "./scene-review/SceneList";
import type { AudioChunk, ShotEvent } from "../VideoCreationWizard";

interface Step6SceneReviewProps {
  videoId: string;
  projectId: string;
  onContinue: () => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

// Mock Data
const MOCK_SCENES = [
  {
    id: "1",
    sceneNumber: 1,
    imageUrl:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2864&auto=format&fit=crop",
    description:
      "A powerful and artistic portrait of @Isabella Moretti, dressed in a commanding dark blue ensemble, framed exquisitely by a classic stone archway, her confident posture and direct gaze.",
  },
  {
    id: "2",
    sceneNumber: 2,
    imageUrl:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=2459&auto=format&fit=crop",
    description:
      "An imposing full-length shot of @Isabella Moretti standing poised and elegant in a flowing dark blue gown, centered within a grand hall adorned with intricate mosaic tiles.",
  },
  {
    id: "3",
    sceneNumber: 3,
    imageUrl:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1887&auto=format&fit=crop",
    description:
      "A dynamic shot of @Isabella positioned on an architectural walkway, her arm gracefully extended to showcase a gleaming gold watch.",
  },
  {
    id: "4",
    sceneNumber: 4,
    imageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1887&auto=format&fit=crop",
    description: "Close up portrait of a woman looking confident and happy.",
  },
];

export function Step6SceneReview({
  videoId,
  projectId,
  onContinue,
  onBack,
  isLocked,
  lockedMessage,
}: Step6SceneReviewProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    MOCK_SCENES[0].id,
  );

  const selectedScene =
    MOCK_SCENES.find((s) => s.id === selectedSceneId) || MOCK_SCENES[0];

  return (
    <div className="flex flex-col h-full w-full bg-black">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">Scene Review</h2>
          <p className="text-sm text-neutral-400">
            Review and generate videos for each scene
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {isLocked ? (
            <div className="px-4 py-2 bg-neutral-800 rounded text-neutral-500 text-sm">
              {lockedMessage}
            </div>
          ) : (
            <Button
              onClick={onContinue}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Continue to Export
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <SceneReviewSidebar selectedSceneNumber={selectedScene.sceneNumber} />

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[#0a0a0a]">
          {/* Top gradient overlay for depth */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-10" />

          <SceneList
            scenes={MOCK_SCENES}
            selectedSceneId={selectedSceneId}
            onSelectScene={setSelectedSceneId}
          />
        </div>
      </div>
    </div>
  );
}
