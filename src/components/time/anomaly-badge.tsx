type AnomalyBadgeProps = {
  month: string;
  isManager: boolean;
};

type EmployeeAnomalyIndicatorProps = {
  anomalies: unknown[];
  employeeId: string;
};

/** Compatibility shim for the removed anomaly-analysis feature. */
export function AnomalyBadge(_props: AnomalyBadgeProps) {
  return null;
}

/** Compatibility shim for the removed anomaly-analysis feature. */
export function EmployeeAnomalyIndicator(
  _props: EmployeeAnomalyIndicatorProps
) {
  return null;
}
