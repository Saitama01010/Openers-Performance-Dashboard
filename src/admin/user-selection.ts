export function toggleUserSelection(selected: ReadonlySet<string>, id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function toggleAllUserSelection(
  selected: ReadonlySet<string>,
  selectableIds: readonly string[],
) {
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  return allSelected ? new Set<string>() : new Set(selectableIds);
}
