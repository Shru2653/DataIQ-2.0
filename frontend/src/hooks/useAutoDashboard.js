import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

// Hook to generate auto dashboard from server
// API: POST /api/auto-dashboard/analyze { filename }
// Returns: { kpis: [...], charts: [...] }
export default function useAutoDashboard() {
  const [dashboard, setDashboard] = useState(null);

  const mutation = useMutation({
    mutationFn: async (filename) => {
      if (!filename) throw new Error('filename is required');
      const res = await axiosClient.post('/api/auto-dashboard/analyze', { filename });
      return { filename, ...res.data };
    },
    onSuccess: (data) => setDashboard(data),
  });

  const generate = useCallback((filename) => mutation.mutate(filename), [mutation]);

  return {
    generate,
    dashboard,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: () => setDashboard(null),
  };
}
