const CACHE = "private, no-cache, no-store, max-age=0, must-revalidate"
const GZIP_AT = 1024

export async function jsonResponse(request: Request, body: unknown, status = 200): Promise<Response> {
  const encoded = JSON.stringify(body)
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": CACHE,
  })
  if (encoded.length < GZIP_AT || !acceptsGzip(request) || servedLocally(request)) {
    return new Response(encoded, { status, headers })
  }
  headers.set("content-encoding", "gzip")
  headers.set("vary", "accept-encoding")
  const stream = new Blob([encoded]).stream().pipeThrough(new CompressionStream("gzip"))
  const gzipped = new Uint8Array(await new Response(stream).arrayBuffer())
  headers.set("content-length", String(gzipped.byteLength))
  return new Response(gzipped, { status, headers })
}

function acceptsGzip(request: Request): boolean {
  const header = request.headers.get("accept-encoding") ?? ""
  return header.split(",").some((part) => part.trim().toLowerCase().startsWith("gzip"))
}

function servedLocally(request: Request): boolean {
  const host = (request.headers.get("host") ?? new URL(request.url).host).toLowerCase()
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") || host.startsWith("::1")
}
