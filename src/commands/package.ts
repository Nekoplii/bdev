import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { buildCommand } from "./build.js";
import { logger } from "../utils/logger.js";

export interface PackageOptions {
  output?: string;
  name?: string;
}

function archiveDirectory(
  sourceDir: string,
  destZipPath: string,
  prefix: string = ""
): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      resolve(archive.pointer());
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    archive.directory(sourceDir, prefix || false);
    archive.finalize();
  });
}

function archiveMultiple(
  entries: Array<{ dir: string; prefix: string }>,
  destZipPath: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      resolve(archive.pointer());
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    for (const entry of entries) {
      archive.directory(entry.dir, entry.prefix);
    }

    archive.finalize();
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function packageCommand(
  dirArg?: string,
  options: PackageOptions = {}
): Promise<void> {
  const rootDir = path.resolve(dirArg || ".");
  const bpDir = path.join(rootDir, "behavior_pack");
  const rpDir = path.join(rootDir, "resource_pack");
  const hasBp = fs.existsSync(bpDir);
  const hasRp = fs.existsSync(rpDir);

  if (!hasBp && !hasRp) {
    logger.error(`No behavior_pack or resource_pack found in ${rootDir}.`);
    process.exit(1);
  }

  logger.info("Building project before packaging...");
  const buildOk = await buildCommand(rootDir);
  if (!buildOk) {
    logger.error("Build failed. Aborting package.");
    process.exit(1);
  }

  const outDir = options.output
    ? path.resolve(rootDir, options.output)
    : path.join(rootDir, "dist");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const baseName = options.name || path.basename(rootDir);

  const spinner = logger.spinner("Packaging Bedrock Addon...");

  try {
    const generatedFiles: Array<{ path: string; size: number }> = [];

    // Package BP if present
    if (hasBp) {
      const bpZipPath = path.join(outDir, `${baseName}_BP.mcpack`);
      const size = await archiveDirectory(bpDir, bpZipPath);
      generatedFiles.push({ path: bpZipPath, size });
    }

    // Package RP if present
    if (hasRp) {
      const rpZipPath = path.join(outDir, `${baseName}_RP.mcpack`);
      const size = await archiveDirectory(rpDir, rpZipPath);
      generatedFiles.push({ path: rpZipPath, size });
    }

    // If both exist, package into .mcaddon
    if (hasBp && hasRp) {
      const mcaddonPath = path.join(outDir, `${baseName}.mcaddon`);
      const size = await archiveMultiple(
        [
          { dir: bpDir, prefix: `${baseName}_BP` },
          { dir: rpDir, prefix: `${baseName}_RP` },
        ],
        mcaddonPath
      );
      generatedFiles.push({ path: mcaddonPath, size });
    }

    spinner.succeed("Packaging complete!");
    logger.info("Generated distribution packages:");
    for (const f of generatedFiles) {
      logger.success(`  ${path.relative(rootDir, f.path)} (${formatBytes(f.size)})`);
    }
  } catch (err) {
    spinner.fail("Packaging failed");
    logger.error((err as Error).message);
    process.exit(1);
  }
}
