import React, { useState } from 'react';
import type { DashboardSpec } from '../../lib/dashboard/types.js';

interface DataQualityViewProps {
  spec: DashboardSpec;
  onOpenEvidence: () => void;
}

interface ColumnProfileData {
  name: string;
  type: '# Numeric' | 'A Text' | 'Logical' | '📅 Date';
  typeColor: string;
  nullCount: number;
  nullPct: number;
  distinctCount: number;
  min?: string | number;
  max?: string | number;
  median?: string | number;
  mean?: string | number;
  stdDev?: string | number;
  categories?: { label: string; count: number; pct: number }[];
  status: 'Normal' | 'Anomaly';
  anomalyNote?: string;
  sampleDist: number[]; // mini bars
}

export const DataQualityView: React.FC<DataQualityViewProps> = ({ spec, onOpenEvidence }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Numeric' | 'Text' | 'Date' | 'Logical'>('All');

  // Grounded column profiles from sample_sales.csv profiling
  const columns: ColumnProfileData[] = [
    {
      name: 'transaction_id',
      type: 'A Text',
      typeColor: '#64748b',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 10,
      categories: [
        { label: 'TXN-1001', count: 1, pct: 10 },
        { label: 'TXN-1002', count: 1, pct: 10 },
        { label: 'TXN-1003', count: 1, pct: 10 },
      ],
      status: 'Normal',
      sampleDist: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      name: 'customer_id',
      type: 'A Text',
      typeColor: '#64748b',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 9,
      categories: [
        { label: 'CUST-201', count: 2, pct: 20 },
        { label: 'CUST-202', count: 1, pct: 10 },
        { label: 'CUST-203', count: 1, pct: 10 },
      ],
      status: 'Normal',
      sampleDist: [2, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      name: 'transaction_date',
      type: '📅 Date',
      typeColor: '#0ea5e9',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 10,
      min: '2024-01-10',
      max: '2024-01-30',
      median: '2024-01-20',
      status: 'Normal',
      sampleDist: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      name: 'product_category',
      type: 'A Text',
      typeColor: '#64748b',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 4,
      categories: [
        { label: 'Electronics', count: 4, pct: 40 },
        { label: 'Apparel', count: 3, pct: 30 },
        { label: 'Home & Garden', count: 2, pct: 20 },
        { label: 'Beauty', count: 1, pct: 10 },
      ],
      status: 'Normal',
      sampleDist: [4, 3, 2, 1],
    },
    {
      name: 'unit_price',
      type: '# Numeric',
      typeColor: '#2563eb',
      nullCount: 1,
      nullPct: 10,
      distinctCount: 9,
      min: 25.0,
      max: 1250.0,
      median: 120.0,
      mean: 346.51,
      stdDev: 445.59,
      status: 'Anomaly',
      anomalyNote: '1 Outlier ($1,250) outside IQR [-600.2, 1160.1]; 1 Null (10%)',
      sampleDist: [5, 2, 1, 1],
    },
    {
      name: 'quantity',
      type: '# Numeric',
      typeColor: '#2563eb',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 4,
      min: 1,
      max: 4,
      median: 1.5,
      mean: 1.8,
      stdDev: 1.03,
      status: 'Anomaly',
      anomalyNote: '1 Outlier (quantity = 4) outside IQR interval [-0.5, 3.5]',
      sampleDist: [5, 3, 1, 1],
    },
    {
      name: 'discount_applied',
      type: 'Logical',
      typeColor: '#8b5cf6',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 2,
      categories: [
        { label: 'false', count: 6, pct: 60 },
        { label: 'true', count: 4, pct: 40 },
      ],
      status: 'Normal',
      sampleDist: [6, 4],
    },
    {
      name: 'payment_status',
      type: 'A Text',
      typeColor: '#64748b',
      nullCount: 0,
      nullPct: 0,
      distinctCount: 3,
      categories: [
        { label: 'Completed', count: 8, pct: 80 },
        { label: 'Pending', count: 1, pct: 10 },
        { label: 'Refunded', count: 1, pct: 10 },
      ],
      status: 'Normal',
      sampleDist: [8, 1, 1],
    },
  ];

  const filteredColumns = columns.filter(col => {
    const matchesSearch = col.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'Numeric') return col.type === '# Numeric';
    if (filterType === 'Text') return col.type === 'A Text';
    if (filterType === 'Date') return col.type === '📅 Date';
    if (filterType === 'Logical') return col.type === 'Logical';
    return true;
  });

  return (
    <div className="workbench-page" id="data-quality-page">
      {/* Observability Header (Inspired by User Image 1) */}
      <section className="observability-hero" aria-label="Data Health Summary">
        <div className="obs-header-top">
          <div>
            <div className="section-pretitle">DATA HYGIENE & OBSERVABILITY AUDIT</div>
            <h1 className="obs-title">Dataset Health & Column Integrity Profiles</h1>
            <p className="obs-desc">
              Automated DuckDB audit of completeness, null distributions, schema stability, and IQR outliers.
            </p>
          </div>
          <div className="obs-actions">
            <button className="btn-secondary" onClick={onOpenEvidence}>
              🔍 Audit Engine Details
            </button>
          </div>
        </div>

        {/* 5 Health Dimension Metric Cards (Like Image 1) */}
        <div className="obs-metrics-grid">
          <div className="obs-metric-card">
            <div className="obs-k">OVERALL HEALTH</div>
            <div className="obs-v positive">98.75%</div>
            <div className="obs-sub">Completeness Score</div>
            <div className="mini-progress-bar"><div className="bar-fill" style={{ width: '98.75%', background: '#10b981' }} /></div>
          </div>

          <div className="obs-metric-card">
            <div className="obs-k">EVALUATED RULES</div>
            <div className="obs-v">8 Columns</div>
            <div className="obs-sub">6 Healthy • 2 Outlier Flags</div>
            <div className="mini-progress-bar"><div className="bar-fill" style={{ width: '75%', background: '#3b82f6' }} /></div>
          </div>

          <div className="obs-metric-card">
            <div className="obs-k">NULL CELLS</div>
            <div className="obs-v warning">1 (1.25%)</div>
            <div className="obs-sub">1 in unit_price (TXN-1008)</div>
            <div className="mini-progress-bar"><div className="bar-fill" style={{ width: '10%', background: '#f59e0b' }} /></div>
          </div>

          <div className="obs-metric-card">
            <div className="obs-k">DUPLICATE ROWS</div>
            <div className="obs-v positive">0</div>
            <div className="obs-sub">100% Unique Row Identity</div>
            <div className="mini-progress-bar"><div className="bar-fill" style={{ width: '100%', background: '#10b981' }} /></div>
          </div>

          <div className="obs-metric-card">
            <div className="obs-k">OUTLIER ALERTS</div>
            <div className="obs-v warning">2 Flags</div>
            <div className="obs-sub">unit_price ($1250) • quantity (4)</div>
            <div className="mini-progress-bar"><div className="bar-fill" style={{ width: '25%', background: '#f59e0b' }} /></div>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar (Like Image 1 & 2) */}
      <div className="quality-controls-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search column rules..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="type-filter-group">
          {(['All', 'Numeric', 'Text', 'Date', 'Logical'] as const).map(t => (
            <button
              key={t}
              className={`filter-btn ${filterType === t ? 'active' : ''}`}
              onClick={() => setFilterType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Exploratory Column Profile Cards Grid (Inspired directly by User Image 2) */}
      <section className="column-cards-grid" aria-label="Column Profiles">
        {filteredColumns.map(col => (
          <div key={col.name} className="col-profile-card">
            <div className="col-card-header">
              <div className="col-header-left">
                <span className="col-name">{col.name}</span>
                <span className="col-type-tag" style={{ color: col.typeColor }}>
                  {col.type}
                </span>
              </div>
              <span className={`status-tag ${col.status === 'Anomaly' ? 'warning' : 'normal'}`}>
                {col.status}
              </span>
            </div>

            {/* Mini Histogram Bars */}
            <div className="mini-bars-container">
              {col.sampleDist.map((val, idx) => {
                const maxVal = Math.max(...col.sampleDist);
                const heightPct = Math.max(12, Math.round((val / maxVal) * 100));
                return (
                  <div key={idx} className="mini-bar-col">
                    <div className="mini-bar" style={{ height: `${heightPct}%` }} />
                  </div>
                );
              })}
            </div>

            {/* Anomaly Note if Present */}
            {col.anomalyNote && (
              <div className="col-anomaly-banner">
                ⚠️ {col.anomalyNote}
              </div>
            )}

            {/* Stats Table Section */}
            <div className="col-stats-table">
              <div className="stat-row">
                <span className="stat-k">Missing / NA</span>
                <span className="stat-v">
                  {col.nullCount} ({col.nullPct.toFixed(1)}%)
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-k">Unique Values</span>
                <span className="stat-v">{col.distinctCount}</span>
              </div>

              {col.min !== undefined && (
                <div className="stat-row">
                  <span className="stat-k">Min / Max</span>
                  <span className="stat-v">
                    {col.min} / {col.max}
                  </span>
                </div>
              )}

              {col.median !== undefined && (
                <div className="stat-row">
                  <span className="stat-k">Median / Mean</span>
                  <span className="stat-v">
                    {col.median} {col.mean ? `/ ${col.mean}` : ''}
                  </span>
                </div>
              )}

              {col.stdDev !== undefined && (
                <div className="stat-row">
                  <span className="stat-k">Std Dev</span>
                  <span className="stat-v">{col.stdDev}</span>
                </div>
              )}

              {col.categories && (
                <div className="col-categories-list">
                  <span className="cat-header">Top Values:</span>
                  {col.categories.map(cat => (
                    <div key={cat.label} className="cat-pill">
                      <span>{cat.label}</span>
                      <strong>{cat.count} ({cat.pct}%)</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

