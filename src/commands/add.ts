import path from "node:path";
import { addResourcePack } from "../utils/manifest.js";
import { logger } from "../utils/logger.js";

export interface AddOptions {
  name?: string;
  desc?: string;
}

export async function addCommand(
  component: string,
  dirArg?: string,
  options: AddOptions = {}
): Promise<void> {
  const rootDir = path.resolve(dirArg || ".");
  const normalized = component.toLowerCase().replace(/[-_]/g, "");

  if (normalized === "rp" || normalized === "resourcepack") {
    addResourcePack(rootDir, {
      name: options.name,
      description: options.desc,
    });
  } else {
    logger.error(
      `Unknown component: '${component}'. Available components: 'rp' (resource-pack)`
    );
    process.exit(1);
  }
}
