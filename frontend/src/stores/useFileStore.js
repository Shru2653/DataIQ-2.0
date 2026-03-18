import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useFileStore = create(
  persist(
    (set) => ({
      selectedFile: null,
      setSelectedFile: (file) => set({ selectedFile: file ?? null }),
      clearSelectedFile: () => set({ selectedFile: null }),
    }),
    {
      name: 'file-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
