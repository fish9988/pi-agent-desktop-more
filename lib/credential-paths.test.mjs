import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { fileSymlinkSkip } from "../scripts/test-platform.mjs";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { isCredentialPath } = await jiti.import("./credential-paths.ts");

test("isCredentialPath refuses home credential stores and allows project files", (t) => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-cred-paths-")));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  for (const relative of [
    ".ssh",
    ".ssh/id_ed25519",
    ".gnupg/secring.gpg",
    ".aws/credentials",
    ".azure/accessTokens.json",
    ".kube/config",
    ".docker/config.json",
    ".config/gcloud/credentials.db",
    ".config/gh/hosts.yml",
    ".password-store/work.gpg",
    ".netrc",
    ".git-credentials",
    ".pgpass",
    ".npmrc",
    ".pi/agent/auth.json",
  ]) {
    assert.equal(isCredentialPath(path.join(home, relative), home), true, relative);
  }

  for (const relative of [
    "work/app/.env",
    "work/app/README.md",
    ".sshrc",
    ".pi/agent/settings.json",
    ".docker/other.json",
  ]) {
    assert.equal(isCredentialPath(path.join(home, relative), home), false, relative);
  }

  if (process.platform === "darwin" || process.platform === "win32") {
    assert.equal(isCredentialPath(path.join(home, ".SSH", "id_ed25519"), home), true);
  }
});

test("isCredentialPath follows symlinks pointing into credential stores", { skip: fileSymlinkSkip }, (t) => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-cred-link-")));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const key = path.join(home, ".ssh", "id_ed25519");
  fs.mkdirSync(path.dirname(key), { recursive: true });
  fs.writeFileSync(key, "PRIVATE KEY");

  const link = path.join(home, "work", "innocent.txt");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(key, link);

  assert.equal(isCredentialPath(link, home), true);
});
