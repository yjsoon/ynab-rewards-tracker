export function normaliseCategoryImportName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}
