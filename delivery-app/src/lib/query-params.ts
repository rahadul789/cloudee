type QueryParamPrimitive = string | number | boolean;

export function buildQueryString(
  params?: Record<string, QueryParamPrimitive | null | undefined>
) {
  const searchParams = new URLSearchParams();

  if (!params) {
    return searchParams.toString();
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams.toString();
}
