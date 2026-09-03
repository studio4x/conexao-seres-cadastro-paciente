import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const versionFile = resolve(projectRoot, "components/layout/AppVersion.tsx");
const versionPattern = /export const BUILD_VERSION = "(\d+)\.(\d+)\.(\d+)";/;

const isCi = ["1", "true"].includes(String(process.env.CI || "").toLowerCase());
const forceInCi = process.env.CONEXAO_SERES_BUMP_IN_CI === "1";

if (isCi && !forceInCi) {
  console.log("Build bump skipped because CI=true. Set CONEXAO_SERES_BUMP_IN_CI=1 to force it.");
  process.exit(0);
}

const source = readFileSync(versionFile, "utf8");
const match = source.match(versionPattern);

if (!match) {
  throw new Error(`Could not find BUILD_VERSION in ${versionFile}`);
}

const [, major, minor, patch] = match;
const currentVersion = `${major}.${minor}.${patch}`;
const nextVersion = `${major}.${minor}.${Number(patch) + 1}`;
const nextSource = source.replace(
  versionPattern,
  `export const BUILD_VERSION = "${nextVersion}";`,
);

writeFileSync(versionFile, nextSource, "utf8");
console.log(`Build version bumped: v${currentVersion} -> v${nextVersion}`);
