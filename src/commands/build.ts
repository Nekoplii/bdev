import fs from "node:fs";
import path from "node:path";
import { runBuild } from "../utils/bundler.js";
import {
  validateManifest,
  syncManifestDependencies,
  addResourcePack,
} from "../utils/manifest.js";
import { logger } from "../utils/logger.js";

export interface BuildOptions {
  minify?: boolean;
  sourcemap?: boolean;
  watch?: boolean;
}

export async function buildCommand(
  dirArg?: string,
  options: BuildOptions = {}
): Promise<boolean> {
  const rootDir = path.resolve(dirArg || ".");
  const bpDir = path.join(rootDir, "behavior_pack");
  const bpManifestPath = path.join(bpDir, "manifest.json");

  // Sync @minecraft/* dependencies from package.json into manifest.json
  syncManifestDependencies(rootDir);

  // 1. Validate Behavior Pack Manifest
  if (!fs.existsSync(bpManifestPath)) {
    logger.error(`Behavior pack manifest not found: ${bpManifestPath}`);
    return false;
  }

  logger.info("Validating manifest.json files...");
  const bpValidation = validateManifest(bpManifestPath);
  if (!bpValidation.valid) {
    logger.error("Behavior pack manifest validation failed:");
    for (const err of bpValidation.errors) {
      console.error(`  - ${err}`);
    }
    return false;
  }
  logger.success("Behavior pack manifest valid");

  // Validate Resource Pack Manifest if exists
  const rpDir = path.join(rootDir, "resource_pack");
  const rpManifestPath = path.join(rpDir, "manifest.json");
  if (fs.existsSync(rpDir) && !fs.existsSync(rpManifestPath)) {
    logger.info("Found resource_pack folder without manifest. Initializing Resource Pack...");
    addResourcePack(rootDir);
  }

  if (fs.existsSync(rpManifestPath)) {
    const rpValidation = validateManifest(rpManifestPath);
    if (!rpValidation.valid) {
      logger.error("Resource pack manifest validation failed:");
      for (const err of rpValidation.errors) {
        console.error(`  - ${err}`);
      }
      return false;
    }
    logger.success("Resource pack manifest valid");
  }

  // 2. Determine if TypeScript compilation is needed
  const srcDir = path.join(rootDir, "src");
  if (!fs.existsSync(srcDir)) {
    logger.info("No 'src' directory found. Skipping script compilation.");
    return true;
  }

  // Find entry points
  let entryPoint = "";
  if (fs.existsSync(path.join(srcDir, "main.ts"))) {
    entryPoint = path.join(srcDir, "main.ts");
  } else if (fs.existsSync(path.join(srcDir, "index.ts"))) {
    entryPoint = path.join(srcDir, "index.ts");
  } else {
    // Look for any .ts file
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    if (files.length > 0) {
      entryPoint = path.join(srcDir, files[0]);
    }
  }

  if (!entryPoint) {
    logger.warn("No TypeScript entry point (.ts) found in 'src/'. Skipping bundling.");
    return true;
  }

  const outDir = path.join(bpDir, "scripts");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, "main.js");

  const spinner = logger.spinner(`Bundling ${path.relative(rootDir, entryPoint)} -> ${path.relative(rootDir, outFile)}...`);

  try {
    const startTime = Date.now();
    await runBuild({
      entryPoints: [entryPoint],
      outfile: outFile,
      bundle: true,
      format: "esm",
      target: "es2020",
      platform: "neutral",
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? true,
      external: [
        "@minecraft/*",
      ],
    });
    const duration = Date.now() - startTime;
    spinner.succeed(`Build succeeded in ${duration}ms (${path.relative(rootDir, outFile)})`);
    return true;
  } catch (err) {
    spinner.fail("Build failed");
    logger.error((err as Error).message);
    return false;
  }
}
