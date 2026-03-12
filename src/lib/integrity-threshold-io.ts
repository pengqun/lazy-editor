/**
 * Import/export of integrity health threshold configuration (JSON).
 *
 * Export payload includes global defaults and per-workspace overrides.
 * Import validates strictly and applies settings immediately.
 */

import {
  type HealthThresholdSettings,
  clampThresholdSettings,
  loadThresholdSettings,
  loadWorkspaceThresholdSettings,
  saveThresholdSettings,
  saveWorkspaceThresholdSettings,
} from "./integrity-health";

// --- Schema types ---

export const CURRENT_SCHEMA_VERSION = 1;
export const CONFIG_KIND = "integrity-threshold-config";

export interface ThresholdConfigPayload {
  version: number;
  kind: string;
  exportedAt: string;
  defaults: HealthThresholdSettings;
  workspaces?: Record<string, HealthThresholdSettings>;
}

// --- Validation ---

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; payload: ThresholdConfigPayload }
  | { ok: false; errors: ValidationError[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateThresholdBlock(
  obj: unknown,
  path: string,
  errors: ValidationError[],
): HealthThresholdSettings | null {
  if (!isPlainObject(obj)) {
    errors.push({ path, message: "must be an object" });
    return null;
  }

  const required: (keyof HealthThresholdSettings)[] = [
    "goodMinScans7d",
    "goodMaxAgeDays",
    "poorMaxAgeDays",
  ];
  for (const key of required) {
    if (!(key in obj)) {
      errors.push({ path: `${path}.${key}`, message: "required field missing" });
    } else if (typeof obj[key] !== "number" || !Number.isFinite(obj[key] as number)) {
      errors.push({ path: `${path}.${key}`, message: "must be a finite number" });
    }
  }

  if (errors.length > 0) return null;

  const raw: HealthThresholdSettings = {
    goodMinScans7d: obj.goodMinScans7d as number,
    goodMaxAgeDays: obj.goodMaxAgeDays as number,
    poorMaxAgeDays: obj.poorMaxAgeDays as number,
  };

  // Range-check (clamp silently)
  return clampThresholdSettings(raw);
}

/**
 * Strictly validate a parsed JSON value as a threshold config payload.
 * Returns a normalized payload with clamped values, or a list of errors.
 */
export function validateThresholdConfig(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(data)) {
    return { ok: false, errors: [{ path: "$", message: "payload must be a JSON object" }] };
  }

  // version
  if (!("version" in data)) {
    errors.push({ path: "$.version", message: "required field missing" });
  } else if (typeof data.version !== "number" || data.version !== CURRENT_SCHEMA_VERSION) {
    errors.push({
      path: "$.version",
      message: `unsupported version (expected ${CURRENT_SCHEMA_VERSION}, got ${JSON.stringify(data.version)})`,
    });
  }

  // kind
  if (!("kind" in data)) {
    errors.push({ path: "$.kind", message: "required field missing" });
  } else if (data.kind !== CONFIG_KIND) {
    errors.push({
      path: "$.kind",
      message: `unexpected kind (expected "${CONFIG_KIND}", got ${JSON.stringify(data.kind)})`,
    });
  }

  // exportedAt (optional but if present must be string)
  if ("exportedAt" in data && typeof data.exportedAt !== "string") {
    errors.push({ path: "$.exportedAt", message: "must be a string" });
  }

  // defaults
  if (!("defaults" in data)) {
    errors.push({ path: "$.defaults", message: "required field missing" });
  }

  // Bail early for structural errors
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const defaults = validateThresholdBlock(data.defaults, "$.defaults", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // workspaces (optional)
  let workspaces: Record<string, HealthThresholdSettings> | undefined;
  if ("workspaces" in data && data.workspaces !== undefined && data.workspaces !== null) {
    if (!isPlainObject(data.workspaces)) {
      errors.push({ path: "$.workspaces", message: "must be an object (path → settings)" });
    } else {
      workspaces = {};
      for (const [wsPath, wsSettings] of Object.entries(data.workspaces)) {
        const validated = validateThresholdBlock(wsSettings, `$.workspaces["${wsPath}"]`, errors);
        if (validated) {
          workspaces[wsPath] = validated;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      version: CURRENT_SCHEMA_VERSION,
      kind: CONFIG_KIND,
      exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
      defaults: defaults!,
      ...(workspaces && Object.keys(workspaces).length > 0 ? { workspaces } : {}),
    },
  };
}

/**
 * Format validation errors into a user-facing message.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 1) return errors[0].message;
  return errors.map((e) => `${e.path}: ${e.message}`).join("\n");
}

// --- Export ---

const WORKSPACE_THRESHOLD_PREFIX = "lazy-editor:integrity-health-thresholds:ws:";

/**
 * Build an export payload from the current persisted threshold configuration.
 * Scans localStorage for all workspace overrides.
 */
export function buildThresholdExportPayload(): ThresholdConfigPayload {
  const defaults = loadThresholdSettings();

  // Scan localStorage for workspace overrides
  const workspaces: Record<string, HealthThresholdSettings> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(WORKSPACE_THRESHOLD_PREFIX)) {
      const wsPath = key.slice(WORKSPACE_THRESHOLD_PREFIX.length);
      const wsSettings = loadWorkspaceThresholdSettings(wsPath);
      if (wsSettings) {
        workspaces[wsPath] = wsSettings;
      }
    }
  }

  return {
    version: CURRENT_SCHEMA_VERSION,
    kind: CONFIG_KIND,
    exportedAt: new Date().toISOString(),
    defaults,
    ...(Object.keys(workspaces).length > 0 ? { workspaces } : {}),
  };
}

/**
 * Serialize a threshold config payload to pretty JSON.
 */
export function serializeThresholdConfig(payload: ThresholdConfigPayload): string {
  return JSON.stringify(payload, null, 2);
}

// --- Import ---

/**
 * Parse and validate a JSON string as a threshold config.
 * Returns the validated payload or a user-facing error string.
 */
export function parseThresholdConfig(
  jsonString: string,
): { ok: true; payload: ThresholdConfigPayload } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: "Invalid JSON: file does not contain valid JSON." };
  }

  const result = validateThresholdConfig(parsed);
  if (!result.ok) {
    return { ok: false, error: formatValidationErrors(result.errors) };
  }

  return { ok: true, payload: result.payload };
}

/**
 * Apply an imported threshold config: persist global defaults and workspace overrides.
 * Returns the applied defaults for immediate store update.
 */
export function applyThresholdConfig(payload: ThresholdConfigPayload): HealthThresholdSettings {
  // Apply global defaults
  saveThresholdSettings(payload.defaults);

  // Apply workspace overrides
  if (payload.workspaces) {
    for (const [wsPath, wsSettings] of Object.entries(payload.workspaces)) {
      saveWorkspaceThresholdSettings(wsPath, wsSettings);
    }
  }

  return payload.defaults;
}
