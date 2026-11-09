import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { buildCommand } from "./build.js";
import { findMojangPath, linkPack } from "../utils/mojang.js";
import { saveConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { validateManifest } from "../utils/manifest.js";

export interface DevOptions {
  path?: string;
  link?: boolean;
  save?: boolean;
}

export async function devCommand(
  dirArg?: string,
  options: DevOptions = {}
): Promise<void> {
  const rootDir = path.resolve(dirArg || ".");
  const bpDir = path.join(rootDir, "behavior_pack");
  const rpDir = path.join(rootDir, "resource_pack");
  const hasBp = fs.existsSync(bpDir);
  const hasRp = fs.existsSync(rpDir);

  if (!hasBp && !hasRp) {
    logger.error(`No behavior_pack or resource_pack found in ${rootDir}. Run 'bdev init' first.`);
    process.exit(1);
  }

  const folderName = path.basename(rootDir);

  // If --save and path provided, save to bdev.json
  if (options.save && options.path) {
    const resolvedPath = path.resolve(options.path);
    saveConfig({ mojangPath: resolvedPath }, { dir: rootDir });
    logger.success(`Saved mojang path to bdev.json: ${resolvedPath}`);
  }

  // 1. Initial build
  logger.info("Executing initial build...");
  const initialBuildOk = await buildCommand(rootDir);
  if (!initialBuildOk) {
    logger.warn("Initial build had warnings or errors. Continuing dev server...");
  }

  // 2. Setup symlinks to com.mojang
  const shouldLink = options.link !== false;
  if (shouldLink) {
    const mojang = findMojangPath(options.path, rootDir);
    if (!mojang) {
      logger.warn("Minecraft com.mojang directory not found.");
      logger.warn("Tip: Set with 'bdev set-path <path>' or pass '-p <path>' or 'BEDROCK_MOJANG_PATH'.");
      logger.warn("Continuing in watch-only mode (without symlinking).");
    } else {
      logger.info(`Found com.mojang location (${mojang.type}): ${mojang.root}`);

      if (hasBp) {
        const destBp = path.join(mojang.devBehaviorPacks, `${folderName}_BP`);
        try {
          linkPack(bpDir, destBp);
          logger.success(`Linked Behavior Pack -> ${destBp}`);
        } catch (err) {
          logger.error(`Failed to link Behavior Pack: ${(err as Error).message}`);
        }
      }

      if (hasRp) {
        const destRp = path.join(mojang.devResourcePacks, `${folderName}_RP`);
        try {
          linkPack(rpDir, destRp);
          logger.success(`Linked Resource Pack -> ${destRp}`);
        } catch (err) {
          logger.error(`Failed to link Resource Pack: ${(err as Error).message}`);
        }
      }
    }
  }

  // 3. Start chokidar watcher
  const watchPaths: string[] = [];
  const srcDir = path.join(rootDir, "src");
  if (fs.existsSync(srcDir)) {
    watchPaths.push(srcDir);
  }
  if (hasBp) {
    watchPaths.push(bpDir);
  }
  if (hasRp) {
    watchPaths.push(rpDir);
  }

  logger.info(`Starting file watcher on: ${watchPaths.map((p) => path.relative(rootDir, p)).join(", ")}`);
  logger.info("Press Ctrl+C to stop.");

  let isRebuilding = false;
  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(watchPaths, {
    ignored: [
      /(^|[/\\])\../, // dotfiles
      /node_modules/,
      /dist/,
      /behavior_pack[/\\]scripts[/\\]main\.js(\.map)?$/, // ignore build output
    ],
    persistent: true,
    ignoreInitial: true,
  });

  const triggerRebuild = (filePath: string) => {
    const rel = path.relative(rootDir, filePath);
    logger.info(`Change detected in ${rel}`);

    if (rebuildTimeout) {
      clearTimeout(rebuildTimeout);
    }

    rebuildTimeout = setTimeout(async () => {
      if (isRebuilding) return;
      isRebuilding = true;

      try {
        if (filePath.endsWith("manifest.json")) {
          const res = validateManifest(filePath);
          if (res.valid) {
            logger.success(`Validated ${rel}`);
          } else {
            logger.error(`Invalid manifest in ${rel}:`);
            res.errors.forEach((e) => console.error(`  - ${e}`));
          }
        }

        // Run build if src changed or if script output needed
        if (fs.existsSync(srcDir)) {
          await buildCommand(rootDir);
        }
      } catch (err) {
        logger.error(`Error during rebuild: ${(err as Error).message}`);
      } finally {
        isRebuilding = false;
      }
    }, 100);
  };

  watcher.on("change", triggerRebuild);
  watcher.on("add", triggerRebuild);
  watcher.on("unlink", triggerRebuild);

  // Handle graceful exit
  process.on("SIGINT", () => {
    logger.info("Stopping watcher...");
    watcher.close().then(() => {
      process.exit(0);
    });
  });
}
