import esbuild from "esbuild";

const proxyUrl = process.env.AI_PROXY_URL || "";

esbuild
  .build({
    entryPoints: ["src/content.ts"],
    outfile: "dist/content.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2017"],
    define: {
      __AI_PROXY_URL__: JSON.stringify(proxyUrl),
    },
  })
  .catch(() => process.exit(1));
