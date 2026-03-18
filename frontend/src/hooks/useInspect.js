import { useMutation } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

// Inspect: use datatypes preview to quickly fetch small preview and meta
export default function useInspect() {
  const preview = useMutation({
    mutationFn: async ({ filename, preview_limit = 10 } = {}) => {
      const res = await axiosClient.post('/api/datatypes/preview', { filename, preview_limit });
      return res.data;
    },
  });

  return {
    preview: preview.mutateAsync,
    isLoading: preview.isPending,
    data: preview.data,
    error: preview.error,
    reset: preview.reset,
  };
}
