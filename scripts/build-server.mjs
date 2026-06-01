import { build } from "esbuild";

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  resolveExtensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
  outfile: "server-dist/index.js",
  sourcemap: true,
  packages: "external",
  logLevel: "info"
});
