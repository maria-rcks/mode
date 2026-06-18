# Agent Notes

- Repo structure:
  Root repo owns Mode patches, docs, config, and `upstream.lock`.
  `.mode/t3code` is the upstream product worktree where product code is edited.
- Edit product code in `.mode/t3code`.
- "Upstream" means the `t3code` base tracked by `upstream.lock`; do not assume it means this repo root.
- When updating or rebasing upstream, do that in `.mode/t3code`, then export the result back to this repo.
- After edits there, run `pnpm mode export` from this repo.
- Commit Mode-owned files only: `patches/**`, `assets/**`, `scripts/**`, docs, config, and lock files.
- Verify product changes in `.mode/t3code` with `pnpm fmt`, `pnpm lint`, and `pnpm typecheck`.
- Use `pnpm run test` for tests.
- Keep commits atomic and use Conventional Commit style, like `fix(area): description`.
- Add deterministic tests for behavior changes; avoid external network access in tests.
