import { useMutation } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

// Wraps POST /api/duplicates/handle
export default function useDuplicates() {
  const mutation = useMutation({
    mutationFn: async (payload) => {
      const res = await axiosClient.post('/api/duplicates/handle', payload);
      return res.data;
    },
  });

  return {
    execute: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
