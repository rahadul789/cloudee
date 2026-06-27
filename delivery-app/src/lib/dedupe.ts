/**
 * Removes entries that repeat the same stable id, preserving order (first wins).
 *
 * Offset/page-number pagination can momentarily return the same entity in two
 * pages when items shift between fetches. Flattening those pages then renders the
 * same React key twice → the "two children with the same key" warning. Deduping
 * by id is the standard safety net kept alongside stable keys; it can never drop
 * a legitimate distinct entity because ids are unique by definition.
 */
export function dedupeById<T extends { _id?: string; id?: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = item?._id ?? item?.id ?? "";
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    result.push(item);
  }
  return result;
}
