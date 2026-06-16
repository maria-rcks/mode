import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chdir, cwd, exit } from "node:process";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = readJson("mode.config.json");
const lock = readJson("upstream.lock");
const checkout = resolve(root, config.upstream.worktree);
const patchesDir = resolve(root, config.patches.dir);
const seriesPath = resolve(root, config.patches.series);
const exportDir = resolve(root, config.patches.exportDir);

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    if (options.quiet) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`${command} ${args.join(" ")} failed`);
  }

  if (typeof result.stdout !== "string") return "";
  return options.trim === false ? result.stdout : result.stdout.trim();
}

function git(args, options = {}) {
  return run("git", args, options);
}

function pnpm(args, options = {}) {
  return run("pnpm", args, options);
}

function checkoutExists() {
  return existsSync(join(checkout, ".git"));
}

function worktreeStatus() {
  if (!checkoutExists()) return "";
  return git(["status", "--porcelain"], { cwd: checkout, quiet: true });
}

function assertCleanCheckout() {
  const status = worktreeStatus();
  if (status) {
    throw new Error(`Generated checkout is dirty:\n${status}\nCommit/export changes or rerun with a clean .mode/t3code.`);
  }
}

function seriesEntries() {
  if (!existsSync(seriesPath)) return [];
  return readFileSync(seriesPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function setup() {
  mkdirSync(dirname(checkout), { recursive: true });

  if (!checkoutExists()) {
    git(["clone", config.upstream.repo, checkout]);
  } else {
    assertCleanCheckout();
    git(["fetch", "origin"], { cwd: checkout });
  }

  fetchUpstreamRef();
  ensureLockedCommitAvailable();
  git(["switch", "-C", config.upstream.branch, lock.commit], { cwd: checkout });
  console.log(`Prepared ${relative(root, checkout)} at ${lock.commit}.`);
}

function fetchUpstreamRef() {
  git(["fetch", "origin", config.upstream.ref], { cwd: checkout });
}

function ensureLockedCommitAvailable() {
  try {
    git(["rev-parse", "--verify", `${lock.commit}^{commit}`], { cwd: checkout, quiet: true });
    return;
  } catch {
    try {
      fetchUpstreamRef();
    } catch {
      // Fall back to the local seed below when network fetch is unavailable.
    }
  }

  try {
    git(["rev-parse", "--verify", `${lock.commit}^{commit}`], { cwd: checkout, quiet: true });
    return;
  } catch {
    if (config.upstream.localSeed && existsSync(config.upstream.localSeed)) {
      git(["fetch", config.upstream.localSeed, "HEAD"], { cwd: checkout });
      git(["rev-parse", "--verify", `${lock.commit}^{commit}`], { cwd: checkout, quiet: true });
      return;
    }
  }

  throw new Error(`Upstream commit is not available in the generated checkout: ${lock.commit}`);
}

function applyPatchStack() {
  if (!checkoutExists()) setup();

  assertCleanCheckout();
  ensureLockedCommitAvailable();
  git(["switch", "-C", config.upstream.branch, lock.commit], { cwd: checkout });

  const entries = seriesEntries();
  if (entries.length === 0) {
    console.log("No patches listed in patches/series.");
    return;
  }

  for (const entry of entries) {
    const patchPath = join(patchesDir, entry);
    if (!existsSync(patchPath)) throw new Error(`Patch listed in series does not exist: ${entry}`);
    const patchText = readFileSync(patchPath, "utf8");
    if (patchText.startsWith("From ")) {
      git(["-c", "user.name=Mode Bot", "-c", "user.email=mode-bot@example.invalid", "am", "--3way", "--keep-cr", patchPath], { cwd: checkout });
    } else {
      git(["apply", "--index", "--3way", patchPath], { cwd: checkout });
      git(
        [
          "-c",
          "user.name=Mode Bot",
          "-c",
          "user.email=mode-bot@example.invalid",
          "commit",
          "-m",
          `mode: apply ${entry}`,
        ],
        { cwd: checkout },
      );
    }
  }

  console.log(`Applied ${entries.length} patch${entries.length === 1 ? "" : "es"}.`);
}

function exportPatchStack() {
  if (!checkoutExists()) throw new Error("Missing .mode/t3code. Run pnpm mode setup first.");

  const status = worktreeStatus();
  const commitCount = Number(git(["rev-list", "--count", `${lock.commit}..HEAD`], { cwd: checkout, quiet: true }));

  rmSync(exportDir, { recursive: true, force: true });
  mkdirSync(exportDir, { recursive: true });

  let exported = [];

  if (commitCount > 0) {
    if (status) {
      throw new Error("Generated checkout has commits and dirty changes. Commit or stash dirty changes before exporting.");
    }

    git(["format-patch", "--binary", "--output-directory", exportDir, `${lock.commit}..HEAD`], {
      cwd: checkout,
    });
    exported = listPatchFiles();
  } else if (status) {
    const patchName = "0001-mode-worktree.patch";
    const patchPath = join(exportDir, patchName);
    const diff = git(["diff", "--binary", "--full-index"], { cwd: checkout, quiet: true, trim: false });
    writeFileSync(patchPath, diff);
    exported = [relative(patchesDir, patchPath)];
  }

  writeFileSync(
    seriesPath,
    ["# Mode patches applied on top of T3 Code.", "# Add patch paths relative to patches/, one per line.", "", ...exported, ""].join("\n"),
  );

  if (exported.length === 0) {
    console.log("No generated checkout changes to export.");
  } else {
    console.log(`Exported ${exported.length} patch${exported.length === 1 ? "" : "es"} to ${relative(root, exportDir)}.`);
  }
}

function listPatchFiles() {
  const output = git(["-C", root, "ls-files", "--others", "--cached", "--modified", "--exclude-standard", config.patches.exportDir], {
    quiet: true,
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".patch"))
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .sort()
    .map((line) => relative(patchesDir, resolve(root, line)));
}

function status() {
  console.log(`Mode root: ${root}`);
  console.log(`Upstream: ${lock.repo} ${lock.ref} ${lock.commit}`);
  console.log(`Checkout: ${checkoutExists() ? relative(root, checkout) : "missing"}`);
  console.log(`Series entries: ${seriesEntries().length}`);

  if (checkoutExists()) {
    const head = git(["rev-parse", "--short", "HEAD"], { cwd: checkout, quiet: true });
    console.log(`Checkout HEAD: ${head}`);
    const dirty = worktreeStatus();
    console.log(dirty ? `Checkout dirty:\n${dirty}` : "Checkout clean.");
  }
}

function check() {
  if (!checkoutExists()) throw new Error("Missing .mode/t3code. Run pnpm mode setup first.");
  pnpm(["fmt"], { cwd: checkout });
  pnpm(["lint"], { cwd: checkout });
  pnpm(["typecheck"], { cwd: checkout });
}

function dev() {
  if (!checkoutExists()) throw new Error("Missing .mode/t3code. Run pnpm mode setup first.");
  chdir(checkout);
  pnpm(["dev"], { cwd: cwd() });
}

const command = process.argv[2] ?? "help";

try {
  switch (command) {
    case "setup":
      setup();
      break;
    case "apply":
      applyPatchStack();
      break;
    case "export":
      exportPatchStack();
      break;
    case "status":
      status();
      break;
    case "check":
      check();
      break;
    case "dev":
      dev();
      break;
    default:
      console.log("usage: pnpm mode <setup|apply|export|status|check|dev>");
      break;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
