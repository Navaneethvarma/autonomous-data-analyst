export type ValidationStatus = 'valid' | 'invalid' | 'unverifiable';

export interface ValidationRuleConfig {
  type:
    | 'non_negative'
    | 'percentage_bounded'
    | 'range_bounds'
    | 'reconciliation_sum'
    | 'not_null_or_empty'
    | 'custom_assertion';
  metricContext?: string;
  min?: number;
  max?: number;
  expectedSum?: number;
  components?: number[];
  tolerance?: number;
  assertionDescription?: string;
  assertionPassed?: boolean;
}

export interface ValidationRequest {
  metricName: string;
  metricValue: unknown;
  rule: ValidationRuleConfig;
  unit?: string;
}

export interface ValidationResult {
  metricName: string;
  status: ValidationStatus;
  isValid: boolean;
  ruleApplied: string;
  details: string;
  toleranceUsed?: number;
  verifiedAt: string;
}

/**
 * Validates analytical computation results against explicit metric semantics and domain constraints.
 * Returns 'unverifiable' rather than falsely passing when sufficient evidence is missing.
 */
export function validateAnalysisResult(request: ValidationRequest): ValidationResult {
  const { metricName, metricValue, rule } = request;
  const verifiedAt = new Date().toISOString();

  // Rule 1: Not Null or Empty
  if (rule.type === 'not_null_or_empty') {
    if (
      metricValue === null ||
      metricValue === undefined ||
      (typeof metricValue === 'number' && Number.isNaN(metricValue)) ||
      (typeof metricValue === 'string' && metricValue.trim() === '')
    ) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'not_null_or_empty',
        details: `Metric '${metricName}' failed null check: value is null, undefined, NaN, or empty.`,
        verifiedAt,
      };
    }
    return {
      metricName,
      status: 'valid',
      isValid: true,
      ruleApplied: 'not_null_or_empty',
      details: `Metric '${metricName}' passed non-null check with value: ${String(metricValue)}.`,
      verifiedAt,
    };
  }

  // Value must be numeric for numeric rules
  const numericVal = typeof metricValue === 'number'
    ? metricValue
    : typeof metricValue === 'string' && metricValue.trim() !== ''
    ? Number(metricValue)
    : NaN;

  // Rule 2: Non-negative
  if (rule.type === 'non_negative') {
    if (Number.isNaN(numericVal)) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'non_negative',
        details: `Value '${String(metricValue)}' is not a valid number.`,
        verifiedAt,
      };
    }

    if (numericVal < 0) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'non_negative',
        details: `Metric '${metricName}' value ${numericVal} is negative. ${rule.metricContext ? `Context: ${rule.metricContext}` : ''}`,
        verifiedAt,
      };
    }

    return {
      metricName,
      status: 'valid',
      isValid: true,
      ruleApplied: 'non_negative',
      details: `Metric '${metricName}' is non-negative (${numericVal} >= 0).`,
      verifiedAt,
    };
  }

  // Rule 3: Percentage Bounded
  if (rule.type === 'percentage_bounded') {
    if (Number.isNaN(numericVal)) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'percentage_bounded',
        details: `Value '${String(metricValue)}' is not a valid numeric percentage.`,
        verifiedAt,
      };
    }

    const min = rule.min ?? 0;
    const max = rule.max ?? 100;

    if (numericVal < min || numericVal > max) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'percentage_bounded',
        details: `Percentage metric '${metricName}' (${numericVal}%) is outside expected range [${min}%, ${max}%]. ${rule.metricContext ?? ''}`,
        verifiedAt,
      };
    }

    return {
      metricName,
      status: 'valid',
      isValid: true,
      ruleApplied: 'percentage_bounded',
      details: `Percentage metric '${metricName}' (${numericVal}%) is within expected range [${min}%, ${max}%].`,
      verifiedAt,
    };
  }

  // Rule 4: Range Bounds
  if (rule.type === 'range_bounds') {
    if (Number.isNaN(numericVal)) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'range_bounds',
        details: `Value '${String(metricValue)}' is not numeric.`,
        verifiedAt,
      };
    }

    const tol = rule.tolerance ?? 0;
    if (rule.min !== undefined && numericVal < rule.min - tol) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'range_bounds',
        toleranceUsed: tol,
        details: `Metric '${metricName}' value ${numericVal} is below minimum bound ${rule.min} (tolerance: ${tol}).`,
        verifiedAt,
      };
    }

    if (rule.max !== undefined && numericVal > rule.max + tol) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'range_bounds',
        toleranceUsed: tol,
        details: `Metric '${metricName}' value ${numericVal} exceeds maximum bound ${rule.max} (tolerance: ${tol}).`,
        verifiedAt,
      };
    }

    return {
      metricName,
      status: 'valid',
      isValid: true,
      ruleApplied: 'range_bounds',
      toleranceUsed: tol,
      details: `Metric '${metricName}' value ${numericVal} satisfies range bounds.`,
      verifiedAt,
    };
  }

  // Rule 5: Reconciliation Sum
  if (rule.type === 'reconciliation_sum') {
    if (!rule.components || rule.components.length === 0) {
      return {
        metricName,
        status: 'unverifiable',
        isValid: false,
        ruleApplied: 'reconciliation_sum',
        details: `Reconciliation for metric '${metricName}' cannot be verified: no component breakdown array was provided.`,
        verifiedAt,
      };
    }

    const tol = rule.tolerance ?? 0.001;
    const computedComponentSum = rule.components.reduce((sum, c) => sum + c, 0);
    const targetTotal = rule.expectedSum !== undefined ? rule.expectedSum : numericVal;

    if (Number.isNaN(targetTotal)) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'reconciliation_sum',
        details: `Expected sum is not a valid number.`,
        verifiedAt,
      };
    }

    const diff = Math.abs(computedComponentSum - targetTotal);
    if (diff > tol) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'reconciliation_sum',
        toleranceUsed: tol,
        details: `Reconciliation failed: component sum (${computedComponentSum}) differs from target (${targetTotal}) by ${diff.toFixed(4)} (allowed tolerance: ${tol}).`,
        verifiedAt,
      };
    }

    return {
      metricName,
      status: 'valid',
      isValid: true,
      ruleApplied: 'reconciliation_sum',
      toleranceUsed: tol,
      details: `Reconciliation passed: sum of ${rule.components.length} components (${computedComponentSum}) matches target total (${targetTotal}) within tolerance ${tol}.`,
      verifiedAt,
    };
  }

  // Rule 6: Custom Assertion
  if (rule.type === 'custom_assertion') {
    if (rule.assertionPassed === undefined) {
      return {
        metricName,
        status: 'unverifiable',
        isValid: false,
        ruleApplied: 'custom_assertion',
        details: `Assertion '${rule.assertionDescription || 'unspecified'}' could not be verified because evaluation outcome was not provided.`,
        verifiedAt,
      };
    }

    if (!rule.assertionPassed) {
      return {
        metricName,
        status: 'invalid',
        isValid: false,
        ruleApplied: 'custom_assertion',
        details: `Assertion failed: ${rule.assertionDescription || 'Custom business assertion failed.'}`,
        verifiedAt,
      };
    }

    return {
      metricName,
      status: 'valid',
      isValid: true,
      ruleApplied: 'custom_assertion',
      details: `Assertion passed: ${rule.assertionDescription || 'Custom business assertion verified.'}`,
      verifiedAt,
    };
  }

  return {
    metricName,
    status: 'unverifiable',
    isValid: false,
    ruleApplied: 'unknown',
    details: 'Unrecognized validation rule type.',
    verifiedAt,
  };
}
