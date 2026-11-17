#!/usr/bin/env node
/**
 * PHOLY account/community acceptance on an isolated native staging instance.
 * Run as the PHOLY service account. Never run against production: hard guards require
 * loopback port 2299, a pholy_suite_test_* database and a separate CIFS directory named
 * pholy-suite-test-*. Three synthetic accounts (including one temporary administrator)
 * are created and removed. Existing accounts and media are never modified.
 *
 * Required environment variables:
 * PHOLY_TEST_ENV_PATH      private systemd-format staging environment file
 * PHOLY_TEST_CONFIG_PATH   staging JSON with SMTP pointed at 127.0.0.1:25261
 * PHOLY_TEST_SERVER_PATH   compiled server directory with installed dependencies
 * Optional PHOLY_TEST_API_URL defaults to http://127.0.0.1:2299/api/.
 *
 * The built-in SMTP sink only accepts this invocation's exact synthetic addresses.
 * It never forwards mail, writes messages to disk, or prints tokens/passwords.
 * Original data and ZIP contents stay in memory. No backups are created.
 * Root deployment orchestration must remove the isolated database/Redis namespace
 * after stopping the staging instance, even if a process is forcibly terminated.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  rmdir,
  statfs,
} from "node:fs/promises";
import { createServer } from "node:net";
import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const started = Date.now();
const runId = randomUUID();
const CHUNK_SIZE = 8 * 1024 ** 2;
const API = new URL(
  process.env.PHOLY_TEST_API_URL || "http://127.0.0.1:2299/api/",
);
const SMTP_PORT = 25261;
const configPath = process.env.PHOLY_TEST_CONFIG_PATH;
const serverPath = resolve(
  process.env.PHOLY_TEST_SERVER_PATH ||
    "/var/www/vhosts/pholy.de/pholy-runtime/current/server",
);
const envPath = process.env.PHOLY_TEST_ENV_PATH;
const cancellation = new AbortController();
const accounts = [0, 1, 2].map((index) => ({
  isAdmin: index === 2,
  id: randomUUID(),
  groupId: randomUUID(),
  email: `pholy-suite-test-${runId}-${index}@example.invalid`,
  name: `PHOLY synthetic suite test ${runId} ${index}`,
  groupName: `PHOLY synthetic suite test ${runId} ${index}`,
  password: randomBytes(32).toString("base64url"),
  token: undefined,
  eligible: false,
  assetIds: new Set(),
  sessionIds: new Set(),
}));
let sql;
let mediaRoot;
let sharp;
let phase = "initialization";
let assertionFailure;
let cleanupFailure;
let failureReported = false;

class TestFailure extends Error {
  constructor(code, facts = {}) {
    super(code);
    this.code = code;
    this.facts = facts;
  }
}

function assert(condition, code, facts) {
  if (!condition) throw new TestFailure(code, facts);
}

function log(scenario, status, facts = {}) {
  process.stdout.write(
    `${JSON.stringify({ scenario, status, elapsedMs: Date.now() - started, ...facts })}\n`,
  );
}

function safeError(error) {
  if (error instanceof TestFailure) return { code: error.code, ...error.facts };
  return {
    code:
      typeof error?.code === "string" && /^[A-Z0-9_]{1,48}$/.test(error.code)
        ? error.code
        : "UNEXPECTED_FAILURE",
    type:
      typeof error?.name === "string" && /^[A-Za-z]{1,40}$/.test(error.name)
        ? error.name
        : "Error",
  };
}

function parseEnvironmentFile(source) {
  // systemd EnvironmentFile does not treat an inline # as a comment and does
  // not expand variables. In particular, do not use dotenv or source a shell.
  const env = Object.create(null);
  for (const line of source.replace(/\\\r?\n/g, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";"))
      continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(trimmed);
    assert(match, "UNSUPPORTED_ENVIRONMENT_FILE_SYNTAX");
    let value = match[2].trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      assert(
        value.length >= 2 && value.at(-1) === quote,
        "UNSUPPORTED_ENVIRONMENT_FILE_SYNTAX",
      );
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\(["\\$`])/g, "$1");
    } else {
      value = value.replace(/\\(.)/g, "$1");
    }
    env[match[1]] = value;
  }
  return env;
}

async function scenario(name, action) {
  phase = name;
  cancellation.signal.throwIfAborted();
  const at = Date.now();
  const facts = await action();
  log(name, "pass", { durationMs: Date.now() - at, ...facts });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!cancellation.signal.aborted)
      log("interruption", "received", { signal });
    cancellation.abort(new TestFailure("INTERRUPTED"));
  });
}

async function readBounded(response, limit) {
  const chunks = [];
  let size = 0;
  if (!response.body) return Buffer.alloc(0);
  for await (const value of response.body) {
    size += value.byteLength;
    assert(size <= limit, "RESPONSE_TOO_LARGE", {
      httpStatus: response.status,
    });
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function request(account, path, options = {}) {
  const {
    method = "GET",
    json,
    body,
    headers = {},
    expect = [200],
    cleanup = false,
    binary = false,
    raw = false,
  } = options;
  const signal = cleanup
    ? AbortSignal.timeout(25_000)
    : AbortSignal.any([cancellation.signal, AbortSignal.timeout(150_000)]);
  let response;
  // Busy requests have not acquired a session lock. These operations are replay-safe.
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(new URL(path, API), {
      method,
      redirect: "error",
      signal,
      headers: {
        ...(account?.token ? { Authorization: `Bearer ${account.token}` } : {}),
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    if (response.status !== 503 || expect.includes(503) || attempt === 4) break;
    await response.body?.cancel();
    await delay(500 * (attempt + 1), undefined, { signal });
  }
  const bytes = await readBounded(
    response,
    binary || raw ? 64 * 1024 ** 2 : 1024 * 1024,
  );
  assert(expect.includes(response.status), "UNEXPECTED_HTTP_STATUS", {
    method,
    httpStatus: response.status,
    expectedStatus: expect,
  });
  if (raw) return { bytes, headers: response.headers, status: response.status };
  if (binary) return bytes;
  if (!bytes.length) return undefined;
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new TestFailure("NON_JSON_RESPONSE", { httpStatus: response.status });
  }
}

async function login(account, cleanup = false) {
  const response = await request(undefined, "auth/login", {
    method: "POST",
    json: { email: account.email, password: account.password },
    expect: [200, 201],
    cleanup,
  });
  assert(
    response?.userId === account.id && typeof response.accessToken === "string",
    "INVALID_LOGIN_RESULT",
  );
  account.token = response.accessToken;
}

function descriptor(bytes, label) {
  const timestamp = new Date(started).toISOString();
  return {
    fileName: `pholy-synthetic-${label}-${runId}.png`,
    fileSize: bytes.length,
    fileModifiedAt: timestamp,
    fileCreatedAt: timestamp,
    mimeType: "image/png",
    checksum: createHash("sha1").update(bytes).digest("hex"),
    visibility: "timeline",
  };
}

function rememberAsset(account, response) {
  if (typeof response?.id === "string" && /^[a-f\d-]{36}$/i.test(response.id))
    account.assetIds.add(response.id);
}

async function createSession(account, dto) {
  const response = await request(account, "pholy/uploads/sessions", {
    method: "POST",
    json: dto,
    expect: [201],
  });
  assert(
    typeof response?.id === "string" && /^[a-f\d-]{36}$/i.test(response.id),
    "INVALID_SESSION_ID",
  );
  account.sessionIds.add(response.id);
  if (response.result) rememberAsset(account, response.result);
  return response;
}

function sessionPath(id) {
  assert(/^[a-f\d-]{36}$/i.test(id), "INVALID_SESSION_ID");
  return `pholy/uploads/sessions/${id}`;
}

async function append(account, id, offset, bytes, expect = [200]) {
  return request(account, sessionPath(id), {
    method: "PATCH",
    body: bytes,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Upload-Offset": String(offset),
    },
    expect,
  });
}

async function guardedAccount(account) {
  const rows =
    await sql`SELECT "id", "email", "name", "isAdmin", "clusterGroupId" FROM "user" WHERE "id" = ${account.id}`;
  if (!rows.length) return false;
  const row = rows[0];
  assert(
    account.eligible &&
      row.email === account.email &&
      row.name === account.name &&
      row.isAdmin === account.isAdmin &&
      row.clusterGroupId === account.groupId,
    "SYNTHETIC_ACCOUNT_GUARD_FAILED",
    { userId: account.id },
  );
  return true;
}

async function safeMediaPath(path) {
  const target = resolve(path);
  const suffix = relative(mediaRoot, target);
  assert(
    suffix &&
      suffix !== ".." &&
      !suffix.startsWith(`..${sep}`) &&
      !isAbsolute(suffix),
    "UNSAFE_MEDIA_PATH",
  );
  let current = mediaRoot;
  for (const component of suffix.split(sep)) {
    current = join(current, component);
    try {
      const stats = await lstat(current);
      assert(!stats.isSymbolicLink(), "SYMLINK_IN_SYNTHETIC_MEDIA");
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}

async function entries(path) {
  await safeMediaPath(path);
  return readdir(path, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

async function filesIn(path) {
  const files = [];
  for (const item of await entries(path)) {
    const child = join(path, item.name);
    assert(!item.isSymbolicLink(), "SYMLINK_IN_SYNTHETIC_MEDIA");
    if (item.isDirectory()) files.push(...(await filesIn(child)));
    else files.push(child);
    assert(files.length <= 1000, "EXCESSIVE_SYNTHETIC_MEDIA_FILES");
  }
  return files;
}

async function removeEmptyDirectories(path) {
  for (const item of await entries(path)) {
    assert(item.isDirectory(), "SYNTHETIC_MEDIA_NOT_REMOVED");
    await removeEmptyDirectories(join(path, item.name));
  }
  await rmdir(path).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function ownerFolders(account) {
  return [
    "upload",
    "library",
    "thumbs",
    "encoded-video",
    "profile",
    ".pholy-uploads",
  ].map((folder) => join(mediaRoot, folder, account.id));
}

async function cleanup() {
  if (!sql) return;
  phase = "cleanup";
  log("cleanup", "started");
  const failures = [];
  for (const account of accounts.filter((account) => account.eligible)) {
    try {
      const exists = await guardedAccount(account);

      // Discover sessions whose creation response might have been lost, under this run's UUID only.
      const staging = join(mediaRoot, ".pholy-uploads", account.id);
      for (const entry of await entries(staging)) {
        assert(
          entry.isDirectory() && /^[a-f\d-]{36}$/i.test(entry.name),
          "UNEXPECTED_SYNTHETIC_SESSION_ENTRY",
        );
        account.sessionIds.add(entry.name);
      }
      const initialAssets =
        await sql`SELECT "id" FROM "asset" WHERE "ownerId" = ${account.id}`;
      for (const row of initialAssets) account.assetIds.add(row.id);
      if (
        exists &&
        !account.token &&
        (account.sessionIds.size || initialAssets.length)
      )
        await login(account, true);
      if (exists) {
        for (const id of account.sessionIds) {
          // Keep cleaning accepted assets even if one staging cleanup request fails.
          // The filesystem checks below still fail the run if any staging data survives.
          await request(account, sessionPath(id), {
            method: "DELETE",
            expect: [204],
            cleanup: true,
          }).catch(() => undefined);
        }
      }

      if (exists) {
        const profile =
          await sql`SELECT "profileImagePath" FROM "user" WHERE id = ${account.id}`;
        if (profile[0]?.profileImagePath) {
          await safeMediaPath(profile[0].profileImagePath);
          await request(account, "users/profile-image", {
            method: "DELETE",
            expect: [204],
            cleanup: true,
          });
        }
      }
      const knownPaths = new Set();
      const collectAssets = async () => {
        const rows =
          await sql`SELECT "id", "originalPath" FROM "asset" WHERE "ownerId" = ${account.id}`;
        for (const row of rows) {
          account.assetIds.add(row.id);
          if (row.originalPath)
            knownPaths.add(await safeMediaPath(row.originalPath));
        }
        const derived =
          await sql`SELECT f."path" FROM "asset_file" f JOIN "asset" a ON a."id" = f."assetId" WHERE a."ownerId" = ${account.id}`;
        for (const row of derived)
          knownPaths.add(await safeMediaPath(row.path));
        return rows;
      };
      const before = await collectAssets();
      if (before.length) {
        assert(exists, "ASSETS_WITHOUT_SYNTHETIC_ACCOUNT");
        await request(account, "assets", {
          method: "DELETE",
          json: { ids: before.map((row) => row.id), force: true },
          expect: [204],
          cleanup: true,
        });
      }
      const deadline = Date.now() + 180_000;
      let stable = 0;
      let polls = 0;
      while (Date.now() < deadline) {
        const remainingRows = await collectAssets();
        let remainingFiles = 0;
        for (const path of knownPaths) {
          const existsOnDisk = await lstat(path)
            .then(() => true)
            .catch((error) => {
              if (error.code === "ENOENT") return false;
              throw error;
            });
          if (existsOnDisk) remainingFiles++;
        }
        for (const folder of ownerFolders(account))
          remainingFiles += (await filesIn(folder)).length;
        stable = !remainingRows.length && !remainingFiles ? stable + 1 : 0;
        if (stable >= 3) break;
        if (polls++ % 10 === 0)
          log("cleanup_wait", "waiting", {
            userId: account.id,
            remainingAssets: remainingRows.length,
            remainingFiles,
          });
        await delay(2000);
      }
      assert(stable >= 3, "CLEANUP_MEDIA_TIMEOUT", { userId: account.id });
      for (const folder of ownerFolders(account))
        await removeEmptyDirectories(folder);

      // Re-check identity in the transaction immediately before removing the account.
      await sql.begin(async (tx) => {
        const current =
          await tx`SELECT "id", "email", "name", "isAdmin", "clusterGroupId" FROM "user" WHERE "id" = ${account.id} FOR UPDATE`;
        if (current.length) {
          const row = current[0];
          assert(
            row.email === account.email &&
              row.name === account.name &&
              row.isAdmin === account.isAdmin &&
              row.clusterGroupId === account.groupId,
            "SYNTHETIC_ACCOUNT_GUARD_FAILED",
          );
          const assets =
            await tx`SELECT "id" FROM "asset" WHERE "ownerId" = ${account.id} LIMIT 1`;
          assert(!assets.length, "CLEANUP_ASSETS_REAPPEARED");
          await tx`DELETE FROM "session" WHERE "userId" = ${account.id}`;
          await tx`DELETE FROM "user" WHERE "id" = ${account.id} AND "email" = ${account.email} AND "isAdmin" = ${account.isAdmin} AND "clusterGroupId" = ${account.groupId}`;
        }
        const groups =
          await tx`SELECT "id", "name" FROM "cluster_group" WHERE "id" = ${account.groupId} FOR UPDATE`;
        if (groups.length) {
          assert(
            groups[0].name === account.groupName,
            "SYNTHETIC_GROUP_GUARD_FAILED",
          );
          await tx`DELETE FROM "cluster_group" WHERE "id" = ${account.groupId} AND "name" = ${account.groupName} AND NOT EXISTS (SELECT 1 FROM "user" WHERE "clusterGroupId" = ${account.groupId})`;
        }
      });
      const remaining =
        await sql`SELECT "id" FROM "user" WHERE "id" = ${account.id} UNION ALL SELECT "id" FROM "cluster_group" WHERE "id" = ${account.groupId} UNION ALL SELECT "id" FROM "session" WHERE "userId" = ${account.id}`;
      assert(!remaining.length, "CLEANUP_RECORDS_REMAIN");
      log("cleanup_account", "pass", { userId: account.id });
    } catch (error) {
      failures.push({
        ...safeError(error),
        userId: account.id,
        clusterGroupId: account.groupId,
        assetIds: [...account.assetIds],
        uploadSessionIds: [...account.sessionIds],
      });
    }
  }
  if (failures.length)
    throw new TestFailure("CLEANUP_INCOMPLETE", { records: failures });
  await sql`DELETE FROM "pholy_invitation" WHERE "email" = ${invitationEmail}`;
  log("cleanup", "pass");
}

const invitationEmail = `pholy-suite-invitation-${runId}@example.invalid`;
const allowedRecipients = new Set([
  ...accounts.map((account) => account.email),
  invitationEmail,
]);
const smtpMessages = [];
const smtpSockets = new Set();
let smtpServer;
let rejectNextMail = false;

async function startSmtpSink() {
  smtpServer = createServer((socket) => {
    smtpSockets.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(30_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => smtpSockets.delete(socket));
    socket.write("220 localhost PHOLY isolated test sink\r\n");
    let pending = "";
    let recipient;
    let dataMode = false;
    let message = "";
    socket.on("data", (chunk) => {
      pending += chunk;
      if (pending.length > 1024 * 1024) {
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1) {
        let line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (dataMode) {
          if (line === ".") {
            smtpMessages.push({ recipient, body: message });
            dataMode = false;
            message = "";
            recipient = undefined;
            socket.write("250 2.0.0 Accepted by local sink only\r\n");
          } else {
            if (line.startsWith("..")) line = line.slice(1);
            message += line + "\r\n";
            if (message.length > 1024 * 1024) socket.destroy();
          }
          continue;
        }
        const command = line.split(" ", 1)[0].toUpperCase();
        if (command === "EHLO" || command === "HELO")
          socket.write("250-localhost\r\n250 8BITMIME\r\n");
        else if (command === "MAIL") {
          recipient = undefined;
          if (rejectNextMail) {
            rejectNextMail = false;
            socket.write("550 5.7.1 Synthetic submission failure\r\n");
          } else socket.write("250 2.1.0 OK\r\n");
        } else if (command === "RCPT") {
          const candidate = /TO:\s*<([^>]+)>/i.exec(line)?.[1]?.toLowerCase();
          if (!allowedRecipients.has(candidate))
            socket.write("550 5.7.1 Recipient outside synthetic fixtures\r\n");
          else {
            recipient = candidate;
            socket.write("250 2.1.5 OK\r\n");
          }
        } else if (command === "DATA") {
          if (!recipient)
            socket.write("503 5.5.1 Valid synthetic recipient required\r\n");
          else {
            dataMode = true;
            socket.write("354 End with dot\r\n");
          }
        } else if (command === "QUIT") socket.end("221 2.0.0 Bye\r\n");
        else if (command === "RSET" || command === "NOOP") {
          recipient = undefined;
          socket.write("250 2.0.0 OK\r\n");
        } else socket.write("502 5.5.2 Unsupported\r\n");
      }
    });
  });
  await new Promise((resolvePromise, reject) => {
    smtpServer.once("error", reject);
    smtpServer.listen(SMTP_PORT, "127.0.0.1", resolvePromise);
  });
}

async function closeSmtpSink() {
  for (const socket of smtpSockets) socket.destroy();
  if (smtpServer?.listening)
    await new Promise((resolvePromise) => smtpServer.close(resolvePromise));
  smtpMessages.length = 0;
}

async function eventually(check, code, milliseconds = 120_000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    cancellation.signal.throwIfAborted();
    const result = await check();
    if (result) return result;
    await delay(300, undefined, { signal: cancellation.signal });
  }
  throw new TestFailure(code);
}

function emailToken(email, kind, after = 0) {
  const message = smtpMessages
    .slice(after)
    .find((message) => message.recipient === email);
  if (!message) return;
  const decoded = message.body
    .replace(/=\r?\n/g, "")
    .replace(/=([\dA-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const token = new RegExp(`${kind}=([A-Za-z0-9_-]{43})`).exec(decoded)?.[1];
  assert(token, "MAIL_LINK_MISSING");
  return token;
}

function invitationToken(invitation) {
  const url = new URL(invitation.url);
  assert(
    url.origin === "https://pholy.de" && url.pathname === "/auth/register",
    "INVITATION_ORIGIN_INVALID",
  );
  const token = new URLSearchParams(url.hash.slice(1)).get("invitation");
  assert(/^[\w-]{43}$/.test(token), "INVITATION_TOKEN_INVALID");
  return token;
}

function unzip(bytes) {
  // Read central-directory lengths, including archives that use streaming data descriptors.
  let end = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65_557);
    i--
  ) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  assert(end >= 0, "ZIP_END_MISSING");
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  assert(count > 0 && count <= 20, "ZIP_UNEXPECTED_ENTRY_COUNT");
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert(bytes.readUInt32LE(cursor) === 0x02014b50, "ZIP_DIRECTORY_INVALID");
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const originalSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    assert(
      !files.has(name) &&
        !name.startsWith("/") &&
        !name.split("/").includes(".."),
      "ZIP_PATH_INVALID",
    );
    assert(
      bytes.readUInt32LE(localOffset) === 0x04034b50,
      "ZIP_LOCAL_HEADER_INVALID",
    );
    const begin =
      localOffset +
      30 +
      bytes.readUInt16LE(localOffset + 26) +
      bytes.readUInt16LE(localOffset + 28);
    assert(
      begin + compressedSize <= bytes.length && originalSize < 64 * 1024 ** 2,
      "ZIP_SIZE_INVALID",
    );
    const compressed = bytes.subarray(begin, begin + compressedSize);
    const content =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed)
          : undefined;
    assert(
      content && content.length === originalSize,
      "ZIP_UNCOMPRESSED_SIZE_INVALID",
    );
    files.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function upload(account, bytes, label, resumable = false) {
  const info = descriptor(bytes, label);
  let result;
  if (resumable) {
    const session = await createSession(account, info);
    assert(session.offset === 0, "SUITE_SESSION_INITIAL_OFFSET");
    const middle = Math.floor(bytes.length / 2);
    await append(account, session.id, 0, bytes.subarray(0, middle));
    assert(
      (await request(account, sessionPath(session.id))).offset === middle,
      "SUITE_SESSION_RESUME_OFFSET",
    );
    await append(account, session.id, middle, bytes.subarray(middle));
    result = await request(account, `${sessionPath(session.id)}/complete`, {
      method: "POST",
    });
  } else {
    const form = new FormData();
    for (const key of ["fileCreatedAt", "fileModifiedAt", "visibility"])
      form.set(key, info[key]);
    form.set(
      "assetData",
      new Blob([bytes], { type: "image/png" }),
      info.fileName,
    );
    result = await request(account, "assets", {
      method: "POST",
      body: form,
      expect: [201],
    });
  }
  rememberAsset(account, result);
  assert(
    result?.status === "created" && account.assetIds.has(result.id),
    "SUITE_UPLOAD_FAILED",
  );
  return { id: result.id, bytes, filename: info.fileName };
}

async function preflight() {
  assert(
    API.protocol === "http:" &&
      API.hostname === "127.0.0.1" &&
      API.port === "2299" &&
      API.pathname === "/api/",
    "ISOLATED_API_REQUIRED",
  );
  assert(envPath && configPath, "ISOLATED_ENVIRONMENT_REQUIRED");
  const require = createRequire(join(serverPath, "package.json"));
  const postgres = require("postgres");
  const bcrypt = require("bcrypt");
  sharp = require("sharp");
  const env = parseEnvironmentFile(await readFile(envPath, "utf8"));
  assert(
    /^pholy_suite_test_[a-z0-9_]+$/.test(env.DB_DATABASE_NAME),
    "ISOLATED_DATABASE_REQUIRED",
  );
  assert(!env.DB_URL, "USE_EXPLICIT_ISOLATED_DATABASE_FIELDS");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert(
    config.notifications?.smtp?.enabled &&
      config.notifications.smtp.transport?.host === "127.0.0.1" &&
      config.notifications.smtp.transport.port === SMTP_PORT,
    "LOCAL_SMTP_SINK_REQUIRED",
  );
  assert(
    config.backup?.database?.enabled === false,
    "ISOLATED_BACKUPS_MUST_BE_DISABLED",
  );
  assert(
    config.machineLearning?.enabled === false,
    "ISOLATED_ML_MUST_BE_DISABLED",
  );
  mediaRoot = resolve(env.IMMICH_MEDIA_LOCATION);
  assert(
    /\/?\.?pholy-suite-test-[A-Za-z0-9-]+$/.test(mediaRoot),
    "ISOLATED_MEDIA_DIRECTORY_REQUIRED",
  );
  assert((await realpath(mediaRoot)) === mediaRoot, "MEDIA_ROOT_SYMLINK");
  assert(
    [0xff534d42, 0xfe534d42].includes((await statfs(mediaRoot)).type >>> 0),
    "MEDIA_NOT_CIFS",
  );
  sql = postgres({
    host: env.DB_HOSTNAME,
    port: Number(env.DB_PORT),
    database: env.DB_DATABASE_NAME,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    debug: false,
    connection: {
      application_name: "pholy-isolated-suite-acceptance",
      statement_timeout: 20_000,
      lock_timeout: 5_000,
    },
  });
  assert(
    !(await sql`SELECT id FROM "user" LIMIT 1`).length,
    "STAGING_DATABASE_NOT_EMPTY",
  );
  await startSmtpSink();
  const hashes = await Promise.all(
    accounts.map((account) => bcrypt.hash(account.password, 12)),
  );
  for (const account of accounts) {
    for (const folder of ownerFolders(account)) {
      const exists = await lstat(folder)
        .then(() => true)
        .catch((error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
      assert(!exists, "SYNTHETIC_MEDIA_DIRECTORY_COLLISION");
    }
  }
  await sql.begin(async (tx) => {
    for (const [index, account] of accounts.entries()) {
      await tx`INSERT INTO "cluster_group" (id, name) VALUES (${account.groupId}, ${account.groupName})`;
      await tx`INSERT INTO "user" (id, email, password, name, "isAdmin", "shouldChangePassword", "quotaSizeInBytes", "clusterGroupId") VALUES (${account.id}, ${account.email}, ${hashes[index]}, ${account.name}, ${account.isAdmin}, false, ${256 * 1024 ** 2}, ${account.groupId})`;
    }
  });
  for (const account of accounts) account.eligible = true;
  for (const account of accounts) await login(account);
  const status = await request(null, "pholy/auth/status");
  assert(
    status.mailEnabled && status.passwordLoginEnabled,
    "STAGING_MAIL_NOT_ENABLED",
  );
  return {
    syntheticUsers: accounts.length,
    syntheticAdmins: 1,
    mailDelivery: "local-sink-only",
  };
}

async function main() {
  try {
    await scenario("isolated_preflight", preflight);
    const [owner, other, admin] = accounts;
    let visible;
    let privatePhoto;
    let foreign;
    let supportId;
    let avatarBytes;
    let ownedTag;
    let foreignTag;
    let ownedLink;
    const slug = "suite-" + runId.replaceAll("-", "").slice(0, 20);
    const profile = {
      slug,
      displayName: "Synthetic public profile",
      bio: "Only the explicitly selected synthetic photo is public.",
      published: true,
      assetIds: [],
    };

    await scenario("legacy_and_resumable_upload_history", async () => {
      const makePng = () =>
        sharp(randomBytes(128 * 128 * 3), {
          raw: { width: 128, height: 128, channels: 3 },
        })
          .withExif({ IFD0: { Artist: "Synthetic private metadata" } })
          .png()
          .toBuffer();
      visible = await upload(owner, await makePng(), "visible");
      privatePhoto = await upload(
        owner,
        await makePng(),
        "private-resumable",
        true,
      );
      foreign = await upload(other, await makePng(), "foreign");
      await eventually(async () => {
        const history = await request(owner, "pholy/history");
        assert(history.retentionDays === 90, "HISTORY_RETENTION_INCORRECT");
        assert(
          !history.items.some((item) => item.assetId === foreign.id),
          "HISTORY_LEAKS_FOREIGN_ASSET",
        );
        return [visible.id, privatePhoto.id].every((id) =>
          history.items.some(
            (item) => item.assetId === id && item.previewReady,
          ),
        );
      }, "HISTORY_OR_PREVIEW_NOT_READY");
      const otherHistory = await request(other, "pholy/history");
      assert(
        otherHistory.items.every(
          (item) => ![visible.id, privatePhoto.id].includes(item.assetId),
        ),
        "FOREIGN_HISTORY_LEAK",
      );
      const attempt = {
        id: randomUUID(),
        fileName: "synthetic-cancelled.png",
        fileSize: 12,
        status: "cancelled",
      };
      await request(owner, "pholy/history/attempts", {
        method: "POST",
        json: attempt,
        expect: [204],
      });
      await request(owner, "pholy/history/attempts", {
        method: "POST",
        json: attempt,
        expect: [204],
      });
      const after = await request(owner, "pholy/history");
      assert(
        after.items.filter((item) => item.fileName === attempt.fileName)
          .length === 1,
        "HISTORY_ATTEMPT_NOT_IDEMPOTENT",
      );
      await request(other, "pholy/history/attempts", {
        method: "POST",
        json: {
          ...attempt,
          id: randomUUID(),
          status: "accepted",
          assetId: visible.id,
        },
        expect: [404],
      });
      return { acceptedOriginals: 3, legacy: 2, resumable: 1 };
    });

    await scenario("quota_thresholds_and_warning_deduplication", async () => {
      const rows =
        await sql`SELECT "quotaUsageInBytes" FROM "user" WHERE id = ${owner.id}`;
      const usage = Number(rows[0].quotaUsageInBytes);
      assert(usage > 0, "UPLOAD_USAGE_NOT_ACCOUNTED");
      for (const [ratio, level] of [
        [0.81, "warning"],
        [0.96, "critical"],
        [1, "full"],
      ]) {
        const limit = Math.ceil(usage / ratio);
        await sql`UPDATE "user" SET "quotaSizeInBytes" = ${limit} WHERE id = ${owner.id} AND email = ${owner.email}`;
        const quota = await request(owner, "pholy/history/quota");
        assert(
          quota.level === level && Number(quota.usage) === usage,
          "QUOTA_THRESHOLD_INCORRECT",
          { level },
        );
      }
      const small = await sharp(randomBytes(8 * 8 * 3), {
        raw: { width: 8, height: 8, channels: 3 },
      })
        .png()
        .toBuffer();
      const small2 = await sharp(randomBytes(8 * 8 * 3), {
        raw: { width: 8, height: 8, channels: 3 },
      })
        .png()
        .toBuffer();
      const otherUsage = Number(
        (
          await sql`SELECT "quotaUsageInBytes" FROM "user" WHERE id = ${other.id}`
        )[0].quotaUsageInBytes,
      );
      const warningLimit = Math.ceil(
        (otherUsage + small.length + small2.length) / 0.85,
      );
      await sql`UPDATE "user" SET "quotaSizeInBytes" = ${warningLimit} WHERE id = ${other.id} AND email = ${other.email}`;
      await upload(other, small, "quota-warning-one");
      await eventually(
        async () =>
          (
            await sql`SELECT id FROM pholy_alert_state WHERE "userId" = ${other.id} AND "alertKey" = 'quota:warning'`
          ).length === 1,
        "QUOTA_NOTIFICATION_MISSING",
      );
      const before =
        await sql`SELECT count(*) AS count FROM notification WHERE "userId" = ${other.id}`;
      assert(Number(before[0].count) >= 1, "QUOTA_NOTIFICATION_NOT_CREATED");
      await upload(other, small2, "quota-warning-two");
      await request(other, "pholy/history/quota");
      const after =
        await sql`SELECT count(*) AS count FROM notification WHERE "userId" = ${other.id}`;
      assert(
        Number(after[0].count) === Number(before[0].count),
        "QUOTA_NOTIFICATION_REPEATED",
      );
      await sql`UPDATE "user" SET "quotaSizeInBytes" = ${256 * 1024 ** 2} WHERE id = ${other.id} AND email = ${other.email}`;
      await sql`UPDATE "user" SET "quotaSizeInBytes" = ${256 * 1024 ** 2} WHERE id = ${owner.id} AND email = ${owner.email}`;
      assert(
        (await request(owner, "pholy/history/quota")).level === "normal",
        "QUOTA_NORMAL_NOT_RESTORED",
      );
    });

    await scenario("support_ownership_and_admin_workflow", async () => {
      const ticket = await request(owner, "pholy/support", {
        method: "POST",
        json: {
          category: "upload",
          subject: "Synthetic upload question",
          message: "Synthetic acceptance request; no assistance needed.",
        },
        expect: [201],
      });
      supportId = ticket.id;
      assert(/^[a-f\d-]{36}$/i.test(supportId), "SUPPORT_ID_INVALID");
      await request(other, `pholy/support/${supportId}`, { expect: [404] });
      await request(other, `pholy/support/${supportId}/messages`, {
        method: "POST",
        json: { message: "Forbidden synthetic reply." },
        expect: [404],
      });
      await request(owner, "pholy/support/admin/list", { expect: [403] });
      assert(
        (await request(other, "pholy/support")).items.length === 0,
        "SUPPORT_LIST_FOREIGN_LEAK",
      );
      await request(admin, `pholy/support/admin/${supportId}/messages`, {
        method: "POST",
        json: { message: "Synthetic staff response." },
        expect: [201],
      });
      const answered = await request(owner, `pholy/support/${supportId}`);
      assert(
        answered.status === "waiting" &&
          answered.messages.length === 2 &&
          answered.messages[1].isStaff,
        "SUPPORT_REPLY_NOT_VISIBLE",
      );
      await request(admin, `pholy/support/admin/${supportId}`, {
        method: "PATCH",
        json: { status: "resolved" },
      });
      assert(
        (await request(owner, `pholy/support/${supportId}`)).status ===
          "resolved",
        "SUPPORT_RESOLUTION_NOT_VISIBLE",
      );
      await request(owner, `pholy/support/${supportId}/messages`, {
        method: "POST",
        json: { message: "Synthetic follow-up opens the thread." },
        expect: [201],
      });
      assert(
        (await request(owner, `pholy/support/${supportId}`)).status === "open",
        "SUPPORT_REPLY_DID_NOT_REOPEN",
      );
    });

    await scenario(
      "community_explicit_consent_and_safe_public_preview",
      async () => {
        const mine = await request(owner, "pholy/community/me");
        assert(
          mine.profile === null && mine.assets.length === 0,
          "COMMUNITY_NOT_PRIVATE_BY_DEFAULT",
        );
        await request(null, `pholy/community/profiles/${slug}`, {
          expect: [404],
        });
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: { ...profile, assetIds: [foreign.id] },
          expect: [400],
        });
        profile.assetIds = [visible.id];
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: profile,
        });
        const publicProfile = await request(
          null,
          `pholy/community/profiles/${slug}`,
        );
        assert(
          publicProfile.assets.length === 1 &&
            publicProfile.assets[0].id === visible.id,
          "COMMUNITY_EXPLICIT_SELECTION_IGNORED",
        );
        assert(
          !("email" in publicProfile) && !("userId" in publicProfile),
          "COMMUNITY_PRIVATE_PROFILE_METADATA_EXPOSED",
        );
        await request(
          null,
          `pholy/community/profiles/${slug}/assets/${privatePhoto.id}`,
          { expect: [404] },
        );
        await request(
          null,
          `pholy/community/profiles/${slug}/assets/${foreign.id}`,
          { expect: [404] },
        );
        const preview = await request(
          null,
          `pholy/community/profiles/${slug}/assets/${visible.id}`,
          { raw: true },
        );
        assert(
          preview.headers.get("content-type")?.startsWith("image/jpeg") &&
            preview.headers.get("cache-control")?.includes("no-store"),
          "COMMUNITY_PREVIEW_HEADERS_UNSAFE",
        );
        const metadata = await sharp(preview.bytes).metadata();
        assert(
          metadata.format === "jpeg" &&
            !metadata.exif &&
            !metadata.xmp &&
            metadata.width <= 1280 &&
            metadata.height <= 1280,
          "COMMUNITY_PREVIEW_PRIVATE_METADATA_EXPOSED",
        );
        await request(null, `assets/${visible.id}/original`, { expect: [401] });
        const ownOriginal = await request(
          owner,
          `assets/${visible.id}/original`,
          { binary: true },
        );
        assert(
          createHash("sha256").update(ownOriginal).digest("hex") ===
            createHash("sha256").update(visible.bytes).digest("hex"),
          "PUBLIC_PREVIEW_CHANGED_PRIVATE_ORIGINAL",
        );
      },
    );

    await scenario(
      "community_follow_report_moderation_and_revocation",
      async () => {
        await request(null, `pholy/community/profiles/${slug}/follow`, {
          method: "PUT",
          expect: [401],
        });
        assert(
          (
            await request(other, `pholy/community/profiles/${slug}/follow`, {
              method: "PUT",
            })
          ).following,
          "FOLLOW_FAILED",
        );
        assert(
          (await request(other, `pholy/community/profiles/${slug}/relation`))
            .following,
          "FOLLOW_NOT_PERSISTED",
        );
        assert(
          (await request(null, `pholy/community/profiles/${slug}`))
            .followers === 1,
          "FOLLOW_COUNT_INCORRECT",
        );
        await request(other, "pholy/community/reports", {
          method: "POST",
          json: {
            slug,
            assetId: visible.id,
            reason: "privacy",
            details: "Synthetic moderation exercise; harmless test photo.",
          },
        });
        await request(other, "pholy/community/moderation", { expect: [403] });
        const reports = await request(admin, "pholy/community/moderation");
        const report = reports.find((item) => item.assetId === visible.id);
        assert(report?.id, "MODERATION_REPORT_NOT_FOUND");
        await request(admin, `pholy/community/moderation/${report.id}`, {
          method: "PATCH",
          json: { action: "hide_asset" },
        });
        await request(
          null,
          `pholy/community/profiles/${slug}/assets/${visible.id}`,
          { expect: [404] },
        );
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: { ...profile, assetIds: [] },
        });
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: profile,
        });
        await request(
          null,
          `pholy/community/profiles/${slug}/assets/${visible.id}`,
          { expect: [404] },
        );
        await request(owner, `assets/${visible.id}/original`, { binary: true });
        await request(admin, `pholy/community/moderation/${report.id}`, {
          method: "PATCH",
          json: { action: "restore_asset" },
        });
        await request(
          null,
          `pholy/community/profiles/${slug}/assets/${visible.id}`,
          { binary: true },
        );
        await request(admin, `pholy/community/moderation/${report.id}`, {
          method: "PATCH",
          json: { action: "disable_profile" },
        });
        await request(null, `pholy/community/profiles/${slug}`, {
          expect: [404],
        });
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: profile,
          expect: [400],
        });
        await request(admin, `pholy/community/moderation/${report.id}`, {
          method: "PATCH",
          json: { action: "restore_profile" },
        });
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: profile,
        });
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: { ...profile, published: false },
        });
        await request(null, `pholy/community/profiles/${slug}`, {
          expect: [404],
        });
        await request(
          null,
          `pholy/community/profiles/${slug}/assets/${visible.id}`,
          { expect: [404] },
        );
        assert(
          !(await request(null, "pholy/community/profiles")).profiles.some(
            (item) => item.slug === slug,
          ),
          "UNPUBLISHED_PROFILE_IN_DIRECTORY",
        );
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: profile,
        });
        assert(
          !(
            await request(other, `pholy/community/profiles/${slug}/follow`, {
              method: "DELETE",
            })
          ).following,
          "UNFOLLOW_FAILED",
        );
      },
    );

    await scenario(
      "complete_export_reauthentication_session_scope_and_integrity",
      async () => {
        const avatarForm = new FormData();
        avatarForm.set(
          "file",
          new Blob([visible.bytes], { type: "image/png" }),
          "synthetic-avatar.png",
        );
        await request(owner, "users/profile-image", {
          method: "POST",
          body: avatarForm,
          expect: [201],
        });
        avatarBytes = await request(owner, `users/${owner.id}/profile-image`, {
          binary: true,
        });
        assert(avatarBytes.length > 0, "AVATAR_HTTP_UPLOAD_FAILED");
        ownedTag = await request(owner, "tags", {
          method: "POST",
          json: { name: "Synthetic owned export tag" },
          expect: [201],
        });
        foreignTag = await request(other, "tags", {
          method: "POST",
          json: { name: "Synthetic foreign export tag" },
          expect: [201],
        });
        ownedLink = await request(owner, "shared-links", {
          method: "POST",
          json: {
            type: "INDIVIDUAL",
            assetIds: [visible.id],
            password: randomBytes(16).toString("base64url"),
            slug: "suite-private-" + runId,
            allowDownload: false,
            showMetadata: false,
          },
          expect: [201],
        });
        await request(owner, "pholy/account/export/metadata", {
          expect: [403],
        });
        await request(owner, "pholy/account/export", {
          method: "POST",
          json: { password: "synthetic-invalid-password" },
          expect: [403],
        });
        // A hidden original belongs in a full account export even though public gallery selection rejects it.
        await request(owner, `assets/${privatePhoto.id}`, {
          method: "PUT",
          json: { visibility: "hidden" },
        });
        await request(owner, "pholy/community/me", {
          method: "PUT",
          json: { ...profile, assetIds: [privatePhoto.id] },
          expect: [400],
        });
        const grant = await request(owner, "pholy/account/export", {
          method: "POST",
          json: { password: owner.password },
          expect: [201],
        });
        assert(
          new Date(grant.exportExpiresAt).getTime() > Date.now(),
          "EXPORT_GRANT_NOT_ISSUED",
        );
        const ownSession = owner.token;
        await login(owner);
        const secondSession = owner.token;
        await request(owner, "pholy/account/export/metadata", {
          expect: [403],
        });
        owner.token = ownSession;
        await request(other, "pholy/account/export/metadata", {
          expect: [403],
        });
        const part = await request(owner, "pholy/account/export/part");
        assert(
          part.count === 2 &&
            part.nextCursor === null &&
            part.files.some((item) => item.id === privatePhoto.id) &&
            !part.files.some((item) => item.id === foreign.id),
          "EXPORT_PART_OWNERSHIP_OR_COMPLETENESS_FAILED",
        );
        const metadataResponse = await request(
          owner,
          "pholy/account/export/metadata",
          { raw: true },
        );
        assert(
          metadataResponse.headers.get("cache-control")?.includes("no-store") &&
            metadataResponse.headers
              .get("content-disposition")
              ?.includes("attachment"),
          "EXPORT_HEADERS_UNSAFE",
        );
        const metadata = JSON.parse(metadataResponse.bytes.toString("utf8"));
        assert(
          metadata.format === "pholy-account-v1" &&
            metadata.profile.id === owner.id,
          "EXPORT_PROFILE_INVALID",
        );
        assert(
          metadata.assets.length === 2 &&
            metadata.assets.some((item) => item.id === privatePhoto.id),
          "EXPORT_METADATA_MISSING_ORIGINAL",
        );
        assert(
          !("password" in metadata.profile) &&
            !("pinCode" in metadata.profile) &&
            !("oauthId" in metadata.profile),
          "EXPORT_EXPOSES_CREDENTIALS",
        );
        assert(
          !metadata.assets.some((item) => item.id === foreign.id),
          "EXPORT_FOREIGN_METADATA_EXPOSED",
        );
        assert(
          metadata.supportTickets?.some((ticket) => ticket.id === supportId) &&
            metadata.supportMessages?.some(
              (message) => message.ticketId === supportId && message.isStaff,
            ) &&
            metadata.uploadHistory?.some(
              (item) => item.assetId === visible.id,
            ) &&
            metadata.communityProfile?.some((item) => item.slug === slug),
          "EXPORT_NEW_ACCOUNT_DATA_MISSING",
        );
        for (const section of [
          "tags",
          "tagAssets",
          "people",
          "faces",
          "memories",
          "memoryAssets",
          "stacks",
          "sharedLinks",
          "sharedLinkAssets",
          "ocr",
          "notifications",
          "partnerSharing",
        ]) {
          assert(Array.isArray(metadata[section]), "EXPORT_SECTION_MISSING", {
            section,
          });
        }
        assert(
          metadata.tags.some((tag) => tag.id === ownedTag.id) &&
            !metadata.tags.some((tag) => tag.id === foreignTag.id),
          "EXPORT_TAG_OWNERSHIP_FAILED",
        );
        const shared = metadata.sharedLinks.find(
          (link) => link.id === ownedLink.id,
        );
        assert(
          shared &&
            !("key" in shared) &&
            !("password" in shared) &&
            !("slug" in shared),
          "EXPORT_SHARED_LINK_SECRET_EXPOSED",
        );
        assert(
          metadata.profileImage?.encoding === "base64" &&
            Buffer.from(metadata.profileImage.data, "base64").equals(
              avatarBytes,
            ),
          "EXPORT_AVATAR_JSON_INTEGRITY_FAILED",
        );
        const archive = await request(owner, "pholy/account/export/archive", {
          raw: true,
        });
        assert(
          archive.headers.get("content-type")?.includes("application/zip") &&
            archive.headers.get("cache-control")?.includes("no-store"),
          "EXPORT_ARCHIVE_HEADERS_INVALID",
        );
        const files = unzip(archive.bytes);
        const manifest = JSON.parse(
          files.get("manifest.json").toString("utf8"),
        );
        assert(
          manifest.files.length === 2 &&
            files.size === 4 &&
            manifest.profileImage?.archivePath,
          "EXPORT_ARCHIVE_INCOMPLETE",
        );
        assert(
          files.get(manifest.profileImage.archivePath)?.equals(avatarBytes),
          "EXPORT_AVATAR_ARCHIVE_INTEGRITY_FAILED",
        );
        for (const image of [visible, privatePhoto]) {
          const item = manifest.files.find((entry) => entry.id === image.id);
          assert(
            item && files.has(item.archivePath),
            "EXPORT_MANIFEST_ORIGINAL_MISSING",
          );
          assert(
            createHash("sha256")
              .update(files.get(item.archivePath))
              .digest("hex") ===
              createHash("sha256").update(image.bytes).digest("hex"),
            "EXPORT_ORIGINAL_INTEGRITY_FAILED",
          );
        }
        assert(
          !(await request({ ...owner, token: secondSession }, "pholy/account"))
            .exportExpiresAt,
          "EXPORT_GRANT_LEAKS_TO_SECOND_SESSION",
        );
        await sql`UPDATE pholy_account_state SET "exportExpiresAt" = now() - interval '1 second' WHERE "userId" = ${owner.id}`;
        await request(owner, "pholy/account/export/archive", { expect: [403] });
        await request(owner, "pholy/account/export", {
          method: "POST",
          json: { password: owner.password },
          expect: [201],
        });
        return {
          originalsVerified: 2,
          hiddenOriginalIncluded: true,
          archiveBytes: archive.bytes.length,
        };
      },
    );

    await scenario(
      "account_closure_confirmation_grace_and_cancellation",
      async () => {
        await request(admin, "pholy/account/closure", {
          method: "POST",
          json: { password: admin.password, email: admin.email, confirm: true },
          expect: [403],
        });
        await request(owner, "pholy/account/closure", {
          method: "POST",
          json: { password: owner.password, email: other.email, confirm: true },
          expect: [400],
        });
        await request(other, "pholy/account/closure", {
          method: "POST",
          json: {
            password: "synthetic-invalid-password",
            email: other.email,
            confirm: true,
          },
          expect: [403],
        });
        const closing = await request(owner, "pholy/account/closure", {
          method: "POST",
          json: { password: owner.password, email: owner.email, confirm: true },
          expect: [201],
        });
        const grace =
          new Date(closing.closeAfter).getTime() -
          new Date(closing.closeRequestedAt).getTime();
        assert(grace === 7 * 86_400_000, "CLOSURE_GRACE_INCORRECT");
        assert(
          (await request(owner, "pholy/account")).closeAfter ===
            closing.closeAfter,
          "CLOSURE_NOT_PERSISTED",
        );
        await request(owner, `assets/${visible.id}/original`, { binary: true });
        const users =
          await sql`SELECT "deletedAt", status FROM "user" WHERE id = ${owner.id}`;
        assert(
          users[0].deletedAt === null && users[0].status === "active",
          "CLOSURE_PREMATURE_DELETION",
        );
        await request(owner, "pholy/account/closure", {
          method: "DELETE",
          expect: [204],
        });
        assert(
          (await request(owner, "pholy/account")).closeAfter === null,
          "CLOSURE_CANCEL_FAILED",
        );
        await request(owner, "pholy/account/closure", {
          method: "DELETE",
          expect: [409],
        });
      },
    );

    await scenario(
      "invitation_delivery_rotation_failure_and_retry",
      async () => {
        await request(owner, "pholy/invitations", { expect: [403] });
        const invitation = await request(admin, "pholy/invitations", {
          method: "POST",
          json: { email: invitationEmail, quotaGiB: 1, sendEmail: false },
          expect: [201],
        });
        const firstToken = invitationToken(invitation);
        const sent = await request(
          admin,
          `pholy/invitations/${invitation.id}/send`,
          { method: "POST" },
        );
        const secondToken = invitationToken(sent);
        assert(
          sent.mailStatus === "accepted" && secondToken !== firstToken,
          "INVITATION_MAIL_SUBMISSION_NOT_RECORDED",
        );
        assert(
          (await eventually(
            () => emailToken(invitationEmail, "invitation"),
            "INVITATION_MAIL_NOT_CAPTURED",
            15_000,
          )) === secondToken,
          "INVITATION_MAIL_LINK_MISMATCH",
        );
        await request(null, "pholy/invitations/preview", {
          method: "POST",
          json: { token: firstToken },
          expect: [400],
        });
        assert(
          (
            await request(null, "pholy/invitations/preview", {
              method: "POST",
              json: { token: secondToken },
            })
          ).email === invitationEmail,
          "INVITATION_NEW_LINK_INVALID",
        );
        await request(admin, `pholy/invitations/${invitation.id}/send`, {
          method: "POST",
          expect: [409],
        });
        const list = await request(admin, "pholy/invitations");
        const listed = list.find((item) => item.id === invitation.id);
        assert(
          listed.mailStatus === "accepted" &&
            !("tokenHash" in listed) &&
            !("url" in listed),
          "INVITATION_LIST_EXPOSES_TOKEN",
        );
        await sql`UPDATE pholy_invitation SET "mailAttemptedAt" = now() - interval '2 minutes' WHERE id = ${invitation.id} AND email = ${invitationEmail}`;
        rejectNextMail = true;
        const failed = await request(
          admin,
          `pholy/invitations/${invitation.id}/send`,
          { method: "POST" },
        );
        assert(
          failed.mailStatus === "failed" && failed.mailAcceptedAt === null,
          "SMTP_FAILURE_REPORTED_AS_SUCCESS",
        );
        await sql`UPDATE pholy_invitation SET "mailAttemptedAt" = now() - interval '2 minutes' WHERE id = ${invitation.id} AND email = ${invitationEmail}`;
        const mailOffset = smtpMessages.length;
        const retried = await request(
          admin,
          `pholy/invitations/${invitation.id}/send`,
          { method: "POST" },
        );
        assert(retried.mailStatus === "accepted", "INVITATION_RETRY_FAILED");
        assert(
          (await eventually(
            () => emailToken(invitationEmail, "invitation", mailOffset),
            "INVITATION_RETRY_MAIL_MISSING",
            15_000,
          )) === invitationToken(retried),
          "INVITATION_RETRY_TOKEN_MISMATCH",
        );
        await request(admin, `pholy/invitations/${invitation.id}`, {
          method: "DELETE",
          expect: [204],
        });
        await request(null, "pholy/invitations/preview", {
          method: "POST",
          json: { token: invitationToken(retried) },
          expect: [400],
        });
      },
    );

    await scenario(
      "password_reset_generic_response_one_use_session_and_export_revocation",
      async () => {
        const before = smtpMessages.length;
        const existing = await request(null, "pholy/auth/forgot-password", {
          method: "POST",
          json: { email: owner.email },
          expect: [202],
        });
        const unknown = await request(null, "pholy/auth/forgot-password", {
          method: "POST",
          json: { email: `pholy-suite-unknown-${runId}@example.invalid` },
          expect: [202],
        });
        assert(
          JSON.stringify(existing) === JSON.stringify(unknown) &&
            existing.accepted,
          "PASSWORD_RESET_ENUMERATION_RESPONSE",
        );
        const token = await eventually(
          () => emailToken(owner.email, "token", before),
          "PASSWORD_RESET_MAIL_MISSING",
          15_000,
        );
        const stored =
          await sql`SELECT "tokenHash", "usedAt" FROM pholy_password_reset WHERE "userId" = ${owner.id}`;
        assert(
          stored.length === 1 &&
            Buffer.isBuffer(stored[0].tokenHash) &&
            stored[0].tokenHash.equals(
              createHash("sha256").update(token).digest(),
            ) &&
            stored[0].usedAt === null,
          "PASSWORD_RESET_TOKEN_NOT_HASHED",
        );
        const newPassword = randomBytes(32).toString("base64url");
        const oldToken = owner.token;
        const oldPassword = owner.password;
        const result = await request(null, "pholy/auth/reset-password", {
          method: "POST",
          json: { token, password: newPassword },
        });
        owner.password = newPassword;
        owner.token = undefined;
        assert(result.reset === true, "PASSWORD_RESET_NOT_CONFIRMED");
        await request(null, "pholy/auth/reset-password", {
          method: "POST",
          json: { token, password: randomBytes(32).toString("base64url") },
          expect: [400],
        });
        await request({ ...owner, token: oldToken }, "pholy/account", {
          expect: [401],
        });
        await request(null, "auth/login", {
          method: "POST",
          json: { email: owner.email, password: oldPassword },
          expect: [401],
        });
        await login(owner);
        await request(owner, "pholy/account/export/metadata", {
          expect: [403],
        });
        assert(
          !(
            await sql`SELECT id FROM session WHERE "userId" = ${owner.id} AND id IN (SELECT "exportSessionId" FROM pholy_account_state WHERE "userId" = ${owner.id})`
          ).length,
          "RESET_PRESERVED_EXPORT_SESSION",
        );
        return {
          localResetEmails: smtpMessages
            .slice(before)
            .filter((message) => message.recipient === owner.email).length,
        };
      },
    );

    await scenario("expired_and_superseded_reset_links", async () => {
      const before = smtpMessages.length;
      await request(null, "pholy/auth/forgot-password", {
        method: "POST",
        json: { email: other.email },
        expect: [202],
      });
      const token = await eventually(
        () => emailToken(other.email, "token", before),
        "SECOND_RESET_MAIL_MISSING",
        15_000,
      );
      await sql`UPDATE pholy_password_reset SET "expiresAt" = now() - interval '1 second' WHERE "userId" = ${other.id}`;
      await request(null, "pholy/auth/reset-password", {
        method: "POST",
        json: { token, password: randomBytes(32).toString("base64url") },
        expect: [400],
      });
      await sql`UPDATE pholy_password_reset SET "expiresAt" = now() + interval '30 minutes' WHERE "userId" = ${other.id}`;
      const newPassword = randomBytes(32).toString("base64url");
      await request(other, "auth/change-password", {
        method: "POST",
        json: { password: other.password, newPassword },
        expect: [200],
      });
      other.password = newPassword;
      await request(null, "pholy/auth/reset-password", {
        method: "POST",
        json: { token, password: randomBytes(32).toString("base64url") },
        expect: [400],
      });
      await login(other);
      assert(
        smtpMessages.every((message) =>
          allowedRecipients.has(message.recipient),
        ),
        "SMTP_EXTERNAL_RECIPIENT",
      );
    });
    log("acceptance", "pass", {
      scenarios: 11,
      syntheticUsers: accounts.length,
      externalMessages: 0,
    });
  } catch (error) {
    assertionFailure = error;
    failureReported = true;
    log(phase, "fail", safeError(error));
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupFailure = error;
      log("cleanup", "fail", safeError(error));
    }
    await closeSmtpSink();
    if (sql) await sql.end({ timeout: 5 });
  }
  const passed = !assertionFailure && !cleanupFailure;
  log("complete", passed ? "pass" : "fail", {
    cleanupComplete: !cleanupFailure,
  });
  process.exitCode = passed ? 0 : 1;
}

void main().catch((error) => {
  if (!failureReported) log(phase, "fail", safeError(error));
  process.exitCode = 1;
});
