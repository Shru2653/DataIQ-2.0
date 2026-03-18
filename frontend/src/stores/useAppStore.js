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
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        serverFiles: state.serverFiles,
      }),
    },
  ),
);
