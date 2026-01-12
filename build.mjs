import esbuild from "esbuild";
import { promises as fs } from "fs";
import path from "path";

const proxyUrl = process.env.AI_PROXY_URL || "";
const staticFiles = ["style.css", "popup.html", "popup.js", "popup.css"];

const targets = [
  {
    name: "chrome",
    manifest: "manifest.chrome.json",
    outdir: path.join("dist", "chrome"),
  },
  {
    name: "firefox",
    manifest: "manifest.firefox.json",
    outdir: path.join("dist", "firefox"),
  },
];

async function copyFile(file, outdir) {
  await fs.copyFile(file, path.join(outdir, path.basename(file)));
}

async function buildTarget(target) {
  await fs.mkdir(target.outdir, { recursive: true });

  await esbuild.build({
    entryPoints: {
      content: "src/content.ts",
      background: "src/background.ts",
    },
    outdir: target.outdir,
    entryNames: "[name]",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2017"],
    define: {
      __AI_PROXY_URL__: JSON.stringify(proxyUrl),
    },
  });

  await Promise.all(staticFiles.map((file) => copyFile(file, target.outdir)));
  await fs.copyFile(
    target.manifest,
    path.join(target.outdir, "manifest.json")
  );
}

for (const target of targets) {
  await buildTarget(target);
}
