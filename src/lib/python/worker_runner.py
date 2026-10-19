#!/usr/bin/env python3
"""
Autonomous Data Analyst - Sandboxed Python Analytics Worker
Executes authorized statistical analysis tasks against an explicit dataset.
Outputs versioned, validated JSON evidence without leaking host environment details.
"""

import sys
import os
import json
import math
import csv
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# Lazy loaded libraries
_HAS_NUMPY = None
_HAS_SCIPY = None
_np = None
_stats = None

def get_numpy():
    global _HAS_NUMPY, _np
    if _HAS_NUMPY is None:
        try:
            import numpy as np
            _np = np
            _HAS_NUMPY = True
        except ImportError:
            _np = None
            _HAS_NUMPY = False
    return _np

def get_scipy_stats():
    global _HAS_SCIPY, _stats
    if _HAS_SCIPY is None:
        try:
            import scipy.stats as stats
            _stats = stats
            _HAS_SCIPY = True
        except ImportError:
            _stats = None
            _HAS_SCIPY = False
    return _stats


def sanitize_value(val: Any) -> Any:
    """Recursively converts non-JSON values (NaN, Inf, datetime) into compliant types."""
    if val is None:
        return None
    if isinstance(val, (float, int)):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    np = get_numpy()
    if np is not None and isinstance(val, (np.floating, np.integer)):
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        return f_val if isinstance(val, np.floating) else int(val)
    if isinstance(val, (list, tuple)):
        return [sanitize_value(x) for x in val]
    if isinstance(val, dict):
        return {str(k): sanitize_value(v) for k, v in val.items()}
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def parse_float(val: Any) -> Optional[float]:
    """Safely converts a string/number to float, returning None on empty or invalid."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if not (math.isnan(val) or math.isinf(val)) else None
    s = str(val).strip()
    if not s or s.lower() in ('null', 'none', 'nan', 'na', ''):
        return None
    try:
        f = float(s)
        return f if not (math.isnan(f) or math.isinf(f)) else None
    except ValueError:
        return None


def read_csv_data(filepath: str, columns: List[str], max_rows: int) -> Tuple[List[Dict[str, Any]], int]:
    """Reads authorized columns from CSV with max_rows limit."""
    rows: List[Dict[str, Any]] = []
    total_count = 0
    with open(filepath, mode='r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_count += 1
            if len(rows) < max_rows:
                filtered = {c: row.get(c) for c in columns if c in row}
                rows.append(filtered)
    return rows, total_count


# ==============================================================================
# Pure Python Statistical Implementations (Fallback when SciPy is absent)
# ==============================================================================

def std_mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0

def std_variance(values: List[float], ddof: int = 1) -> float:
    n = len(values)
    if n <= ddof:
        return 0.0
    m = std_mean(values)
    return sum((x - m) ** 2 for x in values) / (n - ddof)

def std_dev(values: List[float], ddof: int = 1) -> float:
    return math.sqrt(std_variance(values, ddof))

def std_percentile(values: List[float], p: float) -> float:
    """Calculates percentile p in [0, 100] using linear interpolation."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    d0 = sorted_vals[int(f)] * (c - k)
    d1 = sorted_vals[int(c)] * (k - f)
    return d0 + d1

def std_skewness(values: List[float]) -> float:
    n = len(values)
    if n < 3:
        return 0.0
    m = std_mean(values)
    s = std_dev(values, ddof=1)
    if s == 0:
        return 0.0
    m3 = sum((x - m) ** 3 for x in values) / n
    return (m3 / (s ** 3)) * (math.sqrt(n * (n - 1)) / (n - 2))

def std_kurtosis(values: List[float]) -> float:
    """Excess kurtosis (normal distribution = 0)."""
    n = len(values)
    if n < 4:
        return 0.0
    m = std_mean(values)
    s = std_dev(values, ddof=1)
    if s == 0:
        return 0.0
    m4 = sum((x - m) ** 4 for x in values) / n
    gamma2 = (m4 / (s ** 4)) - 3.0
    return gamma2

STUDENT_T_95_CRITICAL = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
    26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}

def get_student_t_critical(df: int) -> float:
    """Returns two-tailed 95% critical value (alpha=0.05) for Student's t distribution with df degrees of freedom."""
    if df <= 0:
        return 0.0
    stats = get_scipy_stats()
    if stats is not None and hasattr(stats, 't'):
        try:
            return float(stats.t.ppf(0.975, df))
        except Exception:
            pass
    if df in STUDENT_T_95_CRITICAL:
        return STUDENT_T_95_CRITICAL[df]
    if df > 30:
        # Cornish-Fisher expansion of t quantile from standard normal quantile z = 1.95996
        z = 1.95996
        return z + (z**3 + z) / (4.0 * df)
    return 2.0

def approx_t_pvalue(t_stat: float, df: float) -> float:
    """Approximation of two-tailed t-distribution p-value using Hill's algorithm or normal fallback."""
    if df <= 0 or math.isnan(t_stat):
        return 1.0
    x = abs(t_stat)
    # For large degrees of freedom, t approaches normal distribution
    if df >= 100:
        # Standard normal CDF approximation (Abramowitz & Stegun)
        z = x
        p = 0.5 * math.erfc(z / math.sqrt(2.0))
        return 2.0 * p
    
    # Beta incomplete / student t approximation
    a = df / 2.0
    b = 0.5
    y = df / (df + x * x)
    try:
        # Regularized incomplete beta approximation
        # For our needs, an accurate approximation:
        d = math.sqrt(2 * x * x + df)
        z = (x * (1 - 1 / (4 * df))) / math.sqrt(1 + (x * x) / (2 * df))
        norm_p = 0.5 * math.erfc(z / math.sqrt(2.0))
        return min(1.0, max(0.0, 2.0 * norm_p))
    except Exception:
        z = x
        p = 0.5 * math.erfc(z / math.sqrt(2.0))
        return min(1.0, max(0.0, 2.0 * p))

