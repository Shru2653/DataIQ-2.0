import { useMutation } from "@tanstack/react-query";
import axiosClient from "../api/axiosClient";

/**
 * useCleaningRecommendations
 *
 * Wraps POST /api/cleaning-recommendations
 * Follows the same pattern as useDataQuality, useNormalize, useOutliers, etc.
 *
 * Usage:
 *   const { analyze, isLoading, isError, error, data, reset } = useCleaningRecommendations();
 *   await analyze('myfile.csv');
 */
export default function useCleaningRecommendations() {
  const mutation = useMutation({
    mutationFn: async (filename) => {
      if (!filename) throw new Error("filename is required");
      const res = await axiosClient.post("/api/cleaning-recommendations", {
        filename,
      });
      return res.data;
    },
  });

  return {
    /** Call this with a filename string to trigger analysis */
    analyze: mutation.mutateAsync,

    /** True while the HTTP request is in-flight */
    isLoading: mutation.isPending,

    /** True once the request has succeeded */
    isSuccess: mutation.isSuccess,

    /** True if the request failed */
    isError: mutation.isError,

    /** The normalised error object from axiosClient's response interceptor */
    error: mutation.error,

    /**
     * The parsed JSON response:
     * {
     *   recommendations: [{
     *     issue: string,
     *     severity: string,
     *     recommendation: string,
     *     column: string | null,
     *     affected_rows: number | null,
     *     action_type: string | null
     *   }],
     *   summary: {
     *     total: number,
     *     high: number,
     *     medium: number,
     *     low: number
     *   }
     * }
     */
    data: mutation.data,

    /** Reset mutation state (clears data + error) */
    reset: mutation.reset,
  };
}
