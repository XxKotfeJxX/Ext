import esbuild from "esbuild";

const proxyUrl = process.env.AI_PROXY_URL || "";

esbuild
  .build({
    entryPoints: {
      content: "src/content.ts",
      background: "src/background.ts",
    },
    outdir: "dist",
    entryNames: "[name]",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2017"],
    define: {
      __AI_PROXY_URL__: JSON.stringify(proxyUrl),
    },
  })
  .catch(() => process.exit(1));
