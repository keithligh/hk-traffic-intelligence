import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "hktraffic",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-09-29",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      // The Worker itself, so the AI briefing can read each feed as a separate request
      // with its own subrequest and CPU limits.
      SELF: bindings.worker({ worker: "hktraffic" }),
    },
  }),
});
