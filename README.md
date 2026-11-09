# bdev

A simple CLI tool for Minecraft Bedrock Edition addon development.

---

## Features

- **TypeScript Compilation**: Bundles scripts with `esbuild`, keeping `@minecraft/*` modules external.
- **In-Game Hot Reload**: Built-in WebSocket server triggers `/reload` in your active Minecraft world on file save.
- **Live Sync**: Symlinks behavior and resource packs to Bedrock `development_*_packs` folders.
- **Manifest Management**: Generates and validates `manifest.json` files with v4 UUIDs.
- **Distribution Packaging**: Compresses packs into `.mcaddon` and `.mcpack` files.
- **Diagnostics**: Checks Node.js, npm, Bun, and `com.mojang` path detection.

---

## Installation

### Option 1: Via NPM (Recommended)

```bash
npm install -g bdev
```

Or run directly without installing:

```bash
npx bdev --help
```

### Option 2: Standalone Binary

Download the compiled binary from [GitHub Releases](https://github.com/Mafly/bdev/releases).

Binary naming format: `bdev-<version>-<os>-<arch>`

| Platform              | Binary                           |
| --------------------- | -------------------------------- |
| Windows (x64)         | `bdev-<version>-windows-x64.exe` |
| Linux (x64)           | `bdev-<version>-linux-x64`       |
| Linux (arm64)         | `bdev-<version>-linux-arm64`     |
| macOS (Apple Silicon) | `bdev-<version>-macos-arm64`     |
| macOS (Intel)         | `bdev-<version>-macos-x64`       |

On Linux/macOS:

```bash
chmod +x bdev-<version>-linux-x64
sudo mv bdev-<version>-linux-x64 /usr/local/bin/bdev
```

### Option 3: From Source (Bun)

```bash
git clone https://github.com/Mafly/bdev.git
cd bdev
bun install
bun run build
./bdev --help
```

---

## Quickstart

```bash
# 1. Create project
bdev init my-addon
cd my-addon

# 2. (Optional) Set com.mojang path if not detected automatically
bdev set-path "C:\Users\<user>\AppData\Local\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"

# 3. Start dev server
bdev dev
```

In your Minecraft world (Cheats Enabled):

```
/connect localhost:8000
```

Saving any script file will rebuild and trigger `/reload` in game.

<details>
<summary><b>Project Structure</b></summary>

```
my-addon/
├── behavior_pack/
│   ├── manifest.json
│   └── pack_icon.png
├── resource_pack/
│   ├── manifest.json
│   ├── pack_icon.png
│   └── texts/en_US.lang
├── src/
│   └── main.ts
├── bdev.json
├── package.json
├── tsconfig.json
└── .gitignore
```

</details>

---

## Command Reference

<details>
<summary><b>bdev init [directory]</b> — Scaffold project</summary>

```bash
bdev init my-addon [options]
```

| Flag                | Description                             | Default           |
| ------------------- | --------------------------------------- | ----------------- |
| `-n, --name <name>` | Project and pack name                   | Directory name    |
| `-d, --desc <desc>` | Description in manifest.json            | Addon description |
| `-p, --path <path>` | Save com.mojang path to bdev.json       | Auto-detected     |
| `--no-rp`           | Behavior pack only (skip resource pack) | Both packs        |
| `--lang <ts\|js>`   | Script language (`ts` or `js`)          | `ts`              |

</details>

<details>
<summary><b>bdev dev [directory]</b> — Live watch and Hot Reload</summary>

```bash
bdev dev [options]
```

Symlinks packs to `com.mojang`, starts WebSocket server, and watches for changes.

| Flag                | Description                      | Default                |
| ------------------- | -------------------------------- | ---------------------- |
| `-p, --path <path>` | Custom com.mojang directory path | Config / auto-detected |
| `-s, --save`        | Save `-p` path into `bdev.json`  | `false`                |
| `-P, --port <port>` | WebSocket port for `/connect`    | `8000`                 |
| `--no-ws`           | Disable WebSocket server         | Enabled                |
| `--no-link`         | Skip creating directory symlinks | Symlinked              |

</details>

<details>
<summary><b>bdev build [directory]</b> — Compile TypeScript</summary>

```bash
bdev build [options]
```

Bundles `src/**/*.ts` into `behavior_pack/scripts/main.js` and validates `manifest.json`.

| Flag             | Description               | Default            |
| ---------------- | ------------------------- | ------------------ |
| `-m, --minify`   | Minify bundled JavaScript | `false`            |
| `--no-sourcemap` | Disable sourcemap output  | Sourcemaps enabled |

</details>

<details>
<summary><b>bdev package [directory]</b> — Build and export archives</summary>

```bash
bdev package [options]
# alias: bdev deploy
```

Creates distribution packages inside `dist/`:

- `dist/<name>.mcaddon` (contains both BP and RP)
- `dist/<name>_BP.mcpack`
- `dist/<name>_RP.mcpack`

| Flag                 | Description      | Default      |
| -------------------- | ---------------- | ------------ |
| `-o, --output <dir>` | Output directory | `dist/`      |
| `-n, --name <name>`  | File name prefix | Project name |

</details>

<details>
<summary><b>bdev set-path & config</b> — Manage configuration</summary>

```bash
# Set Bedrock com.mojang path locally (bdev.json)
bdev set-path "C:\path\to\com.mojang"

# Set Bedrock path globally (~/.bdev/config.json)
bdev set-path "C:\path\to\com.mojang" -g

# View configuration
bdev config get
bdev config get mojangPath

# Set generic config key
bdev config set <key> <value> [-g]
```

</details>

<details>
<summary><b>bdev doctor</b> — Environment diagnostics</summary>

```bash
bdev doctor [-p <path>]
```

Verifies:

- Operating system platform
- Node.js runtime version
- npm package manager availability
- Bun runtime availability
- Minecraft Bedrock `com.mojang` path detection
  </details>

---

## License

[MIT](./LICENSE)
