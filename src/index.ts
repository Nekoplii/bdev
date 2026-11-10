#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { buildCommand } from "./commands/build.js";
import { devCommand } from "./commands/dev.js";
import { packageCommand } from "./commands/package.js";
import { doctorCommand } from "./commands/doctor.js";
import {
  setConfigCommand,
  getConfigCommand,
  setPathCommand,
} from "./commands/config.js";
import { getVersion } from "./utils/version.js";

const program = new Command();

program
  .name("bdev")
  .description("Modern CLI tool for Minecraft Bedrock Edition Addon development")
  .version(getVersion());

program
  .command("init [directory]")
  .description("Scaffold a new Bedrock addon project")
  .option("-n, --name <name>", "Project / pack name")
  .option("-d, --desc <description>", "Pack description")
  .option("-p, --path <path>", "Custom com.mojang path to save in bdev.json")
  .option("--no-rp", "Scaffold Behavior Pack only (skip Resource Pack)")
  .option("--lang <lang>", "Script language: ts or js", "ts")
  .action(async (directory, options) => {
    try {
      await initCommand(directory, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("add <component> [directory]")
  .description("Add components (e.g. 'rp' or 'resource-pack') to an existing addon project")
  .option("-n, --name <name>", "Pack name")
  .option("-d, --desc <description>", "Pack description")
  .action(async (component, directory, options) => {
    try {
      await addCommand(component, directory, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("build [directory]")
  .description("Compile TypeScript scripts and validate manifests")
  .option("-m, --minify", "Minify bundled JavaScript")
  .option("--no-sourcemap", "Disable sourcemap generation")
  .action(async (directory, options) => {
    try {
      const ok = await buildCommand(directory, options);
      if (!ok) process.exit(1);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("dev [directory]")
  .description("Symlink packs to com.mojang, start hot-reload WebSocket, and watch for changes")
  .option("-p, --path <path>", "Custom com.mojang directory path")
  .option("-s, --save", "Save custom path to bdev.json for future use")
  .option("-P, --port <port>", "WebSocket server port for Minecraft hot reload", "8000")
  .option("--no-ws", "Disable WebSocket hot reload server")
  .option("--no-link", "Skip creating symlinks to development directories")
  .action(async (directory, options) => {
    try {
      await devCommand(directory, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("package [directory]")
  .alias("deploy")
  .description("Build and compress packs into .mcaddon and .mcpack files")
  .option("-o, --output <dir>", "Output directory for packages", "dist")
  .option("-n, --name <name>", "Package file name prefix")
  .action(async (directory, options) => {
    try {
      await packageCommand(directory, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("set-path <path>")
  .alias("path")
  .description("Set com.mojang Bedrock path in configuration")
  .option("-g, --global", "Save path globally in ~/.bdev/config.json")
  .action(async (pathInput, options) => {
    try {
      await setPathCommand(pathInput, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

const configCmd = program
  .command("config")
  .description("Manage bdev configuration");

configCmd
  .command("set <key> <value>")
  .description("Set configuration key (e.g. mojangPath /path/to/com.mojang)")
  .option("-g, --global", "Set globally in ~/.bdev/config.json")
  .action(async (key, value, options) => {
    try {
      await setConfigCommand(key, value, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

configCmd
  .command("get [key]")
  .description("Get configuration key or list all")
  .option("-g, --global", "Get from ~/.bdev/config.json only")
  .action(async (key, options) => {
    try {
      await getConfigCommand(key, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

configCmd
  .command("path <path>")
  .description("Set com.mojang directory path")
  .option("-g, --global", "Set globally in ~/.bdev/config.json")
  .action(async (pathInput, options) => {
    try {
      await setPathCommand(pathInput, options);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Verify environment requirements and Bedrock paths")
  .option("-p, --path <path>", "Custom com.mojang path to check")
  .action(async (options) => {
    try {
      await doctorCommand(options.path);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parse();
