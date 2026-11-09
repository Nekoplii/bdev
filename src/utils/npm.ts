const DEFAULT_FALLBACKS: Record<string, string> = {
  "@minecraft/server": "2.11.0",
  "@minecraft/server-ui": "2.3.0",
  "@minecraft/server-admin": "1.0.0-beta",
  "@minecraft/server-gametest": "1.0.0-beta",
  "@minecraft/server-net": "1.0.0-beta",
};

export async function fetchLatestNpmVersion(
  pkgName: string,
  fallback?: string
): Promise<string> {
  const defaultFallback = fallback || DEFAULT_FALLBACKS[pkgName] || "latest";
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { version?: string };
      if (data?.version) {
        return data.version;
      }
    }
  } catch {
    // Offline or network timeout, return fallback
  }
  return defaultFallback;
}

export async function resolveMinecraftDependencies(
  packages: string[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    packages.map(async (pkg) => {
      const ver = await fetchLatestNpmVersion(pkg);
      return [pkg, ver] as const;
    })
  );
  return Object.fromEntries(entries);
}
