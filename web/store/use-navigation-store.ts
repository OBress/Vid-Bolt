import { create } from "zustand";

interface NavigationState {
  currentVideoName: string | null;
  setCurrentVideoName: (name: string | null) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentVideoName: null,
  setCurrentVideoName: (name) => set({ currentVideoName: name }),
}));
