// MapLibre shows a credit when no longer credit contains that whole string.
// A repeated name has to be the same string, or it stays on the line twice.

export const MAP_CREDIT = {
  esri: "© Esri",
  transport: "© Transport Department",
  immigration: "© Immigration Department",
  mtr: "© MTR",
  lands: "© Lands Department",
  environment: "© Environmental Protection Department",
  osm: '<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
  kmb: "© KMB | © LWB",
  citybus: "© Citybus",
  nlb: "© NLB",
  ferries: "© Sun Ferry | © HKKF | © Star Ferry | © Fortune Ferry",
} as const

// A phone starts with the credit collapsed. A wider map starts with it open.
// A tap on that visit overrides the start. Null means the visitor has not chosen.
export function dataCreditOpen(phone: boolean, chosen: boolean | null): boolean {
  if (phone) return chosen === true
  return chosen !== false
}

export function shownCredits(attributions: readonly string[]): string[] {
  const unique = [...new Set(attributions.map((credit) => credit.trim()).filter(Boolean))]
  unique.sort((a, b) => a.length - b.length)
  return unique.filter((credit, index) => {
    for (let later = index + 1; later < unique.length; later += 1) {
      const other = unique[later]
      if (other?.includes(credit)) return false
    }
    return true
  })
}
