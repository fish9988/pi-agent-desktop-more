/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  defineTool,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import { userHome } from "./user-home.ts";

export interface DshPluginInfo {
  id: string; // package name, e.g. "dsh-supermemory", "dsh-image-studio", "dsh-claude-style"
  name: string;
  version: string;
  description: string;
  homepage?: string;
  installedPath: string;
  sourceKind: "pi-dsh" | "local-dsh";
  hasHostEntry: boolean;
  hasClientEntry: boolean;
  isSkin: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  registeredTools: string[];
  registeredRoutes: string[];
  error?: string;
}

export interface DshRegisteredTool {
  pluginId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  parameters: TSchema;
  output?: {
    schema?: unknown;
    render?: (args: unknown, value: unknown) => unknown;
    presentationMeta?: (args: unknown, value: unknown) => unknown;
  };
  execute: (
    args: Record<string, unknown>,
    exec: {
      cwd: string;
      signal?: AbortSignal;
      agent?: {
        session?: {
          id?: string;
          header?: { cwd?: string };
        };
      };
    },
  ) => Promise<unknown> | unknown;
}

export interface DshSystemPromptSection {
  pluginId: string;
  name: string;
  order: number;
  text: (ctx?: { scope?: unknown }) => string | Promise<string>;
}

interface DshRegisteredRoute {
  pluginId: string;
  path: string;
  kind: "exact" | "prefix";
  methods?: string[];
  fetch: (req: Request) => Promise<Response> | Response;
}

interface DshPluginsPersistedState {
  enabled: Record<string, boolean>;
  configs: Record<string, Record<string, unknown>>;
}

interface LoadedDshPluginRuntime {
  id: string;
  disposers: Array<() => void>;
  tools: Set<string>;
  routes: Set<string>;
  sections: Set<string>;
  error?: string;
}

type DshEventHandler = (...args: any[]) => any;

interface DshPluginHostSingleton {
  loaded: boolean;
  loadingPromise: Promise<void> | null;
  runtimes: Map<string, LoadedDshPluginRuntime>;
  routes: Map<string, DshRegisteredRoute>;
  prefixRoutes: Map<string, DshRegisteredRoute>;
  tools: Map<string, DshRegisteredTool>;
  systemPromptSections: Map<string, DshSystemPromptSection>;
  eventHandlers: Map<string, Set<{ pluginId: string; handler: DshEventHandler }>>;
  schemaDefaults: Map<string, Record<string, unknown>>;
  diagnostics: Map<string, string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __piDshPluginHost: DshPluginHostSingleton | undefined;
}

const CREDENTIALS_CONFIG_KEY = "__credentials__";

function getHostSingleton(): DshPluginHostSingleton {
  if (!globalThis.__piDshPluginHost) {
    globalThis.__piDshPluginHost = {
      loaded: false,
      loadingPromise: null,
      runtimes: new Map(),
      routes: new Map(),
      prefixRoutes: new Map(),
      tools: new Map(),
      systemPromptSections: new Map(),
      eventHandlers: new Map(),
      schemaDefaults: new Map(),
      diagnostics: new Map(),
    };
  }
  return globalThis.__piDshPluginHost;
}

function getStateFilePath(): string {
  return path.join(userHome(), ".pi", "agent", "desktop", "dsh-plugins.json");
}

function readPersistedState(): DshPluginsPersistedState {
  const file = getStateFilePath();
  try {
    if (!fs.existsSync(file)) {
      return { enabled: {}, configs: {} };
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") {
      return { enabled: {}, configs: {} };
    }
    const obj = raw as Record<string, unknown>;
    const enabled: Record<string, boolean> = {};
    if (obj.enabled && typeof obj.enabled === "object") {
      for (const [k, v] of Object.entries(obj.enabled as Record<string, unknown>)) {
        if (typeof v === "boolean") enabled[k] = v;
      }
    }
    const configs: Record<string, Record<string, unknown>> = {};
    if (obj.configs && typeof obj.configs === "object") {
      for (const [k, v] of Object.entries(obj.configs as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          configs[k] = { ...(v as Record<string, unknown>) };
        }
      }
    }
    return { enabled, configs };
  } catch {
    return { enabled: {}, configs: {} };
  }
}

function writePersistedState(state: DshPluginsPersistedState): void {
  const file = getStateFilePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function isDshPluginEnabled(id: string): boolean;
export function isDshPluginEnabled(state: DshPluginsPersistedState, id: string): boolean;
export function isDshPluginEnabled(
  stateOrId: DshPluginsPersistedState | string,
  maybeId?: string,
): boolean {
  const state = typeof stateOrId === "string" ? readPersistedState() : stateOrId;
  const id = typeof stateOrId === "string" ? stateOrId : (maybeId ?? "");
  if (Object.prototype.hasOwnProperty.call(state.enabled, id)) {
    return Boolean(state.enabled[id]);
  }
  return id === "dsh-claude-style";
}

export function setDshPluginEnabled(id: string, enabled: boolean): boolean {
  const state = readPersistedState();
  state.enabled[id] = Boolean(enabled);
  writePersistedState(state);
  return state.enabled[id];
}

export function getDshPluginConfig(id: string): Record<string, unknown> {
  const state = readPersistedState();
  const defaults = getHostSingleton().schemaDefaults.get(id) ?? {};
  const stored = state.configs[id] ?? {};
  return { ...defaults, ...stored };
}

export function setDshPluginConfig(
  id: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const state = readPersistedState();
  const current = state.configs[id] ?? {};
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  state.configs[id] = next;
  writePersistedState(state);
  return getDshPluginConfig(id);
}

function extractExportString(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>;
    for (const key of ["import", "default", "module", "node", "require"]) {
      const found = extractExportString(record[key]);
      if (found) return found;
    }
  }
  return undefined;
}

