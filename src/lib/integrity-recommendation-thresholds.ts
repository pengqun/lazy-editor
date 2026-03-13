/**
 * Local recommendation thresholds for KB health check heuristics.
 *
 * Keep this config intentionally small and stable:
 * only core signals that are already used in production are configurable.
 */
export interface RecommendationThresholdSettings {
  /** Missing ratio at/above this value is treated as a strong root-cause signal. */
  missingStrongSignalRatio: number;
  /** Tiny-missing downgrade applies only when missing count <= this value. */
  tinyMissingMaxCount: number;
  /** Tiny-missing downgrade applies only when missing ratio <= this value. */
  tinyMissingMaxRatio: number;
  /** Missing count above this value escalates to high priority. */
  missingHighCount: number;
  /** Missing ratio above this value escalates to critical priority/confidence. */
  missingCriticalRatio: number;
  /** Moved count above this value escalates to high priority. */
  movedHighCount: number;
  /** Moved count above this value escalates to critical priority. */
  movedCriticalCount: number;
}

/**
 * Defaults preserve current behavior (same values as prior hardcoded rules).
 */
export const DEFAULT_RECOMMENDATION_THRESHOLDS: RecommendationThresholdSettings = {
  missingStrongSignalRatio: 0.3,
  tinyMissingMaxCount: 1,
  tinyMissingMaxRatio: 0.1,
  missingHighCount: 3,
  missingCriticalRatio: 0.5,
  movedHighCount: 1,
  movedCriticalCount: 5,
};
