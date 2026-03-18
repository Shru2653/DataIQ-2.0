import { useMutation } from '@tanstack/react-query';
import { normalizeData } from '../api/processApi';

export function useNormalization() {
  return useMutation({ mutationFn: (payload) => normalizeData(payload).then(r => r.data) });
}
