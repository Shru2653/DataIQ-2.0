import { useMutation } from '@tanstack/react-query';
import { normalizeData, detectOutliers, featureEngineer, previewTransform } from '../api/processApi';

export function useDataProcessing() {
  const normalize = useMutation({ mutationFn: (p) => normalizeData(p).then(r => r.data) });
  const outliers = useMutation({ mutationFn: (p) => detectOutliers(p).then(r => r.data) });
  const features = useMutation({ mutationFn: (p) => featureEngineer(p).then(r => r.data) });
  const preview = useMutation({ mutationFn: (p) => previewTransform(p).then(r => r.data) });

  return { normalize, outliers, features, preview };
}
