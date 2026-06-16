<h1 align="center">M.O.D.E.</h1>

<p align="center"><strong>Maria's Opinionated Development Environment</strong></p>

M.O.D.E. is a minimal patch-stack workspace for shaping T3 Code into Maria's preferred development environment.

## Use

```sh
pnpm install
pnpm mode setup
pnpm mode apply
pnpm mode dev
```

## Work

Edit product code in `.mode/t3code`, then export changes back here:

```sh
pnpm mode export
```

Mode-owned files live in `patches/`, `assets/`, `scripts/`, docs, and config.
