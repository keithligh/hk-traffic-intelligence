import { execFileSync } from "node:child_process"

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function refuse(message) {
  console.error(message)
  process.exit(1)
}

execFileSync("git", ["fetch", "origin", "main"], { stdio: "inherit" })

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
const head = git(["rev-parse", "HEAD"])
const published = git(["rev-parse", "origin/main"])
const dirty = git(["status", "--porcelain"])

if (branch !== "main") {
  refuse(`Refusing to deploy from ${branch}. The public line is main.`)
}
if (head !== published) {
  refuse(`Refusing to deploy ${head}. origin/main is ${published}. Push main first, then deploy that commit.`)
}
if (dirty) {
  refuse("Refusing to deploy with uncommitted changes.")
}

execFileSync("npx", ["vinext-cloudflare", "deploy"], { stdio: "inherit" })
