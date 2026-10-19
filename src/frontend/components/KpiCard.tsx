import React from 'react';
import type { KpiCardSpec } from '../../lib/dashboard/types.js';

interface KpiCardProps {
  kpi: KpiCardSpec;
}

export const KpiCard: React.FC<KpiCardProps> = ({ kpi }) => {
  const trendIcon = kpi.trendDirection === 'up' ? '↑' : kpi.trendDirection === 'down' ? '↓' : '→';

  return (
    <div className="kpi-card" id={`kpi-${kpi.id}`}>
      <div className="kpi-header">
        <span className="kpi-label">{kpi.label}</span>
        {kpi.change !== undefined && (
          <span className={`kpi-trend ${kpi.trendDirection}`}>
            {trendIcon} {Math.abs(kpi.change)}% {kpi.changePeriod ? `(${kpi.changePeriod})` : ''}
          </span>
        )}
      </div>

      <div className="kpi-value-row">
        {kpi.unit && kpi.unit.startsWith('$') && <span className="kpi-unit">$</span>}
        <span className="kpi-value">{kpi.formattedValue}</span>
        {kpi.unit && !kpi.unit.startsWith('$') && <span className="kpi-unit">{kpi.unit}</span>}
      </div>

      <div className="kpi-definition">{kpi.definition}</div>

      <div className="kpi-evidence-tag" title={kpi.evidenceRef}>
        🔍 {kpi.evidenceRef}
      </div>
    </div>
  );
};
