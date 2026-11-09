import fs from "node:fs";
import path from "node:path";
import { generateManifests } from "../utils/manifest.js";
import { saveConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";

const DEFAULT_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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

  logger.info(`Scaffolding Bedrock Addon project: ${projectName}`);
  logger.info(`Directory: ${targetDir}`);
  logger.info(`Language: ${isTs ? "TypeScript" : "JavaScript"} | Resource Pack: ${hasRp ? "Yes" : "No"}`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const { bpManifest, rpManifest } = generateManifests({
    name: projectName,
    description: projectDesc,
    hasScript: true,
    hasRp,
    minEngineVersion: [1, 21, 0],
    serverVersion: "1.16.0",
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
  const starterCode = `import { world, system } from "@minecraft/server";

world.afterEvents.worldInitialize.subscribe(() => {
  world.sendMessage("Hello from ${projectName}!");
});

let ticks = 0;
system.runInterval(() => {
  ticks++;
  if (ticks % 100 === 0) {
    // Periodic tick logic
  }
}, 20);
`;

  if (isTs) {
    const srcDir = path.join(targetDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "main.ts"), starterCode);

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
    fs.writeFileSync(path.join(scriptsDir, "main.js"), starterCode);
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
      "@minecraft/server": "1.16.0",
      "@minecraft/server-ui": "1.7.0",
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

Run development watcher (auto builds and syncs with Bedrock):
\`\`\`bash
bdev dev
\`\`\`

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