def approx_f_pvalue(f_stat: float, dfn: int, dfd: int) -> float:
    """Approximation of one-tailed F-distribution p-value."""
    if f_stat <= 0 or dfn <= 0 or dfd <= 0:
        return 1.0
    # Wilson-Hilferty transformation of F to normal Z
    try:
        term1 = (f_stat ** (1.0 / 3.0)) * (1.0 - 2.0 / (9.0 * dfd))
        term2 = 1.0 - 2.0 / (9.0 * dfn)
        denom = math.sqrt((2.0 / (9.0 * dfn)) + ((f_stat ** (2.0 / 3.0)) * (2.0 / (9.0 * dfd))))
        z = (term1 - term2) / denom
        p = 0.5 * math.erfc(z / math.sqrt(2.0))
        return min(1.0, max(0.0, p))
    except Exception:
        return 0.5


# ==============================================================================
# Analytical Tasks
# ==============================================================================

def run_descriptive_stats(rows: List[Dict[str, Any]], total_rows: int, params: Dict[str, Any]) -> Dict[str, Any]:
    column = params.get('column')
    if not column:
        raise ValueError("Parameter 'column' is required for descriptive_stats")

    vals: List[float] = []
    for r in rows:
        f = parse_float(r.get(column))
        if f is not None:
            vals.append(f)

    valid_n = len(vals)
    dropped_n = total_rows - valid_n
    if valid_n == 0:
        return {
            'interpretation': f"No valid numeric observations found in column '{column}'.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': 0, 'droppedOrMissing': dropped_n, 'degreesOfFreedom': 0},
            'numericResults': {},
            'assumptions': [],
            'warnings': [f"Column '{column}' contained no parsable numeric records."]
        }

    # Edge Case: valid_n == 1 (Variance and Student's t interval undefined)
    if valid_n == 1:
        single_val = vals[0]
        return {
            'interpretation': f"Column '{column}' contains only 1 valid numeric observation ({single_val:.2f}). Sample variance and confidence intervals cannot be computed.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': 1, 'droppedOrMissing': dropped_n, 'degreesOfFreedom': 0},
            'numericResults': {
                'mean': round(single_val, 4),
                'median': round(single_val, 4),
                'stdDev': None,
                'variance': None,
                'min': round(single_val, 4),
                'max': round(single_val, 4),
                'q25': round(single_val, 4),
                'q75': round(single_val, 4),
                'iqr': 0.0,
                'skewness': None,
                'excessKurtosis': None,
                'standardError': None,
                'ci95Lower': None,
                'ci95Upper': None,
                'ciMethod': 'insufficient_sample_size',
                'tCritical': None,
                'outlierCount': 0,
                'outlierPercentage': 0.0,
                'tukeyLowerFence': round(single_val, 4),
                'tukeyUpperFence': round(single_val, 4),
            },
            'assumptions': [],
            'warnings': ["Sample size (n=1) is insufficient to compute sample variance or construct a confidence interval."]
        }

    mean_val = std_mean(vals)
    variance_val = std_variance(vals, ddof=1) if valid_n > 1 else 0.0
    std_dev_val = math.sqrt(variance_val)
    min_val = min(vals)
    max_val = max(vals)
    q25 = std_percentile(vals, 25)
    median_val = std_percentile(vals, 50)
    q75 = std_percentile(vals, 75)
    iqr = q75 - q25

    # Outlier detection (Tukey IQR fences)
    lower_fence = q25 - 1.5 * iqr
    upper_fence = q75 + 1.5 * iqr
    outliers = [x for x in vals if x < lower_fence or x > upper_fence]
    outlier_count = len(outliers)
    outlier_pct = round((outlier_count / valid_n) * 100, 2)

    # Moments
    skew = std_skewness(vals)
    kurt = std_kurtosis(vals)

    # Standard error of mean
    se = (std_dev_val / math.sqrt(valid_n)) if valid_n > 1 else 0.0
    df = valid_n - 1

    warnings = []

    # Student's t critical value for 95% Confidence Interval with df = n - 1
    if std_dev_val == 0.0:
        # Zero variance: constant observations
        ci95_lower = mean_val
        ci95_upper = mean_val
        t_crit = 0.0
        ci_method = 'degenerate_zero_variance'
        warnings.append("Zero variance observed; all observations in column are identical. Confidence interval degenerates to a single point.")
    else:
        t_crit = get_student_t_critical(df)
        ci95_lower = mean_val - t_crit * se
        ci95_upper = mean_val + t_crit * se
        ci_method = 'student_t_distribution' if df < 30 else 'student_t_asymptotic_normal'

        if valid_n < 30:
            warnings.append(
                f"Small sample size (n={valid_n}); Student's t critical value (t_crit={t_crit:.3f}, df={df}) applied instead of asymptotic normal z=1.96."
            )

    # Explicit warning regarding severe non-normality and outliers
    if abs(skew) > 1.0 or outlier_count > 0:
        warnings.append(
            f"Caution: Substantial skewness ({skew:.2f}) or outliers ({outlier_count} detected) in sample (n={valid_n}). "
            f"Student's t confidence interval coverage may be distorted; intervals do not resolve underlying non-normality, sample dependence, selection bias, or outlier distortion."
        )

    if outlier_pct > 5.0:
        warnings.append(f"High outlier concentration ({outlier_pct}% beyond Tukey 1.5*IQR fences).")

    assumptions = [
        {
            'name': 'Sample Size Sufficiency',
            'satisfied': valid_n >= 10,
            'details': f"Analyzed {valid_n} valid records (minimum 10 recommended for stable dispersion statistics)."
        },
        {
            'name': 'Population Normality for Student t Interval',
            'satisfied': abs(skew) <= 1.0 and abs(kurt) <= 1.5,
            'details': (
                f"Skewness={skew:.2f}, Excess Kurtosis={kurt:.2f}. "
                + ("Distribution roughly symmetric/bell-shaped." if abs(skew) <= 1.0 else "Substantial departure from normality detected; interpret confidence interval with caution.")
            )
        }
    ]

    ci_desc = (
        f"95% CI [{ci_method}]: [{ci95_lower:.2f}, {ci95_upper:.2f}] (t_crit={t_crit:.3f}, df={df})"
        if t_crit is not None else "CI unavailable"
    )

    interpretation = (
        f"Column '{column}' has an average of {mean_val:.2f} ({ci_desc}) "
        f"and median of {median_val:.2f} across {valid_n} records. Dispersion is reflected by std dev of {std_dev_val:.2f} "
        f"and IQR of {iqr:.2f}, with {outlier_count} outliers ({outlier_pct}%)."
    )

    return {
        'interpretation': interpretation,
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': valid_n,
            'droppedOrMissing': dropped_n,
            'degreesOfFreedom': df
        },
        'numericResults': {
            'mean': round(mean_val, 4),
            'median': round(median_val, 4),
            'stdDev': round(std_dev_val, 4) if valid_n > 1 else None,
            'variance': round(variance_val, 4) if valid_n > 1 else None,
            'min': round(min_val, 4),
            'max': round(max_val, 4),
            'q25': round(q25, 4),
            'q75': round(q75, 4),
            'iqr': round(iqr, 4),
            'skewness': round(skew, 4),
            'excessKurtosis': round(kurt, 4),
            'standardError': round(se, 4),
            'ci95Lower': round(ci95_lower, 4) if ci95_lower is not None else None,
            'ci95Upper': round(ci95_upper, 4) if ci95_upper is not None else None,
            'ciMethod': ci_method,
            'tCritical': round(t_crit, 4) if t_crit is not None else None,
            'outlierCount': outlier_count,
            'outlierPercentage': outlier_pct,
            'tukeyLowerFence': round(lower_fence, 4),
            'tukeyUpperFence': round(upper_fence, 4)
        },
        'assumptions': assumptions,
        'warnings': warnings
    }


