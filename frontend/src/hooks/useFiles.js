import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../api/axiosClient';

// GET /files and POST /upload (with upload progress)
export function useFiles() {
  const qc = useQueryClient();

  const filesQuery = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const res = await axiosClient.get('/files');
      return res.data;
    },
  });

  // mutationFn accepts: { file: File|Blob|FormData|File[], onProgress?: (pct:number, evt:ProgressEvent) => void }
  const upload = useMutation({
    mutationFn: async ({ file, onProgress } = {}) => {
      const form = file instanceof FormData ? file : new FormData();
      if (!(file instanceof FormData)) {
        if (Array.isArray(file)) {
          file.forEach((f) => form.append('files', f));
        } else {
          form.append('files', file);
        }
      }

      const res = await axiosClient.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded / evt.total) * 100);
          if (typeof onProgress === 'function') onProgress(pct, evt);
        },
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['datasets'] })
    },
  });

  return { filesQuery, upload };
}
