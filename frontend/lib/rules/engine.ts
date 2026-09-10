import type {
  AnalysisInput,
  ApplicabilityDecision,
  BoundingBox,
  CheckConfig,
  ExtractedField,
  MeasurementMethod,
  OverallStatus,
  PlacementResult,
  ReadabilityAssessment,
  RulesConfig,
  ScanContext,
  Verdict,
  VerdictStatus,
} from './domain';
import { compileRegex } from './extractors/base';

function getContextValue(
  context: ScanContext,
  name: keyof ScanContext
): unknown {
  const val = context[name];
  if (val === null || val === undefined) {
    return undefined;
  }
  if (name === 'category' && val === 'unknown') {
    return undefined;
  }
  return val;
}

export function evaluateApplicability(
  check: CheckConfig,
  context: ScanContext
): ApplicabilityDecision {
  const appliesWhen = check.applies_when || {};
  const required = (appliesWhen.context_required as (keyof ScanContext)[]) || [];
  const missingContext = required.filter(
    (name) => typeof name === 'string' && getContextValue(context, name) === undefined
  );
  if (missingContext.length > 0) {
    return {
      has_required_context: false,
      skipped: false,
      reasoning: `Required applicability context is unknown: ${missingContext.join(', ')}.`,
    };
  }

  if (
    check.skipped_when_category_in &&
    context.category &&
    check.skipped_when_category_in.includes(context.category)
  ) {
    return {
      has_required_context: true,
      skipped: true,
      reasoning: 'Rule is not applicable to this product category.',
    };
  }

  if (check.skipped_when_mode && context.mode === check.skipped_when_mode) {
    return {
      has_required_context: true,
      skipped: true,
      reasoning: 'Rule is not applicable to this evidence mode.',
    };
  }

  const modeIn = appliesWhen.mode_in;
  if (Array.isArray(modeIn) && context.mode && !modeIn.includes(context.mode)) {
    return {
      has_required_context: true,
      skipped: true,
      reasoning: 'Rule is not applicable to this evidence mode.',
    };
  }

  const categoryIn = appliesWhen.category_in;
  if (
    Array.isArray(categoryIn) &&
    context.category &&
    !categoryIn.includes(context.category)
  ) {
    return {
      has_required_context: true,
      skipped: true,
      reasoning: 'Rule is not applicable to this product category.',
    };
  }

  const requiredImported = appliesWhen.imported;
  if (
    typeof requiredImported === 'boolean' &&
    context.imported !== requiredImported
  ) {
    return {
      has_required_context: true,
      skipped: true,
      reasoning: 'Rule is not applicable to this import status.',
    };
  }

  if (check.effective_from) {
    const inspectionDateStr =
      context.inspection_date || new Date().toISOString().split('T')[0];
    if (inspectionDateStr < check.effective_from) {
      return {
        has_required_context: true,
        skipped: true,
        reasoning: `Rule takes effect on ${check.effective_from}.`,
      };
    }
  }

  return {
    has_required_context: true,
    skipped: false,
    reasoning: 'Rule is applicable to the supplied context.',
  };
}

export function checkSubfieldsPresent(
  check: CheckConfig,
  extracted: ExtractedField | null | undefined
): Record<string, boolean> {
  if (!extracted || extracted.value === null || extracted.value === undefined) {
    const res: Record<string, boolean> = {};
    for (const sub of check.requires) {
      res[sub] = false;
    }
    return res;
  }

  const text = extracted.value;
  if (check.rule_id === 'r6_1_e_mrp') {
    const hasTaxPhrase = Boolean(
      check.tax_inclusive_phrase_regex &&
        compileRegex(check.tax_inclusive_phrase_regex, 'i').test(text)
    );
    return {
      mrp_value: /\d/.test(text),
      tax_inclusive_phrase: hasTaxPhrase,
    };
  }

  if (check.rule_id === 'r6_1_c_net_quantity') {
    const foundUnits = (text.match(/[a-zA-Z]+/g) || []).map((m) => m.toLowerCase());
    const hasUnit = Boolean(
      check.requires_unit_in &&
        check.requires_unit_in.some((u) => foundUnits.includes(u.toLowerCase()))
    );
    return {
      net_quantity_value: /\d/.test(text),
      net_quantity_unit: hasUnit,
    };
  }

  if (check.rule_id === 'r6_1_a_address') {
    const pinRegex = check.pin_code_regex
      ? compileRegex(check.pin_code_regex)
      : null;
    return {
      manufacturer_name: text.length > 5,
      address: text.split(/\s+/).filter(Boolean).length >= 3,
      pin_code: Boolean(pinRegex && pinRegex.test(text)),
    };
  }

  if (check.rule_id === 'r6_2_consumer_care') {
    const phoneRegex = check.phone_regex
      ? compileRegex(check.phone_regex)
      : null;
    const emailRegex = check.email_regex
      ? compileRegex(check.email_regex)
      : null;
    return {
      consumer_care_name: text.split(/\s+/).filter(Boolean).length >= 2,
      consumer_care_address: text.split(/\s+/).filter(Boolean).length >= 3,
      consumer_care_phone: Boolean(phoneRegex && phoneRegex.test(text)),
      consumer_care_email: Boolean(emailRegex && emailRegex.test(text)),
    };
  }

  if (check.rule_id === 'r6_1_d_mfg_date') {
    return {
      mfg_date_value: /\d/.test(text),
    };
  }

  const res: Record<string, boolean> = {};
  for (const sub of check.requires) {
    res[sub] = Boolean(text.trim());
  }
  return res;
}