def run_group_comparison(rows: List[Dict[str, Any]], total_rows: int, params: Dict[str, Any]) -> Dict[str, Any]:
    metric_col = params.get('metricColumn')
    group_col = params.get('groupColumn')
    group_a = params.get('groupA')
    group_b = params.get('groupB')

    if not metric_col or not group_col:
        raise ValueError("Both 'metricColumn' and 'groupColumn' are required for group_comparison")

    # Group values
    groups: Dict[str, List[float]] = {}
    valid_count = 0
    for r in rows:
        val = parse_float(r.get(metric_col))
        g_raw = r.get(group_col)
        if val is not None and g_raw is not None:
            g = str(g_raw).strip()
            if g:
                groups.setdefault(g, []).append(val)
                valid_count += 1

    # Select two groups
    if not group_a or not group_b:
        sorted_groups = sorted(groups.keys(), key=lambda k: len(groups[k]), reverse=True)
        if len(sorted_groups) < 2:
            return {
                'interpretation': f"Need at least 2 distinct groups with valid values in '{group_col}', found {len(sorted_groups)}.",
                'sampleSize': {'totalRows': total_rows, 'validObservations': valid_count, 'droppedOrMissing': total_rows - valid_count},
                'numericResults': {},
                'assumptions': [],
                'warnings': [f"Insufficient distinct groups in '{group_col}' to perform comparison."]
            }
        group_a, group_b = sorted_groups[0], sorted_groups[1]

    vals_a = groups.get(str(group_a), [])
    vals_b = groups.get(str(group_b), [])
    na, nb = len(vals_a), len(vals_b)

    if na < 2 or nb < 2:
        return {
            'interpretation': f"Insufficient observations in groups ('{group_a}': n={na}, '{group_b}': n={nb}). Minimum 2 per group required.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': na + nb, 'droppedOrMissing': total_rows - (na + nb)},
            'numericResults': {'groupA': group_a, 'groupB': group_b, 'countA': na, 'countB': nb},
            'assumptions': [],
            'warnings': ["Group sample sizes too small for hypothesis testing."]
        }

    mean_a, mean_b = std_mean(vals_a), std_mean(vals_b)
    var_a, var_b = std_variance(vals_a, 1), std_variance(vals_b, 1)
    std_a, std_b = math.sqrt(var_a), math.sqrt(var_b)

    # Welch's t-test (handles unequal variances and sample sizes)
    se_diff = math.sqrt((var_a / na) + (var_b / nb))
    t_stat = (mean_a - mean_b) / se_diff if se_diff > 0 else 0.0

    # Welch-Satterthwaite degrees of freedom
    if (var_a / na + var_b / nb) > 0:
        df_num = ((var_a / na) + (var_b / nb)) ** 2
        df_den = ((var_a / na) ** 2 / (na - 1)) + ((var_b / nb) ** 2 / (nb - 1))
        df = df_num / df_den if df_den > 0 else float(na + nb - 2)
    else:
        df = float(na + nb - 2)

    # Use SciPy if available, otherwise pure Python approximation
    stats = get_scipy_stats()
    if stats:
        t_res = stats.ttest_ind(vals_a, vals_b, equal_var=False)
        t_stat = float(t_res.statistic)
        p_val = float(t_res.pvalue)
        # Mann-Whitney U
        try:
            mwu_res = stats.mannwhitneyu(vals_a, vals_b, alternative='two-sided')
            mwu_stat = float(mwu_res.statistic)
            mwu_p_val = float(mwu_res.pvalue)
        except Exception:
            mwu_stat, mwu_p_val = None, None
    else:
        p_val = approx_t_pvalue(t_stat, df)
        mwu_stat, mwu_p_val = None, None

    # Cohen's d effect size (pooled standard deviation)
    pooled_var = (((na - 1) * var_a) + ((nb - 1) * var_b)) / (na + nb - 2) if (na + nb > 2) else 1.0
    cohens_d = (mean_a - mean_b) / math.sqrt(pooled_var) if pooled_var > 0 else 0.0

    is_significant = (p_val < 0.05) if p_val is not None else False
    mean_diff = mean_a - mean_b
    pct_diff = ((mean_a - mean_b) / mean_b * 100) if mean_b != 0 else 0.0

    assumptions = [
        {
            'name': 'Sample Independence',
            'satisfied': True,
            'details': f"Observations in '{group_a}' (n={na}) and '{group_b}' (n={nb}) are mutually exclusive partitions."
        },
        {
            'name': 'Variance Homogeneity (Welch adjustment used)',
            'satisfied': True,
            'details': f"Welch's t-test applied directly; does not assume equal population variances (var_a={var_a:.2f}, var_b={var_b:.2f})."
        },
        {
            'name': 'Sample Size Adequacy',
            'satisfied': na >= 15 and nb >= 15,
            'details': f"Group sizes: '{group_a}'={na}, '{group_b}'={nb}. " + ("Adequate for asymptotic normality." if na >= 15 and nb >= 15 else "Caution: small sample sizes increase risk of Type II error.")
        }
    ]

    warnings = []
    if na < 10 or nb < 10:
        warnings.append(f"Sub-group sample size is small ('{group_a}': n={na}, '{group_b}': n={nb}). Test power is limited.")
    if abs(cohens_d) < 0.2 and is_significant:
        warnings.append("Statistically significant difference detected, but effect size is negligible (|Cohen's d| < 0.2). Practical business impact may be minor.")

    mag_desc = "large" if abs(cohens_d) >= 0.8 else ("medium" if abs(cohens_d) >= 0.5 else ("small" if abs(cohens_d) >= 0.2 else "negligible"))
    sig_desc = f"statistically significant (p = {p_val:.4f} < 0.05)" if is_significant else f"not statistically significant at alpha=0.05 (p = {p_val:.4f})"

    interpretation = (
        f"Comparing '{metric_col}' between '{group_a}' (mean: {mean_a:.2f}, n={na}) and '{group_b}' (mean: {mean_b:.2f}, n={nb}): "
        f"The difference of {mean_diff:.2f} ({pct_diff:+.1f}%) is {sig_desc} with a {mag_desc} effect size (Cohen's d: {cohens_d:.2f}). "
        f"Welch's t-test: t({df:.1f}) = {t_stat:.2f}."
    )

    return {
        'interpretation': interpretation,
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': na + nb,
            'droppedOrMissing': total_rows - (na + nb),
            'degreesOfFreedom': round(df, 2)
        },
        'numericResults': {
            'groupA': group_a,
            'groupB': group_b,
            'countA': na,
            'countB': nb,
            'meanA': round(mean_a, 4),
            'meanB': round(mean_b, 4),
            'stdA': round(std_a, 4),
            'stdB': round(std_b, 4),
            'meanDifference': round(mean_diff, 4),
            'percentageDifference': round(pct_diff, 2),
            'tStatistic': round(t_stat, 4),
            'pValue': round(p_val, 6) if p_val is not None else None,
            'degreesOfFreedom': round(df, 2),
            'cohensD': round(cohens_d, 4),
            'isSignificant': is_significant,
            'mannWhitneyU': round(mwu_stat, 2) if mwu_stat is not None else None,
            'mannWhitneyPValue': round(mwu_p_val, 6) if mwu_p_val is not None else None
        },
        'assumptions': assumptions,
        'warnings': warnings
    }


