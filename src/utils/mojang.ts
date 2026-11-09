import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMergedConfig } from "./config.js";
import { logger } from "./logger.js";

export interface MojangLocations {
  root: string;
  devBehaviorPacks: string;
  devResourcePacks: string;
  type: "retail" | "preview" | "custom" | "wsl" | "linux" | "config";
}

export function findMojangPath(
  customPath?: string,
  projectDir: string = process.cwd()
): MojangLocations | null {
  // 1. Direct custom CLI path argument
  if (customPath) {
    const resolved = path.resolve(customPath);
    if (fs.existsSync(resolved)) {
      return makeLocations(resolved, "custom");
    }
    return null;
  }

  // 2. Config file (local bdev.json or global ~/.bdev/config.json)
  const config = loadMergedConfig(projectDir);
  if (config.mojangPath && typeof config.mojangPath === "string") {
    const confPath = path.resolve(config.mojangPath);
    if (fs.existsSync(confPath)) {
      return makeLocations(confPath, "config");
    }
  }

  // 3. Environment variable
  if (process.env.BEDROCK_MOJANG_PATH) {
    const envPath = path.resolve(process.env.BEDROCK_MOJANG_PATH);
    if (fs.existsSync(envPath)) {
      return makeLocations(envPath, "custom");
    }
  }

  const platform = os.platform();

  if (platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), "AppData", "Local");

    // Modern Windows GDK Bedrock (Shared folder contains dev packs)
    const gdkShared = path.join(
      appData,
      "Minecraft Bedrock",
      "Users",
      "Shared",
      "games",
      "com.mojang"
    );
    if (fs.existsSync(gdkShared)) {
      return makeLocations(gdkShared, "retail");
    }

    const gdkPreviewShared = path.join(
      appData,
      "Minecraft Bedrock Preview",
      "Users",
      "Shared",
      "games",
      "com.mojang"
    );
    if (fs.existsSync(gdkPreviewShared)) {
      return makeLocations(gdkPreviewShared, "preview");
    }

    // Classic UWP Retail
    const retail = path.join(
      localAppData,
      "Packages",
      "Microsoft.MinecraftUWP_8wekyb3d8bbwe",
      "LocalState",
      "games",
      "com.mojang"
    );
    if (fs.existsSync(retail)) {
      return makeLocations(retail, "retail");
    }

    // Classic UWP Preview
    const preview = path.join(
      localAppData,
      "Packages",
      "Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe",
      "LocalState",
      "games",
      "com.mojang"
    );
    if (fs.existsSync(preview)) {
      return makeLocations(preview, "preview");
    }
  }

  // Check Linux / Bedrock-on-linux / Proton / WSL
  if (platform === "linux") {
    // 1. Bedrock-on-Linux (Proton / Wine)
    const bolBase = path.join(os.homedir(), ".local", "share", "bedrock-on-linux");
    if (fs.existsSync(bolBase)) {
      const profilesDir = path.join(bolBase, "profiles");
      if (fs.existsSync(profilesDir)) {
        try {
          const profiles = fs.readdirSync(profilesDir);
          for (const prof of profiles) {
            const sharedPfx = path.join(
              profilesDir,
              prof,
              "compatdata",
              "pfx",
              "drive_c",
              "users",
              "steamuser",
              "AppData",
              "Roaming",
              "Minecraft Bedrock",
              "Users",
              "Shared",
              "games",
              "com.mojang"
            );
            if (fs.existsSync(sharedPfx)) {
              return makeLocations(sharedPfx, "linux");
            }
          }
        } catch {
          // ignore profile read errors
        }
      }

      const defaultShared = path.join(
        bolBase,
        "compatdata",
        "pfx",
        "drive_c",
        "users",
        "steamuser",
        "AppData",
        "Roaming",
        "Minecraft Bedrock",
        "Users",
        "Shared",
        "games",
        "com.mojang"
      );
      if (fs.existsSync(defaultShared)) {
        return makeLocations(defaultShared, "linux");
      }
    }

    // 2. Check WSL
    try {
      const isWsl =
        Boolean(process.env.WSL_DISTRO_NAME) ||
        fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");

      if (isWsl) {
        const mntCUsers = "/mnt/c/Users";
        if (fs.existsSync(mntCUsers)) {
          const users = fs.readdirSync(mntCUsers);
          for (const u of users) {
            const gdk = path.join(
              mntCUsers,
              u,
              "AppData",
              "Roaming",
              "Minecraft Bedrock",
              "Users",
              "Shared",
              "games",
              "com.mojang"
            );
            if (fs.existsSync(gdk)) {
              return makeLocations(gdk, "wsl");
            }
            const retail = path.join(
              mntCUsers,
              u,
              "AppData",
              "Local",
              "Packages",
              "Microsoft.MinecraftUWP_8wekyb3d8bbwe",
              "LocalState",
              "games",
              "com.mojang"
            );
            if (fs.existsSync(retail)) {
              return makeLocations(retail, "wsl");
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }

    // 3. Native Linux mcpelauncher locations
    const linuxMcpelauncherPaths = [
      path.join(os.homedir(), ".var", "app", "io.mrarm.mcpelauncher", "data", "mcpelauncher", "games", "com.mojang"),
      path.join(os.homedir(), ".local", "share", "mcpelauncher", "games", "com.mojang"),
    ];

    for (const p of linuxMcpelauncherPaths) {
      if (fs.existsSync(p)) {
        return makeLocations(p, "linux");
      }
    }
  }

  return null;
}

function makeLocations(
  root: string,
  type: MojangLocations["type"]
): MojangLocations {
  // If pointing to a specific user XUID directory in Bedrock GDK (e.g. Users/<XUID>/games/com.mojang),
  // Bedrock GDK only scans packs from Users/Shared/games/com.mojang.
  let packsRoot = root;
  try {
    const sharedCandidate = path.resolve(root, "..", "..", "..", "Shared", "games", "com.mojang");
    if (fs.existsSync(sharedCandidate)) {
      packsRoot = sharedCandidate;
    }
  } catch {
    // Ignore resolution errors
  }

  return {
    root: packsRoot,
    devBehaviorPacks: path.join(packsRoot, "development_behavior_packs"),
    devResourcePacks: path.join(packsRoot, "development_resource_packs"),
    type,
  };
}

export function linkPack(sourceDir: string, destDir: string): void {
  const resolvedSource = path.resolve(sourceDir);
  const resolvedDest = path.resolve(destDir);

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source pack directory not found: ${resolvedSource}`);
  }

  // Ensure parent directory exists
  const parent = path.dirname(resolvedDest);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }

  if (fs.existsSync(resolvedDest) || isSymlink(resolvedDest)) {
    const stat = fs.lstatSync(resolvedDest);
    if (stat.isSymbolicLink()) {
      const currentTarget = path.resolve(
        path.dirname(resolvedDest),
        fs.readlinkSync(resolvedDest)
      );
      if (currentTarget === resolvedSource) {
        return; // Already linked
      }
      fs.unlinkSync(resolvedDest);
    } else {
      throw new Error(
        `Destination path exists and is not a symlink: ${resolvedDest}. Remove or rename it manually.`
      );
    }
  }

  const symlinkType = os.platform() === "win32" ? "junction" : "dir";
  fs.symlinkSync(resolvedSource, resolvedDest, symlinkType);
}

function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}
