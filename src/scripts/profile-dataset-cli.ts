import { profileDatasetTool } from '../mastra/tools/profile-dataset-tool.js';
import type { CategoricalValueCount, DatasetProfile } from '../lib/dataset/types.js';

async function main(): Promise<void> {
  const targetFile = process.argv[2] || 'sample_sales.csv';
  console.log(`\n=== Autonomous Data Analyst - Dataset Profiler ===`);
  console.log(`Target dataset: ${targetFile}\n`);

  try {
    const rawResult = await profileDatasetTool.execute!(
      { filePath: targetFile, maxDistinctValues: 1000 },
      {} as any
    );

    if (!rawResult || typeof rawResult !== 'object' || !('rowCount' in rawResult)) {
      console.log('No valid profile output returned from tool execution.');
      return;
    }

    const profile = rawResult as DatasetProfile;

    console.log(`File: ${profile.fileName}`);
    console.log(`Size: ${(profile.fileSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`Total Rows: ${profile.rowCount}`);
    console.log(`Total Columns: ${profile.columnCount}`);
    console.log(`Duplicate Rows: ${profile.duplicateRowCount}`);
    console.log(`Profiled At: ${profile.profiledAt}\n`);

    console.log('--- Column Profiles ---');
    for (const col of profile.columns) {
      console.log(`\n• [${col.name}] (Type: ${col.inferredType})`);
      console.log(`  - Non-null: ${col.nonNullCount} / Nulls: ${col.nullCount} (${col.nullPercentage}%)`);
      console.log(`  - Distinct values: ${col.distinctCount}`);

      if (col.numericStats) {
        const { min, max, mean, median, stdDev, p25, p75 } = col.numericStats;
        console.log(`  - Numeric Distribution: min=${min}, p25=${p25}, median=${median}, mean=${mean}, p75=${p75}, max=${max}, stdDev=${stdDev}`);
      }

      if (col.dateStats) {
        console.log(`  - Date Range: min=${col.dateStats.minDate} -> max=${col.dateStats.maxDate}`);
      }

      if (col.categoricalStats && col.categoricalStats.topValues.length > 0) {
        const topSummary = col.categoricalStats.topValues
          .slice(0, 3)
          .map((t: CategoricalValueCount) => `'${t.value}' (${t.count})`)
          .join(', ');
        console.log(`  - Top Categories: ${topSummary}`);
      }

      if (col.warnings.length > 0) {
        console.log(`  - Column Warnings: ${col.warnings.join('; ')}`);
      }
    }

    if (profile.warnings.length > 0) {
      console.log('\n--- Data Quality Warnings ---');
      for (const w of profile.warnings) {
        console.log(`  [${w.type.toUpperCase()}]${w.column ? ` (Column: ${w.column})` : ''}: ${w.message}`);
      }
    } else {
      console.log('\n✓ No critical data quality issues identified.');
    }

    console.log('\n=== Profiling Complete ===\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[ERROR] Profiling failed: ${message}\n`);
    process.exit(1);
  }
}

main();
