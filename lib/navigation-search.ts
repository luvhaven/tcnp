/** Filter an already permission-scoped navigation list. Never add destinations. */
export function filterNavigation<T extends { label: string; items: { name: string; href: string }[] }>(sections: T[], query: string): T[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return sections
  return sections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      const text = `${section.label} ${item.name} ${item.href.replaceAll('-', ' ')}`.toLocaleLowerCase()
      return words.every(word => text.includes(word))
    }),
  })).filter(section => section.items.length > 0)
}