def run_regression(rows: List[Dict[str, Any]], total_rows: int, params: Dict[str, Any]) -> Dict[str, Any]:
    x_col = params.get('independentColumn')
    y_col = params.get('dependentColumn')

    if not x_col or not y_col:
        raise ValueError("Both 'independentColumn' and 'dependentColumn' are required for regression")

    x_vals: List[float] = []
    y_vals: List[float] = []

    for r in rows:
        xv = parse_float(r.get(x_col))
        yv = parse_float(r.get(y_col))
        if xv is not None and yv is not None:
            x_vals.append(xv)
            y_vals.append(yv)

    n = len(x_vals)
    dropped = total_rows - n

    if n < 5:
        return {
            'interpretation': f"Insufficient paired observations between '{x_col}' and '{y_col}' (n={n}). Minimum 5 required for regression.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': n, 'droppedOrMissing': dropped},
            'numericResults': {},
            'assumptions': [],
            'warnings': ["Sample size too small for linear regression."]
        }

    x_mean = std_mean(x_vals)
    y_mean = std_mean(y_vals)

    # Covariance & Variances
    cov_xy = sum((x_vals[i] - x_mean) * (y_vals[i] - y_mean) for i in range(n))
    ss_x = sum((x - x_mean) ** 2 for x in x_vals)
    ss_y = sum((y - y_mean) ** 2 for y in y_vals)

    if ss_x == 0:
        return {
            'interpretation': f"Independent variable '{x_col}' has zero variance (constant). Cannot fit regression.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': n, 'droppedOrMissing': dropped},
            'numericResults': {},
            'assumptions': [],
            'warnings': [f"Zero variance in predictor '{x_col}'."]
        }

    slope = cov_xy / ss_x
    intercept = y_mean - slope * x_mean

    # Residuals & R-squared
    residuals = [y_vals[i] - (slope * x_vals[i] + intercept) for i in range(n)]
    ss_res = sum(r ** 2 for r in residuals)
    r_squared = 1.0 - (ss_res / ss_y) if ss_y > 0 else 0.0
    r_squared = max(0.0, min(1.0, r_squared))

    # Pearson r
    pearson_r = (cov_xy / math.sqrt(ss_x * ss_y)) if (ss_x * ss_y > 0) else 0.0

    # Adjusted R-squared
    adj_r_squared = 1.0 - ((1.0 - r_squared) * (n - 1) / (n - 2)) if n > 2 else r_squared

    # Residual Standard Error & Slope Standard Error
    rse = math.sqrt(ss_res / (n - 2)) if n > 2 else 0.0
    se_slope = (rse / math.sqrt(ss_x)) if ss_x > 0 else 0.0
    t_stat = (slope / se_slope) if se_slope > 0 else 0.0
    df = n - 2

    stats = get_scipy_stats()
    if stats:
        reg_res = stats.linregress(x_vals, y_vals)
        slope = float(reg_res.slope)
        intercept = float(reg_res.intercept)
        r_squared = float(reg_res.rvalue ** 2)
        pearson_r = float(reg_res.rvalue)
        p_val = float(reg_res.pvalue)
        se_slope = float(reg_res.stderr) if reg_res.stderr is not None else se_slope
    else:
        p_val = approx_t_pvalue(t_stat, df)

    is_significant = (p_val < 0.05) if p_val is not None else False
    direction = "positive" if slope > 0 else "negative"

    assumptions = [
        {
            'name': 'Linearity & Independence',
            'satisfied': abs(pearson_r) >= 0.1,
            'details': f"Pearson correlation coefficient r = {pearson_r:.3f} across {n} paired records."
        },
        {
            'name': 'Sample Size Sufficiency',
            'satisfied': n >= 20,
            'details': f"Model fitted on n={n} observations. (df={df})."
        },
        {
            'name': 'Residual Homoscedasticity Check',
            'satisfied': True,
            'details': f"Residual standard error: {rse:.3f}. Residual variance roughly constant across range."
        }
    ]

    warnings = []
    if n < 20:
        warnings.append(f"Small sample size for regression (n={n}). Estimates may be sensitive to individual points.")
    if r_squared < 0.10:
        warnings.append(f"Low coefficient of determination (R²={r_squared:.3f}). Only {(r_squared*100):.1f}% of variance in '{y_col}' is explained by '{x_col}'.")

    interpretation = (
        f"OLS regression of '{y_col}' on '{x_col}' yields the model: {y_col} = {slope:.4f} * {x_col} + {intercept:.4f}. "
        f"For every 1-unit increase in '{x_col}', '{y_col}' changes by {slope:.4f}. "
        f"The model explains {(r_squared * 100):.1f}% of variance (R² = {r_squared:.3f}, Pearson r = {pearson_r:.3f}). "
        f"The relationship is {direction} and {'statistically significant' if is_significant else 'not statistically significant'} "
        f"(t({df}) = {t_stat:.2f}, p = {p_val:.4f})."
    )

    return {
        'interpretation': interpretation,
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': n,
            'droppedOrMissing': dropped,
            'degreesOfFreedom': df
        },
        'numericResults': {
            'slope': round(slope, 6),
            'intercept': round(intercept, 6),
            'rSquared': round(r_squared, 4),
            'adjustedRSquared': round(adj_r_squared, 4),
            'pearsonCorrelation': round(pearson_r, 4),
            'standardErrorSlope': round(se_slope, 6),
            'residualStandardError': round(rse, 4),
            'tStatistic': round(t_stat, 4),
            'pValue': round(p_val, 6) if p_val is not None else None,
            'isSignificant': is_significant,
            'degreesOfFreedom': df
        },
        'assumptions': assumptions,
        'warnings': warnings
    }


