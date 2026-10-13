const CACHE = "private, no-cache, no-store, max-age=0, must-revalidate"

export function jsonResponse(_request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": CACHE,
    },
  })
}
