import YAML from 'yaml';

import type {
  CheckConfig,
  ConfidenceThresholds,
  FontSizeBracket,
  FontSizeRuleSet,
  FontSizeRules,
  FontSizeTable,
  RulesConfig,
  Severity,
} from './domain';
import compiledRulesJson from './rules.json';

export class RulesLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesLoadError';
  }
}

const APPLICABILITY_KEYS = new Set(['mode_in', 'category_in', 'imported', 'context_required']);
const MODES = new Set(['retail_image', 'ecommerce_listing']);
const CATEGORIES = new Set(['food', 'non_food', 'cosmetics', 'seeds', 'unknown']);
const CONTEXT_FIELDS = new Set(['mode', 'category', 'imported', 'inspection_date']);

function asMapping(raw: unknown, fieldName: string): Record<string, unknown> {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RulesLoadError(`${fieldName} must be a mapping`);
  }
  return { ...(raw as Record<string, unknown>) };
}

function parseAppliesWhen(raw: unknown, ruleId: string): Record<string, unknown> {
  const appliesWhen = asMapping(raw, `check ${ruleId}.applies_when`);
  const keys = Object.keys(appliesWhen);
  const unknown = keys.filter((k) => !APPLICABILITY_KEYS.has(k));
  if (unknown.length > 0) {
    throw new RulesLoadError(`check ${ruleId}: unsupported applicability keys ${unknown.sort()}`);
  }

  const modeIn = appliesWhen.mode_in;
  if (
    modeIn !== undefined &&
    (!Array.isArray(modeIn) || modeIn.length === 0 || modeIn.some((m) => !MODES.has(m as string)))
  ) {
    throw new RulesLoadError(`check ${ruleId}.applies_when.mode_in is invalid`);
  }

  const categoryIn = appliesWhen.category_in;
  if (
    categoryIn !== undefined &&
    (!Array.isArray(categoryIn) ||
      categoryIn.length === 0 ||
      categoryIn.some((c) => !CATEGORIES.has(c as string)))
  ) {
    throw new RulesLoadError(`check ${ruleId}.applies_when.category_in is invalid`);
  }

  const imported = appliesWhen.imported;
  if (imported !== undefined && typeof imported !== 'boolean') {
    throw new RulesLoadError(`check ${ruleId}.applies_when.imported must be boolean`);
  }

  const contextRequired = appliesWhen.context_required;
  if (
    contextRequired !== undefined &&
    (!Array.isArray(contextRequired) ||
      contextRequired.some((f) => !CONTEXT_FIELDS.has(f as string)))
  ) {
    throw new RulesLoadError(`check ${ruleId}.applies_when.context_required is invalid`);
  }

  return appliesWhen;
}

function parseBrackets(raw: Record<string, unknown>[], field: string): FontSizeBracket[] {
  const out: FontSizeBracket[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (row.normal_mm === undefined || row.blown_mm === undefined) {
      throw new RulesLoadError(`${field}[${i}]: missing normal_mm or blown_mm`);
    }
    out.push({
      max_value:
        row.max_g_or_ml !== undefined
          ? (row.max_g_or_ml as number)
          : row.max_cm2 !== undefined
            ? (row.max_cm2 as number)
            : null,
      normal_mm: Number(row.normal_mm),
      blown_mm: Number(row.blown_mm),
    });
  }
  return out;
}

function parseFontSizeSet(key: string, raw: Record<string, unknown>): FontSizeRuleSet {
  const citation = raw.citation as string | undefined;
  const effectiveFrom = raw.effective_from as string | undefined;
  if (!citation || !effectiveFrom) {
    throw new RulesLoadError(`font_size_rules.${key}: citation and effective_from required`);
  }

  let tableI: FontSizeTable | null = null;
  let tableII: FontSizeTable | null = null;

  if (raw.table_I_weight_volume && typeof raw.table_I_weight_volume === 'object') {
    const t = raw.table_I_weight_volume as { brackets: Record<string, unknown>[] };
    tableI = { brackets: parseBrackets(t.brackets, `${key}.table_I_weight_volume`) };
  }
  if (raw.table_II_length_area_number && typeof raw.table_II_length_area_number === 'object') {
    const t = raw.table_II_length_area_number as { brackets: Record<string, unknown>[] };
    tableII = { brackets: parseBrackets(t.brackets, `${key}.table_II_length_area_number`) };
  }
  if (raw.table_I && typeof raw.table_I === 'object') {
    const t = raw.table_I as { brackets: Record<string, unknown>[] };
    tableI = { brackets: parseBrackets(t.brackets, `${key}.table_I`) };
  }

  return {
    key,
    citation,
    effective_from: effectiveFrom,
    superseded_date: (raw.superseded_date as string) || null,
    table_I: tableI,
    table_II: tableII,
    letter_min_mm: raw.letter_min_mm !== undefined ? Number(raw.letter_min_mm) : null,
    letter_blown_min_mm:
      raw.letter_blown_min_mm !== undefined ? Number(raw.letter_blown_min_mm) : null,
  };
}