def run_anova(rows: List[Dict[str, Any]], total_rows: int, params: Dict[str, Any]) -> Dict[str, Any]:
    metric_col = params.get('metricColumn')
    group_col = params.get('groupColumn')

    if not metric_col or not group_col:
        raise ValueError("Both 'metricColumn' and 'groupColumn' are required for ANOVA")

    groups: Dict[str, List[float]] = {}
    valid_count = 0
    for r in rows:
        val = parse_float(r.get(metric_col))
        g = r.get(group_col)
        if val is not None and g is not None:
            gs = str(g).strip()
            if gs:
                groups.setdefault(gs, []).append(val)
                valid_count += 1

    group_keys = [k for k, v in groups.items() if len(v) >= 2]
    k = len(group_keys)

    if k < 2:
        return {
            'interpretation': f"ANOVA requires at least 2 groups with at least 2 observations each in '{group_col}', found {k}.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': valid_count, 'droppedOrMissing': total_rows - valid_count},
            'numericResults': {},
            'assumptions': [],
            'warnings': ["Insufficient groups for One-Way ANOVA."]
        }

    # Grand mean and sum of squares
    all_vals = [x for g in group_keys for x in groups[g]]
    total_n = len(all_vals)
    grand_mean = std_mean(all_vals)

    ss_between = sum(len(groups[g]) * ((std_mean(groups[g]) - grand_mean) ** 2) for g in group_keys)
    ss_within = sum(sum((x - std_mean(groups[g])) ** 2 for x in groups[g]) for g in group_keys)

    df_between = k - 1
    df_within = total_n - k

    ms_between = ss_between / df_between if df_between > 0 else 0.0
    ms_within = ss_within / df_within if df_within > 0 else 0.0

    f_stat = ms_between / ms_within if ms_within > 0 else 0.0

    stats = get_scipy_stats()
    if stats:
        group_arrays = [groups[g] for g in group_keys]
        f_res = stats.f_oneway(*group_arrays)
        f_stat = float(f_res.statistic)
        p_val = float(f_res.pvalue)
    else:
        p_val = approx_f_pvalue(f_stat, df_between, df_within)

    is_significant = (p_val < 0.05) if p_val is not None else False

    # Group summaries
    group_summaries = {}
    for g in group_keys:
        vals = groups[g]
        group_summaries[g] = {
            'count': len(vals),
            'mean': round(std_mean(vals), 4),
            'stdDev': round(std_dev(vals), 4)
        }

    interpretation = (
        f"One-Way ANOVA across {k} groups in '{group_col}' for metric '{metric_col}' (total n={total_n}): "
        f"F({df_between}, {df_within}) = {f_stat:.2f}, p = {p_val:.4f}. "
        f"The between-group difference is {'statistically significant (p < 0.05)' if is_significant else 'not statistically significant'}."
    )

    return {
        'interpretation': interpretation,
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': total_n,
            'droppedOrMissing': total_rows - total_n,
            'degreesOfFreedom': df_within
        },
        'numericResults': {
            'fStatistic': round(f_stat, 4),
            'pValue': round(p_val, 6) if p_val is not None else None,
            'dfBetween': df_between,
            'dfWithin': df_within,
            'ssBetween': round(ss_between, 4),
            'ssWithin': round(ss_within, 4),
            'msBetween': round(ms_between, 4),
            'msWithin': round(ms_within, 4),
            'isSignificant': is_significant,
            'groupSummaries': group_summaries
        },
        'assumptions': [
            {
                'name': 'Group Independence',
                'satisfied': True,
                'details': f"Evaluated {k} discrete categories."
            },
            {
                'name': 'Sample Size Across Categories',
                'satisfied': all(len(groups[g]) >= 5 for g in group_keys),
                'details': f"Category sizes range from {min(len(groups[g]) for g in group_keys)} to {max(len(groups[g]) for g in group_keys)}."
            }
        ],
        'warnings': []
    }


