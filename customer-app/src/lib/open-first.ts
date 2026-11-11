// Home rule: offline/closed restaurants always go to the END of every section, keeping the
// existing order inside the open group and inside the closed group (stable partition).
export function openFirst<T extends { isOpen?: boolean | null }>(list: readonly T[]): T[] {
  const open: T[] = [];
  const closed: T[] = [];
  for (const item of list) (item.isOpen === false ? closed : open).push(item);
  return closed.length ? [...open, ...closed] : (list as T[]);
}
