export function extractErrorMessage(errorText: string): string {
  if (!errorText) return "Request failed";

  const trimmed = errorText.trim();

  // Try to parse as JSON
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);

      // Check for common error message fields (prefer human-readable message)
      if (typeof parsed.message === "string") return parsed.message;
      if (typeof parsed.error === "string") return parsed.error;
      if (typeof parsed.detail === "string") return parsed.detail;

      // If it's a structured error, return a generic message
      return "An error occurred. Please try again.";
    } catch {
      // If JSON parsing fails, return the trimmed text
      return trimmed;
    }
  }

  return trimmed;
}
