import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

export default function useDatasets() {
  const query = useQuery({
    queryKey: ['datasets'],
    queryFn: async () => {
      const res = await axiosClient.get('/datasets');
      return res.data;
    },
    staleTime: 1000 * 10,
    refetchOnWindowFocus: false,
  });
  return query;
}