export const UNIT_FACTORS: Record<string, [string, number]> = {
  g: ['mass', 1.0],
  gm: ['mass', 1.0],
  gms: ['mass', 1.0],
  gram: ['mass', 1.0],
  grams: ['mass', 1.0],
  kg: ['mass', 1000.0],
  kgs: ['mass', 1000.0],
  kilogram: ['mass', 1000.0],
  kilograms: ['mass', 1000.0],
  ml: ['volume', 1.0],
  millilitre: ['volume', 1.0],
  milliliter: ['volume', 1.0],
  l: ['volume', 1000.0],
  lt: ['volume', 1000.0],
  ltr: ['volume', 1000.0],
  liter: ['volume', 1000.0],
  litre: ['volume', 1000.0],
  liters: ['volume', 1000.0],
  litres: ['volume', 1000.0],
  u: ['count', 1.0],
  unit: ['count', 1.0],
  units: ['count', 1.0],
  piece: ['count', 1.0],
  pieces: ['count', 1.0],
  pc: ['count', 1.0],
  pcs: ['count', 1.0],
  n: ['count', 1.0],
};

export function validateUnitSalePrice(
  mrpText: string | null | undefined,
  netQtyText: string | null | undefined,
  uspText: string | null | undefined,
  tolerance = 0.12
): [boolean, string | null] {
  if (!mrpText || !netQtyText || !uspText) {
    return [true, null];
  }

  const mMbr = /(\d+(?:\.\d+)?)/.exec(mrpText.replace(/,/g, ''));
  const mQty = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/.exec(netQtyText);
  const mUsp = /(\d+(?:\.\d+)?)\s*(?:\/|per)\s*([a-zA-Z]+)/i.exec(uspText);
  if (!mMbr || !mQty || !mUsp) {
    return [true, null];
  }

  const mrpVal = parseFloat(mMbr[1]);
  const qtyVal = parseFloat(mQty[1]);
  const declaredUsp = parseFloat(mUsp[1]);
  if (isNaN(mrpVal) || isNaN(qtyVal) || isNaN(declaredUsp)) {
    return [true, null];
  }

  if (mrpVal <= 0 || qtyVal <= 0 || declaredUsp <= 0) {
    return [true, null];
  }

  const qtyUnitRaw = mQty[2].toLowerCase();
  const uspUnitRaw = mUsp[2].toLowerCase();
  const qtyInfo = UNIT_FACTORS[qtyUnitRaw];
  const uspInfo = UNIT_FACTORS[uspUnitRaw];
  if (!qtyInfo || !uspInfo || qtyInfo[0] !== uspInfo[0]) {
    return [true, null];
  }

  const qtyInBase = qtyVal * qtyInfo[1];
  const expectedUspInBase = mrpVal / qtyInBase;
  const expectedDeclaredUsp = expectedUspInBase * uspInfo[1];

  const denom = Math.max(declaredUsp, expectedDeclaredUsp);
  const diff = Math.abs(declaredUsp - expectedDeclaredUsp) / denom;
  if (diff > tolerance) {
    return [
      false,
      `Declared USP (Rs ${declaredUsp.toFixed(2)}/${uspUnitRaw}) differs from calculated MRP/Net Qty (Rs ${expectedDeclaredUsp.toFixed(2)}/${uspUnitRaw}).`,
    ];
  }
  return [true, null];
}

