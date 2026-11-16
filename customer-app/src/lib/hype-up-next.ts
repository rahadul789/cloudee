// "Up next" queue on the watch screen (pure; unit-tested).
// The videos AFTER the current one in list order come first, then the ones before it.
// Videos already played this session go to the back, so Next never ping-pongs between two.
export function buildUpNext<T extends { id: string }>(list: T[], currentId: string | undefined, played: Set<string>) {
  const index = list.findIndex((item) => item.id === currentId);
  const rotated = index >= 0 ? [...list.slice(index + 1), ...list.slice(0, index)] : list.filter((item) => item.id !== currentId);
  return [...rotated.filter((item) => !played.has(item.id)), ...rotated.filter((item) => played.has(item.id))];
}
