import { useMutation } from "@tanstack/react-query";
import axiosClient from "../api/axiosClient";

/**
 * useDriftDetection
 *
 * Wraps POST /api/drift-analysis
 * Follows the same pattern as useCleaningRecommendations, useDataQuality, etc.
 *
 * Usage:
 *   const { analyze, isLoading, isError, error, data, reset } = useDriftDetection();
 *   await analyze({ previous_filename: 'baseline.csv', current_filename: 'new.csv' });
 */
export default function useDriftDetection() {
  const mutation = useMutation({
    mutationFn: async ({ previous_filename, current_filename }) => {
      if (!previous_filename) throw new Error("previous_filename is required");
      if (!current_filename) throw new Error("current_filename is required");
      if (previous_filename === current_filename)
        throw new Error("previous_filename and current_filename must be different");

      const res = await axiosClient.post("/api/drift-analysis", {
        previous_filename,
        current_filename,
      });
      return res.data;
    },
  });

  return {
    /**
     * Call this with { previous_filename, current_filename } to trigger analysis.
     * Returns a promise that resolves to the response data.
     */
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
     *   previous_filename: string,
     *   current_filename:  string,
     *   schema_changes: {
     *     new_columns:      string[],
     *     removed_columns:  string[],
     *     type_changes: [
     *       { column: string, previous_type: string, current_type: string }
     *     ]
     *   },
     *   drift_results: [
     *     {
     *       column:      string,
     *       drift_score: number,   // KS statistic  0–1
     *       p_value:     number,
     *       status:      "stable" | "warning" | "drift_detected"
     *     }
     *   ],
     *   summary: {
     *     total_columns_checked: number,
     *     drifted_columns:       number,
     *     warning_columns:       number,
     *     stable_columns:        number,
     *     schema_changes_count:  number
     *   }
     * }
     */
    data: mutation.data,

    /** Reset mutation state (clears data + error) */
    reset: mutation.reset,
  };
}
