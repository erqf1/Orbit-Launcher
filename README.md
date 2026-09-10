# Orbit Launcher

A custom Minecraft: Java Edition launcher built from scratch with Electron, React, and TypeScript - not a fork or reskin of an existing launcher.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

## Features

- **Multi-instance management** - create, clone, and import as many separate instances as you want, each with its own mods, worlds, settings, and Java/memory configuration.
- **Mod loaders**: Fabric, Quilt, Legacy Fabric, Forge, and NeoForge.
- **Modrinth integration** - search and install mods/resource packs/shader packs directly, a curated list of popular performance/QoL mods, mod-update checking, and mod-file legitimacy verification.
- **Import existing setups** - bring in instances from Prism Launcher, the official Minecraft Launcher, a `.mrpack`/CurseForge zip, or any manually-picked folder.
- **Hosted servers** - run a Vanilla, Fabric, or Paper server directly from the launcher, reachable by friends with no port-forwarding via a built-in [playit.gg](https://playit.gg) tunnel, plus a friends'-mods export so joiners know exactly what to install.
- **Accounts** - multiple Microsoft accounts with a quick switcher, persistent login, and full skin/cape management (upload, fetch by username, history, native cape equipping).
- **Crash diagnosis** - detects common launch failures (out of memory, a Java version mismatch, a missing required mod dependency) and offers a one-click, confirm-before-applying fix.
- **9 languages** - English, German, Turkish, Russian, Polish, French, Spanish, Italian, and Greek.

## Download

Grab the latest Windows or Linux build from the [Releases page](https://github.com/YOUR_GITHUB_USERNAME/orbit-launcher/releases/latest).

## Building from source

Requires Node.js and npm.

```bash
npm install
npx install-electron   # downloads the Electron binary - required once after every fresh install
npm run dev             # run in development mode
```

To build an installable package for your platform:

```bash
npm run dist:win     # Windows NSIS installer
npm run dist:linux   # Linux AppImage + .deb
```

## License

Licensed under the [Apache License 2.0](LICENSE).
