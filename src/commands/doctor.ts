import { execSync } from "node:child_process";
import os from "node:os";
import pc from "picocolors";
import { findMojangPath } from "../utils/mojang.js";
import { logger } from "../utils/logger.js";

interface CheckItem {
  name: string;
  ok: boolean;
  details: string;
}

function checkCommand(cmd: string): string | null {
  try {
    const out = execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" });
    return out.trim();
  } catch {
    return null;
  }
}

export async function doctorCommand(customPath?: string): Promise<void> {
  console.log(pc.bold("\n Bedrock Dev (bdev) Environment Doctor\n"));

  const checks: CheckItem[] = [];

  // OS Info
  const platform = os.platform();
  const release = os.release();
  checks.push({
    name: "Operating System",
    ok: true,
    details: `${platform} (${release})`,
  });

  // Node.js
  const nodeVersion = process.version;
  checks.push({
    name: "Node.js Runtime",
    ok: Boolean(nodeVersion),
    details: nodeVersion || "Not found",
  });

  // npm
  const npmVersion = checkCommand("npm --version");
  checks.push({
    name: "npm Package Manager",
    ok: Boolean(npmVersion),
    details: npmVersion ? `v${npmVersion}` : "Not found in PATH",
  });

  // Bun
  const bunVersion = checkCommand("bun --version");
  checks.push({
    name: "Bun Runtime",
    ok: Boolean(bunVersion),
    details: bunVersion ? `v${bunVersion}` : "Not found in PATH (optional)",
  });

  // Minecraft Bedrock com.mojang folder
  const mojang = findMojangPath(customPath);
  if (mojang) {
    checks.push({
      name: "Minecraft Bedrock (com.mojang)",
      ok: true,
      details: `Found (${mojang.type}): ${mojang.root}`,
    });
  } else {
    checks.push({
      name: "Minecraft Bedrock (com.mojang)",
      ok: false,
      details: "Directory not found. Expected in Windows UWP LocalAppData or specify via BEDROCK_MOJANG_PATH",
    });
  }

  // Display results
  let allPassed = true;
  for (const item of checks) {
    const symbol = item.ok ? pc.green("✔") : pc.red("✖");
    const nameStr = pc.bold(item.name.padEnd(32));
    console.log(`  ${symbol} ${nameStr} ${item.details}`);
    if (!item.ok && item.name !== "Minecraft Bedrock (com.mojang)") {
      allPassed = false;
    }
  }

  console.log();

  if (!mojang) {
    logger.warn(
      "Notice: com.mojang was not detected automatically. If you develop on Windows or use a custom path, export BEDROCK_MOJANG_PATH='/path/to/com.mojang'."
    );
  }

  if (allPassed) {
    logger.success("Core development environment is ready!");
  } else {
    logger.warn("Some environment checks did not pass. Review the items marked with ✖ above.");
  }
  console.log();
}
