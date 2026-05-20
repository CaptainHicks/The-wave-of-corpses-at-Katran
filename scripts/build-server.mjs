import { build } from "esbuild";

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "server-dist/index.js",
  sourcemap: true,
  packages: "external",
  logLevel: "info"
});
