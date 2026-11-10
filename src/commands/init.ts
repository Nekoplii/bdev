import fs from "node:fs";
import path from "node:path";
import {
  generateManifests,
  addResourcePack,
  DEFAULT_ICON_BASE64,
} from "../utils/manifest.js";
import { saveConfig } from "../utils/config.js";
import { resolveMinecraftDependencies } from "../utils/npm.js";
import { logger } from "../utils/logger.js";

export interface InitOptions {
  name?: string;
  desc?: string;
  rp: boolean;
  lang: "ts" | "js";
  path?: string;
}

export async function initCommand(
  targetDirArg: string | undefined,
  options: InitOptions
): Promise<void> {
  const targetDir = path.resolve(targetDirArg || ".");
  const projectName = options.name || path.basename(targetDir) || "my-bedrock-addon";
  const projectDesc = options.desc || `${projectName} - Bedrock Addon created with bdev`;
  const isTs = options.lang !== "js";
  const hasRp = options.rp !== false;

  const existingBpManifest = path.join(targetDir, "behavior_pack", "manifest.json");
  if (fs.existsSync(existingBpManifest)) {
    if (hasRp) {
      const existingRpManifest = path.join(targetDir, "resource_pack", "manifest.json");
      if (!fs.existsSync(existingRpManifest)) {
        logger.info("Existing Behavior Pack project detected without Resource Pack.");
        addResourcePack(targetDir, { name: projectName, description: projectDesc });
        return;
      } else {
        logger.warn("Project already initialized with Behavior Pack and Resource Pack.");
        return;
      }
    } else {
      logger.warn("Project is already initialized.");
      return;
    }
  }

  logger.info(`Scaffolding Bedrock Addon project: ${projectName}`);
  logger.info(`Directory: ${targetDir}`);
  logger.info(`Language: ${isTs ? "TypeScript" : "JavaScript"} | Resource Pack: ${hasRp ? "Yes" : "No"}`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const spinner = logger.spinner("Fetching latest @minecraft/* versions from npm...");
  const mcVersions = await resolveMinecraftDependencies([
    "@minecraft/server",
    "@minecraft/server-ui",
  ]);
  const serverVersion = mcVersions["@minecraft/server"] || "2.11.0";
  const serverUiVersion = mcVersions["@minecraft/server-ui"] || "2.3.0";
  spinner.succeed(
    `Resolved dependencies: @minecraft/server@${serverVersion}, @minecraft/server-ui@${serverUiVersion}`
  );

  const { bpManifest, rpManifest } = generateManifests({
    name: projectName,
    description: projectDesc,
    hasScript: true,
    hasRp,
    minEngineVersion: [1, 21, 0],
    serverVersion,
  });

  // 1. Behavior Pack
  const bpDir = path.join(targetDir, "behavior_pack");
  fs.mkdirSync(bpDir, { recursive: true });
  fs.writeFileSync(
    path.join(bpDir, "manifest.json"),
    JSON.stringify(bpManifest, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(bpDir, "pack_icon.png"),
    Buffer.from(DEFAULT_ICON_BASE64, "base64")
  );

  // 2. Resource Pack (if enabled)
  if (hasRp && rpManifest) {
    const rpDir = path.join(targetDir, "resource_pack");
    fs.mkdirSync(rpDir, { recursive: true });
    fs.writeFileSync(
      path.join(rpDir, "manifest.json"),
      JSON.stringify(rpManifest, null, 2) + "\n"
    );
    fs.writeFileSync(
      path.join(rpDir, "pack_icon.png"),
      Buffer.from(DEFAULT_ICON_BASE64, "base64")
    );

    const textsDir = path.join(rpDir, "texts");
    fs.mkdirSync(textsDir, { recursive: true });
    fs.writeFileSync(
      path.join(textsDir, "en_US.lang"),
      `pack.name=${projectName}\npack.description=${projectDesc}\n`
    );
  }

  // 3. Scripts / Source code
  const starterCodeTs = `import { world, type Player } from "@minecraft/server";

world.afterEvents.playerSpawn.subscribe((e) => {
  const player: Player = e.player;
  player.sendMessage("Welcome!");
});
`;

  const starterCodeJs = `import { world } from "@minecraft/server";

world.afterEvents.playerSpawn.subscribe((e) => {
  const player = e.player;
  player.sendMessage("Welcome!");
});
`;

  if (isTs) {
    const srcDir = path.join(targetDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "main.ts"), starterCodeTs);

    // tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["src/**/*"],
    };
    fs.writeFileSync(
      path.join(targetDir, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2) + "\n"
    );
  } else {
    const scriptsDir = path.join(bpDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "main.js"), starterCodeJs);
  }

  // 4. package.json
  const pkgJson: Record<string, unknown> = {
    name: projectName.toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
    version: "1.0.0",
    description: projectDesc,
    type: "module",
    scripts: {
      build: "bdev build",
      dev: "bdev dev",
      package: "bdev package",
    },
    dependencies: {
      "@minecraft/server": serverVersion,
      "@minecraft/server-ui": serverUiVersion,
    },
  };

  if (isTs) {
    pkgJson.devDependencies = {
      "@types/node": "^22.0.0",
      typescript: "^5.0.0",
    };
  }

  fs.writeFileSync(
    path.join(targetDir, "package.json"),
    JSON.stringify(pkgJson, null, 2) + "\n"
  );

  // 5. bdev.json config
  saveConfig(
    {
      name: projectName,
      mojangPath: options.path ? path.resolve(options.path) : undefined,
    },
    { dir: targetDir }
  );

  // 6. Comprehensive .gitignore
  const gitignoreLines = [
    "# Dependencies",
    "node_modules/",
    "",
    "# Build outputs",
    "dist/",
  ];

  if (isTs) {
    gitignoreLines.push("behavior_pack/scripts/");
  }

  gitignoreLines.push(
    "",
    "# bdev cache & local configs",
    ".bdev/",
    "*.local.json",
    "",
    "# Logs",
    "*.log",
    "npm-debug.log*",
    "yarn-debug.log*",
    "yarn-error.log*",
    "",
    "# OS files",
    ".DS_Store",
    ".DS_Store?",
    "._*",
    ".Spotlight-V100",
    ".Trashes",
    "ehthumbs.db",
    "Thumbs.db",
    "",
    "# Editor files",
    ".vscode/",
    ".idea/"
  );

  fs.writeFileSync(
    path.join(targetDir, ".gitignore"),
    gitignoreLines.join("\n") + "\n"
  );

  // 7. README.md
  const readmeContent = `# ${projectName}

${projectDesc}

## Development

Run development watcher (auto builds, symlinks, and starts WebSocket hot reload):
\`\`\`bash
bdev dev
\`\`\`

In your Minecraft world (cheats enabled), connect the game to bdev hot reload:
\`\`\`
/connect localhost:8000
\`\`\`
Whenever you save script files, bdev will automatically execute \`/reload\` in game.

To configure your \`com.mojang\` Bedrock directory:
\`\`\`bash
bdev set-path "C:\\path\\to\\com.mojang"
# or
bdev dev -p "C:\\path\\to\\com.mojang"
\`\`\`

## Build & Package

Compile scripts and validate manifest:
\`\`\`bash
bdev build
\`\`\`

Bundle into \`.mcaddon\` and \`.mcpack\` for distribution:
\`\`\`bash
bdev package
\`\`\`
`;

  fs.writeFileSync(path.join(targetDir, "README.md"), readmeContent);

  logger.success(`Project initialized successfully at ${targetDir}`);
  if (options.path) {
    logger.success(`Configured com.mojang path: ${path.resolve(options.path)}`);
  }
  logger.info("Run: cd " + (targetDirArg || ".") + " && bdev dev");
}