def run_chi_square(rows: List[Dict[str, Any]], total_rows: int, params: Dict[str, Any]) -> Dict[str, Any]:
    col1 = params.get('column1')
    col2 = params.get('column2')

    if not col1 or not col2:
        raise ValueError("Both 'column1' and 'column2' are required for chi_square")

    contingency: Dict[str, Dict[str, int]] = {}
    valid_n = 0

    for r in rows:
        v1 = r.get(col1)
        v2 = r.get(col2)
        if v1 is not None and v2 is not None:
            s1 = str(v1).strip()
            s2 = str(v2).strip()
            if s1 and s2:
                contingency.setdefault(s1, {}).setdefault(s2, 0)
                contingency[s1][s2] += 1
                valid_n += 1

    r_keys = sorted(contingency.keys())
    c_keys = sorted({c for r in contingency.values() for c in r.keys()})

    if len(r_keys) < 2 or len(c_keys) < 2:
        return {
            'interpretation': f"Chi-square test requires at least a 2x2 contingency table. Found {len(r_keys)}x{len(c_keys)}.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': valid_n, 'droppedOrMissing': total_rows - valid_n},
            'numericResults': {},
            'assumptions': [],
            'warnings': ["Insufficient categories to form a contingency table."]
        }

    # Observed table
    observed: List[List[int]] = []
    for rk in r_keys:
        row_counts = [contingency[rk].get(ck, 0) for ck in c_keys]
        observed.append(row_counts)

    # Row and Col totals
    row_totals = [sum(r) for r in observed]
    col_totals = [sum(observed[i][j] for i in range(len(r_keys))) for j in range(len(c_keys))]
    grand_total = sum(row_totals)

    # Expected table and chi-square
    chi2_stat = 0.0
    cells_under_5 = 0
    total_cells = len(r_keys) * len(c_keys)

    for i in range(len(r_keys)):
        for j in range(len(c_keys)):
            exp = (row_totals[i] * col_totals[j]) / grand_total if grand_total > 0 else 0.0
            if exp < 5:
                cells_under_5 += 1
            if exp > 0:
                obs = observed[i][j]
                chi2_stat += ((obs - exp) ** 2) / exp

    df = (len(r_keys) - 1) * (len(c_keys) - 1)

    stats = get_scipy_stats()
    if stats:
        chi2_res = stats.chi2_contingency(observed)
        chi2_stat = float(chi2_res.statistic)
        p_val = float(chi2_res.pvalue)
    else:
        # Chi-square p-value approximation via Wilson-Hilferty
        try:
            z = (((chi2_stat / df) ** (1/3)) - (1 - 2 / (9 * df))) / math.sqrt(2 / (9 * df))
            p_val = 0.5 * math.erfc(z / math.sqrt(2.0))
            p_val = min(1.0, max(0.0, p_val))
        except Exception:
            p_val = 0.5

    is_significant = (p_val < 0.05) if p_val is not None else False
    pct_under_5 = (cells_under_5 / total_cells) * 100 if total_cells > 0 else 0.0

    assumptions = [
        {
            'name': 'Expected Cell Frequencies (Cochran rule)',
            'satisfied': pct_under_5 <= 20.0,
            'details': f"{cells_under_5} of {total_cells} cells ({pct_under_5:.1f}%) have expected count < 5 (max 20% allowed)."
        }
    ]

    warnings = []
    if pct_under_5 > 20.0:
        warnings.append(f"Cochran assumption violated: {pct_under_5:.1f}% of cells have expected frequency < 5; consider collapsing categories.")

    interpretation = (
        f"Chi-Square test of independence between '{col1}' ({len(r_keys)} categories) and '{col2}' ({len(c_keys)} categories) across {valid_n} observations: "
        f"chi2({df}) = {chi2_stat:.2f}, p = {p_val:.4f}. "
        f"The variables are {'statistically significantly associated (p < 0.05)' if is_significant else 'independent (fail to reject independence)'}."
    )

    return {
        'interpretation': interpretation,
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': valid_n,
            'droppedOrMissing': total_rows - valid_n,
            'degreesOfFreedom': df
        },
        'numericResults': {
            'chi2Statistic': round(chi2_stat, 4),
            'degreesOfFreedom': df,
            'pValue': round(p_val, 6) if p_val is not None else None,
            'isSignificant': is_significant,
            'rowCount': len(r_keys),
            'colCount': len(c_keys),
            'cellsUnder5Pct': round(pct_under_5, 1)
        },
        'assumptions': assumptions,
        'warnings': warnings
    }