function resolveFileWithinPackage(pkgDir: string, relPath: string | undefined): string | null {
  if (!relPath || typeof relPath !== "string") return null;
  const resolved = path.resolve(pkgDir, relPath);
  const normalizedPkg = path.resolve(pkgDir);
  if (
    resolved !== normalizedPkg &&
    !resolved.startsWith(normalizedPkg + path.sep)
  ) {
    return null;
  }
  try {
    const stat = fs.statSync(resolved);
    return stat.isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function findHostEntryInPackage(pkgDir: string, pkgJson: Record<string, unknown>): string | null {
  const exportsField =
    pkgJson.exports && typeof pkgJson.exports === "object" && !Array.isArray(pkgJson.exports)
      ? (pkgJson.exports as Record<string, unknown>)
      : undefined;

  const candidates: Array<string | undefined> = [
    extractExportString(exportsField?.["."]),
    extractExportString(exportsField?.["./dsh"]),
    extractExportString(exportsField?.["./host"]),
    typeof pkgJson.main === "string" ? pkgJson.main : undefined,
    typeof pkgJson.module === "string" ? pkgJson.module : undefined,
    "lib/index.js",
    "lib/host/index.js",
    "dist/index.js",
    "index.js",
  ];

  for (const candidate of candidates) {
    const resolved = resolveFileWithinPackage(pkgDir, candidate);
    if (resolved && /\.(?:m?js|cjs)$/i.test(resolved)) {
      return resolved;
    }
  }
  return null;
}

function findClientEntryInPackage(pkgDir: string, pkgJson: Record<string, unknown>): string | null {
  const exportsField =
    pkgJson.exports && typeof pkgJson.exports === "object" && !Array.isArray(pkgJson.exports)
      ? (pkgJson.exports as Record<string, unknown>)
      : undefined;
  const dshField =
    pkgJson.dsh && typeof pkgJson.dsh === "object" && !Array.isArray(pkgJson.dsh)
      ? (pkgJson.dsh as Record<string, unknown>)
      : undefined;
  const dshClient =
    dshField?.client && typeof dshField.client === "object" && !Array.isArray(dshField.client)
      ? (dshField.client as Record<string, unknown>)
      : undefined;

  const candidates: Array<string | undefined> = [
    extractExportString(exportsField?.["./client"]),
    typeof dshClient?.entry === "string" ? dshClient.entry : undefined,
    "lib/client.js",
    "dist/client.js",
    "client/client.js",
    "client.js",
  ];

  for (const candidate of candidates) {
    const resolved = resolveFileWithinPackage(pkgDir, candidate);
    if (resolved && /\.(?:m?js|cjs)$/i.test(resolved)) {
      return resolved;
    }
  }
  return null;
}

function isDshPluginPackage(pkgDir: string, pkgJson: Record<string, unknown>): boolean {
  const hasDshField = Boolean(pkgJson.dsh && typeof pkgJson.dsh === "object");
  const hasSkinJson = fs.existsSync(path.join(pkgDir, "skin.json"));
  if (hasDshField || hasSkinJson) return true;

  const pkgName = typeof pkgJson.name === "string" ? pkgJson.name : "";
  const exportsField =
    pkgJson.exports && typeof pkgJson.exports === "object" && !Array.isArray(pkgJson.exports)
      ? (pkgJson.exports as Record<string, unknown>)
      : undefined;
  const hasClientExportOrMain =
    Boolean(exportsField?.["./client"]) || typeof pkgJson.main === "string";

  if ((pkgName.startsWith("dsh-") || pkgName.startsWith("dshmarket")) && hasClientExportOrMain) {
    return true;
  }
  return false;
}

interface DiscoveredPluginCandidate {
  id: string;
  name: string;
  version: string;
  description: string;
  homepage?: string;
  installedPath: string;
  sourceKind: "pi-dsh" | "local-dsh";
  hasHostEntry: boolean;
  hasClientEntry: boolean;
  hostEntryPath: string | null;
  clientEntryPath: string | null;
  isSkin: boolean;
}

function scanNodeModulesRoot(
  nodeModulesDir: string,
  sourceKind: "pi-dsh" | "local-dsh",
  seen: Set<string>,
): DiscoveredPluginCandidate[] {
  if (!fs.existsSync(nodeModulesDir)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeModulesDir);
  } catch {
    return [];
  }

  const packageDirs: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = path.join(nodeModulesDir, entry);
    if (entry.startsWith("@")) {
      try {
        for (const scopedEntry of fs.readdirSync(fullPath)) {
          if (!scopedEntry.startsWith(".")) {
            packageDirs.push(path.join(fullPath, scopedEntry));
          }
        }
      } catch {
        // Ignore unreadable scope dir
      }
    } else {
      packageDirs.push(fullPath);
    }
  }

  const results: DiscoveredPluginCandidate[] = [];
  for (const pkgDir of packageDirs) {
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!pkgJson || typeof pkgJson !== "object") continue;
    if (!isDshPluginPackage(pkgDir, pkgJson)) continue;

    const id = typeof pkgJson.name === "string" && pkgJson.name.trim()
      ? pkgJson.name.trim()
      : path.basename(pkgDir);
    if (seen.has(id)) continue;
    seen.add(id);

    const isSkin = fs.existsSync(path.join(pkgDir, "skin.json"));
    let displayName = id;
    if (isSkin) {
      try {
        const skinJson = JSON.parse(
          fs.readFileSync(path.join(pkgDir, "skin.json"), "utf8"),
        ) as Record<string, unknown>;
        if (typeof skinJson.name === "string" && skinJson.name.trim()) {
          displayName = skinJson.name.trim();
        }
      } catch {
        // Ignore malformed skin.json
      }
    }

    const hostEntryPath = findHostEntryInPackage(pkgDir, pkgJson);
    const clientEntryPath = findClientEntryInPackage(pkgDir, pkgJson);
    const version = typeof pkgJson.version === "string" ? pkgJson.version : "0.0.0";
    const description = typeof pkgJson.description === "string" ? pkgJson.description : "";
    const homepage = typeof pkgJson.homepage === "string" ? pkgJson.homepage : undefined;

    results.push({
      id,
      name: displayName,
      version,
      description,
      ...(homepage ? { homepage } : {}),
      installedPath: pkgDir,
      sourceKind,
      hasHostEntry: hostEntryPath !== null,
      hasClientEntry: clientEntryPath !== null,
      hostEntryPath,
      clientEntryPath,
      isSkin,
    });
  }

  return results;
}

