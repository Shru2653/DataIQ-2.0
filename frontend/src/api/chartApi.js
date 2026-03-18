import axiosClient from './axiosClient';

export const getSummaryStats = (params) => axiosClient.get('/charts/summary', { params });
export const getSeries = (params) => axiosClient.get('/charts/series', { params });
export const getCorrelation = (params) => axiosClient.get('/charts/correlation', { params });
