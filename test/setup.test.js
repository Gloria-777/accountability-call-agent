import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("setup creates a token and never overwrites an existing .env", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "aca-setup-"));

  try {
    await mkdir(path.join(tempRoot, "scripts"));
    await copyFile(
      path.join(projectRoot, "scripts", "setup.js"),
      path.join(tempRoot, "scripts", "setup.js"),
    );
    await writeFile(
      path.join(tempRoot, ".env.example"),
      "ADMIN_TOKEN=\nTARGET_PHONE_NUMBER=\n",
    );

    const setupScript = path.join(tempRoot, "scripts", "setup.js");
    await execFileAsync(process.execPath, [setupScript]);
    const firstEnv = await readFile(path.join(tempRoot, ".env"), "utf8");
    assert.match(firstEnv, /^ADMIN_TOKEN=[a-f0-9]{48}$/m);

    await assert.rejects(execFileAsync(process.execPath, [setupScript]));
    const secondEnv = await readFile(path.join(tempRoot, ".env"), "utf8");
    assert.equal(secondEnv, firstEnv);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
