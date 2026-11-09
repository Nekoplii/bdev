import path from "node:path";
import fs from "node:fs";
import {
  loadGlobalConfig,
  loadLocalConfig,
  loadMergedConfig,
  saveConfig,
  getGlobalConfigPath,
  getLocalConfigPath,
  BDevConfig,
} from "../utils/config.js";
import { logger } from "../utils/logger.js";

export interface ConfigOptions {
  global?: boolean;
  dir?: string;
}

export async function setConfigCommand(
  key: string,
  value: string,
  options: ConfigOptions = {}
): Promise<void> {
  const normalizedKey = key === "path" || key === "mojang-path" ? "mojangPath" : key;

  if (normalizedKey === "mojangPath") {
    const resolved = path.resolve(value);
    if (!fs.existsSync(resolved)) {
      logger.warn(`Target path does not exist on disk: ${resolved}`);
    }
    value = resolved;
  }

  const updates: Partial<BDevConfig> = {
    [normalizedKey]: value,
  };

  const savedFile = saveConfig(updates, {
    global: options.global,
    dir: options.dir,
  });

  logger.success(`Set ${normalizedKey} = "${value}" in ${savedFile}`);
}

export async function getConfigCommand(
  key?: string,
  options: ConfigOptions = {}
): Promise<void> {
  const conf = options.global
    ? loadGlobalConfig()
    : loadMergedConfig(options.dir);

  if (key) {
    const normalizedKey = key === "path" || key === "mojang-path" ? "mojangPath" : key;
    const val = conf[normalizedKey];
    if (val !== undefined) {
      console.log(val);
    } else {
      logger.info(`Key '${key}' is not set.`);
    }
  } else {
    logger.info("Current configuration:");
    console.log(JSON.stringify(conf, null, 2));
    logger.info(`Local config file: ${getLocalConfigPath(options.dir)}`);
    logger.info(`Global config file: ${getGlobalConfigPath()}`);
  }
}

export async function setPathCommand(
  inputPath: string,
  options: ConfigOptions = {}
): Promise<void> {
  await setConfigCommand("mojangPath", inputPath, options);
}
