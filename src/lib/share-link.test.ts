import assert from "node:assert/strict"
import { shareAddress, siteAddress } from "./share-link.ts"

assert.equal(siteAddress("https://hktraffic.keith-li.workers.dev/?v=share#map"), "https://hktraffic.keith-li.workers.dev/")

let copied = ""
assert.equal(
  await shareAddress("https://hktraffic.keith-li.workers.dev/", "交通情報", {
    share: async () => {},
    copy: async (url) => {
      copied = url
    },
  }),
  "shared",
)
assert.equal(copied, "")

assert.equal(
  await shareAddress("https://hktraffic.keith-li.workers.dev/", "交通情報", {
    share: async () => {
      throw new DOMException("The user aborted a request.", "AbortError")
    },
    copy: async (url) => {
      copied = url
    },
  }),
  "cancelled",
)
assert.equal(copied, "")

assert.equal(
  await shareAddress("https://hktraffic.keith-li.workers.dev/", "交通情報", {
    copy: async (url) => {
      copied = url
    },
  }),
  "copied",
)
assert.equal(copied, "https://hktraffic.keith-li.workers.dev/")

assert.equal(await shareAddress("https://hktraffic.keith-li.workers.dev/", "交通情報", {}), "failed")

console.log("share link ok")
