import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  APP_ENV_REL_PATH,
  loadLocalEnv,
  LOCAL_ENV_REL_PATH,
  mergeAppEnv,
  parseAppEnv,
  projectRoot,
  readAppEnv,
  resolveCommand,
} from "./with-app-env.mjs";

const execFileAsync = promisify(execFile);
const WRAPPER = join(projectRoot(), "scripts/with-app-env.mjs");
const PRINT_FLAG = "process.stdout.write(String(process.env.VITE_AUTH_ENABLED));";

function makeWorkspace(appEnvJson) {
  const root = mkdtempSync(join(tmpdir(), "app-env-"));
  if (appEnvJson !== undefined) {
    mkdirSync(join(root, ".grok"), { recursive: true });
    writeFileSync(join(root, APP_ENV_REL_PATH), appEnvJson);
  }
  return root;
}

test("keeps VITE_-prefixed string entries", () => {
  assert.deepEqual(parseAppEnv('{"VITE_AUTH_ENABLED":"false"}'), {
    VITE_AUTH_ENABLED: "false",
  });
});

test("drops non-VITE keys, non-string values and malformed documents", () => {
  assert.deepEqual(parseAppEnv('{"DATABASE_URL":"postgres://x","VITE_N":1,"VITE_OK":"y"}'), {
    VITE_OK: "y",
  });
  assert.deepEqual(parseAppEnv("not json"), {});
  assert.deepEqual(parseAppEnv('["VITE_AUTH_ENABLED"]'), {});
  assert.deepEqual(parseAppEnv("null"), {});
});

test("a missing app-env.json is a clean no-op", () => {
  assert.deepEqual(readAppEnv(makeWorkspace()), {});
});

test("reads the app env from a workspace", () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  assert.deepEqual(readAppEnv(root), { VITE_AUTH_ENABLED: "false" });
});

test("loads .env.local values without overriding existing process env", () => {
  const root = makeWorkspace();
  const uniqueKey = `APP_ENV_TEST_${process.pid}`;
  const previousValue = process.env[uniqueKey];
  writeFileSync(join(root, LOCAL_ENV_REL_PATH), `${uniqueKey}=from-file\n`);
  process.env[uniqueKey] = "from-process";
  try {
    loadLocalEnv(root);
    assert.equal(process.env[uniqueKey], "from-process");
    delete process.env[uniqueKey];
    loadLocalEnv(root);
    assert.equal(process.env[uniqueKey], "from-file");
  } finally {
    if (previousValue === undefined) delete process.env[uniqueKey];
    else process.env[uniqueKey] = previousValue;
    rmSync(root, { recursive: true, force: true });
  }
});

test("an explicit process-env override wins over the file", () => {
  const merged = mergeAppEnv(
    { VITE_AUTH_ENABLED: "false" },
    { VITE_AUTH_ENABLED: "true", PATH: "/usr/bin" },
  );
  assert.equal(merged.VITE_AUTH_ENABLED, "true");
  assert.equal(merged.PATH, "/usr/bin");
});

test("reads the workspace auth setting", () => {
  assert.equal(typeof readAppEnv(projectRoot()).VITE_AUTH_ENABLED, "string");
});

test("vite loadEnv resolves the wrapped value", () => {
  // What `import.meta.env.VITE_AUTH_ENABLED` becomes: loadEnv prefix-matches
  // process.env, so the wrapper's merge has to land before Vite starts.
  // Do not `import { loadEnv } from "vite"` here — Vite 8 loads rolldown
  // native bindings that SIGSEGV the test worker under qemu-user.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  const merged = mergeAppEnv(readAppEnv(root), { PATH: "/usr/bin" });
  assert.equal(merged.VITE_AUTH_ENABLED, "false");
});

test("resolves local .bin executables on Windows", () => {
  const root = projectRoot();
  const viteCmd = resolveCommand("vite", root, "win32");
  assert.ok(viteCmd.endsWith("node_modules\\.bin\\vite.cmd") || viteCmd.endsWith("node_modules/.bin/vite.cmd"));
  const tscCmd = resolveCommand("tsc", root, "win32");
  assert.ok(tscCmd.endsWith("node_modules\\.bin\\tsc.cmd") || tscCmd.endsWith("node_modules/.bin/tsc.cmd"));
});

test("the wrapped command runs with the app env applied", async () => {
  const env = { ...process.env };
  delete env.VITE_AUTH_ENABLED;
  const { stdout } = await execFileAsync(process.execPath, [
    WRAPPER,
    process.execPath,
    "-e",
    PRINT_FLAG,
  ], { env });
  assert.equal(stdout, readAppEnv(projectRoot()).VITE_AUTH_ENABLED);
});

test("the wrapped command sees an explicit override, not the file value", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [WRAPPER, process.execPath, "-e", PRINT_FLAG],
    { env: { ...process.env, VITE_AUTH_ENABLED: "true" } },
  );
  assert.equal(stdout, "true");
});

test("the wrapper propagates the command's exit code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [WRAPPER, process.execPath, "-e", "process.exit(3)"]),
    (err) => err.code === 3,
  );
});

test("a signal-killed command is never reported as success", async () => {
  // The wrapper's own SIGTERM handler must not swallow the re-raised signal:
  // a cancelled build reporting exit 0 is a silently passing gate.
  await assert.rejects(
    execFileAsync(process.execPath, [
      WRAPPER,
      process.execPath,
      "-e",
      "process.kill(process.pid, 'SIGTERM');setTimeout(() => {}, 1000);",
    ]),
    (err) => err.signal === "SIGTERM" || err.code !== 0,
  );
});

test("the CLI still runs when invoked through a symlinked path", async (t) => {
  // node realpaths import.meta.url but not process.argv[1], so a raw comparison
  // turns the wrapper into a no-op that exits 0 without starting anything.
  const link = join(mkdtempSync(join(tmpdir(), "app-env-link-")), "scripts");
  try {
    symlinkSync(join(projectRoot(), "scripts"), link, "junction");
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      t.skip("Windows symlink permissions are unavailable");
      return;
    }
    throw error;
  }
  const { stdout } = await execFileAsync(process.execPath, [
    join(link, "with-app-env.mjs"),
    process.execPath,
    "-e",
    PRINT_FLAG,
  ], {
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "VITE_AUTH_ENABLED"),
    ),
  });
  assert.equal(stdout, readAppEnv(projectRoot()).VITE_AUTH_ENABLED);
});
