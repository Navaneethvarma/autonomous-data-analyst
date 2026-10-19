import { runAutomatedEdaTool } from '../mastra/tools/run-automated-eda-tool.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const datasetPath = args[0] || 'sample_sales.csv';

  console.log('\n================================================================');
  console.log('   Autonomous Data Analyst — Automated EDA & Business Insights  ');
  console.log('================================================================');
  console.log(`Target Dataset: ${datasetPath}\n`);

  try {
    const rawResult = await runAutomatedEdaTool.execute!(
      {
        datasetPath,
        includeCorrelations: true,
      },
      {} as any
    );

    if (!rawResult || typeof rawResult !== 'object' || !('eda' in rawResult)) {
      console.log('No valid EDA result returned.');
      return;
    }

    const { eda, insights, provenance, version } = rawResult;

    console.log(`EDA Schema Version : ${version}`);
    console.log(`Execution Time     : ${eda.executionTimeMs} ms`);
    console.log(`Engine             : ${provenance.engine}`);
    console.log(`Row Count          : ${eda.rowCount}`);
    console.log(`Column Count       : ${eda.columnCount}`);
    console.log(`Completeness Score : ${eda.completenessScore}%\n`);

    // Numeric Distributions
    if (eda.numericDistributions.length > 0) {
      console.log('---------------- Numeric Distributions ----------------');
      console.table(
        eda.numericDistributions.map(n => ({
          column: n.column,
          count: n.count,
          nulls: `${n.nullCount} (${n.nullPercentage}%)`,
          min: n.min,
          mean: n.mean,
          median: n.median,
          max: n.max,
          stdDev: n.stdDev,
          skew: n.skewness,
          outliers: `${n.outlierCount} (${n.outlierPercentage}%)`,
        }))
      );
      console.log('');
    }

    // Categorical Distributions
    if (eda.categoricalDistributions.length > 0) {
      console.log('--------------- Categorical Distributions ---------------');
      console.table(
        eda.categoricalDistributions.map(c => ({
          column: c.column,
          distinct: c.distinctCount,
          mode: c.mode,
          modePct: c.concentrationPercentage !== null ? `${c.concentrationPercentage}%` : 'N/A',
          isConstant: c.isConstant,
          highCard: c.isHighCardinality,
        }))
      );
      console.log('');
    }

    // Correlations
    if (eda.correlations.length > 0) {
      console.log('---------------- Pairwise Correlations ----------------');
      console.table(
        eda.correlations.map(cr => ({
          colA: cr.columnA,
          colB: cr.columnB,
          pearsonR: cr.pearsonCoefficient,
          strength: cr.strength,
          sampleN: cr.sampleSize,
        }))
      );
      console.log('');
    }

    // Temporal Analyses
    if (eda.temporalAnalyses.length > 0) {
      console.log('---------------- Temporal Trend Analyses ----------------');
      console.table(
        eda.temporalAnalyses.map(t => ({
          dateColumn: t.dateColumn,
          span: `${t.minDate} -> ${t.maxDate} (${t.rangeDays}d)`,
          periodType: t.periodType,
          trend: t.trendDirection,
          growthRate: t.growthRatePercentage !== null ? `${t.growthRatePercentage}%` : 'N/A',
          periods: t.dataPoints.length,
          anomalies: t.anomalousPeriods.join(', ') || 'none',
        }))
      );
      console.log('');
    }

    // Ranked Business Insights
    console.log('================================================================');
    console.log(`   Ranked Evidence-Backed Business Insights (${insights.length} Identified)   `);
    console.log('================================================================');

    for (let i = 0; i < insights.length; i++) {
      const ins = insights[i]!;
      console.log(`\n[${i + 1}] [${ins.importance.toUpperCase()}] ${ins.title}`);
      console.log(`    Category   : ${ins.category} | Method: ${ins.analyticalMethod} | Confidence: ${ins.confidence}`);
      console.log(`    Columns    : ${ins.affectedColumns.join(', ') || 'N/A'}`);
      console.log(`    FACT       : ${ins.observedFact}`);
      console.log(`    HYPOTHESIS : ${ins.hypothesis}`);
      console.log(`    ACTION     : ${ins.recommendation}`);
      if (ins.limitations.length > 0) {
        console.log(`    CAVEAT     : ${ins.limitations[0]}`);
      }
    }

    console.log('\n================================================================\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[ERROR] EDA failed: ${message}\n`);
    process.exit(1);
  }
}

main();
