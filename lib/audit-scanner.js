// (bundled from dsh-plugin-audit src/scanner/index.ts
import path3 from "node:path";

// (bundled from dsh-plugin-audit src/scanner/patterns.ts
var SENSITIVE_ENV = /TOKEN|KEY|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE|SESSION/i;
var CREDENTIAL_PATH = /(\.ssh|\.aws|\.gnupg|\.git-credentials|\.netrc|\.npmrc|id_rsa|id_ed25519|keychain|\.docker\/config\.json)/i;

// (bundled from dsh-plugin-audit src/scanner/detect.ts
var MODULES = {
  fs: /* @__PURE__ */ new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]),
  childProcess: /* @__PURE__ */ new Set(["child_process", "node:child_process"]),
  http: /* @__PURE__ */ new Set(["http", "node:http", "https", "node:https", "http2", "node:http2"]),
  net: /* @__PURE__ */ new Set(["net", "node:net", "tls", "node:tls", "dgram", "node:dgram"]),
  vm: /* @__PURE__ */ new Set(["vm", "node:vm"]),
  networkLibs: /* @__PURE__ */ new Set([
    "axios",
    "got",
    "undici",
    "node-fetch",
    "ws",
    "socket.io",
    "socket.io-client",
    "superagent",
    "ky",
    "ofetch",
    "ssh2"
  ])
};
var FAMILY_RULES = [
  {
    capability: "fs-read",
    severity: "info",
    family: MODULES.fs,
    methods: [
      "readFileSync",
      "readFile",
      "createReadStream",
      "readdirSync",
      "readdir",
      "statSync",
      "stat",
      "lstatSync",
      "lstat",
      "readlinkSync",
      "readlink",
      "accessSync",
      "access",
      "watch",
      "open",
      "read",
      "opendir",
      "existsSync"
    ],
    detail: "Reads files from the filesystem."
  },
  {
    capability: "fs-write",
    severity: "notice",
    family: MODULES.fs,
    methods: [
      "writeFileSync",
      "writeFile",
      "appendFileSync",
      "appendFile",
      "createWriteStream",
      "mkdirSync",
      "mkdir",
      "rmSync",
      "rm",
      "rmdirSync",
      "rmdir",
      "unlinkSync",
      "unlink",
      "renameSync",
      "rename",
      "copyFileSync",
      "copyFile",
      "chmodSync",
      "chmod",
      "chownSync",
      "chown",
      "truncateSync",
      "truncate",
      "cpSync",
      "cp",
      "symlinkSync",
      "symlink",
      "utimesSync",
      "utimes"
    ],
    detail: "Writes to the filesystem."
  },
  {
    capability: "subprocess",
    severity: "notice",
    family: MODULES.childProcess,
    methods: ["execSync", "execFileSync", "spawnSync", "exec", "execFile", "spawn", "fork"],
    detail: "Spawns child processes."
  },
  {
    capability: "network",
    severity: "notice",
    family: MODULES.http,
    methods: ["request", "get", "createServer", "createSecureServer"],
    detail: "Uses the http/https module."
  },
  {
    capability: "network",
    severity: "notice",
    family: MODULES.net,
    methods: ["connect", "createConnection", "createServer"],
    detail: "Opens raw network connections."
  },
  {
    capability: "dynamic-exec",
    severity: "review",
    family: MODULES.vm,
    methods: [
      "runInThisContext",
      "runInNewContext",
      "runInContext",
      "compileFunction",
      "Script",
      "createContext",
      "measureMemory"
    ],
    detail: "Executes code through the vm module."
  }
];
var STATIC_RULES = [
  {
    capability: "network",
    severity: "notice",
    pattern: /(?<![.\w])fetch\s*\(/,
    detail: "Calls the global fetch API."
  },
  {
    capability: "network",
    severity: "notice",
    pattern: /\bnew\s+WebSocket\s*\(/,
    detail: "Opens a WebSocket connection."
  },
  {
    capability: "dynamic-exec",
    severity: "review",
    pattern: /(?<![.\w])eval\s*\(|new\s+Function\s*\(/,
    detail: "Evaluates dynamically constructed code."
  },
  {
    capability: "credential-access",
    severity: "review",
    pattern: CREDENTIAL_PATH,
    detail: "References a credential-bearing path."
  }
];
var IDENT = "[A-Za-z_$][\\w$]*";
var IMPORT_TYPE = /^\s*import\s+type\b/;
var IMPORT_NS = new RegExp(`\\bimport\\s+\\*\\s+as\\s+(${IDENT})\\s+from\\s*['"]([^'"]+)['"]`, "g");
var IMPORT_NAMED = /\bimport\s+\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
var IMPORT_DEFAULT = new RegExp(
  `\\bimport\\s+(${IDENT})\\s*(?:,\\s*\\{([^}]*)\\})?\\s*(?:,\\s*\\*\\s*as\\s+(${IDENT})\\s*)?from\\s*['"]([^'"]+)['"]`,
  "g"
);
var IMPORT_SIDE_EFFECT = /\bimport\s*['"]([^'"]+)['"]/g;
var REQUIRE_NS = new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*require\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)`, "g");
var REQUIRE_NAMED = /\b(?:const|let|var)\s+\{([^}]*)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
var AWAIT_IMPORT_NS = new RegExp(
  `\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*await\\s+import\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
  "g"
);
var DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
var EXPORT_FROM = /\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
var SPECIFIER_USE = /\b(?:from\s+|require\s*\(\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
var ENV_DOT = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
var ENV_INDEX = /process\.env\[['"]([^'"]+)['"]\]/g;
var URL_LITERAL = /https?:\/\/(?:[^@/\s'"]*@)?(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9][a-zA-Z0-9.-]*)(?::\d+)?/g;
var INJECT_DECL = /\bexport\s+const\s+inject\s*(?::[^=]+)?=\s*\[([\s\S]*?)\]\s*(?:\n|$)/;
function parseNamedClause(clause) {
  const named = [];
  for (const entry of clause.split(",")) {
    const trimmed = entry.trim().replace(/^type\s+/, "");
    if (trimmed === "") continue;
    const parts = trimmed.split(/\s+as\s+/);
    const imported = parts[0]?.trim();
    if (!imported || !new RegExp(`^${IDENT}$`).test(imported)) continue;
    const local = (parts[1] ?? parts[0])?.trim();
    if (local && new RegExp(`^${IDENT}$`).test(local)) named.push({ local, imported });
  }
  return named;
}
function parseRequireClause(clause) {
  const named = [];
  for (const entry of clause.split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const parts = trimmed.split(/\s*:\s*/);
    const imported = parts[0]?.trim();
    if (!imported || !new RegExp(`^${IDENT}$`).test(imported)) continue;
    const local = (parts[1] ?? parts[0])?.trim();
    if (local && new RegExp(`^${IDENT}$`).test(local)) named.push({ local, imported });
  }
  return named;
}
function collectBindings(content) {
  const bindings = /* @__PURE__ */ new Map();
  const ensure = (specifier) => {
    let entry = bindings.get(specifier);
    if (!entry) {
      entry = { namespaces: [], named: [] };
      bindings.set(specifier, entry);
    }
    return entry;
  };
  const lines = content.split("\n");
  lines.forEach((rawLine) => {
    if (IMPORT_TYPE.test(rawLine)) return;
    IMPORT_NS.lastIndex = 0;
    let match;
    while ((match = IMPORT_NS.exec(rawLine)) !== null) {
      if (match[1] && match[2]) ensure(match[2]).namespaces.push(match[1]);
    }
    IMPORT_NAMED.lastIndex = 0;
    while ((match = IMPORT_NAMED.exec(rawLine)) !== null) {
      if (match[1] && match[2]) ensure(match[2]).named.push(...parseNamedClause(match[1]));
    }
    IMPORT_DEFAULT.lastIndex = 0;
    while ((match = IMPORT_DEFAULT.exec(rawLine)) !== null) {
      if (match[1] && match[4]) ensure(match[4]).namespaces.push(match[1]);
      if (match[2] && match[4]) ensure(match[4]).named.push(...parseNamedClause(match[2]));
      if (match[3] && match[4]) ensure(match[4]).namespaces.push(match[3]);
    }
    IMPORT_SIDE_EFFECT.lastIndex = 0;
    while ((match = IMPORT_SIDE_EFFECT.exec(rawLine)) !== null) {
      if (match[1]) ensure(match[1]);
    }
    REQUIRE_NS.lastIndex = 0;
    while ((match = REQUIRE_NS.exec(rawLine)) !== null) {
      if (match[1] && match[2]) ensure(match[2]).namespaces.push(match[1]);
    }
    REQUIRE_NAMED.lastIndex = 0;
    while ((match = REQUIRE_NAMED.exec(rawLine)) !== null) {
      if (match[1] && match[2]) ensure(match[2]).named.push(...parseRequireClause(match[1]));
    }
    AWAIT_IMPORT_NS.lastIndex = 0;
    while ((match = AWAIT_IMPORT_NS.exec(rawLine)) !== null) {
      if (match[1] && match[2]) ensure(match[2]).namespaces.push(match[1]);
    }
    DYNAMIC_IMPORT.lastIndex = 0;
    while ((match = DYNAMIC_IMPORT.exec(rawLine)) !== null) {
      if (match[1]) ensure(match[1]);
    }
    EXPORT_FROM.lastIndex = 0;
    while ((match = EXPORT_FROM.exec(rawLine)) !== null) {
      if (match[1]) ensure(match[1]);
    }
  });
  return bindings;
}
function familyPattern(rule, bindings) {
  const namespaces = /* @__PURE__ */ new Set();
  const locals = /* @__PURE__ */ new Set();
  for (const [specifier, entry] of bindings) {
    if (!rule.family.has(specifier)) continue;
    for (const ns of entry.namespaces) namespaces.add(ns);
    for (const named of entry.named) {
      if (rule.methods.includes(named.imported)) locals.add(named.local);
    }
  }
  const alternatives = [];
  if (namespaces.size > 0) {
    alternatives.push(`(?:${[...namespaces].join("|")})\\.(?:${rule.methods.join("|")})`);
  }
  if (locals.size > 0) {
    alternatives.push(`(?<![.\\w])(?:${[...locals].join("|")})`);
  }
  if (alternatives.length === 0) return void 0;
  return new RegExp(`(?:${alternatives.join("|")})\\s*\\(`);
}
function detectFile(file) {
  const bindings = collectBindings(file.content);
  const activeFamilyRules = FAMILY_RULES.map((rule) => ({ rule, pattern: familyPattern(rule, bindings) })).filter((entry) => entry.pattern !== void 0);
  const findings = [];
  const envVars = /* @__PURE__ */ new Set();
  const sensitiveEnvVars = /* @__PURE__ */ new Set();
  const hosts = /* @__PURE__ */ new Set();
  const inject = [];
  const lines = file.content.split("\n");
  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const evidence = rawLine.trim().slice(0, 160);
    if (evidence === "") return;
    for (const { rule, pattern } of activeFamilyRules) {
      pattern.lastIndex = 0;
      const match = pattern.exec(rawLine);
      if (match) {
        findings.push({
          capability: rule.capability,
          severity: rule.severity,
          file: file.relativePath,
          line,
          evidence,
          detail: rule.detail,
          match: match[0]
        });
      }
    }
    for (const rule of STATIC_RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(rawLine);
      if (match) {
        findings.push({
          capability: rule.capability,
          severity: rule.severity,
          file: file.relativePath,
          line,
          evidence,
          detail: rule.detail,
          match: match[1] ?? match[0]
        });
      }
    }
    ENV_DOT.lastIndex = 0;
    let envMatch;
    while ((envMatch = ENV_DOT.exec(rawLine)) !== null) {
      const name = envMatch[1];
      if (!name) continue;
      envVars.add(name);
      if (SENSITIVE_ENV.test(name)) sensitiveEnvVars.add(name);
    }
    ENV_INDEX.lastIndex = 0;
    while ((envMatch = ENV_INDEX.exec(rawLine)) !== null) {
      const name = envMatch[1];
      if (!name) continue;
      envVars.add(name);
      if (SENSITIVE_ENV.test(name)) sensitiveEnvVars.add(name);
    }
    URL_LITERAL.lastIndex = 0;
    let urlMatch;
    while ((urlMatch = URL_LITERAL.exec(rawLine)) !== null) {
      const host = urlMatch[1];
      if (host) hosts.add(host.replace(/\.$/, "").toLowerCase());
    }
    SPECIFIER_USE.lastIndex = 0;
    let specifierMatch;
    const flagged = /* @__PURE__ */ new Set();
    while ((specifierMatch = SPECIFIER_USE.exec(rawLine)) !== null) {
      const specifier = specifierMatch[1];
      if (!specifier || !MODULES.networkLibs.has(specifier) || flagged.has(specifier)) continue;
      flagged.add(specifier);
      findings.push({
        capability: "network",
        severity: "notice",
        file: file.relativePath,
        line,
        evidence,
        detail: `Imports the HTTP client library "${specifier}".`,
        match: specifier
      });
    }
  });
  for (const name of sensitiveEnvVars) {
    findings.push({
      capability: "env-access",
      severity: "review",
      file: file.relativePath,
      evidence: `process.env.${name}`,
      detail: "Reads a credential-looking environment variable.",
      match: name
    });
  }
  const injectMatch = INJECT_DECL.exec(file.content);
  if (injectMatch?.[1]) {
    const quoted = injectMatch[1].match(/['"]([^'"]+)['"]/g) ?? [];
    for (const entry of quoted) inject.push(entry.slice(1, -1));
  }
  return {
    findings,
    envVars: [...envVars],
    sensitiveEnvVars: [...sensitiveEnvVars],
    hosts: [...hosts],
    inject
  };
}

// (bundled from dsh-plugin-audit src/scanner/manifest.ts
import { promises as fs } from "node:fs";
import path from "node:path";
var PATCH_ROW = /^-\s*(insert|override|delete)\s*:/;
async function analyzeManifest(dir) {
  const findings = [];
  const dependencies = [];
  let name;
  let version;
  const packageJsonPath = path.join(dir, "package.json");
  const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8").catch(() => void 0);
  if (packageJsonRaw === void 0) {
    findings.push({
      capability: "manifest",
      severity: "notice",
      file: "package.json",
      evidence: "(missing)",
      detail: "No package.json found; the radar minimum bar requires one."
    });
  } else {
    try {
      const parsed = JSON.parse(packageJsonRaw);
      if (typeof parsed.name === "string" && parsed.name !== "") name = parsed.name;
      if (typeof parsed.version === "string") version = parsed.version;
      for (const field of ["dependencies", "peerDependencies"]) {
        const table = parsed[field];
        if (table && typeof table === "object") {
          dependencies.push(...Object.keys(table));
        }
      }
      if (!name) {
        findings.push({
          capability: "manifest",
          severity: "notice",
          file: "package.json",
          evidence: '"name" missing or empty',
          detail: "package.json lacks a non-empty name."
        });
      }
      if (parsed.main === void 0 && parsed.exports === void 0) {
        findings.push({
          capability: "manifest",
          severity: "notice",
          file: "package.json",
          evidence: 'no "main" or "exports" entry',
          detail: "No resolvable entry point declared."
        });
      }
    } catch {
      findings.push({
        capability: "manifest",
        severity: "notice",
        file: "package.json",
        evidence: "(unparseable JSON)",
        detail: "package.json could not be parsed."
      });
    }
  }
  const patch = { present: false, inserts: 0, overrides: 0, deletes: 0 };
  const patchPath = path.join(dir, "cordis.patch.yml");
  const patchRaw = await fs.readFile(patchPath, "utf8").catch(() => void 0);
  if (patchRaw !== void 0) {
    patch.present = true;
    for (const rawLine of patchRaw.split("\n")) {
      const row = PATCH_ROW.exec(rawLine);
      if (!row) continue;
      if (row[1] === "insert") patch.inserts += 1;
      if (row[1] === "override") patch.overrides += 1;
      if (row[1] === "delete") patch.deletes += 1;
    }
    if (patch.overrides > 0 || patch.deletes > 0) {
      findings.push({
        capability: "patch-override",
        severity: "review",
        file: "cordis.patch.yml",
        evidence: `overrides: ${patch.overrides}, deletes: ${patch.deletes}`,
        detail: "The bundle patch overrides or removes existing plugin rows, replacing the behavior of other components."
      });
    }
  }
  const result = { dependencies, patch, findings };
  if (name !== void 0) result.name = name;
  if (version !== void 0) result.version = version;
  return result;
}

// (bundled from dsh-plugin-audit src/scanner/types.ts
function severityRank(severity) {
  switch (severity) {
    case "info":
      return 0;
    case "notice":
      return 1;
    case "review":
      return 2;
  }
}

// (bundled from dsh-plugin-audit src/scanner/walk.ts
import { promises as fs2 } from "node:fs";
import path2 from "node:path";
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
var SKIP_DIRECTORIES = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "lib",
  "dist",
  "build",
  "out",
  "coverage",
  ".pnpm-store"
]);
var MAX_FILES = 400;
var MAX_FILE_BYTES = 256 * 1024;
var MAX_DEPTH = 12;
function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
async function collectSourceFiles(dir) {
  const stat = await fs2.stat(dir).catch(() => void 0);
  if (!stat?.isDirectory()) {
    throw new Error(`audit target is not a readable directory: ${dir}`);
  }
  const files = [];
  let truncated = false;
  let skippedUnreadable = 0;
  async function visit(current, depth) {
    if (files.length >= MAX_FILES || depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    const entries = await fs2.readdir(current, { withFileTypes: true }).catch(() => {
      skippedUnreadable += 1;
      return void 0;
    });
    if (!entries) return;
    entries.sort((a, b) => byCodePoint(a.name, b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = path2.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path2.extname(entry.name))) continue;
      const handle = await fs2.open(full, "r").catch(() => {
        skippedUnreadable += 1;
        return void 0;
      });
      if (!handle) continue;
      try {
        const { size } = await handle.stat();
        const length = Math.min(size, MAX_FILE_BYTES);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        files.push({
          relativePath: path2.relative(dir, full).split(path2.sep).join("/"),
          content: buffer.subarray(0, bytesRead).toString("utf8")
        });
      } catch {
        skippedUnreadable += 1;
      } finally {
        await handle.close();
      }
    }
  }
  await visit(dir, 0);
  return { files, truncated, skippedUnreadable };
}

// (bundled from dsh-plugin-audit src/scanner/index.ts
async function auditPlugin(dir) {
  const absoluteDir = path3.resolve(dir);
  const [walk, manifest] = await Promise.all([
    collectSourceFiles(absoluteDir),
    analyzeManifest(absoluteDir)
  ]);
  const findings = [...manifest.findings];
  const envVars = /* @__PURE__ */ new Set();
  const sensitiveEnvVars = /* @__PURE__ */ new Set();
  const hosts = /* @__PURE__ */ new Set();
  const credentialPaths = /* @__PURE__ */ new Set();
  const inject = /* @__PURE__ */ new Set();
  let fsRead = false;
  let fsWrite = false;
  let subprocess = false;
  let network = false;
  let dynamicExec = false;
  for (const file of walk.files) {
    const detection = detectFile(file);
    for (const finding of detection.findings) {
      findings.push(finding);
      switch (finding.capability) {
        case "fs-read":
          fsRead = true;
          break;
        case "fs-write":
          fsWrite = true;
          break;
        case "subprocess":
          subprocess = true;
          break;
        case "network":
          network = true;
          break;
        case "dynamic-exec":
          dynamicExec = true;
          break;
        case "credential-access": {
          credentialPaths.add(finding.match ?? finding.evidence);
          break;
        }
        default:
          break;
      }
    }
    for (const name of detection.envVars) envVars.add(name);
    for (const name of detection.sensitiveEnvVars) sensitiveEnvVars.add(name);
    for (const host of detection.hosts) hosts.add(host);
    for (const service of detection.inject) inject.add(service);
  }
  if (walk.files.length === 0) {
    findings.push({
      capability: "manifest",
      severity: "notice",
      file: "(walk)",
      evidence: "0 source files scanned",
      detail: "No source files were scanned (build-output directories are skipped); review the shipped artifacts manually before installing."
    });
  }
  findings.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.line ?? 0) - (b.line ?? 0)
  );
  const risk = findings.reduce(
    (current, finding) => severityRank(finding.severity) > severityRank(current) ? finding.severity : current,
    "info"
  );
  const reviewCount = findings.filter((f) => f.severity === "review").length;
  const noticeCount = findings.filter((f) => f.severity === "notice").length;
  const summary = `${walk.files.length} files scanned; risk=${risk}; ${findings.length} findings (${reviewCount} review, ${noticeCount} notice, ${findings.length - reviewCount - noticeCount} info)`;
  const target = {
    dir: absoluteDir,
    filesScanned: walk.files.length,
    truncated: walk.truncated
  };
  if (walk.skippedUnreadable > 0) target.skippedUnreadable = walk.skippedUnreadable;
  if (manifest.name !== void 0) target.name = manifest.name;
  if (manifest.version !== void 0) target.version = manifest.version;
  return {
    target,
    permissions: {
      fsRead,
      fsWrite,
      subprocess,
      network,
      hosts: [...hosts].sort(),
      envVars: [...envVars].sort(),
      sensitiveEnvVars: [...sensitiveEnvVars].sort(),
      credentialPaths: [...credentialPaths].sort(),
      dynamicExec,
      inject: [...inject].sort(),
      dependencies: [...manifest.dependencies].sort(),
      patch: manifest.patch
    },
    findings,
    risk,
    summary,
    writesPerformed: false
  };
}
export {
  analyzeManifest,
  auditPlugin,
  collectSourceFiles,
  detectFile
};
