import { useMutation } from "@tanstack/react-query";
import axiosClient from "../api/axiosClient";

/**
 * useDataQuality
 *
 * Wraps POST /api/data-quality
 * Follows the exact same pattern as useNormalize, useOutliers,
 * useMissingValues, useDuplicates, useFeatureEngineering, and useDAX.
 *
 * Usage:
 *   const { analyze, isLoading, isError, error, data, reset } = useDataQuality();
 *   await analyze('myfile.csv');
 */
export default function useDataQuality() {
  const mutation = useMutation({
    mutationFn: async (filename) => {
      if (!filename) throw new Error("filename is required");
      const res = await axiosClient.post("/api/data-quality", { filename });
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
     *   rows: number,
     *   columns: number,
     *   missing_percent: number,
     *   duplicates_percent: number,
     *   completeness_score: number,
     *   outlier_percent: number,
     *   invalid_dates: number,
     *   datatype_issues: number,
     * }
     */
    data: mutation.data,

    /** Reset mutation state (clears data + error) */
    reset: mutation.reset,
  };
}