function collectEvidenceBoxes(
  extracted: ExtractedField | null | undefined,
  readability: ReadabilityAssessment | null | undefined,
  placement: PlacementResult | null | undefined
): BoundingBox[] {
  const boxes: BoundingBox[] = [];
  if (extracted) {
    boxes.push(...extracted.evidence_spans);
    if (boxes.length === 0 && extracted.bbox) {
      boxes.push(extracted.bbox);
    }
  }
  if (readability && readability.evidence_bboxes) {
    boxes.push(...readability.evidence_bboxes);
  }
  if (placement && placement.evidence_bboxes) {
    boxes.push(...placement.evidence_bboxes);
  }

  const seen = new Set<string>();
  const out: BoundingBox[] = [];
  for (const b of boxes) {
    const key = b.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(b);
    }
  }
  return out;
}

function calculateWeakestConfidence(
  analysis: AnalysisInput,
  extracted: ExtractedField | null | undefined,
  readability: ReadabilityAssessment | null | undefined,
  placement: PlacementResult | null | undefined
): number {
  const values = [analysis.quality.score / 100.0];
  if (extracted && extracted.value !== null && extracted.value !== undefined) {
    values.push(extracted.confidence);
  }
  if (readability) {
    values.push(readability.scale_confidence);
  }
  if (placement) {
    values.push(placement.confidence);
  }
  const minVal = Math.min(...values);
  return Math.round(Math.max(0.0, Math.min(1.0, minVal)) * 10000) / 10000;
}

function buildVerdict(
  check: CheckConfig,
  rules: RulesConfig,
  options: {
    status: VerdictStatus;
    reasoning: string;
    confidence: number;
    evidence?: string;
    evidence_bboxes?: BoundingBox[];
    measurement_method?: MeasurementMethod;
    failure_message?: string | null;
  }
): Verdict {
  return {
    rule_id: check.rule_id,
    status: options.status,
    severity: check.severity,
    citation: check.citation,
    evidence: options.evidence || '',
    evidence_bboxes: options.evidence_bboxes || [],
    failure_message: options.failure_message ?? null,
    rule_version: rules.version,
    confidence: Math.max(0.0, Math.min(1.0, options.confidence)),
    reasoning: options.reasoning,
    measurement_method: options.measurement_method || 'not_measurable',
  };
}

function evaluateReadabilityVerdict(
  check: CheckConfig,
  analysis: AnalysisInput,
  rules: RulesConfig
): Verdict {
  const assessments = Object.values(analysis.readability || {});
  if (assessments.length === 0) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning: 'No declaration readability measurements are available.',
      confidence: analysis.quality.score / 100.0,
    });
  }

  const statuses = new Set(assessments.map((a) => a.status));
  let status: VerdictStatus;
  let reasoning: string;
  if (statuses.has('fail')) {
    status = 'fail';
    reasoning =
      'At least one confident physical character-height measurement is below Rule 7.';
  } else if (statuses.has('manual_review')) {
    status = 'manual_review';
    reasoning = 'At least one Rule 7 measurement requires manual review.';
  } else if (statuses.has('warn')) {
    status = 'warn';
    reasoning = 'At least one declaration has a readability warning.';
  } else {
    status = 'pass';
    reasoning =
      'All measured declarations satisfy the applicable readability policy.';
  }

  const methods = new Set(assessments.map((a) => a.method));
  const method: MeasurementMethod =
    methods.size === 1 ? assessments[0].method : 'relative_readability';
  const boxes: BoundingBox[] = [];
  for (const a of assessments) {
    if (a.evidence_bboxes) {
      boxes.push(...a.evidence_bboxes);
    }
  }

  const seen = new Set<string>();
  const uniqueBoxes = boxes.filter((b) => {
    const k = b.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return buildVerdict(check, rules, {
    status,
    reasoning,
    confidence: Math.min(...assessments.map((a) => a.scale_confidence)),
    evidence: assessments.map((a) => a.reasoning).join('; '),
    evidence_bboxes: uniqueBoxes,
    measurement_method: method,
    failure_message: status === 'fail' ? check.failure_message : null,
  });
}

function evaluateAggregateVisibilityVerdict(
  check: CheckConfig,
  analysis: AnalysisInput,
  context: ScanContext,
  rules: RulesConfig
): Verdict {
  if (context.mode !== 'ecommerce_listing') {
    return buildVerdict(check, rules, {
      status: 'na',
      reasoning: 'Rule is not applicable to this evidence mode.',
      confidence: 1.0,
      evidence: 'Rule not applicable to supplied context',
    });
  }

  const coreDeclarations = ['mrp', 'net_quantity', 'manufacturer_address'];
  const extracted = analysis.extracted;
  const missingFields: string[] = [];
  const foundEvidence: string[] = [];
  const boxes: BoundingBox[] = [];
  const confidences = [analysis.quality.score / 100.0];

  for (const fieldName of coreDeclarations) {
    const field = extracted[fieldName];
    if (!field || !field.value) {
      missingFields.push(fieldName);
    } else {
      foundEvidence.push(`${fieldName}: ${field.value}`);
      confidences.push(field.confidence);
      if (field.bbox) {
        boxes.push(field.bbox);
      }
      boxes.push(...field.evidence_spans);
    }
  }

  const extraFields = [
    'consumer_care',
    'best_before',
    'common_name',
    'country_origin',
    'unit_price',
  ];
  for (const extra of extraFields) {
    const field = extracted[extra];
    if (field && field.value) {
      foundEvidence.push(`${extra}: ${field.value}`);
      confidences.push(field.confidence);
      if (field.bbox) {
        boxes.push(field.bbox);
      }
      boxes.push(...field.evidence_spans);
    }
  }

  const minConf = Math.min(...confidences);
  const confidence = Math.round(Math.max(0.0, Math.min(1.0, minConf)) * 10000) / 10000;
  const seen = new Set<string>();
  const uniqueBoxes = boxes.filter((b) => {
    const k = b.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const evidence = foundEvidence.join('; ');

  if (
    analysis.quality.status === 'retake_recommended' ||
    analysis.quality.status === 'unreadable'
  ) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning:
        'Image quality is insufficient to support an automatic compliance decision.',
      confidence,
      evidence,
      evidence_bboxes: uniqueBoxes,
    });
  }

  if (missingFields.length > 0) {
    const missingStr = missingFields.join(', ');
    return buildVerdict(check, rules, {
      status: 'fail',
      reasoning: `Listing evidence is missing mandatory declarations: ${missingStr}.`,
      confidence,
      evidence,
      evidence_bboxes: uniqueBoxes,
      failure_message: `${check.failure_message} (missing: ${missingStr})`,
    });
  }

  return buildVerdict(check, rules, {
    status: 'pass',
    reasoning:
      'All mandatory e-commerce declarations are present and visible in the submitted listing.',
    confidence,
    evidence,
    evidence_bboxes: uniqueBoxes,
  });
}

