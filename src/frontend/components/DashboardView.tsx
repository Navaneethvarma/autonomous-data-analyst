import React from 'react';
import type { DashboardSpec, TableSpec } from '../../lib/dashboard/types.js';
import { KpiCard } from './KpiCard.js';
import { EChartsChart } from './EChartsChart.js';
import { FilterBar } from './FilterBar.js';
import { InsightsPanel } from './InsightsPanel.js';
import { CorrelationView } from './CorrelationView.js';
import { DataTable } from './DataTable.js';

interface DashboardViewProps {
  spec: DashboardSpec;
  selectedFilters: Record<string, string>;
  filteredTable?: TableSpec;
  onFilterChange: (column: string, value: string) => void;
  onResetFilters: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  spec,
  selectedFilters,
  filteredTable,
  onFilterChange,
  onResetFilters,
}) => {
  return (
    <section id="dashboard-view">
      {/* Top Header */}
      <header className="dashboard-header">
        <div>
          <div className="header-badge">
            <span className="pulse-dot" />
            <span>Autonomous Data Analyst • Live Analytical Execution</span>
          </div>
          <h1 className="dashboard-title">{spec.metadata.title}</h1>
          <p className="dashboard-desc">{spec.metadata.description}</p>
        </div>

        <div className="header-meta">
          <div className="meta-pill verified" title="Calculated across 100% of rows">
            <span>✓</span>
            <span>Dataset: <strong>{spec.metadata.datasetName}</strong></span>
          </div>

          <div className="meta-pill">
            <span>Rows: <strong>{spec.metadata.datasetRowCount}</strong></span>
            <span>•</span>
            <span>Columns: <strong>{spec.metadata.datasetColumnCount}</strong></span>
          </div>

          <div className="meta-pill">
            <span>Completeness: <strong>{spec.metadata.completenessScore}%</strong></span>
          </div>

          <div className="meta-pill" style={{ fontSize: '0.75rem' }}>
            <span>Engine: <strong>{spec.metadata.engine}</strong></span>
          </div>
        </div>
      </header>

      {/* Slicers */}
      <FilterBar
        filters={spec.filters}
        selectedFilters={selectedFilters}
        onFilterChange={onFilterChange}
        onReset={onResetFilters}
      />

      {/* Headline KPI Cards */}
      <section aria-label="Key Performance Indicators">
        <div className="kpi-grid">
          {spec.kpis.map(kpi => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>

      {/* Evidence-Backed Strategic Insights */}
      <InsightsPanel insights={spec.insights} />

      {/* Visualizations Grid */}
      <section aria-label="Visualizations">
        <h2 className="section-title">
          <span>Multidimensional Visualizations</span>
          <span className="section-badge">{spec.charts.length} Views</span>
        </h2>

        <div className="charts-grid">
          {spec.charts.map(chart => (
            <EChartsChart key={chart.id} chart={chart} />
          ))}
        </div>
      </section>

      {/* Correlation Matrix */}
      {spec.correlationMatrix && (
        <section aria-label="Statistical Correlation">
          <CorrelationView correlationMatrix={spec.correlationMatrix} />
        </section>
      )}

      {/* Data Table */}
      {filteredTable && (
        <section aria-label="Detailed Records">
          <DataTable table={filteredTable} activeFilters={selectedFilters} />
        </section>
      )}
    </section>
  );
};