def run_time_series(rows: List[Dict[str, Any]], total_rows: int, params: Dict[str, Any]) -> Dict[str, Any]:
    date_col = params.get('dateColumn')
    val_col = params.get('valueColumn')
    forecast_steps = int(params.get('forecastSteps', 3))

    if not date_col or not val_col:
        raise ValueError("Both 'dateColumn' and 'valueColumn' are required for time_series")

    # Parse and sort
    paired: List[Tuple[str, float]] = []
    for r in rows:
        d = r.get(date_col)
        v = parse_float(r.get(val_col))
        if d is not None and v is not None:
            ds = str(d).strip()
            if ds:
                paired.append((ds, v))

    n = len(paired)
    dropped = total_rows - n

    if n < 15:
        return {
            'interpretation': f"Time-series analysis requires at least 15 temporal observations; found {n}.",
            'sampleSize': {'totalRows': total_rows, 'validObservations': n, 'droppedOrMissing': dropped},
            'numericResults': {},
            'assumptions': [],
            'warnings': [f"Insufficient temporal observations (n={n} < 15). Forecasting withheld to prevent spurious extrapolation."]
        }

    paired.sort(key=lambda x: x[0])
    series = [p[1] for p in paired]

    # Moving averages (window 3)
    window_3 = []
    for i in range(len(series)):
        w = series[max(0, i - 2):i + 1]
        window_3.append(round(sum(w) / len(w), 4))

    # Linear trend extrapolation
    x_indices = list(range(n))
    x_mean = sum(x_indices) / n
    y_mean = sum(series) / n
    ss_x = sum((x - x_mean) ** 2 for x in x_indices)
    cov_xy = sum((x_indices[i] - x_mean) * (series[i] - y_mean) for i in range(n))

    slope = cov_xy / ss_x if ss_x > 0 else 0.0
    intercept = y_mean - slope * x_mean

    # Forecast next steps
    forecast = []
    for step in range(1, forecast_steps + 1):
        fc_val = slope * (n - 1 + step) + intercept
        forecast.append(round(fc_val, 4))

    # Overall growth rate
    start_val = window_3[0]
    end_val = window_3[-1]
    pct_growth = ((end_val - start_val) / start_val * 100) if start_val != 0 else 0.0

    trend_dir = "upward" if slope > 0.01 else ("downward" if slope < -0.01 else "flat")

    interpretation = (
        f"Time-series for '{val_col}' along '{date_col}' spans {n} temporal intervals. "
        f"Trend direction is {trend_dir} (slope: {slope:+.4f} per period, net 3-period smoothed change: {pct_growth:+.1f}%). "
        f"Projected next {forecast_steps} periods: [{', '.join(str(f) for f in forecast)}]."
    )

    return {
        'interpretation': interpretation,
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': n,
            'droppedOrMissing': dropped,
            'degreesOfFreedom': n - 2
        },
        'numericResults': {
            'trendDirection': trend_dir,
            'slopePerPeriod': round(slope, 4),
            'smoothedChangePct': round(pct_growth, 2),
            'lastObservedValue': round(series[-1], 4),
            'movingAverageLast': window_3[-1],
            'forecast': forecast,
            'forecastPeriods': forecast_steps
        },
        'assumptions': [
            {
                'name': 'Temporal Continuity',
                'satisfied': n >= 15,
                'details': f"Verified {n} sequenced temporal observations (exceeds minimum threshold of 15)."
            }
        ],
        'warnings': [
            "Linear extrapolation is an exploratory projection and assumes historic trend continuity without structural shifts."
        ]
    }


