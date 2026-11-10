import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4, validate as validateUuid } from "uuid";
import { logger } from "./logger.js";

export const DEFAULT_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export interface ManifestHeader {
  name: string;
  description: string;
  uuid: string;
  version: [number, number, number];
  min_engine_version?: [number, number, number];
}

export interface ManifestModule {
  type: "data" | "script" | "resources" | "client_data" | string;
  uuid: string;
  version: [number, number, number];
  language?: string;
  entry?: string;
  description?: string;
}

export interface ManifestDependency {
  uuid?: string;
  version?: [number, number, number] | string;
  module_name?: string;
}

export interface BedrockManifest {
  format_version: number;
  header: ManifestHeader;
  modules: ManifestModule[];
  dependencies?: ManifestDependency[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(manifestPath: string): ValidationResult {
  const errors: string[] = [];

  if (!fs.existsSync(manifestPath)) {
    return { valid: false, errors: [`File not found: ${manifestPath}`] };
  }

  let raw: BedrockManifest;
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    return {
      valid: false,
      errors: [`Invalid JSON in ${manifestPath}: ${(err as Error).message}`],
    };
  }

  if (raw.format_version !== 2) {
    errors.push(`'format_version' should be 2 (found ${raw.format_version})`);
  }

  if (!raw.header) {
    errors.push("Missing 'header' object");
    return { valid: false, errors };
  }

  if (!raw.header.name || typeof raw.header.name !== "string") {
    errors.push("Missing or invalid 'header.name'");
  }

  if (!raw.header.uuid || !validateUuid(raw.header.uuid)) {
    errors.push(`Invalid 'header.uuid': ${raw.header.uuid}`);
  }

  if (!Array.isArray(raw.header.version) || raw.header.version.length !== 3) {
    errors.push("'header.version' must be [major, minor, patch] array");
  }

  const seenUuids = new Set<string>();
  if (raw.header.uuid) {
    seenUuids.add(raw.header.uuid.toLowerCase());
  }

  if (!Array.isArray(raw.modules) || raw.modules.length === 0) {
    errors.push("'modules' array must contain at least one module");
  } else {
    raw.modules.forEach((mod, idx) => {
      if (!mod.type) {
        errors.push(`Module[${idx}]: missing 'type'`);
      }
      if (!mod.uuid || !validateUuid(mod.uuid)) {
        errors.push(`Module[${idx}]: invalid 'uuid': ${mod.uuid}`);
      } else {
        const lowerUuid = mod.uuid.toLowerCase();
        if (seenUuids.has(lowerUuid)) {
          errors.push(`Duplicate UUID in manifest: ${mod.uuid}`);
        }
        seenUuids.add(lowerUuid);
      }
      if (!Array.isArray(mod.version) || mod.version.length !== 3) {
        errors.push(`Module[${idx}]: 'version' must be [major, minor, patch]`);
      }
      if (mod.type === "script") {
        if (!mod.entry) {
          errors.push(`Script module[${idx}]: missing 'entry' script path`);
        }
        if (mod.language && mod.language !== "javascript") {
          errors.push(`Script module[${idx}]: language should be 'javascript'`);
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateManifests(opts: {
  name: string;
  description: string;
  hasScript: boolean;
  hasRp: boolean;
  minEngineVersion?: [number, number, number];
  serverVersion?: string;
}): { bpManifest: BedrockManifest; rpManifest?: BedrockManifest } {
  const minEngineVersion = opts.minEngineVersion || [1, 21, 0];
  const bpHeaderUuid = uuidv4();
  const bpDataModuleUuid = uuidv4();
  const bpScriptModuleUuid = uuidv4();
  const rpHeaderUuid = uuidv4();
  const rpModuleUuid = uuidv4();

  const bpModules: ManifestModule[] = [
    {
      type: "data",
      uuid: bpDataModuleUuid,
      version: [1, 0, 0],
    },
  ];

  if (opts.hasScript) {
    bpModules.push({
      description: "Script Resources",
      language: "javascript",
      type: "script",
      uuid: bpScriptModuleUuid,
      version: [1, 0, 0],
      entry: "scripts/main.js",
    });
  }

  const bpDependencies: ManifestDependency[] = [];

  if (opts.hasScript) {
    bpDependencies.push({
      module_name: "@minecraft/server",
      version: opts.serverVersion || "2.11.0",
    });
  }

  if (opts.hasRp) {
    bpDependencies.push({
      uuid: rpHeaderUuid,
      version: [1, 0, 0],
    });
  }

  const bpManifest: BedrockManifest = {
    format_version: 2,
    header: {
      name: `${opts.name} (BP)`,
      description: opts.description || `${opts.name} Behavior Pack`,
      uuid: bpHeaderUuid,
      version: [1, 0, 0],
      min_engine_version: minEngineVersion,
    },
    modules: bpModules,
    dependencies: bpDependencies,
  };

  let rpManifest: BedrockManifest | undefined;
  if (opts.hasRp) {
    rpManifest = {
      format_version: 2,
      header: {
        name: `${opts.name} (RP)`,
        description: opts.description || `${opts.name} Resource Pack`,
        uuid: rpHeaderUuid,
        version: [1, 0, 0],
        min_engine_version: minEngineVersion,
      },
      modules: [
        {
          description: "Resource Pack Modules",
          type: "resources",
          uuid: rpModuleUuid,
          version: [1, 0, 0],
        },
      ],
    };
  }

  return { bpManifest, rpManifest };
}

export interface AddResourcePackOptions {
  name?: string;
  description?: string;
}

export function addResourcePack(
  rootDir: string,
  options: AddResourcePackOptions = {}
): boolean {
  const bpDir = path.join(rootDir, "behavior_pack");
  const bpManifestPath = path.join(bpDir, "manifest.json");

  if (!fs.existsSync(bpManifestPath)) {
    logger.error(`Behavior pack manifest not found in ${rootDir}. Run 'bdev init' first.`);
    return false;
  }

  const rpDir = path.join(rootDir, "resource_pack");
  const rpManifestPath = path.join(rpDir, "manifest.json");

  let bpManifest: BedrockManifest;
  try {
    bpManifest = JSON.parse(fs.readFileSync(bpManifestPath, "utf-8"));
  } catch (err) {
    logger.error(`Failed to parse ${bpManifestPath}: ${(err as Error).message}`);
    return false;
  }

  if (fs.existsSync(rpManifestPath)) {
    try {
      const rpManifest = JSON.parse(fs.readFileSync(rpManifestPath, "utf-8"));
      const rpUuid = rpManifest?.header?.uuid;
      if (rpUuid) {
        if (!Array.isArray(bpManifest.dependencies)) {
          bpManifest.dependencies = [];
        }
        const hasDep = bpManifest.dependencies.some(
          (d) => d.uuid?.toLowerCase() === rpUuid.toLowerCase()
        );
        if (!hasDep) {
          bpManifest.dependencies.push({
            uuid: rpUuid,
            version: rpManifest.header?.version || [1, 0, 0],
          });
          fs.writeFileSync(bpManifestPath, JSON.stringify(bpManifest, null, 2) + "\n");
          logger.success("Linked existing Resource Pack to Behavior Pack manifest.");
          return true;
        }
      }
    } catch {
      // ignore
    }
    logger.warn("Resource pack already exists in this project.");
    return false;
  }

  let projectName = options.name;
  let projectDesc = options.description;

  const pkgJsonPath = path.join(rootDir, "package.json");
  if ((!projectName || !projectDesc) && fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (!projectName && pkg.name) projectName = pkg.name;
      if (!projectDesc && pkg.description) projectDesc = pkg.description;
    } catch {
      // ignore
    }
  }

  if (!projectName) {
    projectName = (bpManifest.header?.name || path.basename(rootDir)).replace(/\s*\(BP\)$/i, "");
  }
  if (!projectDesc) {
    projectDesc = bpManifest.header?.description || `${projectName} Resource Pack`;
  }

  const minEngineVersion = bpManifest.header?.min_engine_version || [1, 21, 0];
  const rpHeaderUuid = uuidv4();
  const rpModuleUuid = uuidv4();

  const rpManifest: BedrockManifest = {
    format_version: 2,
    header: {
      name: `${projectName} (RP)`,
      description: projectDesc,
      uuid: rpHeaderUuid,
      version: [1, 0, 0],
      min_engine_version: minEngineVersion,
    },
    modules: [
      {
        description: "Resource Pack Modules",
        type: "resources",
        uuid: rpModuleUuid,
        version: [1, 0, 0],
      },
    ],
  };

  fs.mkdirSync(rpDir, { recursive: true });
  fs.writeFileSync(rpManifestPath, JSON.stringify(rpManifest, null, 2) + "\n");

  const bpIconPath = path.join(bpDir, "pack_icon.png");
  const rpIconPath = path.join(rpDir, "pack_icon.png");
  if (fs.existsSync(bpIconPath)) {
    fs.copyFileSync(bpIconPath, rpIconPath);
  } else {
    fs.writeFileSync(rpIconPath, Buffer.from(DEFAULT_ICON_BASE64, "base64"));
  }

  const textsDir = path.join(rpDir, "texts");
  fs.mkdirSync(textsDir, { recursive: true });
  fs.writeFileSync(
    path.join(textsDir, "en_US.lang"),
    `pack.name=${projectName}\npack.description=${projectDesc}\n`
  );

  if (!Array.isArray(bpManifest.dependencies)) {
    bpManifest.dependencies = [];
  }
  const existingRpIndex = bpManifest.dependencies.findIndex((d) => d.uuid && !d.module_name);
  if (existingRpIndex !== -1) {
    bpManifest.dependencies[existingRpIndex] = {
      uuid: rpHeaderUuid,
      version: [1, 0, 0],
    };
  } else {
    bpManifest.dependencies.push({
      uuid: rpHeaderUuid,
      version: [1, 0, 0],
    });
  }
  fs.writeFileSync(bpManifestPath, JSON.stringify(bpManifest, null, 2) + "\n");

  logger.success(`Resource Pack created and linked to Behavior Pack at ${rpDir}`);
  return true;
}

let lastManifestSyncTime = 0;

export function getLastManifestSyncTime(): number {
  return lastManifestSyncTime;
}

export function syncManifestDependencies(rootDir: string): boolean {
  const pkgPath = path.join(rootDir, "package.json");
  const bpManifestPath = path.join(rootDir, "behavior_pack", "manifest.json");

  if (!fs.existsSync(pkgPath) || !fs.existsSync(bpManifestPath)) {
    return false;
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  let bpManifest: BedrockManifest;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    bpManifest = JSON.parse(fs.readFileSync(bpManifestPath, "utf-8"));
  } catch {
    return false;
  }

  const targetDeps = new Map<string, string>();
  if (pkg.devDependencies && typeof pkg.devDependencies === "object") {
    for (const [name, ver] of Object.entries(pkg.devDependencies)) {
      if (name.startsWith("@minecraft/") && typeof ver === "string") {
        targetDeps.set(name, ver.replace(/^[~^>=v\s]+/, ""));
      }
    }
  }
  if (pkg.dependencies && typeof pkg.dependencies === "object") {
    for (const [name, ver] of Object.entries(pkg.dependencies)) {
      if (name.startsWith("@minecraft/") && typeof ver === "string") {
        targetDeps.set(name, ver.replace(/^[~^>=v\s]+/, ""));
      }
    }
  }

  if (!Array.isArray(bpManifest.dependencies)) {
    bpManifest.dependencies = [];
  }

  let modified = false;
  const updatedModules: string[] = [];

  // 1. Update existing @minecraft/* entries or prune removed ones
  const toRemoveIndices: number[] = [];
  bpManifest.dependencies.forEach((dep, idx) => {
    if (dep.module_name && dep.module_name.startsWith("@minecraft/")) {
      const targetVer = targetDeps.get(dep.module_name);
      if (targetVer) {
        if (dep.version !== targetVer) {
          dep.version = targetVer;
          modified = true;
          updatedModules.push(`${dep.module_name}@${targetVer}`);
        }
      } else if (dep.module_name !== "@minecraft/server") {
        // Removed from package.json
        toRemoveIndices.push(idx);
        modified = true;
        updatedModules.push(`-${dep.module_name}`);
      }
    }
  });

  if (toRemoveIndices.length > 0) {
    bpManifest.dependencies = bpManifest.dependencies.filter(
      (_, idx) => !toRemoveIndices.includes(idx)
    );
  }

  // 2. Add new @minecraft/* dependencies from package.json that are missing in manifest
  for (const [name, ver] of targetDeps.entries()) {
    const exists = bpManifest.dependencies.some((d) => d.module_name === name);
    if (!exists) {
      bpManifest.dependencies.push({
        module_name: name,
        version: ver,
      });
      modified = true;
      updatedModules.push(`+${name}@${ver}`);
    }
  }

  // 3. Link resource pack if exists and not linked
  const rpManifestPath = path.join(rootDir, "resource_pack", "manifest.json");
  if (fs.existsSync(rpManifestPath)) {
    try {
      const rpManifest = JSON.parse(fs.readFileSync(rpManifestPath, "utf-8"));
      const rpUuid = rpManifest?.header?.uuid;
      if (rpUuid) {
        const hasRpDep = bpManifest.dependencies.some(
          (d) => d.uuid && d.uuid.toLowerCase() === rpUuid.toLowerCase()
        );
        if (!hasRpDep) {
          const staleRpIndex = bpManifest.dependencies.findIndex(
            (d) => d.uuid && !d.module_name
          );
          if (staleRpIndex !== -1) {
            bpManifest.dependencies[staleRpIndex] = {
              uuid: rpUuid,
              version: rpManifest.header?.version || [1, 0, 0],
            };
          } else {
            bpManifest.dependencies.push({
              uuid: rpUuid,
              version: rpManifest.header?.version || [1, 0, 0],
            });
          }
          modified = true;
          updatedModules.push(`linked RP (${rpUuid.slice(0, 8)}...)`);
        }
      }
    } catch {
      // ignore
    }
  }

  if (modified) {
    lastManifestSyncTime = Date.now();
    fs.writeFileSync(bpManifestPath, JSON.stringify(bpManifest, null, 2) + "\n");
    logger.success(`Synchronized manifest.json dependencies: ${updatedModules.join(", ")}`);
    return true;
  }

  return false;
}
