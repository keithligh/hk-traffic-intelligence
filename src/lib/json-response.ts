const CACHE = "private, no-cache, no-store, max-age=0, must-revalidate"
const GZIP_AT = 1024

export async function jsonResponse(request: Request, body: unknown, status = 200): Promise<Response> {
  const encoded = JSON.stringify(body)
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": CACHE,
  })
  if (encoded.length < GZIP_AT || !acceptsGzip(request)) {
    return new Response(encoded, { status, headers })
  }
  headers.set("content-encoding", "gzip")
  headers.set("vary", "accept-encoding")
  const stream = new Blob([encoded]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Response(stream, { status, headers })
}

function acceptsGzip(request: Request): boolean {
  const header = request.headers.get("accept-encoding") ?? ""
  return header.split(",").some((part) => part.trim().toLowerCase().startsWith("gzip"))
}
