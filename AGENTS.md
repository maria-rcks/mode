# Agent Notes

- Edit product code in `.mode/t3code`.
- After edits there, run `pnpm mode export` from this repo.
- Commit Mode-owned files only: `patches/**`, `assets/**`, `scripts/**`, docs, config, and lock files.
- Verify product changes in `.mode/t3code` with `pnpm fmt`, `pnpm lint`, and `pnpm typecheck`.
- Use `pnpm run test` for tests.
- Keep commits atomic and use Conventional Commit style, like `fix(area): description`.
- Add deterministic tests for behavior changes; avoid external network access in tests.
