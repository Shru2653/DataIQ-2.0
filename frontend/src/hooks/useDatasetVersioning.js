/**
 * useDatasetVersioning.js — React hook for dataset versioning
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import axiosClient from "../api/axiosClient";

export default function useDatasetVersioning() {
  const queryClient = useQueryClient();

  // Get all datasets grouped by version
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["datasets:grouped"],
    queryFn: async () => {
      const response = await axiosClient.get("/api/dataset-versions/grouped");
      return response.data;
    },
    staleTime: 30000,
  });

  // Get single dataset details
  const getDataset = async (datasetName) => {
    const response = await axiosClient.get(`/api/dataset-versions/${datasetName}`);
    return response.data.dataset;
  };

  // Get latest version of a dataset
  const getLatestVersion = async (datasetName) => {
    const response = await axiosClient.get(`/api/dataset-versions/${datasetName}/latest`);
    return response.data.version;
  };

  // Invalidate cache to refresh
  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: ["datasets:grouped"] });
  };

  // Download a version file
  const downloadVersion = async (filename) => {
    const response = await axiosClient.get(`/api/files/download/${filename}`, {
      responseType: "blob",
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return {
    datasets: data?.datasets || [],
    totalCount: data?.total_count || 0,
    isLoading,
    error,
    refetch,
    getDataset,
    getLatestVersion,
    downloadVersion,
    invalidateCache,
  };
}
