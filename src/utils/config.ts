import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface BDevConfig {
  name?: string;
  mojangPath?: string;
  [key: string]: unknown;
}

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".bdev");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config.json");

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_PATH;
}

export function getLocalConfigPath(targetDir: string = process.cwd()): string {
  return path.join(path.resolve(targetDir), "bdev.json");
}

export function loadGlobalConfig(): BDevConfig {
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const raw = fs.readFileSync(GLOBAL_CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

export function loadLocalConfig(targetDir: string = process.cwd()): BDevConfig {
  try {
    const localPath = getLocalConfigPath(targetDir);
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

export function loadMergedConfig(targetDir: string = process.cwd()): BDevConfig {
  const globalConf = loadGlobalConfig();
  const localConf = loadLocalConfig(targetDir);
  return { ...globalConf, ...localConf };
}

export function saveConfig(
  updates: Partial<BDevConfig>,
  opts: { global?: boolean; dir?: string } = {}
): string {
  if (opts.global) {
    if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
      fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }
    const current = loadGlobalConfig();
    const merged = { ...current, ...updates };
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
    return GLOBAL_CONFIG_PATH;
  }

  const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const localPath = getLocalConfigPath(targetDir);
  const current = loadLocalConfig(targetDir);
  const merged = { ...current, ...updates };
  fs.writeFileSync(localPath, JSON.stringify(merged, null, 2) + "\n");
  return localPath;
}
