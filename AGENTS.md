# Project Conventions

## Package Manager
- Use `bun` (not pnpm, not npm)
- Workspace defined via `package.json` `workspaces` field (not pnpm-workspace.yaml)
- Lockfile: `bun.lock` (not pnpm-lock.yaml)

## Commands
| Action | Command |
|--------|---------|
| Install deps | `bun install` |
| Add dep | `bun add <pkg>` |
| Add dev dep | `bun add <pkg> --dev` |
| Run script | `bun run <script>` |
| Run in workspace | `bun run --filter <pkg> <script>` |
| Execute binary | `bun x <bin>` |

## Process Spawning
- Use `execa` (not `node:child_process` spawn/execSync)
- `execa(cmd, args, opts)` for async
- `execaSync(cmd, args, opts)` for sync

## Scripts
- `scripts/dev.ts` — development orchestrator (runs Vite, tsup watch, Electron)
- `scripts/check-deps.ts` — dependency check (auto-runs `bun install` if mismatch)
