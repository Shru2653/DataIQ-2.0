import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

// Fetch ALL cleaned files. Filter in the consumer to avoid backend pattern mismatch issues.
export default function useCleanedFiles() {
  return useQuery({
    queryKey: ['cleaned-files'],
    queryFn: async () => {
      const res = await axiosClient.get('/cleaned-files');
      return res.data?.files || [];
    },
    staleTime: 30_000,
  });
}
