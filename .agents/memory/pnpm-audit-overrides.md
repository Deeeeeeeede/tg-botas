---
name: pnpm audit CVE overrides
description: How pnpm audit interacts with overrides — which override location is visible to the auditor
---

# pnpm audit and override locations

## The rule
Security overrides that need to be picked up by `pnpm audit` MUST be in `package.json` → `pnpm.overrides`, not `pnpm-workspace.yaml` → `overrides:`.

**Why:** `pnpm audit` reads from the lockfile. Only `pnpm.overrides` in the root `package.json` get written into the lockfile's `overrides:` section. `pnpm-workspace.yaml` overrides ARE applied to node_modules at install time (so the actual installed binaries are safe), but they are NOT recorded in the lockfile, so `pnpm audit` still sees the old vulnerable version in the lockfile and flags it.

**How to apply:** When adding a security fix override, always put it in `package.json` → `pnpm.overrides`. Then run `pnpm install` — the lockfile will update and `pnpm audit` will stop flagging it.

## Current override split (as of 2026-06-16)
- `package.json` pnpm.overrides: `vite>picomatch >=4.0.4`, `esbuild 0.28.1`, `js-yaml >=4.2.0`
- `pnpm-workspace.yaml` overrides: all the rest (path-to-regexp, qs, fast-uri, brace-expansion, yaml, postcss, markdown-it, @babel/core, platform binary exclusions)

## Residual unfixable CVEs (2 remaining, dev-only)
- lodash 4.x via `recharts` in mockup-sandbox — no patched 4.x exists; lodash 5.x breaks recharts@2. Accepted risk (dev canvas tool, not in production bot).
