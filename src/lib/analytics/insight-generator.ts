import type {
  DatasetEdaSummary,
  BusinessInsight,
  EdaAndInsightsResult,
} from './eda-types.js';
import { EDA_SCHEMA_VERSION } from './eda-types.js';

const IMPORTANCE_WEIGHTS: Record<BusinessInsight['importance'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Generates ranked, actionable, evidence-backed business insights from computed EDA summary.
 * Strictly separates empirical observed facts from exploratory hypotheses and recommendations.
 */
export function generateBusinessInsights(eda: DatasetEdaSummary): BusinessInsight[] {
  const insights: BusinessInsight[] = [];
  const { rowCount, completenessScore, datasetName } = eda;

  const baseConfidence = rowCount >= 50 && completenessScore >= 90
    ? 'high'
    : rowCount >= 10 && completenessScore >= 70
    ? 'medium'
    : 'low';

  const baseConfidenceReason = `Dataset '${datasetName}' has ${rowCount} rows with ${completenessScore}% overall completeness.`;

  // 1. Data Quality Risks
  for (const issue of eda.qualityIssues) {
    if (issue.severity === 'critical' || issue.severity === 'warning') {
      const imp: BusinessInsight['importance'] = issue.severity === 'critical' ? 'critical' : 'high';
      insights.push({
        id: `ins_dq_${issue.column || 'dataset'}_${issue.type}`,
        title: `Data Quality Alert: ${issue.column ? `Column '${issue.column}'` : 'Dataset'} (${issue.type.replace(/_/g, ' ')})`,
        category: 'data_quality_risk',
        importance: imp,
        observedFact: issue.message,
        hypothesis: issue.column
          ? `Missingness or uniformity in '${issue.column}' may stem from incomplete upstream ingestion, optional user input fields, or recent schema migrations.`
          : `Dataset integrity constraints require resolution before running downstream predictive models or financial aggregations.`,
        recommendation: issue.column
          ? `Audit data pipeline extraction for '${issue.column}' and verify if default fallback values or schema nullability rules need tightening.`
          : `Investigate source dataset ingestion pipeline and verify that files are populated prior to analysis execution.`,
        affectedColumns: issue.column ? [issue.column] : [],
        supportingMetrics: {
          issueType: issue.type,
          metricValue: issue.metricValue ?? null,
          completenessScore,
          totalRows: rowCount,
        },
        analyticalMethod: 'data_quality_audit',
        confidence: 'high', // observed fact is 100% computed from the dataset
        confidenceReason: 'Derived directly from comprehensive missingness and schema verification checks.',
        limitations: ['Based on current snapshot data; upstream ETL logs were not examined directly.'],
      });
    }
  }

  // 2. Outlier Insights from Numeric Distributions
  for (const num of eda.numericDistributions) {
    if (num.outlierCount > 0 && num.outlierPercentage > 0) {
      const imp: BusinessInsight['importance'] = num.outlierPercentage >= 5 ? 'high' : 'medium';
      insights.push({
        id: `ins_outlier_${num.column}`,
        title: `Outlier Detection in '${num.column}'`,
        category: 'anomaly_detection',
        importance: imp,
        observedFact: `Column '${num.column}' contains ${num.outlierCount} outlier values (${num.outlierPercentage}% of records) falling outside the IQR threshold interval [${num.outlierBounds.lowerBound}, ${num.outlierBounds.upperBound}]. Minimum is ${num.min}, maximum is ${num.max}, and median is ${num.median}.`,
        hypothesis: `Extreme values in '${num.column}' could reflect high-value premium transactions, bulk institutional orders, or manual data entry anomalies.`,
        recommendation: `Conduct segmentation analysis excluding these ${num.outlierCount} extreme records to compare baseline core behavior against premium outliers.`,
        affectedColumns: [num.column],
        supportingMetrics: {
          outlierCount: num.outlierCount,
          outlierPercentage: num.outlierPercentage,
          lowerBound: num.outlierBounds.lowerBound,
          upperBound: num.outlierBounds.upperBound,
          min: num.min,
          max: num.max,
          median: num.median,
        },
        analyticalMethod: 'iqr_outlier_detection',
        confidence: rowCount >= 10 ? 'high' : 'medium',
        confidenceReason: `Calculated from ${num.count} non-null numeric values using standard Tukey 1.5x IQR boundaries.`,
        limitations: [
          'IQR boundaries assume unimodal distributions; highly multi-modal data may require domain-specific thresholds.',
        ],
      });
    }

    // Heavy Skewness
    if (num.skewness !== null && Math.abs(num.skewness) >= 1.5 && !num.isConstant) {
      insights.push({
        id: `ins_skew_${num.column}`,
        title: `Distribution Asymmetry in '${num.column}'`,
        category: 'category_distribution',
        importance: 'medium',
        observedFact: `Column '${num.column}' exhibits significant ${num.skewness > 0 ? 'positive (right)' : 'negative (left)'} skewness (coefficient: ${num.skewness.toFixed(2)}). The mean (${num.mean}) differs notably from the median (${num.median}).`,
        hypothesis: `A minority of high-magnitude values are pulling the arithmetic average away from the typical experience represented by the median.`,
        recommendation: `Use median and interquartile range (IQR) as the primary executive KPI instead of arithmetic mean to avoid reporting distorted central tendency.`,
        affectedColumns: [num.column],
        supportingMetrics: {
          skewness: num.skewness,
          mean: num.mean,
          median: num.median,
          stdDev: num.stdDev,
        },
        analyticalMethod: 'parametric_skewness_analysis',
        confidence: num.count >= 8 ? 'high' : 'medium',
        confidenceReason: `Sample moment computation across ${num.count} non-null values.`,
        limitations: ['Skewness measures asymmetric tails but does not isolate specific underlying sub-populations.'],
      });
    }
  }

  // 3. Category Distribution and Concentration Insights
  for (const cat of eda.categoricalDistributions) {
    if (cat.mode && cat.concentrationPercentage !== null && !cat.isConstant && !cat.isHighCardinality) {
      if (cat.concentrationPercentage >= 35) {
        // Distinguish descriptive operational/status flags (e.g. payment_status=Completed, discount_applied=false)
        // from strategic commercial segment concentration (e.g. product_category, region, customer_segment)
        const lowerCol = cat.column.toLowerCase();
        const lowerMode = cat.mode.toLowerCase();
        const isStatusOrFlag =
          lowerCol.includes('status') ||
          lowerCol.startsWith('is_') ||
          lowerCol.startsWith('has_') ||
          lowerCol.includes('discount') ||
          lowerCol.includes('flag') ||
          ['true', 'false', 'completed', 'pending', 'active', 'inactive', 'yes', 'no'].includes(lowerMode);

        if (isStatusOrFlag) {
          // Elevated as a descriptive baseline fact with 'low' importance, not a strategic revenue finding
          insights.push({
            id: `ins_frequency_${cat.column}`,
            title: `Operational Frequency: '${cat.column}' Baseline (${cat.mode})`,
            category: 'category_distribution',
            importance: 'low',
            observedFact: `Operational baseline in '${cat.column}': '${cat.mode}' represents ${cat.concentrationPercentage}% of valid records (${cat.modeCount} of ${cat.totalCount} non-null rows).`,
            hypothesis: `Standard operational workflow baseline where the predominant outcome is '${cat.mode}'.`,
            recommendation: `Monitor '${cat.column}' for shifts in status rates, but treat this as a descriptive baseline rather than an executive revenue driver unless correlated with revenue loss or operational bottlenecks.`,
            affectedColumns: [cat.column],
            supportingMetrics: {
              mode: cat.mode,
              modeCount: cat.modeCount,
              totalCount: cat.totalCount,
              concentrationPercentage: cat.concentrationPercentage,
              distinctCount: cat.distinctCount,
            },
            analyticalMethod: 'frequency_concentration_analysis',
            confidence: baseConfidence,
            confidenceReason: `${baseConfidenceReason} Derived from ${cat.totalCount} non-null categorical entries.`,
            limitations: ['Status frequencies reflect operational states and are not primary drivers of commercial strategy.'],
          });
        } else {
          // Strategic commercial segment concentration (product category, region, customer segment)
          const imp: BusinessInsight['importance'] = cat.concentrationPercentage >= 50 ? 'high' : 'medium';
          insights.push({
            id: `ins_concentration_${cat.column}`,
            title: `Concentration in '${cat.column}': '${cat.mode}' Dominance`,
            category: 'revenue_concentration',
            importance: imp,
            observedFact: `The top category '${cat.mode}' in column '${cat.column}' represents ${cat.concentrationPercentage}% of all valid records (${cat.modeCount} of ${cat.totalCount} non-null rows). There are ${cat.distinctCount} distinct categories in total.`,
            hypothesis: `Strong preference or volume concentration in '${cat.mode}' suggests either product-market fit or an over-reliance on a single segment.`,
            recommendation: `Evaluate operational dependencies on '${cat.mode}'. Determine if secondary segments (${cat.topValues.slice(1, 3).map(v => `'${v.value}'`).join(', ')}) can be expanded through targeted campaigns.`,
            affectedColumns: [cat.column],
            supportingMetrics: {
              mode: cat.mode,
              modeCount: cat.modeCount,
              totalCount: cat.totalCount,
              concentrationPercentage: cat.concentrationPercentage,
              distinctCount: cat.distinctCount,
            },
            analyticalMethod: 'frequency_concentration_analysis',
            confidence: baseConfidence,
            confidenceReason: `${baseConfidenceReason} Derived from ${cat.totalCount} non-null categorical entries.`,
            limitations: ['Category distribution reflects transaction frequency, which may differ from dollar-weighted revenue volume.'],
          });
        }
      }
    }
  }

  // 4. Temporal Trend Insights
  for (const temp of eda.temporalAnalyses) {
    if (temp.trendDirection !== 'insufficient_data' && temp.growthRatePercentage !== null) {
      const isSignificant = Math.abs(temp.growthRatePercentage) >= 20;
      const imp: BusinessInsight['importance'] = isSignificant ? 'high' : 'medium';

      insights.push({
        id: `ins_trend_${temp.dateColumn}`,
        title: `Temporal Trend: ${temp.trendDirection.toUpperCase()} (${temp.growthRatePercentage > 0 ? '+' : ''}${temp.growthRatePercentage}% over period)`,
        category: 'trend_and_growth',
        importance: imp,
        observedFact: `Activity tracked along '${temp.dateColumn}' spans ${temp.rangeDays} days (${temp.minDate} to ${temp.maxDate}) across ${temp.dataPoints.length} ${temp.periodType} periods. The net period-over-period trajectory changed by ${temp.growthRatePercentage}% with a '${temp.trendDirection}' pattern. ${temp.anomalousPeriods.length > 0 ? `Unusual volatility was observed in periods: [${temp.anomalousPeriods.join(', ')}].` : ''}`,
        hypothesis: temp.growthRatePercentage > 0
          ? `Positive growth over this window may correspond to seasonality, marketing acquisition surges, or expanding customer activity.`
          : temp.growthRatePercentage < 0
          ? `A decline over this timeframe could reflect post-holiday contraction, churn, or reduced customer acquisition velocity.`
          : `Stable period-over-period volume indicates mature, predictable run-rate activity.`,
        recommendation: temp.growthRatePercentage < 0
          ? `Conduct a cohort-level retention review for the periods preceding the contraction to isolate churn causes.`
          : `Forecast near-term capacity and supply chain requirements assuming continuation of current trajectory, validating against prior seasonal cycles.`,
        affectedColumns: [temp.dateColumn],
        supportingMetrics: {
          minDate: temp.minDate,
          maxDate: temp.maxDate,
          rangeDays: temp.rangeDays,
          periodsEvaluated: temp.dataPoints.length,
          growthRatePercentage: temp.growthRatePercentage,
          trendDirection: temp.trendDirection,
          anomaliesDetected: temp.anomalousPeriods.length,
        },
        analyticalMethod: 'temporal_trend_evaluation',
        confidence: temp.dataPoints.length >= 4 ? 'high' : 'medium',
        confidenceReason: `Evaluated over ${temp.dataPoints.length} contiguous ${temp.periodType} intervals.`,
        limitations: [
          'Evaluates aggregate volume change between start and end intervals; external seasonal factors require multi-year historical data to establish cyclicality.',
        ],
      });
    }
  }

  // 5. Correlation Insights (Strictly Enforcing Anti-Causation)
  for (const corr of eda.correlations) {
    if (corr.strength.includes('strong') || corr.strength.includes('moderate')) {
      const imp: BusinessInsight['importance'] = corr.strength.includes('strong') ? 'high' : 'medium';
      insights.push({
        id: `ins_corr_${corr.columnA}_${corr.columnB}`,
        title: `Correlation Identified: '${corr.columnA}' vs '${corr.columnB}' (r = ${corr.pearsonCoefficient.toFixed(2)})`,
        category: 'correlation_analysis',
        importance: imp,
        observedFact: `A statistically ${corr.strength.replace(/_/g, ' ')} linear association (Pearson r = ${corr.pearsonCoefficient.toFixed(2)}, sample size n = ${corr.sampleSize}) exists between '${corr.columnA}' and '${corr.columnB}'.`,
        hypothesis: corr.pearsonCoefficient > 0
          ? `Increases in '${corr.columnA}' coincide with higher values in '${corr.columnB}'. This may be driven by common underlying business scale or joint transactional dynamics.`
          : `Higher values in '${corr.columnA}' coincide with lower values in '${corr.columnB}', potentially indicating an inverse trade-off or discounting effect.`,
        recommendation: `Analyze paired scatter plots and residual distributions. Prior to making operational policy changes, execute a controlled A/B test or multivariate regression to verify whether an actual causal mechanism exists.`,
        affectedColumns: [corr.columnA, corr.columnB],
        supportingMetrics: {
          columnA: corr.columnA,
          columnB: corr.columnB,
          pearsonCoefficient: corr.pearsonCoefficient,
          sampleSize: corr.sampleSize,
          strength: corr.strength,
        },
        analyticalMethod: 'pearson_correlation_analysis',
        confidence: corr.sampleSize >= 15 ? 'high' : 'medium',
        confidenceReason: `Computed using ${corr.sampleSize} valid pairwise observations.`,
        limitations: [
          'CRITICAL: Correlation does NOT demonstrate or imply causation. Unmeasured confounders or external factors may account for the relationship.',
          'Linear correlation assesses only linear co-movement and does not capture non-linear or threshold dependencies.',
        ],
      });
    }
  }

  // 6. Sort insights by ranked importance (critical -> high -> medium -> low)
  insights.sort((a, b) => {
    const diff = IMPORTANCE_WEIGHTS[b.importance] - IMPORTANCE_WEIGHTS[a.importance];
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  return insights;
}

/**
 * Combines EDA summary and generated business insights into a versioned result contract.
 */
export function buildEdaAndInsightsResult(
  eda: DatasetEdaSummary,
  insights: BusinessInsight[]
): EdaAndInsightsResult {
  return {
    version: EDA_SCHEMA_VERSION,
    dataset: eda.datasetName,
    eda,
    insights,
    provenance: {
      datasetFile: eda.datasetName,
      analyzedAt: eda.analyzedAt,
      executionTimeMs: eda.executionTimeMs,
      engine: 'DuckDB in-memory analytical statistical engine v1.4.4',
    },
  };
}
