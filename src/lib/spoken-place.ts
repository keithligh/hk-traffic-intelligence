const SPOKEN = [{ tc: "碩門邨", en: "SHEK MUN ESTATE", sayTc: "石門", sayEn: "Shek Mun" }]

export function spokenPlace(tc: string, en: string): { tc: string; en: string } {
  const traditional = tc.replace(/\s+/g, "")
  const english = en.replace(/\s+/g, " ").trim().toUpperCase()
  for (const row of SPOKEN) {
    if (traditional === row.tc || english === row.en) return { tc: row.sayTc, en: row.sayEn }
  }
  return { tc, en }
}

function placeCore(name: string): string {
  return name.split(/[(（]/)[0]?.replace(/\s+/g, " ").trim() ?? ""
}

// A destination that is already the stop's name is not news. 往機場 on an airport
// drop-off is that case. 往石門 on the airport departure stop is not.
export function directionIsNews(stopTc: string, stopEn: string, destTc: string, destEn: string): boolean {
  const spoken = spokenPlace(destTc, destEn)
  const stop = `${stopTc} ${stopEn}`.toLowerCase()
  const cores = [placeCore(spoken.tc), placeCore(spoken.en)].filter((core) => core.length >= 2)
  if (cores.length === 0) return false
  return !cores.some((core) => stop.includes(core.toLowerCase()))
}
