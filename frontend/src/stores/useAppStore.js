import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useAppStore = create(
  persist(
    (set, get) => ({
      // UI shell
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

      // Files and selection
      serverFiles: [],
      setServerFiles: (files) => set({ serverFiles: files || [] }),
      addServerFile: (file) =>
        set({ serverFiles: [...get().serverFiles, file] }),
      removeServerFile: (id) =>
        set({
          serverFiles: get().serverFiles.filter(
            (f) => (f.id ?? f._id ?? f.name) !== id,
          ),
        }),

      // FIX 1: selectedFile is now persisted so it survives navigation
      // Home.jsx → navigate to /dashboard → selectedFile is still set
      selectedFile: null,
      setSelectedFile: (file) => set({ selectedFile: file ?? null }),
      clearSelectedFile: () => set({ selectedFile: null }),

      // Processing state
      processingSteps: {},
      setProcessingSteps: (steps) => set({ processingSteps: steps || {} }),
      updateProcessingStep: (key, value) =>
        set({ processingSteps: { ...get().processingSteps, [key]: value } }),
      resetProcessing: () => set({ processingSteps: {} }),
    }),
    {
      name: "app-store",
      storage: createJSONStorage(() => localStorage),
      // FIX 1: Added selectedFile to partialize so it persists across page navigation
      partialize: (state) => ({
        sidebarOpen:  state.sidebarOpen,
        serverFiles:  state.serverFiles,
        selectedFile: state.selectedFile,  // ← was missing, caused null on /dashboard
      }),
    },
  ),
);