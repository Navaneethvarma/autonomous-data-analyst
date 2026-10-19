import React from 'react';
import type { CorrelationMatrixSpec } from '../../lib/dashboard/types.js';

interface CorrelationViewProps {
  correlationMatrix?: CorrelationMatrixSpec;
}

export const CorrelationView: React.FC<CorrelationViewProps> = ({ correlationMatrix }) => {
  if (!correlationMatrix || correlationMatrix.matrix.length === 0) return null;

  return (
    <section className="correlation-section" id="dashboard-correlation-section">
      <h2 className="section-title">
        <span>{correlationMatrix.title}</span>
        <span className="section-badge">{correlationMatrix.matrix.length} Pairs Evaluated</span>
      </h2>

      <div className="causation-alert">
        <strong>METHODOLOGICAL CAUTION:</strong> {correlationMatrix.causationWarning}
      </div>

      <div className="table-wrapper">
        <table className="corr-table">
          <thead>
            <tr>
              <th>Variable A</th>
              <th>Variable B</th>
              <th>Pearson Coefficient (r)</th>
              <th>Association Strength</th>
              <th>Sample Size (n)</th>
            </tr>
          </thead>
          <tbody>
            {correlationMatrix.matrix.map((entry, idx) => (
              <tr key={idx}>
                <td><strong>{entry.columnA}</strong></td>
                <td><strong>{entry.columnB}</strong></td>
                <td>
                  <span className={`corr-badge ${entry.coefficient >= 0 ? 'positive' : 'negative'}`}>
                    {entry.coefficient >= 0 ? '+' : ''}{entry.coefficient.toFixed(3)}
                  </span>
                </td>
                <td>{entry.strength.replace(/_/g, ' ').toUpperCase()}</td>
                <td>{entry.sampleSize} records</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
