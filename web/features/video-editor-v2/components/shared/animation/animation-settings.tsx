import React, { useState } from "react";
import { Play } from "lucide-react";
import { AnimationTemplate, animationTemplates } from "../../../adaptors/default-animation-adaptors";
import { AnimationPreview } from "./animation-preview";
import { AnimationSection } from "./animation-section";

interface AnimationSettingsProps {
  selectedEnterAnimation?: string;
  selectedExitAnimation?: string;
  onEnterAnimationSelect?: (animationId: string) => void;
  onExitAnimationSelect?: (animationId: string) => void;
}

/**
 * AnimationSettings component provides a unified interface for selecting enter and exit animations
 */
export const AnimationSettings: React.FC<AnimationSettingsProps> = ({
  selectedEnterAnimation,
  selectedExitAnimation,
  onEnterAnimationSelect,
  onExitAnimationSelect,
}) => {
  const [openSections, setOpenSections] = useState<{
    enter: boolean;
    exit: boolean;
  }>({
    enter: false,
    exit: false,
  });

  const toggleSection = (section: "enter" | "exit") => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const noneAnimation: AnimationTemplate = {
    key: "none",
    name: "None",
    preview: "No animation",
    enter: () => ({}),
    exit: () => ({}),
  };

  const animationArray = Object.values(animationTemplates);
  const allAnimations = [noneAnimation, ...animationArray];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Animations</span>
      </div>

      <div className="space-y-2">
        <AnimationSection
          title="Enter"
          count={allAnimations.length}
          isOpen={openSections.enter}
          onToggle={() => toggleSection("enter")}
        >
          {allAnimations.map((animation, index) => (
            <AnimationPreview
              key={`enter-${animation.key}-${index}`}
              animation={animation}
              isSelected={selectedEnterAnimation === animation.key}
              onClick={() => onEnterAnimationSelect?.(animation.key!)}
              animationType="enter"
            />
          ))}
        </AnimationSection>

        <AnimationSection
          title="Exit"
          count={allAnimations.length}
          isOpen={openSections.exit}
          onToggle={() => toggleSection("exit")}
        >
          {allAnimations.map((animation, index) => (
            <AnimationPreview
              key={`exit-${animation.key}-${index}`}
              animation={animation}
              isSelected={selectedExitAnimation === animation.key}
              onClick={() => onExitAnimationSelect?.(animation.key!)}
            />
          ))}
        </AnimationSection>
      </div>
    </div>
  );
};
