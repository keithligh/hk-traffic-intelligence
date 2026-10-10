export type ShareResult = "shared" | "copied" | "cancelled" | "failed"

export function siteAddress(pageUrl: string): string {
  const url = new URL(pageUrl)
  url.pathname = "/"
  url.search = ""
  url.hash = ""
  return url.toString()
}

export async function shareAddress(
  url: string,
  title: string,
  tools: {
    share?: (data: { title: string; url: string }) => Promise<void>
    copy?: (url: string) => Promise<void>
  },
): Promise<ShareResult> {
  if (tools.share) {
    try {
      await tools.share({ title, url })
      return "shared"
    } catch (error) {
      if (isCancel(error)) return "cancelled"
    }
  }
  if (!tools.copy) return "failed"
  try {
    await tools.copy(url)
    return "copied"
  } catch {
    return "failed"
  }
}

function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
