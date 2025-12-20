import { IDesign } from "@designcombo/types";
import { create } from "zustand";

interface Output {
  url: string;
  type: string;
}

interface DownloadState {
  projectId: string;
  exporting: boolean;
  exportType: "json" | "mp4";
  progress: number;
  output?: Output;
  payload?: IDesign;
  displayProgressModal: boolean;
  actions: {
    setProjectId: (projectId: string) => void;
    setExporting: (exporting: boolean) => void;
    setExportType: (exportType: "json" | "mp4") => void;
    setProgress: (progress: number) => void;
    setState: (state: Partial<DownloadState>) => void;
    setOutput: (output: Output) => void;
    startExport: () => void;
    setDisplayProgressModal: (displayProgressModal: boolean) => void;
  };
}

export const useDownloadState = create<DownloadState>((set, get) => ({
  projectId: "",
  exporting: false,
  exportType: "mp4",
  progress: 0,
  displayProgressModal: false,
  actions: {
    setProjectId: (projectId) => set({ projectId }),
    setExporting: (exporting) => set({ exporting }),
    setExportType: (exportType) => set({ exportType }),
    setProgress: (progress) => set({ progress }),
    setState: (state) => set({ ...state }),
    setOutput: (output) => set({ output }),
    setDisplayProgressModal: (displayProgressModal) =>
      set({ displayProgressModal }),
    startExport: async () => {
      try {
        const { payload, exportType } = get();

        if (!payload) throw new Error("Payload is not defined");

        // Handle JSON export (works client-side)
        if (exportType === "json") {
          set({ exporting: true, displayProgressModal: true, progress: 0 });
          
          // Simulate progress
          await new Promise(resolve => setTimeout(resolve, 300));
          set({ progress: 50 });
          
          // Create the JSON file
          const jsonString = JSON.stringify(payload, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          
          await new Promise(resolve => setTimeout(resolve, 300));
          set({ progress: 100 });
          
          // Trigger download
          const link = document.createElement("a");
          link.href = url;
          link.download = `project-${payload.id || 'export'}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          set({ 
            exporting: false, 
            output: { url, type: "json" },
            displayProgressModal: false 
          });
          
          return;
        }

        // Handle MP4 export
        // For now, show a message that MP4 export requires a rendering backend
        set({ exporting: true, displayProgressModal: true, progress: 0 });
        
        alert(
          "MP4 Export Not Available\n\n" +
          "Video rendering requires a backend service (e.g., Remotion Lambda) " +
          "which is not configured yet.\n\n" +
          "For now, you can:\n" +
          "1. Export as JSON to save your project\n" +
          "2. Set up a Remotion Lambda backend for video rendering\n\n" +
          "The project JSON will be downloaded instead."
        );
        
        // Fall back to JSON export
        const jsonString = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // Trigger download
        const link = document.createElement("a");
        link.href = url;
        link.download = `project-${payload.id || 'export'}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        set({ 
          exporting: false, 
          displayProgressModal: false,
          output: { url, type: "json" }
        });

      } catch (error) {
        console.error(error);
        set({ exporting: false, displayProgressModal: false });
      }
    }
  }
}));
