import * as esbuildNative from "esbuild";
import * as esbuildWasm from "esbuild-wasm";

let wasmInitialized = false;

export async function runBuild(options: esbuildNative.BuildOptions): Promise<esbuildNative.BuildResult> {
  try {
    return await esbuildNative.build(options);
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    const message = typeof errorObj?.message === "string" ? errorObj.message : "";

    // If it's a code/syntax error from esbuild itself, rethrow directly
    if (Array.isArray(errorObj?.errors) && errorObj.errors.length > 0) {
      throw err;
    }

    // If missing native executable or module resolution in compiled binary, fallback to wasm
    const isBinaryResolutionError =
      message.includes("Cannot find module 'esbuild'") ||
      message.includes("could not be found") ||
      message.includes("cannot be bundled") ||
      message.includes("Failed to resolve entry for package");

    if (isBinaryResolutionError) {
      if (!wasmInitialized) {
        await esbuildWasm.initialize({});
        wasmInitialized = true;
      }
      return (await esbuildWasm.build(options as esbuildWasm.BuildOptions)) as unknown as esbuildNative.BuildResult;
    }

    throw err;
  }
}
