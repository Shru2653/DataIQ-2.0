import { useMutation } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

// Wraps POST /api/outliers/apply
export default function useOutliers() {
  const mutation = useMutation({
    mutationFn: async (payload) => {
      const res = await axiosClient.post('/api/outliers/apply', payload);
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
