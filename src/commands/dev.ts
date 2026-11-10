import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import pc from "picocolors";
import { buildCommand } from "./build.js";
import { findMojangPath, linkPack } from "../utils/mojang.js";
import { saveConfig } from "../utils/config.js";
import { BedrockHotReloadServer } from "../utils/wsserver.js";
import { logger } from "../utils/logger.js";
import { validateManifest, getLastManifestSyncTime } from "../utils/manifest.js";

export interface DevOptions {
  path?: string;
  link?: boolean;
  save?: boolean;
  port?: number;
  ws?: boolean;
}

export async function devCommand(
  dirArg?: string,
  options: DevOptions = {}
): Promise<void> {
  const rootDir = path.resolve(dirArg || ".");
  const bpDir = path.join(rootDir, "behavior_pack");
  const rpDir = path.join(rootDir, "resource_pack");
  const hasBp = fs.existsSync(bpDir);
  let hasRp = fs.existsSync(rpDir);

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
  const mojang = shouldLink ? findMojangPath(options.path, rootDir) : null;
  if (shouldLink) {
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

  // 3. Start WebSocket Hot Reload server
  const enableWs = options.ws !== false;
  let hotReloadServer: BedrockHotReloadServer | null = null;
  let wsPort = options.port ? Number(options.port) : 8000;

  if (enableWs) {
    try {
      hotReloadServer = new BedrockHotReloadServer(wsPort);
      wsPort = await hotReloadServer.start();
      console.log();
      logger.info(pc.bold(`Hot Reload WebSocket server active on ${pc.cyan(`ws://localhost:${wsPort}`)}`));
      logger.info(
        pc.yellow(`To connect in Minecraft (cheats on): ${pc.bold(`/connect localhost:${wsPort}`)}`)
      );
      console.log();
    } catch (err) {
      logger.error(`Failed to start WebSocket hot reload server: ${(err as Error).message}`);
    }
  }

  // 4. Start chokidar watcher
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
  const pkgJsonPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    watchPaths.push(pkgJsonPath);
  }

  logger.info(`Starting file watcher on: ${watchPaths.map((p) => path.relative(rootDir, p)).join(", ")}`);
  logger.info("Press Ctrl+C to stop.");

  let isRebuilding = false;
  let queuedFilePath: string | null = null;
  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastReloadTime = 0;
  const RELOAD_COOLDOWN_MS = 1200;
  const DEBOUNCE_MS = 350;

  const ignoredPatterns: (RegExp | string)[] = [
    /(^|[/\\])\../, // dotfiles
    /node_modules/,
    /dist/,
  ];

  if (fs.existsSync(srcDir)) {
    // Ignore entire scripts directory in behavior pack when compiling from src
    ignoredPatterns.push(/(^|[/\\])behavior_pack[/\\]scripts([/\\].*)?$/);
  } else {
    ignoredPatterns.push(/\.map$/);
  }

  const watcher = chokidar.watch(watchPaths, {
    ignored: ignoredPatterns,
    persistent: true,
    ignoreInitial: true,
  });

  const scheduleRebuild = (filePath: string) => {
    queuedFilePath = filePath;
    if (rebuildTimeout) {
      clearTimeout(rebuildTimeout);
    }
    rebuildTimeout = setTimeout(() => {
      rebuildTimeout = null;
      if (!isRebuilding && queuedFilePath) {
        const target = queuedFilePath;
        queuedFilePath = null;
        runRebuildCycle(target);
      }
    }, DEBOUNCE_MS);
  };

  const runRebuildCycle = async (triggerPath: string) => {
    isRebuilding = true;

    const rel = path.relative(rootDir, triggerPath);
    const isManifestRelated =
      triggerPath.endsWith("manifest.json") || triggerPath.endsWith("package.json");

    try {
      // If resource_pack was added while dev server is running
      if (!hasRp && fs.existsSync(rpDir)) {
        hasRp = true;
        watcher.add(rpDir);
        logger.info("Detected new Resource Pack. Watching resource_pack...");
        if (shouldLink && mojang) {
          const destRp = path.join(mojang.devResourcePacks, `${folderName}_RP`);
          try {
            linkPack(rpDir, destRp);
            logger.success(`Linked Resource Pack -> ${destRp}`);
          } catch (err) {
            logger.error(`Failed to link Resource Pack: ${(err as Error).message}`);
          }
        }
      }

      if (triggerPath.endsWith("manifest.json")) {
        const res = validateManifest(triggerPath);
        if (res.valid) {
          logger.success(`Validated ${rel}`);
        } else {
          logger.error(`Invalid manifest in ${rel}:`);
          res.errors.forEach((e) => console.error(`  - ${e}`));
        }
      }

      // Run build if src changed or if script output needed
      if (fs.existsSync(srcDir)) {
        const buildOk = await buildCommand(rootDir);
        if (buildOk && hotReloadServer) {
          if (hotReloadServer.clientCount > 0) {
            // Buffer 200ms before reload command so Proton/Wine file cache flushes
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Enforce reload cooldown so rapid saves cannot crash Minecraft scripting engine
            const elapsed = Date.now() - lastReloadTime;
            if (elapsed < RELOAD_COOLDOWN_MS) {
              await new Promise((resolve) =>
                setTimeout(resolve, RELOAD_COOLDOWN_MS - elapsed)
              );
            }

            hotReloadServer.reload();
            lastReloadTime = Date.now();
            logger.success("Sent /reload to Minecraft via WebSocket");
          } else {
            logger.info(
              `Hot reload skipped (no Minecraft client connected; run /connect localhost:${wsPort} in game)`
            );
          }
        }
      }

      if (isManifestRelated) {
        logger.warn(
          "Note: Minecraft /reload only reloads scripts. Re-enter world to apply manifest/package.json changes."
        );
      }
    } catch (err) {
      logger.error(`Error during rebuild: ${(err as Error).message}`);
    } finally {
      isRebuilding = false;
      if (queuedFilePath) {
        const nextTarget = queuedFilePath;
        queuedFilePath = null;
        scheduleRebuild(nextTarget);
      }
    }
  };

  const triggerRebuild = (filePath: string) => {
    // Ignore internal writes to manifest.json caused by syncManifestDependencies
    if (
      filePath.endsWith("manifest.json") &&
      Date.now() - getLastManifestSyncTime() < 600
    ) {
      return;
    }

    const rel = path.relative(rootDir, filePath);
    logger.info(`Change detected in ${rel}`);

    if (isRebuilding) {
      queuedFilePath = filePath;
      return;
    }

    scheduleRebuild(filePath);
  };

  watcher.on("change", triggerRebuild);
  watcher.on("add", triggerRebuild);
  watcher.on("unlink", triggerRebuild);

  // Handle graceful exit
  process.on("SIGINT", async () => {
    logger.info("Stopping dev server and watcher...");
    await watcher.close();
    if (hotReloadServer) {
      await hotReloadServer.stop();
    }
    process.exit(0);
  });
}
