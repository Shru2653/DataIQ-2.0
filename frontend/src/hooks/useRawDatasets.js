import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

/**
 * useRawDatasets
 *
 * Fetches the list of original uploaded (raw) datasets from GET /api/raw-datasets.
 * These are the files stored in the user's `datasets/raw/` (files) directory.
 *
 * Returns a react-query query object. Access the file list via:
 *   const { data, isLoading, isError } = useRawDatasets();
 *   const files = data?.files ?? [];
 */
export default function useRawDatasets() {
  return useQuery({
    queryKey: ['raw-datasets'],
    queryFn: async () => {
      const res = await axiosClient.get('/api/raw-datasets');
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
