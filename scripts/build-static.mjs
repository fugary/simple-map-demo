import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");

const entriesToCopy = [
  "index.html",
  "baidu-map",
  "google-map",
  "amap-map",
  "shared",
];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const entry of entriesToCopy) {
  const source = resolve(rootDir, entry);
  const target = resolve(distDir, entry);

  if (!existsSync(source)) {
    throw new Error(`Missing build input: ${entry}`);
  }

  if (entry.includes(".")) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    continue;
  }

  cpSync(source, target, { recursive: true });
}

console.log(`Static assets copied to ${distDir}`);
