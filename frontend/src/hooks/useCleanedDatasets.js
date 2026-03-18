import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

/**
 * useCleanedDatasets
 *
 * Fetches the list of cleaned / processed datasets from GET /api/cleaned-datasets.
 * These are the files stored in the user's `datasets/cleaned/` directory —
 * i.e. outputs produced by the pipeline (deduplication, normalisation, etc.).
 *
 * Returns a react-query query object. Access the file list via:
 *   const { data, isLoading, isError } = useCleanedDatasets();
 *   const files = data?.files ?? [];
 */
export default function useCleanedDatasets() {
  return useQuery({
    queryKey: ['cleaned-datasets'],
    queryFn: async () => {
      const res = await axiosClient.get('/api/cleaned-datasets');
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
