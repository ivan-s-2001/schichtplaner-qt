type AISuggestButtonProps = {
  scheduleId: string;
};

/**
 * Compatibility shim for the removed AI scheduling feature.
 * Kept temporarily so legacy schedule layouts compile without exposing AI UI.
 */
export function AISuggestButton(_props: AISuggestButtonProps) {
  return null;
}
