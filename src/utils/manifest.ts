import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4, validate as validateUuid } from "uuid";

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
      version: opts.serverVersion || "1.16.0",
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
