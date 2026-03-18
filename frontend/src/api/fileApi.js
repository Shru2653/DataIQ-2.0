import axiosClient from './axiosClient';

export const uploadFile = (formData) =>
  axiosClient.post('/files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const listFiles = () => axiosClient.get('/files');
export const deleteFile = (id) => axiosClient.delete(`/files/${id}`);
export const getFileById = (id) => axiosClient.get(`/files/${id}`);
