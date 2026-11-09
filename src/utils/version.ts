import fs from "node:fs";

declare const __BDEV_VERSION__: string | undefined;

export function getVersion(): string {
  if (typeof __BDEV_VERSION__ !== "undefined") {
    return __BDEV_VERSION__;
  }

  if (process.env.BDEV_VERSION) {
    return process.env.BDEV_VERSION;
  }

  try {
    const pkgUrl = new URL("../../package.json", import.meta.url);
    if (fs.existsSync(pkgUrl)) {
      const raw = fs.readFileSync(pkgUrl, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg.version) {
        return pkg.version;
      }
    }
  } catch {
    // Fallback
  }

  return "0.0.0-dev";
}
