import axiosClient from './axiosClient';

export const normalizeData = (payload) => axiosClient.post('/process/normalize', payload);
export const detectOutliers = (payload) => axiosClient.post('/process/outliers', payload);
export const featureEngineer = (payload) => axiosClient.post('/process/features', payload);
export const previewTransform = (payload) => axiosClient.post('/process/preview', payload);
