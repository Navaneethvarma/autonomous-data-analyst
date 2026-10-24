import React from 'react';
import type { DatasetItem, DatasetProfile } from '../api.js';

interface DatasetsViewProps {
  datasets: DatasetItem[];
  selectedDatasetId: string;
  selectedProfile: DatasetProfile | null;
  uploadFilename: string;
  uploadText: string;
  uploading: boolean;
  onFilenameChange: (val: string) => void;
  onTextChange: (val: string) => void;
  onSelectDataset: (id: string) => void;
  onUploadSubmit: (e: React.FormEvent) => void;
}

export const DatasetsView: React.FC<DatasetsViewProps> = ({
  datasets,
  selectedDatasetId,
  selectedProfile,
  uploadFilename,
  uploadText,
  uploading,
  onFilenameChange,
  onTextChange,
  onSelectDataset,
  onUploadSubmit,
}) => {
  return (
    <section id="datasets-view">
      <h2 className="section-title">
        <span>Tenant Datasets & Schemas</span>
        <span className="section-badge">{datasets.length} Registered</span>
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
        {/* Upload Card */}
        <div className="kpi-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: '1.1rem' }}>Upload New Dataset</h3>
          <form onSubmit={onUploadSubmit}>
            <div className="form-group">
              <label className="form-label">Filename (.csv or .parquet)</label>
              <input
                className="form-input"
                value={uploadFilename}
                onChange={e => onFilenameChange(e.target.value)}
                placeholder="transactions.csv"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Paste CSV Content or Sample Data</label>
              <textarea
                className="form-input"
                rows={8}
                value={uploadText}
                onChange={e => onTextChange(e.target.value)}
                placeholder="product_category,revenue,units_sold&#10;Electronics,14200.50,45&#10;Apparel,8920.00,120&#10;Home Goods,5400.75,34"
                required
              />
            </div>

            <button className="btn-primary" type="submit" disabled={uploading}>
              {uploading ? 'Validating & Profiling...' : 'Upload & Profile Dataset'}
            </button>
          </form>
        </div>

        {/* Registered Datasets List */}
        <div className="kpi-card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: '1.1rem' }}>Available Datasets</h3>
          {datasets.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No datasets uploaded yet in this organization.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {datasets.map(d => (
                <div
                  key={d.id}
                  onClick={() => onSelectDataset(d.id)}
                  style={{
                    padding: 12,
                    background: d.id === selectedDatasetId ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-secondary)',
                    border: `1px solid ${d.id === selectedDatasetId ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{d.originalFilename}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {d.rowCount} rows • {d.columnCount} columns • {(d.fileSizeBytes / 1024).toFixed(1)} KB
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Profile Inspector */}
      {selectedProfile && (
        <div className="kpi-card" style={{ marginTop: 24, padding: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Schema & Column Profile</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Column Name</th>
                  <th>Inferred Type</th>
                  <th>Null Count</th>
                  <th>Distinct Values</th>
                  <th>Sample Values</th>
                </tr>
              </thead>
              <tbody>
                {selectedProfile.columns.map(col => (
                  <tr key={col.name}>
                    <td style={{ fontWeight: 600 }}>{col.name}</td>
                    <td><code>{col.inferredType}</code></td>
                    <td>{col.nullCount}</td>
                    <td>{col.distinctCount}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {col.sampleValues.slice(0, 3).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