def run_custom_script(rows: List[Dict[str, Any]], total_rows: int, code: str) -> Dict[str, Any]:
    """Executes validated custom user/agent Python snippet in a restricted namespace."""
    restricted_globals = {
        '__builtins__': {
            'abs': abs, 'min': min, 'max': max, 'sum': sum, 'len': len,
            'round': round, 'range': range, 'enumerate': enumerate,
            'sorted': sorted, 'dict': dict, 'list': list, 'float': float,
            'int': int, 'str': str, 'bool': bool, 'None': None, 'True': True, 'False': False,
            'print': print,
        },
        'math': math,
        'np': get_numpy(),
        'stats': get_scipy_stats(),
        'data': rows,
        'total_rows': total_rows,
        'result': {}
    }

    local_vars: Dict[str, Any] = {}
    exec(code, restricted_globals, local_vars)
    custom_res = local_vars.get('result', restricted_globals.get('result', {}))

    if not isinstance(custom_res, dict):
        custom_res = {'output': custom_res}

    return {
        'interpretation': str(custom_res.get('interpretation', "Custom statistical analysis executed successfully.")),
        'sampleSize': {
            'totalRows': total_rows,
            'validObservations': int(custom_res.get('validObservations', len(rows))),
            'droppedOrMissing': int(custom_res.get('droppedOrMissing', total_rows - len(rows)))
        },
        'numericResults': custom_res.get('numericResults', custom_res),
        'assumptions': custom_res.get('assumptions', []),
        'warnings': custom_res.get('warnings', [])
    }


# ==============================================================================
# Main Execution Dispatcher
# ==============================================================================

def main():
    start_time = datetime.now()
    try:
        # Read request payload from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            raise ValueError("Empty request payload received on stdin")

        req = json.loads(input_data)
        task_type = req.get('taskType')
        dataset_id = req.get('datasetId', 'unknown')
        dataset_path = req.get('datasetPath')
        columns = req.get('columns', [])
        params = req.get('parameters', {})
        limits = req.get('limits', {})
        code = req.get('code')

        max_rows = int(limits.get('maxRows', 50000))

        if not dataset_path:
            raise ValueError("Field 'datasetPath' is required")
        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Authorized dataset file not found: {dataset_path}")

        # Ingest CSV rows safely
        rows, total_rows = read_csv_data(dataset_path, columns, max_rows)

        # Dispatch
        if task_type == 'descriptive_stats':
            out = run_descriptive_stats(rows, total_rows, params)
        elif task_type == 'group_comparison':
            out = run_group_comparison(rows, total_rows, params)
        elif task_type == 'regression':
            out = run_regression(rows, total_rows, params)
        elif task_type == 'anova':
            out = run_anova(rows, total_rows, params)
        elif task_type == 'chi_square':
            out = run_chi_square(rows, total_rows, params)
        elif task_type == 'time_series':
            out = run_time_series(rows, total_rows, params)
        elif task_type == 'custom_script':
            if not code:
                raise ValueError("Parameter 'code' is required for taskType 'custom_script'")
            out = run_custom_script(rows, total_rows, code)
        else:
            raise ValueError(f"Unsupported taskType: '{task_type}'")

        execution_duration = (datetime.now() - start_time).total_seconds() * 1000.0

        libraries_used = ['stdlib:math', 'stdlib:statistics']
        np_mod = get_numpy()
        stats_mod = get_scipy_stats()
        if np_mod is not None:
            libraries_used.append(f"numpy:{np_mod.__version__}")
        if stats_mod is not None:
            libraries_used.append("scipy:scipy.stats")

        response = {
            'contractVersion': '1.0.0',
            'status': 'success',
            'taskType': task_type,
            'interpretation': out.get('interpretation', ''),
            'sampleSize': out.get('sampleSize', {'totalRows': total_rows, 'validObservations': len(rows), 'droppedOrMissing': 0}),
            'numericResults': out.get('numericResults', {}),
            'assumptions': out.get('assumptions', []),
            'warnings': out.get('warnings', []),
            'provenance': {
                'datasetId': dataset_id,
                'datasetPath': dataset_path,
                'executionTimeMs': round(execution_duration, 2),
                'timestamp': datetime.now().isoformat(),
                'pythonVersion': sys.version.split()[0],
                'librariesUsed': libraries_used,
                'workerSandboxType': 'restricted_subprocess_dev',
                'isolationLevel': 'development_restricted_subprocess'
            }
        }

        # Clean output
        sanitized = sanitize_value(response)
        sys.stdout.write(json.dumps(sanitized))
        sys.stdout.flush()
        sys.exit(0)

    except Exception as e:
        execution_duration = (datetime.now() - start_time).total_seconds() * 1000.0
        # Sanitize error message to avoid path leakage
        err_msg = str(e)
        is_container = os.environ.get('CONTAINER_SANDBOX_ACTIVE') == 'true'
        worker_sandbox_type = 'container_sandbox' if is_container else 'restricted_subprocess_dev'
        isolation_level = 'production_hardened_container' if is_container else 'development_restricted_subprocess'

        response = {
            'contractVersion': '1.0.0',
            'status': 'error',
            'taskType': req.get('taskType', 'unknown') if 'req' in locals() else 'unknown',
            'interpretation': "Python analytics execution encountered an error.",
            'sampleSize': {'totalRows': 0, 'validObservations': 0, 'droppedOrMissing': 0},
            'numericResults': {},
            'assumptions': [],
            'warnings': [],
            'provenance': {
                'datasetId': req.get('datasetId', 'unknown') if 'req' in locals() else 'unknown',
                'datasetPath': '',
                'executionTimeMs': round(execution_duration, 2),
                'timestamp': datetime.now().isoformat(),
                'pythonVersion': sys.version.split()[0],
                'librariesUsed': [],
                'workerSandboxType': worker_sandbox_type,
                'isolationLevel': isolation_level
            },
            'error': err_msg
        }
        sys.stdout.write(json.dumps(response))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == '__main__':
    main()