const PRIORITY_DSH_PLUGIN_ORDER: Record<string, number> = {
  "dsh-supermemory": 1,
  "dsh-image-studio": 2,
  "dsh-exa-search": 3,
  "dsh-skill-mcp-panel": 4,
  "dsh-rewind-plugin": 5,
  "@michengai/dsh-archive-manager": 6,
  "billion-context": 7,
  "ds-harness-remote": 8,
  "dsh-unlag": 9,
  "dsh-claude-theme": 10,
  "dsh-claude-style": 11,
  "dshmarket": 12,
};

function discoverDshPluginCandidates(): DiscoveredPluginCandidate[] {
  const home = userHome();
  const piDshModules = path.join(home, ".pi", "agent", "dsh-plugins", "node_modules");
  const localDshModules = path.join(home, ".dsh", "profiles", "desktop", "node_modules");

  const seen = new Set<string>();
  const combined = [
    ...scanNodeModulesRoot(piDshModules, "pi-dsh", seen),
    ...scanNodeModulesRoot(localDshModules, "local-dsh", seen),
  ];

  if (!seen.has("dsh-claude-style")) {
    seen.add("dsh-claude-style");
    combined.push({
      id: "dsh-claude-style",
      name: "Claude Code Style",
      version: "0.19.6",
      description:
        "Claude Code Desktop theme for DeepSeek Harness (dsh) web GUI — visual & interaction overhaul",
      homepage: "https://github.com/Nwflower/dsh-claude-style#readme",
      installedPath: "builtin:dsh-claude-style",
      sourceKind: "pi-dsh",
      hasHostEntry: false,
      hasClientEntry: true,
      hostEntryPath: null,
      clientEntryPath: null,
      isSkin: true,
    });
  }

  combined.sort((a, b) => {
    const rankA = PRIORITY_DSH_PLUGIN_ORDER[a.id] ?? 100;
    const rankB = PRIORITY_DSH_PLUGIN_ORDER[b.id] ?? 100;
    if (rankA !== rankB) return rankA - rankB;
    return a.id.localeCompare(b.id);
  });

  return combined;
}

export function resolveDshPluginHostEntry(id: string): string | null {
  const found = discoverDshPluginCandidates().find((p) => p.id === id);
  return found?.hostEntryPath ?? null;
}

export function resolveDshPluginClientEntry(id: string): string | null {
  const found = discoverDshPluginCandidates().find((p) => p.id === id);
  return found?.clientEntryPath ?? null;
}

function extractDescriptionFromMeta(desc: unknown): string | undefined {
  if (typeof desc === "string" && desc.trim()) return desc.trim();
  if (desc && typeof desc === "object" && !Array.isArray(desc)) {
    const record = desc as Record<string, unknown>;
    for (const key of ["zh-CN", "zh", "en", ""]) {
      if (typeof record[key] === "string" && (record[key] as string).trim()) {
        return (record[key] as string).trim();
      }
    }
    for (const val of Object.values(record)) {
      if (typeof val === "string" && val.trim()) return val.trim();
    }
  }
  return undefined;
}

function isSchemasteryNode(schema: unknown): boolean {
  if (!schema) return false;
  if (typeof schema === "function") return true;
  if (typeof schema === "object") {
    const s = schema as Record<PropertyKey, unknown>;
    if (s[Symbol.for("schemastery")]) return true;
    if (typeof s.type === "string" && ("dict" in s || "inner" in s || "list" in s || "meta" in s)) {
      return !("properties" in s);
    }
  }
  return false;
}

