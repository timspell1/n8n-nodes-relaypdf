const { copyFileSync, mkdirSync, readdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

function copyDirAssets(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirAssets(from, to);
      continue;
    }
    if (entry.name.endsWith(".svg") || entry.name.endsWith(".json")) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}

copyDirAssets("credentials", "dist/credentials");
copyDirAssets("nodes", "dist/nodes");