function parseCheck(raw: Record<string, unknown>): CheckConfig {
  const required = [
    'rule_id',
    'citation',
    'field',
    'check_type',
    'severity',
    'requires',
    'failure_message',
  ];
  for (const req of required) {
    if (raw[req] === undefined) {
      throw new RulesLoadError(`check ${raw.rule_id || '?'}: missing field ${req}`);
    }
  }

  const ruleId = raw.rule_id as string;
  const effectiveFrom = raw.effective_from as string | undefined;
  if (effectiveFrom !== undefined) {
    if (isNaN(Date.parse(effectiveFrom))) {
      throw new RulesLoadError(`check ${ruleId}.effective_from must be an ISO date`);
    }
  }

  return {
    rule_id: ruleId,
    citation: raw.citation as string,
    field: raw.field as string,
    check_type: raw.check_type as string,
    severity: raw.severity as Severity,
    requires: (raw.requires as string[]) || [],
    failure_message: raw.failure_message as string,
    tax_inclusive_phrase_regex: (raw.tax_inclusive_phrase_regex as string) || null,
    requires_unit_in: (raw.requires_unit_in as string[]) || null,
    pin_code_regex: (raw.pin_code_regex as string) || null,
    email_regex: (raw.email_regex as string) || null,
    phone_regex: (raw.phone_regex as string) || null,
    date_format_regex: (raw.date_format_regex as string) || null,
    skipped_when_category_in: (raw.skipped_when_category_in as string[]) || null,
    skipped_when_mode: (raw.skipped_when_mode as string) || null,
    applies_when: parseAppliesWhen(raw.applies_when, ruleId),
    placement: asMapping(raw.placement, `check ${ruleId}.placement`),
    readability: asMapping(raw.readability, `check ${ruleId}.readability`),
    effective_from: effectiveFrom || null,
    exemption: asMapping(raw.exemption, `check ${ruleId}.exemption`),
  };
}

export function parseRulesConfig(raw: unknown): RulesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RulesLoadError('rules root must be an object');
  }

  const root = raw as Record<string, unknown>;
  const version = root.version as string | undefined;
  const schemaVersion = root.schema_version as number | undefined;
  if (!version || schemaVersion !== 1) {
    throw new RulesLoadError(`unsupported schema_version=${schemaVersion}, version=${version}`);
  }

  const fsr = (root.font_size_rules as Record<string, unknown>) || {};
  if (!fsr.default_version) {
    throw new RulesLoadError('font_size_rules.default_version required');
  }

  const versions: Record<string, FontSizeRuleSet> = {};
  for (const key of ['original_2011', 'consolidated_post_2021']) {
    if (fsr[key] && typeof fsr[key] === 'object') {
      versions[key] = parseFontSizeSet(key, fsr[key] as Record<string, unknown>);
    }
  }

  const defaultVersion = fsr.default_version as string;
  if (!versions[defaultVersion]) {
    throw new RulesLoadError(
      `default_version ${defaultVersion} not in defined versions ${Object.keys(versions)}`
    );
  }

  const scaleConf = fsr.enforcement_scale_confidence;
  if (
    typeof scaleConf !== 'number' ||
    isNaN(scaleConf) ||
    scaleConf <= 0 ||
    scaleConf > 1
  ) {
    throw new RulesLoadError('font_size_rules.enforcement_scale_confidence must satisfy 0 < value <= 1');
  }

  if (fsr.boundary_error_policy !== 'manual_review') {
    throw new RulesLoadError("font_size_rules.boundary_error_policy must be 'manual_review'");
  }

  const exemption = (fsr.exemption as Record<string, unknown>) || {};
  const fontSize: FontSizeRules = {
    versions,
    default_version: defaultVersion,
    exemption_applies_when_another_law_governs: Boolean(
      exemption.applies_when_another_law_governs ?? false
    ),
    exempted_declarations: (exemption.exempted_declarations as string[]) || [],
    exempted_categories: (exemption.exempted_categories as string[]) || [],
    enforcement_scale_confidence: scaleConf,
    boundary_error_policy: 'manual_review',
  };

  const ct = (root.confidence_thresholds as Record<string, unknown>) || {};
  const passMin = Number(ct.pass_min ?? 0.7);
  const warnMin = Number(ct.warn_min ?? 0.6);
  if (!(0.0 <= warnMin && warnMin < passMin && passMin <= 1.0)) {
    throw new RulesLoadError('confidence_thresholds must satisfy 0 <= warn_min < pass_min <= 1');
  }
  const confidenceThresholds: ConfidenceThresholds = {
    pass_min: passMin,
    warn_min: warnMin,
  };

  const checksRaw = root.checks as Record<string, unknown>[] | undefined;
  if (!Array.isArray(checksRaw) || checksRaw.length === 0) {
    throw new RulesLoadError('rules.checks must be a non-empty list');
  }

  const seenIds = new Set<string>();
  const checks: CheckConfig[] = [];
  for (const c of checksRaw) {
    const check = parseCheck(c);
    if (seenIds.has(check.rule_id)) {
      throw new RulesLoadError(`duplicate rule_id: ${check.rule_id}`);
    }
    seenIds.add(check.rule_id);
    checks.push(check);
  }

  return {
    version,
    schema_version: schemaVersion,
    font_size: fontSize,
    confidence_thresholds: confidenceThresholds,
    checks,
  };
}

/**
 * Load rules from a YAML string (parsed at runtime with yaml package)
 */
export function loadRulesFromYaml(yamlText: string): RulesConfig {
  const parsed = YAML.parse(yamlText);
  return parseRulesConfig(parsed);
}

/**
 * Load default precompiled rules bundled with the application.
 */
export function loadDefaultRules(): RulesConfig {
  return parseRulesConfig(compiledRulesJson);
}