export function convertSchemasteryToJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) {
    return { type: "object", properties: {} };
  }

  if (!isSchemasteryNode(schema)) {
    if (typeof schema === "object" && !Array.isArray(schema)) {
      const plain = schema as Record<string, unknown>;
      return {
        ...plain,
        type: typeof plain.type === "string" ? plain.type : "object",
      };
    }
    return { type: "object", properties: {} };
  }

  const node = schema as {
    type?: string;
    meta?: {
      description?: unknown;
      default?: unknown;
      required?: boolean;
      min?: number;
      max?: number;
      step?: number;
      pattern?: { source?: string };
    };
    dict?: Record<string, unknown>;
    inner?: unknown;
    list?: unknown[];
    value?: unknown;
  };

  const metaFields: Record<string, unknown> = {};
  const description = extractDescriptionFromMeta(node.meta?.description);
  if (description) metaFields.description = description;
  if (node.meta?.default !== undefined) metaFields.default = node.meta.default;

  switch (node.type) {
    case "object": {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, propSchema] of Object.entries(node.dict ?? {})) {
        properties[key] = convertSchemasteryToJsonSchema(propSchema);
        const propMeta = (propSchema as { meta?: { required?: boolean; default?: unknown } } | undefined)?.meta;
        if (propMeta?.required === true && propMeta?.default === undefined) {
          required.push(key);
        }
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
        ...metaFields,
      };
    }
    case "string":
      return {
        type: "string",
        ...(node.meta?.pattern?.source ? { pattern: node.meta.pattern.source } : {}),
        ...metaFields,
      };
    case "number":
    case "percent":
      return {
        type: "number",
        ...(typeof node.meta?.min === "number" ? { minimum: node.meta.min } : {}),
        ...(typeof node.meta?.max === "number" ? { maximum: node.meta.max } : {}),
        ...metaFields,
      };
    case "natural":
      return {
        type: "integer",
        minimum: typeof node.meta?.min === "number" ? node.meta.min : 0,
        ...(typeof node.meta?.max === "number" ? { maximum: node.meta.max } : {}),
        ...metaFields,
      };
    case "boolean":
      return {
        type: "boolean",
        ...metaFields,
      };
    case "array":
      return {
        type: "array",
        items: node.inner ? convertSchemasteryToJsonSchema(node.inner) : {},
        ...(typeof node.meta?.min === "number" ? { minItems: node.meta.min } : {}),
        ...(typeof node.meta?.max === "number" ? { maxItems: node.meta.max } : {}),
        ...metaFields,
      };
    case "dict":
      return {
        type: "object",
        additionalProperties: node.inner ? convertSchemasteryToJsonSchema(node.inner) : true,
        ...metaFields,
      };
    case "const":
      return {
        const: node.value,
        ...metaFields,
      };
    case "union": {
      const list = Array.isArray(node.list) ? node.list : [];
      const enumValues: unknown[] = [];
      let allLiterals = list.length > 0;
      for (const item of list) {
        if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
          enumValues.push(item);
        } else if ((typeof item === "function" || typeof item === "object") && (item as any).type === "const") {
          enumValues.push((item as any).value);
        } else {
          allLiterals = false;
          break;
        }
      }
      if (allLiterals) {
        return { enum: enumValues, ...metaFields };
      }
      return {
        anyOf: list.map((item) => convertSchemasteryToJsonSchema(item)),
        ...metaFields,
      };
    }
    case "intersect": {
      const list = Array.isArray(node.list) ? node.list : [];
      const mergedProps: Record<string, unknown> = {};
      const mergedReq = new Set<string>();
      for (const item of list) {
        const sub = convertSchemasteryToJsonSchema(item);
        if (sub.properties && typeof sub.properties === "object") {
          Object.assign(mergedProps, sub.properties);
        }
        if (Array.isArray(sub.required)) {
          for (const reqKey of sub.required) {
            if (typeof reqKey === "string") mergedReq.add(reqKey);
          }
        }
      }
      return {
        type: "object",
        properties: mergedProps,
        ...(mergedReq.size > 0 ? { required: [...mergedReq] } : {}),
        ...metaFields,
      };
    }
    case "transform":
      return node.inner
        ? convertSchemasteryToJsonSchema(node.inner)
        : { type: "object", properties: {}, ...metaFields };
    default:
      return { type: "object", properties: {}, ...metaFields };
  }
}

function toTypeBoxParameters(rawSchema: unknown): {
  jsonSchema: Record<string, unknown>;
  parameters: TSchema;
} {
  const converted = convertSchemasteryToJsonSchema(rawSchema);
  const jsonSchema: Record<string, unknown> =
    converted.type === "object"
      ? {
          ...converted,
          type: "object",
          properties:
            converted.properties && typeof converted.properties === "object"
              ? converted.properties
              : {},
        }
      : {
          type: "object",
          properties: {
            value: converted,
          },
        };
  return {
    jsonSchema,
    parameters: Type.Unsafe<Record<string, unknown>>(jsonSchema),
  };
}

function extractSchemaDefaults(schema: unknown): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (!schema || (typeof schema !== "function" && typeof schema !== "object")) {
    return defaults;
  }
  const node = schema as {
    meta?: { default?: unknown };
    dict?: Record<string, { meta?: { default?: unknown } }>;
  };
  if (node.meta?.default && typeof node.meta.default === "object" && !Array.isArray(node.meta.default)) {
    Object.assign(defaults, node.meta.default as Record<string, unknown>);
  }
  if (node.dict && typeof node.dict === "object") {
    for (const [k, field] of Object.entries(node.dict)) {
      if (field?.meta?.default !== undefined) {
        defaults[k] = field.meta.default;
      }
    }
  }
  return defaults;
}

function createPluginConfigProxy(pluginId: string): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        const current = getDshPluginConfig(pluginId);
        return current[prop];
      },
      ownKeys() {
        return Object.keys(getDshPluginConfig(pluginId));
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== "string") return undefined;
        const current = getDshPluginConfig(pluginId);
        if (!(prop in current)) return undefined;
        return {
          configurable: true,
          enumerable: true,
          value: current[prop],
        };
      },
    },
  );
}

