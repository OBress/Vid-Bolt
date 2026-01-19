import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { SceneCard } from "./SceneCard";

interface Scene {
  id: string;
  sceneNumber: number;
  imageUrl?: string;
  description: string;
}

interface SceneListProps {
  scenes: Scene[];
  selectedSceneId?: string;
  onSelectScene: (sceneId: string) => void;
}

export function SceneList({
  scenes,
  selectedSceneId,
  onSelectScene,
}: SceneListProps) {
  return (
    <ScrollArea className="w-full h-full bg-[#1A1A1A]">
      <div className="flex gap-4 p-8 min-w-max">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            sceneNumber={scene.sceneNumber}
            imageUrl={scene.imageUrl}
            description={scene.description}
            isSelected={selectedSceneId === scene.id}
            onSelect={() => onSelectScene(scene.id)}
            onEditImage={() => console.log("Edit image", scene.id)}
            onGenerateVideo={() => console.log("Generate video", scene.id)}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