export function verdictForCheck(
  check: CheckConfig,
  analysis: AnalysisInput,
  context: ScanContext,
  rules: RulesConfig
): Verdict {
  const applicability = evaluateApplicability(check, context);
  if (!applicability.has_required_context) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning: applicability.reasoning,
      confidence: 0.0,
    });
  }
  if (applicability.skipped) {
    return buildVerdict(check, rules, {
      status: 'na',
      reasoning: applicability.reasoning,
      confidence: 1.0,
      evidence: 'Rule not applicable to supplied context',
    });
  }

  if (check.check_type === 'readability') {
    return evaluateReadabilityVerdict(check, analysis, rules);
  }
  if (check.check_type === 'aggregate_visibility') {
    return evaluateAggregateVisibilityVerdict(check, analysis, context, rules);
  }

  const extracted = analysis.extracted[check.field];
  const readability = analysis.readability?.[check.field];
  const placement = analysis.placement?.[check.field];
  const subfields = checkSubfieldsPresent(check, extracted);
  const missing = Object.entries(subfields)
    .filter(([_, present]) => !present)
    .map(([name]) => name);

  const hasValue = extracted !== null && extracted !== undefined && extracted.value !== null;
  const highConfidenceMalformed = Boolean(
    hasValue &&
      missing.length > 0 &&
      extracted &&
      extracted.confidence >= rules.confidence_thresholds.pass_min
  );
  const confidence = calculateWeakestConfidence(
    analysis,
    extracted,
    readability,
    placement
  );
  const method: MeasurementMethod = readability
    ? readability.method
    : 'not_measurable';
  const boxes = collectEvidenceBoxes(extracted, readability, placement);
  const evidence = hasValue && extracted ? extracted.value || '' : '';

  if (
    (analysis.quality.status === 'retake_recommended' ||
      analysis.quality.status === 'unreadable') &&
    !highConfidenceMalformed
  ) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning:
        'Image quality is insufficient to support an automatic compliance decision.',
      confidence,
      evidence,
      evidence_bboxes: boxes,
      measurement_method: method,
    });
  }

  if (!hasValue && check.exemption && Object.keys(check.exemption).length > 0) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning:
        'Configured exemption facts are not established by the submitted evidence.',
      confidence,
      evidence_bboxes: boxes,
    });
  }

  if (
    hasValue &&
    missing.length > 0 &&
    extracted &&
    extracted.confidence < rules.confidence_thresholds.pass_min
  ) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning:
        'OCR confidence is too low to prove that the declaration is malformed.',
      confidence,
      evidence,
      evidence_bboxes: boxes,
      measurement_method: method,
    });
  }

  if (!hasValue || missing.length > 0) {
    const detail =
      missing.length > 0 ? ` Missing or malformed: ${missing.join(', ')}.` : '';
    return buildVerdict(check, rules, {
      status: 'fail',
      reasoning: `Sufficient image evidence does not show a compliant declaration.${detail}`,
      confidence,
      evidence,
      evidence_bboxes: boxes,
      measurement_method: method,
      failure_message:
        check.failure_message +
        (missing.length > 0 ? ` (missing: ${missing.join(', ')})` : ''),
    });
  }

  if (extracted && extracted.confidence < rules.confidence_thresholds.warn_min) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning: 'OCR confidence is below the automatic-decision threshold.',
      confidence,
      evidence,
      evidence_bboxes: boxes,
      measurement_method: method,
    });
  }

  if (
    (readability && readability.status === 'manual_review') ||
    (placement && placement.status === 'manual_review')
  ) {
    return buildVerdict(check, rules, {
      status: 'manual_review',
      reasoning: 'Readability or placement evidence requires manual review.',
      confidence,
      evidence,
      evidence_bboxes: boxes,
      measurement_method: method,
    });
  }

  if (
    (readability && readability.status === 'fail') ||
    (placement && placement.status === 'fail')
  ) {
    return buildVerdict(check, rules, {
      status: 'fail',
      reasoning:
        'Confidence-qualified readability or placement evidence proves noncompliance.',
      confidence,
      evidence,
      evidence_bboxes: boxes,
      measurement_method: method,
      failure_message: check.failure_message,
    });
  }

  let uspMismatchNote: string | null = null;
  if (
    check.rule_id === 'r6_11_unit_sale_price' &&
    hasValue &&
    extracted &&
    extracted.value
  ) {
    const mrpField = analysis.extracted.mrp;
    const netQtyField = analysis.extracted.net_quantity;
    const mrpText = mrpField ? mrpField.value : null;
    const qtyText = netQtyField ? netQtyField.value : null;
    const [valid, note] = validateUnitSalePrice(
      mrpText,
      qtyText,
      extracted.value
    );
    if (!valid) {
      uspMismatchNote = note;
    }
  }

  const warningPresent = Boolean(
    analysis.quality.status === 'usable_with_warnings' ||
      (extracted &&
        extracted.confidence < rules.confidence_thresholds.pass_min) ||
      (readability && readability.status === 'warn') ||
      (placement && placement.status === 'warn') ||
      uspMismatchNote !== null
  );

  let reasoning: string;
  if (uspMismatchNote) {
    reasoning = `Declaration present with mathematical discrepancy: ${uspMismatchNote}`;
  } else if (warningPresent) {
    reasoning =
      'The declaration is present, but one or more evidence signals carry a warning.';
  } else {
    reasoning =
      'The declaration and its available supporting evidence satisfy this rule.';
  }

  return buildVerdict(check, rules, {
    status: warningPresent ? 'warn' : 'pass',
    reasoning,
    confidence,
    evidence,
    evidence_bboxes: boxes,
    measurement_method: method,
  });
}

export function runEngine(
  analysisInput:
    | AnalysisInput
    | Record<string, ExtractedField | null | undefined>,
  rules: RulesConfig,
  context: ScanContext = {}
): Verdict[] {
  let normalized: AnalysisInput;
  if ('quality' in analysisInput && 'extracted' in analysisInput) {
    normalized = analysisInput as AnalysisInput;
  } else {
    normalized = {
      extracted: analysisInput as Record<string, ExtractedField | null | undefined>,
      quality: {
        status: 'acceptable',
        score: 100.0,
        metrics: [],
        guidance: [],
      },
    };
  }

  return rules.checks.map((check) =>
    verdictForCheck(check, normalized, context, rules)
  );
}

export function overallStatus(verdicts: Verdict[]): OverallStatus {
  const statuses = new Set(verdicts.map((v) => v.status));
  if (statuses.has('fail')) return 'fail';
  if (statuses.has('manual_review')) return 'manual_review';
  if (statuses.has('warn')) return 'mixed';
  return 'pass';
}