function readDshCredentialsFile(): Record<string, string> {
  const file = path.join(userHome(), ".dsh", ".credentials.yaml");
  try {
    if (!fs.existsSync(file)) return {};
    const content = fs.readFileSync(file, "utf8");
    const out: Record<string, string> = {};
    let inRefs = false;
    for (const rawLine of content.split(/\r?\n/)) {
      if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
      if (/^[A-Za-z0-9_-]+\s*:/.test(rawLine)) {
        inRefs = /^refs\s*:/.test(rawLine);
        continue;
      }
      if (inRefs) {
        const match = rawLine.match(/^\s{2,}([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/);
        if (match) {
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) out[match[1]] = val;
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function createCredentialsService() {
  function readStore(): Record<string, string> {
    const cfg = getDshPluginConfig(CREDENTIALS_CONFIG_KEY);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  }

  return {
    async describe(ref: string) {
      const store = readStore();
      if (store[ref]) {
        return { configured: true, writable: true, source: "file" };
      }
      const dshFileCreds = readDshCredentialsFile();
      if (dshFileCreds[ref]) {
        return { configured: true, writable: true, source: "file" };
      }
      if (process.env[ref]?.trim()) {
        return { configured: true, writable: false, source: "env" };
      }
      return { configured: false, writable: true, source: null };
    },
    async resolve(ref: string) {
      const store = readStore();
      if (store[ref]) {
        return { value: store[ref], source: "file" };
      }
      const dshFileCreds = readDshCredentialsFile();
      if (dshFileCreds[ref]) {
        return { value: dshFileCreds[ref], source: "file" };
      }
      if (process.env[ref]?.trim()) {
        return { value: process.env[ref]!.trim(), source: "env" };
      }
      return undefined;
    },
    async set(ref: string, value: string) {
      setDshPluginConfig(CREDENTIALS_CONFIG_KEY, { [ref]: value });
    },
    async unset(ref: string) {
      setDshPluginConfig(CREDENTIALS_CONFIG_KEY, { [ref]: undefined });
    },
  };
}

function adaptNodeHandlerToFetch(
  handler: (req: any, res: any) => unknown,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const bodyBuffer =
      request.method !== "GET" && request.method !== "HEAD"
        ? Buffer.from(await request.arrayBuffer())
        : Buffer.alloc(0);

    const parsedUrl = new URL(request.url, "http://localhost");
    const headersObj: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });
    headersObj.host = "localhost";
    headersObj["sec-fetch-site"] = "same-origin";
    delete headersObj.origin;

    return await new Promise<Response>((resolve) => {
      let statusCode = 200;
      const resHeaders = new Headers();
      const finishListeners: Array<() => void> = [];
      let settled = false;

      const finish = (body: BodyInit | null) => {
        if (settled) return;
        settled = true;
        for (const cb of finishListeners) {
          try {
            cb();
          } catch {
            // ignore
          }
        }
        resolve(
          new Response(request.method === "HEAD" ? null : body, {
            status: statusCode,
            headers: resHeaders,
          }),
        );
      };

      const req = {
        method: request.method,
        url: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: headersObj,
        socket: { remoteAddress: "127.0.0.1" },
        on(event: string, cb: (...args: any[]) => void) {
          if (event === "data") {
            if (bodyBuffer.length > 0) queueMicrotask(() => cb(bodyBuffer));
          } else if (event === "end") {
            queueMicrotask(() => cb());
          }
          return req;
        },
        destroy() {},
      };

      const res = {
        headersSent: false,
        writeHead(status: number, hdrs?: Record<string, string>) {
          res.headersSent = true;
          statusCode = status;
          if (hdrs) {
            for (const [k, v] of Object.entries(hdrs)) {
              if (v !== undefined) resHeaders.set(k, String(v));
            }
          }
          return res;
        },
        setHeader(name: string, value: string) {
          resHeaders.set(name, String(value));
        },
        once(event: string, cb: () => void) {
          if (event === "finish") finishListeners.push(cb);
          return res;
        },
        end(chunk?: Buffer | Uint8Array | string) {
          res.headersSent = true;
          if (chunk === undefined || chunk === null) {
            finish(null);
          } else if (typeof chunk === "string") {
            finish(chunk);
          } else {
            finish(new Uint8Array(chunk));
          }
        },
        destroy() {
          finish(null);
        },
      };

      try {
        const maybePromise = handler(req, res);
        if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === "function") {
          (maybePromise as Promise<unknown>).catch((err) => {
            statusCode = 500;
            finish(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
          });
        }
      } catch (err) {
        statusCode = 500;
        finish(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
  };
}

function unloadPluginRuntime(host: DshPluginHostSingleton, pluginId: string): void {
  const runtime = host.runtimes.get(pluginId);
  if (!runtime) return;

  for (const dispose of runtime.disposers.splice(0)) {
    try {
      dispose();
    } catch {
      // Ignore cleanup errors
    }
  }

  for (const toolName of runtime.tools) {
    if (host.tools.get(toolName)?.pluginId === pluginId) {
      host.tools.delete(toolName);
    }
  }
  for (const routePath of runtime.routes) {
    if (host.routes.get(routePath)?.pluginId === pluginId) {
      host.routes.delete(routePath);
    }
    if (host.prefixRoutes.get(routePath)?.pluginId === pluginId) {
      host.prefixRoutes.delete(routePath);
    }
  }
  for (const sectionName of runtime.sections) {
    if (host.systemPromptSections.get(sectionName)?.pluginId === pluginId) {
      host.systemPromptSections.delete(sectionName);
    }
  }
  for (const set of host.eventHandlers.values()) {
    for (const item of [...set]) {
      if (item.pluginId === pluginId) {
        set.delete(item);
      }
    }
  }

  host.runtimes.delete(pluginId);
}

function createPluginHostContext(
  host: DshPluginHostSingleton,
  runtime: LoadedDshPluginRuntime,
) {
  const pluginId = runtime.id;
  const credentials = createCredentialsService();
  const dshHomeResolver = (...segs: string[]) => path.join(userHome(), ".dsh", ...segs);

  const registerFetchRoute = (spec: {
    path: string;
    methods?: string[];
    fetch: (req: Request) => Promise<Response> | Response;
  }) => {
    if (!spec || typeof spec.path !== "string" || typeof spec.fetch !== "function") {
      return () => {};
    }
    const routePath = spec.path.startsWith("/") ? spec.path : `/${spec.path}`;
    const entry: DshRegisteredRoute = {
      pluginId,
      path: routePath,
      kind: "exact",
      methods: spec.methods,
      fetch: spec.fetch,
    };
    host.routes.set(routePath, entry);
    runtime.routes.add(routePath);
    return () => {
      if (host.routes.get(routePath) === entry) {
        host.routes.delete(routePath);
      }
      runtime.routes.delete(routePath);
    };
  };

  const webServer = {
    register(spec: {
      kind?: "exact" | "prefix";
      path: string;
      handler: (req: any, res: any) => unknown;
    }) {
      if (!spec || typeof spec.path !== "string" || typeof spec.handler !== "function") {
        return () => {};
      }
      const routePath = spec.path.startsWith("/") ? spec.path : `/${spec.path}`;
      const kind = spec.kind === "prefix" ? "prefix" : "exact";
      const entry: DshRegisteredRoute = {
        pluginId,
        path: routePath,
        kind,
        fetch: adaptNodeHandlerToFetch(spec.handler),
      };
      if (kind === "prefix") {
        host.prefixRoutes.set(routePath, entry);
      } else {
        host.routes.set(routePath, entry);
      }
      runtime.routes.add(routePath);
      return () => {
        if (kind === "prefix" && host.prefixRoutes.get(routePath) === entry) {
          host.prefixRoutes.delete(routePath);
        } else if (host.routes.get(routePath) === entry) {
          host.routes.delete(routePath);
        }
        runtime.routes.delete(routePath);
      };
    },
  };

  const connection = {
    requestRejection: () => undefined,
    fetch: {
      register: registerFetchRoute,
    },
  };

  const tools = {
    get(name: string) {
      return host.tools.get(name);
    },
    register(spec: {
      name: string;
      description?: string;
      input?: unknown;
      parameters?: unknown;
      output?: DshRegisteredTool["output"];
      execute: DshRegisteredTool["execute"];
    }) {
      if (!spec || typeof spec.name !== "string" || typeof spec.execute !== "function") {
        return () => {};
      }
      const rawSchema = spec.input ?? spec.parameters;
      const { jsonSchema, parameters } = toTypeBoxParameters(rawSchema);
      const toolEntry: DshRegisteredTool = {
        pluginId,
        name: spec.name,
        description: typeof spec.description === "string" ? spec.description : spec.name,
        inputSchema: jsonSchema,
        parameters,
        output: spec.output,
        execute: spec.execute,
      };
      host.tools.set(spec.name, toolEntry);
      runtime.tools.add(spec.name);
      return () => {
        if (host.tools.get(spec.name) === toolEntry) {
          host.tools.delete(spec.name);
        }
        runtime.tools.delete(spec.name);
      };
    },
  };

  const systemPrompt = {
    section(spec: {
      name: string;
      order?: number;
      text: (ctx?: { scope?: unknown }) => string | Promise<string>;
    }) {
      if (!spec || typeof spec.name !== "string" || typeof spec.text !== "function") {
        return () => {};
      }
      const entry: DshSystemPromptSection = {
        pluginId,
        name: spec.name,
        order: typeof spec.order === "number" ? spec.order : 1000,
        text: spec.text,
      };
      host.systemPromptSections.set(spec.name, entry);
      runtime.sections.add(spec.name);
      return () => {
        if (host.systemPromptSections.get(spec.name) === entry) {
          host.systemPromptSections.delete(spec.name);
        }
        runtime.sections.delete(spec.name);
      };
    },
  };

  const settings = {
    get: () => getDshPluginConfig(pluginId),
    configure: () => () => {},
  };

  const llm = {
    listRoutable: async () => [],
    listProviders: () => [],
    listModels: async () => [],
    resolveModelInfo: async () => undefined,
  };

  const web = {
    searchProviderId: "exa",
    registerSearchProvider: () => () => {},
  };

  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  const ctx: Record<string, any> = {
    fiber: {},
    connection,
    webServer,
    web,
    tools,
    systemPrompt,
    settings,
    llm,
    logger,
    effect(fn: () => unknown, _label?: string) {
      try {
        const dispose = fn();
        if (typeof dispose === "function") {
          runtime.disposers.push(dispose as () => void);
          return dispose;
        }
      } catch {
        // Ignore effect startup error
      }
      return () => {};
    },
    inject(_deps: unknown, fn: (scope: any) => unknown) {
      if (typeof fn === "function") {
        fn(ctx);
      }
    },
    get(key: string) {
      switch (key) {
        case "dshHomePath":
          return dshHomeResolver;
        case "connection":
          return connection;
        case "credentials":
          return credentials;
        case "webServer":
          return webServer;
        case "tools":
          return tools;
        case "settings":
          return settings;
        case "llm":
          return llm;
        case "sessions":
          return { get: () => undefined, list: () => [] };
        case "agents":
          return { roots: () => [] };
        default:
          return undefined;
      }
    },
    on(event: string, handler: DshEventHandler) {
      if (typeof event !== "string" || typeof handler !== "function") {
        return () => {};
      }
      let set = host.eventHandlers.get(event);
      if (!set) {
        set = new Set();
        host.eventHandlers.set(event, set);
      }
      const record = { pluginId, handler };
      set.add(record);
      return () => {
        set?.delete(record);
      };
    },
    provide() {
      return () => {};
    },
    set() {
      return () => {};
    },
  };

  ctx.scope = ctx;
  return ctx;
}

async function loadEnabledPluginsInternal(forceReload: boolean): Promise<void> {
  const host = getHostSingleton();
  const candidates = discoverDshPluginCandidates();
  const state = readPersistedState();

  if (forceReload) {
    for (const existingId of [...host.runtimes.keys()]) {
      unloadPluginRuntime(host, existingId);
    }
    host.diagnostics.clear();
  } else {
    // Unload any plugins that were disabled or removed
    const enabledIds = new Set(
      candidates.filter((c) => isDshPluginEnabled(state, c.id) && c.hasHostEntry).map((c) => c.id),
    );
    for (const existingId of [...host.runtimes.keys()]) {
      if (!enabledIds.has(existingId)) {
        unloadPluginRuntime(host, existingId);
      }
    }
  }

  for (const candidate of candidates) {
    const isEnabled = isDshPluginEnabled(state, candidate.id);
    if (!isEnabled || !candidate.hasHostEntry || !candidate.hostEntryPath) {
      continue;
    }
    if (host.runtimes.has(candidate.id)) {
      continue;
    }

    // Pure marketplace package requiring DSH internal binary
    if (candidate.id === "dshmarket") {
      continue;
    }

    const runtime: LoadedDshPluginRuntime = {
      id: candidate.id,
      disposers: [],
      tools: new Set(),
      routes: new Set(),
      sections: new Set(),
    };
    host.runtimes.set(candidate.id, runtime);

    try {
      const fileUrl = pathToFileURL(candidate.hostEntryPath).href;
      const mod = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ fileUrl
      )) as Record<string, any>;

      const configSchema = mod?.Config ?? mod?.default?.Config;
      if (configSchema) {
        const defaults = extractSchemaDefaults(configSchema);
        if (Object.keys(defaults).length > 0) {
          host.schemaDefaults.set(candidate.id, defaults);
        }
      }

      const applyFn =
        typeof mod?.apply === "function"
          ? mod.apply
          : typeof mod?.default === "function"
            ? mod.default
            : typeof mod?.default?.apply === "function"
              ? mod.default.apply
              : null;

      if (applyFn) {
        const ctx = createPluginHostContext(host, runtime);
        const configProxy = createPluginConfigProxy(candidate.id);
        await applyFn(ctx, configProxy);
        // Allow async state initialization (e.g. dsh-image-studio state.ready.then) to register tools
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      host.diagnostics.delete(candidate.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtime.error = message;
      host.diagnostics.set(candidate.id, message);
    }
  }

  host.loaded = true;
}

export async function ensureDshHostPluginsLoaded(forceReload = false): Promise<void> {
  const host = getHostSingleton();
  if (host.loaded && !forceReload) return;
  if (host.loadingPromise) {
    await host.loadingPromise;
    if (!forceReload) return;
  }
  const promise = loadEnabledPluginsInternal(forceReload).finally(() => {
    if (host.loadingPromise === promise) {
      host.loadingPromise = null;
    }
  });
  host.loadingPromise = promise;
  await promise;
}

export async function reloadDshHostPlugins(): Promise<void> {
  await ensureDshHostPluginsLoaded(true);
}

export async function listDshPlugins(): Promise<DshPluginInfo[]> {
  await ensureDshHostPluginsLoaded();
  const host = getHostSingleton();
  const state = readPersistedState();
  const candidates = discoverDshPluginCandidates();

  return candidates.map((candidate) => {
    const enabled = isDshPluginEnabled(state, candidate.id);
    const runtime = host.runtimes.get(candidate.id);
    const error = host.diagnostics.get(candidate.id);
    return {
      id: candidate.id,
      name: candidate.name,
      version: candidate.version,
      description: candidate.description,
      ...(candidate.homepage ? { homepage: candidate.homepage } : {}),
      installedPath: candidate.installedPath,
      sourceKind: candidate.sourceKind,
      hasHostEntry: candidate.hasHostEntry,
      hasClientEntry: candidate.hasClientEntry,
      isSkin: candidate.isSkin,
      enabled,
      config: getDshPluginConfig(candidate.id),
      registeredTools: runtime ? [...runtime.tools] : [],
      registeredRoutes: runtime ? [...runtime.routes] : [],
      ...(error ? { error } : {}),
    };
  });
}

export async function dispatchDshPluginRoute(
  rawPath: string,
  request: Request,
): Promise<Response> {
  await ensureDshHostPluginsLoaded();
  const host = getHostSingleton();

  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const apiPrefixedPath = normalizedPath.startsWith("/api/")
    ? normalizedPath
    : `/api${normalizedPath}`;
  const strippedApiPath = normalizedPath.startsWith("/api/")
    ? normalizedPath.slice(4) || "/"
    : normalizedPath;

  let matchedRoute: DshRegisteredRoute | undefined;
  let effectivePath = normalizedPath;

  for (const candidatePath of [normalizedPath, apiPrefixedPath, strippedApiPath]) {
    const found = host.routes.get(candidatePath);
    if (found) {
      matchedRoute = found;
      effectivePath = candidatePath;
      break;
    }
  }

  if (!matchedRoute) {
    for (const candidatePath of [normalizedPath, apiPrefixedPath, strippedApiPath]) {
      for (const [prefix, route] of host.prefixRoutes.entries()) {
        if (candidatePath === prefix || candidatePath.startsWith(`${prefix}/`)) {
          matchedRoute = route;
          effectivePath = candidatePath;
          break;
        }
      }
      if (matchedRoute) break;
    }
  }

  if (!matchedRoute) {
    return Response.json(
      { ok: false, error: `No DSH plugin route registered for ${normalizedPath}` },
      { status: 404 },
    );
  }

  if (
    Array.isArray(matchedRoute.methods) &&
    matchedRoute.methods.length > 0 &&
    !matchedRoute.methods.map((m) => m.toUpperCase()).includes(request.method.toUpperCase())
  ) {
    return Response.json(
      { ok: false, error: `Method ${request.method} not allowed for ${effectivePath}` },
      { status: 405, headers: { Allow: matchedRoute.methods.join(", ") } },
    );
  }

  const incomingUrl = new URL(request.url, "http://localhost");
  const targetUrl = new URL(effectivePath + incomingUrl.search, incomingUrl.origin);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const bodyBytes = hasBody ? await request.arrayBuffer() : undefined;

  const forwardedRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    ...(hasBody && bodyBytes ? { body: bodyBytes } : {}),
    signal: request.signal,
  });

  return await matchedRoute.fetch(forwardedRequest);
}

function sanitizeSystemPromptSectionName(rawName: string): string {
  const cleaned = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[^a-z]+/, "dsh_")
    .replace(/_+/g, "_");
  if (!cleaned || cleaned === "preamble") {
    return "dsh_plugin_section";
  }
  return cleaned;
}

function formatDshToolOutput(
  tool: DshRegisteredTool,
  params: Record<string, unknown>,
  res: unknown,
): string {
  if (typeof res === "string") return res;
  if (res && typeof res === "object") {
    const obj = res as Record<string, unknown>;
    if (typeof obj.content === "string") return obj.content;
    if (Array.isArray(obj.content)) {
      const texts = obj.content
        .map((block) =>
          block && typeof block === "object" && typeof (block as any).text === "string"
            ? (block as any).text
            : "",
        )
        .filter(Boolean);
      if (texts.length > 0) return texts.join("\n");
    }
    if (typeof obj.text === "string") return obj.text;
    if (typeof tool.output?.render === "function") {
      try {
        const rendered = tool.output.render(params, res);
        if (typeof rendered === "string") return rendered;
        if (Array.isArray(rendered)) {
          const texts = rendered
            .map((block) =>
              block && typeof block === "object" && typeof (block as any).text === "string"
                ? (block as any).text
                : "",
            )
            .filter(Boolean);
          if (texts.length > 0) return texts.join("\n");
        }
      } catch {
        // Fallback to JSON
      }
    }
  }
  return JSON.stringify(res);
}

export function createDshPluginsExtension(): InlineExtension {
  return {
    name: "builtin:dsh-plugins",
    hidden: true,
    factory: async (pi) => {
      await ensureDshHostPluginsLoaded();
      const host = getHostSingleton();

      for (const tool of host.tools.values()) {
        pi.registerTool(
          defineTool({
            name: tool.name,
            label: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            async execute(_toolCallId, params, signal, _onUpdate, ctx) {
              const args =
                params && typeof params === "object"
                  ? (params as Record<string, unknown>)
                  : {};
              const res = await tool.execute(args, {
                cwd: ctx.cwd,
                signal,
                agent: {
                  session: {
                    header: { cwd: ctx.cwd },
                  },
                },
              });
              const text = formatDshToolOutput(tool, args, res);
              return {
                content: [{ type: "text", text }],
                details: res,
              };
            },
          }),
        );
      }

      pi.on("before_agent_start", async (event, ctx) => {
        await ensureDshHostPluginsLoaded();
        const orderedSections = [...host.systemPromptSections.values()].sort(
          (a, b) => a.order - b.order,
        );
        for (const section of orderedSections) {
          try {
            const text = await section.text({ scope: { cwd: ctx.cwd } });
            const key = sanitizeSystemPromptSectionName(section.name);
            if (typeof text === "string" && text.trim()) {
              event.systemPromptOptions.sections[key] = text.trim();
            } else {
              delete event.systemPromptOptions.sections[key];
            }
          } catch {
            // Ignore section evaluation errors
          }
        }
        return undefined;
      });

      pi.on("turn_end", async (_event, ctx) => {
        const handlers = host.eventHandlers.get("agent/turn-stopping");
        if (!handlers || handlers.size === 0) return undefined;
        const payload = {
          cwd: ctx.cwd,
          agent: {
            session: {
              header: { cwd: ctx.cwd },
            },
          },
        };
        for (const { handler } of handlers) {
          try {
            await handler(payload);
          } catch {
            // Ignore turn-stopping errors
          }
        }
        return undefined;
      });
    },
  };
}
