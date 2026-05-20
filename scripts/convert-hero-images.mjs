import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const assetRoot = path.join(projectRoot, "public", "assets");
const textRoots = [path.join(projectRoot, "src"), path.join(projectRoot, "index.html")];

const conversions = collectRasterAssets(assetRoot).map((sourcePath) => ({
  sourcePath,
  targetPath: sourcePath.replace(/\.(png|jpe?g)$/i, ".v1.webp"),
  ...getEncodingProfile(path.relative(assetRoot, sourcePath).replaceAll("\\", "/"))
}));

for (const conversion of conversions) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      conversion.sourcePath,
      "-vcodec",
      "libwebp",
      "-compression_level",
      "6",
      "-quality",
      String(conversion.quality),
      "-preset",
      conversion.preset,
      "-pix_fmt",
      "yuva420p",
      conversion.targetPath
    ],
    {
      cwd: projectRoot,
      stdio: "inherit"
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

rewriteAssetReferences();

function collectRasterAssets(rootDir) {
  const queue = [rootDir];
  const files = [];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!/\.(png|jpe?g)$/i.test(entry.name)) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function getEncodingProfile(relativeAssetPath) {
  if (relativeAssetPath.startsWith("menu/")) {
    return {
      quality: relativeAssetPath.includes("title-logo") ? 86 : 84,
      preset: "picture"
    };
  }

  if (relativeAssetPath.startsWith("hud/") || relativeAssetPath.startsWith("board/numbers/")) {
    return {
      quality: 88,
      preset: "icon"
    };
  }

  return {
    quality: 84,
    preset: "picture"
  };
}

function rewriteAssetReferences() {
  const files = collectTextFiles(textRoots);
  let updatedFiles = 0;

  for (const filePath of files) {
    const originalText = readFileSync(filePath, "utf8");
    const nextText = originalText.replace(/\/assets\/[^"'`\s)]+\.(png|jpe?g)/gi, (match) =>
      match.replace(/\.(png|jpe?g)$/i, ".v1.webp")
    );

    if (nextText === originalText) {
      continue;
    }

    writeFileSync(filePath, nextText);
    updatedFiles += 1;
  }

  console.log(`Updated asset references in ${updatedFiles} source files.`);
}

function collectTextFiles(roots) {
  const files = [];

  for (const root of roots) {
    if (!statSync(root).isDirectory()) {
      files.push(root);
      continue;
    }

    const queue = [root];
    while (queue.length > 0) {
      const currentDir = queue.pop();
      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        if (!/\.(css|js|jsx|ts|tsx)$/i.test(entry.name)) {
          continue;
        }

        files.push(fullPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}
