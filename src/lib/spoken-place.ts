const SPOKEN = [{ tc: "碩門邨", en: "SHEK MUN ESTATE", sayTc: "石門", sayEn: "Shek Mun" }]

export function spokenPlace(tc: string, en: string): { tc: string; en: string } {
  const traditional = tc.replace(/\s+/g, "")
  const english = en.replace(/\s+/g, " ").trim().toUpperCase()
  for (const row of SPOKEN) {
    if (traditional === row.tc || english === row.en) return { tc: row.sayTc, en: row.sayEn }
  }
  return { tc, en }
}
